import type { Language } from "@/lib/fate";

function addClass(openingTag: string, className: string) {
  const classAttribute = openingTag.match(/\bclass=(["'])(.*?)\1/i);
  if (classAttribute) {
    return openingTag.replace(
      classAttribute[0],
      `class=${classAttribute[1]}${classAttribute[2]} ${className}${classAttribute[1]}`,
    );
  }
  return openingTag.replace(/>$/, ` class="${className}">`);
}

function plainInlineText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function skillSlots(count: number, language: Language) {
  const noun = language === "pt" ? (count === 1 ? "espaço de perícia" : "espaços de perícia") : (count === 1 ? "skill slot" : "skill slots");
  const dots = Array.from({ length: count }, () => '<i aria-hidden="true"></i>').join("");
  return `<span class="rule-skill-slots" role="img" aria-label="${count} ${noun}">${dots}</span>`;
}

function decoratePyramidTable(table: string, language: Language) {
  if (!/(?:pirâmide|pyramid|inválido|not valid|também válido|also valid)/i.test(plainInlineText(table))) {
    return table;
  }

  return table
    .replace(/<code>\s*(0{1,8})\s*<\/code>/gi, (_, markers: string) => skillSlots(markers.length, language))
    .replace(
      /<span>\s*<span>\s*((?:\[0\]\s*){1,8})<\/span>\s*<\/span>/gi,
      (_, markers: string) => skillSlots((markers.match(/\[0\]/g) ?? []).length, language),
    )
    .replace(
      /<span>\s*((?:\[0\]\s*){1,8})<\/span>/gi,
      (_, markers: string) => skillSlots((markers.match(/\[0\]/g) ?? []).length, language),
    );
}

function decorateCompactIndexes(html: string) {
  return html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (list) => {
    const items = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    const isCompactIndex = items.length >= 8 && items.every((item) => {
      const body = item[1];
      return !/<(?:article|aside|blockquote|div|h[1-6]|ol|p|table|ul)\b/i.test(body)
        && plainInlineText(body).length <= 48;
    });
    if (!isCompactIndex) return list;
    return list.replace(/^<ul\b[^>]*>/i, (opening) => addClass(opening, "rule-index-list"));
  });
}

function decorateDefinitionRuns(html: string) {
  const definitions = html.replace(
    /(<p\b[^>]*>)\s*(<strong\b[^>]*>[^<]{1,72}:<\/strong>)/gi,
    (_, opening: string, label: string) => `${addClass(opening, "rule-definition")}${label}`,
  );

  return definitions.replace(
    /(?:\s*<p\b[^>]*class=["'][^"']*\brule-definition\b[^"']*["'][^>]*>(?:(?!<\/p>)[\s\S])*<\/p>){3,}/gi,
    (run) => `<div class="rule-definition-grid">${run.trim()}</div>`,
  );
}

function simplifyVisibleUrls(html: string) {
  return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (anchor, attributes: string, body: string) => {
    const visible = plainInlineText(body);
    if (!/^https?:\/\//i.test(visible)) return anchor;
    const label = visible.replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/$/, "");
    return `<a${attributes}><span class="rule-url">${label}</span></a>`;
  });
}

/**
 * Normaliza resíduos de EPUB/SRD na apresentação sem alterar o texto-fonte.
 * A mesma passagem atende o Condensado e todo material adicionado à biblioteca.
 */
export function prepareRuleHtml(html: string, language: Language) {
  let prepared = html
    .replace(
      /<div\b[^>]*>\s*<h1\b[^>]*>\s*404:\s*Page not found\s*<\/h1>[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(/<p\b[^>]*>\s*(?:<br\s*\/?>\s*)+<\/p>/gi, "")
    .replace(/<div\b[^>]*>\s*(?:<br\s*\/?>\s*)*<\/div>/gi, "")
    .replace(/<hr\b[^>]*\/?\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(strong|em|b|i)><\1>/gi, "")
    .replace(/<\/(strong|em|b|i)><\1>/gi, "")
    .replace(/<div>\s*(<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>)\s*<\/div>/gi, "$1")
    .replace(/<p\b[^>]*>\s*<\/p>/gi, "")
    .replace(/<span>\s*([+\-−0])\s*<\/span>/gi, '<code class="fate-symbol">$1</code>');

  prepared = prepared.replace(
    /^(\s*(?:<aside\b[^>]*>[\s\S]*?<\/aside>\s*)?)<div>([^<>]{2,140})<\/div>/i,
    '$1<p class="rule-chapter-deck">$2</p>',
  );

  prepared = prepared.replace(
    /(<table\b[^>]*id=["']table003["'][^>]*>[\s\S]*?<\/table>\s*<table\b[^>]*id=["']table004["'][^>]*>[\s\S]*?<\/table>\s*<table\b[^>]*id=["']table005["'][^>]*>[\s\S]*?<\/table>\s*<table\b[^>]*id=["']table006["'][^>]*>[\s\S]*?<\/table>)/i,
    '<div class="rule-table-cluster">$1</div>',
  );

  prepared = prepared.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => (
    `<div class="rule-table-scroll">${decoratePyramidTable(table, language)}</div>`
  ));

  prepared = decorateCompactIndexes(prepared);
  prepared = decorateDefinitionRuns(prepared);
  prepared = simplifyVisibleUrls(prepared);

  return prepared
    .replace(
      /(<(code|kbd)\b[^>]*>[\s\S]*?<\/\2>)\s*([,.;:!?])/gi,
      '<span class="rule-nowrap">$1$3</span>',
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
