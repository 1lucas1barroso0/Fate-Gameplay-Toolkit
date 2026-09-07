import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("publishes the independent product identity without platform metadata", async () => {
  const [layout, manifest, app, config, packageRaw] = await Promise.all([
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "app", "manifest.ts"), "utf8"),
    readFile(path.join(root, "components", "fate-app.tsx"), "utf8"),
    readFile(path.join(root, "next.config.ts"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
  ]);
  const source = `${layout}\n${manifest}\n${app}`;
  const platformMark = new RegExp(["chat", "gpt|open", "ai|codex-preview"].join(""), "i");

  assert.match(source, /Fate Gameplay Toolkit/);
  assert.match(app, /Fichas, regras e mesas do seu jeito/);
  assert.match(config, /poweredByHeader:\s*false/);
  assert.equal(JSON.parse(packageRaw).displayName, "Fate Gameplay Toolkit");
  assert.doesNotMatch(source, platformMark);
});
