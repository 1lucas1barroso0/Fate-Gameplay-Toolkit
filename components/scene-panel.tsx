"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppLanguage } from "@/lib/app-language";
import { emptyScene, sceneSchema, type Scene, type SceneSnapshot } from "@/lib/scene";
import { createUuid, safeJsonDownload } from "@/lib/fate";
import { createRoomSync } from "@/lib/room-sync";
import type { RoomSession } from "@/lib/room-contracts";

export function ScenePanel({ session, canEdit }: { session: RoomSession; canEdit: boolean }) {
  const { t } = useAppLanguage();
  const [saved, setSaved] = React.useState<SceneSnapshot | null>(null);
  const [draft, setDraft] = React.useState<Scene | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [remoteChanged, setRemoteChanged] = React.useState(false);
  const editing = React.useRef(false);
  const revision = React.useRef(0);
  const mounted = React.useRef(true);
  const syncRef = React.useRef<ReturnType<typeof createRoomSync<SceneSnapshot>> | null>(null);
  const headers = React.useMemo(() => ({ "content-type": "application/json", authorization: `Bearer ${session.token}`, "x-participant-id": session.participantId }), [session]);
  const endpoint = `/api/rooms/${session.roomCode}/scene`;
  const draftKey = `fate-gameplay-toolkit.scene-draft.${session.roomCode}.${session.participantId}`;
  React.useEffect(() => {
    mounted.current = true;
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    if (canEdit && !editing.current) {
      try {
        const stored = sessionStorage.getItem(draftKey);
        if (stored) {
          const value = JSON.parse(stored) as SceneSnapshot;
          if (Number.isInteger(value.revision) && value.revision >= 0) {
            const scene = value.scene === null ? null : sceneSchema.parse(value.scene);
            revision.current = value.revision; editing.current = true;
            restoreTimer = setTimeout(() => { setDirty(true); setDraft(scene); }, 0);
          }
        }
      } catch { /* A failed draft read never replaces the shared scene. */ }
    }
    const sync = createRoomSync<SceneSnapshot>({
      fetch: async signal => {
        const response = await fetch(endpoint, { headers, signal, cache: "no-store" });
        if (!response.ok) throw Error(String(response.status));
        const value = await response.json() as SceneSnapshot;
        if (!Number.isInteger(value.revision) || value.revision < 0) throw Error("invalid-scene");
        return { revision: value.revision, scene: value.scene === null ? null : sceneSchema.parse(value.scene) };
      },
      receive: value => {
        if (editing.current) { setSaved(value); if (value.revision !== revision.current) setRemoteChanged(true); return; }
        revision.current = value.revision; setSaved(value); setDraft(value.scene); setError(""); setRemoteChanged(false);
      }, status: () => {}, error: () => setError(t("A cena não sincronizou. Seu rascunho foi preservado.", "Scene sync failed. Your draft was preserved.")),
    });
    syncRef.current = sync;
    void sync.refresh();
    const refresh = () => { void sync.refresh(); };
    window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(restoreTimer); mounted.current = false; sync.stop(); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [endpoint, headers, t, canEdit, draftKey]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(next: Scene | null) {
    editing.current = true; setDirty(true); setDraft(next);
    try { sessionStorage.setItem(draftKey, JSON.stringify({ revision: revision.current, scene: next })); }
    catch { setError(t("O navegador não guardou o rascunho. Salve ou exporte antes de sair.", "The browser could not keep the draft. Save or export before leaving.")); }
  }
  function clearDraft() { try { sessionStorage.removeItem(draftKey); } catch { /* Saved scene remains on the server. */ } }
  async function save() {
    if (!saved || busy || remoteChanged) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers, body: JSON.stringify({ revision: revision.current, scene: draft }), signal: AbortSignal.timeout(15000) });
      if (!mounted.current) return;
      if (response.status === 409) { setRemoteChanged(true); return; }
      if (!response.ok) throw Error("save-failed");
      const value = await response.json() as SceneSnapshot;
      if (!mounted.current) return;
      revision.current = value.revision; editing.current = false; setSaved(value); setDraft(value.scene); setDirty(false);
      clearDraft();
    } catch { if (mounted.current) setError(t("Não foi salvo. Seu rascunho continua aqui; tente novamente.", "Not saved. Your draft is still here; try again.")); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className="scene-panel" aria-label={t("Cena da Mesa", "Table scene")}>
    <p>{t("Opcional: um quadro compartilhado, sem alterar fichas ou regras. O narrador edita; os participantes aprovados acompanham. Objetivos e marcadores só são usados se a mesa quiser.", "Optional: a shared board that never changes sheets or rules. The GM edits; approved participants follow. Goals and trackers are used only if the table chooses.")}</p>
    {error && <p role="alert">{error} <Button variant="outline" onClick={() => void syncRef.current?.refresh()}>{t("Tentar novamente", "Retry")}</Button></p>}
    {!saved ? <p role="status">{t("Carregando cena…", "Loading scene…")}</p> : !draft ? <p>{t("Nenhuma cena ativa.", "No active scene.")} {canEdit && <Button onClick={() => change(emptyScene())}>{t("Criar cena", "Create scene")}</Button>}</p> : <fieldset disabled={!canEdit || busy} className="scene-fields">
      <label>{t("Título", "Title")}<Input value={draft.title} maxLength={120} onChange={e => change({ ...draft, title: e.target.value })} /></label>
      <label>{t("Aspectos da cena — um por linha", "Scene aspects — one per line")}<Textarea value={draft.aspects.join("\n")} maxLength={2400} onChange={e => change({ ...draft, aspects: e.target.value.split("\n").slice(0, 12).map(s => s.slice(0, 200)) })} /></label>
      <div className="scene-grid"><label>{t("Oposição", "Opposition")}<Input value={draft.opposition} maxLength={300} onChange={e => change({ ...draft, opposition: e.target.value })} /></label><label>{t("Dificuldade", "Difficulty")}<Input type="number" min={-20} max={20} value={draft.difficulty} onChange={e => change({ ...draft, difficulty: Math.max(-20, Math.min(20, Number(e.target.value))) })} /></label></div>
      <h4>{t("Presentes na cena", "In the scene")}</h4>
      {draft.characters.map((character, index) => <div className="scene-character" key={character.id}>
        <label>{t("Nome", "Name")}<Input maxLength={100} value={character.name} onChange={e => change({ ...draft, characters: draft.characters.map((c, i) => i === index ? { ...c, name: e.target.value } : c) })} /></label>
        <div className="scene-track"><span>{t("Estresse temporário", "Temporary stress")}</span>{character.stress.map((checked, slot) => <label key={slot}><input type="checkbox" checked={checked} onChange={e => change({ ...draft, characters: draft.characters.map((c, i) => i === index ? { ...c, stress: c.stress.map((value, s) => s === slot ? e.target.checked : value) } : c) })} />{slot + 1}</label>)}<Button variant="ghost" disabled={character.stress.length >= 12} onClick={() => change({ ...draft, characters: draft.characters.map((c, i) => i === index ? { ...c, stress: [...c.stress, false] } : c) })}>+</Button></div>
        <label>{t("Consequências temporárias", "Temporary consequences")}<Input value={character.consequences} maxLength={500} onChange={e => change({ ...draft, characters: draft.characters.map((c, i) => i === index ? { ...c, consequences: e.target.value } : c) })} /></label>
        <Button variant="ghost" onClick={() => change({ ...draft, characters: draft.characters.filter((_, i) => i !== index) })}>{t("Remover da cena", "Remove from scene")}</Button>
      </div>)}
      {canEdit && <Button variant="outline" disabled={draft.characters.length >= 24} onClick={() => change({ ...draft, characters: [...draft.characters, { id: createUuid(), name: "", stress: [false, false, false], consequences: "" }] })}>{t("Adicionar participante ou oposição", "Add character or opposition")}</Button>}
      <h4>{t("Objetivos e marcadores opcionais", "Optional goals and trackers")}</h4>
      {draft.objectives.map((objective, index) => <div className="scene-grid" key={objective.id}>
        <label>{t("Objetivo", "Goal")}<Input value={objective.name} maxLength={120} onChange={e => change({ ...draft, objectives: draft.objectives.map((o, i) => i === index ? { ...o, name: e.target.value } : o) })} /></label>
        <label>{t("Progresso", "Progress")}<Input type="number" min={0} max={objective.segments} value={objective.filled} onChange={e => change({ ...draft, objectives: draft.objectives.map((o, i) => i === index ? { ...o, filled: Math.max(0, Math.min(o.segments, Number(e.target.value))) } : o) })} /></label>
        <label>{t("Total", "Total")}<Input type="number" min={1} max={12} value={objective.segments} onChange={e => { const segments = Math.max(1, Math.min(12, Number(e.target.value))); change({ ...draft, objectives: draft.objectives.map((o, i) => i === index ? { ...o, segments, filled: Math.min(o.filled, segments) } : o) }); }} /></label>
        <progress value={objective.filled} max={objective.segments} aria-label={objective.name || t("Objetivo", "Goal")} />
        <Button variant="ghost" onClick={() => change({ ...draft, objectives: draft.objectives.filter((_, i) => i !== index) })}>{t("Remover objetivo", "Remove goal")}</Button>
      </div>)}
      {canEdit && <Button variant="outline" disabled={draft.objectives.length >= 12} onClick={() => change({ ...draft, objectives: [...draft.objectives, { id: createUuid(), name: "", filled: 0, segments: 4 }] })}>{t("Adicionar objetivo", "Add goal")}</Button>}
    </fieldset>}
    {remoteChanged && <p role="alert">{t("A cena mudou em outra aba. Exporte seu rascunho, se precisar, e recarregue a versão compartilhada antes de editar.", "The scene changed in another tab. Export your draft if needed, then reload the shared version before editing.")}</p>}
    <div className="scene-actions">
      {canEdit && saved && <Button disabled={!dirty || busy || remoteChanged} onClick={() => void save()}>{busy ? t("Salvando…", "Saving…") : t("Salvar cena", "Save scene")}</Button>}
      {draft && <Button variant="outline" onClick={() => safeJsonDownload("fate-scene.json", { version: 1, scene: draft })}>{t("Exportar cena", "Export scene")}</Button>}
      {dirty && <Button variant="outline" disabled={busy} onClick={() => { if (!window.confirm(t("Descartar apenas as alterações não salvas desta cena?", "Discard only the unsaved scene changes?"))) return; clearDraft(); editing.current = false; setDirty(false); setRemoteChanged(false); setDraft(saved?.scene ?? null); void syncRef.current?.refresh(); }}>{t("Recarregar cena salva", "Reload saved scene")}</Button>}
      {canEdit && draft && <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(t("Encerrar a cena? Salve depois para confirmar. Fichas e histórico serão preservados.", "End the scene? Save afterwards to confirm. Sheets and history are preserved."))) change(null); }}>{t("Encerrar cena", "End scene")}</Button>}
    </div>
    {dirty && <p role="status">{t("Alterações ainda não salvas — salve antes de sair desta área.", "Unsaved changes — save before leaving this area.")}</p>}
  </section>;
}
