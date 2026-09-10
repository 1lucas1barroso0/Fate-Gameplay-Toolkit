import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const data = JSON.parse(await readFile(new URL("../content/expansions.json", import.meta.url), "utf8"));
const terminology = JSON.parse(await readFile(new URL("../content/fate-terminology.json", import.meta.url), "utf8"));

function source(id) {
  const found = data.sources.find((item) => item.id === id);
  assert.ok(found, "A fonte " + id + " não foi gerada.");
  return found;
}

function textFromHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&amp;|&quot;|&#39;|&apos;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceText(item, language = "en") {
  return textFromHtml(
    item.chapters
      .map((chapter) => chapter.title.pt + " " + chapter.title.en + " " + chapter.html[language])
      .join(" "),
  );
}

test("mantém o Condensado fora das expansões e identifica cada fonte sem ambiguidade", () => {
  assert.equal(data.version, "2026-09-10");
  assert.deepEqual(
    data.sources.map((item) => item.id),
    ["fate-guide", "fate-core", "fate-accelerated", "fate-adversary-toolkit", "fate-system-toolkit", "venture-city", "fate-horror-toolkit", "fate-of-cthulhu", "fate-space-toolkit", "uprising", "tachyon-squadron", "wearing-the-cape"],
  );
  assert.doesNotMatch(JSON.stringify(data.sources.map((item) => item.id)), /condensed|condensado/i);
  assert.match(data.precedence.pt, /Fate Condensado é a regra principal/);
  assert.match(data.precedence.pt, /Fate Condensado prevalece/);
  assert.match(data.precedence.pt, /nada é ativado sem escolha da Mesa/);
  assert.match(data.precedence.en, /Fate Condensed is the principal ruleset/);
  assert.match(data.precedence.en, /Fate Condensed prevails/);

  for (const item of data.sources) {
    assert.ok(item.tags.some((tag) => tag.pt === "Oficial" || tag.pt === "Licenciado"), item.id + " perdeu a origem editorial.");
    assert.ok(item.officialUrl.startsWith("https://"), item.id + " perdeu a fonte oficial.");
    assert.ok(item.referenceUrl.pt.startsWith("https://"), item.id + " perdeu a referência em português.");
    assert.ok(item.referenceUrl.en.startsWith("https://"), item.id + " perdeu a referência em inglês.");
    assert.ok(item.attribution.pt.length > 40, item.id + " perdeu a atribuição em português.");
    assert.ok(item.attribution.en.length > 40, item.id + " perdeu a atribuição em inglês.");
    for (const chapter of item.chapters) {
      assert.ok(chapter.html.pt.length > 20, item.id + ":" + chapter.id + " não possui conteúdo em português.");
      assert.ok(chapter.html.en.length > 20, item.id + ":" + chapter.id + " não possui conteúdo em inglês.");
      assert.equal("contentLanguage" in chapter, false, item.id + ":" + chapter.id + " ainda trata um idioma como exceção.");
    }
  }

  const system = source("fate-system-toolkit");
  assert.deepEqual(system.tags.map((tag) => tag.pt), ["Oficial", "Expansão", "Opcional"]);
  assert.equal(new Set(system.tags.map((tag) => tag.pt)).size, 3);

  for (const id of ["venture-city", "fate-horror-toolkit", "fate-of-cthulhu", "fate-space-toolkit", "uprising", "tachyon-squadron"]) {
    const expansion = source(id);
    assert.deepEqual(expansion.tags.map((tag) => tag.pt), ["Oficial", "Expansão", "Opcional"]);
    assert.equal(new Set(expansion.tags.map((tag) => tag.pt)).size, 3);
  }

  const wearingTheCape = source("wearing-the-cape");
  assert.deepEqual(wearingTheCape.tags.map((tag) => tag.pt), ["Licenciado", "Jogo autônomo", "Opcional"]);
  assert.equal(new Set(wearingTheCape.tags.map((tag) => tag.pt)).size, 3);
});

