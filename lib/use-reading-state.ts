'use client';
import * as React from 'react';
import { EMPTY_READING, parseReading, READING_KEY, type ReadingState } from '@/lib/reading-state';

const initial = { state: EMPTY_READING, ready: false, saved: true };
let snapshot = initial;
let readable = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
function hydrate() {
  try {
    const raw = localStorage.getItem(READING_KEY);
    snapshot = { state: raw ? parseReading(JSON.parse(raw)) : EMPTY_READING, ready: true, saved: true };
    readable = true;
  } catch { snapshot = { ...snapshot, ready: true, saved: false }; readable = false; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!snapshot.ready) { hydrate(); listener(); }
  const storage = (event: StorageEvent) => { if (event.key === READING_KEY) { hydrate(); emit(); } };
  window.addEventListener('storage', storage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', storage); };
}
export function updateReading(update: (state: ReadingState) => ReadingState) {
  if (!snapshot.ready) hydrate();
  const state = update(snapshot.state);
  let saved = readable;
  try { if (readable) localStorage.setItem(READING_KEY, JSON.stringify(state)); } catch { saved = false; }
  snapshot = { state, ready: true, saved };
  emit();
  return saved;
}
export function useReadingState() {
  return React.useSyncExternalStore(subscribe, () => snapshot, () => initial);
}
