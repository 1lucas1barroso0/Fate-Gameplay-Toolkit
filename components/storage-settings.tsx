"use client";

import * as React from "react";
import { BookOpen, Database, Download, Eraser, FileText, HardDrive, Image as ImageIcon, RefreshCw, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
      toast.error(error instanceof Error ? error.message : "A ação não pôde ser concluída. Nada anterior foi descartado.");
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
      rememberedRooms: roomStore.savedRooms.map((room) => ({
        roomCode: room.session.roomCode,
        roomName: room.roomName,
        selfName: room.selfName,
        role: room.role,
        rulesProfileId: room.rulesProfileId,
      })),
      note: "Credenciais privadas das Mesas não entram neste arquivo. Exporte o Histórico dentro de cada Mesa.",
    });
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
      <section className="storage-overview" data-state={report?.state ?? "normal"}>
        <div className="storage-overview-heading"><HardDrive /><div><b>Armazenamento deste dispositivo</b><span>{report ? `${formatStorageBytes(report.usage)} usados${report.quota ? ` de aproximadamente ${formatStorageBytes(report.quota)}` : ""}` : "Medindo…"}</span></div><strong>{report?.state === "critical" ? "Crítico" : report?.state === "attention" ? "Atenção" : "Normal"}</strong></div>
        {report?.quota && <progress max={report.quota} value={report.usage} aria-label="Uso estimado do armazenamento local" />}
        <p>{percentage === null ? "Este navegador não informa uma quota total. As categorias abaixo ainda mostram o que a ferramenta consegue medir." : `${percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da quota estimada pelo navegador.`} A decomposição é aproximada: o navegador inclui índices, caches e sobrecarga interna no total.</p>
        <div className="storage-overview-actions"><Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void refresh()}><RefreshCw /> Medir novamente</Button>{report?.persisted === false && <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => void run(async () => { const result = await requestPersistentStorage(); toast[result.persisted ? "success" : "info"](result.persisted ? "O navegador aceitou proteger estes dados contra limpeza automática." : result.supported ? "O navegador não concedeu armazenamento persistente. Seus dados continuam utilizáveis e exportáveis." : "Este navegador não oferece armazenamento persistente."); })}><ShieldCheck /> Pedir proteção ao navegador</Button>}</div>
      </section>

      <div className="storage-breakdown" aria-label="Estimativa por categoria">
        {CATEGORY_LABELS.map(([key, label, Icon]) => <div key={key}><Icon /><span>{label}<small>Estimativa local</small></span><b>{formatStorageBytes(report?.breakdown[key] ?? 0)}</b></div>)}
      </div>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">Antes de limpar</p><h3>Leve uma cópia completa</h3></div><Button type="button" disabled={working} onClick={() => void run(async () => { await exportEverythingLocal(); toast.success("Fichas e regras exportadas."); })}><Download /> Exportar Fichas e regras</Button></header>
        <p>O arquivo inclui as imagens das Fichas somente no momento da exportação. Credenciais privadas e o Histórico das Mesas ficam fora; exporte cada Histórico na própria Mesa.</p>
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">Escolha exatamente</p><h3>Fichas deste dispositivo</h3></div><span>{characterStore.characters.length}</span></header>
        <div className="storage-select-list">{characterStore.characters.map((character) => <div key={character.id}><Checkbox id={`storage-sheet-${character.id}`} checked={selectedSheets.has(character.id)} onCheckedChange={(checked) => toggle(setSelectedSheets, character.id, checked === true)} /><label htmlFor={`storage-sheet-${character.id}`}><span><b>{character.name || "Ficha sem nome"}</b><small>{formatStorageBytes(approximateJsonBytes(character))} em texto e referências</small></span></label><Button type="button" variant="ghost" size="sm" onClick={() => void run(async () => { await exportSheets(new Set([character.id])); toast.success("Ficha exportada com sua imagem."); })}><Download /> Exportar</Button></div>)}</div>
        <div className="storage-safe-actions"><Button type="button" variant="outline" disabled={working} onClick={() => void run(async () => { const result = await characterStore.cleanupUnusedImages(); toast.success(result.removed ? `${result.removed} imagem(ns) sem referência removida(s), liberando cerca de ${formatStorageBytes(result.bytes)}.` : "Nenhuma imagem sem uso foi encontrada."); })}><ImageIcon /> Remover imagens não utilizadas</Button>{selectedSheets.size > 0 && <><Button type="button" variant="outline" onClick={() => void run(async () => { await exportSheets(selectedSheets); toast.success("Fichas escolhidas exportadas."); })}><Download /> Exportar escolhidas</Button><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> Apagar escolhidas</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Apagar {selectedSheets.size} Ficha(s)?</AlertDialogTitle><AlertDialogDescription>As Fichas escolhidas sairão deste dispositivo. Aproximadamente {formatStorageBytes(sheetDeleteBytes)} de texto e referências serão liberados; imagens ainda exigidas pela cópia recuperável serão preservadas. As outras Fichas, regras e Mesas não serão alteradas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { characterStore.deleteCharacters(selectedSheets); setSelectedSheets(new Set()); toast.success("Fichas escolhidas apagadas."); })}>Apagar Fichas</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>}</div>
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">Perfis locais</p><h3>Conjuntos de regras</h3></div><span>{tableStore.profiles.length}</span></header>
        <div className="storage-select-list">{tableStore.profiles.map((profile) => <div key={profile.id}><Checkbox id={`storage-profile-${profile.id}`} checked={selectedProfiles.has(profile.id)} onCheckedChange={(checked) => toggle(setSelectedProfiles, profile.id, checked === true)} /><label htmlFor={`storage-profile-${profile.id}`}><span><b>{profile.config.profileName}</b><small>{formatStorageBytes(approximateJsonBytes(profile))} estimados</small></span></label><Button type="button" variant="ghost" size="sm" onClick={() => safeJsonDownload(`${profile.config.profileName}.regras-fate.json`, profile.config)}><Download /> Exportar</Button></div>)}</div>
        {selectedProfiles.size > 0 && <div className="storage-safe-actions"><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> Apagar regras escolhidas</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Apagar os conjuntos escolhidos?</AlertDialogTitle><AlertDialogDescription>Aproximadamente {formatStorageBytes(profileDeleteBytes)} serão liberados. Pelo menos um conjunto será preservado; Fichas e Mesas vinculadas passarão a usar o conjunto restante. Nenhuma Ficha ou Mesa será apagada.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(() => { const result = onDeleteProfiles([...selectedProfiles]); setSelectedProfiles(new Set()); toast.success(result.removedIds.length ? `${result.removedIds.length} conjunto(s) apagado(s).` : "O último conjunto foi preservado."); })}>Apagar conjuntos</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">Somente neste navegador</p><h3>Mesas lembradas</h3></div><span>{roomStore.savedRooms.length}</span></header>
        <div className="storage-select-list">{roomStore.savedRooms.map((room) => <div key={room.session.participantId}><Checkbox id={`storage-room-${room.session.participantId}`} checked={selectedRooms.has(room.session.participantId)} onCheckedChange={(checked) => toggle(setSelectedRooms, room.session.participantId, checked === true)} /><label htmlFor={`storage-room-${room.session.participantId}`}><span><b>{room.roomName || `Mesa ${room.session.roomCode}`}</b><small>{room.session.roomCode} · esquecer não apaga o servidor</small></span></label></div>)}</div>
        {selectedRooms.size > 0 && <div className="storage-safe-actions"><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline"><Eraser /> Esquecer escolhidas</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Esquecer {selectedRooms.size} Mesa(s) neste dispositivo?</AlertDialogTitle><AlertDialogDescription>As credenciais locais escolhidas serão removidas, liberando aproximadamente {formatStorageBytes(roomDeleteBytes)}. Nada será apagado do servidor. Para excluir uma Mesa e seus arquivos, entre nela como narrador e use “Excluir Mesa inteira”.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => void run(() => { for (const id of selectedRooms) roomStore.forgetRoom(id); setSelectedRooms(new Set()); toast.success("Mesas escolhidas esquecidas neste dispositivo."); })}>Esquecer Mesas</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
      </section>

      <section className="storage-action-section">
        <header><div><p className="eyebrow">Vercel Blob e Neon</p><h3>Dados da Mesa no servidor</h3></div>{activeRoom && <span>{activeRoom.room.name}</span>}</header>
        {!activeRoom ? <p>Abra uma Mesa para medir, exportar ou excluir os dados dela no servidor. Nada é carregado em segundo plano enquanto as Mesas estão fechadas.</p> : <>
          <div className="server-storage-summary"><b>{formatStorageBytes(activeRoom.storage.files.usedBytes)} usados de {formatStorageBytes(activeRoom.storage.files.limitBytes)} em arquivos</b><span>{activeRoom.storage.files.count} de {activeRoom.storage.files.maxCount} arquivos · {formatStorageBytes(activeRoom.storage.history.usedBytes)} em Histórico textual</span></div>
          <div className="storage-safe-actions"><Button type="button" variant="outline" onClick={() => void run(async () => { await roomStore.exportHistory(); toast.success("Histórico completo exportado."); })}><Download /> Exportar Histórico</Button>{activeRoom.self.role === "gm" && <Button type="button" variant="outline" onClick={() => void run(async () => { const result = await roomStore.cleanupOrphanFiles(); toast.success(result.found ? `${result.removed} arquivo(s) órfão(s) removido(s).` : "Nenhum arquivo órfão antigo foi encontrado."); })}><RefreshCw /> Remover órfãos</Button>}</div>
          {activeRoom.self.role === "gm" && <div className="storage-history-cleanup"><div><b>Limpeza opcional do Histórico</b><span>Hoje ele ocupa {formatStorageBytes(activeRoom.storage.history.usedBytes)}. A limpeza pode liberar até esse valor; o servidor mede o total exato apagado.</span></div><Select value={historyDays} onValueChange={setHistoryDays}><SelectTrigger aria-label="Período de Histórico a preservar"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="90">Preservar 90 dias</SelectItem><SelectItem value="180">Preservar 180 dias</SelectItem><SelectItem value="365">Preservar 1 ano</SelectItem><SelectItem value="730">Preservar 2 anos</SelectItem></SelectContent></Select><AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> Limpar parte antiga</Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Apagar o Histórico anterior ao período escolhido?</AlertDialogTitle><AlertDialogDescription>Rolagens, notas e referências de regras anteriores a {historyDays} dias serão excluídas. Arquivos, participantes e tudo que for mais recente serão preservados. Exporte o Histórico primeiro se quiser conservar uma cópia.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { const result = await roomStore.clearOldHistory(Date.now() - Number(historyDays) * 86_400_000); toast.success(result.removed ? `${result.removed} item(ns) removido(s), liberando cerca de ${formatStorageBytes(result.bytesFreed)}.` : "Não havia itens antigos nesse período."); })}>Apagar parte antiga</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
          {activeFiles.length > 0 && <div className="storage-server-files"><p>Arquivos na página atual do Histórico</p>{activeFiles.map((entry) => { const file = entry.data as RoomFileData; const canDelete = activeRoom.self.role === "gm" || entry.actor.id === activeRoom.self.id; return <div key={entry.id}><span><b>{file.name}</b><small>{formatStorageBytes(file.size)}</small></span><Button type="button" variant="ghost" size="sm" onClick={() => void roomStore.downloadFile(entry).catch((error) => toast.error(error instanceof Error ? error.message : "O arquivo não pôde ser exportado."))}><Download /> Exportar</Button>{canDelete && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${file.name}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Excluir “{file.name}”?</AlertDialogTitle><AlertDialogDescription>O registro e o Blob real serão removidos. Os outros arquivos, o Histórico, as Fichas e as regras serão preservados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { const result = await roomStore.deleteFile(entry); toast.success(result.cleanupPending ? "Registro removido; a exclusão física continuará automaticamente." : "Arquivo excluído por completo."); })}>Excluir arquivo</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div>; })}</div>}
          {activeRoom.self.role === "gm" && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="destructive-outline"><Trash2 /> Excluir esta Mesa do servidor</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir “{activeRoom.room.name}” por completo?</AlertDialogTitle><AlertDialogDescription>Participantes, Histórico, referências e todos os Blobs desta Mesa serão removidos. Fichas e regras locais permanecem. Exporte antes: esta ação é irreversível.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void run(async () => { const result = await roomStore.deleteCurrentRoom(); toast.success(result.cleanupPending ? "Mesa excluída; a limpeza física continuará automaticamente." : "Mesa e arquivos excluídos por completo."); })}>Excluir Mesa</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        </>}
      </section>

      <section className="storage-action-section compact">
        <header><div><p className="eyebrow">Regenerável ou temporário</p><h3>Limpeza segura</h3></div></header>
        <div className="storage-safe-actions"><Button type="button" variant="outline" disabled={working} onClick={() => void run(async () => { const count = await clearRegenerableCaches(); toast.success(count ? `${count} cache(s) regenerável(is) removido(s).` : "Não havia caches regeneráveis."); })}><Eraser /> Limpar caches</Button><Button type="button" variant="outline" disabled={working} onClick={() => void run(() => { const result = removeFateTemporaryData(); toast.success(result.removed ? `${result.removed} gravação(ões) temporária(s) já confirmada(s) removida(s).` : result.preserved ? "Uma recuperação pendente foi preservada porque ainda não há cópia confirmada igual." : "Não havia dados temporários redundantes."); })}><Eraser /> Limpar temporários confirmados</Button><Button type="button" variant="outline" disabled={working} onClick={() => void run(() => { const bytes = clearLocalRollHistory(); toast.success(bytes ? `Histórico local de dados limpo; cerca de ${formatStorageBytes(bytes)} liberados.` : "Não havia rolagens locais guardadas."); })}><Trash2 /> Limpar rolagens locais</Button></div>
        <p>Caches voltam a ser criados quando necessários. Fichas, imagens, regras, credenciais de Mesas e dados do servidor são preservados por estas três ações.</p>
      </section>
    </div>
  );
}