test("incorpora integralmente os SRDs oficiais atuais e o guia editorial", () => {
  const guide = source("fate-guide");
  const core = source("fate-core");
  const accelerated = source("fate-accelerated");
  const adversary = source("fate-adversary-toolkit");
  const system = source("fate-system-toolkit");
  const venture = source("venture-city");
  const horror = source("fate-horror-toolkit");
  const cthulhu = source("fate-of-cthulhu");
  const space = source("fate-space-toolkit");
  const uprising = source("uprising");
  const tachyon = source("tachyon-squadron");
  const wearingTheCape = source("wearing-the-cape");

  assert.equal(guide.chapters.length, 7);
  assert.equal(core.chapters.length, 14);
  assert.equal(accelerated.chapters.length, 12);
  assert.equal(accelerated.chapters.filter((chapter) => chapter.mode === "book-map").length, 12);
  assert.equal(system.chapters.length, 10);
  assert.equal(adversary.chapters.filter((chapter) => chapter.mode === "full-srd").length, 3);
  assert.equal(adversary.chapters.filter((chapter) => chapter.mode === "book-map").length, 10);
  assert.equal(venture.chapters.length, 7);
  assert.equal(venture.chapters.filter((chapter) => chapter.mode === "book-map").length, 7);
  assert.equal(horror.chapters.length, 12);
  assert.equal(horror.chapters.filter((chapter) => chapter.mode === "book-map").length, 12);
  assert.equal(cthulhu.chapters.length, 20);
  assert.equal(cthulhu.chapters.filter((chapter) => chapter.mode === "book-map").length, 20);
  assert.equal(space.chapters.length, 12);
  assert.equal(space.chapters.filter((chapter) => chapter.mode === "book-map").length, 12);
  assert.equal(uprising.chapters.length, 21);
  assert.equal(uprising.chapters.filter((chapter) => chapter.mode === "book-map").length, 21);
  assert.equal(tachyon.chapters.length, 16);
  assert.equal(tachyon.chapters.filter((chapter) => chapter.mode === "book-map").length, 16);
  assert.equal(wearingTheCape.chapters.length, 17);
  assert.equal(wearingTheCape.chapters.filter((chapter) => chapter.mode === "book-map").length, 17);

  assert.ok(guide.wordCountByLanguage.pt >= 600, "A síntese em português do guia encolheu.");
  assert.ok(guide.wordCountByLanguage.en >= 600, "A síntese em inglês do guia encolheu.");
  assert.ok(core.wordCountByLanguage.pt >= 79_000, "O SRD do Core em português encolheu para " + core.wordCountByLanguage.pt + " palavras.");
  assert.ok(core.wordCountByLanguage.en >= 85_000, "O SRD do Core em inglês encolheu para " + core.wordCountByLanguage.en + " palavras.");
  assert.ok(accelerated.wordCountByLanguage.pt >= 2_700, "A cobertura de Fate Acelerado em português encolheu para " + accelerated.wordCountByLanguage.pt + " palavras.");
  assert.ok(accelerated.wordCountByLanguage.en >= 2_500, "A cobertura de Fate Acelerado em inglês encolheu para " + accelerated.wordCountByLanguage.en + " palavras.");
  assert.ok(adversary.wordCountByLanguage.pt >= 10_000, "A cobertura de Adversários em português encolheu para " + adversary.wordCountByLanguage.pt + " palavras.");
  assert.ok(adversary.wordCountByLanguage.en >= 10_000, "A cobertura de Adversários em inglês encolheu para " + adversary.wordCountByLanguage.en + " palavras.");
  assert.ok(system.wordCountByLanguage.pt >= 57_000, "O SRD do System Toolkit em português encolheu para " + system.wordCountByLanguage.pt + " palavras.");
  assert.ok(system.wordCountByLanguage.en >= 56_000, "O SRD do System Toolkit em inglês encolheu para " + system.wordCountByLanguage.en + " palavras.");
  assert.ok(venture.wordCountByLanguage.pt >= 1_500, "A cobertura de Venture City em português encolheu para " + venture.wordCountByLanguage.pt + " palavras.");
  assert.ok(venture.wordCountByLanguage.en >= 1_400, "A cobertura de Venture City em inglês encolheu para " + venture.wordCountByLanguage.en + " palavras.");
  assert.ok(horror.wordCountByLanguage.pt >= 2_400, "A cobertura de Horror Toolkit em português encolheu para " + horror.wordCountByLanguage.pt + " palavras.");
  assert.ok(horror.wordCountByLanguage.en >= 2_200, "A cobertura de Horror Toolkit em inglês encolheu para " + horror.wordCountByLanguage.en + " palavras.");
  assert.ok(cthulhu.wordCountByLanguage.pt >= 4_500, "A cobertura de Fate of Cthulhu em português encolheu para " + cthulhu.wordCountByLanguage.pt + " palavras.");
  assert.ok(cthulhu.wordCountByLanguage.en >= 4_100, "A cobertura de Fate of Cthulhu em inglês encolheu para " + cthulhu.wordCountByLanguage.en + " palavras.");
  assert.ok(space.wordCountByLanguage.pt >= 2_600, "A cobertura de Fate Space Toolkit em português encolheu para " + space.wordCountByLanguage.pt + " palavras.");
  assert.ok(space.wordCountByLanguage.en >= 2_400, "A cobertura de Fate Space Toolkit em inglês encolheu para " + space.wordCountByLanguage.en + " palavras.");
  assert.ok(uprising.wordCountByLanguage.pt >= 3_800, "A cobertura de Uprising em português encolheu para " + uprising.wordCountByLanguage.pt + " palavras.");
  assert.ok(uprising.wordCountByLanguage.en >= 3_600, "A cobertura de Uprising em inglês encolheu para " + uprising.wordCountByLanguage.en + " palavras.");
  assert.ok(tachyon.wordCountByLanguage.pt >= 2_700, "A cobertura de Tachyon Squadron em português encolheu para " + tachyon.wordCountByLanguage.pt + " palavras.");
  assert.ok(tachyon.wordCountByLanguage.en >= 2_500, "A cobertura de Tachyon Squadron em inglês encolheu para " + tachyon.wordCountByLanguage.en + " palavras.");
  assert.ok(wearingTheCape.wordCountByLanguage.pt >= 3_000, "A cobertura de Wearing the Cape em português encolheu para " + wearingTheCape.wordCountByLanguage.pt + " palavras.");
  assert.ok(wearingTheCape.wordCountByLanguage.en >= 2_800, "A cobertura de Wearing the Cape em inglês encolheu para " + wearingTheCape.wordCountByLanguage.en + " palavras.");

  assert.equal(core.sourceRevision, "5ef6f2d0e9ce8ebe235c3da453ce91c00353a528");
  assert.equal(accelerated.sourceRevision, "pdf-sha256:bf74c0f5715a873b6091787a95902aedacf12585208f33e73f082d0237f1d823");
  assert.equal(adversary.sourceRevision, "e572e01df2cf6793f430cbbd3a40998087de9a20");
  assert.equal(system.sourceRevision, "9db805a2e3e32ed78b714f6f4e7083c968a88ab9");
  assert.equal(venture.sourceRevision, "pdf-sha256:4694331b37426bdcfc336be2c75c3bae890ea10aa7f40f2817c92883d6a93f2d");
  assert.equal(horror.sourceRevision, "pdf-sha256:b8b65d4bcb36da78a616d829690a02d33607843b4ccf5129f3da2359726bcd5c");
  assert.equal(cthulhu.sourceRevision, "pdf-sha256:f315c771643aac49472349df317a2f6565c551e3ba5e554b0d226fb61f0cca52");
  assert.equal(space.sourceRevision, "pdf-sha256:e3c938304f50cb97b194e42c745965dc5b24e8a8de8f1e17db7a8902ed9f5a77");
  assert.equal(uprising.sourceRevision, "pdf-sha256:2db0872cf71996939ccd6bdb23be60158ccc3659195a427d3f173ab8dfec67d1");
  assert.equal(tachyon.sourceRevision, "pdf-sha256:5e61a7b90728380f7e85ccf226dc4dc9936d8182f6b88d628e0b2ffd02feda7a");
  assert.equal(wearingTheCape.sourceRevision, "pdf-sha256:3a1d6ab2c58e69e0c64dc037bab196ef345c264347b3917ee058ff4f031c7b59");

  const adversaryText = sourceText(adversary, "pt");
  for (const topic of [
    "Tipos de adversários",
    "Construindo adversários",
    "Usando ambientes",
    "fantasia urbana",
    "cyberpunk",
    "aventura pulp",
    "ação dos anos 1980",
    "ópera espacial",
    "espionagem",
    "super-heróis",
    "pós-apocalipse",
    "romance regencial",
  ]) {
    assert.match(adversaryText, new RegExp(topic, "iu"), "Adversários deixou de cobrir " + topic + ".");
  }

  const ventureText = sourceText(venture, "pt");
  for (const topic of [
    "Venture City",
    "conjunto de poderes",
    "aprimoramentos",
    "sinergia de poder",
    "dano colateral",
    "Supervelocidade",
    "catálogo de poderes",
    "Nothing Ventured",
    "The Nemesis",
  ]) {
    assert.match(ventureText, new RegExp(topic, "iu"), "Venture City deixou de cobrir " + topic + ".");
  }

  const horrorText = sourceText(horror, "pt");
  for (const topic of [
    "consentimento",
    "Cartão X",
    "aspectos de trauma",
    "condições de enfrentamento",
    "relógio da perdição",
    "livro de cicatrizes",
    "abrigo",
    "Coragem",
    "Script Change",
  ]) {
    assert.match(horrorText, new RegExp(topic, "iu"), "Horror Toolkit deixou de cobrir " + topic + ".");
  }

  const cthulhuText = sourceText(cthulhu, "pt");
  for (const topic of [
    "corrupção",
    "trilha de corrupção",
    "tecnologia dos Grandes Antigos",
    "viagem temporal",
    "linha temporal",
    "catalisadores",
    "Grande Cthulhu",
    "Dagon",
    "Shub-Niggurath",
    "Nyarlathotep",
    "Rei de Amarelo",
    "The Stuff That Dreams Are Made Of",
    "The Great Serpent’s Lament",
    "ondas",
    "apocalipse",
  ]) {
    assert.match(cthulhuText, new RegExp(topic, "iu"), "Fate of Cthulhu deixou de cobrir " + topic + ".");
  }

  const spaceText = sourceText(space, "pt");
  for (const topic of [
    "plausibilômetro",
    "caixa-preta",
    "mapa espacial",
    "Astrogação",
    "Psionismo",
    "naves",
    "combate espacial",
    "diagrama vetorial",
    "zona de alcance",
    "alienígenas",
    "The Gods Know Future Things",
    "The High Frontiersmen",
    "Mass Drivers",
    "Millennials",
    "Pax Galactica",
  ]) {
    assert.match(spaceText, new RegExp(topic, "iu"), "Fate Space Toolkit deixou de cobrir " + topic + ".");
  }

  const uprisingText = sourceText(uprising, "pt");
  for (const topic of [
    "Paris Nouveau",
    "la Résistance",
    "la Société",
    "les Citoyens",
    "les Exilés",
    "nove playsheets",
    "Blackmail",
    "meios",
    "fins",
    "Cache",
    "Bank",
    "condições",
    "modificações corporais",
    "Corvid Economics",
    "Warehouse Raid",
    "Corporate Espionage",
    "Peace Offering",
    "Demonstration",
    "Rendition",
    "Revolution",
    "Purge",
  ]) {
    assert.match(uprisingText, new RegExp(topic, "iu"), "Uprising deixou de cobrir " + topic + ".");
  }

  const tachyonText = sourceText(tachyon, "pt");
  for (const topic of [
    "Tachyon Squadron",
    "Draconis",
    "Dominion",
    "callsign",
    "decompression",
    "Gunnery",
    "Pilot",
    "Tactics",
    "Technology",
    "fases",
    "detecção",
    "manobra",
    "telas",
    "dano",
    "quadro de dano",
    "retirada",
    "enxames",
    "Blackfish",
    "Neptune Conveyor",
    "Arcosolari Kalamos",
  ]) {
    assert.match(tachyonText, new RegExp(topic, "iu"), "Tachyon Squadron deixou de cobrir " + topic + ".");
  }

  const wearingTheCapeText = sourceText(wearingTheCape, "pt");
  for (const topic of [
    "Wearing the Cape",
    "Open Game License 1.0a",
    "Identidade de Produto",
    "Dados de Herói",
    "Dados de Oposição",
    "Reagir",
    "Classe de Poder",
    "Vantagem de Classe de Poder",
    "Ajax",
    "Verne",
    "Reserva do Narrador",
    "Concessão de Cena",
    "negociação",
    "Regra de Bronze",
    "organizações",
    "Regra da Coluna",
    "Realismo Super-Heroico",
    "Cape File",
  ]) {
    assert.match(wearingTheCapeText, new RegExp(topic, "iu"), "Wearing the Cape deixou de cobrir " + topic + ".");
  }

  const acceleratedText = sourceText(accelerated, "pt");
  for (const topic of [
    "Fate Acelerado",
    "Dados Fate",
    "Baralho Fate",
    "Abordagens",
    "Cuidadoso",
    "Esperto",
    "Estiloso",
    "Poderoso",
    "Ágil",
    "Sorrateiro",
    "Criar vantagem",
    "Superar",
    "Atacar",
    "Defender",
    "desafios",
    "disputas",
    "conflitos",
    "estresse",
    "consequências",
    "forçar",
    "façanhas",
    "marco menor",
    "marco significativo",
    "marco maior",
    "capangas",
    "referência rápida",
  ]) {
    assert.match(acceleratedText, new RegExp(topic, "iu"), "Fate Acelerado deixou de cobrir " + topic + ".");
  }
});

