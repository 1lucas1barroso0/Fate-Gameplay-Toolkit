import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(projectRoot, "content", "sources");
const outputPath = join(projectRoot, "content", "expansions.json");

const localized = (pt, en) => ({ pt, en });

function plainText(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitAtH1(html) {
  const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  return headings.map((heading, index) => ({
    title: plainText(heading[1]),
    html: html.slice(heading.index, headings[index + 1]?.index ?? html.length),
  }));
}

function applyOfficialErrata(sourceId, html) {
  let corrected = html;

  if (sourceId === "fate-core") {
    corrected = corrected
      .replace(
        "If the aspect you invoke is on someone else’s character sheet, including situation aspects attached to them, you give them the fate point you spent.",
        "If the aspect you invoke is on someone else’s character sheet, including situation aspects attached to them, and the invoke is to their disadvantage, you give them the fate point you spent. (Invoking a third party’s aspect is treated just like invoking an unattached situation aspect.)",
      )
      .replaceAll("get you get", "get you")
      .replaceAll("But that’s next scene.", "But that’s the next scene.")
      .replace(
        "In the second exchange, Lily turns the tables, rolling exceptionally well and getting a Superb (+5), whereas Amanda only gets a Fair (+2) for Teran. That’s a success with style, so Lily picks up two victories and the lead.",
        "In the second exchange, Lily turns the tables, rolling well and getting a Great (+4), whereas Amanda only gets a Fair (+2) for Teran. That’s a success, so Lily picks up one victory.",
      )
      .replace(
        "That gives her four victories to Teran’s one, and she wins the exchange and the contest!",
        "That gives her three victories to Teran’s one, and she wins the exchange and the contest!",
      )
      .replaceAll("told in the span of a few sessions", "told in the span of a few scenarios")
      .replaceAll("those stunt modify", "those stunts modify")
      .replaceAll("Armor:2 vs. any defense roll", "Armor:2 on any defense roll")
      .replaceAll("Teamwork: +2 to another character’s roll versus relevant passive opposition", "Teamwork: +2 to another character’s roll");
  }

  if (sourceId === "fate-system-toolkit") {
    corrected = corrected
      .replace(
        '<span class="Strong">Summoning Difficulty:</span> Fair (+1)',
        '<span class="Strong">Summoning Difficulty:</span> Average (+1)',
      )
      .replace(
        '<span class="Strong">Summoning Difficulty:</span> Good (+2)',
        '<span class="Strong">Summoning Difficulty:</span> Fair (+2)',
      )
      .replace(
        '<span class="Strong">Summoning Difficulty:</span> Good (+2)',
        '<span class="Strong">Summoning Difficulty:</span> Fair (+2)',
      )
      .replace(
        '<span class="Strong">Summoning Difficulty:</span> Great (+3)',
        '<span class="Strong">Summoning Difficulty:</span> Good (+3)',
      )
      .replaceAll("Take a +2 on any Overcome roll made to retreat", "Take a +2 on any Operations roll made to retreat")
      .replaceAll("help you think about is what magic can’t do", "help you think about what magic can’t do")
      .replaceAll("don’t need to believe anymore", "don’t need to believe any more")
      .replaceAll("multiple favors of magic", "multiple flavors of magic");
  }

  if (sourceId === "fate-core-pt") {
    corrected = corrected
      .replace(
        "Se o aspecto que você invocar estiver na ficha de outro personagem, incluindo aspectos de situação que estejam ligados a ele, o ponto de destino gasto deve ser entregue ao jogador desse personagem.",
        "Se o aspecto invocado estiver na ficha de outro personagem, incluindo aspectos de situação ligados a ele, e a invocação o prejudicar, entregue ao jogador desse personagem o ponto de destino gasto. Invocar o aspecto de uma terceira pessoa funciona como invocar um aspecto de situação que não esteja ligado a ninguém.",
      )
      .replace(
        "contada ao longo de algumas sessões (em geral, algo em torno de duas a cinco)",
        "contada ao longo de alguns cenários (em geral, algo em torno de dois a cinco)",
      );
  }

  if (sourceId === "fate-system-toolkit-pt") {
    corrected = corrected
      .replace(
        "Difícil de Cercar: Ganhe +2 em qualquer rolagem de superar para recuar de uma zona de combate.",
        "Difícil de Cercar: Ganhe +2 em qualquer rolagem de Operações para recuar de uma zona de combate.",
      )
      .replace(
        "Ganhe +2 em qualquer rolagem de superar para recuar de uma zona de combate.",
        "Ganhe +2 em qualquer rolagem de Operações para recuar de uma zona de combate.",
      )
      .replaceAll("imersão ou ou jatos fortes", "imersão ou jatos fortes");
  }

  if (sourceId.endsWith("-pt")) {
    corrected = corrected
      .replaceAll("Invocações Grátis", "Invocações Gratuitas")
      .replaceAll("Invocações grátis", "Invocações Gratuitas")
      .replaceAll("invocações grátis", "invocações gratuitas")
      .replaceAll("Invocação Grátis", "Invocação Gratuita")
      .replaceAll("Invocação grátis", "Invocação Gratuita")
      .replaceAll("invocação grátis", "invocação gratuita")
      .replaceAll("Aparelhos", "Dispositivos")
      .replaceAll("aparelhos", "dispositivos")
      .replaceAll("Aparelho", "Dispositivo")
      .replaceAll("aparelho", "dispositivo");
  }

  return corrected;
}

const allowedTags = new Set([
  "article", "aside", "blockquote", "br", "caption", "code", "dd", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li",
  "mark", "ol", "p", "pre", "small", "strong", "sub", "sup", "table", "tbody", "td",
  "tfoot", "th", "thead", "tr", "ul",
]);

function cleanSourceHtml(sourceId, html) {
  let cleaned = applyOfficialErrata(sourceId, html)
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/\[Insert your character sheet graphic here\]/gi, "<p>Character sheet diagram: see the official book layout.</p>")
    .replace(/\[Your character sheet image here\]/gi, "<p>Character sheet diagram: see the official book layout.</p>")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a>/gi, "")
    .replace(/<span\b[^>]*>/gi, "")
    .replace(/<\/span>/gi, "");

  cleaned = cleaned
    .replace(/<([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
      const normalized = tag.toLowerCase();
      if (!allowedTags.has(normalized)) return "";
      return "<" + normalized + ">";
    })
    .replace(/<\/([a-z][a-z0-9]*)>/gi, (match, tag) => {
      const normalized = tag.toLowerCase();
      if (!allowedTags.has(normalized) || normalized === "br" || normalized === "hr") return "";
      return "</" + normalized + ">";
    })
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (sourceId === "fate-adversary-toolkit") {
    cleaned = cleaned
      .replace(/<p>There are four types of enemies: threats\s*\(\s*<\/p>/i, "<p>There are four types of enemies: threats, hitters, bosses, and fillers.</p>")
      .replace(/<p>There are three types of obstacles: hazards\s*\(\s*<\/p>/i, "<p>There are three types of obstacles: hazards, blocks, and distractions.</p>")
      .replace(/<p>There are three types of constraints: countdowns\s*\(\s*<\/p>/i, "<p>There are three types of constraints: countdowns, limitations, and resistances.</p>")
      .replace(/<p>You can find some examples of countdowns attached to enemies and obstacles starting on\s*<\/p>/i, "<p>You can find examples of countdowns attached to enemies and obstacles below.</p>")
      .replace(/<p>You can also use countdowns to add verisimilitude to encounters, as with the forward scout\s*\(\s*<\/p>/i, "<p>You can also use countdowns to add verisimilitude to encounters, as with the forward scout above.</p>")
      .replace(/<p>You don’t have to confine a countdown to a single scene\. You could attach a countdown to your main villain, as with Baron von Darkness\s*\(\s*<\/p>/i, "<p>You don’t have to confine a countdown to a single scene. You could attach a countdown to your main villain, as with Baron von Darkness above.</p>")
      .replaceAll("obst acles", "obstacles")
      .replaceAll("expecta tions", "expectations")
      .replaceAll("limitation a spect", "limitation aspect");
  }

  return cleaned;
}

function buildSrdChapters(sourceId, rawHtml, titleMap, options = {}) {
  const sections = splitAtH1(rawHtml).slice(options.skip ?? 0);
  const language = options.language ?? "en";

  return sections.map((section, index) => {
    const normalizedTitle = section.title.replace(/\s+/g, " ").trim();
    const title = titleMap[normalizedTitle] ?? localized(normalizedTitle, normalizedTitle);
    const withoutRepeatedHeading = section.html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "");
    const html = cleanSourceHtml(sourceId, withoutRepeatedHeading);

    const localizedHtml = localized("", "");
    localizedHtml[language] = html;

    return {
      id: slugify(normalizedTitle) || "capitulo-" + String(index + 1),
      title,
      label: localized("Capítulo " + String(index + 1).padStart(2, "0"), "Chapter " + String(index + 1).padStart(2, "0")),
      mode: "full-srd",
      html: localizedHtml,
    };
  });
}

function editorialChapter(id, pt, en, html, label, mode = "editorial-summary") {
  const labelEn = label.replace(/^Páginas/, "Pages").replace(/^Página/, "Page");
  return {
    id,
    title: localized(pt, en),
    label: localized(label, labelEn),
    mode,
    html: localized(html, ""),
  };
}

function stripPageNavigation(html) {
  const lastList = html.toLocaleLowerCase("pt-BR").lastIndexOf("<ul>");
  if (lastList < 0) return html;
  const tail = html.slice(lastList);
  if (!/[«»]/.test(tail) || !/<\/ul>\s*$/i.test(tail)) return html;
  return html.slice(0, lastList).replace(/<hr>\s*$/i, "");
}

function buildPortugueseGroup(sourceId, group) {
  const joined = group.pages.map((page, index) => {
    let html = stripPageNavigation(page.html);
    if (index === 0) html = html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "");
    return html;
  }).join("\n");
  return cleanSourceHtml(sourceId + "-pt", joined);
}

function attachLanguage(chapters, language, htmlById) {
  return chapters.map((chapter) => ({
    ...chapter,
    html: {
      ...chapter.html,
      [language]: htmlById.get(chapter.id) ?? chapter.html[language],
    },
  }));
}

const guideChapters = [
  editorialChapter(
    "mapa-das-versoes",
    "Mapa das versões",
    "Map of Fate versions",
    [
      "<p>O guia oficial organiza a história do Fate sem tratar suas versões como uma fila em que a mais nova apaga as anteriores. Fate 1 e Fate 2 nasceram das adaptações de Fudge por Rob Donoghue e Fred Hicks; Fate 3 ganhou forma comercial em jogos como Spirit of the Century e The Dresden Files RPG.</p>",
      "<p>Em 2013, Fate Core reescreveu o sistema, consolidou as quatro ações e abriu uma linha ampla de livros. Fate Accelerated condensou essa base usando Abordagens. Fate Condensado, de 2020, voltou à estrutura de perícias do Core, comprimiu a apresentação e incorporou pequenos refinamentos produzidos por anos de experiência.</p>",
      "<p>Neste site, isso tem uma consequência simples: <strong>Fate Condensado é a regra principal</strong>. Fate Core explica mais; os Toolkits ampliam possibilidades; nenhum deles substitui silenciosamente Fate Condensado.</p>",
    ].join(""),
    "Página 1",
    "official-guide-summary",
  ),
  editorialChapter(
    "core-acelerado-condensado",
    "Core, Acelerado e Condensado",
    "Core, Accelerated, and Condensed",
    [
      "<p>As três apresentações pertencem à mesma família, mas ajudam mesas diferentes.</p>",
      "<table><thead><tr><th>Versão</th><th>O que prioriza</th><th>Estrutura</th><th>Use quando</th></tr></thead><tbody>",
      "<tr><td>Fate Core</td><td>Exemplos, explicações e engrenagens do sistema</td><td>18 perícias, duas trilhas de estresse e tratamento detalhado</td><td>Você quer entender o porquê das regras ou projetar mudanças</td></tr>",
      "<tr><td>Fate Accelerated</td><td>Velocidade e personagens definidos pela maneira de agir</td><td>6 Abordagens e apresentação mínima</td><td>Você quer começar depressa ou prefere construções muito leves</td></tr>",
      "<tr><td>Fate Condensado</td><td>Clareza, consulta e a forma moderna da base Fate Core</td><td>19 perícias, caixas de estresse de um ponto e refinamentos atuais</td><td>Você quer a referência principal deste site e a versão mais recente da linha Fate Core</td></tr>",
      "</tbody></table>",
      "<p>As diferenças não autorizam importar uma regra antiga sobre a correspondente regra atual. Quando Fate Condensado já resolveu o assunto, Fate Condensado prevalece.</p>",
    ].join(""),
    "Página 2",
    "official-guide-summary",
  ),
  editorialChapter(
    "licenciamento",
    "Licenciamento e criação",
    "Licensing and creation",
    [
      "<p>Fate Core, Fate Accelerated, Fate Condensado e Fate System Toolkit possuem SRDs oficiais abertos. A Evil Hat oferece duas rotas: Creative Commons Attribution (CC BY) e Open Game License (OGL). Em ambos os casos, é necessário seguir o texto e a atribuição da licença escolhida.</p>",
      "<p>A licença CC BY permite copiar e adaptar o SRD com crédito adequado e não obriga que a obra derivada use a mesma licença. A Evil Hat também disponibiliza, sob condições próprias, o selo Powered by Fate e a fonte de glifos das quatro ações.</p>",
      "<p>Como páginas e endereços mudam, a referência vigente é sempre a área de licenciamento oficial da Evil Hat, ligada ao final deste capítulo.</p>",
    ].join(""),
    "Página 3",
    "official-guide-summary",
  ),
  editorialChapter(
    "para-quem-adapta",
    "Para quem adapta o sistema",
    "For system hackers",
    [
      "<p>Quem quer criar ou adaptar pode começar pelo Fate Core quando precisa das engrenagens explicadas e de muitos exemplos, ou pelo Fate Condensado quando quer a regra inteira em forma direta, com os refinamentos mais recentes.</p>",
      "<p>O System Toolkit funciona como uma bancada de peças: aspectos, perícias, façanhas, escalas, magia e subsistemas. O Adversary Toolkit concentra-se em oposição, ambientes e ritmo. Eles oferecem caminhos de projeto, não um pacote que se liga sozinho.</p>",
      "<p>A pergunta orientadora da Mesa continua humana: isto ajuda o jogo que estamos fazendo agora? Se não ajuda, fica apenas como referência.</p>",
    ].join(""),
    "Página 4",
    "official-guide-summary",
  ),
  editorialChapter(
    "para-buscar-inspiracao",
    "Para buscar inspiração",
    "For inspiration",
    [
      "<p>Fate Core e Fate Condensado sustentam qualquer cenário criado pela Mesa. Fate Accelerated é uma alternativa mais leve, baseada em Abordagens. Depois da base, livros de cenário mostram como as mesmas ideias mudam de tom: poderes, aventura pulp, pilotos espaciais, fantasia urbana, horror de ação e rebelião distópica.</p>",
      "<p>O guia recomenda tratar esses livros como inspiração aplicada. Uma regra de cenário só entra quando a ficção da Mesa pede por ela; sua existência em outro Fate não altera o funcionamento padrão de Fate Condensado.</p>",
    ].join(""),
    "Página 5",
    "official-guide-summary",
  ),
  editorialChapter(
    "um-so-livro",
    "Quando um livro basta",
    "When one book is enough",
    [
      "<p>Para uma obra autônoma, o guia aponta jogos que já unem sistema e cenário, como Dresden Files Accelerated, Fate of Cthulhu e Uprising. Para um cenário próprio, Fate Condensado, Fate Accelerated e Fate Core também funcionam sozinhos.</p>",
      "<p>Neste site, o caminho de menor atrito é Fate Condensado: ele já contém a base completa. As expansões ficam ao alcance sem transformar leitura adicional em requisito para jogar.</p>",
    ].join(""),
    "Página 6",
    "official-guide-summary",
  ),
  editorialChapter(
    "para-uma-sessao",
    "Para uma sessão única",
    "For a one-shot",
    [
      "<p>Fate Condensado e Fate Accelerated são os pontos de partida mais rápidos para uma sessão única. Fate Condensado mantém perícias e a forma moderna do Fate Core; Fate Accelerated reduz ainda mais a preparação com Abordagens.</p>",
      "<p>Quando a Mesa quer um cenário pronto, a linha Worlds of Adventure oferece propostas curtas e variadas. A regra prática permanece: escolha uma base, prepare somente o que a sessão vai usar e deixe o restante como possibilidade.</p>",
    ].join(""),
    "Página 7",
    "official-guide-summary",
  ),
];

const guideEnglishById = new Map([
  [
    "mapa-das-versoes",
    [
      "<p>The official guide organizes Fate’s history without treating its versions as a queue in which each new release erases the earlier ones. Fate 1 and Fate 2 grew out of Rob Donoghue and Fred Hicks’s adaptations of Fudge; Fate 3 took commercial form in games such as Spirit of the Century and The Dresden Files RPG.</p>",
      "<p>In 2013, Fate Core rewrote the system, consolidated the four actions, and opened a broad line of books. Fate Accelerated compressed that foundation by using Approaches. Fate Condensed, released in 2020, returned to Core’s skill structure, compressed its presentation, and incorporated small refinements produced by years of experience.</p>",
      "<p>On this site, the consequence is simple: <strong>Fate Condensed is the principal ruleset</strong>. Fate Core explains more; the Toolkits expand the possibilities; none of them silently replaces Fate Condensed.</p>",
    ].join(""),
  ],
  [
    "core-acelerado-condensado",
    [
      "<p>The three presentations belong to the same family, but they serve different tables.</p>",
      "<table><thead><tr><th>Version</th><th>Priority</th><th>Structure</th><th>Use it when</th></tr></thead><tbody>",
      "<tr><td>Fate Core</td><td>Examples, explanations, and the system’s inner workings</td><td>18 skills, two stress tracks, and detailed treatment</td><td>You want to understand why the rules work or design changes</td></tr>",
      "<tr><td>Fate Accelerated</td><td>Speed and characters defined by how they act</td><td>6 Approaches and a minimal presentation</td><td>You want to start quickly or prefer very light builds</td></tr>",
      "<tr><td>Fate Condensed</td><td>Clarity, reference, and the modern form of the Core foundation</td><td>19 skills, one-point stress boxes, and current refinements</td><td>You want this site’s principal reference and the latest version of the Core line</td></tr>",
      "</tbody></table>",
      "<p>These differences do not justify importing an older rule over its current counterpart. When Fate Condensed has already settled the matter, Fate Condensed prevails.</p>",
    ].join(""),
  ],
  [
    "licenciamento",
    [
      "<p>Fate Core, Fate Accelerated, Fate Condensed, and the Fate System Toolkit have official open SRDs. Evil Hat offers two routes: Creative Commons Attribution (CC BY) and the Open Game License (OGL). In either case, follow the text and attribution requirements of the license you choose.</p>",
      "<p>CC BY allows you to copy and adapt the SRD with appropriate credit and does not require the derivative work to use the same license. Under its own conditions, Evil Hat also makes the Powered by Fate logo and the four-action glyph font available.</p>",
      "<p>Because pages and addresses can change, the current reference is always Evil Hat’s official licensing area, linked at the end of this chapter.</p>",
    ].join(""),
  ],
  [
    "para-quem-adapta",
    [
      "<p>Designers and system hackers can begin with Fate Core when they need detailed explanations and many examples, or with Fate Condensed when they want the entire ruleset in a direct form that includes the latest refinements.</p>",
      "<p>The System Toolkit is a workbench of parts: aspects, skills, stunts, scale, magic, and subsystems. The Adversary Toolkit focuses on opposition, environments, and pacing. They offer design paths, not a package that turns itself on.</p>",
      "<p>The table’s guiding question remains human: does this help the game we are playing now? If it does not, it remains a reference.</p>",
    ].join(""),
  ],
  [
    "para-buscar-inspiracao",
    [
      "<p>Fate Core and Fate Condensed support any setting created by the table. Fate Accelerated is a lighter alternative built around Approaches. Beyond the foundation, setting books show how the same ideas change tone: powers, pulp adventure, space pilots, urban fantasy, action horror, and dystopian rebellion.</p>",
      "<p>The guide recommends treating those books as applied inspiration. A setting rule enters play only when the table’s fiction calls for it; its existence in another Fate game does not change Fate Condensed’s default operation.</p>",
    ].join(""),
  ],
  [
    "um-so-livro",
    [
      "<p>For a self-contained work, the guide points to games that already combine system and setting, such as Dresden Files Accelerated, Fate of Cthulhu, and Uprising. Fate Condensed, Fate Accelerated, and Fate Core also work on their own for an original setting.</p>",
      "<p>On this site, Fate Condensed is the lowest-friction path: it already contains the complete foundation. Expansions remain within reach without turning additional reading into a requirement for play.</p>",
    ].join(""),
  ],
  [
    "para-uma-sessao",
    [
      "<p>Fate Condensed and Fate Accelerated are the quickest starting points for a one-shot. Fate Condensed keeps skills and the modern form of Fate Core; Fate Accelerated reduces preparation further through Approaches.</p>",
      "<p>When the table wants a ready-made setting, the Worlds of Adventure line offers short and varied premises. The practical rule remains the same: choose one foundation, prepare only what the session will use, and leave everything else as a possibility.</p>",
    ].join(""),
  ],
]);

const bilingualGuideChapters = attachLanguage(guideChapters, "en", guideEnglishById);

function gallerySummary(id, pt, en, pages, introduction, elements, use) {
  const list = elements.map((element) => "<li>" + element + "</li>").join("");
  return editorialChapter(
    id,
    pt,
    en,
    "<aside><strong>Mapa do livro</strong><p>Esta seção cobre a função de todos os exemplos da galeria sem reproduzir as páginas reservadas que não integram o SRD aberto.</p></aside><p>" + introduction + "</p><h3>Peças apresentadas</h3><ul>" + list + "</ul><h3>Como aproveitar</h3><p>" + use + "</p>",
    pages,
    "book-map",
  );
}

function bookMapHtml(language, introduction, sections, use) {
  const list = sections.map((section) => "<li>" + section + "</li>").join("");
  if (language === "pt") {
    return "<aside><strong>Mapa do livro</strong><p>Esta é uma síntese editorial bilíngue das seções e ferramentas da edição fornecida. O texto protegido e o layout original não são reproduzidos; consulte a referência oficial para a obra completa.</p></aside><p>" + introduction + "</p><h3>Seções e ferramentas</h3><ul>" + list + "</ul><h3>Como aproveitar</h3><p>" + use + "</p>";
  }
  return "<aside><strong>Book map</strong><p>This is a bilingual editorial summary of the supplied edition’s sections and tools. Protected text and the original layout are not reproduced; use the official reference for the complete work.</p></aside><p>" + introduction + "</p><h3>Sections and tools</h3><ul>" + list + "</ul><h3>How to use it</h3><p>" + use + "</p>";
}

function bookMapChapter({ id, ptTitle, enTitle, pages, ptIntro, ptSections, ptUse, enIntro, enSections, enUse }) {
  const pagesEn = pages.replace(/^Páginas/, "Pages").replace(/^Página/, "Page");
  return {
    id,
    title: localized(ptTitle, enTitle),
    label: localized(pages, pagesEn),
    mode: "book-map",
    html: localized(
      bookMapHtml("pt", ptIntro, ptSections, ptUse),
      bookMapHtml("en", enIntro, enSections, enUse),
    ),
  };
}

const adversaryGallery = [
  gallerySummary(
    "galeria-fantasia",
    "Galeria: fantasia",
    "Gallery: fantasy",
    "Páginas 36–43",
    "Uma invasão de dragonfolk transforma uma cidade em campo de decisão: enfrentar o comando, proteger habitantes e impedir que o caos avance exigem prioridades diferentes.",
    [
      "Darra, paladina de Barathe, como chefe; tenentes dracônicos como ameaças; e o exército dragonfolk como figurantes.",
      "Cidades em caos como perigo, além de distrações e contagens regressivas ligadas a civis e à defesa de Riverwall.",
      "Ganchos para ligar os protagonistas à cidade, ajustar a duração e trocar o tom sem perder a estrutura adversária.",
    ],
    "Use o conjunto para uma frente militar com decisões visíveis. A força principal mantém pressão, enquanto perigos e distrações impedem que vencer o combate seja a única pergunta da cena.",
  ),
  gallerySummary(
    "galeria-fantasia-urbana",
    "Galeria: fantasia urbana",
    "Gallery: urban fantasy",
    "Páginas 44–51",
    "Conflitos sobrenaturais e institucionais se cruzam: shadowkin, policiais e uma matriarca disputam controle enquanto rituais e pactos tornam o custo da demora concreto.",
    [
      "Shadowkin como atacantes; os oficiais Gillette e Rosenberg como ameaças; a capitã Alice Pulaski e a Shadow Matron como chefes.",
      "O ritual e o pacto funcionam como distrações capazes de mudar a direção da cena.",
      "Entradas para os protagonistas, variações de campanha e ajustes de gênero.",
    ],
    "A força do exemplo está em não reduzir a oposição a monstros. Autoridade, segredo e compromisso sobrenatural pressionam a Mesa por vias mecânicas diferentes.",
  ),
  gallerySummary(
    "galeria-cyberpunk",
    "Galeria: cyberpunk",
    "Gallery: cyberpunk",
    "Páginas 52–57",
    "Uma incursão corporativa combina acesso restrito, funcionários, segurança armada e defesas digitais. O lugar inteiro funciona como adversário.",
    [
      "Medidas de segurança da Aritech como limitações e restrições.",
      "Funcionários e segurança corporativa distribuídos entre figurantes, ameaças e atacantes.",
      "O mainframe como bloqueio, com oposição específica para a invasão digital e uma contagem regressiva para elevar o risco.",
    ],
    "Modele cada camada da corporação segundo a pergunta que ela cria: quem pode entrar, quem percebe, quem fere e o que fecha a janela de oportunidade.",
  ),
  gallerySummary(
    "galeria-pulp",
    "Galeria: aventura pulp",
    "Gallery: pulp adventure",
    "Páginas 58–65",
    "Exploração de templo, rivalidade e armadilhas formam uma sequência em que o espaço muda de função conforme os protagonistas se aproximam do objetivo.",
    [
      "Sir Rodney e seus capangas distribuídos como chefe, ameaça e figurantes.",
      "Perigos durante a exploração; Câmara do Coração com restrição e contagem regressiva.",
      "Armadilhas do altar como bloqueios e guardiões mecânicos como ameaça.",
    ],
    "Use a progressão para alternar descoberta e pressão. O rival move a trama, mas o templo deve continuar ativo mesmo quando nenhum inimigo está atacando.",
  ),
  gallerySummary(
    "galeria-acao-anos-80",
    "Galeria: ação dos anos 1980",
    "Gallery: 1980s action",
    "Páginas 66–73",
    "Uma cadeia global de confrontos exagerados culmina numa base lunar. Cada local troca a combinação de inimigos, perigos e relógios sem perder o mesmo fio de ação.",
    [
      "Commander Darkness e agentes SERPENT em Manhattan.",
      "La Cazadora e soldados animais na Sibéria; Doctor Blood e suas máquinas em Paris.",
      "Agent Viper, guardas de elite, perigo ambiental, contagem regressiva e fuga na base lunar.",
    ],
    "Aumente a escala por etapas e deixe cada cenário ter uma assinatura mecânica. O exagero funciona quando objetivos e consequências continuam claros.",
  ),
  gallerySummary(
    "galeria-opera-espacial",
    "Galeria: ópera espacial",
    "Gallery: space opera",
    "Páginas 74–81",
    "Uma estação espacial presa a restrições operacionais sofre sabotagem e infiltração. Os ataques Nyal importam, mas a sobrevivência da estação compete pela atenção.",
    [
      "A armadilha de Petronas Station como restrição.",
      "Atos de sabotagem como várias distrações simultâneas.",
      "Nyal como figurantes, ameaças e chefe; seus planos como bloqueio; uma contagem regressiva ajusta o clímax.",
    ],
    "Faça a estação reagir. Os protagonistas escolhem entre conter falhas, descobrir o plano e enfrentar invasores; a tensão nasce da impossibilidade de fazer tudo ao mesmo tempo.",
  ),
  gallerySummary(
    "galeria-espionagem",
    "Galeria: espionagem",
    "Gallery: spy thriller",
    "Páginas 82–89",
    "Segurança, operativos e informação incompleta sustentam uma trama em que sobreviver ao confronto não resolve a missão.",
    [
      "Segurança do hotel como figurantes, bloqueio e limitação.",
      "Operativos divididos entre ameaças e atacantes, com oposição posterior para representar as consequências.",
      "Perguntas sem resposta como bloqueios e Nathan Chandler como chefe.",
    ],
    "Dê peso ao que os protagonistas ainda não sabem. Bloqueios de informação podem ser tão decisivos quanto guardas e armas, desde que apontem caminhos de investigação.",
  ),
  gallerySummary(
    "galeria-super-herois",
    "Galeria: super-heróis",
    "Gallery: superheroes",
    "Páginas 90–97",
    "Um plano político-criminal usa grandes golpes e agentes públicos para manter várias crises em movimento ao mesmo tempo.",
    [
      "O plano do prefeito Robbins como contagem regressiva.",
      "LAMB como chefe; grandes assaltos representados por contagens regressivas próprias.",
      "Bay City Paladins como figurantes e o prefeito Robbins também apresentado como chefe em sua função direta.",
    ],
    "Separe o plano geral dos incidentes. Assim, deter um golpe produz efeito sem encerrar automaticamente a ameaça que conecta todos eles.",
  ),
  gallerySummary(
    "galeria-pos-apocalipse",
    "Galeria: pós-apocalipse",
    "Gallery: post-apocalyptic",
    "Páginas 98–105",
    "Uma viagem por água vital transforma veículo, comunidades e estrada em fontes diferentes de pressão.",
    [
      "O caminhão-tanque como entidade com aspectos, estresse, consequências e contagem regressiva.",
      "Clãs mutantes como ameaças e uma cidade dominada como distração, figurantes e ameaça.",
      "Bloqueio da NCF na estrada combinado a um atacante resistente.",
    ],
    "Trate o recurso transportado como parte da ficção, não como inventário abstrato. Dano, atraso e escolhas morais devem alterar o caminho.",
  ),
  gallerySummary(
    "galeria-romance-regencial",
    "Galeria: romance regencial",
    "Gallery: Regency romance",
    "Páginas 106–111",
    "Normas sociais tornam reputação, convite e dança tão concretos quanto terreno e armadura em outros gêneros.",
    [
      "Sociedade e costumes como limitação, apoiados por estresse social.",
      "Alphonse, filho do vigário, como ameaça e limitação; Hyacinth, jornalista, como atacante e limitação.",
      "O grande baile como figurantes e limitação, com zonas sociais e consequências para romper expectativas.",
    ],
    "Deixe as restrições terem consequências reais sem retirar escolhas. A pessoa pode romper a norma; a história então mostra o preço social dessa decisão.",
  ),
];

function galleryEnglish(introduction, elements, use) {
  const list = elements.map((element) => "<li>" + element + "</li>").join("");
  return "<aside><strong>Book map</strong><p>This section covers the function of every gallery example without reproducing reserved pages that are not part of the open SRD.</p></aside><p>" + introduction + "</p><h3>Pieces presented</h3><ul>" + list + "</ul><h3>How to use it</h3><p>" + use + "</p>";
}

const adversaryGalleryEnglishById = new Map([
  ["galeria-fantasia", galleryEnglish(
    "A dragonfolk invasion turns a city into a field of decisions: confronting the command, protecting residents, and stopping the spread of chaos demand different priorities.",
    [
      "Darra, paladin of Barathe, as a boss; draconic lieutenants as threats; and the dragonfolk army as fillers.",
      "Cities in chaos as a hazard, plus distractions and countdowns tied to civilians and the defense of Riverwall.",
      "Hooks that connect the protagonists to the city, adjust duration, and change tone without losing the adversary structure.",
    ],
    "Use the set for a military front with visible decisions. The main force maintains pressure while hazards and distractions prevent winning the fight from becoming the scene’s only question.",
  )],
  ["galeria-fantasia-urbana", galleryEnglish(
    "Supernatural and institutional conflicts intersect: shadowkin, police officers, and a matriarch compete for control while rituals and pacts make the cost of delay concrete.",
    [
      "Shadowkin as hitters; Officers Gillette and Rosenberg as threats; Captain Alice Pulaski and the Shadow Matron as bosses.",
      "The ritual and the pact function as distractions capable of changing the scene’s direction.",
      "Ways to bring in the protagonists, campaign variants, and genre adjustments.",
    ],
    "The example’s strength lies in refusing to reduce the opposition to monsters. Authority, secrecy, and supernatural commitment pressure the table through different mechanics.",
  )],
  ["galeria-cyberpunk", galleryEnglish(
    "A corporate incursion combines restricted access, employees, armed security, and digital defenses. The whole location functions as an adversary.",
    [
      "Aritech security measures as limitations and constraints.",
      "Employees and corporate security distributed among fillers, threats, and hitters.",
      "The mainframe as a block, with specific opposition for digital intrusion and a countdown that raises the risk.",
    ],
    "Model each corporate layer according to the question it creates: who can enter, who notices, who hurts, and what closes the window of opportunity.",
  )],
  ["galeria-pulp", galleryEnglish(
    "Temple exploration, rivalry, and traps form a sequence in which the space changes function as the protagonists approach their objective.",
    [
      "Sir Rodney and his henchmen distributed as a boss, threat, and fillers.",
      "Hazards during exploration; the Heart Chamber with a limitation and countdown.",
      "Altar traps as blocks and mechanical guardians as a threat.",
    ],
    "Use the progression to alternate discovery and pressure. The rival moves the plot, but the temple should remain active even when no enemy is attacking.",
  )],
  ["galeria-acao-anos-80", galleryEnglish(
    "A global chain of heightened confrontations culminates at a moon base. Each location changes the combination of enemies, hazards, and clocks without losing the same action thread.",
    [
      "Commander Darkness and SERPENT agents in Manhattan.",
      "La Cazadora and animal soldiers in Siberia; Doctor Blood and his machines in Paris.",
      "Agent Viper, elite guards, an environmental hazard, a countdown, and an escape at the moon base.",
    ],
    "Raise the scale in stages and give each setting a mechanical signature. Exaggeration works when objectives and consequences remain clear.",
  )],
  ["galeria-opera-espacial", galleryEnglish(
    "A space station trapped by operational constraints suffers sabotage and infiltration. The Nyal attacks matter, but the station’s survival competes for attention.",
    [
      "The Petronas Station trap as a constraint.",
      "Acts of sabotage as several simultaneous distractions.",
      "Nyal as fillers, threats, and a boss; their plans as a block; and a countdown that adjusts the climax.",
    ],
    "Make the station react. The protagonists choose among containing failures, uncovering the plan, and confronting invaders; tension comes from the impossibility of doing everything at once.",
  )],
  ["galeria-espionagem", galleryEnglish(
    "Security, operatives, and incomplete information sustain a plot in which surviving the confrontation does not complete the mission.",
    [
      "Hotel security as fillers, a block, and a limitation.",
      "Operatives split between threats and hitters, with later opposition representing the consequences.",
      "Unanswered questions as blocks and Nathan Chandler as a boss.",
    ],
    "Give weight to what the protagonists do not yet know. Information blocks can be as decisive as guards and weapons, provided they point toward avenues of investigation.",
  )],
  ["galeria-super-herois", galleryEnglish(
    "A political and criminal plan uses major heists and public officials to keep several crises moving at once.",
    [
      "Mayor Robbins’s plan as a countdown.",
      "LAMB as a boss; major robberies represented by their own countdowns.",
      "The Bay City Paladins as fillers and Mayor Robbins also presented as a boss in his direct role.",
    ],
    "Separate the overall plan from its incidents. Stopping one robbery then matters without automatically ending the threat that connects them all.",
  )],
  ["galeria-pos-apocalipse", galleryEnglish(
    "A journey carrying vital water turns a vehicle, communities, and the road into different sources of pressure.",
    [
      "The tanker truck as an entity with aspects, stress, consequences, and a countdown.",
      "Mutant clans as threats and a dominated town as a distraction, fillers, and a threat.",
      "An NCF roadblock combined with a durable hitter.",
    ],
    "Treat the transported resource as part of the fiction, not abstract inventory. Damage, delay, and moral choices should change the journey.",
  )],
  ["galeria-romance-regencial", galleryEnglish(
    "Social norms make reputation, invitations, and dancing as concrete as terrain and armor are in other genres.",
    [
      "Society and custom as a limitation, supported by social stress.",
      "Alphonse, the vicar’s son, as a threat and limitation; Hyacinth, a journalist, as a hitter and limitation.",
      "The grand ball as fillers and a limitation, with social zones and consequences for breaking expectations.",
    ],
    "Let constraints have real consequences without removing choices. A person can break the norm; the story then shows the social price of that decision.",
  )],
]);

const bilingualAdversaryGallery = attachLanguage(adversaryGallery, "en", adversaryGalleryEnglishById);

const coreTitles = {
  "THE BASICS": localized("O básico", "The Basics"),
  "GAME CREATION": localized("Criação de jogo", "Game Creation"),
  "CHARACTER CREATION": localized("Criação de personagem", "Character Creation"),
  "ASPECTS AND FATE POINTS": localized("Aspectos e pontos de destino", "Aspects and Fate Points"),
  "SKILLS AND STUNTS": localized("Perícias e façanhas", "Skills and Stunts"),
  "ACTIONS AND OUTCOMES": localized("Ações e resultados", "Actions and Outcomes"),
  "CHALLENGES, CONTESTS, AND CONFLICTS": localized("Desafios, disputas e conflitos", "Challenges, Contests, and Conflicts"),
  "RUNNING THE GAME": localized("Conduzindo o jogo", "Running the Game"),
  "SCENES, SESSIONS, AND SCENARIOS": localized("Cenas, sessões e cenários", "Scenes, Sessions, and Scenarios"),
  "THE LONG GAME": localized("O jogo longo", "The Long Game"),
  "EXTRAS": localized("Extras", "Extras"),
  "CHEAT SHEET": localized("Guia rápido", "Cheat Sheet"),
  "VETERANS’ GUIDE": localized("Guia para veteranos", "Veterans’ Guide"),
  "FEEDBACK HEROES": localized("Créditos da comunidade", "Feedback Heroes"),
};

const systemTitles = {
  "Foreword: “A” Not “The”": localized("Prefácio: “um”, não “o”", "Foreword: “A” Not “The”"),
  "1: Introduction": localized("1: Introdução", "1: Introduction"),
  "2: Aspects": localized("2: Aspectos", "2: Aspects"),
  "3: Skills": localized("3: Perícias", "3: Skills"),
  "4: Stunts": localized("4: Façanhas", "4: Stunts"),
  "5: The Big Game": localized("5: O grande jogo", "5: The Big Game"),
  "6: Special Circumstances": localized("6: Circunstâncias especiais", "6: Special Circumstances"),
  "7: Customized Tools": localized("7: Ferramentas personalizadas", "7: Customized Tools"),
  "8: Magic": localized("8: Magia", "8: Magic"),
  "9: Subsystems": localized("9: Subsistemas", "9: Subsystems"),
};

const adversaryTitles = {
  "Types of Adversaries": localized("Tipos de adversários", "Types of Adversaries"),
  "Building Adversaries": localized("Construindo adversários", "Building Adversaries"),
  "Using Environments": localized("Usando ambientes", "Using Environments"),
};

const [coreRaw, systemRaw, adversaryRaw, adversaryPortugueseRaw, portugueseSrdRaw] = await Promise.all([
  readFile(join(sourceRoot, "fate-core-SRD.html"), "utf8"),
  readFile(join(sourceRoot, "fate-system-toolkit-SRD.html"), "utf8"),
  readFile(join(sourceRoot, "fate-adversary-toolkit.html"), "utf8"),
  readFile(join(sourceRoot, "fate-adversary-toolkit-pt.html"), "utf8"),
  readFile(join(sourceRoot, "fate-pt-open-srds.json"), "utf8"),
]);

const portugueseSrd = JSON.parse(portugueseSrdRaw);
const corePortugueseGroups = portugueseSrd.groups.filter((group) => group.source === "fate-core");
const systemPortugueseGroups = portugueseSrd.groups.filter((group) => group.source === "fate-system-toolkit");

const coreEnglishChapters = buildSrdChapters("fate-core", coreRaw, coreTitles, { skip: 1 });
const corePortugueseById = new Map(
  coreEnglishChapters.slice(0, 11).map((chapter, index) => [chapter.id, buildPortugueseGroup("fate-core", corePortugueseGroups[index])]),
);
corePortugueseById.set("cheat-sheet", "<p>Deixamos a você a tarefa de criar o guia rápido mais adequado ao seu jogo.</p>");
corePortugueseById.set("veterans-guide", buildPortugueseGroup("fate-core", corePortugueseGroups[11]));
corePortugueseById.set("feedback-heroes", coreEnglishChapters.find((chapter) => chapter.id === "feedback-heroes")?.html.en ?? "");
const coreChapters = attachLanguage(coreEnglishChapters, "pt", corePortugueseById).map((chapter) => (
  chapter.id === "cheat-sheet"
    ? { ...chapter, html: { ...chapter.html, en: "<p>We leave it to you to design the cheat sheet best suited to your game.</p>" } }
    : chapter
));

const systemEnglishChapters = buildSrdChapters("fate-system-toolkit", systemRaw, systemTitles);
const systemPortugueseById = new Map(
  systemEnglishChapters.map((chapter, index) => [chapter.id, buildPortugueseGroup("fate-system-toolkit", systemPortugueseGroups[index])]),
);
const systemChapters = attachLanguage(systemEnglishChapters, "pt", systemPortugueseById);

const adversaryEnglishChapters = buildSrdChapters("fate-adversary-toolkit", adversaryRaw, adversaryTitles, { skip: 1 });
const adversaryPortugueseBuilt = buildSrdChapters("fate-adversary-toolkit-pt", adversaryPortugueseRaw, {}, { language: "pt" });
const adversaryPortugueseById = new Map(
  adversaryEnglishChapters.map((chapter, index) => [chapter.id, adversaryPortugueseBuilt[index]?.html.pt ?? ""]),
);
const adversaryChapters = [
  ...attachLanguage(adversaryEnglishChapters, "pt", adversaryPortugueseById),
  ...bilingualAdversaryGallery,
];

const ventureCityChapters = [
  bookMapChapter({
    id: "venture-city-setting",
    ptTitle: "Venture City: cenário e funcionamento",
    enTitle: "Venture City: setting and how it works",
    pages: "Páginas 4–6",
    ptIntro: "Venture City é uma cidade de futuro próximo em que poderes podem ser comprados, vendidos, escondidos ou usados para controlar a vida pública. Heróis patrocinados por corporações, vilões conhecidos pela imprensa e pessoas comuns tentando sobreviver dividem o mesmo espaço.",
    ptSections: [
      "<strong>Venture City</strong>: a premissa de uma sociedade moldada por superpoderes comercializados, desigualdade e interesses corporativos.",
      "<strong>Heróis e vilões</strong>: celebridade, patrocínio, vigilantismo e a fronteira instável entre proteção pública e propaganda.",
      "<strong>Crime e punição</strong>: gangues, segurança privada e instituições que transformam poder em recurso, risco e motivo de conflito.",
      "<strong>Vida cotidiana</strong>: trabalho, saúde, mídia e relações sociais afetados por quem tem poderes e por quem não tem acesso a eles.",
      "<strong>Como este livro funciona</strong>: Fate Core continua sendo a base; o livro oferece poderes, temas, cenário, personagens prontos e sementes que entram somente quando a Mesa escolher.",
    ],
    ptUse: "Defina primeiro o que a Mesa quer colocar em foco: ação de super-heróis, crime corporativo, vida de pessoas sem patrocínio ou uma mistura. Depois escolha apenas os poderes e conflitos que tornam essa premissa jogável. Fate Condensado continua sendo a referência principal do site; Venture City acrescenta uma camada opcional.",
    enIntro: "Venture City is a near-future city where powers can be bought, sold, hidden, or used to control public life. Corporate-sponsored heroes, press-famous villains, and ordinary people trying to get by share the same streets.",
    enSections: [
      "<strong>Venture City</strong>: the premise of a society shaped by commercialized superpowers, inequality, and corporate interests.",
      "<strong>Heroes and Villains</strong>: celebrity, sponsorship, vigilantism, and the unstable line between public protection and advertising.",
      "<strong>Crime and Punishment</strong>: gangs, private security, and institutions that turn power into a resource, a risk, and a reason for conflict.",
      "<strong>Daily Life</strong>: work, health, media, and relationships changed by people with powers and by those without access to them.",
      "<strong>How This Book Works</strong>: Fate Core remains the foundation; the book offers powers, themes, setting material, pregenerated characters, and seeds that enter play only when the table chooses them.",
    ],
    enUse: "Start by deciding what the table wants in focus: superhero action, corporate crime, life without sponsorship, or a mixture. Then select only the powers and conflicts that make that premise playable. Fate Condensed remains this site’s principal reference; Venture City adds an optional layer.",
  }),
  bookMapChapter({
    id: "venture-character-powers",
    ptTitle: "Venture City: criação de personagem e poderes",
    enTitle: "Venture City: character and power creation",
    pages: "Páginas 7–11",
    ptIntro: "A criação segue Fate Core e acrescenta poderes construídos como façanhas maiores, mais chamativas e mais complexas. A estrutura dá um orçamento compreensível para montar um conjunto de poderes sem transformar a ficha em uma lista impossível de manter.",
    ptSections: [
      "<strong>Criação e orçamento</strong>: use a criação de personagem da base; os protagonistas recebem três façanhas extras exclusivamente para poderes e podem trocar recarga por mais façanhas, além de usar a quantidade normal de façanhas gratuitas.",
      "<strong>Um ou dois poderes</strong>: a recomendação é ter um poder principal; dois já são o limite prático. Efeitos relacionados ficam reunidos em um único <em>conjunto de poderes</em>.",
      "<strong>Poder básico</strong>: escolha a capacidade central; sua forma mínima custa uma façanha e estabelece o que o poder faz.",
      "<strong>Aprimoramentos</strong>: efeitos adicionais custam uma façanha cada; aprimoramentos repetíveis podem elevar bônus progressivamente.",
      "<strong>Sinergia de poder</strong>: acrescente outro poder básico ao conjunto por uma façanha, justificando a relação ficcional; ele compartilha a mesma desvantagem e o mesmo efeito de dano colateral.",
      "<strong>Temas de poder</strong>: colorem a apresentação da habilidade sem acrescentar uma capacidade nova. O primeiro tema é gratuito; temas adicionais custam uma façanha.",
      "<strong>Efeitos especiais</strong>: comece com dois. Ao obter sucesso com estilo usando um poder, troque o benefício normal por um efeito; também é possível gastar um ponto de destino para acrescentá-lo a um sucesso. Efeitos aprimorados são exclusivos de um poder e custam uma façanha cada.",
      "<strong>Lista de efeitos</strong>: Movimento forçado, Ataque em área, Infligir condição, Movimento extra, Recuperação física, Recuperação mental e Ação extra funcionam como repertório comum para efeitos especiais.",
      "<strong>Desvantagem</strong>: escolha um aspecto que represente limitação ou efeito colateral; ele se soma ao problema do personagem, não o substitui.",
      "<strong>Efeito de dano colateral</strong>: escolha uma aplicação superpotente. Usá-la cria um aspecto de situação na área, cuja natureza exata é definida pelo Narrador; também é possível construir um efeito a partir de um poder que você ainda não possui.",
      "<strong>Orçamento de NPCs</strong>: figurantes usam um ou dois pontos de façanha em poderes e não recebem efeitos especiais ou dano colateral; ameaças usam três ou quatro, e personagens principais seguem a construção dos protagonistas.",
    ],
    ptUse: "Monte primeiro a fantasia do personagem em uma frase, compre o poder básico e só então escolha aprimoramentos, sinergias, temas e efeitos que aparecem na ficção. O dano colateral é uma decisão dramática com preço visível, não um bônus gratuito.",
    enIntro: "Character creation follows Fate Core and adds powers built as larger, flashier, more complex stunts. The structure gives the table a clear budget for a power suite without turning the sheet into an unmanageable list.",
    enSections: [
      "<strong>Creation and budget</strong>: use the base character-creation process; protagonists receive three bonus stunts used only for powers and may trade refresh for more stunts, in addition to their normal free-stunt allotment.",
      "<strong>One or two powers</strong>: the recommendation is one foundational power; two is the practical ceiling. Related effects stay together in one <em>power suite</em>.",
      "<strong>Basic Power</strong>: choose the core ability; its stripped-down form costs one stunt and establishes what the power does.",
      "<strong>Enhancements</strong>: extra effects cost one stunt each; repeatable enhancements can raise bonuses progressively.",
      "<strong>Power Synergy</strong>: add another basic power to the suite for one stunt, with a fictional justification; it shares the suite’s single drawback and collateral damage effect.",
      "<strong>Power Themes</strong>: color how the ability appears without adding a new capability. The first theme is free; additional themes cost one stunt.",
      "<strong>Special effects</strong>: start with two. When you succeed with style using a power, replace the normal benefit with an effect; you can also spend a fate point to add one to a success. Improved special effects are unique to a power and cost one stunt each.",
      "<strong>Effect list</strong>: Forced Movement, Area Attack, Inflict Condition, Extra Movement, Physical Recovery, Mental Recovery, and Extra Action form the common special-effect repertoire.",
      "<strong>Drawback</strong>: choose an aspect representing a limitation or side effect; it joins, rather than replaces, the character’s trouble.",
      "<strong>Collateral Damage Effect</strong>: choose a super-potent application. Using it creates a situation aspect in the area, with the Game Master determining its exact nature; you may also build an effect from a power you do not yet have.",
      "<strong>NPC budget</strong>: nameless NPCs use one or two stunt points of powers and have no special effects or collateral damage; supporting NPCs use three or four, while main NPCs follow the protagonist build.",
    ],
    enUse: "First describe the character’s fantasy in one sentence, buy the basic power, and only then choose enhancements, synergies, themes, and effects that appear in the fiction. Collateral damage is a dramatic decision with a visible cost, not a free bonus.",
  }),
  bookMapChapter({
    id: "venture-sample-characters",
    ptTitle: "Venture City: personagens de exemplo",
    enTitle: "Venture City: sample characters",
    pages: "Páginas 12–26",
    ptIntro: "Quinze personagens prontos mostram como combinar a estrutura de Fate Core com poderes, sinergias, temas, efeitos especiais, desvantagens e dano colateral. Eles funcionam como atalhos de criação e como referências para NPCs de uma Venture City própria.",
    ptSections: [
      "<strong>The Flamer</strong>: projeção de fogo e ataques em área, com risco de espalhar o incêndio.",
      "<strong>The Psychic</strong>: telepatia e telecinese voltadas a influência, leitura e controle à distância.",
      "<strong>The Brick</strong>: força e resistência acima do humano, capaz de absorver e devolver impacto.",
      "<strong>The Ghost</strong>: invisibilidade e faseamento para atravessar barreiras e agir fora do alcance comum.",
      "<strong>The Speedster</strong>: supervelocidade, agilidade e reação, fazendo do posicionamento sua principal defesa.",
      "<strong>The Transhuman</strong>: tecnologia integrada ao corpo, com aprimoramentos que misturam pessoa e máquina.",
      "<strong>The Chameleon</strong>: disfarce e metamorfose usados para infiltração, identidade e fuga.",
      "<strong>The Deity</strong>: um conjunto amplo apresentado como manifestação divina, com efeitos de escala e autoridade.",
      "<strong>The Doppelganger</strong>: duplicação e replicação de poder para multiplicar presença e opções.",
      "<strong>The Formless</strong>: forma mutável, elasticidade e resistência para adaptar o corpo à situação.",
      "<strong>The Insect</strong>: traços animais, aderência a paredes, voo ou sentidos ampliados reunidos em uma fantasia de enxame.",
      "<strong>The Merc</strong>: ferramentas, armas e treinamento profissional organizados em torno de um poder prático.",
      "<strong>The Metalhead</strong>: controle de máquinas e materiais, com tecnologia como linguagem de ação.",
      "<strong>The Monster</strong>: força, brutalidade e vulnerabilidades visíveis colocadas no centro do drama.",
      "<strong>The Oracle</strong>: precognição e leitura de possibilidades para trocar certeza por escolhas difíceis.",
    ],
    ptUse: "Use os exemplos como ponto de partida, não como personagens obrigatórios. Ao adaptar um deles, preserve a lógica do conjunto e troque nomes, aspectos e contexto para que a pessoa pertença à Mesa.",
    enIntro: "Fifteen pregenerated characters show how Fate Core’s structure combines with powers, synergies, themes, special effects, drawbacks, and collateral damage. They work as creation shortcuts and as references for NPCs in a home-built Venture City.",
    enSections: [
      "<strong>The Flamer</strong>: fire projection and area attacks, with the risk of spreading the blaze.",
      "<strong>The Psychic</strong>: telepathy and telekinesis focused on influence, reading, and control at range.",
      "<strong>The Brick</strong>: superhuman strength and toughness able to absorb and return impact.",
      "<strong>The Ghost</strong>: invisibility and phasing for crossing barriers and acting beyond ordinary reach.",
      "<strong>The Speedster</strong>: super speed, agility, and reaction time, making positioning the main defense.",
      "<strong>The Transhuman</strong>: technology integrated with the body, blending person and machine through enhancements.",
      "<strong>The Chameleon</strong>: disguise and shape-shifting used for infiltration, identity, and escape.",
      "<strong>The Deity</strong>: a broad suite presented as divine manifestation, with effects of scale and authority.",
      "<strong>The Doppelganger</strong>: duplication and power replication to multiply presence and options.",
      "<strong>The Formless</strong>: mutable form, elasticity, and toughness that adapt the body to the situation.",
      "<strong>The Insect</strong>: animal traits, wall-crawling, flight, or heightened senses joined in a swarm-like fantasy.",
      "<strong>The Merc</strong>: gear, weapons, and professional training organized around a practical power.",
      "<strong>The Metalhead</strong>: machine and material control, using technology as a language of action.",
      "<strong>The Monster</strong>: strength, brutality, and visible vulnerabilities placed at the center of the drama.",
      "<strong>The Oracle</strong>: precognition and possible futures, trading certainty for difficult choices.",
    ],
    enUse: "Treat the examples as starting points, not mandatory characters. When adapting one, preserve the suite’s internal logic and change names, aspects, and context so the person belongs to the table.",
  }),
  bookMapChapter({
    id: "venture-powers-catalog",
    ptTitle: "Venture City: catálogo de poderes",
    enTitle: "Venture City: powers catalog",
    pages: "Páginas 27–70",
    ptIntro: "O catálogo é uma caixa de ferramentas para construir conjuntos de poderes rapidamente. Cada entrada oferece um poder básico e caminhos para aprimoramentos, sinergias, efeitos especiais, desvantagens e dano colateral; a escolha final deve seguir a ficção e a regra principal da Mesa.",
    ptSections: [
      "<strong>Controle de animais (Animal Control)</strong>; <strong>Invocação de criaturas (Creature Summoning)</strong>; <strong>Disfarce (Disguise)</strong>; <strong>Duplicação (Duplication)</strong>; <strong>Elasticidade (Elasticity)</strong>.",
      "<strong>Absorção de energia (Energy Absorption)</strong>; <strong>Rajada de energia (Energy Blast)</strong>; <strong>Voo (Flight)</strong>; <strong>Engenhocas (Gadgeteering)</strong>; <strong>Dano (Harm)</strong>.",
      "<strong>Cura (Healing)</strong>; <strong>Ilusão (Illusion)</strong>; <strong>Influência (Influence)</strong>; <strong>Invisibilidade (Invisibility)</strong>; <strong>Invocação de itens (Item Summoning)</strong>.",
      "<strong>Controle de plantas (Plant Control)</strong>; <strong>Controle de máquinas (Machine Control)</strong>; <strong>Imitação de material (Material Mimic)</strong>; <strong>Arma natural (Natural Weapon)</strong>; <strong>Faseamento (Phasing)</strong>.",
      "<strong>Amplificação de poder (Power Amplification)</strong>; <strong>Anulação de poder (Power Nullification)</strong>; <strong>Replicação de poder (Power Replication)</strong>; <strong>Precognição (Precognition)</strong>; <strong>Regeneração (Regeneration)</strong>.",
      "<strong>Metamorfose (Shape-Shifting)</strong>; <strong>Proteção (Shielding)</strong>; <strong>Lentidão (Slowing)</strong>; <strong>Superagilidade (Super Agility)</strong>; <strong>Superinteligência (Super Intelligence)</strong>.",
      "<strong>Super-sentidos (Super Senses)</strong>; <strong>Supervelocidade (Super Speed)</strong>; <strong>Superforça (Super Strength)</strong>; <strong>Super-resistência (Super Toughness)</strong>; <strong>Telecinese (Telekinesis)</strong>.",
      "<strong>Telepatia (Telepathy)</strong>; <strong>Teletransporte (Teleportation)</strong>; <strong>Aderência a paredes (Wall-Crawling)</strong>; <strong>Controle do clima (Weather Control)</strong>.",
    ],
    ptUse: "Escolha um poder que descreva o que a pessoa faz de extraordinário, não uma lista de tudo que ela poderia fazer. Use sinergias e efeitos para cobrir aplicações relacionadas; negocie qualquer interpretação nova antes de ela virar precedente.",
    enIntro: "The catalog is a toolbox for building power suites quickly. Each entry offers a basic power and routes to enhancements, synergies, special effects, drawbacks, and collateral damage; the final choice should follow the fiction and the table’s principal ruleset.",
    enSections: [
      "<strong>Animal Control</strong>; <strong>Creature Summoning</strong>; <strong>Disguise</strong>; <strong>Duplication</strong>; <strong>Elasticity</strong>.",
      "<strong>Energy Absorption</strong>; <strong>Energy Blast</strong>; <strong>Flight</strong>; <strong>Gadgeteering</strong>; <strong>Harm</strong>.",
      "<strong>Healing</strong>; <strong>Illusion</strong>; <strong>Influence</strong>; <strong>Invisibility</strong>; <strong>Item Summoning</strong>.",
      "<strong>Plant Control</strong>; <strong>Machine Control</strong>; <strong>Material Mimic</strong>; <strong>Natural Weapon</strong>; <strong>Phasing</strong>.",
      "<strong>Power Amplification</strong>; <strong>Power Nullification</strong>; <strong>Power Replication</strong>; <strong>Precognition</strong>; <strong>Regeneration</strong>.",
      "<strong>Shape-Shifting</strong>; <strong>Shielding</strong>; <strong>Slowing</strong>; <strong>Super Agility</strong>; <strong>Super Intelligence</strong>.",
      "<strong>Super Senses</strong>; <strong>Super Speed</strong>; <strong>Super Strength</strong>; <strong>Super Toughness</strong>; <strong>Telekinesis</strong>.",
      "<strong>Telepathy</strong>; <strong>Teleportation</strong>; <strong>Wall-Crawling</strong>; <strong>Weather Control</strong>.",
    ],
    enUse: "Choose a power that describes what the person does extraordinarily, not a list of everything they might do. Use synergies and effects for related applications; agree on any new interpretation before it becomes precedent.",
  }),
  bookMapChapter({
    id: "venture-power-themes",
    ptTitle: "Venture City: temas de poder",
    enTitle: "Venture City: power themes",
    pages: "Páginas 71–77",
    ptIntro: "Temas mudam a aparência, a origem e o tom de um conjunto de poderes sem criar uma capacidade independente. Eles ajudam a transformar o mesmo efeito mecânico em ficções muito diferentes.",
    ptSections: [
      "<strong>Corrupção (Corruption)</strong>: poder que contamina, cobra um preço ou deixa marcas difíceis de esconder.",
      "<strong>Projeção elétrica (Electricity Projection)</strong>: eletricidade como fonte, linguagem visual e risco ambiental.",
      "<strong>Projeção de fogo (Fire Projection)</strong>: calor e chamas aplicados a ataque, mobilidade e dano colateral.",
      "<strong>Projeção de gelo (Frost Projection)</strong>: frio, congelamento e alteração do terreno.",
      "<strong>Projeção de sombras (Shadow Projection)</strong>: escuridão, ocultação e presença sobrenatural.",
      "<strong>Superforma (Super-Form)</strong>: uma transformação ou modo de poder com identidade própria.",
      "<strong>Tecnologia (Technology)</strong>: dispositivos, implantes ou engenharia ocupando o lugar de uma origem puramente biológica.",
    ],
    ptUse: "Escolha o primeiro tema sem custo quando ele clarificar a fantasia do personagem; só compre temas adicionais se a diferença realmente abrir novas decisões. O tema colore o poder, mas não altera por conta própria as regras de Fate Condensado.",
    enIntro: "Themes change a power suite’s appearance, origin, and tone without creating an independent capability. They help turn the same mechanical effect into very different fiction.",
    enSections: [
      "<strong>Corruption</strong>: power that contaminates, demands a price, or leaves marks that are hard to hide.",
      "<strong>Electricity Projection</strong>: electricity as source, visual language, and environmental risk.",
      "<strong>Fire Projection</strong>: heat and flame applied to attack, movement, and collateral damage.",
      "<strong>Frost Projection</strong>: cold, freezing, and changing the terrain.",
      "<strong>Shadow Projection</strong>: darkness, concealment, and supernatural presence.",
      "<strong>Super-Form</strong>: a transformation or powered mode with its own identity.",
      "<strong>Technology</strong>: devices, implants, or engineering standing in for a purely biological origin.",
    ],
    enUse: "Take the first theme for free when it clarifies the character’s fantasy; buy additional themes only when the distinction creates new decisions. A theme colors a power but does not by itself alter Fate Condensed’s rules.",
  }),
  bookMapChapter({
    id: "venture-build-city",
    ptTitle: "Venture City: crie sua cidade",
    enTitle: "Venture City: make your city",
    pages: "Páginas 78–96",
    ptIntro: "A segunda metade do livro transforma a premissa em uma campanha. O método começa por problemas que movem a cidade, organiza as pessoas e lugares que encarnam esses problemas e termina em uma aventura-modelo, Nothing Ventured, que mostra como escolhas dos protagonistas deixam consequências.",
    ptSections: [
      "<strong>Issues</strong>: problemas atuais e iminentes mantêm a campanha em movimento; escreva-os como perguntas ou tensões que podem mudar.",
      "<strong>Facções, lugares e pessoas</strong>: dê forma concreta às forças que disputam Venture City e conecte-as aos aspectos e objetivos dos protagonistas.",
      "<strong>Splitstream’s Crew</strong>: uma tripulação criminosa e sua economia de poder, útil para começar pelo submundo e por conflitos de lealdade.",
      "<strong>Mitsuhama Splice Corporation</strong>: corporação ligada à pesquisa e à exploração de poderes, com escala suficiente para gerar pressão institucional.",
      "<strong>Aegis Securities</strong>: segurança privada e interesses corporativos que convertem vigilância em antagonismo.",
      "<strong>The Neighborhood Watch</strong>: proteção comunitária, reputação e a pergunta sobre quem tem legitimidade para agir.",
      "<strong>Nothing Ventured</strong>: aventura-modelo que cruza uma droga de superpoder, interesses corporativos e a possibilidade de os protagonistas mudarem o equilíbrio da cidade.",
    ],
    ptUse: "Comece por um problema que os personagens possam piorar, resolver ou assumir. Crie facções com objetivos incompatíveis e deixe a campanha responder ao que a Mesa fizer; a cidade funciona melhor como rede de escolhas do que como cenário fixo.",
    enIntro: "The book’s second half turns the premise into a campaign. The method starts with problems that move the city, gives those problems concrete people and places, and ends with the sample adventure Nothing Ventured, where the protagonists’ choices leave consequences.",
    enSections: [
      "<strong>Issues</strong>: current and impending problems keep the campaign moving; phrase them as questions or tensions that can change.",
      "<strong>Factions, Places, and People</strong>: give concrete form to the forces competing in Venture City and connect them to the protagonists’ aspects and goals.",
      "<strong>Splitstream’s Crew</strong>: a criminal crew and its power economy, useful for beginning with the underworld and loyalty conflicts.",
      "<strong>Mitsuhama Splice Corporation</strong>: a corporation tied to power research and exploitation, large enough to create institutional pressure.",
      "<strong>Aegis Securities</strong>: private security and corporate interests that turn surveillance into antagonism.",
      "<strong>The Neighborhood Watch</strong>: community protection, reputation, and the question of who has the legitimacy to act.",
      "<strong>Nothing Ventured</strong>: a sample adventure combining a superpower drug, corporate interests, and the possibility that the protagonists change the city’s balance.",
    ],
    enUse: "Start with a problem the characters can worsen, solve, or take over. Build factions with incompatible goals and let the campaign answer what the table does; the city works best as a web of choices rather than a fixed backdrop.",
  }),
  bookMapChapter({
    id: "venture-mini-adventures",
    ptTitle: "Venture City: miniaventuras de dano colateral",
    enTitle: "Venture City: collateral-damage mini-adventures",
    pages: "Páginas 98–100",
    ptIntro: "As miniaventuras são sementes para inserir complicações no meio de uma campanha. Cada uma tem gatilho, aspecto de situação, descrição e resultado: se a Mesa não lidar com o problema até o fim da sessão, ele volta para pressionar o próximo trecho da história.",
    ptSections: [
      "<strong>The Tail</strong>: um prédio destruído revela uma pesquisa prioritária e coloca uma equipe corporativa no encalço do grupo.",
      "<strong>The Casualty</strong>: um ataque em área fere um civil; reputação e responsabilidade entram na conta.",
      "<strong>The Tower</strong>: dano estrutural cria um espaço que desaba e transforma escapar em prioridade.",
      "<strong>The Mob</strong>: dano mental desencadeia pânico, tumulto e resposta policial desproporcional.",
      "<strong>The Press</strong>: uma transformação ou morte chocante atrai jornalistas e uma campanha de difamação.",
      "<strong>The Blackout</strong>: dano elétrico mergulha a cidade no escuro e pressiona serviços de emergência.",
      "<strong>The Nemesis</strong>: um NPC nomeado que concede por causa do dano volta decidido a se vingar.",
    ],
    ptUse: "Use essas sementes em momentos especiais, não após todo uso de dano colateral. O objetivo é tornar o poder parte da história: a Mesa decide se contém a consequência, aceita o custo ou a transforma em um novo problema.",
    enIntro: "These mini-adventures are seeds for inserting complications into an ongoing campaign. Each has a trigger, situation aspect, description, and outcome: if the table does not address the problem by the end of the session, it returns to pressure the next part of the story.",
    enSections: [
      "<strong>The Tail</strong>: a destroyed building reveals high-priority research and puts a corporate team on the group’s trail.",
      "<strong>The Casualty</strong>: an area attack injures a civilian; reputation and responsibility enter the equation.",
      "<strong>The Tower</strong>: structural damage creates a collapsing location and makes escape the priority.",
      "<strong>The Mob</strong>: mental damage triggers panic, unrest, and a disproportionate law-enforcement response.",
      "<strong>The Press</strong>: a disturbing transformation or death draws journalists and a smear campaign.",
      "<strong>The Blackout</strong>: electrical damage plunges the city into darkness and strains emergency services.",
      "<strong>The Nemesis</strong>: a named NPC who concedes because of collateral damage returns determined to seek revenge.",
    ],
    enUse: "Use these seeds at special moments, not after every collateral-damage effect. The goal is to make the power part of the story: the table decides whether to contain the consequence, accept the cost, or turn it into a new problem.",
  }),
];

const horrorToolkitChapters = [
  bookMapChapter({
    id: "horror-toolkit-series",
    ptTitle: "Série Fate Toolkit: como usar o Horror Toolkit",
    enTitle: "The Fate Toolkit Series: using the Horror Toolkit",
    pages: "Página 4",
    ptIntro: "O Fate Horror Toolkit é um suplemento temático: uma coleção de ferramentas, ajustes e sementes para criar horror em Fate. Ele não substitui a regra principal nem exige que toda Mesa use horror; cada módulo entra somente com consentimento e propósito claros.",
    ptSections: [
      "A diferença entre um toolkit de tema e o Fate System Toolkit: este volume se concentra em horror e adapta ferramentas ao gênero.",
      "A relação com Fate Condensado e Fate Core: a base continua funcionando; o Horror Toolkit oferece escolhas opcionais para mudar tom, pressão e consequências.",
      "A promessa do volume: adversários assustadores, compels temáticos, aspectos de legado e intensidade, doom e uma estrutura de trabalho em equipe para públicos mais jovens.",
    ],
    ptUse: "Escolha um módulo, explique à Mesa o que ele muda e combine limites antes de começar. Se uma ferramenta não ajudar o jogo que vocês querem jogar, deixe-a fora.",
    enIntro: "The Fate Horror Toolkit is a themed supplement: a collection of tools, adjustments, and seeds for creating horror in Fate. It does not replace the principal ruleset or require every table to play horror; each module enters play only with clear consent and purpose.",
    enSections: [
      "The difference between a theme-focused toolkit and the Fate System Toolkit: this volume concentrates on horror and adapts tools to the genre.",
      "Its relationship to Fate Condensed and Fate Core: the foundation still works; the Horror Toolkit offers optional choices that change tone, pressure, and consequences.",
      "The volume’s promise: frightening adversaries, thematic compels, legacy and intensity aspects, doom, and a teamwork framework for younger audiences.",
    ],
    enUse: "Choose one module, explain what it changes, and agree on boundaries before play. If a tool does not help the game you want to play, leave it out.",
  }),
  bookMapChapter({
    id: "horror-gazing-abyss",
    ptTitle: "Horror: olhando para o abismo",
    enTitle: "Horror: gazing into the abyss",
    pages: "Páginas 5–10",
    ptIntro: "O primeiro capítulo define o tipo de experiência que o toolkit quer apoiar e mostra por que horror pede preparação social além de mecânica. A competência e a proatividade de Fate continuam presentes, mas o gênero ganha força quando a ameaça parece transgressora, isoladora, desestabilizadora e incerta.",
    ptSections: [
      "<strong>Anatomia de um jogo de horror</strong>: investimento dos jogadores, transgressão, isolamento, perda de poder, suspense e incerteza trabalham juntos.",
      "<strong>Consentimento e segurança</strong>: converse sobre gênero, temas, limites e ferramentas antes da sessão; use linhas, véus e o Cartão X para interromper ou redirecionar conteúdo sem exigir justificativa.",
      "<strong>Como usar este livro</strong>: as regras são módulos; marque quais estão em vigor, explique alterações e abandone uma ferramenta se o conforto da Mesa não estiver preservado.",
      "<strong>Recursos e companheiros</strong>: o capítulo aponta o Fate Accessibility Toolkit, o Horror Paradox do System Toolkit, o Fate Codex, Dresden Files Accelerated e as regras de condições do System Toolkit como referências relacionadas.",
      "<strong>Mapa de mecânicas</strong>: condições, estresse e consequências modificados, o Fate Fractal, novos resultados, rezoneamento, façanhas de horror e marcos diferentes reaparecem nos capítulos seguintes.",
    ],
    ptUse: "Trate segurança como parte da criação do jogo, não como aviso escondido. Defina o que pode aparecer, como a Mesa sinaliza desconforto e quais regras opcionais serão usadas antes de procurar o primeiro susto.",
    enIntro: "The first chapter defines the experience the toolkit supports and shows why horror needs social preparation in addition to mechanics. Fate’s competence and proactivity remain present, but the genre gains force when the threat feels transgressive, isolating, disempowering, and uncertain.",
    enSections: [
      "<strong>The anatomy of a horror game</strong>: player investment, transgression, isolation, loss of power, suspense, and uncertainty work together.",
      "<strong>Player consent and safety</strong>: discuss genre, themes, boundaries, and tools before play; use lines, veils, and the X-Card to stop or redirect content without demanding an explanation.",
      "<strong>How to use this book</strong>: rules are modules; identify what is active, explain changes, and drop a tool when the table’s comfort is not preserved.",
      "<strong>Resources and companions</strong>: the chapter points to the Fate Accessibility Toolkit, the System Toolkit’s Horror Paradox, Fate Codex, Dresden Files Accelerated, and System Toolkit conditions as related references.",
      "<strong>Mechanics map</strong>: conditions, modified stress and consequences, the Fate Fractal, new outcomes, re-zoning, horror stunts, and different milestones return in later chapters.",
    ],
    enUse: "Treat safety as part of game creation, not a hidden disclaimer. Decide what may appear, how the table signals discomfort, and which optional rules are active before looking for the first scare.",
  }),
  bookMapChapter({
    id: "horror-raveled-sleeve",
    ptTitle: "Horror: personagens aos quais nos apegamos",
    enTitle: "Horror: the raveled sleeve of care",
    pages: "Páginas 11–34",
    ptIntro: "Este capítulo constrói investimento emocional. Personagens simpáticos, vulneráveis e ligados entre si tornam a ameaça significativa; a condução alterna picos e pausas para que a tensão tenha ritmo em vez de anestesiar a Mesa.",
    ptSections: [
      "<strong>Inspiração de mídia</strong>: exemplos de histórias mostram como simpatia, vítimas reconhecíveis e dilemas morais tornam o horror mais forte.",
      "<strong>Criação do jogo</strong>: estabeleça consentimento, estilo, subgênero, temas, aspectos de situação e regras alteradas em conjunto.",
      "<strong>Criação de personagem</strong>: prefira conceitos concretos e vulnerabilidades respeitadas; aspectos ligados a outras pessoas criam vínculos que podem ser pressionados por compels.",
      "<strong>Perícias e façanhas</strong>: justifique perícias altas pela ficção, avalie se Recursos e Contatos quebram o isolamento e evite façanhas que removam a dependência dos personagens de ferramentas ou aliados.",
      "<strong>Incerteza e suspense</strong>: revele pistas graduais, use informação incompleta e deixe aspectos apontarem para a verdade sem entregá-la cedo demais.",
      "<strong>Batimento do horror</strong>: alterne cenas intensas e intervalos de recuperação; encurte as pausas e aumente a ameaça à medida que o clímax se aproxima.",
      "<strong>Ameaça avassaladora</strong>: oposição robusta pode ficar acima da perícia máxima atual; no começo, escapar pode ser uma vitória legítima.",
      "<strong>Sacrifício heroico</strong>: uma concessão voluntária antes da rolagem permite uma morte definitiva em troca de um efeito decisivo, como tirar figurantes, impor consequência severa a um NPC ou superar um obstáculo.",
      "<strong>Aspecto de legado</strong>: depois da morte, o grupo pode registrar o impacto duradouro; o jogador sem personagem novo recebe invocações gratuitas para ajudar os sobreviventes.",
      "<strong>Assombração</strong>: o personagem morto pode voltar como fantasma, com capacidades e limites combinados, mais adequado a observar, informar e criar vantagens do que a resolver tudo fisicamente.",
      "<strong>NPCs e vítimas simpáticos</strong>: semelhanças, favores, cuidado recíproco, vítimas conhecidas, flashbacks, reconstrução e detalhes declarados fazem a perda importar.",
      "<strong>Ferramentas de tensão</strong>: desejos perigosos, auto-compels ampliados, pool comunitário de pontos de destino, aspectos de intensidade, dilemas morais e dilemas de clímax mantêm escolhas humanas no centro.",
    ],
    ptUse: "Antes de aumentar o perigo, dê à Mesa algo que valha a pena proteger. O horror funciona quando a pessoa entende o risco, continua tendo escolhas e percebe que a consequência nasceu do que foi decidido.",
    enIntro: "This chapter builds emotional investment. Sympathetic, vulnerable characters connected to one another make the threat matter; play alternates peaks and lulls so tension has rhythm instead of numbing the table.",
    enSections: [
      "<strong>Media inspiration</strong>: stories show how sympathy, recognizable victims, and moral dilemmas make horror stronger.",
      "<strong>Game creation</strong>: establish consent, style, subgenre, themes, situation aspects, and altered rules together.",
      "<strong>Character creation</strong>: favor grounded concepts and respectful vulnerabilities; aspects linked to other people create bonds that compels can pressure.",
      "<strong>Skills and stunts</strong>: justify high skills through the fiction, consider whether Resources and Contacts break isolation, and avoid stunts that remove dependence on tools or allies.",
      "<strong>Uncertainty and suspense</strong>: reveal clues gradually, use incomplete information, and let aspects hint at truth without giving it away too soon.",
      "<strong>The heartbeat of horror</strong>: alternate intense scenes and recovery lulls; shorten the lulls and intensify the threat as the climax approaches.",
      "<strong>Overwhelming threats</strong>: robust opposition can sit above the current apex skill; early on, getting away can be a legitimate victory.",
      "<strong>Heroic sacrifice</strong>: a voluntary concession before the roll permits a final death in exchange for a decisive result, such as taking out fillers, forcing a severe consequence on an NPC, or overcoming an obstacle.",
      "<strong>Legacy aspect</strong>: after a death, the group can record its lasting impact; a player without a new character receives free invokes to aid survivors.",
      "<strong>Haunting</strong>: the dead character may return as a ghost with agreed capabilities and limits, better suited to observing, informing, and creating advantages than solving everything physically.",
      "<strong>Sympathetic NPCs and victims</strong>: similarities, favors, reciprocal care, known victims, flashbacks, reconstruction, and declared details make loss matter.",
      "<strong>Tension tools</strong>: dangerous desires, expanded self-compels, a communal fate-point pool, intensity aspects, moral dilemmas, and climactic dilemmas keep human choices central.",
    ],
    enUse: "Before raising the danger, give the table something worth protecting. Horror works when people understand the risk, retain meaningful choices, and see that consequences grew from what was decided.",
  }),
  bookMapChapter({
    id: "horror-scars-invisible",
    ptTitle: "Horror: algumas cicatrizes não aparecem",
    enTitle: "Horror: some scars are invisible",
    pages: "Páginas 35–48",
    ptIntro: "O capítulo trata o custo mental e corporal do horror sem transformar sofrimento real em caricatura. As ferramentas tornam feridas persistentes, recuperação e imagens viscerais jogáveis, sempre com consentimento e respeito.",
    ptSections: [
      "<strong>Inspiração de mídia e ferramentas</strong>: escolha o grau de intimidade, ameaça e gore que combina com a Mesa e use os recursos de segurança já combinados.",
      "<strong>Feridas levam a cicatrizes</strong>: uma consequência pode deixar uma mudança duradoura na ficha, na ficção ou nas duas, em vez de desaparecer quando a caixa é curada.",
      "<strong>Aspectos de trauma</strong>: registre como o evento alterou a pessoa; eles podem ajudar, atrapalhar e oferecer compels sem diagnosticar ou definir alguém por uma condição.",
      "<strong>Condições de enfrentamento</strong>: condições representam estratégias temporárias para continuar funcionando, com custo ficcional e oportunidade de recuperação.",
      "<strong>Não transformar doença mental em ‘o outro’</strong>: diferencie sofrimento, diagnóstico e monstruosidade; consulte experiências reais, trate pessoas com dignidade e não use uma condição como atalho para maldade.",
      "<strong>Vísceras e gore</strong>: descreva o necessário para o efeito pretendido, combine limites, use compels viscerais quando apropriado e deixe a Mesa escolher quando a câmera se afasta.",
      "<strong>Corações endurecidos</strong>: a exposição pode reduzir o impacto emocional e gerar consequências próprias; a ferramenta serve para drama, não para punir quem não quer detalhamento gráfico.",
    ],
    ptUse: "Faça o custo aparecer de forma jogável, não como decoração. Uma cicatriz deve mudar escolhas e relações; ela nunca deve ser usada para rotular uma pessoa real ou obrigar alguém a reviver conteúdo que recusou.",
    enIntro: "This chapter addresses horror’s mental and bodily cost without turning real suffering into caricature. The tools make lasting wounds, recovery, and visceral imagery playable, always with consent and respect.",
    enSections: [
      "<strong>Media inspiration and tools</strong>: choose the intimacy, threat, and gore that fit the table and use the safety resources already agreed upon.",
      "<strong>Wounds lead to scars</strong>: a consequence can leave a lasting change on the sheet, in the fiction, or both, rather than disappearing when the box is healed.",
      "<strong>Trauma aspects</strong>: record how an event changed someone; they can help, hinder, and invite compels without diagnosing or defining a person by a condition.",
      "<strong>Coping conditions</strong>: conditions represent temporary strategies for continuing to function, with a fictional cost and a route to recovery.",
      "<strong>On othering mental illness</strong>: distinguish suffering, diagnosis, and monstrosity; consult lived experience, treat people with dignity, and do not use a condition as a shortcut to evil.",
      "<strong>Viscera and gore</strong>: describe only what the intended effect needs, agree on boundaries, use visceral compels when appropriate, and let the table choose when the camera pulls away.",
      "<strong>Hardened hearts</strong>: exposure can reduce emotional impact and create its own consequences; the tool serves drama, not punishment for someone who does not want graphic detail.",
    ],
    enUse: "Make the cost playable rather than decorative. A scar should change choices and relationships; it must never label a real person or force anyone to revisit content they declined.",
  }),
  bookMapChapter({
    id: "horror-whos-damned",
    ptTitle: "Horror: quem são os condenados",
    enTitle: "Horror: who’s who of the damned",
    pages: "Páginas 49–84",
    ptIntro: "Este é o grande capítulo de adversários. Ele oferece um processo para criar monstros que expressam um tema e não apenas uma lista de números, depois aplica o Fate Fractal ao próprio corpo e a ideias, regimes e seres completamente alienígenas.",
    ptSections: [
      "<strong>Construindo monstros</strong>: comece por tema, conceito, ameaça e propósito; defina vulnerabilidades, características, interesses, perícias ou abordagens, condições próprias, façanhas, revelação e pool de monstro.",
      "<strong>Exemplos de monstros</strong>: vampiro, assassino, enxame assassino e criatura criada ilustram como a estrutura muda conforme o gênero e a história.",
      "<strong>O corpo como adversário</strong>: mutilação e transformações podem ser fatais, sobrevivíveis ou progressivas; partes do corpo desobedientes ganham ações, aspectos, estresse e consequências próprios.",
      "<strong>Rezoneamento e horror corporal</strong>: mude zonas para representar anatomia, perseguição ou perda de controle; façanhas temáticas fazem o corpo continuar relevante em cada cena.",
      "<strong>O Outro</strong>: ideias, regimes e seres alienígenas podem ser oposição sem serem reduzidos a uma caricatura cultural; a Mesa decide se o arco é confronto, reconhecimento, transformação ou convivência impossível.",
      "<strong>Confrontar o Outro</strong>: conflitos iniciais podem abrir espaço para reconhecer humanidade, cruzar um limiar e chegar a um desfecho; variantes incluem um libertador e uma força de caos.",
      "<strong>Fractal e marcos</strong>: trate uma instituição, ideologia ou entidade como personagem quando isso esclarecer seus objetivos, recursos, vulnerabilidades e mudanças.",
    ],
    ptUse: "Faça cada monstro responder a uma pergunta da história. Se a ameaça pode ser vencida apenas repetindo a mesma rolagem, falta-lhe tema, vulnerabilidade ou objetivo ficcional; corrija isso antes de aumentar números.",
    enIntro: "This is the major adversary chapter. It provides a process for creating monsters that express a theme rather than merely listing numbers, then applies the Fate Fractal to the body itself and to ideas, regimes, and wholly alien beings.",
    enSections: [
      "<strong>Making monsters</strong>: begin with theme, concept, threat, and purpose; define vulnerabilities, features, interests, skills or approaches, custom conditions, stunts, reveal, and a monster pool.",
      "<strong>Monster examples</strong>: a vampire, slasher, killer swarm, and created creature show how the structure changes with genre and story.",
      "<strong>The body as an adversary</strong>: mutilation and transformations can be fatal, survivable, or progressive; rogue body parts receive their own actions, aspects, stress, and consequences.",
      "<strong>Re-zoning and body horror</strong>: change zones to represent anatomy, pursuit, or loss of control; themed stunts keep the body relevant in every scene.",
      "<strong>The Other</strong>: ideas, regimes, and alien beings can oppose the characters without becoming a cultural caricature; the table decides whether the arc is confrontation, recognition, transformation, or impossible coexistence.",
      "<strong>Confronting the Other</strong>: early conflict can make room for recognition, crossing a threshold, and an endgame; variants include a liberator and a force of chaos.",
      "<strong>Fractal and milestones</strong>: treat an institution, ideology, or entity as a character when that clarifies its goals, resources, vulnerabilities, and changes.",
    ],
    enUse: "Make every monster answer a story question. If the threat can be beaten by repeating the same roll, it needs a theme, vulnerability, or fictional goal; fix that before increasing numbers.",
  }),
  bookMapChapter({
    id: "horror-we-all-die",
    ptTitle: "Horror: todos vamos morrer",
    enTitle: "Horror: we are all going to die",
    pages: "Páginas 85–92",
    ptIntro: "Doom é o resultado que a ficção anuncia e para o qual a campanha caminha. Este capítulo cria uma ameaça inevitável sem tirar agência: a Mesa decide como, quando e com que custo os personagens atravessam a contagem regressiva.",
    ptSections: [
      "<strong>Inspiração e propósito</strong>: jogar sabendo que a história pode terminar mal torna decisões, vínculos e sacrifícios mais significativos.",
      "<strong>Construindo a perdição</strong>: escreva o problema, sua escala, contexto, linha do tempo, complicações e eventos que se aproximam conforme a Mesa age ou demora.",
      "<strong>Relógio da perdição</strong>: registre etapas visíveis ou ocultas, avance-as por gatilhos e deixe cada marca mudar a situação, não apenas contar rodadas.",
      "<strong>Perdição durante o jogo</strong>: crie pressões simultâneas, agende eventos, mostre sinais e ofereça escolhas que alterem o modo de fracassar.",
      "<strong>Falha com estilo</strong>: um resultado extremo pode permitir que a Mesa alcance o objetivo em troca de um preço maior, preservando movimento sem fingir que nada aconteceu.",
      "<strong>Livro de cicatrizes</strong>: registre perdas e transformações para que o fim de uma parte continue produzindo significado nas próximas.",
      "<strong>Depois da perda</strong>: planeje como jogadores e personagens continuam envolvidos quando alguém morre, concede ou é removido da história.",
    ],
    ptUse: "Doom não é uma sentença para surpreender pessoas sem aviso. Apresente sinais, combine o que é inevitável e concentre a agência na resposta: quem é salvo, o que é sacrificado e que história sobra.",
    enIntro: "Doom is the outcome the fiction announces and the campaign moves toward. This chapter creates an inevitable threat without removing agency: the table decides how, when, and at what cost the characters pass through the countdown.",
    enSections: [
      "<strong>Inspiration and purpose</strong>: playing with the knowledge that a story may end badly makes decisions, bonds, and sacrifices more meaningful.",
      "<strong>Building the doom</strong>: write the problem, its scale, context, timeline, complications, and events that approach as the table acts or delays.",
      "<strong>Doom Clock</strong>: track visible or hidden stages, advance them through triggers, and let each mark change the situation rather than merely count rounds.",
      "<strong>Doom during the game</strong>: create simultaneous pressures, schedule events, show signs, and offer choices that change the way failure arrives.",
      "<strong>Failure with style</strong>: an extreme result can let the table reach its objective at a greater price, preserving momentum without pretending nothing happened.",
      "<strong>Book of Scars</strong>: record losses and transformations so the end of one part continues to carry meaning into the next.",
      "<strong>After loss</strong>: plan how players and characters stay involved when someone dies, concedes, or leaves the story.",
    ],
    enUse: "Doom is not a sentence delivered without warning. Show signs, agree on what is inevitable, and put agency in the response: who is saved, what is sacrificed, and what story remains.",
  }),
  bookMapChapter({
    id: "horror-high-cost",
    ptTitle: "Horror: o alto custo de viver",
    enTitle: "Horror: the high cost of living",
    pages: "Páginas 93–105",
    ptIntro: "O quadro de sobrevivência transforma recursos e abrigo em problemas dramáticos. A escassez não é um contador isolado: ela aparece como aspecto de situação, escolha de grupo, mudança de NPC e preço para continuar avançando.",
    ptSections: [
      "<strong>Inspiração e visão geral</strong>: histórias de sobrevivência perguntam o que as pessoas fazem quando conforto, ajuda e tempo acabam.",
      "<strong>Mudanças de regra</strong>: necessidades e consumíveis podem ser aspectos, a recuperação pode exigir custo e ficar sem algo tem consequências explícitas.",
      "<strong>Criação de campanha e personagem</strong>: estabeleça recursos iniciais, relações, papéis, abrigo e o que cada personagem está disposto a abandonar.",
      "<strong>Durante o jogo</strong>: use rações pela metade, falta de suprimentos, medidas desesperadas, invocações gratuitas e decisões de quem recebe o pouco que existe.",
      "<strong>NPCs e resultados</strong>: figurantes, ameaças e personagens principais reagem de maneira diferente à escassez; o destino de um NPC pode mudar um aspecto de situação ou o próximo objetivo.",
      "<strong>Abrigos sob ataque</strong>: trate o refúgio com o Fate Fractal, dê-lhe aspectos e estresse e faça cada ataque alterar a segurança futura.",
      "<strong>Campanhas de exemplo</strong>: apocalipse zumbi, assassino na natureza selvagem e deserto pós-apocalíptico radioativo demonstram três escalas de sobrevivência.",
    ],
    ptUse: "Escolha recursos que tenham rosto e consequência. Se a falta de comida, abrigo ou confiança não muda a decisão de alguém, ela não precisa virar regra; se muda, registre-a de modo que a Mesa possa agir sobre ela.",
    enIntro: "The survival framework turns resources and shelter into dramatic problems. Scarcity is not an isolated counter: it appears as a situation aspect, a group choice, an NPC change, and a price for continuing forward.",
    enSections: [
      "<strong>Inspiration and overview</strong>: survival stories ask what people do when comfort, help, and time run out.",
      "<strong>Rule changes</strong>: necessities and consumables can be aspects, recovery can require a cost, and going without has explicit consequences.",
      "<strong>Campaign and character creation</strong>: establish starting resources, relationships, roles, shelter, and what each character is willing to abandon.",
      "<strong>During play</strong>: use half-rations, shortages, desperate measures, free invokes, and decisions about who receives what little remains.",
      "<strong>NPCs and outcomes</strong>: fillers, threats, and main NPCs respond differently to scarcity; an NPC’s fate can change a situation aspect or the next objective.",
      "<strong>Havens under attack</strong>: use the Fate Fractal, give the refuge aspects and stress, and make every attack change future safety.",
      "<strong>Example campaigns</strong>: a zombie apocalypse, wilderness slasher, and radioactive post-apocalyptic wasteland demonstrate three survival scales.",
    ],
    enUse: "Choose resources that have a face and a consequence. If a shortage of food, shelter, or trust does not change anyone’s decision, it need not become a rule; if it does, record it so the table can act on it.",
  }),
  bookMapChapter({
    id: "horror-new-pink",
    ptTitle: "Horror: o horror feminino",
    enTitle: "Horror: horror is the new pink",
    pages: "Páginas 106–122",
    ptIntro: "Este capítulo explora horror íntimo e social, especialmente o modo como expectativas sobre gênero, corpo e espaço doméstico podem ser transformadas em pressão ficcional. Ele oferece ferramentas, não uma definição única do que é horror feminino.",
    ptSections: [
      "<strong>Inspiração e desconforto</strong>: identifique situações que produzem vigilância, exposição, descrédito ou obrigação e converse sobre seus limites.",
      "<strong>Mechanizing Discomfort</strong>: converta desconforto em aspectos, compels, consequências e escolhas; a mecânica deve revelar relações de poder sem naturalizá-las.",
      "<strong>Características femininas</strong>: Scent of a Woman, espaços perigosos (doméstico, social e interno), sexualidade venenosa, dúvida dos próprios sentidos e perdido e achado são ferramentas nomeadas pelo livro.",
      "<strong>Aspectos e pontos de horror</strong>: aspectos de horror podem conceder força e custo; pontos de horror acompanham a pressão quando a Mesa decide usar esse módulo.",
      "<strong>Horror feminino em ação</strong>: Dark Spirits, Anticipated Blood e Parasitic Dependency mostram como aplicar as ferramentas a premissas distintas.",
    ],
    ptUse: "Não trate experiência de gênero como atalho para vulnerabilidade automática. Pergunte o que a história quer investigar, deixe cada pessoa definir sua relação com o tema e preserve a possibilidade de recusar ou redirecionar a cena.",
    enIntro: "This chapter explores intimate and social horror, especially how expectations around gender, bodies, and domestic space can become fictional pressure. It offers tools, not a single definition of feminine horror.",
    enSections: [
      "<strong>Inspiration and discomfort</strong>: identify situations that produce surveillance, exposure, disbelief, or obligation, and discuss their boundaries.",
      "<strong>Mechanizing Discomfort</strong>: turn discomfort into aspects, compels, consequences, and choices; mechanics should reveal power relations without naturalizing them.",
      "<strong>Feminine features</strong>: Scent of a Woman, dangerous spaces (domestic, social, and internal), poisonous sexuality, Doubt Your Own Senses, and Lost and Found are named tools in the book.",
      "<strong>Horror aspects and Horror Points</strong>: horror aspects can grant strength and cost; Horror Points track pressure when the table chooses this module.",
      "<strong>Feminine Horror in Action</strong>: Dark Spirits, Anticipated Blood, and Parasitic Dependency show the tools applied to different premises.",
    ],
    enUse: "Do not treat gendered experience as an automatic shortcut to vulnerability. Ask what the story is investigating, let each person define their relationship to the topic, and preserve the option to refuse or redirect a scene.",
  }),
  bookMapChapter({
    id: "horror-spooky-fun",
    ptTitle: "Horror: diversão assustadora para jovens",
    enTitle: "Horror: spooky fun",
    pages: "Páginas 123–140",
    ptIntro: "Spooky Fun é uma estrutura de horror cooperativo para público mais jovem. As crianças têm agência e competência adequadas à idade, trabalham em equipe e enfrentam o medo sem que o jogo dependa de violência gráfica ou de retirar suas escolhas.",
    ptSections: [
      "<strong>O que é isto?</strong>: combine aventura, mistério, susto e humor em um formato que pode ser ajustado para a faixa etária da Mesa.",
      "<strong>Criação das crianças intrometidas</strong>: conceitos, aspectos e relações partem do cotidiano; habilidades de boletim e condições dão linguagem própria ao grupo.",
      "<strong>Nunca diga morra</strong>: confrontar o mal usa coragem, medo, ajuda entre personagens e soluções criativas em vez de letalidade obrigatória.",
      "<strong>A ameaça</strong>: dê ao inimigo uma perícia Medo, capacidades, fraquezas e um modo claro de ser tirado de ação.",
      "<strong>Reviravoltas e estrutura</strong>: pistas, revelações, planos malignos, ponto de acesso e cenas de investigação organizam a sessão sem exigir um roteiro fechado.",
      "<strong>O hotspot</strong>: um local concentrador reúne pistas, ameaça e oportunidades para a equipe decidir como agir.",
    ],
    ptUse: "Combine a intensidade com responsáveis e participantes, mantenha o foco em coragem e cooperação e faça cada criança contribuir com uma solução. O medo é matéria de jogo; não é punição por jogar de um jeito diferente.",
    enIntro: "Spooky Fun is a cooperative horror framework for younger audiences. Kids have age-appropriate agency and competence, work as a team, and face fear without relying on graphic violence or removing their choices.",
    enSections: [
      "<strong>What Is This?</strong>: combine adventure, mystery, scares, and humor in a format adjustable to the table’s age range.",
      "<strong>Meddling Kids character creation</strong>: concepts, aspects, and relationships begin in everyday life; report-card skills and conditions give the group its own language.",
      "<strong>Never Say Die</strong>: confronting evil uses courage, fear, help between characters, and creative solutions rather than mandatory lethality.",
      "<strong>The Menace</strong>: give the enemy a Fear skill, abilities, weaknesses, and a clear way to be taken out.",
      "<strong>Twistcraft and structure</strong>: clues, reveals, evil plots, a point of entry, and investigation scenes organize play without requiring a fixed script.",
      "<strong>The Hotspot</strong>: one focused location gathers clues, threat, and opportunities for the team to decide how to act.",
    ],
    enUse: "Agree on intensity with guardians and participants, keep the focus on courage and cooperation, and let every child contribute a solution. Fear is game material, not punishment for playing differently.",
  }),
  bookMapChapter({
    id: "horror-x-card",
    ptTitle: "Apêndice: Cartão X",
    enTitle: "Appendix: the X-Card",
    pages: "Páginas 141–142",
    ptIntro: "O Cartão X é uma ferramenta simples de segurança: qualquer pessoa pode indicar que um conteúdo precisa parar ou mudar. A ferramenta não exige explicação pública e deve ser apresentada junto de outras formas de consentimento e cuidado.",
    ptSections: [
      "Como apresentar a ferramenta antes do jogo, incluindo uma forma física ou digital de sinalizar o conteúdo.",
      "Como pausar, remover, substituir ou avançar uma parte sem transformar a sinalização em debate ou investigação.",
      "Como combinar o Cartão X com linhas, véus e conversas de check-in para que limites continuem claros durante a campanha.",
    ],
    ptUse: "Explique o procedimento antes da primeira cena e respeite o sinal imediatamente. O Cartão X não é um julgamento sobre a pessoa que trouxe o tema; é uma forma de manter a Mesa jogável.",
    enIntro: "The X-Card is a simple safety tool: anyone can indicate that content needs to stop or change. It requires no public explanation and should be introduced alongside other forms of consent and care.",
    enSections: [
      "How to introduce the tool before play, including a physical or digital way to signal content.",
      "How to pause, remove, replace, or skip a part without turning the signal into a debate or investigation.",
      "How to combine the X-Card with lines, veils, and check-in conversations so boundaries stay clear during a campaign.",
    ],
    enUse: "Explain the procedure before the first scene and honor the signal immediately. The X-Card is not a judgment of the person who introduced the topic; it is a way to keep the table playable.",
  }),
  bookMapChapter({
    id: "horror-script-change",
    ptTitle: "Apêndice: Script Change",
    enTitle: "Appendix: Script Change",
    pages: "Páginas 143–146",
    ptIntro: "Script Change amplia as ferramentas de segurança para revisar uma cena durante ou depois do jogo. Em vez de descobrir limites só quando algo dá errado, a Mesa pode pedir pausa, retroceder, avançar ou editar o que aconteceu.",
    ptSections: [
      "Vocabulário de pausa, retrocesso, avanço e edição para mudar conteúdo sem interromper a confiança do grupo.",
      "Conversas de preparação e debriefing para verificar como a cena foi recebida e o que deve ser ajustado na próxima sessão.",
      "Integração com linhas, véus e Cartão X, sempre com a regra humana de que conforto vale mais que qualquer ferramenta de horror.",
    ],
    ptUse: "Use os termos que a Mesa combinar e não exija que alguém justifique o pedido. A ferramenta funciona melhor quando é normal ajustar uma história em colaboração.",
    enIntro: "Script Change expands safety tools for revising a scene during or after play. Instead of discovering boundaries only when something goes wrong, the table can ask to pause, rewind, fast-forward, or edit what happened.",
    enSections: [
      "A vocabulary of pause, rewind, fast-forward, and edit for changing content without breaking group trust.",
      "Preparation and debrief conversations to check how a scene landed and what should change next session.",
      "Integration with lines, veils, and the X-Card, guided by the human rule that comfort matters more than any horror tool.",
    ],
    enUse: "Use the terms the table agrees on and never require someone to justify a request. The tool works best when revising a story together is ordinary.",
  }),
  bookMapChapter({
    id: "horror-complementary-tools",
    ptTitle: "Apêndice: ferramentas complementares",
    enTitle: "Appendix: complementary tools",
    pages: "Páginas 147–152",
    ptIntro: "O último apêndice reúne combinações de ferramentas que funcionam bem juntas. Ele serve como índice de montagem: escolha um pacote coerente, explique o impacto e mantenha cada peça opcional.",
    ptSections: [
      "Combinações para consentimento e segurança, incluindo linhas, véus, Cartão X e Script Change.",
      "Combinações para investimento e suspense, como aspectos de legado, assombração, compels temáticos, informação incompleta e o batimento do horror.",
      "Combinações para dano e transformação, como aspectos de trauma, condições de enfrentamento, mutilação, partes do corpo desobedientes e corações endurecidos.",
      "Combinações para campanha, como relógio da perdição, livro de cicatrizes, sobrevivência, ataques a abrigos, o Outro e marcos modificados.",
      "Combinações para público jovem, como Coragem, Medo, condições, ajuda entre personagens, ameaça, reviravolta e hotspot.",
    ],
    ptUse: "Use o apêndice para preparar uma sessão, não para ligar tudo de uma vez. Um pequeno conjunto de ferramentas bem explicado é mais seguro, intuitivo e eficaz que uma pilha de exceções.",
    enIntro: "The final appendix gathers combinations of tools that work well together. It is a construction index: choose a coherent package, explain its impact, and keep every piece optional.",
    enSections: [
      "Combinations for consent and safety, including lines, veils, the X-Card, and Script Change.",
      "Combinations for investment and suspense, such as legacy aspects, haunting, thematic compels, incomplete information, and the horror heartbeat.",
      "Combinations for harm and transformation, such as trauma aspects, coping conditions, mutilation, rogue body parts, and hardened hearts.",
      "Combinations for campaigns, such as the Doom Clock, Book of Scars, survival, attacks on havens, the Other, and modified milestones.",
      "Combinations for younger audiences, such as Courage, Fear, conditions, helping each other, the Menace, twists, and a hotspot.",
    ],
    enUse: "Use the appendix to prepare a session, not to turn everything on at once. A small, well-explained toolkit is safer, clearer, and more effective than a stack of exceptions.",
  }),
];

const fateOfCthulhuChapters = [
  bookMapChapter({
    id: "cthulhu-introduction",
    ptTitle: "Fate of Cthulhu: apresentação e consentimento",
    enTitle: "Fate of Cthulhu: introduction and consent",
    pages: "Páginas 4–6",
    ptIntro: "Fate of Cthulhu é um jogo de horror de ação sobre heróis do presente e viajantes de um futuro destruído que tentam impedir a ascensão dos Grandes Antigos. A obra é autônoma e usa uma versão condensada do Fate Core; neste site, ela entra como uma expansão temática opcional, sem substituir o Fate Condensado.",
    ptSections: [
      "A premissa de uma resistência que volta cerca de trinta anos no tempo, conhece o fim do mundo e precisa mudar sua cadeia de causas.",
      "As cinco linhas temporais disponíveis: Grande Cthulhu, Dagon, Shub-Niggurath, Nyarlathotep e o Rei de Amarelo.",
      "O contrato de gênero: horror cósmico com ação, decisões morais e personagens competentes, em vez de retirar a agência com terror inevitável.",
      "Conteúdo e consentimento: saúde mental, abuso sistêmico, morte em massa, racismo de H. P. Lovecraft e a necessidade de combinar limites antes da campanha.",
      "O que a Mesa precisa para jogar: a obra traz sua própria base, mas as regras e os nomes principais do site continuam subordinados ao Fate Condensado quando houver escolha entre versões.",
    ],
    ptUse: "Escolha primeiro a intensidade do horror, converse sobre temas que podem ficar fora ou apenas sugeridos e só então escolha uma linha temporal. O livro dá uma campanha pronta; a Mesa decide o que é adequado para as pessoas presentes.",
    enIntro: "Fate of Cthulhu is an action-horror game about present-day heroes and travelers from a ruined future trying to stop the Great Old Ones from rising. The book is standalone and uses a condensed form of Fate Core; on this site it is an optional thematic expansion, never a replacement for Fate Condensed.",
    enSections: [
      "The premise of a resistance traveling roughly thirty years into the past, knowing the end of the world and trying to change its chain of causes.",
      "The five available timelines: Great Cthulhu, Dagon, Shub-Niggurath, Nyarlathotep, and the King in Yellow.",
      "The genre contract: action cosmic horror with competent characters, meaningful choices, and no requirement to remove player agency through inevitable terror.",
      "Content and consent: mental health, systemic abuse, mass death, H. P. Lovecraft’s racism, and the need to agree on boundaries before the campaign.",
      "What the table needs to play: the book brings its own foundation, but this site’s principal names and rules remain Fate Condensed whenever versions must be reconciled.",
    ],
    enUse: "First agree on horror intensity, discuss topics that should stay off-screen or out of play, and only then choose a timeline. The book supplies a campaign frame; the table decides what is appropriate for the people present.",
  }),
  bookMapChapter({
    id: "cthulhu-character-creation",
    ptTitle: "Fate of Cthulhu: criação de personagem",
    enTitle: "Fate of Cthulhu: character creation",
    pages: "Páginas 7–16",
    ptIntro: "A ficha transforma a origem temporal e a exposição aos Grandes Antigos em decisões jogáveis. A estrutura usa cinco aspectos, a pirâmide de perícias, façanhas, recarga, estresse e consequências, com uma camada adicional de corrupção para quem veio do futuro ou escolheu lidar com o oculto.",
    ptSections: [
      "Linha temporal pessoal: personagens do futuro começam corrompidos; personagens do presente normalmente não, salvo quando a história justificar contato com forças arcanas.",
      "Aspectos: conceito, problema, relacionamento com outro personagem e dois aspectos livres; aspectos corrompidos descrevem a mutação e dão acesso a uma façanha de corrupção.",
      "Perícias: pirâmide com uma Grande (+4), duas Boas (+3), três Razoáveis (+2), quatro Médias (+1) e as demais Medíocres (+0), usando a lista padrão do Fate.",
      "Recarga e façanhas: recarga inicial 3, duas façanhas gratuitas e mais façanhas compradas com recarga até o mínimo de 1; uma façanha de corrupção acompanha cada aspecto corrompido.",
      "Estresse e consequências: três caixas físicas e três mentais, com slots leve, moderado e severo; Físico e Vontade ampliam as caixas e podem dar um segundo slot leve específico.",
      "Acabamento: nome, aparência, história, vínculos e efeitos definidos para os aspectos corrompidos completam a ficha.",
    ],
    ptUse: "Comece pela origem e pela promessa dramática do personagem. Só depois distribua a pirâmide e escreva a corrupção: ela deve oferecer uma solução tentadora e uma complicação que a Mesa consiga enxergar.",
    enIntro: "The sheet turns temporal origin and exposure to the Great Old Ones into playable decisions. It uses five aspects, a skill pyramid, stunts, refresh, stress, and consequences, with corruption layered on top for future travelers and characters who embrace the occult.",
    enSections: [
      "Personal timeline: future characters begin corrupted; present-day characters usually do not, unless their history justifies contact with arcane forces.",
      "Aspects: high concept, trouble, a relationship with another character, and two free aspects; corrupted aspects describe the mutation and grant a corruption stunt.",
      "Skills: one Great (+4), two Good (+3), three Fair (+2), four Average (+1), and all other skills at Mediocre (+0), using the standard Fate list.",
      "Refresh and stunts: start with 3 refresh and two free stunts; buy more with refresh down to 1, and add one corruption stunt for each corrupted aspect.",
      "Stress and consequences: three physical and three mental boxes, plus mild, moderate, and severe consequence slots; Physique and Will add boxes and can grant a second dedicated mild slot.",
      "Finishing touches: name, appearance, history, relationships, and the effects of corrupted aspects complete the sheet.",
    ],
    enUse: "Start with origin and the character’s dramatic promise. Only then distribute the pyramid and write corruption: it should offer a tempting solution and a complication the table can see.",
  }),
  bookMapChapter({
    id: "cthulhu-action-and-dice",
    ptTitle: "Fate of Cthulhu: agir e rolar os dados",
    enTitle: "Fate of Cthulhu: taking action and rolling dice",
    pages: "Páginas 17–27",
    ptIntro: "O capítulo resume a resolução de Fate para cenas de fuga, investigação, combate e confronto com o impossível. A pergunta vem antes do dado: o que impede a ação, o que pode dar errado e por que vale a pena descobrir o resultado agora?",
    ptSections: [
      "Quando não há oposição interessante, a ação acontece sem rolagem; quando há risco ou incerteza, escolha a perícia e a ação apropriadas.",
      "Sequência de resolução: descreva a intenção, role quatro dados Fate, some os símbolos, acrescente a perícia, modifique com aspectos e façanhas e anuncie o esforço final.",
      "Dificuldade e oposição: compare com uma dificuldade fixa ou com a rolagem de quem está resistindo; a diferença determina o resultado e a tensão da cena.",
      "Modificadores: invocações, impulsos, façanhas e circunstâncias ajustam a rolagem sem apagar a ficção que justificou o número.",
      "Resultados: falha, empate, sucesso e sucesso com estilo mantêm as consequências narrativas ligadas à escolha da ação.",
      "Ações: Superar, Criar vantagem, Atacar e Defender; aspectos, estresse, consequências, concessão e ser tirado de ação seguem a lógica Fate, com os ajustes específicos do livro para sacrifício heroico.",
    ],
    ptUse: "Use uma rolagem quando o resultado puder mudar a missão ou revelar um custo. Se a ação só serve para confirmar algo que já é verdade na ficção, avance e guarde os dados para a decisão relevante.",
    enIntro: "This chapter condenses Fate resolution for escapes, investigations, fights, and confrontations with the impossible. The question comes before the dice: what stops the action, what can go wrong, and why is finding out now interesting?",
    enSections: [
      "When no meaningful opposition exists, the action simply happens; when risk or uncertainty matters, choose the fitting skill and action.",
      "Resolution sequence: describe intent, roll four Fate dice, total the symbols, add the skill, modify with aspects and stunts, and announce the final effort.",
      "Difficulty and opposition: compare with a fixed difficulty or the resisting roll; the difference determines the outcome and scene pressure.",
      "Modifiers: invokes, boosts, stunts, and circumstances adjust a roll without erasing the fiction that justified the number.",
      "Outcomes: fail, tie, succeed, and succeed with style keep narrative consequences connected to the chosen action.",
      "Actions: Overcome, Create an Advantage, Attack, and Defend; aspects, stress, consequences, concession, and being taken out follow Fate logic, with the book’s heroic last-stand adjustments.",
    ],
    enUse: "Roll when the result can change the mission or reveal a cost. If the roll only confirms something already true in the fiction, move forward and save the dice for the meaningful decision.",
  }),
  bookMapChapter({
    id: "cthulhu-aspects-and-fate-points",
    ptTitle: "Fate of Cthulhu: aspectos e pontos de destino",
    enTitle: "Fate of Cthulhu: aspects and fate points",
    pages: "Páginas 28–34",
    ptIntro: "Aspectos são verdades da história e também alavancas para alterar uma rolagem. O capítulo reapresenta como invocar, forçar, criar e remover aspectos, mantendo a economia de pontos de destino como conversa entre autoridade narrativa e complicação.",
    ptSections: [
      "Aspectos são sempre verdadeiros: uma frase escrita concede permissão ficcional antes de qualquer bônus numérico.",
      "Tipos de aspecto: personagem, situação, cenário e linha temporal; todos podem mudar o foco quando a Mesa oferece uma justificativa clara.",
      "Invocar um aspecto: gaste um ponto de destino para +2, rerrolar ou combinar invocações, inclusive uma invocação gratuita criada por uma vantagem.",
      "Forçar um aspecto: o Narrador propõe uma complicação e a pessoa aceita um ponto de destino ou recusa pagando um; a proposta deve tornar a história mais interessante, não punir uma escolha.",
      "Criar, remover e renomear aspectos: a ação e o resultado determinam se surge uma vantagem, se uma condição desaparece ou se a situação muda de nome e significado.",
      "A corrupção dá aos aspectos uma borda perigosa: invocá-los e aceitá-los pode preencher a trilha de corrupção e marcar a linha temporal contra a resistência.",
    ],
    ptUse: "Escreva aspectos que ajudem e atrapalhem de modos diferentes. Em uma campanha de viagem temporal, trate cada invocação ou forçada como uma afirmação sobre o futuro que vocês estão construindo juntos.",
    enIntro: "Aspects are story truths and levers for changing a roll. This chapter revisits invoking, compelling, creating, and removing aspects, keeping the fate-point economy as a conversation between narrative authority and complication.",
    enSections: [
      "Aspects are always true: a written phrase grants fictional permission before it grants a numeric bonus.",
      "Aspect types: character, situation, setting, and timeline; any can shift focus when the table has a clear justification.",
      "Invoke an aspect: spend a fate point for +2, a reroll, or stacked invokes, including a free invoke created by an advantage.",
      "Compel an aspect: the Game Master proposes a complication and the player accepts a fate point or pays one to refuse; the offer should make the story more interesting, not punish a choice.",
      "Create, remove, and rename aspects: the action and result determine whether an advantage appears, a condition disappears, or the situation changes meaning.",
      "Corruption gives aspects a dangerous edge: invoking or accepting compels can fill the corruption track and mark the timeline against the resistance.",
    ],
    enUse: "Write aspects that help and hinder in different ways. In a time-travel campaign, treat every invoke or compel as a statement about the future the group is building together.",
  }),
  bookMapChapter({
    id: "cthulhu-challenges-conflicts",
    ptTitle: "Fate of Cthulhu: desafios, disputas e conflitos",
    enTitle: "Fate of Cthulhu: challenges, contests, and conflicts",
    pages: "Páginas 35–48",
    ptIntro: "As cenas maiores recebem uma forma que torne a decisão legível: uma sequência de tarefas, uma corrida entre lados ou uma luta com posições, estresse e consequências. O capítulo também apresenta a ordem de ação e o tratamento de dano usado pela campanha.",
    ptSections: [
      "Preparar cenas: defina objetivo, oposição, zonas, aspectos de situação, obstáculos e a pergunta que a cena precisa responder.",
      "Desafios: distribua tarefas com perícias diferentes e exija que o grupo resolva o conjunto, não apenas uma rolagem isolada.",
      "Disputas: cada lado rola para avançar; vitórias acumuladas mostram quem vence uma perseguição, corrida ou confronto de objetivos.",
      "Conflitos: estabeleça zonas, ordem de ação, movimentação, ataques, defesas, estresse, consequências, concessão e quando alguém é tirado de ação.",
      "Dano e recuperação: absorva tensão com caixas e consequências, descreva a ficção e deixe a recuperação depender de tempo, tratamento e permissões narrativas.",
      "Concessões e últimos momentos: desistir antes de ser tirado de ação dá controle sobre o custo; um sacrifício heroico pode encerrar a personagem e ainda melhorar a linha temporal.",
    ],
    ptUse: "Antes de iniciar um conflito, mostre o espaço e as consequências possíveis. Em cenas com monstros ou contagens regressivas, uma disputa ou desafio pode tornar o objetivo mais claro do que aumentar a quantidade de inimigos.",
    enIntro: "Large scenes get a form that makes the decision readable: a sequence of tasks, a race between sides, or a fight with positions, stress, and consequences. The chapter also presents turn order and the campaign’s harm treatment.",
    enSections: [
      "Set up scenes: define the objective, opposition, zones, situation aspects, obstacles, and the question the scene must answer.",
      "Challenges: assign tasks using different skills and ask the group to solve the whole problem, not one isolated roll.",
      "Contests: each side rolls to advance; accumulated victories show who wins a chase, race, or opposed objective.",
      "Conflicts: establish zones, turn order, movement, attacks, defenses, stress, consequences, concession, and when someone is taken out.",
      "Harm and recovery: absorb shifts with boxes and consequences, describe the fiction, and let recovery depend on time, treatment, and narrative permission.",
      "Concession and final moments: conceding before being taken out preserves control over the cost; a heroic last stand can end a character while improving the timeline.",
    ],
    enUse: "Show the space and possible consequences before a conflict starts. Against monsters or countdowns, a contest or challenge can clarify the objective better than adding more enemies.",
  }),
  bookMapChapter({
    id: "cthulhu-milestones",
    ptTitle: "Fate of Cthulhu: marcos e avanço",
    enTitle: "Fate of Cthulhu: milestones and advancement",
    pages: "Páginas 49–50",
    ptIntro: "O avanço acompanha tanto a trajetória pessoal quanto as mudanças no futuro. Marcos menores ajustam detalhes entre cenas; marcos maiores alteram capacidades e permitem que as pessoas sobrevivam ao crescimento da ameaça.",
    ptSections: [
      "Marco menor: recuperar pontos de destino, ajustar uma perícia em posição equivalente, trocar uma façanha quando a ficção justificar e atualizar um aspecto que mudou.",
      "Marco maior: aumentar uma perícia, trocar uma façanha, alterar uma consequência ou outro elemento importante da personagem quando a história realmente virou.",
      "Mudança de linha temporal: lidar com um evento importante gera um marco maior e pode abrir uma nova façanha ou corrupção quando a escolha cobra esse preço.",
      "Ritmo: o Narrador usa marcos para reconhecer decisões que mudaram a cadeia causal, não apenas o número de combates vencidos.",
    ],
    ptUse: "Faça o avanço responder à pergunta da missão: o que esta pessoa aprendeu, perdeu ou decidiu preservar? Um marco deve tornar a próxima parte da campanha diferente.",
    enIntro: "Advancement follows both personal growth and changes to the future. Minor milestones adjust details between scenes; major milestones change capabilities and let characters survive the threat’s escalation.",
    enSections: [
      "Minor milestone: refresh fate points, adjust a skill at an equivalent rung, swap a stunt when fiction supports it, and update an aspect that changed.",
      "Major milestone: raise a skill, swap a stunt, alter a consequence, or change another major character element when the story truly turns.",
      "Timeline change: resolving a major event creates a major milestone and can open a new stunt or corruption when the choice carries that price.",
      "Pacing: the Game Master uses milestones to recognize decisions that changed causality, not only fights the group won.",
    ],
    enUse: "Let advancement answer the mission’s question: what did this person learn, lose, or choose to protect? A milestone should make the next part of the campaign different.",
  }),
  bookMapChapter({
    id: "cthulhu-great-old-one-technology",
    ptTitle: "Fate of Cthulhu: tecnologia dos Grandes Antigos",
    enTitle: "Fate of Cthulhu: Great Old One technology",
    pages: "Páginas 51–57",
    ptIntro: "O oculto aparece como uma tecnologia alienígena que exige conhecimento, preparação e risco. Rituais e feitiços podem resolver o impossível, mas a tentativa traz retorno, reação e corrupção para a ficção.",
    ptSections: [
      "Adquirir magia: encontrar fragmentos, artefatos, fórmulas e especialistas durante a campanha; nada é concedido só porque a pessoa anotou um nome na ficha.",
      "Executar magia: definir intenção e procedimento, escolher a perícia (em geral Conhecimento), enfrentar dificuldade e aceitar que poder e perigo caminham juntos.",
      "Reação: falha ou uso inadequado pode produzir uma reação sobrenatural; defender-se exige Conhecimento ou a perícia indicada pela ficção.",
      "Rituais: efeitos coletivos e demorados, com participantes, componentes, sacrifícios, tempo e uma forma clara de interromper ou corromper o processo.",
      "Feitiços: efeitos rápidos e específicos, com custo maior e risco de corrupção; eles são segredos que precisam ser descobertos no jogo.",
      "Exemplos de tecnologia: deslocar-se no tempo, abrir caminhos, comandar criaturas e alterar matéria, sempre tratando o artefato como parte da história, não como uma lista de bônus.",
    ],
    ptUse: "Apresente a magia como escolha com preço visível. O Fate Condensado continua oferecendo a base; esta expansão só entra quando a Mesa quiser que o conhecimento dos Grandes Antigos seja uma ferramenta perigosa.",
    enIntro: "The occult is presented as alien technology that demands knowledge, preparation, and risk. Rituals and spells can solve the impossible, but attempts bring backlash and corruption into the fiction.",
    enSections: [
      "Acquire magic: find fragments, artifacts, formulae, and specialists during play; a name on the sheet is not a free entitlement.",
      "Perform magic: state the intent and procedure, choose a skill (usually Lore), face a difficulty, and accept that power and danger travel together.",
      "Backlash: failure or misuse can create a supernatural reaction; defend with Lore or the skill the fiction makes appropriate.",
      "Rituals: slow, group-scale effects with participants, components, sacrifices, time, and a clear way to interrupt or corrupt the process.",
      "Spells: quick, specific effects with a higher cost and corruption risk; they are secrets discovered in play.",
      "Technology examples: time travel, opening paths, commanding creatures, and changing matter, treating each artifact as story material rather than a bonus list.",
    ],
    enUse: "Present magic as a choice with a visible price. Fate Condensed remains the foundation; this expansion enters only when the table wants Great Old One knowledge to be a dangerous tool.",
  }),
  bookMapChapter({
    id: "cthulhu-corruption",
    ptTitle: "Fate of Cthulhu: corrupção",
    enTitle: "Fate of Cthulhu: corruption",
    pages: "Páginas 58–68",
    ptIntro: "Corrupção mede a transformação causada por viajar pelo tempo, tocar tecnologia alienígena ou aceitar o poder dos inimigos. Ela não é sinônimo de doença mental: é a linguagem de mudança corporal, moral e cósmica que pode ser recusada, narrada e discutida.",
    ptSections: [
      "Manifestações: alterações físicas, pensamentos estranhos, novas percepções, marcas visíveis e efeitos que podem começar pequenos e se tornar impossíveis de esconder.",
      "Trilha de corrupção: quatro espaços são preenchidos quando a regra pede; o relógio limpa com dificuldade e só volta ao vazio em situações específicas.",
      "Preencher a trilha: usar uma façanha de corrupção, viajar no tempo, pagar um efeito de tecnologia, sofrer certas reações ou aceitar uma consequência indicada pela história.",
      "Encher a trilha: ao marcar o quarto espaço, a pessoa corrompe um aspecto, limpa o relógio e recebe uma nova façanha de corrupção; se não houver aspecto, a personagem cai sob o poder do Grande Antigo.",
      "Aspectos corrompidos: continuam verdadeiros e úteis, mas tornam a pessoa um alvo mais legível para forçadas e complicações; a corrupção é permanente sem intervenção dos companheiros.",
      "Façanhas de corrupção: aproximadamente duas vezes mais poderosas que uma façanha comum, não custam recarga, mas cada uso marca corrupção; exemplos incluem voo, visão em quatro dimensões, sangue impossível e conhecimento de Yith.",
      "Exemplos e consentimento: o capítulo oferece modelos prontos, mas a Mesa deve escolher o que quer mostrar e pode interromper uma transformação a qualquer momento.",
    ],
    ptUse: "Use a corrupção para dramatizar escolhas, não para retirar controle. Combine antes como mudanças serão descritas, mantenha a possibilidade de pausa e faça cada poder responder ao preço que ele cobra.",
    enIntro: "Corruption tracks changes caused by time travel, alien technology, and accepting an enemy’s power. It is not a synonym for mental illness: it is a language for bodily, moral, and cosmic change that can be negotiated and discussed.",
    enSections: [
      "Manifestations: physical changes, strange thoughts, new perceptions, visible marks, and effects that can begin small and become impossible to hide.",
      "Corruption clock: four spaces fill when the rules call for it; the clock is difficult to clear and returns to empty only in specific situations.",
      "Filling the clock: use a corruption stunt, travel through time, pay for alien technology, suffer certain reactions, or accept a story-defined cost.",
      "Filling the clock: on the fourth mark, corrupt an aspect, clear the clock, and gain a new corruption stunt; with no aspect left, the character falls under the Great Old One’s power.",
      "Corrupted aspects: remain true and useful, but make the character a clearer target for compels and complications; corruption is permanent without help from companions.",
      "Corruption stunts: roughly twice as potent as normal stunts, costing no refresh but marking corruption on use; examples include flight, four-dimensional sight, impossible blood, and Yithian knowledge.",
      "Examples and consent: the chapter supplies models, but the table chooses what to show and may pause a transformation at any time.",
    ],
    enUse: "Use corruption to dramatize choices, not remove control. Agree on how changes are described, keep a pause available, and make every power answer to the price it demands.",
  }),
  bookMapChapter({
    id: "cthulhu-minions",
    ptTitle: "Fate of Cthulhu: lacaios dos Grandes Antigos",
    enTitle: "Fate of Cthulhu: minions of the Old Ones",
    pages: "Páginas 69–73",
    ptIntro: "Os inimigos da campanha variam de pessoas infiltradas a monstros que atravessam o tempo. As fichas de exemplo mostram como usar a Regra de Bronze e as ferramentas de adversários sem transformar todo encontro em uma batalha igual.",
    ptSections: [
      "Os Corrompidos: humanos alterados por rituais, cruzamentos ou exposição; alguns se passam por pessoas comuns e outros já são monstros visíveis.",
      "Os Cães: pesadelos interdimensionais atraídos pela energia da viagem temporal, com língua-serra e capacidade de surgir onde a ciência falha.",
      "Organizações: A Fazenda como inteligência e possível aliada, os Vigilantes de Deus como milícia apocalíptica e a Ordem da Mão Invisível como culto infiltrado.",
      "Construção: use as regras de PdN do Fate Condensado ou do Fate Adversary Toolkit; dê aos adversários uma função, uma maneira de pressionar e uma forma de sair de cena.",
      "Aliados ambíguos: uma organização pode oferecer recursos e ainda exigir preço, amostra, lealdade ou silêncio; confiança é uma decisão, não um atributo automático.",
    ],
    ptUse: "Misture oposição humana, institucional e monstruosa. O contraste entre um aliado que pede algo estranho e um monstro que todos reconhecem mantém o horror em movimento sem depender só da aparência.",
    enIntro: "Campaign enemies range from infiltrated people to monsters that cross time. The sample profiles show how to use the Fate Fractal and adversary tools without turning every encounter into an equal fight.",
    enSections: [
      "The Corrupted: humans changed by rituals, breeding, or exposure; some pass as ordinary people while others are visibly monstrous.",
      "The Hounds: interdimensional nightmares drawn to time-travel energy, with a chainsaw tongue and the ability to appear where science fails.",
      "Organizations: the Farm as intelligence and possible patron, the Watchers of God as an apocalyptic militia, and the Order of the Unseen Hand as an infiltrating cult.",
      "Construction: use Fate Condensed or Fate Adversary Toolkit NPC rules; give each adversary a role, a way to create pressure, and a clear way to leave the scene.",
      "Ambiguous allies: an organization can provide resources while demanding a price, sample, loyalty, or silence; trust is a choice, not an automatic trait.",
    ],
    enUse: "Mix human, institutional, and monstrous opposition. The contrast between an ally asking for something strange and a monster everyone recognizes keeps horror moving without relying on appearance alone.",
  }),
  bookMapChapter({
    id: "cthulhu-time-travel",
    ptTitle: "Fate of Cthulhu: voltar no tempo",
    enTitle: "Fate of Cthulhu: traveling back in time",
    pages: "Páginas 74–80",
    ptIntro: "A viagem temporal é um compromisso de missão: os heróis atravessam a ligação com Yog-Sothoth, chegam sem equipamento e precisam sobreviver ao primeiro minuto antes de começar a alterar a história.",
    ptSections: [
      "A viagem vai ao passado, não a um futuro distante: voltar é considerado menos destrutivo do que observar todas as possibilidades e ser remontado depois.",
      "Custo: a ligação com Yog-Sothoth deixa uma marca de corrupção em quem atravessa; animais e objetos não atravessam como uma pessoa viva integrada ao próprio corpo.",
      "Chegada: roupas, armas, dinheiro e identificação não vêm junto; a primeira tarefa é avaliar o corpo, encontrar abrigo, conseguir roupas e resolver a identidade.",
      "Paradoxo subjetivo: o passado pessoal continua sendo lembrado pelo viajante mesmo quando a linha temporal anterior deixa de existir; mudanças podem apagar eventos que eram parte da biografia de alguém.",
      "Leis do tempo: alterações criam ramificações e efeitos retroativos, mas não obrigam a Mesa a simular cada possibilidade; use a regra para produzir escolhas e consequências compreensíveis.",
      "Briefing da resistência: a equipe conhece quatro eventos decisivos que precisam ser interrompidos, mas descobre durante o jogo que a informação pode estar incompleta ou já ter sido alterada.",
    ],
    ptUse: "Trate a chegada como uma cena de sobrevivência curta e concreta, não como punição cômica. O que falta ao viajante deve criar uma escolha interessante e abrir uma conexão com o lugar onde a missão começa.",
    enIntro: "Time travel is a mission commitment: heroes cross a connection with Yog-Sothoth, arrive without equipment, and must survive the first minutes before changing history.",
    enSections: [
      "Travel goes to the past, not a distant future: returning is considered safer than experiencing every future permutation and being stitched together afterward.",
      "Cost: the connection with Yog-Sothoth leaves a mark of corruption; animals and objects do not cross like a living person integrated with their own body.",
      "Arrival: clothes, weapons, money, and identification do not come along; the first job is to check the body, find shelter, obtain clothes, and solve identity.",
      "Subjective paradox: the traveler remembers their personal past even when the former timeline no longer exists; changes can erase events that were part of a life story.",
      "Laws of time: changes create branches and retroactive effects, but the table need not simulate every possibility; use the rule to produce understandable choices and consequences.",
      "Resistance briefing: the team knows four decisive events to disrupt, then discovers that information may be incomplete or already changed.",
    ],
    enUse: "Play arrival as a short, concrete survival scene rather than a joke or punishment. What the traveler lacks should create an interesting choice and a connection to the mission’s starting place.",
  }),
  bookMapChapter({
    id: "cthulhu-reading-timeline",
    ptTitle: "Fate of Cthulhu: ler uma linha temporal",
    enTitle: "Fate of Cthulhu: reading a timeline",
    pages: "Páginas 81–86",
    ptIntro: "A linha temporal é o mapa vivo da campanha. Ela organiza quatro eventos que levam à ascensão e um quinto evento final, mas os eventos não formam uma fila: cada um pode ser abordado quando a Mesa enxerga uma oportunidade.",
    ptSections: [
      "Aspecto de linha temporal: o conceito dramático do evento permanece em jogo e pode ser invocado ou forçado em qualquer cena com justificativa.",
      "Catalisadores: Pessoa, Lugar, Coisa e Inimigo; cada um recebe +, 0 ou –, indicando quanto favorece ou ameaça a humanidade.",
      "Informação oculta: colchetes indicam catalisadores que os jogadores ainda não conhecem ou que podem estar errados até a investigação revelar a situação real.",
      "Avaliação do evento: some os quatro símbolos como dados Fate; de Horrível (–4) a Ótimo (+4), o total orienta a gravidade, não determina sozinho o desfecho.",
      "Trilha da linha temporal: oito caixas, quatro para o Grande Antigo e quatro para a Resistência; corrupção, forçadas e vitórias preenchem lados diferentes.",
      "Ondas: ao completar um lado, marque uma onda + ou – e limpe as caixas; no fim da aventura, aplique a onda alterando catalisadores de eventos futuros.",
      "Ascensão: o evento Rise of the Great Old One começa em situação terrível e é o alvo mínimo; mesmo uma vitória parcial pode deixar a humanidade em condição melhor.",
    ],
    ptUse: "Mostre somente o que os personagens teriam como saber e deixe espaço para a linha reagir. A onda não é uma recompensa abstrata: ela deve mudar quem, onde, o quê ou quem se opõe na próxima missão.",
    enIntro: "The timeline is the campaign’s living map. It organizes four events leading to an ascension and a fifth final event, but the events are not a queue: the table can approach any one when it sees an opening.",
    enSections: [
      "Timeline aspect: the event’s dramatic concept stays in play and can be invoked or compelled in any justified scene.",
      "Catalysts: Person, Place, Thing, and Foe; each gets +, 0, or –, showing how much it favors or threatens humanity.",
      "Hidden information: brackets mark catalysts players do not yet know or that may be wrong until investigation reveals the actual situation.",
      "Event rating: add the four symbols like Fate dice; from Horrifying (–4) to Great (+4), the total guides severity without deciding the ending alone.",
      "Timeline track: eight boxes, four for the Great Old One and four for the Resistance; corruption, compels, and victories fill different sides.",
      "Ripples: when one side fills, mark a + or – ripple and clear the boxes; after the adventure, apply it by changing catalysts in future events.",
      "Ascension: the Rise of the Great Old One begins in a terrible state and is the minimum target; even a partial victory can leave humanity better off.",
    ],
    enUse: "Show only what characters could know and leave room for the timeline to react. A ripple is not an abstract reward: it changes who, where, what, or who opposes the next mission.",
  }),
  bookMapChapter({
    id: "cthulhu-timeline-cthulhu",
    ptTitle: "Fate of Cthulhu: a linha temporal de Grande Cthulhu",
    enTitle: "Fate of Cthulhu: Great Cthulhu’s timeline",
    pages: "Páginas 87–112",
    ptIntro: "A ilha de R’lyeh emerge no Pacífico e o olhar de Grande Cthulhu transforma medo em obediência. A linha temporal liga artefatos, corpos, arquitetura impossível e uma seita global ao despertar de uma consciência que quer tocar toda a eternidade.",
    ptSections: [
      "A chegada e a ascensão: R’lyeh, os Corrompidos e o efeito mental de perceber Cthulhu estabelecem a escala do apocalipse.",
      "The Stuff That Dreams Are Made Of: uma efígie do deus passa por leilão, assassinatos e mãos de cultistas; retirar o artefato muda a preparação do despertar.",
      "Bytes and Bodies: rituais incompletos circulam pela internet, cadáveres somem e o hacker C00l@ir precisa ser encontrado antes que os arquivos se completem.",
      "The Mother Art Is Architecture: um concreto impossível e um complexo em Auckland funcionam como antena ritual; os cientistas e a construção são alvos diferentes.",
      "The Great Serpent’s Lament: Alphonze LéBon, sua igreja e a Red Magdalena transformam fé, identidade e uma morte já ocorrida em uma armadilha temporal.",
      "Agenda do Grande Cthulhu: tocar a eternidade, despertar do sonho, elevar R’lyeh e enredar todas as mentes; táticas incluem o Chamado de Cthulhu, Corrompidos e instrumentos inocentes de um Estado corrompido.",
      "Adversários e apoio: ghouls, cultistas, servitors e instituições humanas dão rosto local a uma ameaça que pode estar em qualquer pessoa.",
    ],
    ptUse: "Faça cada evento responder a um tipo de investigação diferente: objeto, rede, lugar e culto. O tema de Cthulhu é escala e influência; deixe o grupo perceber que vencer uma luta não basta para silenciar o chamado.",
    enIntro: "R’lyeh rises in the Pacific and Great Cthulhu’s gaze turns fear into obedience. The timeline links artifacts, bodies, impossible architecture, and a worldwide cult to a consciousness that wants to touch all eternity.",
    enSections: [
      "Arrival and rise: R’lyeh, the Corrupted, and the mental effect of perceiving Cthulhu establish the apocalypse’s scale.",
      "The Stuff That Dreams Are Made Of: an effigy passes through auction, murders, and cultist hands; removing it changes the awakening’s preparation.",
      "Bytes and Bodies: incomplete rituals spread online, corpses disappear, and hacker C00l@ir must be found before the files are completed.",
      "The Mother Art Is Architecture: impossible concrete and an Auckland complex act as a ritual antenna; the scientists and the structure are separate targets.",
      "The Great Serpent’s Lament: Alphonze LéBon, his church, and the Red Magdalena turn faith, identity, and an already completed murder into a temporal trap.",
      "Great Cthulhu’s agenda: touch eternity, wake from the dream, raise R’lyeh, and enthrall every mind; tactics include the Call of Cthulhu, the Corrupted, and innocent instruments of a corrupt state.",
      "Opposition and support: ghouls, cultists, servitors, and human institutions give local faces to a threat that can be anyone.",
    ],
    enUse: "Let each event demand a different kind of investigation: object, network, place, and cult. Cthulhu’s theme is scale and influence; let the group see that winning a fight is not enough to silence the call.",
  }),
  bookMapChapter({
    id: "cthulhu-timeline-dagon",
    ptTitle: "Fate of Cthulhu: a linha temporal de Dagon",
    enTitle: "Fate of Cthulhu: Dagon’s timeline",
    pages: "Páginas 113–136",
    ptIntro: "Uma cura para uma pandemia cria a porta para uma mutação mundial. Dagon trabalha por infiltração, saúde pública e medo do mar, até que híbridos e a Mãe Hydra possam fundar um reino no fundo do oceano.",
    ptSections: [
      "A chegada e a ascensão: a praga de MRSA, a ilha que rompe a água e os híbridos Profundos fazem a transformação parecer primeiro uma solução e depois uma condenação.",
      "Do No Harm: Dr. Amanda Wesson e o medicamento Palliagil salvam vidas, mas proteínas contaminadas escondem a origem da mutação; salvar a médica e interromper a distribuição são escolhas distintas.",
      "Down to a Sunless Sea: navios desaparecem e o litoral vira uma investigação de resgates, marés e criaturas que não deveriam caminhar em terra.",
      "Last Train to Innsmouth: uma viagem e a cidade de Innsmouth conectam conspiração, cidadania e a hora em que uma comunidade inteira deixa de ser apenas humana.",
      "Mother Hydra Sleeps: a entidade submarina orienta seus filhos e torna o sono, a transmissão e o isolamento parte da ameaça.",
      "Agenda de Dagon: criar um reino inconquistável no fundo do mar; metas incluem espalhar híbridos, controlar a cura e preparar território, enquanto agentes Profundos e xenofobia pressionam a Mesa.",
      "Apoio e oposição: Deep One, Deep One Agent, cidadão de Innsmouth, Mother Hydra e os blocos de ‘do no harm’ e ‘smashing things to pieces’ oferecem escalas diferentes de cena.",
    ],
    ptUse: "Mantenha a doença e a identidade separadas como perguntas. A linha fica mais humana quando os jogadores precisam decidir quem proteger, o que revelar e se uma cura que funciona ainda pode ser usada.",
    enIntro: "A cure for a pandemic opens the door to worldwide mutation. Dagon works through infiltration, public health, and fear of the sea until hybrids and Mother Hydra can build a kingdom beneath the waves.",
    enSections: [
      "Arrival and rise: the MRSA plague, the island breaking the surface, and Deep One hybrids make transformation look like salvation before it becomes condemnation.",
      "Do No Harm: Dr. Amanda Wesson and Palliagil save lives, but contaminated proteins hide the mutation’s origin; saving the doctor and stopping distribution are different choices.",
      "Down to a Sunless Sea: ships disappear and the coast becomes an investigation of rescues, tides, and creatures that should not walk on land.",
      "Last Train to Innsmouth: a journey and Innsmouth connect conspiracy, citizenship, and the moment a community stops being merely human.",
      "Mother Hydra Sleeps: the underwater entity guides her children and makes sleep, transmission, and isolation part of the threat.",
      "Dagon’s agenda: create an unconquerable kingdom beneath the sea; goals include spreading hybrids, controlling the cure, and preparing territory while Deep One agents and xenophobia pressure the table.",
      "Support and opposition: Deep Ones, agents, Innsmouth citizens, Mother Hydra, and the ‘do no harm’ and ‘smashing things to pieces’ modes support different scene scales.",
    ],
    enUse: "Keep disease and identity as separate questions. The timeline becomes human when players must decide whom to protect, what to reveal, and whether a cure that works can still be used.",
  }),
  bookMapChapter({
    id: "cthulhu-timeline-shub-niggurath",
    ptTitle: "Fate of Cthulhu: a linha temporal de Shub-Niggurath",
    enTitle: "Fate of Cthulhu: Shub-Niggurath’s timeline",
    pages: "Páginas 137–162",
    ptIntro: "Shub-Niggurath cobre o mundo com filhos, zonas de segurança cada vez menores e propostas que parecem úteis. A resistência precisa distinguir o pacto que compra tempo da convocação que abre uma passagem para algo muito maior.",
    ptSections: [
      "A chegada e a ascensão: a Mãe de Mil Filhos e seus descendentes tomam a superfície, enquanto os poucos abrigos sobreviventes desaparecem um a um.",
      "Cash on Delivery: cultos e compradores buscam o Necronomicon; barganhas e entregas transformam conhecimento em moeda e risco.",
      "Dry Run on Bald Mountain: crianças de Shub-Niggurath e agentes mortais testam um ritual antes de liberar sua escala real; a Mesa pode explorar o ensaio, seus participantes e o local.",
      "The Thousand Young: a espera dos filhos e a presença de Tiolk’thu mostram que a ameaça pode nascer de dentro de uma comunidade que acredita estar negociando segurança.",
      "A Most Exclusive Club: fronteiras entre dimensões ficam finas; o Transdimensional Invader e os membros do clube tornam o impossível social e íntimo.",
      "Agenda de Shub-Niggurath: limpar o mundo de sua sujeira acumulada; metas e táticas incluem empoderar agentes mortais, enviar uma cria, usar o desejo humano e enganar pessoas para convocar um filho.",
      "Adversários de exemplo: Sauer, paramilitares, Sin-Slayer, Skinhead, Waylon Bennett, Tiolk’thu e Spawn of Shub-Niggurath oferecem rostos para ideologia, culto e biologia monstruosa.",
    ],
    ptUse: "Faça as ofertas da entidade parecerem plausíveis antes de revelar o preço. O centro da linha é a agência: quem está escolhendo um atalho e quem está sendo usado como catalisador?",
    enIntro: "Shub-Niggurath covers the world with children, shrinking safe zones, and offers that seem useful. The resistance must distinguish a bargain that buys time from a summons opening a passage for something larger.",
    enSections: [
      "Arrival and rise: the Mother of a Thousand Young and her descendants take the surface while the few surviving havens disappear.",
      "Cash on Delivery: cults and buyers seek the Necronomicon; bargains and deliveries turn knowledge into currency and risk.",
      "Dry Run on Bald Mountain: Shub-Niggurath’s children and mortal agents test a ritual before releasing its full scale; the table can explore its participants and site.",
      "The Thousand Young: waiting children and Tiolk’thu show that the threat can be born inside a community that believes it is negotiating safety.",
      "A Most Exclusive Club: boundaries between dimensions grow thin; the Transdimensional Invader and club members make the impossible social and intimate.",
      "Shub-Niggurath’s agenda: cleanse the world of its accumulated filth; goals and tactics include empowering mortal agents, sending a spawn, exploiting human desire, and tricking people into summoning a child.",
      "Sample opposition: Sauer, paramilitary operatives, Sin-Slayer, Skinhead, Waylon Bennett, Tiolk’thu, and Spawn of Shub-Niggurath give ideology, cult, and monstrous biology faces.",
    ],
    enUse: "Make the entity’s offers plausible before revealing their cost. The timeline’s center is agency: who is choosing a shortcut, and who is being used as a catalyst?",
  }),
  bookMapChapter({
    id: "cthulhu-timeline-nyarlathotep",
    ptTitle: "Fate of Cthulhu: a linha temporal de Nyarlathotep",
    enTitle: "Fate of Cthulhu: Nyarlathotep’s timeline",
    pages: "Páginas 163–190",
    ptIntro: "O presidente do Egito se declara Faraó Sombrio, enquanto sonhos, agentes e promessas transformam medo em poder político. Nyarlathotep raramente precisa vencer uma luta: ele quer que alguém aceite o acordo errado.",
    ptSections: [
      "A chegada e a ascensão: o Faraó Sombrio, o frio profundo e a guerra pública escondem uma disputa por medo e esperança.",
      "Deep Freeze: a Antártida e um evento climático extremo atraem expedições, criaturas ancestrais e uma investigação que pode congelar a verdade.",
      "The Raising of the King: forças ligadas à sabedoria estelar e o Rei de Amarelo cruzam a linha de Nyarlathotep antes da hora.",
      "Demon at the Crossroads: pactos, artistas, comunidades e escolhas individuais tornam o preço do poder uma cena recorrente.",
      "The Faceless Mother: uma origem sem rosto reúne criaturas, famílias e uma fome que não precisa de identidade para se espalhar.",
      "Agenda de Nyarlathotep: alimentar-se do medo e da desesperança; as táticas fazem aliados, oferecem acordos, criam máscaras e deixam o alvo acreditar que a decisão foi sua.",
      "Adversários de exemplo: Elder Thing, Mi-Go, Starry Wisdom Operative, Blessed, Shoggoth, Reverend Leroy Anderson, Swarm of the Faceless e a própria Faceless Mother.",
    ],
    ptUse: "Dê aos personagens motivos para conversar antes de lutar. Cada acordo deve ser claro o bastante para consentimento e perigoso o bastante para que a Mesa entenda o que está em jogo.",
    enIntro: "The president of Egypt declares himself the Dark Pharaoh while dreams, agents, and promises turn fear into political power. Nyarlathotep rarely needs to win a fight: it wants someone to accept the wrong bargain.",
    enSections: [
      "Arrival and rise: the Dark Pharaoh, deep freeze, and public war conceal a contest over fear and hope.",
      "Deep Freeze: Antarctica and an extreme climate event attract expeditions, ancient creatures, and an investigation that can freeze the truth.",
      "The Raising of the King: Starry Wisdom forces and the King in Yellow cross Nyarlathotep’s timeline early.",
      "Demon at the Crossroads: pacts, artists, communities, and individual choices make the cost of power a recurring scene.",
      "The Faceless Mother: a faceless origin gathers creatures, families, and a hunger that needs no identity to spread.",
      "Nyarlathotep’s agenda: feed on fear and hopelessness; tactics make allies, offer deals, create masks, and let the target believe the decision was theirs.",
      "Sample opposition: Elder Thing, Mi-Go, Starry Wisdom Operative, the Blessed, Shoggoth, Reverend Leroy Anderson, Swarm of the Faceless, and the Faceless Mother herself.",
    ],
    enUse: "Give characters reasons to talk before fighting. Each deal should be clear enough for consent and dangerous enough for the table to understand what is at stake.",
  }),
  bookMapChapter({
    id: "cthulhu-timeline-king-in-yellow",
    ptTitle: "Fate of Cthulhu: a linha temporal do Rei de Amarelo",
    enTitle: "Fate of Cthulhu: the King in Yellow’s timeline",
    pages: "Páginas 191–213",
    ptIntro: "Uma praga incurável e o reino perdido de Carcosa avançam por teatro, sonho, internet e arquitetura. O Rei de Amarelo torna cada imagem uma porta e cada público potencialmente uma população nova.",
    ptSections: [
      "A chegada e a ascensão: Carcosa é refeita sobre cidades humanas e a praga transforma pessoas em cidadãos de um reino impossível.",
      "To Uncover the Conscience of the King: viajantes e investigadores buscam compreender o que existe por trás do Rei, enquanto a missão já parece ter sido interceptada.",
      "Wrapped Up in White Linen and Cold as the Clay: cadáveres e a praga revelam uma propagação que mistura contágio físico e narrativa.",
      "But Stranger Still Is Lost Carcosa: um fragmento em Machu Picchu, o Exército peruano, arqueólogos e a cidade viva transformam o local em um adversário da própria equipe.",
      "Le Roi Est Mort, Vive Le Roi: a Máscara Pálida no Museu Britânico atrai uma manifestação do Rei e transforma a invasão em corrida contra o tempo.",
      "Agenda do Rei de Amarelo: encontrar e remontar Carcosa, obter a Máscara Pálida, manifestar a cidade e repovoá-la com a praga; táticas incluem epidemia, cultos meméticos, a peça e sonhos.",
      "Adversários de exemplo: Lesser e Grotesque Plague-Bearers, Carcosans, a cidade Carcosa e a Manifestation of the King in Yellow.",
    ],
    ptUse: "Separe contágio, obsessão e lugar como três frentes. O mesmo símbolo pode aparecer nos três, mas cada frente pede uma resposta diferente e preserva a possibilidade de os jogadores mudarem o significado.",
    enIntro: "An incurable plague and the lost kingdom of Carcosa advance through theater, dreams, the internet, and architecture. The King in Yellow makes every image a door and every audience a potential new population.",
    enSections: [
      "Arrival and rise: Carcosa is rebuilt over human cities and the plague turns people into citizens of an impossible kingdom.",
      "To Uncover the Conscience of the King: travelers and investigators seek what lies behind the King while the mission appears to have been intercepted.",
      "Wrapped Up in White Linen and Cold as the Clay: corpses and plague reveal a spread blending physical contagion with narrative.",
      "But Stranger Still Is Lost Carcosa: a fragment near Machu Picchu, the Peruvian army, archaeologists, and a living city make the site an opponent of the team itself.",
      "Le Roi Est Mort, Vive Le Roi: the Pallid Mask in the British Museum draws a manifestation of the King and turns the invasion into a race against time.",
      "The King in Yellow’s agenda: find and reassemble Carcosa, claim the Pallid Mask, manifest the city, and repopulate it with the plague; tactics include outbreaks, memetic cults, the play, and dreams.",
      "Sample opposition: Lesser and Grotesque Plague-Bearers, Carcosans, the city of Carcosa, and the Manifestation of the King in Yellow.",
    ],
    enUse: "Separate contagion, obsession, and place into three fronts. The same sign can appear in all three, but each asks for a different response and leaves room for players to change its meaning.",
  }),
  bookMapChapter({
    id: "cthulhu-game-master",
    ptTitle: "Fate of Cthulhu: ser Narrador",
    enTitle: "Fate of Cthulhu: being the Game Master",
    pages: "Páginas 214–218",
    ptIntro: "O Narrador conduz o ritmo, a oposição e as perguntas, mas não é o chefe da Mesa. O capítulo transforma o esqueleto das linhas temporais em sessões jogáveis e oferece uma distribuição simples de pontos de destino.",
    ptSections: [
      "Sessões: abrir com situação concreta, manter o foco no objetivo, dar espaço a investigação e terminar com uma mudança visível.",
      "Dificuldade e oposição: escolha a dificuldade que torna a decisão interessante; evite empilhar números quando um aspecto ou um custo já comunica a ameaça.",
      "PdN: diferencie grandes figuras, personagens menores e monstros; dê a cada um somente as perícias, façanhas e consequências que a cena precisa.",
      "Pontos de destino do Narrador: use uma reserva associada aos personagens para fazer forçadas e reconhecer aspectos, sem transformar o recurso em uma punição automática.",
      "Colaboração: deixe os jogadores narrar fatos compatíveis com seus aspectos e aceite soluções que mudem a premissa sem invalidar a linha temporal.",
    ],
    ptUse: "O melhor horror vem de escolhas informadas. Mostre a pressão, pergunte qual preço a pessoa aceita e deixe a resposta alterar a cena em vez de esconder uma solução correta.",
    enIntro: "The Game Master controls pace, opposition, and questions, but is not the table’s boss. This chapter turns timeline skeletons into playable sessions and offers a simple fate-point pool.",
    enSections: [
      "Sessions: open with a concrete situation, keep the objective visible, make room for investigation, and end with a visible change.",
      "Difficulty and opposition: choose a difficulty that makes the decision interesting; do not stack numbers when an aspect or cost already communicates threat.",
      "NPCs: distinguish major figures, minor characters, and monsters; give each only the skills, stunts, and consequences the scene needs.",
      "Game Master fate points: use a pool associated with the characters to compel and recognize aspects, never as automatic punishment.",
      "Collaboration: let players establish facts compatible with their aspects and accept solutions that change the premise without invalidating the timeline.",
    ],
    enUse: "The best horror comes from informed choices. Show the pressure, ask what price someone accepts, and let the answer change the scene instead of hiding a correct solution.",
  }),
  bookMapChapter({
    id: "cthulhu-campaign-cycle",
    ptTitle: "Fate of Cthulhu: conduzir a campanha",
    enTitle: "Fate of Cthulhu: running the campaign",
    pages: "Páginas 219–239",
    ptIntro: "A campanha passa por um ciclo repetível: escolher a linha, selecionar um evento, jogar a missão, alterar o evento, aplicar ondas ao futuro e seguir para uma consequência nova. O capítulo também mostra como comunicar mudanças sem perder o suspense.",
    ptSections: [
      "O que é público e secreto: dê aos jogadores os catalisadores que seus personagens conheceriam e reserve apenas o que realmente sustenta a descoberta.",
      "Ciclo da linha temporal: escolher ou criar personagens e linha, escolher um evento, jogar, mudar o evento e mudar o futuro por meio das ondas.",
      "Múltiplas ondas e não desfazer tudo: alterações acumulam-se; o futuro novo deve ser jogado como consequência, não corrigido para voltar ao plano inicial.",
      "Sempre há esperança: uma linha pode ficar ruim sem ser encerrada; conquistas parciais, sacrifícios e escolhas melhores ainda alteram a conclusão.",
      "Desfecho e epílogo: quando o evento final chega, mostre a vida que a equipe tornou possível e pergunte como cada personagem fica nessa versão do mundo.",
      "Usar eventos em jogo: aspectos, catalisadores e cenas-chave viram investigações, perseguições, conflitos, fugas e confrontos com a agenda do Grande Antigo.",
      "Comunicar o futuro: introduza viajantes, briefings entre missões, visões, ataques temporais e sinais de que uma agenda inimiga também está reagindo.",
      "Agenda em jogo: ambição, metas e táticas dão ao Narrador respostas concretas para a ação dos personagens sem tirar a capacidade de improvisar.",
    ],
    ptUse: "Depois de cada missão, mude ao menos um catalisador de maneira que todos entendam. A campanha fica intuitiva quando a Mesa consegue apontar o que fez, o que isso alterou e por que a próxima missão existe.",
    enIntro: "The campaign repeats a clear cycle: choose the timeline, pick an event, play the mission, change the event, apply ripples to the future, and follow the new consequence. The chapter also shows how to communicate change without losing suspense.",
    enSections: [
      "Public and secret information: give players the catalysts their characters would know and reserve only what genuinely supports discovery.",
      "Timeline cycle: choose or create characters and timeline, pick an event, play it, change it, and change the future through ripples.",
      "Many ripples and do not change things back: alterations accumulate; play the new future as consequence instead of restoring the original plan.",
      "There is always hope: a timeline can become bad without ending; partial victories, sacrifices, and better choices still change the conclusion.",
      "Denouement and epilogue: when the final event arrives, show the life the team made possible and ask where each character stands in that version of the world.",
      "Use events in play: aspects, catalysts, and key scenes become investigations, chases, conflicts, escapes, and confrontations with the Great Old One’s agenda.",
      "Communicate the future: introduce travelers, interstitial briefings, visions, time-lash attacks, and signs that an enemy agenda is reacting too.",
      "Agenda in play: ambition, goals, and tactics give the Game Master concrete responses without removing improvisation.",
    ],
    enUse: "After every mission, change at least one catalyst in a way everyone can understand. The campaign feels intuitive when the table can name what it did, what changed, and why the next mission exists.",
  }),
  bookMapChapter({
    id: "cthulhu-build-apocalypse",
    ptTitle: "Fate of Cthulhu: criar seu próprio apocalipse",
    enTitle: "Fate of Cthulhu: building your own apocalypse",
    pages: "Páginas 240–246",
    ptIntro: "As ferramentas de criação permitem trocar o Grande Antigo, o tema e a cadeia causal sem abandonar o formato de cinco eventos. O resultado deve ser uma ameaça que a Mesa compreende o suficiente para enfrentar e adaptar.",
    ptSections: [
      "Escolha a forma do destruidor: selecione ou invente uma entidade com presença, desejo e maneira de aparecer no mundo.",
      "Use o mito existente: adapte nomes, símbolos e obras com cuidado, reconhecendo a origem e mantendo a própria proposta da Mesa.",
      "Crie o Grande Antigo: defina a ambição, o que ele quer, que preço oferece e quais imagens ou instituições tornam sua presença concreta.",
      "Roadmap to Destruction: escreva quatro eventos antecedentes e um evento Rise; dê a cada um aspecto de linha temporal e quatro catalisadores.",
      "Catalisadores e cenas: escolha pessoas, lugares, coisas e inimigos que possam ser investigados, negociados, destruídos ou transformados.",
      "Agenda: crie metas e táticas que respondam aos personagens; revise o conjunto para evitar repetição, solução única ou conteúdo que a Mesa não quer jogar.",
    ],
    ptUse: "Crie primeiro a pergunta humana — o que ainda vale salvar? — e só depois o monstro. Se uma diferença entrar em conflito com o Fate Condensado, mantenha a regra principal e marque a variação como opção desta expansão.",
    enIntro: "The creation tools let you change the Great Old One, theme, and causal chain without leaving the five-event format. The result should be a threat the table can understand well enough to face and adapt.",
    enSections: [
      "Choose the destructor’s form: select or invent an entity with a presence, desire, and way to appear in the world.",
      "Use the existing mythos: adapt names, symbols, and works carefully, acknowledging origins while preserving the table’s own premise.",
      "Craft the Elder God: define its ambition, what it wants, what price it offers, and which images or institutions make its presence concrete.",
      "Roadmap to Destruction: write four preceding events and a Rise event; give each a timeline aspect and four catalysts.",
      "Catalysts and scenes: choose people, places, things, and foes that can be investigated, negotiated with, destroyed, or transformed.",
      "Agenda: create goals and tactics that respond to the characters; review the set for repetition, single solutions, or content the table does not want.",
    ],
    enUse: "Start with the human question—what is still worth saving?—and only then design the monster. If a difference conflicts with Fate Condensed, keep the principal rule and mark the variation as this expansion’s option.",
  }),
  bookMapChapter({
    id: "cthulhu-sample-characters-sheets",
    ptTitle: "Fate of Cthulhu: personagens de exemplo e folhas",
    enTitle: "Fate of Cthulhu: sample characters and sheets",
    pages: "Páginas 247–258",
    ptIntro: "O apêndice reúne Cassandra, a ex-cultista, Charles, o cientista arcano, e outras fichas que mostram como combinar origem temporal, perícias, façanhas e corrupção. O índice e as folhas finais ajudam a levar a estrutura para a Mesa sem reescrever o livro.",
    ptSections: [
      "Cassandra, a Ex-Cultista: um exemplo de passado comprometido, relações e façanhas que tornam a redenção jogável.",
      "Charles, o Cientista Arcano: um exemplo de personagem técnico, magia como ferramenta e corrupção como preço de conhecimento.",
      "Outros elementos de ficha: aspectos, perícias, façanhas, estresse, consequências, recarga e corrupção aparecem em um formato pronto para consulta.",
      "Índice: localiza regras, entidades, eventos, pessoas e termos sem criar um segundo nome para o mesmo conceito.",
      "Folha de personagem e folha de linha temporal: registram a informação pública, os catalisadores, os símbolos da trilha e as mudanças depois de cada missão.",
    ],
    ptUse: "Use as fichas como referência de escala. Ao criar uma personagem nova, conserve a mesma clareza: uma frase de promessa, um preço, poucas exceções e uma conexão visível com a linha escolhida.",
    enIntro: "The appendix gathers Cassandra the Former Cultist, Charles the Arcane Scientist, and other sheets showing how temporal origin, skills, stunts, and corruption combine. The index and final sheets help bring the structure to the table without rewriting the book.",
    enSections: [
      "Cassandra the Former Cultist: an example of compromised history, relationships, and stunts that make redemption playable.",
      "Charles the Arcane Scientist: an example of a technical character, magic as a tool, and corruption as the price of knowledge.",
      "Sheet elements: aspects, skills, stunts, stress, consequences, refresh, and corruption appear in a ready reference format.",
      "Index: locates rules, entities, events, people, and terms without creating a second name for the same concept.",
      "Character sheet and timeline sheet: record public information, catalysts, track symbols, and changes after each mission.",
    ],
    enUse: "Use the sheets as a scale reference. When creating a new character, keep the same clarity: one promise, one price, few exceptions, and a visible connection to the chosen timeline.",
  }),
];

const fateSpaceToolkitChapters = [
  bookMapChapter({
    id: "space-toolkit-introduction",
    ptTitle: "Fate Space Toolkit: introdução e plausibilômetro",
    enTitle: "Fate Space Toolkit: introduction and plausibilometer",
    pages: "Páginas 4–10",
    ptIntro: "Fate Space Toolkit é um manual de ferramentas para ficção científica espacial, da exploração de alta plausibilidade à ópera espacial. A obra pede Fate Core; neste site, ela é uma expansão opcional que pode ser adaptada ao Fate Condensado somente quando a Mesa escolher.",
    ptSections: [
      "A série Fate Toolkit: livros de ferramentas oferecem peças temáticas para montar um jogo, não uma nova regra principal.",
      "A promessa do livro: criar jogos no espaço, decidir como a viagem funciona, tornar combates consistentes e construir alienígenas e mundos.",
      "O plausibilômetro: uma escala de alta, média e baixa plausibilidade que comunica o quanto a Mesa quer respeitar ciência, extrapolar tecnologia ou abraçar o impossível.",
      "Caixas-pretas: uma tecnologia pode ser aceita sem explorar todas as suas consequências; a escolha precisa ser explícita e compartilhada.",
      "Como usar o livro: consulte a ferramenta necessária para a premissa atual, em vez de ativar todas as regras de uma vez.",
    ],
    ptUse: "Defina o nível de plausibilidade antes de calcular viagens ou criar uma espécie. O objetivo é alinhar expectativas e manter o ritmo da história, não testar conhecimento científico de ninguém.",
    enIntro: "Fate Space Toolkit is a tool manual for space science fiction, from high-plausibility exploration to space opera. It calls for Fate Core; on this site it is an optional expansion that can be adapted to Fate Condensed only when the table chooses it.",
    enSections: [
      "The Fate Toolkit series: themed toolbooks offer pieces for building a game, not a new principal ruleset.",
      "The book’s promise: create space games, decide how travel works, make fights consistent, and build aliens and worlds.",
      "The plausibilometer: high, medium, and low plausibility communicate how closely the table wants to follow science, extrapolate technology, or embrace the impossible.",
      "Black boxes: a technology can be accepted without exploring every consequence; the choice should be explicit and shared.",
      "How to use the book: reach for the tool the current premise needs instead of enabling every rule at once.",
    ],
    enUse: "Set plausibility before calculating travel or creating a species. The goal is shared expectations and story momentum, not testing anyone’s science knowledge.",
  }),
  bookMapChapter({
    id: "space-creating-game",
    ptTitle: "Fate Space Toolkit: criar um jogo espacial",
    enTitle: "Fate Space Toolkit: creating a Fate Space game",
    pages: "Páginas 11–22",
    ptIntro: "A criação do cenário começa com conversa, não com uma tabela. A Mesa define a premissa, o escopo e a relação entre personagens, tecnologia, sociedades e espaço antes de decidir quais detalhes precisam de regra.",
    ptSections: [
      "Brainstorming: discuta obras de referência, conexões entre personagens, tecnologia desejada, atividades centrais, tipos de alienígena e limites de conteúdo.",
      "Pitch: escreva uma frase que diga o que os personagens fazem, por que isso importa e que tipo de aventura o espaço permite.",
      "Escopo e extensão: escolha se o jogo acompanha uma nave, um sistema, uma fronteira ou a galáxia; defina o que fica fora da lente.",
      "Tom, escala e período: pessoal ou épico, próximo ou distante, histórico alternativo ou futuro; cada escolha muda o peso de aspectos e marcos.",
      "Questões e aspectos: transforme conflitos grandes em aspectos de cenário que podem ser invocados, forçados e alterados durante a campanha.",
      "Faces e lugares: apresente instituições, pessoas, mundos e estações que deem ao grupo algo concreto para visitar, proteger ou desafiar.",
      "Mapa espacial: um mapa de nós ou rotas torna distância, risco e escolha visíveis sem exigir uma cartografia completa.",
      "Sociedades alienígenas e regras do cenário: estabeleça como cultura, espécies e tecnologia entram na criação de personagem e na ficção.",
    ],
    ptUse: "Pare quando a Mesa já souber o suficiente para jogar a primeira cena. O resto pode ser uma caixa-preta aberta em jogo, criando detalhes como aspectos quando eles se tornarem importantes.",
    enIntro: "Setting creation begins with conversation, not a table. The group defines premise, scope, and the relationship among characters, technology, societies, and space before deciding which details need rules.",
    enSections: [
      "Brainstorming: discuss reference works, character connections, desired technology, central activities, alien types, and content boundaries.",
      "Pitch: write one sentence saying what characters do, why it matters, and what kind of adventure space allows.",
      "Scope and extent: decide whether the game follows one ship, a system, a frontier, or the galaxy, and what stays outside the lens.",
      "Tone, scale, and period: personal or epic, near or far, alternate history or future; each choice changes how aspects and milestones matter.",
      "Issues and aspects: turn large conflicts into setting aspects that can be invoked, compelled, and changed during play.",
      "Faces and places: introduce institutions, people, worlds, and stations that give the group something concrete to visit, protect, or challenge.",
      "Space map: a node or route map makes distance, risk, and choice visible without requiring complete cartography.",
      "Alien societies and setting rules: establish how culture, species, and technology enter character creation and fiction.",
    ],
    enUse: "Stop when the table knows enough to play the first scene. Everything else can be a black box opened in play, adding details as aspects when they become important.",
  }),
  bookMapChapter({
    id: "space-character-creation",
    ptTitle: "Fate Space Toolkit: criação de personagem",
    enTitle: "Fate Space Toolkit: character creation",
    pages: "Páginas 23–47",
    ptIntro: "O capítulo usa aspectos, perícias, façanhas e extras para tornar o cenário espacial visível na ficha. Ele oferece maneiras de renomear perícias do Fate Core, criar perícias novas e representar espécies, tecnologia, posição e treinamento sem criar uma exceção para cada personagem.",
    ptSections: [
      "Aspectos e Tríade de Fases: conceito, problema e fases podem apontar para mundo natal, espécie, tripulação, instituição e conflito central.",
      "Renomear perícias: adapte Ofícios, Conhecimento, Condução, Atirar e outras ao vocabulário da ficção sem mudar sua função sem uma decisão clara da Mesa.",
      "Perícias novas: Astrogação para rotas, Burocracia para instituições, Comando para liderança, Encontro para interação alienígena, Sobrevivência planetária, Psionismo, Posto e Tripulação espacial.",
      "Perícias situacionais: use uma perícia nova como extra quando o cenário precisa dela, ou substitua uma perícia apenas se isso deixar a atividade central mais clara.",
      "Façanhas: destaque espécie, mundo natal, tecnologia, posição, nave, ambiente e formas especiais de usar uma perícia.",
      "Extras: Nível tecnológico, Classes de ferramentas, Posto e Capacidades alienígenas tornam recursos e diferenças de escala legíveis, com custos e limites explicitados.",
      "Aliens de personagem: uma capacidade alienígena deve ser uma promessa ficcional negociada, não uma desculpa para ganhar bônus em todas as situações.",
    ],
    ptUse: "Escreva primeiro o que a pessoa faz em uma cena e só depois escolha o nome da perícia. Se o mesmo conceito já existe no Fate Condensado, mantenha o nome principal e registre a variação como alias ou opção da expansão.",
    enIntro: "The chapter uses aspects, skills, stunts, and extras to make a space setting visible on the sheet. It offers ways to rename Fate Core skills, create new skills, and represent species, technology, status, and training without an exception for every character.",
    enSections: [
      "Aspects and Phase Trio: concept, trouble, and phases can point to homeworld, species, crew, institution, and central conflict.",
      "Renaming skills: adapt Crafts, Lore, Drive, Shoot, and others to the fiction’s vocabulary without changing function unless the table decides.",
      "New skills: Astrogation for courses, Bureaucracy for institutions, Command for leadership, Encounter for alien interaction, Planetary Survival, Psionics, Rank, and Spacehand.",
      "Situational skills: make a new skill an extra when the setting needs it, or replace a skill only when that makes the central activity clearer.",
      "Stunts: highlight species, homeworld, technology, rank, ship, environment, and special ways to use a skill.",
      "Extras: Tech Level, Tool Classes, Rank, and Alien Abilities make resources and scale differences readable, with costs and limits explicit.",
      "Alien characters: an alien ability is a negotiated fictional promise, not permission to gain a bonus in every situation.",
    ],
    enUse: "Write what a person does in a scene before choosing a skill name. If the concept already exists in Fate Condensed, keep the principal name and record a variant as an alias or expansion option.",
  }),
  bookMapChapter({
    id: "spacecraft-space-travel",
    ptTitle: "Fate Space Toolkit: naves e viagem espacial",
    enTitle: "Fate Space Toolkit: spacecraft and space travel",
    pages: "Páginas 48–74",
    ptIntro: "A viagem pode ser uma linha entre cenas, uma passagem com obstáculos ou uma carreira profissional inteira. O capítulo oferece modelos de mapa, ciência aproximada, FTL, vida no espaço, propriedade e maneiras de transformar uma nave em personagem.",
    ptSections: [
      "Mapa espacial: use mapas de nós para mostrar destinos, conexões, atalhos e lugares que ainda não têm nome.",
      "Viagem e ciência: empuxo e impulso específico orientam aceleração, combustível e tempo; tabelas de impulso ajudam a escolher um tom sem exigir cálculo real.",
      "Viagem interplanetária e relativística: encontros próximos, transferências, efeitos de tempo e referencial podem ser o foco de uma missão ou ficar em segundo plano.",
      "Modos de viagem mais rápida que a luz: hiperespaço, dobra e buracos de minhoca criam premissas distintas para combustível, risco, acesso e controle de rotas.",
      "Modos de viagem: por missão para cenas objetivas, por travessia para uma passagem com etapas e viagem livre para exploração aberta.",
      "Vida no espaço: radiação, vácuo e microgravidade são perigos, aspectos e complicações; defina o quanto o cenário os mostra.",
      "Propriedade e carreira: quem possui a nave, quem paga, que contrato une a tripulação e que obrigação surge em cada porto.",
      "Representar naves: trate a nave como aspecto ou elemento de cenário, conjunto de perícias, façanhas com recarga ou deckplan; use o modelo que combina com o zoom da campanha.",
    ],
    ptUse: "Escolha um único modelo de viagem para a primeira sessão. Misturar mapa, cálculo e cena detalhada só vale a pena quando cada camada responde a uma pergunta diferente.",
    enIntro: "Travel can be a line between scenes, a passage with obstacles, or an entire professional career. The chapter offers map models, approximate science, FTL, life in space, ownership, and ways to make a ship a character.",
    enSections: [
      "Space map: use node maps to show destinations, connections, shortcuts, and places that do not have a name yet.",
      "Travel and science: thrust and specific impulse guide acceleration, fuel, and time; impulse tables help set tone without real-world calculation.",
      "Interplanetary and relativistic travel: close approaches, transfers, time effects, and frames can be a mission focus or stay in the background.",
      "FTL modes: hyperspace, warp, and wormholes create different premises for fuel, risk, access, and route control.",
      "Travel modes: mission-based for objective scenes, passage-based for a journey with stages, and free travel for open exploration.",
      "Life in space: radiation, vacuum, and microgravity are hazards, aspects, and complications; decide how much the setting shows them.",
      "Ownership and careers: who owns the ship, who pays, what contract binds the crew, and what obligation appears at each port.",
      "Statting ships: treat a ship as a setting aspect, a skill set, stunts with refresh, or a deckplan; choose the model that matches campaign zoom.",
    ],
    enUse: "Choose one travel model for the first session. Mixing maps, calculations, and detailed scenes is worthwhile only when each layer answers a different question.",
  }),
  bookMapChapter({
    id: "space-combat",
    ptTitle: "Fate Space Toolkit: combate espacial",
    enTitle: "Fate Space Toolkit: space combat",
    pages: "Páginas 75–95",
    ptIntro: "O combate espacial começa com uma cena legível e termina com a tripulação tomando decisões sob pressão. O toolkit oferece movimento padrão ou por queima, diagramas vetoriais, zonas de alcance, combate em fases e postos de batalha.",
    ptSections: [
      "Passo 1, definir a cena: mapa, corpos celestes, velocidade, objetivos, aspectos e riscos entram antes da primeira rolagem.",
      "Passo 2, ordem de ação: Percepção ou uma perícia espacial apropriada determina quem responde primeiro.",
      "Passo 3, movimento: movimento padrão simplifica zonas; movimento por queima registra energia, aceleração e manobras mais específicas.",
      "Passo 4, alcance e perícias: anote distâncias e escolha Atacar, Defender, Atirar, Condução ou a perícia definida pela ficção.",
      "Diagrama vetorial e zona de alcance: mostre direção, velocidade relativa, rumo e distância sem transformar o mapa em miniatura obrigatória.",
      "Combate em fases: Evasão, Manobra, Movimento de munição, Fogo de armas, Lançamento de munição, Varredura, Controle de danos, Tratamento médico e Outras ações distribuem o trabalho da tripulação.",
      "Postos de batalha: Comando, Timão, Sensores, soldado de abordagem, Piloto de caça, Piloto de transporte, Engenheiro e Artilharia dão funções, aspectos e façanhas para personagens e naves.",
      "Exemplo de combate: a Ganymede e seus oponentes demonstram como alternar posições, objetivos e tarefas sem perder a história da tripulação.",
    ],
    ptUse: "Mostre o objetivo além de destruir a outra nave: alcançar um portal, escapar de um campo, embarcar alguém ou manter um sistema vivo. Isso dá sentido a cada posto de batalha.",
    enIntro: "Space combat starts with a readable scene and ends with a crew making decisions under pressure. The toolkit offers standard or burn movement, vector diagrams, range zones, phased combat, and battlestations.",
    enSections: [
      "Step 1, set the scene: map, celestial bodies, velocity, objectives, aspects, and risks come before the first roll.",
      "Step 2, determine turn order: Notice or a fitting space skill decides who reacts first.",
      "Step 3, movement: standard movement simplifies zones; burn movement tracks energy, acceleration, and more specific maneuvers.",
      "Step 4, ranges and skills: note distances and choose Attack, Defend, Shoot, Drive, or the skill the fiction establishes.",
      "Vector diagrams and range zones: show direction, relative speed, heading, and distance without requiring miniature play.",
      "Phased combat: Evade, Maneuver, Ordnance Movement, Weapons Fire, Ordnance Launch, Scanning, Damage Control, Medical Treatment, and Other Actions distribute crew work.",
      "Battlestations: Captain, Helm, Scanner, Espatier, Fighter Pilot, Shuttle Pilot, Engineer, and Gun Crew give roles, aspects, and stunts to characters and ships.",
      "Example of space combat: the Ganymede and its opponents demonstrate changing positions, objectives, and tasks without losing the crew’s story.",
    ],
    enUse: "Show an objective beyond destroying the other ship: reach a portal, escape a field, board someone, or keep a system alive. That gives every station a reason to matter.",
  }),
  bookMapChapter({
    id: "space-aliens-worlds",
    ptTitle: "Fate Space Toolkit: alienígenas e mundos alienígenas",
    enTitle: "Fate Space Toolkit: aliens and alien worlds",
    pages: "Páginas 96–110",
    ptIntro: "O capítulo oferece tabelas e perguntas para criar mundos que sustentem aventura. A plausibilidade define o tipo de detalhe; cultura, ecologia e comércio dão consequências sociais para cada planeta em vez de tratá-lo como um cenário descartável.",
    ptSections: [
      "Função de alienígenas: decida se são protagonistas, vizinhos, ameaça, minoria, mistério ou espelho das escolhas humanas.",
      "Ecossistemas planetários: use tipos de mundo e mundos habitáveis para gerar biomas, recursos, riscos e imagens que a tripulação encontrará.",
      "Condições planetárias: gravidade, órbita, inclinação axial e temperatura mudam movimento, sobrevivência, agricultura e arquitetura.",
      "Cultura e civilização: estabeleça valores, instituições, conflitos, tecnologia e relações de poder; uma sociedade não é só uma aparência.",
      "Comércio interplanetário: recursos, oferta, demanda, rotas e desigualdade criam missões e consequências para quem atravessa os mundos.",
      "Criar alienígenas: em baixa plausibilidade use silhuetas e traços rápidos; em média, combine contraste e função; em alta, ligue biologia, ecologia e cultura coerentemente.",
      "Processo colaborativo: diferentes pessoas propõem aspectos, escolhem o que fica e deixam espaço para reversões, surpresa e detalhe descoberto em jogo.",
      "Catálogo visual: formas anguilliformes, achatinoides, aviárias, bicefálicas, simiescas e cetáceas servem como sementes, não como regras universais.",
      "Exemplo: os Leonids of Alaxor 12 mostram como uma espécie de alta plausibilidade une biologia, organização social e escolhas de personagem.",
    ],
    ptUse: "Pergunte o que um mundo exige dos personagens antes de descrevê-lo. Se a resposta só for ‘parece diferente’, acrescente uma instituição, um recurso ou uma relação que possa mudar durante a campanha.",
    enIntro: "This chapter offers tables and questions for creating worlds that support adventure. Plausibility sets the detail level; culture, ecology, and commerce give social consequences to each planet instead of making it disposable scenery.",
    enSections: [
      "Alien function: decide whether aliens are protagonists, neighbors, threats, minorities, mysteries, or mirrors for human choices.",
      "Planetary ecosystems: use world types and habitable worlds to generate biomes, resources, hazards, and images the crew will encounter.",
      "Planetary conditions: gravity, orbit, axial tilt, and temperature change movement, survival, agriculture, and architecture.",
      "Culture and civilization: establish values, institutions, conflicts, technology, and power relations; a society is more than an appearance.",
      "Interplanetary trade: resources, supply, demand, routes, and inequality create missions and consequences for travelers.",
      "Creating aliens: at low plausibility use quick silhouettes; at medium, combine contrast and function; at high, connect biology, ecology, and culture coherently.",
      "Collaborative process: different people propose aspects, choose what remains, and leave room for reversals, surprise, and details discovered in play.",
      "Visual catalogue: anguilliform, achatinoid, avian, bicephalous, simian, and cetacean forms are seeds, not universal rules.",
      "Example: the Leonids of Alaxor 12 show how high-plausibility species design joins biology, social organization, and character choices.",
    ],
    enUse: "Ask what a world demands of the characters before describing it. If the answer is only ‘it looks different,’ add an institution, resource, or relationship that can change during play.",
  }),
  bookMapChapter({
    id: "space-gods-know-future-things",
    ptTitle: "Fate Space Toolkit: The Gods Know Future Things",
    enTitle: "Fate Space Toolkit: The Gods Know Future Things",
    pages: "Páginas 111–119",
    ptIntro: "The Gods Know Future Things apresenta mentes-nave pós-humanas em viagens relativísticas. O cenário mostra como transformar a própria nave, o tempo e a não violência em partes da ficha e da aventura.",
    ptSections: [
      "Cenário, grandes questões e faces/lugares: inteligências que carregam culturas e memórias atravessam um sistema em que o futuro chega antes da notícia.",
      "Aspectos de Mind e Hull: a consciência e o casco são dimensões diferentes da mesma personagem, com vulnerabilidades e desejos próprios.",
      "Tríade de Fases e perícias: a história da mente, do casco e das relações organiza criação, redistribuição e avanço de perícias.",
      "Estresse, consequências, recarga, façanhas e extras: use a ficha para separar dano à mente, ao casco e às conexões.",
      "Regras especiais: Avatars permitem agir fora do corpo-nave; Nonviolence desloca conflito para negociação, custo e solução sem ataque direto.",
      "Aventuras: contato, previsão, diplomacia e decisões sobre o que uma inteligência deve fazer quando sabe mais do que seus aliados.",
    ],
    ptUse: "Use o cenário para uma campanha de decisões e relações, não como exigência de jogar uma mente-nave. As regras especiais entram só quando o grupo quer que identidade e corpo tenham escalas separadas.",
    enIntro: "The Gods Know Future Things presents posthuman ship-minds on relativistic journeys. It shows how a ship, time, and nonviolence can become parts of the sheet and adventure.",
    enSections: [
      "Setting, big issues, and faces/places: intelligences carrying cultures and memories cross a system where the future arrives before the news.",
      "Mind and Hull aspects: consciousness and hull are different dimensions of one character, with distinct vulnerabilities and desires.",
      "Phase Trio and skills: the history of mind, hull, and relationships organizes creation, skill reallocation, and advancement.",
      "Stress, consequences, refresh, stunts, and extras: use the sheet to separate harm to mind, hull, and connections.",
      "Special rules: Avatars allow action outside the ship-body; Nonviolence shifts conflict toward negotiation, cost, and non-attack solutions.",
      "Adventures: contact, prediction, diplomacy, and decisions about what an intelligence should do when it knows more than its allies.",
    ],
    enUse: "Use the setting for a campaign of decisions and relationships, not as a requirement to play a ship-mind. Add special rules only when the group wants identity and body to have separate scales.",
  }),
  bookMapChapter({
    id: "space-high-frontiersmen",
    ptTitle: "Fate Space Toolkit: The High Frontiersmen",
    enTitle: "Fate Space Toolkit: The High Frontiersmen",
    pages: "Páginas 120–132",
    ptIntro: "The High Frontiersmen é uma história alternativa de exploração espacial, com tripulações americanas e soviéticas em uma fronteira tecnológica e política tensa. O cenário usa cronologia, setores lunares e o relógio do juízo final para manter a corrida espacial como pressão de campanha.",
    ptSections: [
      "Cenário, pitch, escopo e grandes questões: a fronteira pode unir rivais, reproduzir desigualdade ou exigir que a tripulação escolha que futuro quer financiar.",
      "Vinte anos no espaço: a história alternativa reorganiza investimentos, lançamentos, bases, setores russo e americano e a presença no ponto lunar.",
      "Aspectos de cenário e tecnologia: foguetes, bases, comunicação e limites de plausibilidade entram como recursos e obstáculos.",
      "Faces e lugares: Lua, setores rivais, Checkpoint Zed, bases e autoridades dão ao mapa uma geopolítica concreta.",
      "Personagens: high concept, trouble, Tríade de Fases, perícias, estresse, consequências, recarga, façanhas e extras refletem treinamento e nacionalidade sem reduzir ninguém a um estereótipo.",
      "Aventuras e Doomsday Clock: o relógio marca minutos para uma crise e pode avançar quando a equipe descobre mais, mantendo o próximo lançamento urgente.",
    ],
    ptUse: "Combine a tecnologia da corrida com um problema pessoal. O relógio do juízo final deve criar decisões observáveis, não um cronômetro escondido que pune a Mesa por explorar.",
    enIntro: "The High Frontiersmen is an alternate-history space-exploration game with American and Soviet crews on a tense technological and political frontier. Its timeline, lunar sectors, and doomsday clock keep the space race as campaign pressure.",
    enSections: [
      "Setting, pitch, scope, and big issues: the frontier can unite rivals, reproduce inequality, or ask the crew which future it will fund.",
      "Twenty Years in Space: alternate history rearranges investment, launches, bases, Russian and American sectors, and lunar presence.",
      "Setting and technology aspects: rockets, bases, communication, and plausibility limits become resources and obstacles.",
      "Faces and places: the Moon, rival sectors, Checkpoint Zed, bases, and authorities give the map concrete geopolitics.",
      "Characters: high concept, trouble, Phase Trio, skills, stress, consequences, refresh, stunts, and extras reflect training and nationality without reducing anyone to a stereotype.",
      "Adventures and the Doomsday Clock: the clock marks minutes to a crisis and can tick down as the team learns more, keeping the next launch urgent.",
    ],
    enUse: "Pair race technology with a personal problem. The doomsday clock should create visible decisions, not a hidden timer that punishes exploration.",
  }),
  bookMapChapter({
    id: "space-mass-drivers",
    ptTitle: "Fate Space Toolkit: Mass Drivers",
    enTitle: "Fate Space Toolkit: Mass Drivers",
    pages: "Páginas 133–148",
    ptIntro: "Mass Drivers imagina uma economia e uma política construídas em torno de lançadores, rotas e trabalhadores do cinturão de asteroides. É o cenário mais detalhado para construir a nave como personagem com módulos, condições, calor e portos de escala.",
    ptSections: [
      "Cenário, grandes questões e aspectos: infraestrutura de lançamento e desigualdade definem quem pode atravessar o sistema e quem paga o preço.",
      "Faces e lugares e o léxico: a tripulação encontra habitats, portos, comunidades e termos próprios para descrever o mapa do sistema interno.",
      "Estabelecer o mass driver: escolha localização, operação, riscos, proprietários e relações com os blackbelters.",
      "Criar personagens: perícias, estresse, consequências, recarga, façanhas e o extra Blackbelting ligam pessoa, nave e trabalho.",
      "Construir a nave: características, habilidades, notas e módulos; cada módulo tem massa, custo, efeitos e condições que podem ser marcadas.",
      "Módulos e calor: drone bay, fuel tank, habitat, heat sink, NERVA e VASIMR mostram como tecnologia produz escolhas e falhas.",
      "Viajar no mapa: distância por troca, burn, calor e disponibilidade de combustível mudam o risco de uma rota.",
      "Portos de escala: habitats de asteroides, carga, passageiros, condições de mercado e outras atividades transformam parada em aventura.",
      "Mercadorias e pessoas: encontrar carga, passageiros e clientes pode alterar o próximo destino e a relação da tripulação com uma comunidade.",
    ],
    ptUse: "Use módulos como perguntas: o que a nave consegue fazer, o que precisa manter e o que acontece quando uma condição é marcada? Isso evita uma lista de equipamento sem drama.",
    enIntro: "Mass Drivers imagines an economy and politics built around launchers, routes, and asteroid-belt workers. It is the most detailed setting for making a ship a character with modules, conditions, heat, and ports of call.",
    enSections: [
      "Setting, big issues, and aspects: launch infrastructure and inequality define who can cross the system and who pays the price.",
      "Faces, places, and lexicon: the crew meets habitats, ports, communities, and terms for describing the inner-system map.",
      "Establishing a mass driver: choose location, operation, risks, owners, and relationships with blackbelters.",
      "Creating characters: skills, stress, consequences, refresh, stunts, and the Blackbelting extra connect person, ship, and work.",
      "Building the ship: characteristics, skills, notes, and modules; each module has mass, cost, effects, and conditions to mark.",
      "Modules and heat: drone bay, fuel tank, habitat, heat sink, NERVA, and VASIMR show how technology creates choices and failures.",
      "Travel on the map: distance per exchange, burn, heat, and fuel availability change route risk.",
      "Ports of call: asteroid habitats, cargo, passengers, market conditions, and other activities turn a stop into an adventure.",
      "Goods and people: finding cargo, passengers, and clients can change the next destination and the crew’s relationship with a community.",
    ],
    enUse: "Use modules as questions: what can the ship do, what must it maintain, and what happens when a condition is marked? This keeps equipment from becoming a drama-free list.",
  }),
  bookMapChapter({
    id: "space-millennials",
    ptTitle: "Fate Space Toolkit: Millennials",
    enTitle: "Fate Space Toolkit: Millennials",
    pages: "Páginas 149–159",
    ptIntro: "Millennials acompanha a nave Millennium, a primeira embarcação interestelar da Terra, e uma expedição que precisa construir relações enquanto viaja para além do sistema solar. O cenário usa marcos e alienígenas para manter a descoberta ligada à história da tripulação.",
    ptSections: [
      "Cenário, grandes questões e aspectos: o que a humanidade leva, o que deixa para trás e como uma missão se torna uma sociedade móvel.",
      "Faces e lugares: a Millennium, jardins, laboratórios, acesso, carga e a cultura de uma nave que é lar e instrumento.",
      "Criar personagens: high concept, trouble, Tríade de Fases, perícias, estresse, consequências, recarga, façanhas e extras ligados à expedição.",
      "Aventuras e marcos: marcos menores, significativos e maiores acompanham descobertas, conflitos internos e mudanças na nave.",
      "Alien Space e Civilization: o espaço alienígena e suas civilizações alteram mapas, relações, recursos e os objetivos da missão.",
      "Alienígenas em Millennials: encontros e escolhas de contato mostram como usar as regras de mundos sem impor uma única resposta moral.",
    ],
    ptUse: "Coloque a nave entre duas escalas: a intimidade de uma comunidade e o desconhecido interestelar. Cada descoberta deve mudar pelo menos uma relação, uma rota ou uma pergunta da missão.",
    enIntro: "Millennials follows the starship Millennium, Earth’s first interstellar vessel, on an expedition that must build relationships while traveling beyond the home system. It uses milestones and aliens to keep discovery tied to crew stories.",
    enSections: [
      "Setting, big issues, and aspects: what humanity carries, leaves behind, and how a mission becomes a mobile society.",
      "Faces and places: the Millennium, gardens, laboratories, access, cargo, and the culture of a ship that is both home and instrument.",
      "Creating characters: high concept, trouble, Phase Trio, skills, stress, consequences, refresh, stunts, and expedition extras.",
      "Adventures and milestones: minor, significant, and major milestones follow discoveries, internal conflicts, and changes to the ship.",
      "Alien Space and Civilization: alien space and civilizations alter maps, relationships, resources, and mission goals.",
      "Aliens in Millennials: contact and choice show how to use world rules without imposing one moral answer.",
    ],
    enUse: "Place the ship between two scales: a community’s intimacy and interstellar unknown. Each discovery should change at least one relationship, route, or mission question.",
  }),
  bookMapChapter({
    id: "space-pax-galactica",
    ptTitle: "Fate Space Toolkit: Pax Galactica",
    enTitle: "Fate Space Toolkit: Pax Galactica",
    pages: "Páginas 160–173",
    ptIntro: "Pax Galactica coloca personagens viajantes dentro do Principado Galáctico, onde comércio, nobreza, cidadania, clientela e ilegalidade definem o acesso ao espaço. As regras de passagem e mercado transformam política em decisões de viagem.",
    ptSections: [
      "Cenário, pitch, escopo e grandes questões: o Principado promete paz enquanto concentra rotas, autoridade e privilégios.",
      "Faces e lugares e mapa galáctico: braços, margens, fendas, estrelas próximas e distantes dão escala para uma campanha de trânsito e fronteira.",
      "Personagens: high concept, trouble, Tríade de Fases, perícias, estresse, consequências e extras de posição social.",
      "Extras sociais: Galactic Citizen, Galactic Noble, Client Status, Outlaw Status e Psychic Alien abrem acesso e também criam obrigações.",
      "Naves e viagem no Principado: hiperespaço, tipos de nave, dificuldades de porto e reserva de passagem tornam cada deslocamento uma negociação.",
      "Comércio e mercadorias: categorias de carga, oferta, demanda, condições de mercado e o extra Merchant Prince criam campanha econômica sem tirar o foco dos personagens.",
      "Complicações de porto: autoridades, documentação, dívidas, inspeções e interesses locais adicionam aspectos de situação a uma chegada aparentemente simples.",
    ],
    ptUse: "Mostre a política pelo que a tripulação pode ou não pode fazer em uma rota. Um extra social só é bom quando abre uma porta e cria outra obrigação que a Mesa quer explorar.",
    enIntro: "Pax Galactica places traveling characters inside the Galactic Principate, where trade, nobility, citizenship, client status, and outlawry define access to space. Passage and market rules turn politics into travel decisions.",
    enSections: [
      "Setting, pitch, scope, and big issues: the Principate promises peace while concentrating routes, authority, and privilege.",
      "Faces, places, and galactic map: arms, margins, rifts, near stars, and far stars give scale to a transit-and-frontier campaign.",
      "Characters: high concept, trouble, Phase Trio, skills, stress, consequences, and social-position extras.",
      "Social extras: Galactic Citizen, Galactic Noble, Client Status, Outlaw Status, and Psychic Alien grant access while creating obligations.",
      "Spacecraft and travel in the Principate: hyperspace, ship types, starport difficulties, and Booking Passage make every journey a negotiation.",
      "Trade and goods: cargo categories, supply, demand, market conditions, and the Merchant Prince extra support an economic campaign without replacing character focus.",
      "Starport complications: authorities, documents, debts, inspections, and local interests add situation aspects to an apparently simple arrival.",
    ],
    enUse: "Show politics through what the crew can and cannot do on a route. A social extra is useful when it opens one door and creates an obligation the table wants to explore.",
  }),
  bookMapChapter({
    id: "space-appendix-reference",
    ptTitle: "Fate Space Toolkit: inspiração e referência",
    enTitle: "Fate Space Toolkit: inspiration and reference",
    pages: "Páginas 174–175",
    ptIntro: "O apêndice final transforma o plausibilômetro em um índice rápido de inspiração e pesquisa. Ele ajuda a localizar o tom desejado sem exigir que a Mesa adote qualquer cenário-modelo inteiro.",
    ptSections: [
      "Alta plausibilidade: ficção ancorada em conhecimento científico, engenharia, logística e consequências sociais coerentes.",
      "Média plausibilidade: extrapolação seletiva, tecnologia aceita como caixa-preta e foco no que a história precisa mostrar.",
      "Baixa plausibilidade: space opera, poderes extraordinários, física impossível e liberdade para priorizar imagem e ritmo.",
      "Referências e autores: use as inspirações como ponto de conversa, não como licença para copiar uma obra ou apagar a autoria de quem criou o cenário.",
      "Sobre o toolkit: a ficha de créditos fecha o volume e preserva a distinção entre a expansão temática e a regra principal.",
    ],
    ptUse: "Marque o nível de plausibilidade na preparação e revise-o quando o jogo mudar de escala. Uma caixa-preta assumida é mais intuitiva do que uma contradição descoberta no meio da sessão.",
    enIntro: "The final appendix turns the plausibilometer into a quick index for inspiration and research. It helps locate the desired tone without requiring the table to adopt an entire sample setting.",
    enSections: [
      "High plausibility: fiction anchored in scientific knowledge, engineering, logistics, and coherent social consequences.",
      "Medium plausibility: selective extrapolation, technology accepted as a black box, and focus on what the story needs to show.",
      "Low plausibility: space opera, extraordinary powers, impossible physics, and freedom to prioritize image and momentum.",
      "References and authors: use inspirations as conversation starters, not permission to copy another work or erase its creator.",
      "About the toolkit: the credits close the volume and preserve the distinction between thematic expansion and principal ruleset.",
    ],
    enUse: "Mark plausibility during preparation and revisit it when the game changes scale. An agreed black box is more intuitive than a contradiction discovered in the middle of a session.",
  }),
];

const uprisingChapters = [
  bookMapChapter({
    id: "uprising-introduction",
    ptTitle: "Uprising: começo e contrato de jogo",
    enTitle: "Uprising: starting the game and its contract",
    pages: "Páginas 5–16",
    ptIntro: "Uprising é um jogo autônomo de resistência em uma Paris Nouveau distópica. Ele usa uma versão própria e compacta do Fate, com meios, fins e condições no lugar de várias estruturas do Fate Condensado; por isso, este mapa sempre marca a diferença como opção desta expansão.",
    ptSections: [
      "O que é necessário: pessoas para jogar, dados Fate, fichas, cartões de segredo e uma conversa sobre o tipo de opressão e resistência que a Mesa quer abordar.",
      "Comece pela promessa: a história é sobre pessoas comuns escolhendo agir contra um governo corporativo que controla uma cidade vertical e suas memórias.",
      "A diferença de sistema: não há lista de perícias do Condensado; quatro meios resolvem ações e quatro fins dizem o que a ação tenta alcançar.",
      "Tom e limites: decidam como representar vigilância, dívida, violência, traição e perda. Linhas, véus e qualquer ferramenta de segurança do Condensado continuam disponíveis.",
      "Papel do Narrador: prepare pressão e escolhas, mas deixe a resistência ser criada e alterada pelos jogadores; nenhum resultado precisa estar predeterminado.",
    ],
    ptUse: "Leia esta expansão como um jogo completo e o Fate Condensado como a base do site. Ative Uprising somente quando a Mesa quiser sua estrutura política, seus nove papéis e seu ciclo de missão.",
    enIntro: "Uprising is a standalone resistance game set in a dystopian Paris Nouveau. It uses its own compact version of Fate, with means, ends, and conditions in place of several Fate Condensed structures; this map therefore marks every difference as an expansion option.",
    enSections: [
      "What you need: people to play, Fate dice, sheets, secret cards, and a conversation about the oppression and resistance the table wants to address.",
      "Start with the promise: the story is about ordinary people choosing to act against a corporate government that controls a vertical city and its memories.",
      "System difference: there is no Condensed skill list; four means resolve actions and four ends say what an action is trying to accomplish.",
      "Tone and boundaries: decide how to portray surveillance, debt, violence, betrayal, and loss. Condensed lines, veils, and safety tools remain available.",
      "Game Master role: prepare pressure and choices, but let players create and change the resistance; no outcome needs to be predetermined.",
    ],
    enUse: "Read this expansion as a complete game and Fate Condensed as the site’s base. Enable Uprising only when the table wants its political structure, nine playsheets, and mission cycle.",
  }),
  bookMapChapter({
    id: "uprising-basics",
    ptTitle: "Uprising: fundamentos e rolagens",
    enTitle: "Uprising: basics and rolls",
    pages: "Páginas 9–16",
    ptIntro: "Os fundamentos preservam a lógica narrativa do Fate: descreva a intenção, escolha o meio, role os dados e compare com a oposição. A diferença está no vocabulário reduzido e nos quatro fins que organizam a consequência.",
    ptSections: [
      "Meios: Fight é confronto direto; Manipulate é influência; Maneuver é movimento e posicionamento; Observe é perceber, analisar e preparar.",
      "Fins: cause harm marca uma condição; gain advantage cria um aspecto e pode gerar impulsos; avoid impede que algo aconteça; resolve uncertain outcome encerra uma incerteza sem ataque.",
      "Meio adequado ou arriscado: o Narrador pode conceder vantagem quando a abordagem combina com a situação ou aumentar o custo quando ela força a ficção.",
      "Sucesso, empate e falha: use oposição e tensão para produzir mudança. Um resultado não é uma licença para retirar a escolha de uma pessoa.",
      "Ações em conjunto: ajudar, atrapalhar e dividir o custo tornam a resistência uma rede; explicite quem assume a próxima consequência.",
    ],
    ptUse: "Antes de rolar, diga em voz alta o fim pretendido. Isso evita que o mesmo número seja interpretado como ataque, vantagem ou fuga depois de os dados caírem.",
    enIntro: "The basics keep Fate’s narrative logic: describe intent, choose a means, roll the dice, and compare with opposition. The difference is the reduced vocabulary and four ends that organize consequences.",
    enSections: [
      "Means: Fight is direct confrontation; Manipulate is influence; Maneuver is movement and positioning; Observe is noticing, analyzing, and preparing.",
      "Ends: cause harm marks a condition; gain advantage creates an aspect and can create boosts; avoid prevents something from happening; resolve uncertain outcome closes an uncertainty without an attack.",
      "Suited or risky means: the Game Master can grant an edge when the approach fits the situation or raise the cost when it strains the fiction.",
      "Success, tie, and failure: use opposition and pressure to produce change. A result is not permission to remove someone’s choice.",
      "Team actions: helping, hindering, and sharing cost make the resistance a network; state who takes the next consequence.",
    ],
    enUse: "Before rolling, say the intended end aloud. This keeps the same number from being interpreted as an attack, advantage, or escape only after the dice land.",
  }),
  bookMapChapter({
    id: "uprising-character-creation",
    ptTitle: "Uprising: criação de personagem",
    enTitle: "Uprising: creating a character",
    pages: "Páginas 18–25",
    ptIntro: "A criação parte de classe social, ficha de papel, perguntas de aspecto, meios e façanhas. Cada escolha liga a pessoa à cidade e oferece um problema que pode voltar durante uma missão.",
    ptSections: [
      "Escolha uma classe: la Société representa quem se beneficia do sistema; les Citoyens, quem vive dentro dele; les Exilés, quem foi empurrado para fora.",
      "Escolha uma playsheet: a ficha define perguntas, condições, façanha de classe e duas façanhas próprias; uma terceira reduz a recarga de 2 para 1.",
      "Responda às perguntas: cinco aspectos vêm da ficha, um da classe e um do papel. Escreva frases jogáveis, com relações e obrigações concretas.",
      "Distribua os meios: siga a pirâmide ou outra distribuição indicada pela ficha, mantendo Fight, Manipulate, Maneuver e Observe distintos na ficção.",
      "Segredo: pegue um cartão que crie uma pressão privada, um gatilho de avanço e uma condição clara para revelar o que estava escondido.",
      "Recarga e condição: registre a recarga, as cinco condições da classe e o que cada façanha promete fazer em uma cena.",
    ],
    ptUse: "Um bom personagem responde a três perguntas: o que faço pela resistência, o que temo perder e quem pode me cobrar? Se uma opção não gerar cena, reescreva-a.",
    enIntro: "Creation starts with social class, a playsheet, aspect questions, means, and stunts. Each choice links a person to the city and offers a problem that can return during a mission.",
    enSections: [
      "Choose a class: la Société represents people who benefit from the system; les Citoyens live inside it; les Exilés have been pushed outside it.",
      "Choose a playsheet: it defines questions, conditions, a class stunt, and two personal stunts; a third stunt lowers refresh from 2 to 1.",
      "Answer the questions: five aspects come from the playsheet, one from class, and one from the role. Write playable phrases with concrete relationships and obligations.",
      "Assign means: follow the pyramid or the playsheet’s distribution, keeping Fight, Manipulate, Maneuver, and Observe distinct in the fiction.",
      "Secret: take a card that creates private pressure, an advancement trigger, and a clear condition for revealing what was hidden.",
      "Refresh and conditions: record refresh, the class’s five conditions, and what each stunt promises to do in a scene.",
    ],
    enUse: "A strong character answers three questions: what do I do for the resistance, what might I lose, and who can call me to account? If an option creates no scene, rewrite it.",
  }),
  bookMapChapter({
    id: "uprising-resistance-government",
    ptTitle: "Uprising: montar a Resistência e o Governo",
    enTitle: "Uprising: building the Resistance and Government",
    pages: "Páginas 26–32",
    ptIntro: "A Mesa cria duas organizações assimétricas antes da primeira missão. la Résistance tem um manifesto, fraqueza, Cache e avanços; o Governo tem slogan, escândalo, Bank e avanços próprios.",
    ptSections: [
      "Resistência: escreva manifesto e aspecto de fraqueza, defina o Cache inicial em 3 pontos e escolha dois avanços entre Intel, Recursos e Apoio.",
      "Governo: escreva slogan e escândalo, comece o Bank vazio e escolha um avanço de jogadores e um do Narrador entre Corporativo, Militar e Segurança.",
      "Metas: toda missão tem metas da Resistência e do Governo; cumprir uma não apaga automaticamente a outra.",
      "Tamanho da campanha: curto, médio ou longo depende dos avanços críticos. A Mesa decide a duração antes que o relógio pareça uma punição escondida.",
      "Dívida pública: Cache, Bank e avanços são recursos ficcionais, não apenas contadores; mostre quem ganhou poder e quem ficou exposto.",
    ],
    ptUse: "Dê à Resistência uma fraqueza que gere decisões e ao Governo um escândalo que possa ser explorado. Se um dos lados só servir de decoração, falta uma meta jogável.",
    enIntro: "The table creates two asymmetrical organizations before the first mission. The Resistance has a manifesto, weakness, Cache, and advances; the Government has a slogan, scandal, Bank, and its own advances.",
    enSections: [
      "Resistance: write a manifesto and weakness aspect, set starting Cache at 3 points, and choose two advances from Intel, Resources, and Support.",
      "Government: write a slogan and scandal, start Bank empty, and choose one player and one GM advance from Corporate, Military, and Security.",
      "Goals: every mission has Resistance and Government goals; fulfilling one does not automatically erase the other.",
      "Campaign length: short, medium, or long depends on critical advances. Decide duration before the clock feels like a hidden punishment.",
      "Public debt: Cache, Bank, and advances are fictional resources, not only counters; show who gained power and who became exposed.",
    ],
    enUse: "Give the Resistance a weakness that creates decisions and the Government a scandal that can be exploited. If either side is decoration, it needs a playable goal.",
  }),
  bookMapChapter({
    id: "uprising-fragments",
    ptTitle: "Uprising: Paris Nouveau e Fragmentos",
    enTitle: "Uprising: Paris Nouveau and Fragments",
    pages: "Páginas 33–58",
    ptIntro: "Paris Nouveau é uma cidade estratificada por acesso, dívida e vigilância. O cenário oferece peças concretas para uma Mesa que quer cyberpunk político, mas deixa espaço para trocar nomes, bairros e o que existe além dos muros.",
    ptSections: [
      "Tecnologia cotidiana: cascas neurais, realidade aumentada e virtual, le Treillis, conectores de energia kJ e proteína APE transformam trabalho, lazer e controle.",
      "Cidade vertical: L’Aerie e L’Apogée ficam acima; le Bas concentra a maioria; la Cave esconde comunidades e rotas. O Louvre abriga a resistência.",
      "Lugares de tensão: Pont-Neuf, Père-Lachaise e Jardin des Tuileries têm funções diferentes e podem carregar aspectos de situação.",
      "O mundo além: Neese, York/Boroughs, Upfrancisco, Nu Berlin, Praga destruída, Londres isolada, São Petersburgo em inverno nuclear, Tóquio submersa, Cairo-321 e Versalhes formam rumores e destinos.",
      "Leis importantes: dívida corporativa e trabalho obrigatório, proibição de fraternizar com Naturals, de entrar em Paris Below ou de sair da cidade, e obediência aos gendarmes.",
      "Mentiras do Fall: a versão oficial sobre terraformação e colapso não precisa ser a verdade; use descoberta e contradição como combustível de missão.",
    ],
    ptUse: "Escolha duas camadas da cidade para a primeira sessão e deixe o resto como pergunta. O cenário fica mais intuitivo quando cada lugar tem uma função humana, não apenas um nome exótico.",
    enIntro: "Paris Nouveau is stratified by access, debt, and surveillance. The setting offers concrete pieces for a political cyberpunk table while leaving room to change names, neighborhoods, and what lies beyond the walls.",
    enSections: [
      "Everyday technology: neural casings, augmented and virtual reality, le Treillis, kJ power plugs, and APE protein reshape work, leisure, and control.",
      "Vertical city: L’Aerie and L’Apogée are above; le Bas holds most people; la Cave hides communities and routes. The Louvre houses the resistance.",
      "Pressure points: Pont-Neuf, Père-Lachaise, and Jardin des Tuileries have different functions and can carry situation aspects.",
      "The world beyond: Neese, York/Boroughs, Upfrancisco, Nu Berlin, destroyed Prague, isolated London, nuclear-winter St. Petersburg, flooded Tokyo, Cairo-321, and Versailles create rumors and destinations.",
      "Important laws: corporate debt and compulsory work, no fraternizing with Naturals, no Paris Below, no leaving the city, and obedience to the gendarmes.",
      "Fall lies: the official story about terraforming and collapse need not be true; use discovery and contradiction as mission fuel.",
    ],
    enUse: "Choose two city layers for the first session and leave the rest as questions. The setting is more intuitive when each place has a human function, not only an exotic name.",
  }),
  bookMapChapter({
    id: "uprising-playsheets",
    ptTitle: "Uprising: nove playsheets",
    enTitle: "Uprising: the nine playsheets",
    pages: "Páginas 59–86",
    ptIntro: "As nove playsheets são três lentes para cada classe social. Elas não são apenas arquétipos: cada uma muda perguntas, condições, façanhas, relações e a forma como a missão encontra a personagem.",
    ptSections: [
      "La Société: Cleaner remove vestígios; Blueblood abre portas de elite; Officer conhece a máquina de comando.",
      "Les Citoyens: Hacker atravessa redes; Soldier resiste sob fogo; Malcontent transforma raiva pública em ação.",
      "Les Exilés: Ex-Cit conhece a vida dentro do sistema; Natural sobrevive sem casca; Armiger leva a força e a história da Cave.",
      "Condições: cada classe recebe cinco nomes próprios além de Angry, Wounded e Marked for Death; a ficha diz quando uma condição impede uma ação e quando pode ser limpa.",
      "Façanha de classe e duas façanhas do papel: escreva limites, custo e ficção de cada uma; nada deve virar bônus universal.",
      "Perguntas de personagem: use-as para criar dívidas, aliados, vítimas, suspeitas e um motivo para permanecer na resistência.",
    ],
    ptUse: "Apresente as classes e as nove fichas antes de escolher. A pessoa deve entender que tipo de cena cada papel quer protagonizar sem precisar decorar o livro.",
    enIntro: "The nine playsheets are three lenses on each social class. They are not only archetypes: each changes questions, conditions, stunts, relationships, and how a mission meets the character.",
    enSections: [
      "La Société: Cleaner removes traces; Blueblood opens elite doors; Officer knows the command machine.",
      "Les Citoyens: Hacker crosses networks; Soldier endures fire; Malcontent turns public anger into action.",
      "Les Exilés: Ex-Cit knows life inside the system; Natural survives without a casing; Armiger carries the Cave’s force and history.",
      "Conditions: each class gets five named conditions in addition to Angry, Wounded, and Marked for Death; the sheet says when a condition blocks an action and when it can clear.",
      "Class stunt and two playsheet stunts: write limits, cost, and fiction for each; none should become a universal bonus.",
      "Character questions: use them to create debts, allies, victims, suspicions, and a reason to remain in the resistance.",
    ],
    enUse: "Present classes and playsheets before anyone chooses. A player should understand what kind of scene each role wants to lead without memorizing the book.",
  }),
  bookMapChapter({
    id: "uprising-aspects-secrets",
    ptTitle: "Uprising: aspectos, invocações e segredos",
    enTitle: "Uprising: aspects, invokes, and secrets",
    pages: "Páginas 87–104",
    ptIntro: "Aspectos continuam sendo frases verdadeiras que orientam a ficção. Uprising acrescenta segredos privados e uma regra de revelação para que informação, lealdade e suspeita tenham movimento na Mesa.",
    ptSections: [
      "Invocar: gaste ponto de destino para +2, rerrolar, declarar detalhe ou oferecer oposição; use apenas uma vez por aspecto em cada rolagem e deixe impulsos acumularem.",
      "Forçar: o Narrador oferece ponto de destino para um aspecto provocar evento ou decisão; a pessoa pode aceitar ou pagar para recusar.",
      "Aspectos falsos: uma vez por sessão, pague para revelar que um aspecto de situação é falso e substituí-lo por dois impulsos; confirme a mudança com a Mesa.",
      "Impulsos: são efeitos transitórios ligados a um aspecto; não são consequências permanentes nem um segundo nome para invocação gratuita.",
      "Cartões de segredo: Blackmail, Mole Hunter, Hostage, Secret Attraction, Troublemaker, Rival, Killer e Spy trazem pergunta, gatilho de avanço e cláusula de revelação.",
      "Revelar com cuidado: combine segurança e consentimento antes de transformar um segredo em acusação, traição ou mudança de classe.",
    ],
    ptUse: "Escreva o aspecto com a consequência já imaginada. Um segredo bom cria uma escolha difícil, não uma revelação que encerra a agência de outra pessoa.",
    enIntro: "Aspects remain true phrases that guide the fiction. Uprising adds private secrets and a reveal rule so information, loyalty, and suspicion move at the table.",
    enSections: [
      "Invoke: spend a fate point for +2, a reroll, a declared detail, or opposition; use an aspect once per roll and let boosts stack.",
      "Compel: the Game Master offers a fate point for an aspect to cause an event or decision; the player may accept or pay to refuse.",
      "False aspects: once per session, pay to reveal a situation aspect as false and replace it with two boosts; confirm the change with the table.",
      "Boosts: transient effects tied to an aspect; they are not permanent consequences or a second name for free invoke.",
      "Secret cards: Blackmail, Mole Hunter, Hostage, Secret Attraction, Troublemaker, Rival, Killer, and Spy provide a prompt, advancement trigger, and reveal clause.",
      "Reveal with care: agree on safety and consent before turning a secret into accusation, betrayal, or a class change.",
    ],
    enUse: "Write an aspect with its possible consequence already in mind. A good secret creates a hard choice, not a reveal that removes another person’s agency.",
  }),
  bookMapChapter({
    id: "uprising-prep-equipment",
    ptTitle: "Uprising: preparação e equipamento",
    enTitle: "Uprising: preparation and equipment",
    pages: "Páginas 105–118",
    ptIntro: "Antes da missão, a resistência prepara vantagens, requisita equipamento, limpa condições e pede favores. A preparação cria ficção compartilhada e não deve substituir a cena que ainda precisa ser jogada.",
    ptSections: [
      "Cena de preparação: declare o objetivo da missão e deixe cada pessoa fazer uma ação de preparar vantagem, requisitar equipamento, limpar condição ou pedir favor.",
      "Preparar vantagem: crie um aspecto de situação com invocações gratuitas; explique qual recurso, contato ou plano o tornou possível.",
      "Equipamento: use a lista como restrição dramática e dívida, não como catálogo de bônus; um item precisa aparecer em cena para importar.",
      "Limpar condições: mostre descanso, cuidado, reparo ou negociação; condições graves exigem uma mudança ficcional, não só apagar uma marca.",
      "Custo: decisões da preparação podem aumentar Bank, criar transgressões ou dar ao Governo uma pista sobre a missão.",
    ],
    ptUse: "Termine a preparação com uma pergunta: o que pode dar errado mesmo com tudo pronto? A resposta vira aspecto, oposição ou complicação visível.",
    enIntro: "Before a mission, the resistance prepares advantages, requisitions equipment, clears conditions, and asks for favors. Preparation creates shared fiction and should not replace the scene that still needs to be played.",
    enSections: [
      "Prep scene: state the mission goal and let each person take an action to prepare an advantage, requisition equipment, clear a condition, or ask a favor.",
      "Prepare advantage: create a situation aspect with free invokes; explain which resource, contact, or plan made it possible.",
      "Equipment: treat the list as dramatic restriction and debt, not a catalog of bonuses; an item must appear in a scene to matter.",
      "Clear conditions: show rest, care, repair, or negotiation; serious conditions need a fictional change, not only an erased mark.",
      "Cost: prep choices can increase Bank, create transgressions, or give the Government a clue about the mission.",
    ],
    enUse: "End preparation with a question: what can still go wrong? The answer becomes a visible aspect, opposition, or complication.",
  }),
  bookMapChapter({
    id: "uprising-elites-favors",
    ptTitle: "Uprising: Élites, favores e nova moeda",
    enTitle: "Uprising: Elites, favors, and new currency",
    pages: "Páginas 106–118",
    ptIntro: "Os cinco Élites representam favores que a resistência pode comprar com dívida política. Eles abrem portas concretas, mas recusar o preço ou quebrar a palavra torna a personagem Marked for Death e cria um Enemy.",
    ptSections: [
      "Ambassador oferece acesso; Assassin garante que um alvo morra; Captain leva reforço armado; Contessa protege e pode limpar Marked for Death.",
      "Duke fornece equipamento até custo 8; os favores precisam de uma cena, um preço e uma consequência se o grupo falhar.",
      "Nova moeda: Cache e Bank mostram onde a organização tem margem; dívida de favor é aspecto e ameaça, não uma contagem abstrata.",
      "Promessa quebrada: renegociar é possível quando a Mesa mostra o risco; simplesmente ignorar a cobrança remove uma fonte importante de história.",
      "Lealdade: um favor pode ajudar a Resistência ou o Governo; esclareça quem se beneficia antes de aceitar.",
    ],
    ptUse: "Use um favor para mudar a situação, não para pular a parte interessante. O Élites deve entregar uma porta e uma nova pergunta sobre quem controla a chave.",
    enIntro: "The five Elites represent favors the resistance can buy with political debt. They open concrete doors, but refusing the price or breaking one’s word makes a character Marked for Death and creates an Enemy.",
    enSections: [
      "Ambassador provides access; Assassin ensures a target dies; Captain brings armed backup; Contessa protects and can clear Marked for Death.",
      "Duke provides equipment up to cost 8; favors need a scene, a price, and a consequence if the group fails.",
      "New currency: Cache and Bank show where the organization has room to act; favor debt is an aspect and threat, not an abstract count.",
      "Broken promise: renegotiation is possible when the table shows the risk; ignoring the debt removes an important story source.",
      "Loyalty: a favor may help the Resistance or the Government; state who benefits before accepting it.",
    ],
    enUse: "Use a favor to change the situation, not to skip the interesting part. An Elite should deliver a door and a new question about who controls the key.",
  }),
  bookMapChapter({
    id: "uprising-mission-loop",
    ptTitle: "Uprising: ciclo de missão",
    enTitle: "Uprising: the mission loop",
    pages: "Páginas 119–120",
    ptIntro: "Cada missão passa por preparação, briefing, operação e debrief. O ciclo mantém a campanha legível: uma meta é declarada, transgressões produzem pressão e as mudanças aparecem no fim.",
    ptSections: [
      "Briefing: apresente metas da Resistência e do Governo, oposição inicial, transgressões possíveis, blowback e qualquer informação que os personagens possam descobrir.",
      "Operação: enquadre a primeira decisão em uma situação concreta; não esconda todas as metas atrás de uma única solução.",
      "Transgressão: quando uma regra importante é quebrada, marque a consequência e dê ao Governo uma resposta observável.",
      "Blowback: uma falha ou sucesso com custo pode criar oposição futura, Bank, acusação ou mudança no mapa.",
      "Debrief: encerre a ficção antes de distribuir avanços; o grupo precisa saber o que mudou e quem viu.",
    ],
    ptUse: "Resuma a missão em uma frase que contenha verbo, alvo e risco. Se ninguém consegue repetir a frase, o briefing ainda está abstrato.",
    enIntro: "Each mission passes through preparation, briefing, operation, and debrief. The loop keeps a campaign legible: a goal is stated, transgressions create pressure, and changes appear at the end.",
    enSections: [
      "Briefing: present Resistance and Government goals, initial opposition, possible transgressions, blowback, and information characters can discover.",
      "Operation: frame the first decision in a concrete situation; do not hide every goal behind one solution.",
      "Transgression: when an important rule is broken, mark its consequence and give the Government an observable response.",
      "Blowback: a failure or costly success can create future opposition, Bank, accusation, or a changed map.",
      "Debrief: end the fiction before handing out advances; the group should know what changed and who saw it.",
    ],
    enUse: "Summarize a mission with a verb, target, and risk. If no one can repeat the sentence, the briefing is still abstract.",
  }),
  bookMapChapter({
    id: "uprising-conflicts",
    ptTitle: "Uprising: conflitos, meios e fins",
    enTitle: "Uprising: conflicts, means, and ends",
    pages: "Páginas 121–138",
    ptIntro: "Conflitos são cenas de decisão contínua. O Narrador determina lados, foco e oposição; depois cada pessoa escolhe um meio e um fim, age quando chegar sua vez e deixa a situação mais difícil ou mais clara.",
    ptSections: [
      "Montar conflito: determine lados, enquadre zonas, nomeie metas e escolha quem começa. Dê aos jogadores espaço para declarar concessão.",
      "Quatro meios: Fight, Manipulate, Maneuver e Observe cobrem força, influência, posição e leitura; descreva o método antes do número.",
      "Quatro fins: cause harm, gain advantage, avoid e resolve uncertain outcome produzem resultados diferentes mesmo com a mesma margem.",
      "Meio adequado/arriscado: um meio adequado ajuda a rolagem; um arriscado pode limitar o fim ou aumentar o custo, sempre anunciado antes.",
      "Ajudar e atrapalhar: comprometer a próxima ação para somar pressão torna a cooperação uma escolha com risco.",
      "Concessão e retirada: conceder preserva agência e muda o preço; não transforme tirar de ação em uma punição automática sem acordo.",
    ],
    ptUse: "Peça sempre a descrição em linguagem comum antes do termo de regra. A Mesa entende o conflito quando sabe quem quer o quê e o que uma falha muda.",
    enIntro: "Conflicts are scenes of continuous decision. The Game Master sets sides, focus, and opposition; then each person chooses a means and end, acts in turn, and makes the situation harder or clearer.",
    enSections: [
      "Frame a conflict: determine sides, frame zones, name goals, and choose who starts. Give players room to declare a concession.",
      "Four means: Fight, Manipulate, Maneuver, and Observe cover force, influence, position, and reading; describe the method before the number.",
      "Four ends: cause harm, gain advantage, avoid, and resolve uncertain outcome produce different results even with the same margin.",
      "Suited/risky means: a suited means helps the roll; a risky one can limit the end or raise cost, always announced beforehand.",
      "Help and hinder: committing the next action to add pressure makes cooperation a choice with risk.",
      "Concession and withdrawal: conceding preserves agency and changes the price; do not make being taken out an automatic punishment without agreement.",
    ],
    enUse: "Ask for plain-language description before rule terms. The table understands a conflict when it knows who wants what and what failure changes.",
  }),
  bookMapChapter({
    id: "uprising-zones-conditions",
    ptTitle: "Uprising: zonas, impulsos e condições",
    enTitle: "Uprising: zones, boosts, and conditions",
    pages: "Páginas 139–145",
    ptIntro: "Zonas tornam distância uma decisão ficcional; impulsos guardam uma oportunidade curta; condições mostram o custo que a personagem ainda carrega. Os três elementos substituem detalhes que só atrapalhariam o ritmo.",
    ptSections: [
      "Zonas físicas: quartos, ruas e telhados; zonas abstratas: rede, atenção pública ou cobertura. Um aspecto pode definir mais de uma zona.",
      "Mover: Maneuver muda a posição, atravessa zonas e pode criar vantagem; diga o que impede a passagem.",
      "Impulsos: um impulso tem nome, aspecto ao qual se liga e janela de uso. Depois de usado ou invalidado, desaparece.",
      "Condições: Angry, Wounded, Compromised, Depleted e Marked for Death variam conforme a classe; Citoyens acrescenta Blacklisted e Exilés usa Person of Interest.",
      "Limpar: uma condição pode exigir tempo, cuidado, favor ou decisão. Marcar a caixa sem mostrar a mudança enfraquece a ficção.",
    ],
    ptUse: "Faça a zona caber na pergunta da cena. Se distância não importa, não desenhe um mapa; se importa, dê a cada lugar um aspecto que possa ser usado.",
    enIntro: "Zones make distance a fictional decision; boosts hold a short opportunity; conditions show the cost a character still carries. Together they replace detail that would only slow the game.",
    enSections: [
      "Physical zones: rooms, streets, and rooftops; abstract zones: a network, public attention, or cover. An aspect can define more than one zone.",
      "Move: Maneuver changes position, crosses zones, and can create an advantage; state what blocks the passage.",
      "Boosts: a boost has a name, an aspect it attaches to, and a usage window. Once used or invalidated, it disappears.",
      "Conditions: Angry, Wounded, Compromised, Depleted, and Marked for Death vary by class; Citoyens add Blacklisted and Exilés use Person of Interest.",
      "Clear: a condition may require time, care, a favor, or a decision. Marking a box without showing change weakens the fiction.",
    ],
    enUse: "Make the zone fit the scene’s question. If distance does not matter, skip a map; if it does, give each place an aspect that can be used.",
  }),
  bookMapChapter({
    id: "uprising-taken-out",
    ptTitle: "Uprising: tirado de ação, morte e sacrifício",
    enTitle: "Uprising: taken out, death, and sacrifice",
    pages: "Páginas 146–148",
    ptIntro: "Quando as condições não suportam mais a pressão, a personagem é tirada de ação e a Mesa decide o significado da derrota. Morte gloriosa, sacrifício e traição são marcos narrativos, não surpresas impostas.",
    ptSections: [
      "Tirado de ação: quem venceu propõe o resultado, mas a pessoa afetada pode conceder, negociar ou escolher uma saída que preserve o futuro.",
      "Morte: só acontece quando a Mesa aceita o peso ficcional; descreva o que a personagem deixa para a Resistência e que avanço isso gera.",
      "Sacrifício: uma pessoa pode pagar o preço para que a missão continue; o resultado deve mudar metas, relações ou a trilha de avanço.",
      "Traição: revelar lealdade ao Governo muda a situação e abre uma acusação; não apague a história anterior nem a agência dos demais.",
      "Milestones: morte, sacrifício e traição podem ser marcos maiores quando a Mesa reconhece a mudança.",
    ],
    ptUse: "Negocie a derrota como parte da história. O objetivo não é proteger todo mundo de consequências, mas garantir que a consequência tenha significado para quem a vive.",
    enIntro: "When conditions cannot take more pressure, a character is taken out and the table decides what defeat means. Glorious death, sacrifice, and betrayal are narrative milestones, not imposed surprises.",
    enSections: [
      "Taken out: the winner proposes the result, but the affected player may concede, negotiate, or choose an exit that preserves the future.",
      "Death: it happens only when the table accepts the fictional weight; describe what the character leaves the Resistance and what advance it creates.",
      "Sacrifice: a person may pay the price so the mission continues; the result must change goals, relationships, or the advancement track.",
      "Betrayal: revealing Government loyalty changes the situation and opens an accusation; do not erase prior history or others’ agency.",
      "Milestones: death, sacrifice, and betrayal can be major milestones when the table recognizes the change.",
    ],
    enUse: "Negotiate defeat as part of the story. The aim is not to protect everyone from consequences, but to ensure each consequence means something to the person living it.",
  }),
  bookMapChapter({
    id: "uprising-debrief-advancement",
    ptTitle: "Uprising: debrief e avanços",
    enTitle: "Uprising: debrief and advancement",
    pages: "Páginas 149–164",
    ptIntro: "O debrief transforma a missão em campanha. Quatro passos — avanço da personagem, da Resistência, do Governo e acusações — tornam visível quem ganhou espaço e que dívida ficou.",
    ptSections: [
      "Avanço da personagem: aumente recarga até 5, melhore um meio, compre façanha, adicione uma modificação corporal ou crie um contato conforme o gatilho vivido.",
      "Avanço da Resistência: escolha Intel, Recursos ou Apoio; avanços críticos alteram a duração e aproximam Revolution.",
      "Avanço do Governo: escolha Corporativo, Militar ou Segurança; o Narrador só deve avançar quando a ficção mostrar a causa.",
      "Acusações: limpar o nome dá avanço ao Governo; virar a acusação gera avanço imediato para quem acusou; sacrifício pode dar avanço à Resistência.",
      "Registro: escreva uma frase sobre a mudança, uma consequência aberta e a próxima pergunta da Mesa antes de iniciar outra preparação.",
    ],
    ptUse: "Faça o debrief em voz alta. Contadores só ajudam quando todos sabem qual cena os moveu e qual escolha pode interromper o próximo avanço.",
    enIntro: "The debrief turns a mission into a campaign. Four steps—character, Resistance, Government, and accusations—make visible who gained ground and what debt remains.",
    enSections: [
      "Character advance: raise refresh up to 5, improve a means, buy a stunt, add an augmentation, or create a contact according to what happened.",
      "Resistance advance: choose Intel, Resources, or Support; critical advances change campaign length and move toward Revolution.",
      "Government advance: choose Corporate, Military, or Security; the GM should advance only when the fiction shows the cause.",
      "Accusations: clearing a name gives the Government an advance; turning the accusation gives the accuser an immediate advance; sacrifice can advance the Resistance.",
      "Record: write one sentence about the change, one open consequence, and the table’s next question before starting another prep scene.",
    ],
    enUse: "Run the debrief aloud. Counters help only when everyone knows which scene moved them and which choice could interrupt the next advance.",
  }),
  bookMapChapter({
    id: "uprising-augmentations-contacts",
    ptTitle: "Uprising: modificações corporais e contatos",
    enTitle: "Uprising: augmentations and contacts",
    pages: "Páginas 153–164",
    ptIntro: "Aprimoramentos e contatos ampliam o que uma pessoa pode fazer sem apagar o custo de viver em Paris Nouveau. Cada benefício deve trazer manutenção, visibilidade ou uma relação que a Mesa possa usar.",
    ptSections: [
      "Cybertech: implantes mecânicos dão acesso e precisão, mas podem ser detectados, rastreados ou danificados.",
      "Nanotech: enxames e reparos alteram o corpo em escala pequena; deixe claro o limite e que recurso os mantém ativos.",
      "Biotech: tecido cultivado e adaptação orgânica mudam aparência, resistência ou necessidade; consequências sociais continuam relevantes.",
      "Contatos: Arielle, Jean le Roux, Henri Singh, Marya, Selise e Sidenge oferecem caminhos diferentes, com interesses e preços próprios.",
      "Avanço visível: transformar uma pessoa deve alterar uma cena futura, não só acrescentar um bônus permanente à ficha.",
    ],
    ptUse: "Pergunte qual sistema, pessoa ou instituição foi afetado pela modificação corporal. A resposta transforma tecnologia em história, em vez de só equipamento.",
    enIntro: "Augmentations and contacts expand what a person can do without erasing the cost of living in Paris Nouveau. Each benefit should bring maintenance, visibility, or a relationship the table can use.",
    enSections: [
      "Cybertech: mechanical implants grant access and precision, but can be detected, tracked, or damaged.",
      "Nanotech: swarms and repairs alter the body at small scale; state their limit and what resource keeps them active.",
      "Biotech: cultured tissue and organic adaptation change appearance, resilience, or need; social consequences still matter.",
      "Contacts: Arielle, Jean le Roux, Henri Singh, Marya, Selise, and Sidenge offer different routes with their own interests and prices.",
      "Visible advancement: changing a person should alter a future scene, not only add a permanent bonus to the sheet.",
    ],
    enUse: "Ask which system, person, or institution the augmentation affects. The answer turns technology into story instead of equipment alone.",
  }),
  bookMapChapter({
    id: "uprising-corporations",
    ptTitle: "Uprising: os patrocinadores corporativos",
    enTitle: "Uprising: corporate sponsors",
    pages: "Páginas 165–176",
    ptIntro: "As corporações tornam a opressão concreta. Cada patrocinador controla uma parte da vida, oferece recursos e produz uma contradição que a resistência pode revelar.",
    ptSections: [
      "Corvid Economics: bancos e crédito controlam dívida; Cryptiq administra energia kJ; InfoSec vende segurança e vigilância.",
      "LaFleur: entretenimento, notícias e véus definem o que pode ser visto; Paragon vende vestíveis e implantes.",
      "Quesada miniaturiza tecnologia; Rathburn transforma resíduos e drenagem em infraestrutura; Sun Systems produz APE; Verdi controla transporte.",
      "Patrocinador não é sinônimo de vilão: escolha pessoas, dependências e rachaduras internas que permitam cenas de negociação.",
      "Aspectos corporativos: registre missão pública, prática escondida, recurso, fraqueza e quem paga quando a imagem quebra.",
    ],
    ptUse: "Mostre a corporação em uma fila, uma conta ou um implante antes de mostrar o logotipo. O conflito fica humano quando a decisão afeta alguém conhecido.",
    enIntro: "Corporations make oppression concrete. Each sponsor controls part of life, offers resources, and creates a contradiction the resistance can expose.",
    enSections: [
      "Corvid Economics: banks and credit control debt; Cryptiq manages kJ energy; InfoSec sells security and surveillance.",
      "LaFleur: entertainment, news, and veils decide what can be seen; Paragon sells wearables and implants.",
      "Quesada miniaturizes technology; Rathburn turns waste and drainage into infrastructure; Sun Systems produces APE; Verdi controls transport.",
      "A sponsor is not a synonym for villain: choose people, dependencies, and internal cracks that permit negotiation scenes.",
      "Corporate aspects: record public mission, hidden practice, resource, weakness, and who pays when the image breaks.",
    ],
    enUse: "Show the corporation in a queue, bill, or implant before showing its logo. Conflict becomes human when a decision affects someone known.",
  }),
  bookMapChapter({
    id: "uprising-gm-tools",
    ptTitle: "Uprising: ferramentas do Narrador",
    enTitle: "Uprising: Game Master tools",
    pages: "Páginas 177–198",
    ptIntro: "O Narrador trabalha com Budget, Bank, blowback e oposição pronta. A meta é dar resistência ao Governo sem antecipar uma solução nem transformar cada PdN em uma ficha completa.",
    ptSections: [
      "Budget: comece com o número de personagens mais um; o Bank adiciona recursos. Gaste para introduzir oposição, não para punir uma rolagem específica.",
      "PdN: escolha três aspectos e use dois, acrescente meios, condições e uma motivação; personagens importantes merecem uma promessa clara, não uma enciclopédia.",
      "Clare, líder: use-a como ponto de vista e pressão, nunca como voz que resolve a missão pelos jogadores.",
      "Estrutura: briefing, conjunto de cenas, oposição, metas, zonas, elenco, transgressões, complicações e descobertas formam uma missão pronta.",
      "Criar missões: comece por uma decisão impossível, dê ao Governo uma resposta e deixe pelo menos duas rotas de ação.",
      "Brake: quando material sensível se aproxima de um limite, desacelere, pergunte e ajuste; segurança mantém a resistência jogável.",
    ],
    ptUse: "Prepare o que reage, não o que precisa acontecer. Um bom Budget faz o Governo responder às escolhas da Mesa em vez de empurrá-la para um trilho.",
    enIntro: "The Game Master works with Budget, Bank, blowback, and ready opposition. The aim is to give the Government resistance without pre-deciding a solution or turning every NPC into a full sheet.",
    enSections: [
      "Budget: start with the number of PCs plus one; Bank adds resources. Spend to introduce opposition, not to punish one particular roll.",
      "NPCs: choose three aspects and use two, add means, conditions, and a motivation; important characters need a clear promise, not an encyclopedia.",
      "Clare, the leader: use her as viewpoint and pressure, never as the voice that solves the mission for players.",
      "Structure: briefing, scene set, opposition, goals, zones, cast, transgressions, complications, and discoveries form a ready mission.",
      "Make missions: start with an impossible choice, give the Government a response, and leave at least two routes of action.",
      "Brake: when sensitive material nears a boundary, slow down, ask, and adjust; safety keeps resistance playable.",
    ],
    enUse: "Prepare what reacts, not what must happen. A good Budget makes the Government respond to table choices instead of pushing the group down a track.",
  }),
  bookMapChapter({
    id: "uprising-missions-early",
    ptTitle: "Uprising: missões — primeiros passos",
    enTitle: "Uprising: missions — first steps",
    pages: "Páginas 199–228",
    ptIntro: "As primeiras missões ensinam o ciclo por escalada: recuperar, interceptar, investigar e sobreviver. Cada uma traz briefing, conjunto, oposição, metas e complicações que o Narrador pode adaptar.",
    ptSections: [
      "Warehouse Raid: um armazém e seus registros apresentam risco físico e informação que pode mudar a meta.",
      "Convoy Ambush: o comboio transforma zonas e tempo em escolhas sobre carga, testemunhas e fuga.",
      "Corporate Espionage: infiltração e vigilância colocam Observe, Manipulate e segredos em primeiro plano.",
      "Corporate Retaliation: a resposta do patrocinador mostra blowback, acusação e como a cidade pode fechar portas.",
      "Missing Supplies: uma falta material força a equipe a escolher entre uma comunidade, um contato e a próxima operação.",
      "Adapte o elenco: mantenha metas da Resistência e do Governo, mas troque locais e pessoas para refletir a Mesa.",
    ],
    ptUse: "Use uma destas missões para aprender o procedimento e depois mude pelo menos um elemento importante. O mapa existe para preparar, não para prender a história.",
    enIntro: "The first missions teach the loop through escalation: recover, intercept, investigate, and survive. Each provides briefing, set, opposition, goals, and complications the GM can adapt.",
    enSections: [
      "Warehouse Raid: a warehouse and its records present physical risk and information that can change the goal.",
      "Convoy Ambush: the convoy turns zones and time into choices about cargo, witnesses, and escape.",
      "Corporate Espionage: infiltration and surveillance put Observe, Manipulate, and secrets first.",
      "Corporate Retaliation: a sponsor’s response shows blowback, accusation, and how the city can close doors.",
      "Missing Supplies: a material shortage forces a choice among a community, a contact, and the next operation.",
      "Adapt the cast: keep Resistance and Government goals, but change places and people to reflect the table.",
    ],
    enUse: "Use one mission to learn the procedure, then change at least one important element. The map prepares the story; it does not trap it.",
  }),
  bookMapChapter({
    id: "uprising-missions-middle",
    ptTitle: "Uprising: missões — pressão e escolha",
    enTitle: "Uprising: missions — pressure and choice",
    pages: "Páginas 229–252",
    ptIntro: "O segundo conjunto eleva o custo moral e a visibilidade. As missões convidam a Mesa a negociar, recrutar, invadir e decidir que tipo de vitória ainda merece esse nome.",
    ptSections: [
      "Peace Offering: uma oferta de paz pode esconder dívida, trégua ou oportunidade de expor uma corporação.",
      "Mercy: salvar alguém entra em conflito com prazo, segurança e a imagem que a Resistência quer projetar.",
      "Recruitment Drive: novas pessoas aumentam capacidade e também o risco de infiltração, cuidado e responsabilidade.",
      "White Hats, Black Market: a fronteira entre ajuda legítima e mercado clandestino cobra preço de confiança.",
      "Black Bag: uma operação secreta testa condições, contatos, sigilo e o que significa voltar sem reconhecimento.",
      "Raid: uma incursão aberta cria múltiplas zonas, blowback e escolhas sobre retirar-se ou insistir.",
    ],
    ptUse: "Antes de começar, combine o que a Mesa considera uma vitória. Assim a missão pode terminar com custo sem parecer que o livro mudou a regra depois.",
    enIntro: "The second set raises moral cost and visibility. These missions invite the table to negotiate, recruit, infiltrate, and decide what kind of victory still deserves the name.",
    enSections: [
      "Peace Offering: an offer of peace may hide debt, truce, or a chance to expose a corporation.",
      "Mercy: saving someone conflicts with time, safety, and the image the Resistance wants to project.",
      "Recruitment Drive: new people increase capacity and the risks of infiltration, care, and responsibility.",
      "White Hats, Black Market: the line between legitimate help and a black market charges a trust price.",
      "Black Bag: a covert operation tests conditions, contacts, secrecy, and what it means to return unrecognized.",
      "Raid: an open incursion creates multiple zones, blowback, and choices about withdrawing or pressing on.",
    ],
    enUse: "Agree on what counts as victory before starting. Then a costly ending will feel like a choice, not a rule changed after the fact.",
  }),
  bookMapChapter({
    id: "uprising-missions-late",
    ptTitle: "Uprising: missões — visibilidade e ruptura",
    enTitle: "Uprising: missions — visibility and rupture",
    pages: "Páginas 253–266",
    ptIntro: "As missões tardias colocam a resistência no centro da cidade. Demonstração, amizade, rendição e dinheiro tornam os aspectos públicos tão perigosos quanto uma arma.",
    ptSections: [
      "Demonstration: escolha mensagem, rota, proteção e o que fazer quando a multidão deixa de obedecer ao plano.",
      "The Friend: uma relação pessoal pode ser a pista, a vítima ou a ponte que impede a Resistência de virar apenas estratégia.",
      "Rendition: retirar alguém de custódia exige zonas, tempo, contatos e a decisão sobre quem fica para trás.",
      "The Paymaster: siga dinheiro, favores e acusação até uma pessoa que acredita controlar o movimento.",
      "Preparar o fim: cada missão deve deixar pelo menos uma consequência aberta para Revolution ou Purge.",
    ],
    ptUse: "Dê nome ao que será lembrado depois. Visibilidade só importa quando uma pessoa, uma rua ou uma instituição consegue contar a história da missão.",
    enIntro: "Late missions put the resistance at the city’s center. Demonstration, friendship, rendition, and money make public aspects as dangerous as a weapon.",
    enSections: [
      "Demonstration: choose message, route, protection, and what to do when a crowd stops following the plan.",
      "The Friend: a personal relationship can be clue, victim, or bridge keeping the Resistance from becoming strategy alone.",
      "Rendition: extracting someone from custody needs zones, time, contacts, and a choice about who stays behind.",
      "The Paymaster: follow money, favors, and accusation to a person who believes they control the movement.",
      "Prepare the end: each mission should leave at least one open consequence for Revolution or Purge.",
    ],
    enUse: "Name what will be remembered. Visibility matters only when a person, street, or institution can tell the mission’s story.",
  }),
  bookMapChapter({
    id: "uprising-endgames-appendices",
    ptTitle: "Uprising: Revolution, Purge e apêndices",
    enTitle: "Uprising: Revolution, Purge, and appendices",
    pages: "Páginas 267–314",
    ptIntro: "O endgame fecha a campanha sem apagar suas escolhas. Revolution dá tempo para preparar a tomada da cidade; Purge começa sem esse preparo e pergunta o que a Resistência consegue salvar durante a limpeza.",
    ptSections: [
      "Revolution: use avanços críticos, metas acumuladas e uma preparação final; o resultado mede quem governa, quem é ouvido e que custo permanece.",
      "Purge: a campanha entra em crise sem uma preparação confortável; cada cena responde à pergunta sobre sobrevivência, memória e responsabilidade.",
      "Depois do fim: mostre o que mudou em Paris Nouveau, nas classes, nas corporações e nas relações, sem prometer uma utopia automática.",
      "Termos franceses: o glossário mantém nomes do cenário e evita criar traduções concorrentes na mesma língua.",
      "Folhas e cartões: Character Sheets, Government Advancement Sheet, Resistance Advancement Sheet e Secret Cards são referências de mesa, não conteúdo separado da regra.",
    ],
    ptUse: "Reserve tempo para o epílogo. Uma campanha de resistência termina quando a Mesa consegue dizer o que libertou, o que perdeu e quem carregará a próxima decisão.",
    enIntro: "The endgame closes the campaign without erasing its choices. Revolution allows time to prepare the city’s takeover; Purge begins without that comfort and asks what the Resistance can save during the cleansing.",
    enSections: [
      "Revolution: use critical advances, accumulated goals, and a final preparation; the result measures who governs, who is heard, and what cost remains.",
      "Purge: the campaign enters crisis without comfortable preparation; every scene answers what survival, memory, and responsibility require.",
      "After the end: show what changed in Paris Nouveau, classes, corporations, and relationships without promising automatic utopia.",
      "French terms: the glossary keeps setting names and avoids competing translations in the same language.",
      "Sheets and cards: Character Sheets, Government Advancement Sheet, Resistance Advancement Sheet, and Secret Cards are table references, not rules outside the system.",
    ],
    enUse: "Make room for an epilogue. A resistance campaign ends when the table can say what it freed, what it lost, and who carries the next decision.",
  }),
];

const tachyonSquadronChapters = [
  bookMapChapter({
    id: "tachyon-introduction",
    ptTitle: "Tachyon Squadron: mundo e tom",
    enTitle: "Tachyon Squadron: world and tone",
    pages: "Páginas 7–10",
    ptIntro: "Tachyon Squadron é um suplemento de Fate Core sobre pilotos de caça que defendem a Draconis independente contra o Dominion. Ele combina ópera espacial e ficção científica militar, preservando a regra principal do Fate Condensado quando houver adaptação.",
    ptSections: [
      "A promessa: missões de voo, relações entre esquadrão e decisões de guerra em que uma vitória tática pode ter custo político.",
      "Tecnologia: motores Chandrasekhar, gravidade artificial, armas de energia e caixas-pretas sustentam o cenário sem exigir uma aula de física.",
      "Escala humana: não há outras espécies sapientes obrigatórias; inteligências artificiais são ferramentas, não pilotos autônomos equivalentes.",
      "Fonte do conflito: a Guerra Galáctica terminou em armistício, Draconis declarou independência e a República apoia a defesa por meio da DVG.",
      "Vocabulário: o livro preserva termos de aviação e espaço para que a ação seja rápida e legível.",
    ],
    ptUse: "Escolha se a campanha quer drama de esquadrão, operação militar ou exploração do sistema. O combate só precisa de detalhe quando a decisão depende dele.",
    enIntro: "Tachyon Squadron is a Fate Core supplement about fighter pilots defending independent Draconis against the Dominion. It blends space opera and military science fiction while preserving Fate Condensed as the principal rule when adapted.",
    enSections: [
      "The promise: flight missions, squadron relationships, and war decisions where a tactical victory can carry a political cost.",
      "Technology: Chandrasekhar drives, artificial gravity, energy weapons, and black boxes support the setting without requiring a physics lecture.",
      "Human scale: no other sapient species are required; artificial intelligences are tools, not equivalent autonomous pilots.",
      "Conflict source: the Great Galactic War ended in an armistice, Draconis declared independence, and the Republic supports defense through the DVG.",
      "Vocabulary: the book keeps aviation and space terms so action stays fast and legible.",
    ],
    enUse: "Choose whether the campaign wants squadron drama, military operation, or system exploration. Add combat detail only when a decision depends on it.",
  }),
  bookMapChapter({
    id: "tachyon-pilot-creation",
    ptTitle: "Tachyon Squadron: criar um piloto",
    enTitle: "Tachyon Squadron: creating a pilot",
    pages: "Páginas 11–22",
    ptIntro: "A criação combina o formato do Fate com um callsign, relações e uma decompression que mostra como o piloto lida com a guerra. A ficha conecta a pessoa ao caça, ao esquadrão e ao que acontece fora do cockpit.",
    ptSections: [
      "Conceito e callsign: escolha o que o piloto faz, por que voa e como o nome de rádio conta uma história curta.",
      "Aspectos: high concept, problema, origem, duas relações e um aspecto livre; um jogador ajuda a criar a origem de outro.",
      "Decompression: escreva uma forma saudável e uma forma não saudável de lidar com estresse; ambas podem gerar cena entre missões.",
      "Estresse pessoal e incidentais: registre estresse, consequências, detalhes pessoais e o que não cabe no relatório oficial.",
      "Relações: amizade, rivalidade, família e dívida voltam à missão como aspecto ou complicação, sem controlar a decisão de ninguém.",
    ],
    ptUse: "Faça o callsign e a relação aparecerem na primeira cena. Um piloto só fica memorável quando o esquadrão sabe quem ele é fora do número da aeronave.",
    enIntro: "Creation combines Fate’s format with a callsign, relationships, and decompression showing how a pilot handles war. The sheet connects person, fighter, squadron, and life outside the cockpit.",
    enSections: [
      "Concept and callsign: choose what the pilot does, why they fly, and how the radio name tells a short story.",
      "Aspects: high concept, trouble, origin, two relationships, and one free aspect; one player helps create another’s origin.",
      "Decompression: write a healthy and an unhealthy way to cope; both can create scenes between missions.",
      "Personal stress and incidentals: record stress, consequences, personal details, and what does not fit the official report.",
      "Relationships: friendship, rivalry, family, and debt return to missions as an aspect or complication without controlling anyone’s choice.",
    ],
    enUse: "Bring the callsign and a relationship into the first scene. A pilot is memorable when the squadron knows who they are beyond an aircraft number.",
  }),
  bookMapChapter({
    id: "tachyon-skills",
    ptTitle: "Tachyon Squadron: perícias",
    enTitle: "Tachyon Squadron: skills",
    pages: "Páginas 23–30",
    ptIntro: "A pirâmide de perícias separa o que o piloto faz no espaço, em uma ação e em relações sociais. O conjunto é uma expansão de vocabulário; o Fate Condensado continua sendo o nome principal quando houver equivalência.",
    ptSections: [
      "Perícias espaciais: Gunnery, Pilot, Tactics e Technology resolvem tiro, voo, leitura de combate e sistemas.",
      "Perícias de ação: Athletics, Fight, Notice, Shoot e Sneak cobrem o corpo e a ação fora da nave.",
      "Perícias sociais: Discipline, Empathy, Investigate, Provoke e Rapport; Deceive não faz parte da lista deste suplemento.",
      "Pirâmide: uma perícia Great (+4), duas Good (+3), três Fair (+2) e quatro Average (+1), salvo escolha explícita da Mesa.",
      "Fora do cockpit: uma perícia espacial pode ser útil no chão quando a ficção mostrar a conexão, não como bônus automático.",
    ],
    ptUse: "Leia o nome da perícia como promessa de cena. Se uma campanha do Condensado já usa outro nome para a mesma tarefa, preserve o nome principal e marque este como variação da expansão.",
    enIntro: "The skill pyramid separates what a pilot does in space, in action, and in social relationships. The set is an expansion vocabulary; Fate Condensed remains the principal name where an equivalent exists.",
    enSections: [
      "Spacefaring skills: Gunnery, Pilot, Tactics, and Technology handle fire, flight, combat reading, and systems.",
      "Action skills: Athletics, Fight, Notice, Shoot, and Sneak cover body and action outside the ship.",
      "Social skills: Discipline, Empathy, Investigate, Provoke, and Rapport; Deceive is not part of this supplement’s list.",
      "Pyramid: one Great (+4), two Good (+3), three Fair (+2), and four Average (+1), unless the table explicitly chooses otherwise.",
      "Outside the cockpit: a spacefaring skill can help on the ground when the fiction shows the connection, not as an automatic bonus.",
    ],
    enUse: "Read a skill name as a scene promise. If a Condensed campaign already uses another name for the same task, keep the principal name and mark this as the expansion variant.",
  }),
  bookMapChapter({
    id: "tachyon-stunts-gear",
    ptTitle: "Tachyon Squadron: façanhas pessoais e de equipamento",
    enTitle: "Tachyon Squadron: personal and gear stunts",
    pages: "Páginas 31–34",
    ptIntro: "O piloto começa com duas façanhas pessoais e uma de equipamento, com recarga 3. Façanhas pessoais ampliam a pessoa; façanhas de equipamento definem o caça ou módulo e não custam recarga.",
    ptSections: [
      "Façanha pessoal: altere uma perícia em circunstância específica, crie uma exceção ou transforme um aspecto em ação clara.",
      "Façanha de equipamento: blaster, scanner e telas mostram como um módulo aumenta ou reduz dados, com no máximo duas façanhas aplicadas a uma rolagem.",
      "Recarga: comprar mais façanhas pessoais reduz recarga; o custo precisa aparecer na forma como o piloto recupera pontos de destino.",
      "Maximizar e minimizar dados: equipamento pode escolher melhores resultados ou limitar piores resultados quando a ficção e a façanha permitirem.",
      "Limites: escreva alvo, frequência e condição. Um caça não pode resolver uma cena de relação sem uma consequência humana.",
    ],
    ptUse: "Nomeie o módulo que torna a façanha possível. Isso facilita manutenção, dano e decisões quando o equipamento não está disponível.",
    enIntro: "A pilot begins with two personal stunts and one gear stunt, at refresh 3. Personal stunts expand the person; gear stunts define the fighter or module and do not cost refresh.",
    enSections: [
      "Personal stunt: alter a skill in a specific circumstance, create an exception, or turn an aspect into a clear action.",
      "Gear stunt: blaster, scanner, and screens show how a module maximizes or minimizes dice, with no more than two stunts applied to one roll.",
      "Refresh: buying more personal stunts lowers refresh; the cost must appear in how the pilot recovers fate points.",
      "Dice maximization and minimization: gear can choose better results or limit worse results when fiction and stunt allow it.",
      "Limits: write target, frequency, and condition. A fighter cannot solve a relationship scene without a human consequence.",
    ],
    enUse: "Name the module that makes a stunt possible. This keeps maintenance, damage, and unavailable equipment easy to adjudicate.",
  }),
  bookMapChapter({
    id: "tachyon-engagement-phases",
    ptTitle: "Tachyon Squadron: fases do engajamento",
    enTitle: "Tachyon Squadron: engagement phases",
    pages: "Páginas 35–43",
    ptIntro: "O engajamento usa quatro fases por rodada: detecção, manobra, ação e fim da rodada. O procedimento dá ao combate aéreo uma posição visível antes de pedir uma rolagem de dano.",
    ptSections: [
      "Detecção: Technology encontra voos; oposição e distância definem quem começa detectado. Naves grandes nunca ficam indetectadas.",
      "Manobra: Tactics coloca cada voo no Maneuver Chart, de Undetected à posição especial, e cria tail, shake ou saída.",
      "Ação: quem está mais alto no quadro age primeiro, pode atacar alvo na mesma posição ou abaixo e usa dois passos por turno.",
      "Fim da rodada: degrade posições conforme o quadro e resolva efeitos que persistem; a próxima rodada começa com o novo estado.",
      "Leitura: o quadro é uma ferramenta compartilhada, não um segundo mapa que precisa ser memorizado.",
    ],
    ptUse: "Mostre o Maneuver Chart na mesa. Se todos sabem quem está no tail e quem ainda não foi detectado, a fase de ação fica naturalmente rápida.",
    enIntro: "An engagement uses four phases each round: detection, maneuver, action, and end of round. The procedure gives fighter combat a visible position before asking for a damage roll.",
    enSections: [
      "Detection: Technology finds flights; opposition and distance decide who starts detected. Big ships are never undetected.",
      "Maneuver: Tactics places each flight on the Maneuver Chart, from Undetected to Special, and creates tail, shake, or exit states.",
      "Action: the highest position acts first, can attack a target at the same or lower position, and gets two steps per turn.",
      "End of round: degrade positions according to the chart and resolve persistent effects; the next round begins from that state.",
      "Readability: the chart is a shared tool, not a second map everyone must memorize.",
    ],
    enUse: "Keep the Maneuver Chart visible. When everyone knows who has a tail and who remains undetected, the action phase becomes naturally fast.",
  }),
  bookMapChapter({
    id: "tachyon-shields-damage",
    ptTitle: "Tachyon Squadron: telas, dano e retirada",
    enTitle: "Tachyon Squadron: shields, damage, and bugging out",
    pages: "Páginas 44–68",
    ptIntro: "Telas absorvem impacto antes do dano ao caça; o quadro de dano transforma cada acerto em escolha sobre sistemas, dados e consequências pessoais. Uma equipe pode simplificar ou detalhar sem mudar o significado da retirada.",
    ptSections: [
      "Telas: trate a reserva como pontos de impacto; quando acaba, cada instância de dano precisa ser mitigada ou marcar sistema.",
      "Dano: cada instância costuma valer dois shifts de mitigação e um shift pessoal; escolha o que falha e registre o aspecto resultante.",
      "Quadro de dano: sistemas, armas e manobra podem ganhar condição; dano simples é uma alternativa quando a cena não precisa de manutenção detalhada.",
      "Dano pessoal: estresse e consequências refletem ferimentos, desorientação e pressão sem confundir piloto com nave.",
      "Bug out e concessão: sair do engajamento é decisão tática; não transforme retirada em fracasso automático quando ela salva o esquadrão.",
      "Naves grandes e telas de caças: Big Ships/Large Targets, Fighter Screens, voos e swarms ajustam escala e contagem sem abandonar a ficção.",
    ],
    ptUse: "Escolha o nível de detalhe antes do combate. O método simples é melhor quando a decisão é sobre salvar pessoas; o quadro detalhado é melhor quando um sistema específico importa.",
    enIntro: "Shields absorb impact before fighter damage; the damage chart turns each hit into a choice about systems, dice, and personal consequences. A group can simplify or detail without changing the meaning of withdrawal.",
    enSections: [
      "Shields: treat the pool as hit points; when it runs out, each damage instance must be mitigated or mark a system.",
      "Damage: each instance usually counts as two shifts of mitigation and one personal shift; choose what fails and record the resulting aspect.",
      "Damage chart: systems, weapons, and maneuver can gain a condition; simple damage is an alternative when maintenance detail is not needed.",
      "Personal damage: stress and consequences reflect injury, disorientation, and pressure without confusing pilot and fighter.",
      "Bug out and concede: leaving an engagement is a tactical decision; do not make withdrawal automatic failure when it saves the squadron.",
      "Big ships and fighter screens: Big Ships/Large Targets, Fighter Screens, flights, and swarms adjust scale and count without leaving the fiction.",
    ],
    enUse: "Choose detail level before combat. Simple damage is best when the choice is saving people; a detailed chart is best when one system matters.",
  }),
  bookMapChapter({
    id: "tachyon-maneuver-actions",
    ptTitle: "Tachyon Squadron: quadro de manobra e ações",
    enTitle: "Tachyon Squadron: maneuver chart and actions",
    pages: "Páginas 47–82",
    ptIntro: "O quadro de manobra organiza posição, cauda e oportunidade; as ações de voo traduzem isso em alvos, vetores e escolhas. O jargão é uma ferramenta de comunicação, não uma barreira para quem está começando.",
    ptSections: [
      "Posições: Undetected, Special e os níveis intermediários indicam quem pode atacar, quem está na cauda e quem precisa se reposicionar.",
      "Ações: mover, atacar, criar vantagem, usar equipamento e ajudar são descritas com dois passos por turno quando a ficha permitir.",
      "Voos e enxames: agrupe caças para acelerar a oposição; swarms usam aspectos acumulados e invocações gratuitas para parecer numerosos.",
      "Strike element e payload: uma missão de ataque pode proteger o elemento de ataque enquanto entrega carga a um alvo.",
      "Termos de piloto: ace, bandit, bogey, firing solution, six/tail, victory e wingman deixam a mesa precisa sem exigir inglês fora do glossário.",
      "Dicta Boelcke: oito princípios históricos orientam disciplina de voo; use-os como inspiração e não como ordem que limita escolhas.",
    ],
    ptUse: "Explique o termo quando ele aparece pela primeira vez. O ritmo melhora quando o piloto sabe o que significa estar no six antes de escolher Tactics.",
    enIntro: "The maneuver chart organizes position, tail, and opportunity; flight actions translate them into targets, vectors, and choices. Jargon is a communication tool, not a barrier for newcomers.",
    enSections: [
      "Positions: Undetected, Special, and intermediate levels show who can attack, who has a tail, and who must reposition.",
      "Actions: move, attack, create an advantage, use gear, and help are described with two steps per turn when the sheet permits.",
      "Flights and swarms: group fighters to speed opposition; swarms use stacked aspects and free invokes to feel numerous.",
      "Strike element and payload: a strike mission can protect the strike element while delivering a payload to a target.",
      "Pilot terms: ace, bandit, bogey, firing solution, six/tail, victory, and wingman keep the table precise without requiring untranslated English.",
      "Dicta Boelcke: eight historical flight principles inspire discipline; use them as guidance, not orders that limit choices.",
    ],
    enUse: "Explain a term the first time it appears. Play speeds up when a pilot knows what being on someone’s six means before choosing Tactics.",
  }),
  bookMapChapter({
    id: "tachyon-equipment-engagement-example",
    ptTitle: "Tachyon Squadron: equipamento modular e exemplo",
    enTitle: "Tachyon Squadron: modular equipment and example",
    pages: "Páginas 53–76",
    ptIntro: "Equipamento modular permite configurar uma nave para reconhecimento, defesa ou ataque. O exemplo de engajamento mostra como detecção, manobra, ação, telas e dano se encadeiam em uma cena completa.",
    ptSections: [
      "Módulos: escolha a função do equipamento e o custo narrativo de trocar configuração entre missões.",
      "O exemplo: acompanhe rolagens, posições, invocações, dano e decisões de retirada sem tratar o resultado como roteiro obrigatório.",
      "Nave como extra: uma capacidade do caça deve ter aspecto, condição e limite; não use o módulo para substituir uma perícia pessoal.",
      "Referência rápida: a tabela de manobra, termos de piloto e folha de nave ficam juntos para reduzir consulta durante a ação.",
      "Revisão pós-cena: registre o que quebrou, que aspecto nasceu e que relação do esquadrão mudou.",
    ],
    ptUse: "Monte o caça com a missão em mente e deixe um espaço para improviso. Configuração perfeita demais elimina a decisão que o combate deveria produzir.",
    enIntro: "Modular equipment configures a ship for reconnaissance, defense, or attack. The engagement example shows detection, maneuver, action, shields, and damage as one complete scene.",
    enSections: [
      "Modules: choose equipment function and the narrative cost of changing configuration between missions.",
      "The example: follow rolls, positions, invokes, damage, and withdrawal decisions without treating its result as a required script.",
      "Ship as an extra: a fighter capability needs an aspect, condition, and limit; do not use a module to replace a personal skill.",
      "Quick reference: maneuver chart, pilot terms, and ship sheet stay together to reduce lookup during action.",
      "After the scene: record what broke, which aspect appeared, and which squadron relationship changed.",
    ],
    enUse: "Build the fighter around the mission and leave room for improvisation. A perfect configuration removes the decision combat should create.",
  }),
  bookMapChapter({
    id: "tachyon-galaxy",
    ptTitle: "Tachyon Squadron: a galáxia e Draconis",
    enTitle: "Tachyon Squadron: the galaxy and Draconis",
    pages: "Páginas 83–96",
    ptIntro: "O capítulo de cenário situa a guerra no sistema triplo de Draconis, suas cinco colônias e estações. A geografia dá missões um lugar, uma rota e uma comunidade em risco.",
    ptSections: [
      "História: a Guerra Galáctica terminou em armistício; Draconis rompeu com o Dominion e a DVG recebe apoio secreto da República.",
      "Sistema: Draconis, Asami, Takahashi, Kalamos e Othonoi orbitam um sistema triplo; o aglomerado de asteroides Kripka cria fronteira e abrigo.",
      "Estações: Draconis Station, Iringa Fields, Hull Yards, Asami Processing, Outpost Diyi, Arcosolari Kalamos, Othonoi Prime e Paczynski Station oferecem funções diferentes.",
      "Viagem: jump points e motores Chandrasekhar tornam a distância uma escolha de logística, patrulha e risco.",
      "Questões: independência, escassez, lealdade, propaganda e a presença do Dominion podem ser aspectos de campanha.",
    ],
    ptUse: "Escolha uma estação como lar e duas como promessa de missão. Um mapa pequeno com relações claras é mais jogável do que uma galáxia sem pessoas.",
    enIntro: "The setting chapter places the war in the Draconis trinary, its five planets, and stations. Geography gives missions a place, a route, and a community at risk.",
    enSections: [
      "History: the Great Galactic War ended in an armistice; Draconis broke with the Dominion and the DVG receives covert Republic support.",
      "System: Draconis, Asami, Takahashi, Kalamos, and Othonoi orbit a trinary; the Kripka asteroid cluster creates frontier and shelter.",
      "Stations: Draconis Station, Iringa Fields, Hull Yards, Asami Processing, Outpost Diyi, Arcosolari Kalamos, Othonoi Prime, and Paczynski Station have distinct functions.",
      "Travel: jump points and Chandrasekhar drives make distance a logistics, patrol, and risk choice.",
      "Issues: independence, scarcity, loyalty, propaganda, and the Dominion can become campaign aspects.",
    ],
    enUse: "Choose one station as home and two as mission promises. A small map with clear relationships plays better than a galaxy without people.",
  }),
  bookMapChapter({
    id: "tachyon-pilots-war",
    ptTitle: "Tachyon Squadron: rotina e vida em guerra",
    enTitle: "Tachyon Squadron: pilots at war",
    pages: "Páginas 97–106",
    ptIntro: "Entre missões, pilotos têm duas atividades demoradas, lidam com decompression e mantêm relações. O intervalo não é uma pausa sem regra: é onde o custo da guerra vira escolha pessoal.",
    ptSections: [
      "Rotina: reparos, briefing, descanso, treino e burocracia mostram o esquadrão como local de trabalho e comunidade.",
      "Decompression saudável ou não saudável: limpar estresse pode criar um vínculo, um conflito ou uma complicação futura.",
      "Fora de serviço: fazer compras, investigar, causar confusão e cuidar de uma relação movimentam a campanha sem rolagem de combate.",
      "Escassez: combustível, peças, descanso e informação podem criar aspectos e decisões entre missões.",
      "Rivalidade e contra-ataque: o Dominion reage ao que os pilotos fazem; a resposta mantém o arco conectado.",
    ],
    ptUse: "Peça duas atividades com intenções diferentes. Se cada intervalo só recupera recursos, a campanha perde a parte que explica por que ainda vale a pena voar.",
    enIntro: "Between missions, pilots take two time-consuming activities, decompress, and maintain relationships. Downtime is not ruleless pause: it is where war’s cost becomes a personal choice.",
    enSections: [
      "Routine: repairs, briefing, rest, training, and bureaucracy show the squadron as workplace and community.",
      "Healthy or unhealthy decompression: clearing stress can create a bond, conflict, or future complication.",
      "Off duty: shopping, snooping, raising hell, and caring for a relationship move the campaign without combat rolls.",
      "Scarcity: fuel, parts, rest, and information can create aspects and between-mission choices.",
      "Rivalry and counterattack: the Dominion reacts to pilots’ actions; its response keeps the arc connected.",
    ],
    enUse: "Ask for two activities with different intentions. If downtime only restores resources, the campaign loses why flying still matters.",
  }),
  bookMapChapter({
    id: "tachyon-gming",
    ptTitle: "Tachyon Squadron: Narrador e campanhas",
    enTitle: "Tachyon Squadron: Game Mastering campaigns",
    pages: "Páginas 107–120",
    ptIntro: "O Narrador monta campanhas a partir de temas, questões e objetivos operacionais. Cada engajamento deve ter oposição legível e uma consequência que alcance o esquadrão fora do cockpit.",
    ptSections: [
      "Questão atual: escolha o problema que a campanha está respondendo e a estratégia do Dominion neste momento.",
      "Objetivo operacional: defina o que o inimigo quer mover, destruir, proteger ou descobrir; o fim da campanha pode ser narrativo.",
      "Componentes do engajamento: caças, swarm, strike element, naves capitais, payload e objetivo dão forma à cena.",
      "Patrulha, varredura, interceptação, ataque e escolta: combine voos conforme a missão, sem repetir a mesma composição por hábito.",
      "Fora do cockpit: encontros com pessoas, estações e relações ligam o resultado tático ao custo humano.",
      "We Band of Siblings: use relações de esquadrão para produzir ajuda, rivalidade e decisões sobre quem recebe proteção.",
    ],
    ptUse: "Dê ao Dominion uma estratégia que possa ser entendida. A oposição fica justa quando o esquadrão sabe o que está tentando impedir.",
    enIntro: "The Game Master builds campaigns from themes, issues, and operational objectives. Each engagement needs legible opposition and a consequence reaching the squadron beyond the cockpit.",
    enSections: [
      "Current issue: choose the problem the campaign is answering and the Dominion’s strategy now.",
      "Operational objective: define what the enemy wants to move, destroy, protect, or learn; a campaign can end narratively.",
      "Engagement components: fighters, swarm, strike element, capital ships, payload, and objective shape the scene.",
      "Patrol, sweep, interception, strike, and escort: combine flights for the mission instead of repeating one composition by habit.",
      "Out of cockpit: encounters with people, stations, and relationships connect tactical outcome to human cost.",
      "We Band of Siblings: use squadron relationships for help, rivalry, and choices about who receives protection.",
    ],
    enUse: "Give the Dominion an understandable strategy. Opposition feels fair when the squadron knows what it is trying to prevent.",
  }),
  bookMapChapter({
    id: "tachyon-ships-people",
    ptTitle: "Tachyon Squadron: naves e pessoas",
    enTitle: "Tachyon Squadron: ships and people",
    pages: "Páginas 121–146",
    ptIntro: "As naves de Tachyon têm função, escala e uma história de manutenção. O catálogo inclui o caça Blackfish, o tender Atlas, forças de Draconis, civis, hostis e ferramentas para criar novas naves.",
    ptSections: [
      "Blackfish SF-46D: caça multifunção dos personagens; descreva aspecto, telas, equipamento modular e o que a manutenção revela.",
      "Atlas C-14: tender e base móvel; use-o para reparo, logística, relações e cenas que não cabem em um dogfight.",
      "Forças de Draconis: naves militares, civis e hostis mostram que um sistema independente não tem um único interesse.",
      "Gators DF-107 e Goblins DF-112: perfis de oposição que ajudam a variar velocidade, armamento e papel tático.",
      "Criar naves: comece por função, aspecto, defesa, telas, armamento e uma falha; o resto entra quando aparecer na ficção.",
      "Pessoas: oficiais, mecânicos, civis e inimigos devem ter desejo, relação e uma decisão possível, não apenas nível de perícia.",
    ],
    ptUse: "Escolha uma falha para cada nave. Sem manutenção ou limite, o equipamento vira decoração e não participa das escolhas.",
    enIntro: "Tachyon ships have a function, scale, and maintenance history. The catalog includes the Blackfish fighter, Atlas tender, Draconis military/civilian/hostile forces, and tools for designing new ships.",
    enSections: [
      "Blackfish SF-46D: the PCs’ multirole fighter; describe aspect, shields, modular gear, and what maintenance reveals.",
      "Atlas C-14: tender and mobile base; use it for repair, logistics, relationships, and scenes that do not fit a dogfight.",
      "Draconis forces: military, civilian, and hostile ships show an independent system does not have one interest.",
      "Gators DF-107 and Goblins DF-112: opposition profiles that vary speed, armament, and tactical role.",
      "Designing ships: begin with function, aspect, defense, shields, weapons, and one failure; add the rest when fiction calls for it.",
      "People: officers, mechanics, civilians, and enemies need desire, relationship, and a possible decision, not only a skill rating.",
    ],
    enUse: "Give each ship a failure. Without maintenance or a limit, equipment becomes decoration and stops shaping choices.",
  }),
  bookMapChapter({
    id: "tachyon-example-characters",
    ptTitle: "Tachyon Squadron: pilotos de exemplo",
    enTitle: "Tachyon Squadron: example pilots",
    pages: "Páginas 147–158",
    ptIntro: "Nok, Nails, Auger, Gunner, Squid e Thermic exemplificam callsigns, aspectos, perícias, façanhas, estresse e decompression. Eles são referências de escala, não personagens que precisam substituir os da Mesa.",
    ptSections: [
      "Nok e Nails: compare origens e relações para ver como dois pilotos podem ocupar a mesma missão de maneira diferente.",
      "Auger e Gunner: especialização técnica e ataque mostram como façanhas e equipamento dividem o foco.",
      "Squid e Thermic: use contraste de decompression e aspectos para criar tensão fora do cockpit.",
      "Folha como ferramenta: marque dano pessoal, telas, condição do caça, relação e próxima atividade durante a sessão.",
      "Adaptação: troque nomes, origem e chamadas, mantendo o procedimento de criação e os limites da Mesa.",
    ],
    ptUse: "Mostre uma ficha de exemplo e peça que a pessoa a descreva em uma frase. Se isso não funcionar, a ficha tem detalhe demais ou foco de menos.",
    enIntro: "Nok, Nails, Auger, Gunner, Squid, and Thermic demonstrate callsigns, aspects, skills, stunts, stress, and decompression. They are scale references, not replacements for table-created characters.",
    enSections: [
      "Nok and Nails: compare origins and relationships to see how two pilots can occupy the same mission differently.",
      "Auger and Gunner: technical specialization and attack show how stunts and gear divide focus.",
      "Squid and Thermic: contrast decompression and aspects to create tension outside the cockpit.",
      "Sheet as tool: mark personal damage, shields, fighter condition, relationship, and next activity during play.",
      "Adaptation: change names, origin, and callsign while keeping the creation procedure and table limits.",
    ],
    enUse: "Show one example sheet and ask the player to describe it in a sentence. If that fails, the sheet has too much detail or too little focus.",
  }),
  bookMapChapter({
    id: "tachyon-kepler-valley",
    ptTitle: "Tachyon Squadron: Pirates of the Kepler Valley",
    enTitle: "Tachyon Squadron: Pirates of the Kepler Valley",
    pages: "Páginas 159–164",
    ptIntro: "A primeira missão-modelo apresenta a defesa da Neptune Conveyor, decompression e reparo, bloqueio e resgate. Ela ensina a alternar engajamento, estação e consequência sem perder a continuidade.",
    ptSections: [
      "Defense of Neptune Conveyor: proteja uma rota de carga e descubra o objetivo dos piratas antes que o comboio fique sem opções.",
      "Decompression/Repair: use a pausa para limpar estresse, reparar telas e fazer a relação do esquadrão responder ao perigo.",
      "Blockade: transforme a passagem em escolha de vetor, combustível, cobertura e quem fica exposto.",
      "Rescue Mission: uma base em Asami, armas antiespaciais e níveis superior/inferior mudam a escala para ação fora do caça.",
      "Continuidade: registre carga salva, piratas identificados, dano no Atlas e quem ganhou uma dívida.",
    ],
    ptUse: "Use a missão em quatro blocos e pare para perguntar o que o esquadrão quer fazer com a informação obtida em cada bloco.",
    enIntro: "The first sample mission presents defense of the Neptune Conveyor, decompression and repair, blockade, and rescue. It teaches the shift among engagement, station, and consequence without losing continuity.",
    enSections: [
      "Defense of Neptune Conveyor: protect a cargo route and discover the pirates’ objective before the convoy runs out of options.",
      "Decompression/Repair: use the pause to clear stress, repair shields, and let squadron relationships answer the danger.",
      "Blockade: turn passage into a choice of vector, fuel, cover, and who remains exposed.",
      "Rescue Mission: an Asami base, anti-spacecraft guns, and upper/lower levels shift the scale to action outside fighters.",
      "Continuity: record saved cargo, identified pirates, Atlas damage, and who gained a debt.",
    ],
    enUse: "Run the mission in four blocks and ask what the squadron wants to do with information gained in each block.",
  }),
  bookMapChapter({
    id: "tachyon-arcosolari",
    ptTitle: "Tachyon Squadron: Defense of Arcosolari Kalamos",
    enTitle: "Tachyon Squadron: Defense of Arcosolari Kalamos",
    pages: "Páginas 165–172",
    ptIntro: "A segunda missão coloca uma estação remota, lealdade ao Dominion e uma emboscada no mesmo arco. O episódio usa Hartley, decompression e batalha para conectar suspeita pessoal e objetivo operacional.",
    ptSections: [
      "Preparação: apresente Arco, o posto remoto, sua necessidade de apoio e a pergunta sobre quem tem acesso aos sistemas.",
      "Ambush: a emboscada testa detecção, manobra, telas e a decisão de proteger a estação ou perseguir o inimigo.",
      "Hartley: uma pessoa suspeita pode ser espião, bode expiatório ou aliada; deixe a prova surgir de ações, não de um rótulo.",
      "Decompression/Repair: o intervalo revela relações e danos que a vitória tática não resolveu.",
      "Battle: combine estação, voos, payload e objetivo final; encerre com uma consequência para o próximo arco.",
    ],
    ptUse: "Apresente a suspeita antes da emboscada, mas não dê a resposta. A Mesa deve poder mudar o papel de Hartley por investigação e escolha.",
    enIntro: "The second mission places a remote station, Dominion loyalty, and an ambush in one arc. It uses Hartley, decompression, and battle to connect personal suspicion with an operational objective.",
    enSections: [
      "Setup: introduce Arco, the remote post, its need for support, and the question of who can access the systems.",
      "Ambush: the ambush tests detection, maneuver, shields, and whether to protect the station or pursue the enemy.",
      "Hartley: a suspect may be spy, scapegoat, or ally; let proof come from actions, not a label.",
      "Decompression/Repair: downtime reveals relationships and damage a tactical victory did not solve.",
      "Battle: combine station, flights, payload, and final objective; close with a consequence for the next arc.",
    ],
    enUse: "Present suspicion before the ambush, but not the answer. Investigation and choice should be able to change Hartley’s role.",
  }),
  bookMapChapter({
    id: "tachyon-inspiration-reference",
    ptTitle: "Tachyon Squadron: inspiração e referência rápida",
    enTitle: "Tachyon Squadron: inspiration and quick reference",
    pages: "Páginas 173–179",
    ptIntro: "O encerramento reúne influências e ferramentas rápidas para manter a campanha coerente. Referências inspiram tom; não substituem o material principal nem autorizam copiar outra obra.",
    ptSections: [
      "Livros, filmes, séries e jogos: escolha referências que comuniquem escala, política e ritmo ao grupo antes da primeira missão.",
      "Folha e manobra: mantenha quick rules reference, chart de manobra e character sheets acessíveis em qualquer tela.",
      "Glossário: ace, bandit, bogey, bug out, firing solution, six, tail, victory e wingman têm um único nome canônico em cada idioma.",
      "Créditos: o suplemento é de Clark Valentine, com desenvolvimento de sistema e texto adicional de Mike Olson; a edição fornecida é protegida.",
      "Adaptação: quando uma regra de Tachyon divergir do Fate Condensado, marque a escolha e mantenha o Condensado como principal.",
    ],
    ptUse: "Feche a sessão com uma referência visual curta e uma pergunta humana. A regra rápida deve devolver a Mesa à ficção, não criar uma segunda camada de consulta.",
    enIntro: "The ending gathers influences and quick tools for a coherent campaign. References set tone; they do not replace the principal material or authorize copying another work.",
    enSections: [
      "Books, films, television, and games: choose references that communicate scale, politics, and pace before the first mission.",
      "Sheet and maneuver: keep the quick rules reference, maneuver chart, and character sheets accessible on every screen.",
      "Glossary: ace, bandit, bogey, bug out, firing solution, six, tail, victory, and wingman have one canonical name in each language.",
      "Credits: the supplement is by Clark Valentine, with system development and additional writing by Mike Olson; the supplied edition is protected.",
      "Adaptation: when a Tachyon rule differs from Fate Condensed, mark the choice and keep Condensed principal.",
    ],
    enUse: "End a session with a short visual reference and a human question. Quick rules should return the table to fiction, not create a second lookup layer.",
  }),
];

function sourceWordCount(chapters, language) {
  return chapters.reduce((total, chapter) => total + plainText(chapter.html[language]).split(/\s+/).filter(Boolean).length, 0);
}

const data = {
  version: "2026-09-01",
  precedence: localized(
    "Fate Condensado é a regra principal. O guia contextualiza; as expansões explicam, ampliam ou oferecem opções. Se houver diferença, Fate Condensado prevalece e nada é ativado sem escolha da Mesa.",
    "Fate Condensed is the principal ruleset. The guide adds context; expansions explain, extend, or offer options. If anything differs, Fate Condensed prevails and nothing is enabled without the table choosing it.",
  ),
  sources: [
    {
      id: "fate-guide",
      title: localized("Guia oficial das versões de Fate", "Official Guide to Fate Versions"),
      shortTitle: localized("Guia", "Guide"),
      year: 2021,
      kind: "guide",
      tags: [localized("Oficial", "Official"), localized("Guia", "Guide")],
      description: localized(
        "Um mapa para entender as versões, escolher uma base e saber onde cada livro ajuda.",
        "A map of Fate versions, their differences, licensing, and useful starting points.",
      ),
      contentNote: localized("Síntese editorial bilíngue, conferida com o guia oficial fornecido.", "Bilingual editorial digest checked against the supplied official guide."),
      officialUrl: "https://evilhat.com/fate-downloads/",
      referenceUrl: localized("https://evilhat.com/fate-downloads/", "https://evilhat.com/fate-downloads/"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      attribution: localized(
        "Guia oficial de versões de Fate © Evil Hat Productions, LLC. Síntese editorial bilíngue baseada no guia fornecido.",
        "Official guide to Fate versions © Evil Hat Productions, LLC. Bilingual editorial digest based on the supplied guide.",
      ),
      chapters: bilingualGuideChapters,
      wordCount: sourceWordCount(bilingualGuideChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(bilingualGuideChapters, "pt"), en: sourceWordCount(bilingualGuideChapters, "en") },
    },
    {
      id: "fate-core",
      title: localized("Fate Core System", "Fate Core System"),
      shortTitle: localized("Core", "Core"),
      year: 2013,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion")],
      description: localized(
        "A base explicada em profundidade, com exemplos e ferramentas para compreender as engrenagens do Fate.",
        "The deeply explained foundation, with examples and tools for understanding Fate's inner workings.",
      ),
      contentNote: localized("SRD oficial completo em português e inglês, com a errata oficial aplicada aos dois idiomas.", "Complete official SRD in Portuguese and English, with official errata applied to both languages."),
      officialUrl: "https://evilhat.com/product/fate-core-system/",
      referenceUrl: localized("https://fatesrdbrasil.gitlab.io/fate-srd-brasil/fate-basico/", "https://fate-srd.com/fate-core"),
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      errataUrl: "https://docs.google.com/document/d/1wvZasbKtQgmR-p8wvPcNw7jdy7QAftMmQxvMEz4gof4/edit?usp=sharing",
      sourceRevision: "5ef6f2d0e9ce8ebe235c3da453ce91c00353a528",
      attribution: localized(
        "Esta obra é baseada em Fate Sistema Básico, traduzido, criado e editado por Alain Valchera, Fábio Silva, Fernando del Angeles, Gabriel Faedrich, Luís Henrique Fonseca e Matheus Funfas e licenciado para uso sob Creative Commons Atribuição 4.0 Internacional. Documento de Referência do Sistema produzido por Fábio Emílio Costa, Fábio Silva e Jaime Rangel de S. Junior. Versão original: Fate Core System © Evil Hat Productions, LLC.",
        "This work is based on Fate Core System and Fate Accelerated Edition (found at https://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/).",
      ),
      chapters: coreChapters,
      wordCount: sourceWordCount(coreChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(coreChapters, "pt"), en: sourceWordCount(coreChapters, "en") },
    },
    {
      id: "fate-adversary-toolkit",
      title: localized("Fate Adversary Toolkit", "Fate Adversary Toolkit"),
      shortTitle: localized("Adversários", "Adversaries"),
      year: 2017,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion")],
      description: localized(
        "Inimigos, obstáculos, restrições e ambientes, seguidos por um mapa completo dos exemplos de gênero do livro.",
        "Enemies, obstacles, constraints, and environments, followed by a complete map of the book's genre examples.",
      ),
      contentNote: localized(
        "SRD oficial aberto completo em português e inglês; as galerias reservadas são cobertas por mapas editoriais bilíngues.",
        "Complete open official SRD in Portuguese and English; reserved gallery chapters are covered through bilingual editorial maps.",
      ),
      officialUrl: "https://evilhat.com/product/fate-adversary-toolkit/",
      referenceUrl: localized("https://fate-srd.com/fate-adversary-toolkit", "https://fate-srd.com/fate-adversary-toolkit"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      sourceRevision: "e572e01df2cf6793f430cbbd3a40998087de9a20",
      attribution: localized(
        "Fate Adversary Toolkit ©2017 Evil Hat Productions, LLC, escrito e projetado por Brian Engard e Ed Turner. O texto aberto vem do Fate SRD reconhecido pela Evil Hat; a tradução em português deste site é editorial. O texto reservado das galerias não é reproduzido.",
        "Fate Adversary Toolkit ©2017 Evil Hat Productions, LLC, written and designed by Brian Engard and Ed Turner. Open SRD text comes from the Evil Hat-endorsed Fate SRD. Product-only gallery text is not reproduced.",
      ),
      chapters: adversaryChapters,
      wordCount: sourceWordCount(adversaryChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(adversaryChapters, "pt"), en: sourceWordCount(adversaryChapters, "en") },
    },
    {
      id: "fate-system-toolkit",
      title: localized("Fate System Toolkit", "Fate System Toolkit"),
      shortTitle: localized("Sistema", "System"),
      year: 2013,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion"), localized("Opcional", "Optional")],
      description: localized(
        "Ferramentas para ajustar aspectos, perícias, façanhas, escala, magia e subsistemas quando a Mesa realmente precisa.",
        "Tools for adjusting aspects, skills, stunts, scale, magic, and subsystems when the table truly needs them.",
      ),
      contentNote: localized("SRD oficial completo em português e inglês, com a errata viva oficial aplicada aos dois idiomas.", "Complete official SRD in Portuguese and English, with the official living errata applied to both languages."),
      officialUrl: "https://evilhat.com/product/fate-system-toolkit/",
      referenceUrl: localized("https://fatesrdbrasil.gitlab.io/fate-srd-brasil/ferramentas-de-sistema/", "https://fate-srd.com/fate-system-toolkit"),
      licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
      errataUrl: "https://docs.google.com/document/d/11XKQagEKhThQ9LkT3W4AvB5B6D8vyblpnCLStLWM8i0/edit?usp=sharing",
      sourceRevision: "9db805a2e3e32ed78b714f6f4e7083c968a88ab9",
      attribution: localized(
        "Esta obra é baseada em Fate Ferramentas de Sistema, tradução brasileira do Fate SRD Brasil. Versão original: Fate System Toolkit © Evil Hat Productions, LLC, desenvolvido, escrito e editado por Robert Donoghue, Brian Engard, Brennan Taylor, Mike Olson, Mark Diaz Truman, Fred Hicks e Matthew Gandy.",
        "This work is based on the Fate System Toolkit (found at https://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by Robert Donoghue, Brian Engard, Brennan Taylor, Mike Olson, Mark Diaz Truman, Fred Hicks, and Matthew Gandy, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/).",
      ),
      chapters: systemChapters,
      wordCount: sourceWordCount(systemChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(systemChapters, "pt"), en: sourceWordCount(systemChapters, "en") },
    },
    {
      id: "venture-city",
      title: localized("Venture City", "Venture City"),
      shortTitle: localized("Venture City", "Venture City"),
      year: 2016,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion"), localized("Opcional", "Optional")],
      description: localized(
        "Superpoderes, corporações, gangues, personagens prontos e sementes de aventura para uma cidade de futuro próximo.",
        "Superpowers, corporations, gangs, pregenerated characters, and adventure seeds for a near-future city.",
      ),
      contentNote: localized(
        "Mapa editorial bilíngue de todas as seções, personagens, poderes, temas e sementes da edição fornecida; o texto protegido permanece na referência oficial.",
        "Bilingual editorial map of every section, character, power, theme, and seed in the supplied edition; protected text remains in the official reference.",
      ),
      officialUrl: "https://evilhat.com/product/venture-city/",
      referenceUrl: localized("https://evilhat.com/product/venture-city/", "https://fate-srd.com/venture-city"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      sourceRevision: "pdf-sha256:4694331b37426bdcfc336be2c75c3bae890ea10aa7f40f2817c92883d6a93f2d",
      attribution: localized(
        "Venture City ©2016 Evil Hat Productions, LLC, Ed Turner e Brian Engard. A edição fornecida é uma obra com todos os direitos reservados; esta página oferece um mapa editorial bilíngue e links oficiais, sem reproduzir o texto protegido. A página atual da Evil Hat descreve a compilação Venture City Stories + Venture City Powers.",
        "Venture City ©2016 Evil Hat Productions, LLC, Ed Turner, and Brian Engard. The supplied edition is all rights reserved; this page provides a bilingual editorial map and official links without reproducing protected text. Evil Hat’s current page describes the Venture City Stories + Venture City Powers compilation.",
      ),
      chapters: ventureCityChapters,
      wordCount: sourceWordCount(ventureCityChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(ventureCityChapters, "pt"), en: sourceWordCount(ventureCityChapters, "en") },
    },
    {
      id: "fate-horror-toolkit",
      title: localized("Fate Horror Toolkit", "Fate Horror Toolkit"),
      shortTitle: localized("Horror", "Horror"),
      year: 2018,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion"), localized("Opcional", "Optional")],
      description: localized(
        "Ferramentas de consentimento, suspense, adversários, perdição, sobrevivência, horror íntimo e jogo cooperativo para públicos mais jovens.",
        "Consent, suspense, adversary, doom, survival, intimate-horror, and younger-audience teamwork tools.",
      ),
      contentNote: localized(
        "Mapa editorial bilíngue de todas as seções e ferramentas da edição fornecida; o PDF e o texto protegido continuam na referência oficial e no SRD indicado.",
        "Bilingual editorial map of every section and tool in the supplied edition; the PDF and protected text remain in the official reference and linked SRD.",
      ),
      officialUrl: "https://evilhat.com/product/fate-horror-toolkit/",
      referenceUrl: localized("https://fate-srd.com/fate-horror-toolkit", "https://fate-srd.com/fate-horror-toolkit"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      sourceRevision: "pdf-sha256:b8b65d4bcb36da78a616d829690a02d33607843b4ccf5129f3da2359726bcd5c",
      attribution: localized(
        "Fate Horror Toolkit ©2018 Evil Hat Productions, LLC, escrito e desenvolvido por Richard Bellingham com colaboradores. A edição fornecida declara todos os direitos reservados; esta página oferece um mapa editorial bilíngue e links oficiais, sem reproduzir o texto protegido.",
        "Fate Horror Toolkit ©2018 Evil Hat Productions, LLC, written and developed by Richard Bellingham with contributors. The supplied edition states that all rights are reserved; this page provides a bilingual editorial map and official links without reproducing protected text.",
      ),
      chapters: horrorToolkitChapters,
      wordCount: sourceWordCount(horrorToolkitChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(horrorToolkitChapters, "pt"), en: sourceWordCount(horrorToolkitChapters, "en") },
    },
    {
      id: "fate-of-cthulhu",
      title: localized("Fate of Cthulhu", "Fate of Cthulhu"),
      shortTitle: localized("Cthulhu", "Cthulhu"),
      year: 2019,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion"), localized("Opcional", "Optional")],
      description: localized(
        "Horror de ação, viagem temporal, corrupção, magia perigosa e cinco linhas temporais apocalípticas para uma campanha de resistência.",
        "Action horror, time travel, corruption, dangerous magic, and five apocalyptic timelines for a resistance campaign.",
      ),
      contentNote: localized(
        "Mapa editorial bilíngue de todas as regras, linhas temporais, agendas, adversários e folhas da edição fornecida; o livro protegido permanece na referência oficial.",
        "Bilingual editorial map of every rule, timeline, agenda, adversary, and sheet in the supplied edition; the protected book remains in the official reference.",
      ),
      officialUrl: "https://evilhat.com/product/fate-of-cthulhu/",
      referenceUrl: localized("https://evilhat.com/product/fate-of-cthulhu/", "https://evilhat.com/product/fate-of-cthulhu/"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      sourceRevision: "pdf-sha256:f315c771643aac49472349df317a2f6565c551e3ba5e554b0d226fb61f0cca52",
      attribution: localized(
        "Fate of Cthulhu ©2019 Evil Hat Productions, LLC, com desenvolvimento de cenário por Stephen Blackmoore e desenvolvimento de sistema por PK Sullivan, Edward Turner e Leonard Balsera. A edição fornecida declara todos os direitos reservados; esta página oferece um mapa editorial bilíngue e links oficiais, sem reproduzir o texto protegido.",
        "Fate of Cthulhu ©2019 Evil Hat Productions, LLC, with setting development by Stephen Blackmoore and system development by PK Sullivan, Edward Turner, and Leonard Balsera. The supplied edition states that all rights are reserved; this page provides a bilingual editorial map and official links without reproducing protected text.",
      ),
      chapters: fateOfCthulhuChapters,
      wordCount: sourceWordCount(fateOfCthulhuChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(fateOfCthulhuChapters, "pt"), en: sourceWordCount(fateOfCthulhuChapters, "en") },
    },
    {
      id: "fate-space-toolkit",
      title: localized("Fate Space Toolkit", "Fate Space Toolkit"),
      shortTitle: localized("Espaço", "Space"),
      year: 2019,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion"), localized("Opcional", "Optional")],
      description: localized(
        "Ferramentas de ficção científica para criar cenários espaciais, viagens, naves, combates, alienígenas e cinco campanhas iniciais.",
        "Science-fiction tools for creating space settings, travel, spacecraft, combat, aliens, and five campaign starters.",
      ),
      contentNote: localized(
        "Mapa editorial bilíngue de todas as ferramentas, procedimentos, cenários-modelo e referências da edição fornecida; o texto protegido permanece na referência oficial.",
        "Bilingual editorial map of every tool, procedure, sample setting, and reference in the supplied edition; protected text remains in the official reference.",
      ),
      officialUrl: "https://evilhat.com/product/fate-space-toolkit/",
      referenceUrl: localized("https://evilhat.com/product/fate-space-toolkit/", "https://evilhat.com/product/fate-space-toolkit/"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      sourceRevision: "pdf-sha256:e3c938304f50cb97b194e42c745965dc5b24e8a8de8f1e17db7a8902ed9f5a77",
      attribution: localized(
        "Fate Space Toolkit ©2019 Evil Hat Productions, LLC, escrito por Bill White, C. W. Marshall, Joshua A. C. Newman e Mikki Kendall. A edição fornecida declara todos os direitos reservados; esta página oferece um mapa editorial bilíngue e links oficiais, sem reproduzir o texto protegido.",
        "Fate Space Toolkit ©2019 Evil Hat Productions, LLC, written by Bill White, C. W. Marshall, Joshua A. C. Newman, and Mikki Kendall. The supplied edition states that all rights are reserved; this page provides a bilingual editorial map and official links without reproducing protected text.",
      ),
      chapters: fateSpaceToolkitChapters,
      wordCount: sourceWordCount(fateSpaceToolkitChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(fateSpaceToolkitChapters, "pt"), en: sourceWordCount(fateSpaceToolkitChapters, "en") },
    },
    {
      id: "uprising",
      title: localized("Uprising: The Dystopian Universe RPG", "Uprising: The Dystopian Universe RPG"),
      shortTitle: localized("Uprising", "Uprising"),
      year: 2018,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion"), localized("Opcional", "Optional")],
      description: localized(
        "Jogo autônomo de resistência distópica, com nove playsheets, segredos, meios, fins, missões, avanços e endgames em Paris Nouveau.",
        "Standalone dystopian resistance game with nine playsheets, secrets, means, ends, missions, advances, and endgames in Paris Nouveau.",
      ),
      contentNote: localized(
        "Mapa editorial bilíngue de todas as regras, classes, playsheets, missões, corporações e endgames da edição fornecida; o texto protegido permanece na referência oficial.",
        "Bilingual editorial map of every rule, class, playsheet, mission, corporation, and endgame in the supplied edition; protected text remains in the official reference.",
      ),
      officialUrl: "https://evilhat.com/product/uprising/",
      referenceUrl: localized("https://evilhat.com/product/uprising/", "https://evilhat.com/product/uprising/"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      sourceRevision: "pdf-sha256:2db0872cf71996939ccd6bdb23be60158ccc3659195a427d3f173ab8dfec67d1",
      attribution: localized(
        "Uprising: The Dystopian Universe RPG ©2018 Evil Hat Productions, LLC, por Brian Engard e Anna Meade, com desenvolvimento de sistema por Ed Turner e colaboradores. A edição fornecida declara todos os direitos reservados; esta página oferece um mapa editorial bilíngue e links oficiais, sem reproduzir o texto protegido.",
        "Uprising: The Dystopian Universe RPG ©2018 Evil Hat Productions, LLC, by Brian Engard and Anna Meade, with system development by Ed Turner and contributors. The supplied edition states that all rights are reserved; this page provides a bilingual editorial map and official links without reproducing protected text.",
      ),
      chapters: uprisingChapters,
      wordCount: sourceWordCount(uprisingChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(uprisingChapters, "pt"), en: sourceWordCount(uprisingChapters, "en") },
    },
    {
      id: "tachyon-squadron",
      title: localized("Tachyon Squadron", "Tachyon Squadron"),
      shortTitle: localized("Tachyon", "Tachyon"),
      year: 2018,
      kind: "expansion",
      tags: [localized("Oficial", "Official"), localized("Expansão", "Expansion"), localized("Opcional", "Optional")],
      description: localized(
        "Suplemento de ficção científica militar com pilotos de caça, engajamentos em fases, telas, dano, naves, campanhas e missões em Draconis.",
        "Military science-fiction supplement with fighter pilots, phased engagements, shields, damage, ships, campaigns, and missions in Draconis.",
      ),
      contentNote: localized(
        "Mapa editorial bilíngue de todas as regras de piloto, engajamento, cenário, Narrador, naves e missões da edição fornecida; o texto protegido permanece na referência oficial.",
        "Bilingual editorial map of every pilot, engagement, setting, Game Master, ship, and mission rule in the supplied edition; protected text remains in the official reference.",
      ),
      officialUrl: "https://evilhat.com/product/tachyon-squadron/",
      referenceUrl: localized("https://evilhat.com/product/tachyon-squadron/", "https://evilhat.com/product/tachyon-squadron/"),
      licenseUrl: "https://faterpg.com/official-licensing-fate",
      sourceRevision: "pdf-sha256:5e61a7b90728380f7e85ccf226dc4dc9936d8182f6b88d628e0b2ffd02feda7a",
      attribution: localized(
        "Tachyon Squadron ©2018 Evil Hat Productions, LLC, escrito por Clark Valentine, com desenvolvimento de sistema e texto adicional de Mike Olson. A edição fornecida declara todos os direitos reservados; esta página oferece um mapa editorial bilíngue e links oficiais, sem reproduzir o texto protegido.",
        "Tachyon Squadron ©2018 Evil Hat Productions, LLC, written by Clark Valentine, with system development and additional writing by Mike Olson. The supplied edition states that all rights are reserved; this page provides a bilingual editorial map and official links without reproducing protected text.",
      ),
      chapters: tachyonSquadronChapters,
      wordCount: sourceWordCount(tachyonSquadronChapters, "en"),
      wordCountByLanguage: { pt: sourceWordCount(tachyonSquadronChapters, "pt"), en: sourceWordCount(tachyonSquadronChapters, "en") },
    },
  ],
};

await writeFile(outputPath, JSON.stringify(data));
console.log(
  "Generated " +
  data.sources.length +
  " sources, " +
  data.sources.reduce((total, source) => total + source.chapters.length, 0) +
  " chapters, and " +
  data.sources.reduce((total, source) => total + source.wordCount, 0).toLocaleString("en-US") +
  " words.",
);
