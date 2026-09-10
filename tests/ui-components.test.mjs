import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));

function loadModule(relativePath) {
  return import(pathToFileURL(path.join(root, relativePath.replace(/^\//, ""))).href);
}

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, ".next"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await loadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await loadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await loadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("preserves legacy sheets while adding universal sheet data", async () => {
  const { createCharacter, normalizeCharacter } = await loadModule("/lib/fate.ts");
  const legacy = createCharacter("Nave da Aurora");
  legacy.description = "Uma Ficha que representa um veículo.";
  legacy.aspects.highConcept = "Último farol entre as estrelas";
  legacy.skills.navigation = 4;
  delete legacy.optional;

  const normalized = normalizeCharacter(legacy);

  assert.equal(normalized.name, "Nave da Aurora");
  assert.equal(normalized.aspects.highConcept, "Último farol entre as estrelas");
  assert.equal(normalized.optional.aspectValues.highConcept, "Último farol entre as estrelas");
  assert.equal(normalized.skills.navigation, 4);
  assert.equal(normalized.optional.image, null);
  assert.deepEqual(normalized.optional.links, { rulesProfileId: "", roomParticipantId: "" });
});

test("keeps explicit Mesa and rules links on each universal sheet", async () => {
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const sheet = createCharacter("Torre Peregrina", { rulesProfileId: "rules_city", roomParticipantId: "participant_7" });

  assert.equal(sheet.optional.links.rulesProfileId, "rules_city");
  assert.equal(sheet.optional.links.roomParticipantId, "participant_7");
});

test("keeps custom sheet values when structures are hidden and restored", async () => {
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const {
    aspectValue,
    consequenceValue,
    resourceValue,
    stressMarks,
    withAspectValue,
    withConsequenceValue,
    withResourceValue,
    withStressMark,
  } = await loadModule("/lib/sheet-data.ts");

  let sheet = createCharacter("A Cidade que Anda");
  sheet = withAspectValue(sheet, "oath", "Nunca deixa ninguém para trás");
  sheet = withStressMark(sheet, "reputationStress", 7, true);
  sheet = withConsequenceValue(sheet, "scar", "Portões quebrados pela guerra");
  sheet = withResourceValue(sheet, "fuel", "17");

  assert.equal(aspectValue(sheet, "oath"), "Nunca deixa ninguém para trás");
  assert.equal(stressMarks(sheet, "reputationStress")[7], true);
  assert.equal(consequenceValue(sheet, "scar"), "Portões quebrados pela guerra");
  assert.equal(resourceValue(sheet, "fuel"), "17");
});

test("round-trips image and personalization in the exported sheet bundle", async () => {
  const { createCharacter, normalizeCharacter } = await loadModule("/lib/fate.ts");
  const { createDefaultTableConfig, normalizeTableConfig } = await loadModule("/lib/table-config.ts");
  const sheet = createCharacter("Farol de Vidro");
  sheet.optional.image = {
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    positionX: 27,
    positionY: 68,
    zoom: 1.45,
    alt: "Um ponto de luz entre mundos",
  };
  sheet.optional.customValues.travelMark = "A bússola aponta para lembranças";
  const tableConfig = createDefaultTableConfig();
  tableConfig.sheetStructure.imageShape = "wide";
  tableConfig.skillSystem.preset = "custom";
  tableConfig.skillSystem.customSkills = [{ id: "cartography", name: "Cartografia impossível", translation: "Impossible cartography" }];

  const bundle = JSON.parse(JSON.stringify({ format: "fate-sheet", bundleVersion: 2, sheet, tableConfig }));
  const restoredSheet = normalizeCharacter(bundle.sheet);
  const restoredConfig = normalizeTableConfig(bundle.tableConfig);

  assert.equal(restoredSheet.optional.image.dataUrl, sheet.optional.image.dataUrl);
  assert.equal(restoredSheet.optional.image.positionX, 27);
  assert.equal(restoredSheet.optional.customValues.travelMark, "A bússola aponta para lembranças");
  assert.equal(restoredConfig.sheetStructure.imageShape, "wide");
  assert.equal(restoredConfig.skillSystem.customSkills[0].translation, "Impossible cartography");
});

test("migrates old table profiles and validates flexible structure limits", async () => {
  const { createDefaultTableConfig, normalizeTableConfig, tableConfigSchema } = await loadModule("/lib/table-config.ts");
  const oldProfile = createDefaultTableConfig();
  delete oldProfile.sheetStructure;
  oldProfile.appearance.theme = "system";

  const migrated = normalizeTableConfig(oldProfile);
  assert.equal(migrated.sheetStructure.aspects[0].id, "highConcept");
  assert.equal(migrated.sheetStructure.resources[0].id, "refresh");
  assert.equal(migrated.appearance.theme, "dark");

  const invalid = createDefaultTableConfig();
  invalid.sheetStructure.resources[0].minimum = 9;
  invalid.sheetStructure.resources[0].maximum = 2;
  assert.equal(tableConfigSchema.safeParse(invalid).success, false);
});

test("uses the complete fair 4dF distribution and valid cryptographic outcomes", async () => {
  const { FATE_PROBABILITIES, rollFateDice } = await loadModule("/lib/fate.ts");

  assert.equal(FATE_PROBABILITIES.reduce((sum, item) => sum + item.ways, 0), 81);
  assert.deepEqual(
    FATE_PROBABILITIES.map((item) => item.ways),
    [...FATE_PROBABILITIES].reverse().map((item) => item.ways),
  );

  for (let index = 0; index < 256; index += 1) {
    const roll = rollFateDice();
    assert.equal(roll.dice.length, 4);
    assert.ok(roll.dice.every((die) => die === -1 || die === 0 || die === 1));
    assert.equal(roll.sum, roll.dice.reduce((sum, die) => sum + die, 0));
  }
});

test("keeps responsive reflow and accessibility safeguards in the Fate shell", async () => {
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  const app = await readFile(path.join(root, "components", "fate-app.tsx"), "utf8");
  const image = await readFile(path.join(root, "components", "sheet-image.tsx"), "utf8");

  assert.match(css, /@container \(max-width: 560px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /\[data-slot="tabs-content"\] \{ overflow-x: clip; \}/);
  assert.match(css, /\[data-slot="button"\] \{[^}]*white-space: normal/);
  assert.match(css, /\.rule-prose iframe/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(/);
  assert.match(css, /\.main-nav \[data-slot="tabs-list"\] \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.accent-picker-grid \{ display: grid; grid-template-columns: repeat\(6, minmax\(72px, 1fr\)\)/);
  assert.match(css, /\.sheet-utility-actions \{ display: flex; align-items: center; gap: 0\.35rem; \}/);
  assert.match(css, /\.choice-grid\.three\.damage-mode-options \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\[data-slot="radio-group-item"\] \{ width: 1\.15rem; height: 1\.15rem; min-width: 1\.15rem; min-height: 1\.15rem; \}/);
  assert.match(css, /\.damage-mode-options \.setting-choice:has\(\[data-state="checked"\]\)/);
  assert.match(css, /\.room-onboarding \[data-slot="tabs-list"\] \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.room-onboarding \[data-slot="tabs-list"\] \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.room-onboarding \[data-slot="tabs-trigger"\] \{ min-height: 52px; justify-content: flex-start;/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /field-sizing:\s*content/);
  assert.match(css, /\.rule-prose th \{[^}]*white-space:\s*nowrap/);
  assert.doesNotMatch(image, /para leitores de tela/);
  assert.match(image, /<span>Descrição da imagem<\/span>/);
  assert.match(app, /<span>Mesas<\/span>/);
});

test("starts new configurations with every optional official rule disabled", async () => {
  const { createDefaultTableConfig } = await loadModule("/lib/table-config.ts");
  const config = createDefaultTableConfig();

  assert.ok(Object.values(config.officialRules).every((enabled) => enabled === false));
  assert.equal(config.damageMode, "consequences");
  assert.equal(config.skillSystem.preset, "default");
  assert.equal(config.customRules.length, 0);
});

test("creates, duplicates, and repairs long-lived rules collections", async () => {
  const {
    createRulesProfileCollection,
    duplicateRulesProfile,
    normalizeRulesProfileCollection,
  } = await loadModule("/lib/rules-profiles.ts");
  const collection = createRulesProfileCollection();
  const copy = duplicateRulesProfile(collection.profiles[0]);
  const repaired = normalizeRulesProfileCollection({
    version: 1,
    activeProfileId: "missing",
    profiles: [collection.profiles[0], copy],
  });

  assert.notEqual(copy.id, collection.profiles[0].id);
  assert.match(copy.config.profileName, /— cópia$/);
  assert.equal(repaired.activeProfileId, collection.profiles[0].id);
  assert.ok(Object.values(collection.profiles[0].config.officialRules).every((enabled) => enabled === false));
});

test("renders a clean sheet without reserving an image area", async () => {
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const { createDefaultTableConfig } = await loadModule("/lib/table-config.ts");
  const { SheetView } = await loadModule("/components/sheet-view.tsx");
  const sheet = createCharacter("Arquivo Errante");
  sheet.description = "Uma biblioteca que atravessa mundos.";

  const html = renderToStaticMarkup(
    React.createElement(SheetView, { character: sheet, tableConfig: createDefaultTableConfig() }),
  );

  assert.match(html, /data-has-image="false"/);
  assert.doesNotMatch(html, /sheet-image-block/);
  assert.doesNotMatch(html, /Imagem da Ficha/);
  assert.match(html, />Arquivo Errante<\/h1>/);
});

test("keeps an existing sheet image in the clean view", async () => {
  const { createCharacter } = await loadModule("/lib/fate.ts");
  const { createDefaultTableConfig } = await loadModule("/lib/table-config.ts");
  const { SheetView } = await loadModule("/components/sheet-view.tsx");
  const sheet = createCharacter("Nave Horizonte");
  sheet.optional.image = {
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    positionX: 50,
    positionY: 50,
    zoom: 1,
    alt: "Nave contra um céu azul",
  };

  const html = renderToStaticMarkup(
    React.createElement(SheetView, { character: sheet, tableConfig: createDefaultTableConfig() }),
  );

  assert.match(html, /data-has-image="true"/);
  assert.match(html, /class="sheet-image-block"/);
  assert.match(html, /alt="Nave contra um céu azul"/);
});

test("keeps the requested human-facing labels and removes redundant sheet copy", async () => {
  const [app, sheet, rules, rooms, footer] = await Promise.all([
    readFile(path.join(root, "components", "fate-app.tsx"), "utf8"),
    readFile(path.join(root, "components", "character-sheet.tsx"), "utf8"),
    readFile(path.join(root, "components", "rules-library.tsx"), "utf8"),
    readFile(path.join(root, "components", "rooms.tsx"), "utf8"),
    readFile(path.join(root, "components", "fate-app.tsx"), "utf8"),
  ]);

  assert.match(app, /Fichas, regras e mesas do seu jeito/);
  assert.match(app, /<span>Fichas<\/span>/);
  assert.doesNotMatch(app, /profile-button/);
  assert.match(rules, /Central de Regras/);
  assert.doesNotMatch(`${app}\n${sheet}\n${rules}\n${rooms}\n${footer}`, /Centro de [Rr]egras/);
  assert.doesNotMatch(sheet, /Minhas Fichas|Salvamento automático ativo|Restaurar a cópia anterior/);
  assert.doesNotMatch(sheet, /placeholder="O essencial sobre o que esta Ficha representa"/);
  assert.match(sheet, /table-link-strip/);
  assert.match(sheet, /Link2/);
  assert.match(sheet, /Mesa: \{linkedRoom/);
  assert.match(sheet, /Regras: \{linkedProfile/);
  assert.match(sheet, /Ajustar escolhas/);
  assert.match(sheet, /className="sheet-edit-actions"/);
  assert.match(sheet, /className="sheet-utility-actions" role="group" aria-label="Ações desta Ficha"/);
  assert.doesNotMatch(sheet, /onOpenTable/);
  assert.match(app, /roomStore=\{roomStore\} onOpenRooms=\{\(\) => changeWorkspace\("salas"\)\}/);
});

test("keeps saved Mesas idle and connects every direction without duplicate relationship data", async () => {
  const [roomsHook, rooms, settings, sheet, image, rules, dice, styles] = await Promise.all([
    readFile(path.join(root, "lib", "use-room.ts"), "utf8"),
    readFile(path.join(root, "components", "rooms.tsx"), "utf8"),
    readFile(path.join(root, "components", "table-settings.tsx"), "utf8"),
    readFile(path.join(root, "components", "character-sheet.tsx"), "utf8"),
    readFile(path.join(root, "components", "sheet-image.tsx"), "utf8"),
    readFile(path.join(root, "components", "rules-library.tsx"), "utf8"),
    readFile(path.join(root, "components", "dice-roller.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);

  assert.match(roomsHook, /sessionStorage\.getItem\(ACTIVE_SESSION_KEY\)/);
  assert.match(roomsHook, /rulesProfileId/);
  assert.doesNotMatch(roomsHook, /activeParticipantId:/);
  assert.match(rooms, /Regras desta Mesa/);
  assert.match(rooms, /saved-room-rules/);
  assert.match(settings, /store\.profiles/);
  assert.match(settings, /Mesas vinculadas/);
  assert.match(sheet, /Abrir Mesa ou regras desta Ficha/);
  assert.match(sheet, /onOpenLinkedRoom\(linkedRoom\.session\.participantId\)/);
  assert.match(sheet, /onOpenLinkedRules\(linkedProfile\.id\)/);
  assert.match(sheet, /Mesa: \{linkedRoom\.roomName/);
  assert.match(sheet, /Regras: \{linkedProfile\.config\.profileName/);
  assert.match(rules, /className="active-profile-strip">\s*<BookOpen/);
  assert.match(rules, /<PrivateTableLibrary language=\{language\} store=\{roomStore\}/);
  assert.match(rules, /roomStore: RoomStore/);
  assert.match(roomsHook, /const readFile = React\.useCallback/);
  assert.match(roomsHook, /files: entry\.type === "file"/);
  assert.match(dice, /className="active-profile-strip">\s*<Dices/);
  assert.match(rooms, /className="room-quick-actions"/);
  assert.match(rooms, /Você narra esta Mesa\./);
  assert.match(rooms, /Você joga nesta Mesa\./);
  assert.match(rooms, /disponível para todos os seus integrantes\./);
  assert.match(rooms, /Histórico da Mesa/);
  assert.match(rooms, /Seu pedido chegou\. Você entra assim que o narrador aprovar\./);
  assert.match(rooms, /A primeira rolagem, nota, regra ou arquivo aparecerá aqui\./);
  assert.match(rooms, /data-empty=\{visibleEntries\.length === 0\}/);
  assert.match(rooms, /<b>Fichas<\/b>/);
  assert.match(rooms, /<b>Regras<\/b>/);
  assert.match(rooms, /<b>Rolar<\/b>/);
  assert.match(rooms, /onOpenRulesProfile\(linkedProfile\.id\)/);
  assert.match(styles, /\.resource-counter \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(styles, /\.consequence-field \{ grid-template-columns: minmax\(155px, 0\.38fr\)/);
  assert.doesNotMatch(image, /Opcional\. Toque aqui para escolher/);
  assert.doesNotMatch(sheet, /Textos longos crescem/);
  assert.match(sheet, /são gratuitas no atual conjunto de regras/);
  assert.match(sheet, /<SelectValue>\{rating >= 0/);
});

test("fills the sheet columns with Aspectos, Façanhas and Anotações", async () => {
  const [sheet, styles] = await Promise.all([
    readFile(path.join(root, "components", "character-sheet.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);

  assert.match(styles, /\.sheet-grid-top \{ grid-template-columns: minmax\(320px, 0\.82fr\) minmax\(520px, 1\.18fr\); \}/);
  assert.match(styles, /\.sheet-grid \{ display: grid; align-items: stretch; gap: 1rem; \}/);
  assert.match(styles, /grid-template-areas: "stunts skills" "notes skills"/);
  assert.match(styles, /\.sheet-grid-top \.aspect-list \{ flex: 1; grid-auto-rows: minmax\(76px, 1fr\); \}/);
  assert.match(sheet, /className="sheet-stunts-section"/);
  assert.match(sheet, /className="sheet-skills-section"/);
  assert.match(sheet, /className="sheet-notes-section"/);
  assert.match(sheet, /className="notes-textarea"/);
  assert.doesNotMatch(sheet, /className="field-stack notes-field"/);
});

test("keeps rules, rolls and Mesas direct and visually quiet", async () => {
  const [rules, dice, rooms, styles] = await Promise.all([
    readFile(path.join(root, "components", "rules-library.tsx"), "utf8"),
    readFile(path.join(root, "components", "dice-roller.tsx"), "utf8"),
    readFile(path.join(root, "components", "rooms.tsx"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);

  assert.match(rules, /sort\(\(a, b\) => Number\(b\[0\]\) - Number\(a\[0\]\)\)/);
  assert.match(rules, /Comece com o livro\. Mude só o que ajudar a mesa\./);
  assert.doesNotMatch(rules, /placeholder=\{language === "pt" \? "Buscar regra/);
  assert.match(dice, /Quatro dados, três faces equiprováveis em cada dado\./);
  assert.match(dice, /Cada face \(−, 0 ou \+\) tem exatamente 1\/3 de chance\./);
  assert.doesNotMatch(dice, /superar a fechadura|Pronto para rolar|Geração criptográfica|amostragem sem viés|81 combinações|Chance do total natural<\/h2>/);
  assert.match(styles, /\.probability-panel \{ min-width: 0; align-self: start;/);
  assert.match(styles, /\.probability-bars > div \{ display: grid; grid-template-columns: 2\.3rem minmax\(0, 1fr\) 4\.4rem;/);
  assert.match(rooms, /Jogo em grupo/);
  assert.match(rooms, /<p>Crie, entre e volte às suas Mesas\.<\/p>/);
  assert.match(rooms, /Entrar como jogador/);
  assert.match(rooms, /Como quer ser chamado/);
  assert.match(rooms, /Pedir para entrar/);
  assert.doesNotMatch(rooms, /Uma porta simples|FATE42|Seu nome na mesa|A torre no fim do mundo|Como você aparece na mesa|Nome do narrador|Pedir entrada|room-principles|Atualização automática|Sincronizado às|Consultas também entram no diário|Buscar no que está visível/);
});

test("applies the final room, roll and settings wording without mixing indirect controls into actions", async () => {
  const [dice, rooms, settings, structure, tableConfig, providers, characterStore, tableStore, roomStore, roomServer, styles] = await Promise.all([
    readFile(path.join(root, "components", "dice-roller.tsx"), "utf8"),
    readFile(path.join(root, "components", "rooms.tsx"), "utf8"),
    readFile(path.join(root, "components", "table-settings.tsx"), "utf8"),
    readFile(path.join(root, "components", "sheet-structure-settings.tsx"), "utf8"),
    readFile(path.join(root, "lib", "table-config.ts"), "utf8"),
    readFile(path.join(root, "components", "providers.tsx"), "utf8"),
    readFile(path.join(root, "lib", "use-character-store.ts"), "utf8"),
    readFile(path.join(root, "lib", "use-table-config.ts"), "utf8"),
    readFile(path.join(root, "lib", "use-room.ts"), "utf8"),
    readFile(path.join(root, "lib", "server", "rooms.ts"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
  ]);
  const visibleSources = [dice, rooms, settings, structure, tableConfig, providers, characterStore, tableStore, roomStore, roomServer].join("\n");
  const newRuleStart = settings.indexOf('<div className="new-rule-paper">');
  const newRuleEnd = settings.indexOf("</AccordionContent>", newRuleStart);
  const newRuleForm = settings.slice(newRuleStart, newRuleEnd);

  assert.match(dice, /FATE_PROBABILITIES_DESCENDING = \[\.\.\.FATE_PROBABILITIES\]\.sort\(\(left, right\) => right\.total - left\.total\)/);
  assert.match(dice, /<div className="empty-inline">As rolagens aparecerão aqui\.<\/div>/);
  assert.doesNotMatch(dice, /<RotateCcw \/> As rolagens aparecerão aqui/);
  assert.match(rooms, /\{store\.session && linkedProfile && \(\s*<div className="room-rules-choice">/);
  assert.doesNotMatch(rooms, /room-quick-action-group/);
  assert.match(rooms, /<Label htmlFor="room-note">Notas da mesa<\/Label>/);
  assert.doesNotMatch(rooms, /id="room-note"[^>]*placeholder=/);
  assert.match(settings, /<SettingChoice value="light" title="Claro" \/>/);
  assert.match(settings, /<SettingChoice value="dark" title="Escuro" \/>/);
  assert.doesNotMatch(settings, /SettingChoice value="system"|Tudo guardado|Salvamento automático ativo/);
  assert.match(providers, /defaultTheme="dark" themes=\{\["light", "dark"\]\} enableSystem=\{false\}/);
  assert.match(settings, /Do seu jeito, sem deixar de ser Fate/);
  assert.match(settings, /Tudo fica salvo neste dispositivo\. Mude o que quiser e faça o que for melhor para a sua Mesa\. É fácil rebobinar\./);
  assert.match(settings, /Escreva a ideia; o site vai se lembrar dela/);
  assert.doesNotMatch(settings, /idea-on-paper|Uma ideia já basta/);
  assert.ok(newRuleStart >= 0 && newRuleEnd > newRuleStart);
  assert.doesNotMatch(newRuleForm, /placeholder=/);
  assert.doesNotMatch(settings, /placeholder=/);
  assert.match(settings, /<legend>Escolha onde aplicar<\/legend>/);
  assert.match(settings, /Conjunto em uso/);
  assert.match(settings, /Novo conjunto/);
  assert.match(settings, /Recuperar versão anterior/);
  assert.match(settings, /Restaurar este conjunto ao padrão/);
  assert.match(structure, /Restaurar só a estrutura/);
  assert.doesNotMatch(structure, /Restaurar estrutura padrão/);
  assert.match(settings, /<Badge variant="outline">Oficial<\/Badge><Badge variant="secondary">Opcional<\/Badge>/);
  assert.doesNotMatch(`${dice}\n${settings}`, /Oficial opcional/);
  assert.match(settings, /Salvar mudanças/);
  assert.match(settings, /Importar mudanças/);
  const deprecatedDeviceWord = new RegExp(["apa", "relho"].join(""), "i");
  assert.doesNotMatch(visibleSources, deprecatedDeviceWord);
  assert.match(styles, /\.room-quick-actions \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*\.room-quick-actions \{ grid-template-columns: 1fr; \}/);
});

test("keeps every room file durable, private to approved participants, and visible in the shared feed", async () => {
  const [packageRaw, contracts, server, hook, rooms, uploadRoute, statusRoute, downloadRoute, schema] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "lib", "room-contracts.ts"), "utf8"),
    readFile(path.join(root, "lib", "server", "rooms.ts"), "utf8"),
    readFile(path.join(root, "lib", "use-room.ts"), "utf8"),
    readFile(path.join(root, "components", "rooms.tsx"), "utf8"),
    readFile(path.join(root, "app", "api", "rooms", "[code]", "files", "upload", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "api", "rooms", "[code]", "files", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "api", "rooms", "[code]", "files", "[entryId]", "route.ts"), "utf8"),
    readFile(path.join(root, "db", "schema.ts"), "utf8"),
  ]);
  const dependencies = JSON.parse(packageRaw).dependencies;

  assert.ok(dependencies["@neondatabase/serverless"]);
  assert.ok(dependencies["@vercel/blob"]);
  assert.match(contracts, /RoomEntryType = "roll" \| "note" \| "rule" \| "file"/);
  assert.match(contracts, /MAX_ROOM_FILE_BYTES/);
  assert.match(schema, /\["roll", "note", "rule", "file"\]/);
  assert.match(server, /authorizeRoomFileUpload/);
  assert.match(server, /completeRoomFileUpload/);
  assert.match(server, /get\(location, \{ access: "private" \}\)/);
  assert.match(server, /await authorize\(request, roomCode\)/);
  assert.match(server, /type = 'file'/);
  assert.match(hook, /const postFile = React\.useCallback/);
  assert.match(hook, /import\("@vercel\/blob\/client"\)/);
  assert.match(hook, /multipart: false/);
  assert.match(hook, /const downloadFile = React\.useCallback/);
  assert.match(uploadRoute, /handleUpload/);
  assert.match(uploadRoute, /maximumSizeInBytes: MAX_ROOM_FILE_BYTES/);
  assert.match(uploadRoute, /onUploadCompleted/);
  assert.match(statusRoute, /status: 202/);
  assert.match(downloadRoute, /readRoomFile/);
  assert.match(downloadRoute, /x-content-type-options/);
  assert.match(rooms, /type="file" multiple/);
  assert.match(rooms, /"Arquivos"/);
  assert.match(rooms, /room-file-link/);
});

test("publishes the approved transparent mark as the app identity", async () => {
  const [manifest, layout, favicon, icon192, icon512, apple] = await Promise.all([
    readFile(path.join(root, "app", "manifest.ts"), "utf8"),
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "public", "favicon.svg"), "utf8"),
    readFile(path.join(root, "public", "icon-192.png")),
    readFile(path.join(root, "public", "icon-512.png")),
    readFile(path.join(root, "public", "apple-touch-icon.png")),
  ]);

  assert.match(manifest, /Fichas, regras e mesas do seu jeito\./);
  assert.match(manifest, /Fate Gameplay Toolkit/);
  assert.match(layout, /Fate Gameplay Toolkit/);
  assert.match(manifest, /scope: "\/"/);
  assert.doesNotMatch(manifest, /maskable/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.match(layout, /appleWebApp/);
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.ok(icon192.length > 1_000);
  assert.ok(icon512.length > 4_000);
  assert.ok(apple.length > 1_000);
});
