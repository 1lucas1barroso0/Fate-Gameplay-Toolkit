import catalogData from '@/content/reader-catalog.json';
import terminology from '@/content/fate-terminology.json';
import { stripHtml, type Language } from '@/lib/fate';
import { recordDiagnostic } from '@/lib/local-diagnostics';

export type Localized = Record<Language, string>;
export type ReaderChapter = { id: string; title: Localized; label: Localized; mode: 'principal' | 'full-srd' | 'book-map' | 'official-guide-summary' | 'editorial-summary'; slugs?: Localized; wordCount: Record<Language, number>; files: Localized };
export type ReaderSource = { id: string; title: Localized; shortTitle: Localized; year: number; kind: 'principal' | 'guide' | 'expansion'; tags: Localized[]; description: Localized; contentNote: Localized; officialUrl: string; referenceUrl: Localized; licenseUrl: string; licenseUrlByLanguage?: Localized; errataUrl?: string; attribution: Record<Language, string[]>; chapters: ReaderChapter[]; files: Localized; search: Localized; wordCountByLanguage: Record<Language, number> };
export const readerCatalog = catalogData as { version: number; precedence: Localized; sources: ReaderSource[]; search: Localized };
export type ReaderLocation = { sourceId: string; chapterId: string; language: Language; anchor?: string };
export type BookText = { sourceId: string; language: Language; chapters: Record<string, string> };
export type SearchDocument = { sourceId: string; chapterId: string; title: string; sourceTitle: string; text: string };
export type SearchHit = SearchDocument & { snippet: string; score: number };
export const DEFAULT_READING: ReaderLocation = { sourceId: 'fate-condensed', chapterId: readerCatalog.sources[0].chapters[0].id, language: 'pt' };

