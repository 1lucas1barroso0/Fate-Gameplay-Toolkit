import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createCharacter } from '../lib/fate.ts';
import { PREFIX, mergeWorkspaces } from '../lib/workspace-data.ts';
import { captureWorkspace, selectWorkspace, workspaceBase, workspaceStorage, forgetAccountCache, reloadAccountCache } from '../lib/workspace-storage.ts';
import { saveSheetImageBlob, getSheetImageRecord, listSheetImageRecords, resetSheetImageDatabaseConnection, deleteAccountImageDatabase } from '../lib/sheet-image-store.ts';
import { synchronizeWorkspace, WorkspaceConflict } from '../lib/workspace-sync.ts';
import { rememberSignOut, finishPendingSignOut, hasPendingSignOut } from '../lib/account-session.ts';
class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
globalThis.localStorage = new MemoryStorage(); globalThis.sessionStorage = new MemoryStorage(); globalThis.window = new EventTarget();
const sheetKey = PREFIX + 'characters.v1';
const payload = sheets => JSON.stringify({ version: 1, activeId: sheets[0].id, characters: sheets });

test('three-way merge combines independent edits and requires a decision for edit/delete conflicts', () => {
  const sheet = createCharacter('Original'), other = createCharacter('Outra');
  const base = { [sheetKey]: payload([sheet, other]) };
  const local = { [sheetKey]: payload([{ ...sheet, name: 'Nome novo' }, other]) };
  const remote = { [sheetKey]: payload([{ ...sheet, description: 'Descrição nova' }, other]) };
  const merged = mergeWorkspaces(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(JSON.parse(merged.data[sheetKey]).characters[0].name, 'Nome novo');
  assert.equal(JSON.parse(merged.data[sheetKey]).characters[0].description, 'Descrição nova');
  const deleted = { [sheetKey]: payload([other]) };
  assert.ok(mergeWorkspaces(base, local, deleted).conflicts.length);
  assert.equal(JSON.parse(mergeWorkspaces(base, local, deleted, 'remote').data[sheetKey]).characters.length, 1);
  assert.equal(JSON.parse(mergeWorkspaces(base, local, deleted, 'local').data[sheetKey]).characters.length, 2);
});

test('guest, account A and account B have separate data and image stores; logout keeps them and deletion clears only its owner', async () => {
  const key = PREFIX + 'language.v1';
  selectWorkspace(null); workspaceStorage.setItem(key, 'pt');
  const framing = { positionX: 50, positionY: 50, zoom: 1, alt: '' };
  const image = await saveSheetImageBlob(new Blob(['guest image'], { type: 'image/png' }), framing);
  selectWorkspace('a', { revision: 0, data: {} });
  assert.equal(workspaceStorage.getItem(key), null); assert.equal(await getSheetImageRecord(image.blobId), undefined);
  workspaceStorage.setItem(key, 'en'); await saveSheetImageBlob(new Blob(['guest image'], { type: 'image/png' }), framing);
  selectWorkspace('b', { revision: 0, data: {} }); assert.equal(workspaceStorage.getItem(key), null); assert.equal(await getSheetImageRecord(image.blobId), undefined);
  selectWorkspace(null); assert.equal(workspaceStorage.getItem(key), 'pt'); assert.ok(await getSheetImageRecord(image.blobId));
  selectWorkspace('a'); assert.equal(workspaceStorage.getItem(key), 'en'); assert.ok(await getSheetImageRecord(image.blobId));
  selectWorkspace(null); forgetAccountCache('a'); await deleteAccountImageDatabase('a');
  selectWorkspace('a', { revision: 0, data: {} }); assert.equal(workspaceStorage.getItem(key), null); assert.equal(await getSheetImageRecord(image.blobId), undefined);
  selectWorkspace(null); assert.ok(await getSheetImageRecord(image.blobId)); await resetSheetImageDatabaseConnection();
});

test('another tab cannot silently overwrite a pending change and independent tab edits combine', () => {
  selectWorkspace('tabs', { revision: 0, data: {} });
  workspaceStorage.setItem(PREFIX + 'language.v1', 'pt');
  const cacheKey = PREFIX + 'account-cache.tabs', previous = JSON.parse(localStorage.getItem(cacheKey));
  localStorage.setItem(cacheKey, JSON.stringify({ ...previous, data: { ...previous.data, [PREFIX + 'sheet-mode']: 'edit' } }));
  workspaceStorage.setItem(PREFIX + 'workspace', 'regras');
  assert.equal(captureWorkspace()[PREFIX + 'sheet-mode'], 'edit');
  assert.equal(captureWorkspace()[PREFIX + 'workspace'], 'regras');
  const current = JSON.parse(localStorage.getItem(cacheKey));
  localStorage.setItem(cacheKey, JSON.stringify({ ...current, data: { ...current.data, [PREFIX + 'workspace']: 'dados' } }));
  assert.throws(() => workspaceStorage.setItem(PREFIX + 'workspace', 'salas'), /tab_conflict/);
  reloadAccountCache({ key: cacheKey, newValue: localStorage.getItem(cacheKey) });
  assert.equal(captureWorkspace()[PREFIX + 'workspace'], 'dados'); selectWorkspace(null);
});

test('sync preserves in-flight edits, applies independent remote changes and keeps offline changes for retry', async context => {
  let server = { revision: 0, data: {} }, changeDuringWrite = true, offline = false;
  selectWorkspace('sync', server);
  workspaceStorage.setItem(PREFIX + 'language.v1', 'en');
  context.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    if (offline) throw Error('offline');
    assert.equal(options.headers['x-fate-account'], 'sync');
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); assert.equal(body.revision, server.revision);
      server = { revision: server.revision + 1, data: body.data };
      if (changeDuringWrite) { changeDuringWrite = false; workspaceStorage.setItem(PREFIX + 'workspace', 'regras'); }
      return Response.json(server);
    }
    return Number(new URL(url, 'https://test').searchParams.get('revision')) === server.revision ? new Response(null, { status: 204 }) : Response.json(server);
  });
  assert.equal(await synchronizeWorkspace('sync'), false);
  assert.equal(captureWorkspace()[PREFIX + 'workspace'], 'regras'); assert.equal(workspaceBase().revision, 1);
  server = { revision: 2, data: { ...server.data, [PREFIX + 'sheet-mode']: 'edit' } };
  assert.equal(await synchronizeWorkspace('sync'), true);
  assert.equal(server.data[PREFIX + 'workspace'], 'regras'); assert.equal(captureWorkspace()[PREFIX + 'sheet-mode'], 'edit');
  offline = true; workspaceStorage.setItem(PREFIX + 'language.v1', 'pt');
  await assert.rejects(synchronizeWorkspace('sync'), /offline/); assert.equal(captureWorkspace()[PREFIX + 'language.v1'], 'pt');
  offline = false; server = { revision: server.revision + 1, data: { ...server.data, [PREFIX + 'language.v1']: 'fr' } };
  await assert.rejects(synchronizeWorkspace('sync'), WorkspaceConflict); assert.equal(captureWorkspace()[PREFIX + 'language.v1'], 'pt');
  selectWorkspace(null);
});

