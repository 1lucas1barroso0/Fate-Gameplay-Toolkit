import { stripHtml } from '@/lib/fate';
export function readerSections(html: string) {
  const sections: { id: string; title: string; level: number }[] = [];
  const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]));
  let index = 0;
  const content = html.replace(/<(h[2-6]|p|table|ul|ol|blockquote|aside)\b([^>]*)>/gi, (opening, tag: string, attrs: string) => {
    let id = attrs.match(/\bid="([^"]+)"/)?.[1];
    if (!id) { do { id = `reader-block-${++index}`; } while (ids.has(id)); ids.add(id); }
    return `<${tag}${attrs}${/\bid=/.test(attrs) ? '' : ` id="${id}"`}>`;
  });
  for (const match of content.matchAll(/<h([2-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)) {
    const id = match[2].match(/\bid="([^"]+)"/)?.[1];
    const title = stripHtml(match[3]).trim();
    if (id && title) sections.push({ id, title, level: Number(match[1]) });
  }
  return { html: content, sections };
}
