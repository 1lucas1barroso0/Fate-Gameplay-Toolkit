import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createCharacter } from "../../lib/fate";
import { createRulesProfileCollection } from "../../lib/rules-profiles";

test("UI language, local rolls and chapter-only loading preserve navigation", async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on("request", request => { if (request.url().includes("/rule-books/")) requests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fichas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Sheets", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Dice", exact: true }).click();
  await page.getByRole("button", { name: "Roll on this device", exact: true }).click();
  await expect(page.locator(".roll-history li")).toHaveCount(1);
  await page.getByRole("tab", { name: "Rules", exact: true }).click();
  await expect(page.locator(".rule-prose")).toBeVisible();
  await expect(page.locator("#rule-reader")).toHaveAttribute("lang", "en");
  expect(requests.every(url => !url.includes("/search-") && !/fate-condensed-en\.[a-f0-9]+\.json/.test(url))).toBe(true);
  await page.getByRole("button", { name: "PT-BR", exact: true }).first().click();
  await expect(page.locator("#rule-reader")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByRole("tab", { name: "Fichas", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});

test("table approval, scene sharing/conflicts, draft reconnect and upload errors are isolated", async ({ page }) => {
  // Hermetic API contract fixture: never touches production Neon or Blob.
  let approved = false, scene = { revision: 0, scene: null as unknown }, posts = 0, uploads = 0;
  const room = { code: "ABC234", name: "Test table", createdAt: Date.now() };
  const self = { id: "participant_test", name: "GM", role: "gm", status: "pending", createdAt: Date.now() };
  const entries: unknown[] = [];
  await page.route("**/api/rooms**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/rooms") return route.fulfill({ json: { session: { roomCode: room.code, participantId: self.id, token: "a".repeat(43) } } });
    if (path.endsWith("/scene")) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        if (body.revision !== scene.revision) return route.fulfill({ status: 409, json: { code: "scene_conflict" } });
        scene = { revision: scene.revision + 1, scene: body.scene };
      }
      return route.fulfill({ json: scene });
    }
    if (path.endsWith("/files/upload")) { uploads++; return route.fulfill({ status: 429, json: { error: "Too many uploads", retryAfter: 30 } }); }
    if (request.method() === "POST") {
      const body = request.postDataJSON(); posts++;
      const entry = { id: "entry_" + posts, type: body.type, body: body.body ?? body.title, data: body.type === "rule" ? { reference: body.reference } : {}, actor: { id: self.id, name: self.name }, createdAt: Date.now() };
      entries.push(entry); return route.fulfill({ status: 201, json: { entry } });
    }
    return route.fulfill({ json: { room, self: { ...self, status: approved ? "approved" : "pending" }, participants: [{ ...self, status: "approved" }], entries, files: [], nextCursor: null,
      storage: { files: { usedBytes: 0, limitBytes: 100000000, warningBytes: 80000000, count: 0, maxCount: 100, maxFileBytes: 50000000 }, history: { usedBytes: 0, warningBytes: 10000000, guidanceBytes: 20000000 }, database: { usedBytes: 0, warningBytes: 300000000, criticalBytes: 450000000 } } } });
  });
  await page.goto("/#salas");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("tab", { name: "Create as GM", exact: true }).click();
  await page.getByLabel("Table name", { exact: true }).fill("Test table");
  await page.getByLabel("Your display name", { exact: true }).first().fill("GM");
  await page.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(page.getByText("Waiting for the GM", { exact: true })).toBeVisible();
  approved = true;
  await expect(page.getByRole("heading", { name: "Test table", exact: true })).toBeVisible({ timeout: 12000 });
  await page.locator(".optional-scene > summary").click();
  await page.getByRole("button", { name: "Create scene", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("On the bridge");
  await page.getByRole("button", { name: "Save scene", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save scene", exact: true })).toBeDisabled();
  expect(scene.revision).toBe(1);
  await page.getByLabel("Title", { exact: true }).fill("Draft stays");
  scene.revision++;
  await page.getByRole("button", { name: "Save scene", exact: true }).click();
  await expect(page.getByText(/The scene changed in another tab/)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Draft stays");
  await page.locator("#room-note").fill("Draft offline");
  await page.context().setOffline(true);
  await expect(page.getByText("Offline. Your draft is still here.", { exact: false })).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.locator("#room-note")).toHaveValue("Draft offline");
  await page.locator('input[type="file"][multiple]').setInputFiles({ name: "test.txt", mimeType: "text/plain", buffer: Buffer.from("test only") });
  await expect.poll(() => uploads).toBe(1);
  expect(posts).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("backup import previews differences and keeps the original sheet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("tab", { name: "Your Fate", exact: true }).click();
  await page.getByText("Storage", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export sheets and rules", exact: true }).click();
  const exported = await download;
  const file = await exported.path();
  expect(file).toBeTruthy();
  await page.locator('#backup-settings input[type="file"]').setInputFiles(file!);
  await expect(page.getByText("Identical — skip", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Import selected copies/ })).toBeDisabled();
  const changed = JSON.parse(await readFile(file!, "utf8"));
  changed.sheets[0].name = "Recovered copy";
  changed.sheets[0].notes = "Recovered notes";
  await page.locator('#backup-settings input[type="file"]').setInputFiles({ name: "changed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(changed)) });
  await page.getByRole("button", { name: /Import selected copies/ }).click();
  await page.getByRole("tab", { name: "Sheets", exact: true }).click();
  await expect(page.locator(".sheet-name-field")).toHaveValue("Recovered copy");
  await expect(page.locator(".character-picker small")).toHaveText("2");
});

test("typed extra consequences and long custom writing survive reload and display modes", async ({ page }) => {
  const profiles = createRulesProfileCollection();
  profiles.profiles[0].config.customRules.push({ id: "journal", name: "Scene journal", description: "Keep your own text.", enabled: true, scopes: ["sheet"], field: { label: "My writing", type: "text", hint: "" } });
  const sheet = createCharacter("Test hero"); sheet.skills.physique = 5; sheet.skills.will = 5;
  sheet.optional.links.rulesProfileId = profiles.activeProfileId;
  await page.addInitScript(({ profiles, sheet }) => {
    if (!localStorage.getItem("e2e-seeded")) {
      localStorage.setItem("fate-gameplay-toolkit.rules-profiles.v1", JSON.stringify(profiles));
      localStorage.setItem("fate-gameplay-toolkit.characters.v1", JSON.stringify({ version: 1, activeId: sheet.id, characters: [sheet] }));
      localStorage.setItem("e2e-seeded", "1");
    }
  }, { profiles, sheet });
  await page.goto("/");
  await expect(page.locator(".consequence-field").filter({ hasText: "Física" })).toHaveCount(1);
  await expect(page.locator(".consequence-field").filter({ hasText: "Mental" })).toHaveCount(1);
  await expect(page.locator(".consequence-field").filter({ hasText: "Geral" })).toHaveCount(0);
  await page.locator(".consequence-field").filter({ hasText: "Física" }).locator("textarea").fill("Bruise");
  await page.locator(".consequence-field").filter({ hasText: "Mental" }).locator("textarea").fill("Nightmares");
  const field = page.getByRole("textbox", { name: "My writing", exact: true });
  const initial = await field.evaluate(node => node.clientHeight);
  const longText = Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1}: a remembered detail of the story.`).join("\n\n");
  await field.fill(longText);
  await expect.poll(() => field.evaluate(node => node.clientHeight)).toBeGreaterThan(initial);
  await expect.poll(() => field.evaluate(node => node.scrollHeight <= node.clientHeight + 2)).toBe(true);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator(".consequence-field").filter({ hasText: "Physical" }).locator("textarea")).toHaveValue("Bruise");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(page.locator(".clean-custom-rules dd")).toHaveText(longText);
  await expect(page.locator(".clean-consequences").getByText("Bruise", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "My writing", exact: true })).toHaveValue(longText);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
