import { DEFAULT_READING, readingKey, validReading, type ReaderLocation } from '@/lib/reader-library';
export const READING_KEY = 'fate-gameplay-toolkit.reading.v1';
export type ReadingPosition = { anchor: string; offset: number; progress: number };
export type ReadingState = { version: 1; last: ReaderLocation; recent: ReaderLocation[]; bookmarks: ReaderLocation[]; positions: Record<string, ReadingPosition> };
export const EMPTY_READING: ReadingState = { version: 1, last: DEFAULT_READING, recent: [], bookmarks: [], positions: {} };
export function parseReading(value: unknown): ReadingState {
  if (!value || typeof value !== 'object' || (value as ReadingState).version !== 1) throw new Error('reading-format');
  const input = value as ReadingState;
  const list = (items: unknown) => Array.isArray(items) ? [...new Map(items.filter(validReading).map(item => [readingKey(item), item])).values()].slice(0, 500) : [];
  const positions: Record<string, ReadingPosition> = {};
  for (const [key, entry] of Object.entries(input.positions ?? {}).slice(0, 500)) {
    if (!/^[a-z0-9_-]+:[a-z0-9_-]+:(pt|en)$/.test(key) || !entry || typeof entry !== 'object') continue;
    if (typeof entry.anchor !== 'string' || entry.anchor.length > 240 || !Number.isFinite(entry.offset) || !Number.isFinite(entry.progress)) continue;
    positions[key] = { anchor: entry.anchor, offset: Math.max(-500, Math.min(100000, entry.offset)), progress: Math.max(0, Math.min(1, entry.progress)) };
  }
  return { version: 1, last: validReading(input.last) ? input.last : DEFAULT_READING, recent: list(input.recent).slice(0, 36), bookmarks: list(input.bookmarks), positions };
}
export function rememberReading(state: ReadingState, last: ReaderLocation): ReadingState {
  return { ...state, last, recent: [last, ...state.recent.filter(item => !(item.sourceId === last.sourceId && item.language === last.language))].slice(0, 36) };
}
export function toggleBookmark(state: ReadingState, location: ReaderLocation): ReadingState {
  const exists = state.bookmarks.some(item => readingKey(item) === readingKey(location));
  return { ...state, bookmarks: exists ? state.bookmarks.filter(item => readingKey(item) !== readingKey(location)) : [location, ...state.bookmarks].slice(0, 500) };
}
export function mergeReading(current: ReadingState, incoming: ReadingState): ReadingState {
  return parseReading({ ...current, bookmarks: [...current.bookmarks, ...incoming.bookmarks], recent: [...current.recent, ...incoming.recent], positions: { ...incoming.positions, ...current.positions } });
}
