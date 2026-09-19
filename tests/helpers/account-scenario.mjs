import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { call, cookies, database } from './account-harness.mjs';
import { createCharacter } from '../../lib/fate.ts';

try {
  const email = 'story@example.test', password = 'A long unique password 123';
  const signup = await call('/api/auth/sign-up/email', { method: 'POST', body: { email, password, name: 'Narradora' } });
  assert.equal(signup.status, 200, await signup.clone().text());
  const { user } = await signup.json(), firstCookie = cookies(signup);
  assert.ok(firstCookie.includes('fate.session_token='));
  assert.match(signup.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(signup.headers.get('set-cookie'), /SameSite=Lax/i);
  const stored = (await database.query('SELECT password FROM fate_credential WHERE user_id=$1', [user.id])).rows[0];
  assert.notEqual(stored.password, password); assert.ok(stored.password.length > 80);
  const wrong = await call('/api/auth/sign-in/email', { method: 'POST', body: { email, password: 'Wrong password 1234' } });
  assert.equal(wrong.status, 401);
  const signin = await call('/api/auth/sign-in/email', { method: 'POST', body: { email, password, name: '' } });
  assert.equal(signin.status, 200, await signin.clone().text());
  const secondCookie = cookies(signin);
  assert.equal((await signin.json()).user.id, user.id);
  const owner = { cookie: firstCookie, id: user.id };
  assert.equal((await call('/api/account/workspace')).status, 401);
  assert.equal((await call('/api/account/workspace', { cookie: firstCookie, id: 'another-user' })).status, 409);
  assert.equal((await call('/api/account/workspace', { ...owner, method: 'PUT', requestOrigin: 'https://foreign.test', body: {} })).status, 403);
  const empty = await (await call('/api/account/workspace', owner)).json();
  assert.deepEqual(empty, { revision: 0, data: {} });

  const sheet = createCharacter('Cidade do Amanhã');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6T1cAAAAASUVORK5CYII=', 'base64');
  const hash = createHash('sha256').update(png).digest('hex'), imageId = 'img_' + hash;
  assert.equal((await call('/api/account/images', { ...owner, method: 'PUT', body: { id: imageId, contentType: 'image/png', data: png.toString('base64') } })).status, 200);
  sheet.optional.image = { blobId: imageId, hash, bytes: png.length, contentType: 'image/png', positionX: 50, positionY: 50, zoom: 1, alt: 'Cidade' };
  const data = { 'fate-gameplay-toolkit.characters.v1': JSON.stringify({ version: 1, activeId: sheet.id, characters: [sheet] }), 'fate-gameplay-toolkit.language.v1': 'en' };
  const saved = await call('/api/account/workspace', { ...owner, method: 'PUT', body: { revision: 0, data } });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.json()).revision, 1);
  const second = { cookie: secondCookie, id: user.id };
  assert.deepEqual((await (await call('/api/account/workspace', second)).json()).data, data);
  const image = await (await call('/api/account/images?id=' + imageId, second)).json();
  assert.equal(Buffer.from(image.data, 'base64').toString('hex'), png.toString('hex'));
  const stale = await call('/api/account/workspace', { ...second, method: 'PUT', body: { revision: 0, data: {} } });
  assert.equal(stale.status, 409); assert.deepEqual((await stale.json()).data, data);
  assert.equal((await call('/api/account/workspace', { ...owner, method: 'PUT', body: { revision: 1, data: { foreign: 'x' } } })).status, 400);
  assert.equal((await call('/api/auth/delete-user', { ...owner, method: 'POST', body: {} })).status, 404);

  const outsiderResponse = await call('/api/auth/sign-up/email', { method: 'POST', body: { email: 'other@example.test', password, name: 'Outra pessoa' } });
  assert.equal(outsiderResponse.status, 200);
  const outsiderUser = (await outsiderResponse.json()).user, outsider = { cookie: cookies(outsiderResponse), id: outsiderUser.id };
  assert.equal((await call('/api/account/images?id=' + imageId, outsider)).status, 404);
  assert.deepEqual((await (await call('/api/account/workspace', outsider)).json()).data, {});
  assert.equal((await call('/api/auth/sign-out', { ...owner, method: 'POST', body: {} })).status, 200);
  assert.equal((await call('/api/account/workspace', owner)).status, 401);
  assert.deepEqual((await (await call('/api/account/workspace', second)).json()).data, data);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM fate_account_image WHERE user_id=$1', [user.id])).rows[0].count, 1);

  const keyResponse = await call('/api/account/recovery', { ...second, method: 'POST', body: { password } });
  assert.equal(keyResponse.status, 200); const key = (await keyResponse.json()).key;
  const newPassword = 'A different secure password 456';
  assert.equal((await call('/api/account/recovery', { method: 'PATCH', body: { email, key: 'wrong', password: newPassword } })).status, 403);
  assert.equal((await call('/api/account/recovery', { method: 'PATCH', body: { email, key, password: newPassword } })).status, 200);
  assert.equal((await call('/api/account/recovery', { method: 'PATCH', body: { email, key, password } })).status, 403);
  assert.equal((await call('/api/account/workspace', second)).status, 401);
  const recovered = await call('/api/auth/sign-in/email', { method: 'POST', body: { email, password: newPassword } });
  assert.equal(recovered.status, 200); const finalOwner = { cookie: cookies(recovered), id: user.id };

  const gm = await call('/api/rooms', { ...finalOwner, method: 'POST', body: { action: 'create', personName: 'Narradora', roomName: 'Mesa da conta', token: 'x'.repeat(43), requestId: crypto.randomUUID() } });
  assert.equal(gm.status, 201, await gm.clone().text());
  const gmSession = (await gm.json()).session;
  const otherRoom = await call('/api/rooms', { ...outsider, method: 'POST', body: { action: 'create', personName: 'Outra pessoa', roomName: 'Outra Mesa', token: 'y'.repeat(43), requestId: crypto.randomUUID() } });
  assert.equal(otherRoom.status, 201); const otherSession = (await otherRoom.json()).session;
  const joined = await call('/api/rooms', { ...finalOwner, method: 'POST', body: { action: 'join', roomCode: otherSession.roomCode, personName: 'Jogadora', token: 'z'.repeat(43), requestId: crypto.randomUUID() } });
  assert.equal(joined.status, 201, await joined.clone().text()); const player = (await joined.json()).session;
  const foreignClaim = await call('/api/account/workspace', { ...outsider, method: 'PUT', body: { revision: 0, data: { 'fate-gameplay-toolkit.room-session.v1': JSON.stringify(gmSession) } } });
  assert.equal(foreignClaim.status, 409);
  await database.query(`INSERT INTO entries (id,room_id,actor_id,body,request_id,type,data_json,created_at,file_size,blob_pathname)
    SELECT 'account-file',room_id,id,'Arquivo','test-file-request','file','{}',1,50,'rooms/test/account.png' FROM participants WHERE id=$1`, [player.participantId]);
  assert.equal((await call('/api/account/delete', { ...finalOwner, method: 'POST', body: { password: 'wrong' } })).status, 403);
  assert.equal((await call('/api/account/delete', { ...finalOwner, method: 'POST', body: { password: newPassword } })).status, 200);
  for (const table of ['fate_user', 'fate_session', 'fate_credential', 'fate_account_workspace', 'fate_account_image', 'fate_account_membership']) {
    const column = table === 'fate_user' ? 'id' : 'user_id';
    assert.equal((await database.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${column}=$1`, [user.id])).rows[0].count, 0, table);
  }
  assert.equal((await database.query('SELECT count(*)::int AS count FROM rooms WHERE code=$1', [gmSession.roomCode])).rows[0].count, 0);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM rooms WHERE code=$1', [otherSession.roomCode])).rows[0].count, 1);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM participants WHERE id=$1', [player.participantId])).rows[0].count, 0);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM entries WHERE id='account-file'")).rows[0].count, 0);
  assert.equal((await database.query("SELECT count(*)::int AS count FROM blob_cleanup_queue WHERE pathname='rooms/test/account.png'")).rows[0].count, 1, 'failed external deletion remains queued');
  assert.equal((await call('/api/account/workspace', finalOwner)).status, 401);
  assert.equal((await call('/api/account/workspace', outsider)).status, 200);
  console.log('Account lifecycle verified: auth, devices, isolation, images, conflicts, recovery, logout, deletion and durable file cleanup.');
} finally { await database.close(); }
