import test from "node:test";
import assert from "node:assert/strict";
import { compareBackup } from "../lib/backup-tools.ts";
import { createCharacter } from "../lib/fate.ts";

test("large backups match by content, preserve changed originals, and keep input order", () => {
  const local = Array.from({ length: 200 }, (_, index) => createCharacter("Ficha " + index));
  const renamedId = structuredClone(local[17]);
  renamedId.id = "copy-of-existing";
  const changed = structuredClone(local[53]);
  changed.notes = "Uma nova anotação.";
  const fresh = createCharacter("Outra ficha");
  const incoming = [renamedId, changed, fresh, ...local.slice().reverse()];
  const before = JSON.stringify({ local, incoming });
  const result = compareBackup(incoming, local);
  assert.deepEqual(result.slice(0, 3).map(row => row.status), ["same", "copy", "new"]);
  assert.ok(result[1].changed.includes("notes"));
  assert.ok(result.slice(3).every(row => row.status === "same"));
  assert.deepEqual(result.map(row => row.item.id), incoming.map(item => item.id));
  assert.equal(JSON.stringify({ local, incoming }), before);
});

test("each local sheet is fingerprinted once rather than once per incoming sheet", () => {
  let reads = 0;
  const local = Array.from({ length: 30 }, (_, index) => {
    const character = createCharacter("Local " + index);
    const name = character.name;
    Object.defineProperty(character, "name", { enumerable: true, get() { reads++; return name; } });
    return character;
  });
  const incoming = Array.from({ length: 40 }, (_, index) => createCharacter("Nova " + index));
  assert.ok(compareBackup(incoming, local).every(row => row.status === "new"));
  assert.equal(reads, local.length);
});