test("aplica as erratas oficiais do Core ao texto incorporado", () => {
  const text = sourceText(source("fate-core"), "en");
  const portuguese = sourceText(source("fate-core"), "pt");

  assert.match(text, /and the invoke is to their disadvantage/);
  assert.match(text, /Invoking a third party’s aspect is treated just like invoking an unattached situation aspect/);
  assert.match(text, /In the second exchange, Lily turns the tables, rolling well and getting a Great \(\+4\)/);
  assert.match(text, /That gives her three victories to Teran’s one/);
  assert.match(text, /But that’s the next scene/);
  assert.match(text, /told in the span of a few scenarios/);
  assert.match(text, /those stunts modify/);
  assert.match(text, /Armor:2 on any defense roll/);

  assert.doesNotMatch(text, /That gives her four victories to Teran’s one/);
  assert.doesNotMatch(text, /But that’s next scene/);
  assert.doesNotMatch(text, /told in the span of a few sessions/);
  assert.doesNotMatch(text, /those stunt modify/);
  assert.doesNotMatch(text, /Armor:2 vs\. any defense roll/);

  assert.match(portuguese, /e a invocação o prejudicar/);
  assert.match(portuguese, /Invocar o aspecto de uma terceira pessoa funciona como invocar um aspecto de situação/);
  assert.match(portuguese, /contada ao longo de alguns cenários/);
  assert.doesNotMatch(portuguese, /contada ao longo de algumas sessões/);
  assert.doesNotMatch(portuguese, /invocaç(?:ão|ões) grátis/iu);
});

