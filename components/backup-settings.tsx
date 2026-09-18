"use client";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAppLanguage } from "@/lib/app-language";
import { backupSchema, compareBackup, readBackupReminder, writeBackupReminder, type BackupBundle } from "@/lib/backup-tools";
import { parseReading, mergeReading } from "@/lib/reading-state";
import { updateReading } from "@/lib/use-reading-state";
import { recordDiagnostic } from "@/lib/local-diagnostics";
import type { CharacterStore } from "@/lib/use-character-store";
import type { TableConfigStore } from "@/lib/use-table-config";
import type { FateCharacter } from "@/lib/fate";

export function BackupSettings({ characters, tables }: { characters: CharacterStore; tables: TableConfigStore }) {
  const { t, locale } = useAppLanguage();
  const [reminder, setReminder] = React.useState({ days: 0, lastExportAt: 0, snoozedUntil: 0 });
  const [incoming, setIncoming] = React.useState<BackupBundle | null>(null);
  const [current, setCurrent] = React.useState<FateCharacter[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [selectedProfiles, setSelectedProfiles] = React.useState<Set<string>>(new Set());
  const [includeReading, setIncludeReading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { const refresh = () => setReminder(readBackupReminder()); const timer = setTimeout(refresh, 0); window.addEventListener("fate:backup", refresh); return () => { clearTimeout(timer); window.removeEventListener("fate:backup", refresh); }; }, []);
  const sheetRows = incoming ? compareBackup(incoming.sheets, current) : [];
  const profileRows = incoming ? compareBackup(incoming.rulesProfiles, tables.profiles) : [];
  async function preview(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 100 * 1024 * 1024) throw Error(t("O backup deve ter até 100 MB.", "Backups must be no larger than 100 MB."));
      const bundle = backupSchema.parse(JSON.parse(await file.text()));
      if (bundle.reading !== undefined) parseReading(bundle.reading);
      const ids = bundle.sheets.map(sheet => sheet.id);
      if (new Set(ids).size !== ids.length || new Set(bundle.rulesProfiles.map(p => p.id)).size !== bundle.rulesProfiles.length) throw Error(t("O backup contém identificadores repetidos.", "The backup contains duplicate identifiers."));
      const local = await Promise.all(characters.characters.map(characters.exportCharacter));
      setCurrent(local); setIncoming(bundle);
      setSelected(new Set(compareBackup(bundle.sheets, local).filter(row => row.status !== "same").map(row => row.item.id)));
      setSelectedProfiles(new Set(compareBackup(bundle.rulesProfiles, tables.profiles).filter(row => row.status !== "same").map(row => row.item.id)));
      setIncludeReading(false);
    } catch { toast.error(t("Backup inválido ou indisponível. Nenhum dado foi alterado.", "Invalid or unavailable backup. No data was changed.")); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function merge() {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      const needed = new Set(incoming.sheets.filter(sheet => selected.has(sheet.id)).map(sheet => sheet.optional.links.rulesProfileId));
      selectedProfiles.forEach(id => needed.add(id));
      const toImport = profileRows.filter(row => row.status !== "same" && needed.has(row.item.id));
      if (tables.profiles.length + toImport.length > 24) throw Error(t("Não há espaço para todos os conjuntos de regras. Importe menos fichas.", "There is not enough room for all rules profiles. Import fewer sheets."));
      const profileMap = new Map<string, string>();
      for (const row of profileRows) if (row.status === "same") {
        const match = tables.profiles.find(profile => compareBackup([row.item], [profile])[0].status === "same");
        if (match) profileMap.set(row.item.id, match.id);
      }
      // Images are validated/materialized before any React collection is changed.
      const prepared = await characters.prepareImports(incoming.sheets.filter(sheet => selected.has(sheet.id)));
      for (const row of toImport) profileMap.set(row.item.id, tables.importConfig(row.item.config).id);
      characters.mergeImports(prepared.map(sheet => ({ ...sheet, optional: { ...sheet.optional, links: { rulesProfileId: profileMap.get(sheet.optional.links.rulesProfileId) ?? tables.activeProfileId, roomParticipantId: "" } } })));
      if (includeReading && incoming.reading !== undefined) {
        try {
          if (!updateReading(saved => mergeReading(saved, parseReading(incoming.reading)))) throw Error("reading-storage");
        } catch { toast.info(t("Fichas importadas; marcações de leitura preservadas sem alteração.", "Sheets imported; existing reading marks left unchanged.")); }
      }
      setIncoming(null); recordDiagnostic("backup", "ok");
      toast.success(t("Cópias importadas. Nada que já existia foi substituído.", "Copies imported. Nothing already present was replaced."));
    } catch (error) { recordDiagnostic("backup", "error"); toast.error(error instanceof Error ? error.message : t("A importação não terminou.", "Import did not finish.")); }
    finally { setBusy(false); }
  }
  return <section className="storage-action-section" id="backup-settings">
    <h3>{t("Backups e recuperação", "Backups and recovery")}</h3>
    <p>{reminder.lastExportAt ? t("Última exportação iniciada: ", "Last export started: ") + new Date(reminder.lastExportAt).toLocaleString(locale) : t("Nenhuma exportação registrada neste navegador.", "No export recorded in this browser.")} {t("Confira se o arquivo foi salvo na sua pasta de downloads.", "Check that the file was saved in your downloads folder.")}</p>
    <label>{t("Lembrete enquanto o site estiver aberto", "Reminder while the site is open")} <select value={reminder.days} onChange={e => { const next = { ...reminder, days: Number(e.target.value), snoozedUntil: Date.now() + Number(e.target.value) * 86400000 }; try { writeBackupReminder(next); setReminder(next); } catch { toast.error(t("Não foi possível salvar o lembrete.", "Could not save the reminder.")); } }}><option value={0}>{t("Desativado", "Off")}</option><option value={7}>{t("A cada 7 dias", "Every 7 days")}</option><option value={30}>{t("A cada 30 dias", "Every 30 days")}</option></select></label>
    <p>{t("Importe uma cópia completa para comparar antes de confirmar. Fichas diferentes entram como novas cópias; as iguais são ignoradas. Credenciais e dados do servidor não são restaurados por este arquivo.", "Import a full backup to compare before confirming. Changed sheets become new copies; identical ones are skipped. This file does not restore credentials or server data.")}</p>
    <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>{t("Comparar e importar backup", "Compare and import backup")}</Button><input type="file" accept=".json,application/json" hidden ref={input} onChange={e => void preview(e.target.files?.[0])} />
    {incoming && <div className="backup-preview">
      <h4>{t("Prévia — nenhuma substituição", "Preview — no replacements")}</h4>
      {sheetRows.map(row => <label key={row.item.id}><input type="checkbox" checked={selected.has(row.item.id)} disabled={row.status === "same" || busy} onChange={e => setSelected(value => { const next = new Set(value); if (e.target.checked) next.add(row.item.id); else next.delete(row.item.id); return next; })} /><span><b>{row.item.name}</b><small>{row.status === "same" ? t("Igual — não importar", "Identical — skip") : row.status === "copy" ? t("Diferente — preservar original e adicionar cópia", "Changed — keep original and add a copy") : t("Nova ficha", "New sheet")}{row.changed.length ? ` · ${row.changed.map(key => ({ name: t("nome", "name"), aspects: t("aspectos", "aspects"), skills: t("perícias", "skills"), optional: t("campos e imagem", "fields and image"), stunts: t("façanhas", "stunts"), stress: t("estresse", "stress"), consequences: t("consequências", "consequences") }[key] ?? key)).join(", ")}` : ""}</small></span></label>)}
      <p>{t("Os conjuntos de regras vinculados às fichas selecionadas serão reutilizados quando iguais ou adicionados como novos.", "Rules profiles linked to selected sheets will be reused when identical or added as new profiles.")}</p>
      {profileRows.map(row => <label key={row.item.id}><input type="checkbox" disabled={busy || row.status === "same"} checked={selectedProfiles.has(row.item.id)} onChange={e => setSelectedProfiles(value => { const next = new Set(value); if (e.target.checked) next.add(row.item.id); else next.delete(row.item.id); return next; })} /><span>{row.item.config.profileName}<small>{row.status === "same" ? t("Conjunto igual — reutilizar", "Identical profile — reuse") : t("Adicionar conjunto de regras", "Add rules profile")}</small></span></label>)}
      {incoming.reading !== undefined && <label><input type="checkbox" checked={includeReading} disabled={busy} onChange={e => setIncludeReading(e.target.checked)} />{t("Mesclar favoritos e progresso de leitura", "Merge bookmarks and reading progress")}</label>}
      <Button disabled={busy || (!selected.size && !selectedProfiles.size && !includeReading)} onClick={() => void merge()}>{t("Importar cópias selecionadas", "Import selected copies")}</Button> <Button variant="ghost" disabled={busy} onClick={() => setIncoming(null)}>{t("Cancelar", "Cancel")}</Button>
    </div>}
  </section>;
}
