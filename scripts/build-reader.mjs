// Build immutable, language-specific book files. Never reduce or translate the source text.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = async (name) => JSON.parse(await readFile(path.join(root, 'content', name), 'utf8'));
const [chapters, expansions, condensed] = await Promise.all([read('rules.json'), read('expansions.json'), read('condensed-metadata.json')]);
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const directory = path.join(root, 'public', 'rule-books');
await mkdir(directory, { recursive: true });
async function asset(name, data) {
  const body = JSON.stringify(data);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 20);
  const filename = `${name}.${hash}.json`;
  await writeFile(path.join(directory, filename), body);
  return `/rule-books/${filename}`;
}
const sources = [
  { ...condensed, chapters: chapters.map((chapter, index) => ({ ...chapter, mode: 'principal', label: { pt: `Capítulo ${String(index + 1).padStart(2, '0')}`, en: `Chapter ${String(index + 1).padStart(2, '0')}` } })) },
  ...expansions.sources.map(source => ({ ...source, attribution: { pt: [source.attribution.pt], en: [source.attribution.en] } })),
];
const catalog = { version: 1, precedence: expansions.precedence, sources: [], search: {} };
const indexes = { pt: [], en: [] };
for (const source of sources) {
  const { chapters, ...metadata } = source;
  const item = { ...metadata, chapters: [], files: {}, wordCountByLanguage: { pt: 0, en: 0 } };
  for (const chapter of chapters) {
    if (!chapter.html?.pt?.trim() || !chapter.html?.en?.trim()) throw new Error(`Missing bilingual text: ${source.id}/${chapter.id}`);
    const { html, ...details } = chapter;
    const wordCount = { pt: plain(html.pt).split(/\s+/).length, en: plain(html.en).split(/\s+/).length };
    item.chapters.push({ ...details, wordCount });
    for (const language of ['pt', 'en']) {
      item.wordCountByLanguage[language] += wordCount[language];
      indexes[language].push({ sourceId: source.id, chapterId: chapter.id, title: chapter.title[language], sourceTitle: source.title[language], text: plain(html[language]) });
    }
  }
  for (const language of ['pt', 'en']) item.files[language] = await asset(`${source.id}-${language}`, { sourceId: source.id, language, chapters: Object.fromEntries(chapters.map(chapter => [chapter.id, chapter.html[language]])) });
  catalog.sources.push(item);
}
for (const language of ['pt', 'en']) catalog.search[language] = await asset(`search-${language}`, indexes[language]);
await writeFile(path.join(root, 'content', 'reader-catalog.json'), JSON.stringify(catalog));
console.log(`Reader: ${sources.length} books, ${indexes.pt.length} chapters, both languages preserved.`);
