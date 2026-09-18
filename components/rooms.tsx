"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { t, useAppLanguage, getAppLanguage } from "@/lib/app-language";
const ScenePanel = dynamic(() => import("@/components/scene-panel").then(module => module.ScenePanel));

function OptionalScene({ store }: { store: RoomStore }) {
  useAppLanguage();
  const [open, setOpen] = React.useState(false);
  return <details className="optional-scene" onToggle={event => setOpen(event.currentTarget.open)}><summary>{t("Cena da Mesa · opcional", "Table scene · optional")}</summary>{open && store.session && <ScenePanel key={store.session.participantId} session={store.session} canEdit={store.snapshot?.self.role === "gm" && store.snapshot.self.status === "approved"} />}</details>;
}
import { useRoomDraft } from "@/lib/use-room-draft";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock3,
  Copy,
  Dices,
  Download,
  DoorOpen,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileJson,
  FileText,
  History,
  Loader2,
  LogOut,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  StickyNote,
  Trash2,
  UserRoundCheck,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrphanCleanupDialog } from "@/components/orphan-cleanup-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adjectiveFor, fateSymbol } from "@/lib/fate";
import type { RulesProfile } from "@/lib/rules-profiles";
import { MAX_ROOM_FILES_PER_UPLOAD, type RoomEntry, type RoomFileData, type RoomRollData, type RoomRuleData } from "@/lib/room-contracts";
import type { RoomStore } from "@/lib/use-room";
import { formatStorageBytes } from "@/lib/storage-policy";

const dateTime = () => new Intl.DateTimeFormat(getAppLanguage() === "pt" ? "pt-BR" : "en-US", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
  return Promise.resolve();
}