test("aplica a errata viva do System Toolkit ao texto incorporado", () => {
  const text = sourceText(source("fate-system-toolkit"), "en");
  const portuguese = sourceText(source("fate-system-toolkit"), "pt");

  assert.match(text, /Wound-Eating Beetles Summoning Difficulty: Average \(\+1\)/);
  assert.match(text, /Lightning Worms Summoning Difficulty: Fair \(\+2\)/);
  assert.match(text, /Lazarus Eyes Summoning Difficulty: Fair \(\+2\)/);
  assert.match(text, /Freet Summoning Difficulty: Good \(\+3\)/);
  assert.match(text, /Hard to Pin Down: Take a \+2 on any Operations roll made to retreat/);
  assert.match(text, /help you think about what magic can’t do/);
  assert.match(text, /don’t need to believe any more/);
  assert.match(text, /multiple flavors of magic/);

  assert.doesNotMatch(text, /help you think about is what magic can’t do/);
  assert.doesNotMatch(text, /don’t need to believe anymore/);
  assert.doesNotMatch(text, /multiple favors of magic/);
  assert.doesNotMatch(text, /Hard to Pin Down: Take a \+2 on any Overcome roll/);

  assert.match(portuguese, /Besouros Devoradores de Feridas Dificuldade de Invocação: Regular \(\+1\)/);
  assert.match(portuguese, /Vermes Trovejantes Dificuldade de Invocação: Razoável \(\+2\)/);
  assert.match(portuguese, /Olhos de Lázaro Dificuldade de Invocação: Razoável \(\+2\)/);
  assert.match(portuguese, /Freet Dificuldade de Invocação: Boa \(\+3\)/);
  assert.match(portuguese, /Difícil de Cercar: Ganhe \+2 em qualquer rolagem de Operações/);
  assert.doesNotMatch(portuguese, /Difícil de Cercar: Ganhe \+2 em qualquer rolagem de superar/);
  assert.doesNotMatch(portuguese, /imersão ou ou jatos fortes/);
});

