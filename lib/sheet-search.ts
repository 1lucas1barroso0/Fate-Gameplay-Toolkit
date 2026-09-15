import type { FateCharacter } from '@/lib/fate';
export const normalizeSheetSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function matchesSheet(sheet: FateCharacter, query: string, roomName = '', profileName = '') {
  const text = normalizeSheetSearch([sheet.name, sheet.description, ...Object.values(sheet.aspects), ...Object.values(sheet.optional.aspectValues), roomName, profileName].join(' '));
  return normalizeSheetSearch(query).trim().split(/\s+/).every(term => text.includes(term));
}
