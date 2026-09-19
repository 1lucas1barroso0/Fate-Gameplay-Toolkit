import { mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { authSchema } from '../../db/account-schema.ts';

// Real Postgres semantics and the production handlers, isolated from live data.
export const database = new PGlite();
const execute = async (client, query) => {
  if (query.text.includes('pg_advisory_xact_lock')) return [];
  if (query.text.includes('pg_database_size')) return [{ bytes: 1000000 }];
  return (await client.query(query.text, query.values)).rows;
};
const statement = (text, values = []) => ({ text, values,
  then: (resolve, reject) => execute(database, { text, values }).then(resolve, reject),
  catch: reject => execute(database, { text, values }).catch(reject),
});
const sql = (parts, ...values) => statement(parts.reduce((result, part, index) => result + (index ? '$' + index : '') + part, ''), values);
sql.query = statement;
sql.transaction = queries => database.transaction(async client => {
  const result = []; for (const query of queries) result.push(await execute(client, query)); return result;
});
const orm = drizzle(database, { schema: authSchema });
mock.module('../../db/index.ts', { namedExports: { getSql: () => sql, getDb: () => orm } });
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@localhost/test';
process.env.BETTER_AUTH_SECRET = 'account-test-secret-only-not-for-production-7654321';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3100';
export const origin = process.env.BETTER_AUTH_URL;

const auth = await import('../../app/api/auth/[...all]/route.ts');
const account = await import('../../app/api/account/route.ts');
const workspace = await import('../../app/api/account/workspace/route.ts');
const images = await import('../../app/api/account/images/route.ts');
const recovery = await import('../../app/api/account/recovery/route.ts');
const deletion = await import('../../app/api/account/delete/route.ts');
const rooms = await import('../../app/api/rooms/route.ts');
export async function dispatch(request) {
  const path = new URL(request.url).pathname;
  const handler = path.startsWith('/api/auth/') ? auth : path === '/api/account' ? account
    : path === '/api/account/workspace' ? workspace : path === '/api/account/images' ? images
    : path === '/api/account/recovery' ? recovery : path === '/api/account/delete' ? deletion : path === '/api/rooms' ? rooms : null;
  if (!handler?.[request.method]) return new Response(null, { status: 404 });
  return handler[request.method](request);
}

export async function call(path, { method = 'GET', body, cookie, id, requestOrigin = origin } = {}) {
  return dispatch(new Request(origin + path, { method,
    headers: { 'content-type': 'application/json', origin: requestOrigin, ...(cookie ? { cookie } : {}), ...(id ? { 'x-fate-account': id } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}
export function cookies(response) { return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); }