test("usa um vocabulário canônico bilíngue e mantém variações apenas como aliases", () => {
  const ids = new Set(terminology.terms.map((term) => term.id));
  for (const id of ["game-master", "player-character", "fate-point", "free-invoke", "skill", "stunt", "taken-out", "bronze-rule", "fate-condensed", "fate-core", "fate-accelerated", "approach", "careful", "clever", "flashy", "forceful", "quick", "sneaky", "ladder", "fate-die", "deck-of-fate", "milestone", "minor-milestone", "significant-milestone", "major-milestone", "mook", "fate-system-toolkit", "fate-adversary-toolkit", "venture-city", "fate-horror-toolkit", "fate-of-cthulhu", "fate-space-toolkit", "uprising", "tachyon-squadron", "dystopian-universe", "paris-nouveau", "la-resistance", "la-societe", "citoyen", "exile", "natural", "ex-cit", "playsheet", "means", "ends", "suited-means", "risky-means", "condition", "blowback", "cache", "bank", "budget", "prep-scene", "debrief", "advancement-point", "advancement-track", "secret-card", "accusation", "double-agent", "augmentation", "neural-casing", "augmented-reality", "virtual-reality", "le-treillis", "l-aerie", "la-cave", "gendarmes", "secspec", "transgression", "complication", "discovery", "resistance-goal", "government-goal", "corporate-sponsor", "ape", "kilo-joule", "elite", "french-terms", "tachyon-squadron", "draconis-volunteer-group", "stellar-republic", "dominion-of-unity", "fighter-pilot", "callsign", "decompression", "spacefaring-skill", "gunnery", "pilot", "tactics", "technology", "engagement", "detection-phase", "maneuver-phase", "action-phase", "end-of-round", "maneuver-chart", "flight", "swarm", "strike-element", "payload", "fighter-screen", "shield", "simple-damage", "damage-chart", "bug-out", "dice-maximization", "dice-minimization", "modular-equipment", "ace", "bandit", "bogey", "wingman", "victory", "chandrasekhar-drive", "jump-point", "draconis", "asami", "takahashi", "kalamos", "othonoi", "kripka-cluster", "blackfish", "gator", "goblin", "current-issue", "operational-objective", "campaign-arc", "superpower", "power-suite", "enhancement", "power-synergy", "power-theme", "special-effect", "drawback", "collateral-damage", "legacy-aspect", "trauma-aspect", "coping-condition", "doom-clock", "heroic-sacrifice", "failure-with-style", "x-card", "corruption", "corruption-clock", "corrupted-aspect", "corruption-stunt", "great-old-one", "timeline", "timeline-aspect", "timeline-catalyst", "timeline-track", "ripple", "paradox", "ritual", "spell", "eldritch-technology", "backlash", "plausibilometer", "black-box", "space-map", "astrogation", "bureaucracy", "command", "encounter", "planetary-survival", "psionics", "spacehand", "tech-level", "tool-class", "alien-ability", "spacecraft", "space-combat", "vector-diagram", "range-zone", "battlestation", "hyperspace", "warp-drive", "wormhole", "microgravity", "starport", "blackbelting", "mass-driver", "heat-sink", "galactic-citizen", "galactic-noble", "client-status", "outlaw-status", "psychic-alien", "wearing-the-cape", "breakthrough", "power-aspect", "hero-aspect", "background-aspect", "character-rating", "attribute", "resource-rating", "hero-die", "opposition-die", "passive-opposition", "active-opposition", "react-action", "power-class", "power-class-advantage", "starting-fate-point", "attribute-bonus", "power-skill", "weapon-rating", "armor-rating", "game-master-fate-pool", "threat-level", "scene-concede", "action-lens", "negotiation", "resource-stress", "resource-conflict", "scene-extra", "supporting-character", "main-character", "organization", "superheroic-realism", "column-rule", "world-advancement", "cape-file"]) {
    assert.ok(ids.has(id), "O vocabulário perdeu " + id + ".");
  }

  const byId = Object.fromEntries(terminology.terms.map((term) => [term.id, term]));
  assert.equal(byId["game-master"].canonical.pt, "Narrador");
  assert.equal(byId["free-invoke"].canonical.pt, "invocação gratuita");
  assert.equal(byId.skill.canonical.pt, "perícia");
  assert.equal(byId["taken-out"].canonical.pt, "tirado de ação");
  assert.equal(byId["bronze-rule"].canonical.en, "Fate Fractal");
  assert.ok(byId["fate-core"].aliases.pt.includes("Fate Sistema Básico"));
  assert.equal(byId["wearing-the-cape"].canonical.en, "Wearing the Cape: The Roleplaying Game");
  assert.equal(byId["game-master-fate-pool"].canonical.pt, "Reserva de Destino do Narrador");
  assert.equal(byId["power-class"].canonical.pt, "Classe de Poder");
  assert.equal(byId.approach.canonical.pt, "Abordagem");
  assert.equal(byId["fate-accelerated"].canonical.en, "Fate Accelerated");

  const allPortuguese = data.sources.map((item) => sourceText(item, "pt")).join(" ");
  assert.doesNotMatch(allPortuguese, /invocaç(?:ão|ões) grátis/iu);
  assert.doesNotMatch(allPortuguese, /Mestre do Jogo/iu);
  assert.doesNotMatch(allPortuguese, /aparelho/iu);
});

