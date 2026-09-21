import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import { MAX_ROOM_FILE_BYTES, ROOM_FILE_BUDGET_BYTES } from '../../lib/storage-policy.ts';

// Only the external file service is replaced. Reservations, quotas, accounts
// and publication run through the production code and a real Postgres engine.
const uploaded = new Map();
mock.module('@vercel/blob', { namedExports: {
  head: async pathname => { assert.ok(uploaded.has(pathname)); return uploaded.get(pathname); },
  list: async () => ({ blobs: [], hasMore: false }),
  del: async () => {},
  get: async () => { throw Error('Unexpected file download'); },
} });
const { database, call, cookies, origin } = await import('./account-harness.mjs');
const { createRoom, authorizeRoomFileUpload, completeRoomFileUpload, readRoomFileUploadResult } = await import('../../lib/server/rooms.ts');

try {
  const signup = await call('/api/auth/sign-up/email', { method: 'POST', body: {
    email: 'upload@example.test', password: 'Room image regression password', name: 'Narradora',
  } });
  assert.equal(signup.status, 200);
  const cookie = cookies(signup), user = (await signup.json()).user;
  const accountRoom = await createRoom({ roomName: 'Imagens', personName: 'Narradora', token: 'a'.repeat(43), requestId: randomUUID() }, user.id);
  const guestRoom = await createRoom({ roomName: 'Sem conta', personName: 'Visitante', token: 'b'.repeat(43), requestId: randomUUID() });
  const request = (session, sessionCookie = cookie) => new Request(`${origin}/api/rooms/${session.roomCode}/files/upload`, {
    method: 'POST', headers: { origin, cookie: sessionCookie, authorization: `Bearer ${session.token}`, 'x-participant-id': session.participantId },
  });
  const input = (session, size) => ({ participantId: session.participantId, token: session.token, requestId: randomUUID(), name: 'imagem.png', contentType: 'image/png', size });
  const path = (session, file) => `rooms/${session.roomCode}/${session.participantId}/${file.requestId}`;
  const authorize = (session, file, sessionCookie = cookie) => authorizeRoomFileUpload(session.roomCode, path(session, file), file, request(session, sessionCookie));

  // With untyped SQL parameters, 68, 6000000 and 800000 compare greater than
  // "52428800" as text, despite being valid files well below 50 MiB.
  for (const size of [68, 6000000, 800000, MAX_ROOM_FILE_BYTES]) {
    const file = input(accountRoom, size), pathname = path(accountRoom, file);
    const payload = await authorize(accountRoom, file);
    const blob = { pathname, url: `https://test.private.blob.vercel-storage.com/${pathname}`, contentType: 'image/png' };
    uploaded.set(pathname, { ...blob, size });
    const entry = await completeRoomFileUpload(blob, payload);
    assert.equal(entry.data.size, size);
    assert.equal(entry.data.name, 'imagem.png');
    const saved = await readRoomFileUploadResult(request(accountRoom), accountRoom.roomCode, file.requestId);
    assert.equal(saved.id, entry.id);
  }
  assert.equal((await database.query('SELECT count(*)::int AS n FROM upload_reservations')).rows[0].n, 0);
  assert.equal(JSON.parse(await authorize(guestRoom, input(guestRoom, 68), '')).size, 68);
  await assert.rejects(authorize(accountRoom, input(accountRoom, 68), ''), error => error.status === 401);
  await assert.rejects(authorize(guestRoom, input(guestRoom, 0), ''), error => error.status === 507);
  await assert.rejects(authorize(guestRoom, input(guestRoom, MAX_ROOM_FILE_BYTES + 1), ''), error => error.status === 507);
  await assert.rejects(authorize(accountRoom, input(accountRoom, 45000000)), error => error.status === 507);
  const total = (await database.query("SELECT sum(file_size)::bigint AS bytes FROM entries WHERE type='file'")).rows[0].bytes;
  assert.ok(Number(total) < ROOM_FILE_BUDGET_BYTES);
  console.log('Room image uploads verified: small images, maximum size, publication, account/guest access and real quota rejection.');
} finally { await database.close(); }