export function validReading(input: unknown): input is ReaderLocation {
  if (!input || typeof input !== 'object') return false;
  const item = input as ReaderLocation;
  return (item.language === 'pt' || item.language === 'en') && readerCatalog.sources.some(source => source.id === item.sourceId && source.chapters.some(chapter => chapter.id === item.chapterId)) && (item.anchor === undefined || (typeof item.anchor === 'string' && item.anchor.length <= 240 && !/[\s#]/.test(item.anchor)));
}
export function readingHash(location: ReaderLocation) {
  return '#rules/' + [location.sourceId, location.chapterId, location.language, ...(location.anchor ? [location.anchor] : [])].map(encodeURIComponent).join('/');
}
export function readingFromHash(hash: string): ReaderLocation | null {
  if (!hash.startsWith('#rules/')) return null;
  try {
    const parts = hash.slice(7).split('/').map(decodeURIComponent);
    if (parts.length < 3 || parts.length > 4) return null;
    const item = { sourceId: parts[0], chapterId: parts[1], language: parts[2], ...(parts[3] ? { anchor: parts[3] } : {}) };
    return validReading(item) ? item : null;
  } catch { return null; }
}
export const readingKey = (location: ReaderLocation) => [location.sourceId, location.chapterId, location.language].join(':');

// Bound session memory; immutable URLs also benefit from the browser HTTP cache.
const books = new Map<string, Promise<BookText>>();
const searches = new Map<string, Promise<SearchDocument[]>>();
export type ChapterText = { sourceId: string; chapterId: string; language: Language; html: string };
const chapterRequests = new Map<string, Promise<ChapterText>>();
export function loadChapter(source: ReaderSource, chapter: ReaderChapter, language: Language): Promise<ChapterText> {
  const url = chapter.files[language];
  const existing = chapterRequests.get(url);
  if (existing) return existing;
  const start = Date.now();
  const request = fetch(url, { signal: AbortSignal.timeout(30000) }).then(async response => {
    if (!response.ok) throw Error('chapter-load');
    const value = await response.json() as ChapterText;
    if (value.sourceId !== source.id || value.chapterId !== chapter.id || value.language !== language || typeof value.html !== 'string') throw Error('chapter-invalid');
    recordDiagnostic('reader', 'ok', Date.now() - start);
    return value;
  }).catch(error => { chapterRequests.delete(url); recordDiagnostic('reader', 'error', Date.now() - start); throw error; });
  chapterRequests.set(url, request);
  while (chapterRequests.size > 12) chapterRequests.delete(chapterRequests.keys().next().value!);
  return request;
}
export function loadBook(source: ReaderSource, language: Language): Promise<BookText> {
  const url = source.files[language];
  const cached = books.get(url);
  if (cached) return cached;
  const request = fetch(url, { signal: AbortSignal.timeout(30000) }).then(async response => {
    if (!response.ok) throw new Error('book-load');
    const value = await response.json() as BookText;
    if (value.sourceId !== source.id || value.language !== language || source.chapters.some(chapter => typeof value.chapters?.[chapter.id] !== 'string')) throw new Error('book-invalid');
    return value;
  }).catch(error => { books.delete(url); throw error; });
  books.set(url, request);
  if (books.size > 4) books.delete(books.keys().next().value!);
  return request;
}
export function loadSearch(language: Language, source?: ReaderSource): Promise<SearchDocument[]> {
  const url = source ? source.search[language] : readerCatalog.search[language];
  const cached = searches.get(url);
  if (cached) return cached;
  const request = fetch(url, { signal: AbortSignal.timeout(30000) }).then(async response => {
    if (!response.ok) throw new Error('search-load');
    const value: unknown = await response.json();
    if (!Array.isArray(value) || !value.every(doc => typeof doc.text === 'string' && typeof doc.title === 'string' && (!source || doc.sourceId === source.id) && validReading({ ...doc, language }))) throw new Error('search-invalid');
    for (let index = 0; index < value.length; index += 16) {
      value.slice(index, index + 16).forEach(normalizedDocument);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return value as SearchDocument[];
  }).catch(error => { searches.delete(url); throw error; });
  searches.set(url, request);
  while (searches.size > 4) searches.delete(searches.keys().next().value!);
  return request;
}
export function normalizeSearch(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
const aliases = terminology.terms.flatMap(term => {
  const names = [term.canonical.pt, term.canonical.en, ...term.aliases.pt, ...term.aliases.en].map(normalizeSearch);
  return names.map(name => ({ name, canonical: { pt: normalizeSearch(term.canonical.pt), en: normalizeSearch(term.canonical.en) } }));
}).sort((a, b) => b.name.length - a.name.length);
function localizedQuery(query: string, language: Language) {
  let result = normalizeSearch(query).trim();
  // Translate search terms only. Reader text and result snippets remain in the selected language.
  for (const alias of aliases) {
    const escaped = alias.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'), alias.canonical[language]);
  }
  return result;
}
const normalizedDocuments = new WeakMap<SearchDocument, { title: string; text: string; combined: string }>();
function normalizedDocument(doc: SearchDocument) {
  let value = normalizedDocuments.get(doc);
  if (!value) {
    const title = normalizeSearch(doc.title), text = normalizeSearch(doc.text);
    value = { title, text, combined: title + ' ' + normalizeSearch(doc.sourceTitle) + ' ' + text };
    normalizedDocuments.set(doc, value);
  }
  return value;
}
export function searchChapters(documents: SearchDocument[], query: string, language: Language): SearchHit[] {
  const phrase = normalizeSearch(query.trim()).slice(0, 160);
  if (phrase.length < 2) return [];
  const alternatives = [...new Set([phrase, localizedQuery(phrase, language)])];
  const tokenGroups = alternatives.map(value => value.split(/\s+/).filter(Boolean));
  const hits: SearchHit[] = [];
  for (const doc of documents) {
    const { title, text, combined } = normalizedDocument(doc);
    const tokens = tokenGroups.find(group => group.every(token => combined.includes(token)));
    if (!tokens) continue;
    const exactTitle = alternatives.some(value => title === value);
    const titlePhrase = alternatives.some(value => title.includes(value));
    const phraseIndex = alternatives.map(value => text.indexOf(value)).filter(index => index >= 0);
    const position = phraseIndex.length ? Math.min(...phraseIndex) : Math.max(0, ...tokens.map(token => text.indexOf(token)).filter(index => index >= 0).slice(0, 1));
    const start = Math.max(0, position - 70);
    const end = Math.min(doc.text.length, position + 180);
    const snippet = (start ? '…' : '') + doc.text.slice(start, end) + (end < doc.text.length ? '…' : '');
    const score = (exactTitle ? 100 : 0) + (titlePhrase ? 40 : 0) + tokens.filter(token => title.includes(token)).length * 8 + (phraseIndex.length ? 10 : 0);
    hits.push({ ...doc, score, snippet });
  }
  return hits.sort((a, b) => b.score - a.score || a.sourceTitle.localeCompare(b.sourceTitle, language));
}

export const EMPTY_SEARCH: SearchDocument[] = [];
export function bookSearchDocuments(book: BookText | null, sourceId: string, language: Language): SearchDocument[] {
  const source = readerCatalog.sources.find(item => item.id === sourceId);
  if (!source || book?.sourceId !== sourceId || book.language !== language) return EMPTY_SEARCH;
  return source.chapters.map(chapter => ({ sourceId, chapterId: chapter.id, sourceTitle: source.title[language], title: chapter.title[language], text: stripHtml(book.chapters[chapter.id]) }));
}
