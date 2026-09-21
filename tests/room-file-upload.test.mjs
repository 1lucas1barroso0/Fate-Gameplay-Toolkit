import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('room image uploads use numeric byte limits and preserve authorization and storage quotas', { timeout: 45000 }, async () => {
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--experimental-test-module-mocks', 'tests/helpers/room-file-scenario.mjs'], { timeout: 40000 });
  assert.match(result.stdout, /Room image uploads verified/);
});
