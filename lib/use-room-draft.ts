'use client';
import { WORKSPACE_EVENT, workspaceStorage as localStorage } from "@/lib/workspace-storage";
import * as React from 'react';
import { readRoomDraft, saveRoomDraft } from '@/lib/room-draft';
export function useRoomDraft(participant: string) {
  const [draft, setDraft] = React.useState({ participant: '', text: '', saved: true });
  const current = React.useRef(draft);
  React.useEffect(() => {
    const reload = () => {
      let text = '', saved = true;
      try { if (participant) text = readRoomDraft(localStorage, participant); } catch { saved = false; }
      current.current = { participant, text, saved }; setDraft(current.current);
    };
    const timer = setTimeout(reload, 0);
    window.addEventListener(WORKSPACE_EVENT, reload);
    return () => { clearTimeout(timer); window.removeEventListener(WORKSPACE_EVENT, reload); };
  }, [participant]);
  const change = (text: string) => {
    if (current.current.participant !== participant) return;
    let saved = true; try { saveRoomDraft(localStorage, participant, text); } catch { saved = false; }
    current.current = { participant, text, saved }; setDraft(current.current);
  };
  const acknowledge = (submitted: string) => {
    if (current.current.participant === participant) { if (current.current.text === submitted) change(''); }
    else { try { if (readRoomDraft(localStorage, participant) === submitted) saveRoomDraft(localStorage, participant, ''); } catch { /* Preserve an unreadable draft. */ } }
  };
  return { text: draft.participant === participant ? draft.text : '', ready: draft.participant === participant, saved: draft.saved, change, acknowledge };
}
