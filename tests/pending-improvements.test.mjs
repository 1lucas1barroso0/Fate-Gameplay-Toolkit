import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { limitRoomRequest, limitIdentity, RequestLimitError, requestLimitResponse } from '../lib/server/request-limits.ts';
import { sceneSchema, sceneUpdateSchema, emptyScene } from '../lib/scene.ts';
import { createCharacter } from '../lib/fate.ts';
import { compareBackup, backupDue, backupSchema } from '../lib/backup-tools.ts';
import { readerCatalog, loadChapter, loadSearch } from '../lib/reader-library.ts';
import { recordDiagnostic, readDiagnostics, setDiagnosticsEnabled } from '../lib/local-diagnostics.ts';
import { createDefaultTableConfig } from '../lib/table-config.ts';
import { sheetConsequences, withConsequenceValue, consequenceValue } from '../lib/sheet-data.ts';

test('shared SQL limiter admits normal play, throttles bursts, expires and never stores raw identities', async context => {
  const db = new PGlite();
  let now = 1800000000000;
  context.mock.method(Date, 'now', () => now);
  const execute = async (client, q) => q.text.includes('pg_advisory_xact_lock') ? [] : (await client.query(q.text, q.values)).rows;
  const sql = (parts, ...values) => {
    const query = { text: parts.reduce((result, part, i) => result + (i ? '$' + i : '') + part, ''), values };
    return { ...query, then: (resolve, reject) => execute(db, query).then(resolve, reject), catch: reject => execute(db, query).catch(reject) };
  };
  sql.transaction = queries => db.transaction(async client => { const result = []; for (const query of queries) result.push(await execute(client, query)); return result; });
  const request = new Request('https://local.test/api/rooms');
  try {
    for (let i = 0; i < 6; i++) await limitRoomRequest(request, 'create', 'private-token', sql);
    await assert.rejects(limitRoomRequest(request, 'create', 'private-token', sql), error => {
      assert.ok(error instanceof RequestLimitError); assert.ok(error.retryAfter >= 3600); assert.equal(requestLimitResponse(error).status, 429); return true;
    });
    const rows = (await db.query('SELECT * FROM fate_request_limits')).rows;
    assert.equal(rows.length, 2); assert.ok(rows.every(row => /^[a-f0-9]{64}$/.test(row.key)));
    assert.ok(!JSON.stringify(rows).includes('private-token'));
    now += 3601000; await limitRoomRequest(request, 'create', 'private-token', sql);
    // Session rotation cannot evade the shared IP limit.
    for (let i = 0; i < 11; i++) await limitRoomRequest(request, 'create', 'rotating-' + i, sql);
    await assert.rejects(limitRoomRequest(request, 'create', 'another-token', sql), RequestLimitError);
    now += 86400000; await limitRoomRequest(request, 'create', 'fresh', sql);
    assert.equal(Number((await db.query('SELECT count(*) FROM fate_request_limits')).rows[0].count), 2);
    assert.notEqual(limitIdentity('same', now), limitIdentity('same', now + 86400000));
  } finally { await db.close(); }
});
test('scenes have bounded fields, explicit revisions and no automatic sheet mutation', () => {
  const scene = emptyScene(); assert.ok(sceneSchema.safeParse(scene).success);
  assert.equal(sceneSchema.safeParse({ ...scene, aspects: Array(13).fill('x') }).success, false);
  assert.equal(sceneSchema.safeParse({ ...scene, objectives: [{ id: 'a', name: 'Goal', filled: 5, segments: 4 }] }).success, false);
  assert.equal(sceneUpdateSchema.safeParse({ scene, revision: -1 }).success, false);
  assert.ok(sceneUpdateSchema.safeParse({ scene: null, revision: 2 }).success);
});
test('backup comparison is non-mutating and distinguishes identical, changed and new sheets', () => {
  const original = createCharacter('Original'), changed = structuredClone(original), fresh = createCharacter('New');
  changed.aspects.highConcept = 'Changed';
  const before = JSON.stringify(original);
  assert.deepEqual(compareBackup([original, changed, fresh], [original]).map(row => row.status), ['same','copy','new']);
  assert.equal(JSON.stringify(original), before);
  assert.equal(backupDue({ days: 0, lastExportAt: 0, snoozedUntil: 0 }), false);
  assert.equal(backupDue({ days: 7, lastExportAt: 0, snoozedUntil: 0 }, 8 * 86400000), true);
  assert.equal(backupSchema.safeParse({ format: 'unknown' }).success, false);
});
test('all individual chapter assets preserve both languages exactly', async () => {
  const rules = JSON.parse(await readFile('content/rules.json', 'utf8'));
  const expansions = JSON.parse(await readFile('content/expansions.json', 'utf8'));
  const sources = [{ id: 'fate-condensed', chapters: rules }, ...expansions.sources];
  let count = 0;
  for (const source of readerCatalog.sources) for (const chapter of source.chapters) for (const language of ['pt','en']) {
    const value = JSON.parse(await readFile('public' + chapter.files[language], 'utf8'));
    assert.equal(value.html, sources.find(s => s.id === source.id).chapters.find(c => c.id === chapter.id).html[language]); count++;
  }
  assert.equal(count, 450);
});
test('chapter loading deduplicates and search is scoped', async context => {
  const source = readerCatalog.sources[0], chapter = source.chapters[0]; let calls = 0;
  context.mock.method(globalThis, 'fetch', async url => { calls++; return Response.json(JSON.parse(await readFile('public' + url, 'utf8'))); });
  const pending = loadChapter(source, chapter, 'en'); assert.equal(pending, loadChapter(source, chapter, 'en'));
  const value = await pending; assert.equal(value.chapterId, chapter.id); assert.equal(calls, 1);
  const docs = await loadSearch('en', source); assert.ok(docs.every(doc => doc.sourceId === source.id));
});
test('physical and mental extra consequences have independent stable slots; general slots stay untyped', () => {
  const config = createDefaultTableConfig(), character = createCharacter('Test');
  assert.equal(sheetConsequences(character, config).length, 3);
  character.skills.physique = 5; character.skills.will = 5;
  const slots = sheetConsequences(character, config);
  assert.equal(slots.length, 5);
  assert.deepEqual(slots.slice(3).map(s => s.track), ['physical', 'mental']);
  assert.ok(slots.slice(0,3).every(s => !s.track || s.track === 'general'));
  const filled = withConsequenceValue(character, slots[3].id, 'Injury');
  filled.skills.physique = 0;
  assert.equal(consequenceValue(filled, slots[3].id), 'Injury');
  assert.ok(sheetConsequences(filled, config).some(s => s.id === slots[3].id && s.track === 'physical'));
  assert.equal(consequenceValue(filled, slots[4].id), '');
  filled.session.consequences.extraMild = 'Earlier untyped text';
  assert.ok(sheetConsequences(filled, config).some(s => s.legacy && consequenceValue(filled, s.id) === 'Earlier untyped text'));
});
test('diagnostics stay opt-in, bounded, content-free and can be erased', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) } });
  try {
    recordDiagnostic('reader','ok',100); assert.equal(readDiagnostics().length,0);
    setDiagnosticsEnabled(true); for (let i=0;i<110;i++) recordDiagnostic('sync','ok',50,200);
    assert.equal(readDiagnostics().length,100);
    assert.deepEqual(Object.keys(readDiagnostics()[0]).sort(),['area','at','durationMs','result','status']);
    setDiagnosticsEnabled(false); assert.equal(readDiagnostics().length,0);
  } finally { if(previous) Object.defineProperty(globalThis,'localStorage',previous); else delete globalThis.localStorage; }
});
