"use client";

import { t, useAppLanguage, getAppLanguage } from "@/lib/app-language";

import * as React from "react";
import { BackupSettings } from "@/components/backup-settings";
import { DiagnosticsSettings } from "@/components/diagnostics-settings";
import { readBackupReminder, writeBackupReminder } from "@/lib/backup-tools";
import { BookOpen, Database, Download, Eraser, FileText, HardDrive, Image as ImageIcon, RefreshCw, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrphanCleanupDialog } from "@/components/orphan-cleanup-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeJsonDownload } from "@/lib/fate";
import {
  clearLocalRollHistory,
  clearRegenerableCaches,
  readLocalStorageReport,
  removeFateTemporaryData,
  requestPersistentStorage,
  type LocalStorageReport,
} from "@/lib/local-storage-manager";
import { formatStorageBytes } from "@/lib/storage-policy";
import type { RoomFileData } from "@/lib/room-contracts";
import type { CharacterStore } from "@/lib/use-character-store";
import type { RoomStore } from "@/lib/use-room";
import type { TableConfigStore } from "@/lib/use-table-config";

const CATEGORY_LABELS = [
  ["sheets", "Fichas", FileText],
  ["images", "Imagens", ImageIcon],
  ["settings", "Configurações e regras", BookOpen],
  ["rooms", "Mesas lembradas", UsersRound],
  ["other", "Outros dados locais do Fate", Database],
] as const;

function approximateJsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function StorageSettings({
  characterStore,
  tableStore,
  roomStore,
  onDeleteProfiles,
}: {
  characterStore: CharacterStore;
  tableStore: TableConfigStore;
  roomStore: RoomStore;
  onDeleteProfiles: (profileIds: string[]) => { removedIds: string[]; replacementId: string };
}) {
  useAppLanguage();
  const [report, setReport] = React.useState<LocalStorageReport | null>(null);
  const [selectedSheets, setSelectedSheets] = React.useState<Set<string>>(new Set());
  const [selectedProfiles, setSelectedProfiles] = React.useState<Set<string>>(new Set());
  const [selectedRooms, setSelectedRooms] = React.useState<Set<string>>(new Set());
  const [historyDays, setHistoryDays] = React.useState("365");
  const [working, setWorking] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const next = await readLocalStorageReport();
    setReport(next);
    return next;
  }, []);

  React.useEffect(() => {
    const handle = window.setTimeout(() => void refresh().catch(() => undefined), 0);
    return () => window.clearTimeout(handle);
  }, [characterStore.storageRevision, refresh, roomStore.savedRooms.length, tableStore.lastSavedAt]);

  const run = async (action: () => Promise<void> | void) => {
    if (working) return;
    setWorking(true);
    try {
      await action();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não deu certo. Seus dados continuam como estavam."));
    } finally {
      setWorking(false);
    }
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, checked: boolean) => {
    setter((current) => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const exportSheets = async (ids: ReadonlySet<string> = new Set(characterStore.characters.map((item) => item.id))) => {
    const selected = characterStore.characters.filter((character) => ids.has(character.id));
    const sheets = await Promise.all(selected.map(characterStore.exportCharacter));
    safeJsonDownload("fate-fichas-backup.json", {
      format: "fate-sheet-collection",
      bundleVersion: 4,
      sheets,
    });
  };

  const exportEverythingLocal = async () => {
    const sheets = await Promise.all(characterStore.characters.map(characterStore.exportCharacter));
    safeJsonDownload("fate-gameplay-toolkit-backup.json", {
      format: "fate-gameplay-toolkit-backup",
      bundleVersion: 4,
      sheets,
      rulesProfiles: tableStore.profiles,
      activeRulesProfileId: tableStore.activeProfileId,
      reading: (() => { try { return JSON.parse(localStorage.getItem("fate-gameplay-toolkit.reading.v1") ?? "null") ?? undefined; } catch { return undefined; } })(),
      rememberedRooms: roomStore.savedRooms.map((room) => ({
        roomCode: room.session.roomCode,
        roomName: room.roomName,
        selfName: room.selfName,
        role: room.role,
        rulesProfileId: room.rulesProfileId,
      })),
      note: t("Este arquivo não leva o acesso privado às Mesas. Exporte o Histórico dentro de cada Mesa."),
    });
    try { writeBackupReminder({ ...readBackupReminder(), lastExportAt: Date.now(), snoozedUntil: 0 }); } catch { /* Download still works without reminders. */ }
  };

  const sheetDeleteBytes = characterStore.characters
    .filter((character) => selectedSheets.has(character.id))
    .reduce((total, character) => total + approximateJsonBytes(character), 0);
  const profileDeleteBytes = tableStore.profiles
    .filter((profile) => selectedProfiles.has(profile.id))
    .reduce((total, profile) => total + approximateJsonBytes(profile), 0);
  const roomDeleteBytes = roomStore.savedRooms
    .filter((room) => selectedRooms.has(room.session.participantId))
    .reduce((total, room) => total + approximateJsonBytes(room), 0);
  const percentage = report?.percent === null || report?.percent === undefined ? null : Math.min(100, report.percent * 100);
  const activeRoom = roomStore.snapshot;
  const activeFiles = activeRoom?.entries.filter((entry) => entry.type === "file") ?? [];

  return (
    <div className="storage-settings">
      <BackupSettings characters={characterStore} tables={tableStore} />
      <DiagnosticsSettings />
      <section className="storage-overview" data-state={report?.state ?? "normal"}>
        <div className="storage-overview-heading"><HardDrive /><div><b>{t("Armazenamento deste dispositivo")}</b><span>{report ? t(`${formatStorageBytes(report.usage)} usados${report.quota ? ` de cerca de ${formatStorageBytes(report.quota)}` : ""}`, `${formatStorageBytes(report.usage)} used${report.quota ? ` out of about ${formatStorageBytes(report.quota)}` : ""}`) : t("Medindo…")}</span></div><strong>{report?.state === "critical" ? t("Quase cheio") : report?.state === "attention" ? t("Atenção") : t("Tudo certo")}</strong></div>
        {report?.quota && <progress max={report.quota} value={report.usage} aria-label={t("Uso estimado do armazenamento local")} />}
        <p>{percentage === null ? t("Este navegador não informa o espaço total disponível. A lista abaixo ainda mostra o que a ferramenta consegue medir.") : t(`${percentage.toLocaleString(getAppLanguage() === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 })}% do espaço estimado pelo navegador.`, `${percentage.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of the browser’s estimated storage.`)} {t("Os números são aproximados porque o navegador também conta dados internos que não aparecem na lista.")}</p>
        <div className="storage-overview-actions"><Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void refresh()}><RefreshCw /> {t("Medir novamente")}</Button>{report?.persisted === false && <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void run(async () => { const result = await requestPersistentStorage(); toast[result.persisted ? "success" : "info"](result.persisted ? t("Pronto. O navegador vai proteger estes dados contra limpezas automáticas.") : result.supported ? t("O navegador não aceitou a proteção, mas seus dados continuam disponíveis para usar e exportar.") : t("Este navegador não oferece essa proteção.")); })}><ShieldCheck /> {t("Proteger estes dados")}</Button>}</div>
      </section>

      <div className="storage-breakdown" aria-label={t("Estimativa por categoria")}>
        {CATEGORY_LABELS.map(([key, label, Icon]) => <div key={key}><Icon /><span>{t(label)}<small>{t("Estimativa local")}</small></span><b>{formatStorageBytes(report?.breakdown[key] ?? 0)}</b></div>)}
      </div>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">{t("Antes de limpar")}</p><h3>{t("Leve uma cópia completa")}</h3></div><Button type="button" disabled={working} onClick={() => void run(async () => { await exportEverythingLocal(); toast.success(t("Fichas e regras exportadas.")); })}><Download /> {t("Exportar Fichas e regras")}</Button></header>
        <p>{t("A cópia inclui as imagens atuais das Fichas. O acesso privado e o Histórico das Mesas ficam de fora; exporte cada Histórico dentro da própria Mesa.")}</p>
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">{t("Escolha exatamente")}</p><h3>{t("Fichas deste dispositivo")}</h3></div><span>{characterStore.characters.length}</span></header>
        <div className="storage-select-list">{characterStore.characters.map((character) => <div key={character.id}><Checkbox id={`storage-sheet-${character.id}`} checked={selectedSheets.has(character.id)} onCheckedChange={(checked) => toggle(setSelectedSheets, character.id, checked === true)} /><label htmlFor={`storage-sheet-${character.id}`}><span><b>{character.name || t("Ficha sem nome")}</b><small>{formatStorageBytes(approximateJsonBytes(character))} {t("em texto e referências")}</small></span></label><Button type="button" variant="ghost" size="sm" onClick={() => void run(async () => { await exportSheets(new Set([character.id])); toast.success(t("Ficha exportada com sua imagem.")); })}><Download /> {t("Exportar")}</Button></div>)}</div>
        <div className="storage-safe-actions"><Button type="button" variant="outline" disabled={working} onClick={() => void run(async () => { const result = await characterStore.cleanupUnusedImages(); toast.success(result.removed ? t(result.removed === 1 ? `1 imagem sem uso removida. Cerca de ${formatStorageBytes(result.bytes)} foram liberados.` : `${result.removed} imagens sem uso removidas. Cerca de ${formatStorageBytes(result.bytes)} foram liberados.`, result.removed === 1 ? `1 unused image removed. About ${formatStorageBytes(result.bytes)} was freed.` : `${result.removed} unused images removed. About ${formatStorageBytes(result.bytes)} was freed.`) : t("Nenhuma imagem sem uso foi encontrada.")); })}><ImageIcon /> {t("Remover imagens não utilizadas")}</Button>{selectedSheets.size > 0 && <><Button type="button" variant="outline" onClick={() => void run(async () => { await exportSheets(selectedSheets); toast.success(t("Fichas escolhidas exportadas.")); })}><Download /> {t("Exportar escolhidas")}</Button><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> {t("Apagar escolhidas")}</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t(`Apagar ${selectedSheets.size} ${selectedSheets.size === 1 ? "Ficha" : "Fichas"}?`, `Delete ${selectedSheets.size} ${selectedSheets.size === 1 ? "sheet" : "sheets"}?`)}</AlertDialogTitle><AlertDialogDescription>{t(`As Fichas escolhidas sairão deste dispositivo e liberarão cerca de ${formatStorageBytes(sheetDeleteBytes)}. Imagens necessárias para a cópia recuperável serão preservadas. As outras Fichas, regras e Mesas continuam como estão.`, `The selected sheets will be removed from this device and free about ${formatStorageBytes(sheetDeleteBytes)}. Images needed by the recovery copy will be preserved. Other sheets, rules and tables stay as they are.`)}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { characterStore.deleteCharacters(selectedSheets); setSelectedSheets(new Set()); toast.success(t("Fichas escolhidas apagadas.")); })}>{t("Apagar Fichas")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>}</div>
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">{t("Perfis locais")}</p><h3>{t("Conjuntos de regras")}</h3></div><span>{tableStore.profiles.length}</span></header>
        <div className="storage-select-list">{tableStore.profiles.map((profile) => <div key={profile.id}><Checkbox id={`storage-profile-${profile.id}`} checked={selectedProfiles.has(profile.id)} onCheckedChange={(checked) => toggle(setSelectedProfiles, profile.id, checked === true)} /><label htmlFor={`storage-profile-${profile.id}`}><span><b>{profile.config.profileName}</b><small>{formatStorageBytes(approximateJsonBytes(profile))} {t("estimados")}</small></span></label><Button type="button" variant="ghost" size="sm" onClick={() => safeJsonDownload(`${profile.config.profileName}.regras-fate.json`, profile.config)}><Download /> {t("Exportar")}</Button></div>)}</div>
        {selectedProfiles.size > 0 && <div className="storage-safe-actions"><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> {t("Apagar regras escolhidas")}</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t("Apagar os conjuntos escolhidos?")}</AlertDialogTitle><AlertDialogDescription>{t(`Isso libera cerca de ${formatStorageBytes(profileDeleteBytes)}. Pelo menos um conjunto será preservado; Fichas e Mesas vinculadas passarão a usar o conjunto restante. Nenhuma Ficha ou Mesa será apagada.`, `This frees about ${formatStorageBytes(profileDeleteBytes)}. At least one profile will be kept; linked sheets and tables will use the remaining profile. No sheet or table will be deleted.`)}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(() => { const result = onDeleteProfiles([...selectedProfiles]); setSelectedProfiles(new Set()); toast.success(result.removedIds.length ? t(result.removedIds.length === 1 ? "1 conjunto apagado." : `${result.removedIds.length} conjuntos apagados.`, result.removedIds.length === 1 ? "1 profile deleted." : `${result.removedIds.length} profiles deleted.`) : t("O último conjunto foi preservado.")); })}>{t("Apagar conjuntos")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">{t("Somente neste navegador")}</p><h3>{t("Mesas lembradas")}</h3></div><span>{roomStore.savedRooms.length}</span></header>
        <div className="storage-select-list">{roomStore.savedRooms.map((room) => <div key={room.session.participantId}><Checkbox id={`storage-room-${room.session.participantId}`} checked={selectedRooms.has(room.session.participantId)} onCheckedChange={(checked) => toggle(setSelectedRooms, room.session.participantId, checked === true)} /><label htmlFor={`storage-room-${room.session.participantId}`}><span><b>{room.roomName || t(`Mesa ${room.session.roomCode}`, "Table " + String(room.session.roomCode) + "")}</b><small>{room.session.roomCode} {t("· esquecer não apaga o servidor")}</small></span></label></div>)}</div>
        {selectedRooms.size > 0 && <div className="storage-safe-actions"><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline"><Eraser /> {t("Esquecer escolhidas")}</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t(`Esquecer ${selectedRooms.size} ${selectedRooms.size === 1 ? "Mesa" : "Mesas"} neste dispositivo?`, `Forget ${selectedRooms.size} ${selectedRooms.size === 1 ? "table" : "tables"} on this device?`)}</AlertDialogTitle><AlertDialogDescription>{t(`Este navegador vai esquecer o acesso escolhido e liberar cerca de ${formatStorageBytes(roomDeleteBytes)}. Nada será apagado da Mesa. Para excluir uma Mesa e seus arquivos, entre nela como narrador e use “Excluir Mesa inteira”.`, `This browser will forget the selected access and free about ${formatStorageBytes(roomDeleteBytes)}. Nothing will be deleted from the table. To delete a table and its files, enter it as GM and use “Delete entire table”.`)}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction onClick={() => void run(() => { for (const id of selectedRooms) roomStore.forgetRoom(id); setSelectedRooms(new Set()); toast.success(t("Este navegador esqueceu as Mesas escolhidas.")); })}>{t("Esquecer Mesas")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">{t("No servidor")}</p><h3>{t("Dados das Mesas")}</h3></div>{activeRoom && <span>{activeRoom.room.name}</span>}</header>
        {!activeRoom ? <p>{t("Abra uma Mesa para ver, exportar ou apagar os dados compartilhados. Com as Mesas fechadas, nada é carregado em segundo plano.")}</p> : <>
          <div className="server-storage-summary"><b>{formatStorageBytes(activeRoom.storage.files.usedBytes)} {t("usados de")} {formatStorageBytes(activeRoom.storage.files.limitBytes)} {t("em arquivos")}</b><span>{activeRoom.storage.files.count} {t("de")} {activeRoom.storage.files.maxCount} {t("arquivos ·")} {formatStorageBytes(activeRoom.storage.history.usedBytes)} {t("em Histórico textual")}</span></div>
          <div className="storage-safe-actions"><Button type="button" variant="outline" onClick={() => void run(async () => { await roomStore.exportHistory(); toast.success(t("Histórico completo exportado.")); })}><Download /> {t("Exportar Histórico")}</Button>{activeRoom.self.role === "gm" && <OrphanCleanupDialog disabled={working} onCleanup={async () => { const result = await roomStore.cleanupOrphanFiles(); await refresh(); return result; }} />}</div>
          {activeRoom.self.role === "gm" && <p className="storage-orphan-help"><b>{t("E os envios interrompidos?")}</b> {t("Eles podem deixar uma sobra fora do Histórico. A verificação remove apenas essas sobras e nunca apaga arquivos publicados.")}</p>}
          {activeRoom.self.role === "gm" && <div className="storage-history-cleanup"><div><b>{t("Limpeza opcional do Histórico")}</b><span>{t(`O Histórico ocupa ${formatStorageBytes(activeRoom.storage.history.usedBytes)}. A limpeza pode liberar até esse valor; o total exato aparece ao terminar.`, `History uses ${formatStorageBytes(activeRoom.storage.history.usedBytes)}. Cleanup can free up to that amount; the exact total appears when it finishes.`)}</span></div><Select value={historyDays} onValueChange={setHistoryDays}><SelectTrigger aria-label={t("Período de Histórico a preservar")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="90">{t("Preservar 90 dias")}</SelectItem><SelectItem value="180">{t("Preservar 180 dias")}</SelectItem><SelectItem value="365">{t("Preservar 1 ano")}</SelectItem><SelectItem value="730">{t("Preservar 2 anos")}</SelectItem></SelectContent></Select><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> {t("Limpar parte antiga")}</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t("Apagar o Histórico anterior ao período escolhido?")}</AlertDialogTitle><AlertDialogDescription>{t(`Rolagens, notas e referências de regras com mais de ${historyDays} dias serão excluídas. Arquivos, participantes e tudo o que for mais recente ficam preservados. Exporte o Histórico primeiro se quiser guardar uma cópia.`, `Rolls, notes and rule references older than ${historyDays} days will be deleted. Files, participants and everything newer are preserved. Export history first if you want to keep a copy.`)}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { const result = await roomStore.clearOldHistory(Date.now() - Number(historyDays) * 86_400_000); toast.success(result.removed ? t(result.removed === 1 ? `1 item removido. Cerca de ${formatStorageBytes(result.bytesFreed)} foram liberados.` : `${result.removed} itens removidos. Cerca de ${formatStorageBytes(result.bytesFreed)} foram liberados.`, result.removed === 1 ? `1 entry removed. About ${formatStorageBytes(result.bytesFreed)} was freed.` : `${result.removed} entries removed. About ${formatStorageBytes(result.bytesFreed)} was freed.`) : t("Não havia itens antigos nesse período.")); })}>{t("Apagar parte antiga")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
          {activeFiles.length > 0 && <div className="storage-server-files"><p>{t("Arquivos nesta página do Histórico")}</p>{activeFiles.map((entry) => { const file = entry.data as RoomFileData; const canDelete = activeRoom.self.role === "gm" || entry.actor.id === activeRoom.self.id; return <div key={entry.id}><span><b>{file.name}</b><small>{formatStorageBytes(file.size)}</small></span><Button type="button" variant="ghost" size="sm" onClick={() => void roomStore.downloadFile(entry).catch((error) => toast.error(error instanceof Error ? error.message : t("O arquivo não pôde ser exportado.")))}><Download /> {t("Exportar")}</Button>{canDelete && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t(`Excluir ${file.name}`, "Delete " + String(file.name) + "")}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t(`Excluir “${file.name}”?`, `Delete “${file.name}”?`)}</AlertDialogTitle><AlertDialogDescription>{t("O arquivo e sua entrada no Histórico serão apagados. Os outros arquivos, as Fichas e as regras continuam intactos.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { const result = await roomStore.deleteFile(entry); toast.success(result.cleanupPending ? t("A entrada foi removida. O arquivo ainda está sendo apagado e isso termina sozinho.") : t("Arquivo excluído.")); })}>{t("Excluir arquivo")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>; })}</div>}
          {activeRoom.self.role === "gm" && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> {t("Excluir esta Mesa")}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(`Excluir “${activeRoom.room.name}” por completo?`, `Delete “${activeRoom.room.name}” completely?`)}</AlertDialogTitle><AlertDialogDescription>{t("Participantes, Histórico, referências e todos os arquivos desta Mesa serão apagados. Fichas e regras deste dispositivo continuam intactas. Exporte o que quiser guardar: esta ação não pode ser desfeita.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { const result = await roomStore.deleteCurrentRoom(); toast.success(result.cleanupPending ? t("Mesa excluída. Alguns arquivos ainda estão sendo apagados; isso termina sozinho.") : t("Mesa e arquivos excluídos.")); })}>{t("Excluir Mesa")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        </>}
      </section>

      <section className="storage-action-section compact storage-cleanup-section">
        <header>
          <div><p className="eyebrow">{t("Regenerável ou temporário")}</p><h3>{t("O que é seguro limpar")}</h3></div>
          <span className="storage-safety-badge"><ShieldCheck aria-hidden="true" /> {t("Sem apagar seu jogo")}</span>
        </header>
        <p className="storage-cleanup-intro">{t("Aqui ficam apenas dados que a ferramenta pode refazer ou dos quais já existe uma cópia segura. Esta limpeza não apaga Fichas, imagens, regras, acesso às Mesas nem dados compartilhados.")}</p>
        <div className="storage-cleanup-grid">
          <article className="storage-cleanup-item">
            <span className="storage-cleanup-icon"><Eraser aria-hidden="true" /></span>
            <div><b>{t("Cache regenerável")}</b><small>{t("Arquivos de apoio que o navegador cria novamente quando precisar.")}</small></div>
            <Button type="button" variant="outline" disabled={working} onClick={() => void run(async () => { const count = await clearRegenerableCaches(); toast.success(count ? t(`${count} cache(s) regenerável(is) removido(s).`, "" + String(count) + " rebuildable caches removed.") : t("Não havia caches regeneráveis.")); })}>{t("Limpar cache")}</Button>
          </article>
          <article className="storage-cleanup-item">
            <span className="storage-cleanup-icon"><Eraser aria-hidden="true" /></span>
            <div><b>{t("Temporários já confirmados")}</b><small>{t("Cópias de segurança que já foram confirmadas; uma recuperação pendente fica protegida.")}</small></div>
            <Button type="button" variant="outline" disabled={working} onClick={() => void run(() => { const result = removeFateTemporaryData(); toast.success(result.removed ? t(`${result.removed} gravação(ões) temporária(s) já confirmada(s) removida(s).`, "" + String(result.removed) + " confirmed temporary writes removed.") : result.preserved ? t("Uma recuperação pendente foi preservada porque ainda não há cópia confirmada igual.") : t("Não havia dados temporários redundantes.")); })}>{t("Limpar temporários")}</Button>
          </article>
          <article className="storage-cleanup-item">
            <span className="storage-cleanup-icon"><Trash2 aria-hidden="true" /></span>
            <div><b>{t("Rolagens deste navegador")}</b><small>{t("Histórico local do botão Dados; não mexe no Histórico compartilhado de nenhuma Mesa.")}</small></div>
            <Button type="button" variant="outline" disabled={working} onClick={() => void run(() => { const bytes = clearLocalRollHistory(); toast.success(bytes ? t(`Histórico local de dados limpo; cerca de ${formatStorageBytes(bytes)} liberados.`, "Local dice history cleared; approximately " + String(formatStorageBytes(bytes)) + " freed.") : t("Não havia rolagens locais guardadas.")); })}>{t("Limpar rolagens")}</Button>
          </article>
        </div>
        <p className="storage-cleanup-preserved"><ShieldCheck aria-hidden="true" /> {t("Se quiser remover algo permanente, a própria tela sempre pede confirmação e informa exatamente o que será afetado.")}</p>
      </section>
    </div>
  );
}