function EntryIcon({ type }: { type: RoomEntry["type"] }) {
  useAppLanguage();
  if (type === "roll") return <Dices aria-hidden="true" />;
  if (type === "rule") return <BookOpen aria-hidden="true" />;
  if (type === "file") return <Paperclip aria-hidden="true" />;
  return <StickyNote aria-hidden="true" />;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(getAppLanguage() === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(getAppLanguage() === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 })} MB`;
}

function FileKindIcon({ file }: { file: RoomFileData }) {
  useAppLanguage();
  if (file.contentType.startsWith("image/")) return <FileImage aria-hidden="true" />;
  if (file.contentType.startsWith("audio/")) return <FileAudio aria-hidden="true" />;
  if (file.contentType.includes("json") || file.name.toLocaleLowerCase("pt-BR").endsWith(".json")) return <FileJson aria-hidden="true" />;
  return <FileIcon aria-hidden="true" />;
}

function RoomEntryView({ entry, onOpenRule, onDownloadFile, onDeleteFile, canDeleteFile }: { entry: RoomEntry; onOpenRule: (reference: string) => void; onDownloadFile: (entry: RoomEntry) => Promise<void>; onDeleteFile: (entry: RoomEntry) => Promise<{ deleted: boolean; bytesFreed: number; cleanupPending: boolean }>; canDeleteFile: boolean }) {
  useAppLanguage();
  const roll = entry.type === "roll" ? entry.data as RoomRollData : null;
  const rule = entry.type === "rule" ? entry.data as RoomRuleData : null;
  const file = entry.type === "file" ? entry.data as RoomFileData : null;
  const validRoll = roll && Array.isArray(roll.dice) && roll.dice.length === 4 && Number.isInteger(roll.total);

  return (
    <li className="room-entry" data-entry-type={entry.type}>
      <div className="room-entry-icon"><EntryIcon type={entry.type} /></div>
      <div className="room-entry-content">
        <header>
          <b>{entry.actor.name}</b>
          <span>{entry.type === "roll" ? t("rolou") : entry.type === "rule" ? t("consultou") : entry.type === "file" ? t("compartilhou") : t("anotou")}</span>
          <time dateTime={new Date(entry.createdAt).toISOString()}>{dateTime().format(entry.createdAt)}</time>
        </header>
        {validRoll ? (
          <div className="room-roll-result">
            <span className="room-dice">{roll.dice.map(fateSymbol).join(" ")}</span>
            <span>{roll.modifier >= 0 ? `+${roll.modifier}` : roll.modifier}</span>
            <strong>= {roll.total >= 0 ? `+${roll.total}` : roll.total}</strong>
            <small>{adjectiveFor(roll.total, getAppLanguage())}</small>
            <p>{entry.body}</p>
          </div>
        ) : entry.type === "rule" && rule?.reference ? (
          <Button className="room-rule-link" variant="outline" onClick={() => onOpenRule(rule.reference)}>
            <BookOpen /> {entry.body}
          </Button>
        ) : entry.type === "file" && file?.name ? (
          <div className="room-file-actions">
            <Button className="room-file-link" variant="outline" onClick={() => void onDownloadFile(entry).catch((error) => toast.error(error instanceof Error ? error.message : t("O arquivo não pôde ser aberto.")))}>
              <FileKindIcon file={file} />
              <span><b>{file.name}</b><small>{formatFileSize(file.size)}</small></span>
              <Download aria-hidden="true" />
            </Button>
            {canDeleteFile && <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t(`Excluir ${file.name}`, "Delete " + String(file.name) + "")}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t("Excluir este arquivo?")}</AlertDialogTitle><AlertDialogDescription>“{file.name}{t("” será removido desta Mesa e do armazenamento de arquivos. Fichas, regras e os outros itens do Histórico serão preservados.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onDeleteFile(entry).then((result) => toast.success(result.cleanupPending ? t("Arquivo retirado da Mesa; a remoção física continuará automaticamente.") : t("Arquivo excluído por completo."))).catch((error) => toast.error(error instanceof Error ? error.message : t("O arquivo não foi excluído.")))}>{t("Excluir arquivo")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
          </div>
        ) : (
          <p className="room-note-body">{entry.body}</p>
        )}
      </div>
    </li>
  );
}

function RoomOnboarding({ store, rulesProfiles, activeRulesProfileId, onSelectRulesProfile, onOpenRulesProfile }: { store: RoomStore; rulesProfiles: RulesProfile[]; activeRulesProfileId: string; onSelectRulesProfile: (profileId: string) => void; onOpenRulesProfile: (profileId: string) => void }) {
  useAppLanguage();
  const [roomName, setRoomName] = React.useState("");
  const [creatorName, setCreatorName] = React.useState("");
  const [roomCode, setRoomCode] = React.useState("");
  const [playerName, setPlayerName] = React.useState("");
  const [opening, setOpening] = React.useState("");
  const [rulesProfileId, setRulesProfileId] = React.useState(activeRulesProfileId);
  const selectedRulesProfileId = rulesProfiles.some((profile) => profile.id === rulesProfileId)
    ? rulesProfileId
    : activeRulesProfileId;

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomName.trim() || !creatorName.trim()) return toast.error(t("Dê um nome à Mesa e diga como quer ser chamado."));
    try {
      await store.create(roomName.trim(), creatorName.trim(), selectedRulesProfileId);
      toast.success(t("Mesa criada. O narrador já está dentro."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("A Mesa não foi criada."));
    }
  };

  const openSaved = async (participantId: string) => {
    setOpening(participantId);
    try {
      const saved = store.savedRooms.find((room) => room.session.participantId === participantId);
      if (saved?.rulesProfileId) onSelectRulesProfile(saved.rulesProfileId);
      await store.switchRoom(participantId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("A Mesa não pôde ser aberta."));
    } finally {
      setOpening("");
    }
  };

  const joinRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (roomCode.length !== 6 || !playerName.trim()) return toast.error(t("Informe o código de 6 caracteres e como quer ser chamado."));
    try {
      await store.join(roomCode, playerName.trim(), selectedRulesProfileId);
      toast.success(t("Pedido enviado ao narrador."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Não foi possível entrar."));
    }
  };

  return (
    <div className="room-home" data-has-saved={store.savedRooms.length > 0}>
      {store.savedRooms.length > 0 && (
        <section className="saved-rooms" aria-labelledby="saved-rooms-heading">
          <header><div><p className="eyebrow">{t("Neste dispositivo")}</p><h2 id="saved-rooms-heading">{t("Minhas Mesas")}</h2></div><span>{store.savedRooms.length} {store.savedRooms.length === 1 ? "guardada" : "guardadas"}</span></header>
          <div>{store.savedRooms.map((saved) => { const linkedProfile = rulesProfiles.find((profile) => profile.id === saved.rulesProfileId); return <article key={saved.session.participantId}><div><b>{saved.roomName || t(`Mesa ${saved.session.roomCode}`, "Table " + String(saved.session.roomCode) + "")}</b><span>{saved.selfName || t("Sua entrada")} · {saved.role === "gm" ? t("Narrador") : saved.role === "player" ? t("Jogador") : "Participante"}</span><span className="saved-room-rules"><BookOpen /> {linkedProfile?.config.profileName || t("Fate Condensado")}</span><code>{saved.session.roomCode}</code></div><div className="saved-room-actions"><Button type="button" variant="outline" disabled={opening === saved.session.participantId} onClick={() => void openSaved(saved.session.participantId)}><DoorOpen /> {opening === saved.session.participantId ? t("Abrindo…") : t("Abrir")}</Button>{linkedProfile && <Button type="button" variant="ghost" size="icon-sm" aria-label={t(`Abrir regras ${linkedProfile.config.profileName}`, "Open rules " + String(linkedProfile.config.profileName) + "")} onClick={() => onOpenRulesProfile(linkedProfile.id)}><BookOpen /></Button>}<AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={t(`Esquecer ${saved.roomName || saved.session.roomCode}`, "Forget " + String(saved.roomName || saved.session.roomCode) + "")}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{t("Esquecer esta Mesa neste dispositivo?")}</AlertDialogTitle><AlertDialogDescription>{t("A credencial local será removida. O histórico compartilhado da Mesa não será apagado.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction onClick={() => store.forgetRoom(saved.session.participantId)}>{t("Esquecer")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></article>; })}</div>
        </section>
      )}

      <div className="room-onboarding">
        <div className="room-invitation">
          <Users aria-hidden="true" />
          <p className="eyebrow">{t("Juntos, a história vai mais longe")}</p>
          <h2>{t("Uma Mesa.")}<br /> {t("Muitas possibilidades.")}</h2>
          <p>{t("Reúna seu grupo e compartilhe as rolagens, as descobertas e os próximos capítulos.")}</p>
        </div>
      <Tabs defaultValue="join">
        <TabsList>
          <TabsTrigger value="join"><DoorOpen /> {t("Entrar como jogador")}</TabsTrigger>
          <TabsTrigger value="create"><ShieldCheck /> {t("Criar como narrador")}</TabsTrigger>
        </TabsList>
        <TabsContent value="join">
          <form onSubmit={joinRoom} className="room-form room-form-join">
            <Label className="field-stack">
              <span>{t("Código da Mesa")}</span>
              <Input
                className="room-code-input"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "").slice(0, 6))}
                autoComplete="off"
                autoCapitalize="characters"
                inputMode="text"
                maxLength={6}
              />
            </Label>
            <Label className="field-stack">
              <span>{t("Como quer ser chamado")}</span>
              <Input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={60} autoComplete="name" />
            </Label>
            <Label className="field-stack"><span>{t("Regras desta Mesa")}</span><Select value={selectedRulesProfileId} onValueChange={setRulesProfileId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rulesProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.config.profileName}</SelectItem>)}</SelectContent></Select></Label>
            <Button type="submit" size="lg" disabled={store.busy}>
              {store.busy ? <Loader2 className="animate-spin" /> : <UserRoundCheck />} {t("Pedir para entrar")}</Button>
          </form>
        </TabsContent>
        <TabsContent value="create">
          <form onSubmit={createRoom} className="room-form room-form-create">
            <Label className="field-stack">
              <span>{t("Nome da Mesa")}</span>
              <Input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={80} />
            </Label>
            <Label className="field-stack">
              <span>{t("Como quer ser chamado")}</span>
              <Input value={creatorName} onChange={(event) => setCreatorName(event.target.value)} maxLength={60} autoComplete="name" />
            </Label>
            <Label className="field-stack"><span>{t("Regras desta Mesa")}</span><Select value={selectedRulesProfileId} onValueChange={setRulesProfileId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rulesProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.config.profileName}</SelectItem>)}</SelectContent></Select></Label>
            <Button type="submit" size="lg" disabled={store.busy}>
              {store.busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {t("Criar Mesa")}</Button>
          </form>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

export function Rooms({
  store,
  onOpenRule,
  rulesProfiles,
  activeRulesProfileId,
  onSelectRulesProfile,
  onOpenRulesProfile,
  onOpenSheets,
  onOpenDice,
}: {
  store: RoomStore;
  onOpenRule: (reference: string) => void;
  rulesProfiles: RulesProfile[];
  activeRulesProfileId: string;
  onSelectRulesProfile: (profileId: string) => void;
  onOpenRulesProfile: (profileId: string) => void;
  onOpenSheets: () => void;
  onOpenDice: () => void;
}) {
  useAppLanguage();
  const draft = useRoomDraft(store.session?.participantId ?? "");
  const note = draft.text;
  const [posting, setPosting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | RoomEntry["type"]>("all");
  const [query, setQuery] = React.useState("");
  const [historyDays, setHistoryDays] = React.useState("365");
  const fileInput = React.useRef<HTMLInputElement>(null);
  const savedRoom = store.savedRooms.find((room) => room.session.participantId === store.session?.participantId);
  const linkedProfile = rulesProfiles.find((profile) => profile.id === savedRoom?.rulesProfileId)
    ?? rulesProfiles.find((profile) => profile.id === activeRulesProfileId)
    ?? rulesProfiles[0];
  const linkRulesProfile = store.linkRulesProfile;

  React.useEffect(() => {
    if (store.session && savedRoom && !savedRoom.rulesProfileId && linkedProfile) {
      linkRulesProfile(store.session.participantId, linkedProfile.id);
    }
  }, [linkRulesProfile, linkedProfile, savedRoom, store.session]);

  if (!store.hydrated) {
    return <section className="workspace-panel loading-panel"><Loader2 className="animate-spin" /> {t("Preparando as Mesas…")}</section>;
  }

  if (!store.session) {
    return (
      <section className="workspace-panel rooms-workspace" aria-labelledby="rooms-heading">
        <header className="workspace-toolbar rooms-landing-toolbar">
          <div><p className="eyebrow">{t("Jogo em grupo")}</p><h1 id="rooms-heading">{t("Mesas")}</h1><p>{t("Crie, entre e volte às suas Mesas.")}</p></div>
        </header>
        <RoomOnboarding store={store} rulesProfiles={rulesProfiles} activeRulesProfileId={activeRulesProfileId} onSelectRulesProfile={onSelectRulesProfile} onOpenRulesProfile={onOpenRulesProfile} />
      </section>
    );
  }

  if (!store.snapshot) {
    return (
      <section className="workspace-panel room-waiting">
        {store.error ? <WifiOff /> : <Loader2 className="animate-spin" />}
        <h1>{store.error ? t("A Mesa não respondeu") : t("Abrindo a Mesa")}</h1>
        <p>{store.error || t("Buscando o estado mais recente da mesa…")}</p>
        <div className="inline-actions">
          <Button variant="outline" onClick={() => void store.refresh().catch(() => undefined)}><RefreshCw /> {t("Tentar de novo")}</Button>
          <Button variant="ghost" onClick={store.closeRoom}><ArrowLeft /> {t("Voltar")}</Button>
        </div>
      </section>
    );
  }

  const { room, self, participants, entries } = store.snapshot;
  const roomStorage = store.snapshot.storage;

  if (self.status !== "approved") {
    return (
      <section className="workspace-panel room-waiting">
        {self.status === "pending" ? <Clock3 /> : <X />}
        <p className="eyebrow">{room.name} · {room.code}</p>
        <h1>{self.status === "pending" ? t("Aguardando o narrador") : t("Entrada não aprovada")}</h1>
        <p>{self.status === "pending" ? t("Seu pedido chegou. Você entra assim que o narrador aprovar.") : t("O narrador não aprovou sua entrada. Volte para pedir novamente.")}</p>
        {store.error && <p className="room-sync-error"><WifiOff /> {store.error}</p>}
        <Button variant="outline" onClick={store.leave}><ArrowLeft /> {t("Sair desta espera")}</Button>
      </section>
    );
  }

  const pending = participants.filter((participant) => participant.status === "pending");
  const approved = participants.filter((participant) => participant.status === "approved");
  const cleanedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleEntries = entries.filter((entry) => {
    if (filter !== "all" && entry.type !== filter) return false;
    if (!cleanedQuery) return true;
    return `${entry.actor.name} ${entry.body}`.toLocaleLowerCase("pt-BR").includes(cleanedQuery);
  });

  const publishNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim() || posting || !draft.ready || !store.roomReady) return;
    const submitted = note;
    setPosting(true);
    try {
      await store.postNote(submitted.trim());
      draft.acknowledge(submitted);
      toast.success(t("Nota publicada para a mesa."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("A nota não foi publicada."));
    } finally {
      setPosting(false);
    }
  };

  const decide = async (participantId: string, status: "approved" | "rejected") => {
    try {
      await store.decide(participantId, status);
      toast.success(status === "approved" ? t("Entrada aprovada.") : t("Pedido recusado."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("A decisão não foi salva."));
    }
  };

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length || uploading) return;
    if (selected.length > MAX_ROOM_FILES_PER_UPLOAD) {
      return toast.error(t(`Escolha até ${MAX_ROOM_FILES_PER_UPLOAD} arquivos por vez.`, "Choose up to " + String(MAX_ROOM_FILES_PER_UPLOAD) + " files at a time."));
    }
    setUploading(true);
    let published = 0;
    try {
      for (const file of selected) {
        await store.postFile(file);
        published += 1;
      }
      toast.success(published === 1 ? t("Arquivo publicado na Mesa.") : t(`${published} arquivos publicados na Mesa.`, "" + String(published) + " files shared at the table."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("O arquivo não foi publicado."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="workspace-panel rooms-workspace" aria-labelledby="active-room-heading">
      <OptionalScene store={store} />
      <header className="workspace-toolbar room-toolbar">
        <div>
          <p className="eyebrow">{t("Mesa ativa")}</p>
          <h1 id="active-room-heading">{room.name}</h1>
          <p>{self.role === "gm" ? t("Você narra esta Mesa.") : t("Você joga nesta Mesa.")} {t("O que for publicado aqui fica disponível para todos os seus integrantes.")}</p>
        </div>
        <div className="room-toolbar-actions">
          <div className="room-code-box">
            <small>{t("Código")}</small><strong>{room.code}</strong>
            <Button size="icon-sm" variant="ghost" aria-label={t("Copiar código da Mesa")} onClick={() => void copyText(room.code).then(() => toast.success(t("Código copiado."))).catch(() => toast.error(t("Não foi possível copiar.")))}><Copy /></Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={store.closeRoom}><ArrowLeft /> {t("Minhas Mesas")}</Button>
        </div>
      </header>

      <div className="room-connection" role="status" data-state={store.connection}>
        <span>{({ connecting: t("Atualizando a Mesa…"), synced: t("Mesa atualizada"), retrying: t("Tentando reconectar…"), offline: t("Sem conexão. Seu rascunho continua aqui."), paused: t("Atualização pausada enquanto esta aba está em segundo plano.") })[store.connection]}{store.lastSyncedAt && store.connection === "synced" ? ` · ${new Date(store.lastSyncedAt).toLocaleTimeString(getAppLanguage() === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        {store.connection === "retrying" && <Button variant="outline" size="sm" onClick={() => void store.refresh()}>{t("Tentar agora")}</Button>}
      </div>
      <nav className="room-quick-actions" aria-label={t("Abrir recursos da Mesa")}>
        <Button type="button" variant="outline" className="room-quick-action" onClick={onOpenSheets}>
          <FileText aria-hidden="true" /><span><b>{t("Fichas")}</b><small>{t("Abrir")}</small></span>
        </Button>
        <Button type="button" variant="outline" className="room-quick-action" onClick={() => linkedProfile && onOpenRulesProfile(linkedProfile.id)}>
          <BookOpen aria-hidden="true" /><span><b>{t("Regras")}</b><small>{t("Abrir")}</small></span>
        </Button>
        <Button type="button" variant="outline" className="room-quick-action" onClick={onOpenDice}>
          <Dices aria-hidden="true" /><span><b>{t("Rolar")}</b><small>4dF</small></span>
        </Button>
        <Button type="button" variant="outline" className="room-quick-action" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" /> : <Paperclip aria-hidden="true" />}<span><b>{t("Arquivos")}</b><small>{uploading ? "Enviando…" : t("Adicionar")}</small></span>
        </Button>
        <input ref={fileInput} className="sr-only" type="file" multiple onChange={uploadFiles} />
      </nav>

      <section className="room-storage-meter" data-state={roomStorage.files.usedBytes >= roomStorage.files.limitBytes ? "critical" : roomStorage.files.usedBytes >= roomStorage.files.warningBytes ? "attention" : "normal"} aria-labelledby="room-storage-heading">
        <div><p className="eyebrow">{t("Arquivos da Mesa")}</p><h2 id="room-storage-heading">{formatStorageBytes(roomStorage.files.usedBytes)} {t("usados de")} {formatStorageBytes(roomStorage.files.limitBytes)} {t("disponíveis nesta Mesa")}</h2><span>{roomStorage.files.count} {t("de")} {roomStorage.files.maxCount} {t("arquivos · até")}{formatStorageBytes(roomStorage.files.maxFileBytes)} {t("por arquivo")}</span></div>
        <progress value={roomStorage.files.usedBytes} max={roomStorage.files.limitBytes} aria-label={t("Uso do armazenamento de arquivos da Mesa")} />
        {store.roomFileApproachingLimit && <p>{t("Espaço em atenção. Exporte ou exclua arquivos antes do próximo envio grande.")}</p>}
        {roomStorage.database.usedBytes >= roomStorage.database.warningBytes && <p>{t("O armazenamento compartilhado está se aproximando da margem segura. O narrador pode exportar e limpar partes antigas do Histórico.")}</p>}
        {self.role === "gm" && <div className="room-storage-maintenance"><p><strong>{t("Limpeza de cópias sem registro")}</strong><span>{t("Um envio interrompido pode deixar uma cópia sem aparecer no Histórico. Arquivos publicados ficam preservados.")}</span></p><OrphanCleanupDialog onCleanup={store.cleanupOrphanFiles} /></div>}
      </section>

      {store.session && linkedProfile && (
        <div className="room-rules-choice">
          <BookOpen aria-hidden="true" />
          <Label className="field-stack">
            <span>{t("Regras desta Mesa")}</span>
            <Select value={linkedProfile.id} onValueChange={(profileId) => { linkRulesProfile(store.session!.participantId, profileId); onSelectRulesProfile(profileId); }}>
              <SelectTrigger size="sm" aria-label={t("Escolher regras desta Mesa")}><SelectValue /></SelectTrigger>
              <SelectContent>{rulesProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.config.profileName}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
        </div>
      )}

      {self.role === "gm" && pending.length > 0 && (
        <section className="approval-strip" aria-labelledby="approval-heading">
          <div><p className="eyebrow">{t("Decisão do narrador")}</p><h2 id="approval-heading">{pending.length} {pending.length === 1 ? "pessoa quer" : "pessoas querem"} {t("entrar")}</h2></div>
          <ul>
            {pending.map((participant) => (
              <li key={participant.id}>
                <b>{participant.name}</b>
                <div><Button size="sm" onClick={() => void decide(participant.id, "approved")}><Check /> {t("Aprovar")}</Button><Button size="sm" variant="ghost" onClick={() => void decide(participant.id, "rejected")}><X /> {t("Recusar")}</Button></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="room-layout">
        <form className="note-composer" onSubmit={publishNote}>
          <Label htmlFor="room-note">{t("Notas da mesa")}</Label>
          <Textarea id="room-note" value={note} onChange={(event) => draft.change(event.target.value)} disabled={!draft.ready} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={1600} rows={4} />
            <p className="draft-status" role="status">{draft.saved ? t("Rascunho salvo neste navegador. Ctrl/⌘ + Enter para publicar.") : t("Não foi possível salvar o rascunho. Copie o texto antes de sair.")}</p>
          <div><small>{note.length}/1600</small><Button type="submit" disabled={!note.trim() || posting || !draft.ready || !store.roomReady}>{posting ? <Loader2 className="animate-spin" /> : <Send />} {t("Publicar")}</Button></div>
        </form>

        <section className="room-feed" data-empty={visibleEntries.length === 0} aria-labelledby="room-feed-heading">
          <header>
            <div><p className="eyebrow">{t("Diário compartilhado")}</p><h2 id="room-feed-heading">{t("Histórico da Mesa")}</h2></div>
            <div className="room-sync-state">
              {store.error && <span data-error="true"><WifiOff /> {store.error}</span>}
              <Button size="icon-sm" variant="ghost" aria-label={t("Exportar Histórico completo")} onClick={() => void store.exportHistory().then(() => toast.success(t("Histórico exportado por inteiro."))).catch((error) => toast.error(error instanceof Error ? error.message : t("O Histórico não pôde ser exportado.")))}><Download /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Atualizar Mesa" onClick={() => void store.refresh().catch(() => undefined)}><RefreshCw className={store.refreshing ? "animate-spin" : ""} /></Button>
            </div>
          </header>

          {self.role === "gm" && <div className="room-history-management"><span>{formatStorageBytes(roomStorage.history.usedBytes)} {t("em texto e metadados")}</span><Select value={historyDays} onValueChange={setHistoryDays}><SelectTrigger size="sm" aria-label={t("Período de Histórico a preservar")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="90">{t("Preservar 90 dias")}</SelectItem><SelectItem value="180">{t("Preservar 180 dias")}</SelectItem><SelectItem value="365">{t("Preservar 1 ano")}</SelectItem><SelectItem value="730">{t("Preservar 2 anos")}</SelectItem></SelectContent></Select><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="sm"><Trash2 /> {t("Limpar Histórico antigo")}</Button></AlertDialogTrigger><AlertDialogContent size="sm" className="maintenance-dialog"><AlertDialogHeader><AlertDialogTitle>{t("Limpar o Histórico anterior a")}{Number(historyDays) === 365 ? t("um ano") : `${historyDays} dias`}?</AlertDialogTitle><AlertDialogDescription>{t("Rolagens, notas e referências de regras anteriores a esse período serão excluídas. Arquivos, participantes e tudo que for mais recente serão preservados. Exporte o Histórico antes se quiser guardar uma cópia.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void store.clearOldHistory(Date.now() - Number(historyDays) * 24 * 60 * 60 * 1000).then((result) => toast.success(result.removed ? t(`${result.removed} item(ns) antigo(s) excluído(s).`, "" + String(result.removed) + " old entries deleted.") : t("Não havia itens antigos nesse período."))).catch((error) => toast.error(error instanceof Error ? error.message : t("Nada foi apagado.")))}>{t("Limpar agora")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}

          <div className="room-feed-tools">
            <div className="room-filter" role="group" aria-label={t("Filtrar atividade")}>
              {(["all", "roll", "note", "rule", "file"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {value === "all" ? t("Tudo") : value === "roll" ? t("Rolagens") : value === "note" ? t("Notas") : value === "rule" ? t("Regras") : t("Arquivos")}
                </button>
              ))}
            </div>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Buscar na atividade visível")} />
          </div>

          {store.viewingHistory && <div className="history-banner"><History /> {t("Você está vendo uma página antiga.")}<Button size="sm" variant="outline" onClick={store.returnLatest}>{t("Voltar ao presente")}</Button></div>}

          {visibleEntries.length ? (
            <ol aria-live="polite">
              {visibleEntries.map((entry) => <RoomEntryView key={entry.id} entry={entry} onOpenRule={onOpenRule} onDownloadFile={store.downloadFile} onDeleteFile={store.deleteFile} canDeleteFile={entry.type === "file" && (self.role === "gm" || entry.actor.id === self.id)} />)}
            </ol>
          ) : (
            <div className="room-feed-empty"><StickyNote aria-hidden="true" /><p>{entries.length ? t("Nenhuma atividade corresponde a este filtro.") : t("A primeira rolagem, nota, regra ou arquivo aparecerá aqui.")}</p></div>
          )}

          {(store.viewingHistory || store.snapshot.nextCursor) && <footer className="room-feed-pagination">
            {store.viewingHistory && <Button variant="ghost" onClick={store.returnLatest}><ArrowLeft /> {t("Mais recentes")}</Button>}
            {store.snapshot.nextCursor && <Button variant="outline" onClick={store.loadOlder}><History /> {t("Mais antigas")}</Button>}
          </footer>}
        </section>

        <aside className="room-sidebar">
          <section>
            <h2><Users /> {t("Na Mesa")}<Badge variant="secondary">{approved.length}</Badge></h2>
            <ul className="participant-list">
              {approved.map((participant) => (
                <li key={participant.id}><span>{participant.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><div><b>{participant.name}</b><small>{participant.role === "gm" ? t("Narrador") : t("Jogador")}{participant.id === self.id ? " · você" : ""}</small></div></li>
              ))}
            </ul>
          </section>
          <section className="room-session-actions">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost"><LogOut /> {t("Sair neste dispositivo")}</Button></AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader><AlertDialogTitle>{t("Sair desta Mesa?")}</AlertDialogTitle><AlertDialogDescription>{t("A credencial local será removida deste dispositivo. O diário compartilhado não será apagado.")}</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>{t("Ficar")}</AlertDialogCancel><AlertDialogAction onClick={store.leave}>{t("Sair")}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {self.role === "gm" && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="destructive-outline"><Trash2 /> {t("Excluir Mesa inteira")}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("Excluir “")}{room.name}{t("” por completo?")}</AlertDialogTitle><AlertDialogDescription>{t("Participantes, Histórico, referências e todos os arquivos desta Mesa serão excluídos. Esta ação não afeta Fichas ou conjuntos de regras guardados neste dispositivo e não pode ser desfeita. Exporte o que quiser preservar.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void store.deleteCurrentRoom().then((result) => toast.success(result.cleanupPending ? t("Mesa excluída; a limpeza física dos arquivos continuará automaticamente.") : t("Mesa e seus arquivos foram excluídos por completo."))).catch((error) => toast.error(error instanceof Error ? error.message : t("A Mesa não foi excluída.")))}>{t("Excluir Mesa inteira")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
          </section>
        </aside>
      </div>
    </section>
  );
}
