import { createServer } from 'node:http';
import { dispatch, origin, database } from './account-harness.mjs';
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const result = await dispatch(new Request(origin + incoming.url, { method: incoming.method, headers: incoming.headers,
      ...(body.length ? { body, duplex: 'half' } : {}),
    }));
    outgoing.statusCode = result.status;
    result.headers.forEach((value, key) => { if (key !== 'set-cookie') outgoing.setHeader(key, value); });
    if (result.headers.getSetCookie().length) outgoing.setHeader('set-cookie', result.headers.getSetCookie());
    outgoing.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) { console.error(error); outgoing.statusCode = 500; outgoing.end('test-handler-failed'); }
});
server.listen(3401, '127.0.0.1', () => console.log('Account test server ready'));
process.on('SIGTERM', () => { server.close(); void database.close().then(() => process.exit(0)); });
