import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
test('real account routes preserve data across devices and logout, isolate owners, and delete all account resources', { timeout: 120000 }, async () => {
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--experimental-test-module-mocks', 'tests/helpers/account-scenario.mjs'], { timeout: 110000, maxBuffer: 1000000 });
  assert.match(result.stdout, /Account lifecycle verified/);
});