test("mantém busca, compartilhamento e navegação móvel em todas as fontes", async () => {
  const [library, styles] = await Promise.all([
    readFile(new URL("../components/rules-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(library, /Um livro principal\. Expansões quando forem úteis\./);
  assert.match(library, /sources\.flatMap\(\(source\) => source\.chapters\.map/);
  assert.match(library, /document\.searchable\.includes\(normalizedQuery\)/);
  assert.match(library, /React\.useDeferredValue\(query\)/);
  assert.match(library, /terminologyAliases\(bilingualText\)/);
  assert.match(library, /normalizeSearch\(searchableText\)/);
  assert.match(library, /NativeSelect/);
  assert.match(library, /rules:" \+ currentSource\.id \+ ":" \+ current\.id/);
  assert.match(library, /const isLegacy = !sources\.some\(\(item\) => item\.id === parts\[1\]\)/);
  assert.match(library, /source\.tags\.map/);
  assert.match(library, /<time dateTime=\{String\(source\.year\)\}>\{source\.year\}<\/time>/);
  assert.match(library, /className="rule-source-catalog-header"/);
  assert.match(library, /className="rule-source-catalog-principle"/);
  assert.match(library, /current\.html\[language\]/);
  assert.match(library, /localized\(currentSource\.referenceUrl, language\)/);
  assert.match(library, /<QuickReference language=\{language\}/);
  assert.doesNotMatch(library, /Texto original em inglês/);
  assert.doesNotMatch(library, /contentLanguage/);

  assert.match(styles, /\.chapter-mobile-picker \{ display: none; \}/);
  assert.match(styles, /\.chapter-mobile-picker \{ display: grid;/);
  assert.match(styles, /\.chapter-nav \{ display: none; \}/);
  assert.match(styles, /\.rule-source-list \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /\.rule-source-catalog-header \{ display: grid; grid-template-columns: minmax\(320px, 0\.9fr\) minmax\(360px, 1\.1fr\);/);
  assert.match(styles, /\.rule-source-catalog-principle \{[^}]*border-left: 2px solid/);
  assert.match(styles, /\.rule-source-choice-top \{ display: grid; grid-template-columns: minmax\(0, 1fr\) max-content;/);
  assert.match(styles, /\.rule-source-choice-top > time \{[^}]*white-space: nowrap;/);
  assert.doesNotMatch(styles, /\.chapter-nav \{ position: static; grid-auto-flow: column;/);
});
