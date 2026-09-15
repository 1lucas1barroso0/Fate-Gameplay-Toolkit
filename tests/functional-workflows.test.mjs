import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readerCatalog, loadBook, readingFromHash, readingHash, searchChapters } from '../lib/reader-library.ts';
import { EMPTY_READING, parseReading, mergeReading, toggleBookmark, rememberReading } from '../lib/reading-state.ts';
import { readerSections } from '../lib/reader-sections.ts';
import { createRoomSync } from '../lib/room-sync.ts';
import { readRoomDraft, saveRoomDraft } from '../lib/room-draft.ts';
import { matchesSheet } from '../lib/sheet-search.ts';
import { validRollHistory, outcome, outcomeChances } from '../lib/roll-tools.ts';
import { createCharacter, stripHtml } from '../lib/fate.ts';
import { roomEntrySchema } from '../lib/room-contracts.ts';
const read = async name => JSON.parse(await readFile(new URL('../' + name, import.meta.url), 'utf8'));
const asset = async url => read('public' + url);
const location = { sourceId: readerCatalog.sources[0].id, chapterId: readerCatalog.sources[0].chapters[0].id, language: 'pt' };

test('all 450 language chapters remain byte-for-byte intact in immutable book assets', async () => {
  const condensed = await read('content/rules.json'), expansions = await read('content/expansions.json');
  const originals = [{ id: 'fate-condensed', chapters: condensed }, ...expansions.sources];
  assert.equal(readerCatalog.sources.length, 18);
  let count = 0;
  for (const source of readerCatalog.sources) for (const language of ['pt', 'en']) {
    const url = source.files[language], raw = await readFile(new URL('../public' + url, import.meta.url));
    assert.ok(url.includes(createHash('sha256').update(raw).digest('hex').slice(0, 20)));
    const book = JSON.parse(raw); assert.equal(book.sourceId, source.id); assert.equal(book.language, language);
    const original = originals.find(item => item.id === source.id);
    for (const chapter of original.chapters) { assert.equal(book.chapters[chapter.id], chapter.html[language]); count++; }
    assert.equal(Object.keys(book.chapters).length, original.chapters.length);
  }
  assert.equal(count, 450);
});
test('search uses the selected language, multiple words and canonical terminology aliases', async () => {
  for (const language of ['pt', 'en']) {
    const documents = await asset(readerCatalog.search[language]); assert.equal(documents.length, 225);
    for (const doc of documents) assert.equal(doc.title, readerCatalog.sources.find(s => s.id === doc.sourceId).chapters.find(c => c.id === doc.chapterId).title[language]);
  }
  const pt = await asset(readerCatalog.search.pt);
  assert.ok(searchChapters(pt, 'fisico estresse', 'pt').some(hit => /Estresse físico/i.test(hit.text)));
  assert.ok(searchChapters(pt, 'stress', 'pt').some(hit => /estresse/i.test(hit.snippet)));
  assert.deepEqual(searchChapters(pt, 'zzzzinexistentezzzz', 'pt'), []);
});
test('all library references and legacy room links remain valid', () => {
  for (const source of readerCatalog.sources) for (const chapter of source.chapters) for (const language of ['pt', 'en']) {
    const value = { sourceId: source.id, chapterId: chapter.id, language };
    assert.deepEqual(readingFromHash(readingHash(value)), value);
    assert.ok(roomEntrySchema.safeParse({ type: 'rule', requestId: 'fd9d4dfa-c45a-41ee-ad17-8ad1f1da454d', title: 'Regra', reference: `rules:${source.id}:${chapter.id}:${language}` }).success);
  }
  assert.ok(roomEntrySchema.safeParse({ type: 'rule', requestId: 'fd9d4dfa-c45a-41ee-ad17-8ad1f1da454d', title: 'Regra', reference: 'rules:cenas:pt' }).success);
  assert.equal(readingFromHash('#rules/not-a-book/not-a-chapter/en'), null);
  assert.equal(readingFromHash('#rules/%/bad/pt'), null);
});
test('reading export round trips and imports merge bookmarks without losing local positions', () => {
  const en = { ...location, language: 'en' };
  const local = toggleBookmark(rememberReading(EMPTY_READING, location), location);
  local.positions['fate-condensed:introducao:pt'] = { anchor: 'section', offset: 20, progress: .25 };
  const restored = parseReading(JSON.parse(JSON.stringify(local))); assert.deepEqual(restored, local);
  const incoming = toggleBookmark(EMPTY_READING, en);
  const merged = mergeReading(local, incoming); assert.equal(merged.bookmarks.length, 2); assert.deepEqual(merged.positions, local.positions);
  assert.throws(() => parseReading({ version: 20 }));
});
test('section anchors are unique and preserve readable text', () => {
  const html = '<h2 id="reader-block-1">Começo</h2><p>Texto <b>inteiro</b>.</p><h3>Detalhe</h3><p>Fim.</p>';
  const result = readerSections(html);
  const ids = [...result.html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length); assert.equal(stripHtml(result.html), stripHtml(html)); assert.equal(result.sections.length, 2);
});
test('book loading deduplicates in-flight requests, rejects the wrong language and permits retry', async () => {
  const source = readerCatalog.sources[0], original = globalThis.fetch; let calls = 0;
  const book = await asset(source.files.en); let wrong = true;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => wrong ? { ...book, language: 'pt' } : book }; };
  try {
    const first = loadBook(source, 'en'); assert.equal(first, loadBook(source, 'en'));
    await assert.rejects(first); wrong = false; assert.deepEqual(await loadBook(source, 'en'), book); assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
function clock() {
  let online = true, visible = true, id = 0; const tasks = new Map();
  return { tasks, setOnline: value => { online = value; }, setVisible: value => { visible = value; }, environment: { online: () => online, visible: () => visible, later: (fn, ms) => { const key = ++id; tasks.set(key, { fn, ms }); return key; }, cancel: key => tasks.delete(key) } };
}
test('room polling pauses offline or hidden, deduplicates and ignores stopped responses', async () => {
  const timer = clock(); let calls = 0, delivered = 0, finish; const states = [];
  const sync = createRoomSync({ fetch: () => { calls++; return new Promise(resolve => { finish = resolve; }); }, receive: () => delivered++, status: value => states.push(value), error: () => {} }, timer.environment);
  timer.setOnline(false); await sync.refresh(); assert.equal(calls, 0); assert.equal(states.at(-1), 'offline');
  timer.setOnline(true); timer.setVisible(false); await sync.refresh(); assert.equal(calls, 0); assert.equal(states.at(-1), 'paused');
  timer.setVisible(true); const pending = sync.refresh(); assert.equal(pending, sync.refresh()); await Promise.resolve(); assert.equal(calls, 1);
  sync.stop(); finish({}); await pending; assert.equal(delivered, 0); assert.equal(timer.tasks.size, 0);
});
test('room retries back off, successful refresh resets delay and history remains stationary', async () => {
  const timer = clock(); let fail = true;
  const sync = createRoomSync({ fetch: async () => { if (fail) throw Error('offline'); return {}; }, receive: () => {}, status: () => {}, error: () => {} }, timer.environment);
  await sync.refresh(); assert.deepEqual([...timer.tasks.values()].map(t => t.ms), [8000]);
  await sync.refresh(); assert.deepEqual([...timer.tasks.values()].map(t => t.ms), [16000]);
  fail = false; await sync.refresh(); assert.deepEqual([...timer.tasks.values()].map(t => t.ms), [4000]); sync.stop();
  const history = createRoomSync({ fetch: async () => ({}), receive: () => {}, status: () => {}, error: () => {}, history: true }, timer.environment);
  await history.refresh(); assert.equal(timer.tasks.size, 0); history.stop();
});
test('drafts are isolated by participant and clearing one preserves every other draft', () => {
  const items = new Map(); const storage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  saveRoomDraft(storage, 'one', 'Primeira Mesa'); saveRoomDraft(storage, 'two', 'Outra Mesa');
  assert.equal(readRoomDraft(storage, 'one'), 'Primeira Mesa'); assert.equal(readRoomDraft(storage, 'two'), 'Outra Mesa');
  saveRoomDraft(storage, 'one', ''); assert.equal(readRoomDraft(storage, 'one'), ''); assert.equal(readRoomDraft(storage, 'two'), 'Outra Mesa');
});
test('sheet search matches names, aspects and linked rooms without accent sensitivity', () => {
  const sheet = createCharacter('Marina'); sheet.aspects.highConcept = 'Capitã das marés';
  assert.ok(matchesSheet(sheet, 'capita mares', 'Porto Azul', 'Fate Condensado'));
  assert.ok(matchesSheet(sheet, 'marina porto', 'Porto Azul'));
  assert.equal(matchesSheet(sheet, 'astronauta', 'Porto Azul'), false);
});
test('roll comparisons account for all 81 outcomes and malformed history is excluded', () => {
  for (let bonus = -5; bonus <= 5; bonus++) for (let difficulty = -5; difficulty <= 5; difficulty++) {
    const expected = { failure: 0, tie: 0, success: 0, style: 0 };
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) for (const d of [-1, 0, 1]) expected[outcome(a + b + c + d + bonus, difficulty)]++;
    assert.deepEqual(outcomeChances(bonus, difficulty), expected); assert.equal(Object.values(expected).reduce((a, b) => a + b, 0), 81);
  }
  const roll = { id: 'roll_test', dice: [0, 1, -1, 1], modifier: 3, total: 4, label: 'Teste', source: 'local', createdAt: 1 };
  assert.deepEqual(validRollHistory([roll, roll, { ...roll, id: 'bad', dice: [5, 0, 0, 0] }, { ...roll, id: 'bad-time', createdAt: -1 }, null]), [roll]);
});
test('default room scheduler calls browser timers without an illegal receiver', async () => {
  const original = { navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), document: Object.getOwnPropertyDescriptor(globalThis, 'document'), later: globalThis.setTimeout, cancel: globalThis.clearTimeout };
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible' } });
    globalThis.setTimeout = function (...args) { assert.ok(this === undefined || this === globalThis); return original.later(...args); };
    globalThis.clearTimeout = function (...args) { assert.ok(this === undefined || this === globalThis); return original.cancel(...args); };
    let received = 0;
    const sync = createRoomSync({ fetch: async () => ({}), receive: () => received++, status: () => {}, error: error => { throw error; }, history: true });
    await sync.refresh(); assert.equal(received, 1); sync.stop();
  } finally {
    globalThis.setTimeout = original.later; globalThis.clearTimeout = original.cancel;
    for (const name of ['navigator', 'document']) if (original[name]) Object.defineProperty(globalThis, name, original[name]); else delete globalThis[name];
  }
});
