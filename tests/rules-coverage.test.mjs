import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const chapters = JSON.parse(await readFile(new URL("../content/rules.json", import.meta.url), "utf8"));

const chapterIds = [
  "introducao",
  "comecando",
  "agindo",
  "aspectos",
  "cenas",
  "avanco",
  "narrador",
  "opcionais",
  "versao",
];

const requiredTopics = {
  introducao: ["Dados Fate", "mudanças do Fate Básico"],
  comecando: ["Defina Seu Cenário", "Aspectos", "Perícias", "Recarga", "Façanhas", "Estresse e Consequências"],
  agindo: ["Dificuldade e Oposição", "Modificando os Dados", "Resoluções", "Superar", "Criar Vantagem", "Atacar", "Defender"],
  aspectos: ["Aspectos são sempre verdades", "Pontos de Destino", "Invocações", "Invocações Hostis", "Forçando"],
  cenas: ["Zonas", "Ordem de turnos", "Trabalho em Equipe", "Desafios", "Disputas", "Conflitos", "Recebendo dano", "Concedendo"],
  avanco: ["Marcos", "Progressos", "Aprimorando os níveis das perícias", "Sessões e Arcos"],
  narrador: ["Definindo Dificuldade e Oposição", "Personagens do Narrador", "Seus pontos de destino", "Ferramentas de Segurança"],
  opcionais: ["Condições", "Mudando a lista de perícias", "Criação de Personagem Durante o Jogo", "Contagem Regressiva", "Consequências Extremas", "Disputas mais rápidas", "Defesa Total", "Obstáculos", "Escala", "Tensões de Tempo", "Grande Mal", "Múltiplos Alvos", "Armas e Armaduras"],
  versao: ["O que veio antes", "Licenciamento"],
};

function textFromHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39|apos);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("mantém integral o material de Fate Condensado incorporado ao site", () => {
  assert.deepEqual(chapters.map((chapter) => chapter.id), chapterIds);

  const portugueseWords = chapters.reduce((total, chapter) => total + textFromHtml(chapter.html.pt).split(/\s+/).length, 0);
  const englishWords = chapters.reduce((total, chapter) => total + textFromHtml(chapter.html.en).split(/\s+/).length, 0);

  assert.ok(portugueseWords >= 23_000, `O texto em português encolheu para ${portugueseWords} palavras.`);
  assert.ok(englishWords >= 21_000, `O texto em inglês encolheu para ${englishWords} palavras.`);

  for (const chapter of chapters) {
    assert.ok(chapter.slugs.pt && chapter.slugs.en, `${chapter.id} perdeu um endereço de capítulo.`);
    assert.ok(chapter.title.pt && chapter.title.en, `${chapter.id} perdeu um título.`);
    assert.ok(chapter.html.pt.length > 1_000, `${chapter.id} perdeu conteúdo em português.`);
    assert.ok(chapter.html.en.length > 1_000, `${chapter.id} perdeu conteúdo em inglês.`);

    for (const topic of requiredTopics[chapter.id]) {
      assert.match(textFromHtml(chapter.html.pt), new RegExp(topic, "iu"), `${chapter.title.pt} deixou de cobrir “${topic}”.`);
    }
  }
});

test("mantém acessíveis as opções oficiais que derivam do capítulo opcional", async () => {
  const tableConfig = await readFile(new URL("../lib/table-config.ts", import.meta.url), "utf8");
  const settings = await readFile(new URL("../components/table-settings.tsx", import.meta.url), "utf8");
  const rulesLibrary = await readFile(new URL("../components/rules-library.tsx", import.meta.url), "utf8");

  for (const title of [
    "Contagem regressiva",
    "Consequências extremas",
    "Disputas mais rápidas",
    "Defesa total",
    "Obstáculos",
    "Escala",
    "Tensões de tempo",
    "Grande Mal",
    "Múltiplos alvos",
    "Armas e armaduras",
  ]) {
    assert.match(tableConfig, new RegExp(title, "iu"), `A opção “${title}” não está configurável.`);
  }

  for (const value of ["consequences", "conditions", "split-conditions"]) {
    assert.match(settings, new RegExp(`value=["']${value}["']`), `O modo de dano ${value} não está acessível.`);
  }

  assert.match(settings, /Começar uma Ficha durante o jogo/);
  assert.match(settings, /Ler o capítulo completo/);
  assert.match(rulesLibrary, /chapters\.map/);
  assert.match(rulesLibrary, /chapter\.html\[language\]/);
});