test('refreshing a tab never rewrites a snapshot over an edit saved during its read', context => {
  selectWorkspace('refresh-race', { revision: 0, data: {} });
  const cacheKey = PREFIX + 'account-cache.refresh-race';
  const before = JSON.parse(localStorage.getItem(cacheKey));
  const received = JSON.stringify({ ...before, data: { [PREFIX + 'language.v1']: 'pt' } });
  const newer = JSON.stringify({ ...before, data: { [PREFIX + 'language.v1']: 'en' } });
  localStorage.setItem(cacheKey, received);
  const getItem = localStorage.getItem.bind(localStorage);
  let interleave = true;
  context.mock.method(localStorage, 'getItem', key => {
    const value = getItem(key);
    if (key === cacheKey && interleave) { interleave = false; localStorage.setItem(cacheKey, newer); }
    return value;
  });
  reloadAccountCache({ key: cacheKey, newValue: received });
  assert.equal(localStorage.getItem(cacheKey), newer);
  reloadAccountCache({ key: cacheKey, newValue: newer });
  assert.equal(captureWorkspace()[PREFIX + 'language.v1'], 'en');
  selectWorkspace(null);
});

test('a delayed sync cannot write into a reopened session of the same account', async context => {
  selectWorkspace('reopened', { revision: 0, data: {} });
  let finish;
  context.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{finish=resolve;}));
  const syncing=synchronizeWorkspace('reopened');
  selectWorkspace(null); selectWorkspace('reopened');
  workspaceStorage.setItem(PREFIX+'language.v1','en');
  finish(Response.json({ revision: 1,data:{ [PREFIX+'language.v1']:'pt' } }));
  await assert.rejects(syncing,/account_changed/);
  assert.equal(captureWorkspace()[PREFIX+'language.v1'],'en');
  assert.equal(workspaceBase().revision,0); selectWorkspace(null);
});

test('an image in flight cannot leak into the next workspace', async () => {
  selectWorkspace('image-old',{revision:0,data:{}});
  await assert.rejects(saveSheetImageBlob(new Blob(['delayed image'],{type:'image/png'}),{positionX:50,positionY:50,zoom:1,alt:''},{
    estimate:async()=>{ selectWorkspace('image-new',{revision:0,data:{}}); return {usage:0,quota:1000000000}; },
  }),/account_changed/);
  assert.deepEqual(await listSheetImageRecords(),[]); selectWorkspace(null);
});

test('offline sign-out stays pending across reloads, preserves edits and retries for the original account only', async context => {
  selectWorkspace('offline-exit',{revision:0,data:{}});
  workspaceStorage.setItem(PREFIX+'language.v1','en');
  rememberSignOut('offline-exit'); selectWorkspace(null);
  let offline=true;
  context.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(url,'/api/auth/sign-out'); assert.equal(options.headers['x-fate-account'],'offline-exit');
    if(offline) throw Error('offline');
    return Response.json({code:'account_changed'},{status:409});
  });
  await assert.rejects(finishPendingSignOut(),/offline/); assert.equal(hasPendingSignOut(),true);
  selectWorkspace('offline-exit'); assert.equal(captureWorkspace()[PREFIX+'language.v1'],'en'); selectWorkspace(null);
  offline=false; await finishPendingSignOut(); assert.equal(hasPendingSignOut(),false);
});
