export const roomDraftKey = (participant: string) => 'fate-gameplay-toolkit.room-draft.v1.' + participant;
export function readRoomDraft(storage: Pick<Storage, 'getItem'>, participant: string): string {
  const raw = storage.getItem(roomDraftKey(participant)); if (!raw) return '';
  const data = JSON.parse(raw);
  if (data?.version !== 1 || typeof data.text !== 'string' || data.text.length > 1600) throw Error('draft-invalid');
  return data.text;
}
export function saveRoomDraft(storage: Pick<Storage, 'setItem' | 'removeItem'>, participant: string, text: string) {
  if (!participant || text.length > 1600) return;
  if (text) storage.setItem(roomDraftKey(participant), JSON.stringify({ version: 1, text })); else storage.removeItem(roomDraftKey(participant));
}
