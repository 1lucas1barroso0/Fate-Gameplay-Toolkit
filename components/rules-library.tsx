"use client";

import * as React from "react";
import { BookOpen, Download, ExternalLink, FileText, FileUp, Loader2, LockKeyhole, Search, Send, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import rulesData from "@/content/rules.json";
import expansionData from "@/content/expansions.json";
import terminologyData from "@/content/fate-terminology.json";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ADJECTIVE_LADDER, stripHtml, type Language } from "@/lib/fate";
import { MAX_ROOM_FILES_PER_UPLOAD, type RoomEntry, type RoomFileData } from "@/lib/room-contracts";
import { getContextRules, type TableConfig } from "@/lib/table-config";
import { formatStorageBytes } from "@/lib/storage-policy";
import type { RoomStore } from "@/lib/use-room";

type Localized = { pt: string; en: string };
type LocalizedList = { pt: string[]; en: string[] };

type RuleChapter = {
  id: string;
  slugs: { pt: string; en: string };
  title: Localized;
  html: { pt: string; en: string };
};

type ExpansionChapter = {
  id: string;
  title: Localized;
  label: Localized;
  mode: "full-srd" | "official-guide-summary" | "book-map" | "editorial-summary";
  html: Localized;
};

type ExpansionSource = {
  id: string;
  title: Localized;
  shortTitle: Localized;
  year: number;
  kind: "guide" | "expansion";
  tags: Localized[];
  description: Localized;
  contentNote: Localized;
  officialUrl: string;
  referenceUrl: Localized;
  licenseUrl: string;
  errataUrl?: string;
  attribution: Localized;
  chapters: ExpansionChapter[];
  wordCount: number;
  wordCountByLanguage: { pt: number; en: number };
};

type ExpansionBundle = {
  version: string;
  precedence: Localized;
  sources: ExpansionSource[];
};

type ReaderChapter = {
  id: string;
  title: Localized;
  label: Localized;
  mode: "principal" | ExpansionChapter["mode"];
  html: Localized;
  slugs?: { pt: string; en: string };
};

type ReaderSource = {
  id: string;
  title: Localized;
  shortTitle: Localized;
  year: number;
  kind: "principal" | "guide" | "expansion";
  tags: Localized[];
  description: Localized;
  contentNote: Localized;
  officialUrl: string;
  referenceUrl: Localized;
  licenseUrl: string;
  errataUrl?: string;
  attribution: LocalizedList;
  chapters: ReaderChapter[];
  wordCount: number;
};

type SearchResult = {
  source: ReaderSource;
  chapter: ReaderChapter;
  snippet: string;
};

const chapters = rulesData as RuleChapter[];
const expansions = expansionData as ExpansionBundle;
const terminology = terminologyData as {
  terms: { canonical: Localized; aliases: { pt: string[]; en: string[] } }[];
};

const condensedAttribution: LocalizedList = {
  pt: [
    "Esta obra é baseada em Fate Condensado, traduzido pela comunidade e fãs, desenvolvido e editado por Estevan Fernandes Queiroz e licenciado para uso sob Creative Commons Atribuição 4.0 Internacional. Versão original: Fate Condensed © Evil Hat Productions, LLC. Documento de Referência do Sistema produzido por Estevan Fernandes Queiroz.",
    "Fate Condensed ©2020 Evil Hat Productions, LLC. Fate™ é uma marca da Evil Hat Productions, LLC.",
  ],
  en: [
    "This work is based on Fate Condensed, a product of Evil Hat Productions, LLC, developed, authored, and edited by PK Sullivan, Lara Turner, Leonard Balsera, Fred Hicks, Richard Bellingham, Robert Hanz, Ryan Macklin, and Sophie Lagacé, and licensed for our use under the Creative Commons Attribution 3.0 Unported license.",
    "Fate Condensed ©2020 Evil Hat Productions, LLC. Fate™ is a trademark of Evil Hat Productions, LLC.",
  ],
};

function localized(value: Localized, language: Language) {
  return value[language];
}

const interfaceCopy = {
  pt: {
    principalEyebrow: "Fate Condensado · regra principal",
    heading: "Central de Regras",
    introduction: "Comece com o livro. Mude só o que ajudar a mesa.",
    languageAria: "Idioma das regras",
    quick: "Resumo rápido",
    quickDescription: "O essencial do Fate Condensado para consultar durante a sessão.",
    profileDefault: "Fate Condensado como está no livro",
    rulesInUse: (count: number) => `${count} ${count === 1 ? "regra" : "regras"} em uso — opções e regras da Mesa permanecem identificadas`,
    viewOptions: "Ver opções",
    adjust: "Ajustar",
    libraryEyebrow: "Biblioteca Fate",
    libraryHeading: "Um livro principal. Expansões quando forem úteis.",
    classification: "Classificação",
    selectedSource: "Fonte selecionada",
    sourceCredits: "Fonte, créditos e licença",
    officialBook: "Livro oficial",
    officialReference: "Referência oficial",
    officialErrata: "Errata oficial",
    licenseAndUse: "Licença e uso",
    writtenByTable: "Escrito pela mesa",
    ownRules: "Regras do seu jogo",
    tableRule: "Regra da mesa",
    customRulesAria: "Regras próprias desta mesa",
    searchAria: "Buscar em toda a biblioteca",
    clearSearch: "Limpar busca",
    noResults: "Nada encontrado com esses termos.",
    result: (count: number) => `${count} ${count === 1 ? "resultado encontrado" : "resultados encontrados"}`,
    chapter: "Capítulo",
    chooseChapter: "Escolher capítulo",
    chapters: "Capítulos",
    publishSuccess: "Consulta publicada na Mesa.",
    publishError: "A consulta não foi publicada.",
    publishTitle: "Publicar esta consulta na Mesa",
    publishDisabled: "Entre em uma Mesa para compartilhar",
    publishing: "Publicando…",
    share: "Compartilhar na Mesa",
    checkSource: "Conferir a fonte",
    seeBook: "Ver o livro",
    quickRoll: "Rolagem",
    effort: "Esforço",
    shifts: "Tensões",
    results: "Resultados",
    fail: "Falha",
    failText: "Abaixo do alvo.",
    tie: "Empate",
    tieText: "Igual ao alvo.",
    succeed: "Sucesso",
    succeedText: "Uma ou duas tensões acima.",
    style: "Com estilo",
    styleText: "Três ou mais tensões acima.",
    actions: "Quatro ações",
    overcome: "Superar",
    overcomeText: "Remover um obstáculo.",
    advantage: "Criar vantagem",
    advantageText: "Criar ou explorar um aspecto.",
    attack: "Atacar",
    attackText: "Causar dano.",
    defend: "Defender",
    defendText: "Impedir um ataque ou interferência.",
    ladder: "Escala de adjetivos",
  },
  en: {
    principalEyebrow: "Fate Condensed · principal ruleset",
    heading: "Rules Library",
    introduction: "Start with the book. Change only what helps the table.",
    languageAria: "Rules language",
    quick: "Quick reference",
    quickDescription: "The essentials of Fate Condensed for reference during play.",
    profileDefault: "Fate Condensed as written",
    rulesInUse: (count: number) => `${count} ${count === 1 ? "rule" : "rules"} in use — options and table rules remain identified`,
    viewOptions: "View options",
    adjust: "Adjust",
    libraryEyebrow: "Fate Library",
    libraryHeading: "One principal book. Expansions when they help.",
    classification: "Classification",
    selectedSource: "Selected source",
    sourceCredits: "Source, credits, and license",
    officialBook: "Official book",
    officialReference: "Official reference",
    officialErrata: "Official errata",
    licenseAndUse: "License and use",
    writtenByTable: "Written by the table",
    ownRules: "Rules for your game",
    tableRule: "Table rule",
    customRulesAria: "This table’s own rules",
    searchAria: "Search the entire library",
    clearSearch: "Clear search",
    noResults: "Nothing found for those terms.",
    result: (count: number) => `${count} ${count === 1 ? "result found" : "results found"}`,
    chapter: "Chapter",
    chooseChapter: "Choose chapter",
    chapters: "Chapters",
    publishSuccess: "Reference shared with the table.",
    publishError: "The reference was not shared.",
    publishTitle: "Share this reference with the table",
    publishDisabled: "Join a table to share",
    publishing: "Sharing…",
    share: "Share with the table",
    checkSource: "Check the source",
    seeBook: "View the book",
    quickRoll: "Roll",
    effort: "Effort",
    shifts: "Shifts",
    results: "Outcomes",
    fail: "Fail",
    failText: "Below the target.",
    tie: "Tie",
    tieText: "Equal to the target.",
    succeed: "Succeed",
    succeedText: "One or two shifts above.",
    style: "With style",
    styleText: "Three or more shifts above.",
    actions: "Four actions",
    overcome: "Overcome",
    overcomeText: "Remove an obstacle.",
    advantage: "Create an Advantage",
    advantageText: "Create or exploit an aspect.",
    attack: "Attack",
    attackText: "Cause harm.",
    defend: "Defend",
    defendText: "Prevent an attack or interference.",
    ladder: "The ladder",
  },
};

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function terminologyAliases(text: string) {
  const normalizedText = normalizeSearch(text);
  return terminology.terms.flatMap((term) => {
    const names = [term.canonical.pt, term.canonical.en, ...term.aliases.pt, ...term.aliases.en];
    return names.some((name) => normalizedText.includes(normalizeSearch(name))) ? names : [];
  }).join(" ");
}

function makeSnippet(text: string, query: string) {
  const normalized = normalizeSearch(text);
  const normalizedQuery = normalizeSearch(query);
  const index = normalized.indexOf(normalizedQuery);
  if (index < 0) return text.slice(0, 180);
  const start = Math.max(0, index - 74);
  const end = Math.min(text.length, index + normalizedQuery.length + 112);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function chapterModeLabel(chapter: ReaderChapter, language: Language) {
  if (chapter.mode === "principal") return language === "pt" ? "Texto integral" : "Complete text";
  if (chapter.mode === "full-srd") return language === "pt" ? "SRD integral" : "Complete SRD";
  if (chapter.mode === "book-map") return language === "pt" ? "Mapa do livro" : "Book map";
  if (chapter.mode === "official-guide-summary") return language === "pt" ? "Síntese do guia" : "Guide digest";
  return language === "pt" ? "Síntese editorial" : "Editorial digest";
}

function QuickReference({ language }: { language: Language }) {
  const copy = interfaceCopy[language];
  return (
    <div className="quick-reference">
      <section>
        <h3>{copy.quickRoll}</h3>
        <p><b>{copy.effort}</b> = 4dF + {language === "pt" ? "perícia + aspectos invocados + façanhas" : "skill + invoked aspects + stunts"}.</p>
        <p><b>{copy.shifts}</b> = {language === "pt" ? "esforço − dificuldade ou oposição" : "effort − difficulty or opposition"}.</p>
      </section>
      <section>
        <h3>{copy.results}</h3>
        <dl>
          <div><dt>↓ {copy.fail}</dt><dd>{copy.failText}</dd></div>
          <div><dt>↔ {copy.tie}</dt><dd>{copy.tieText}</dd></div>
          <div><dt>↑ {copy.succeed}</dt><dd>{copy.succeedText}</dd></div>
          <div><dt>↑↑ {copy.style}</dt><dd>{copy.styleText}</dd></div>
        </dl>
      </section>
      <section>
        <h3>{copy.actions}</h3>
        <dl>
          <div><dt>{copy.overcome}</dt><dd>{copy.overcomeText}</dd></div>
          <div><dt>{copy.advantage}</dt><dd>{copy.advantageText}</dd></div>
          <div><dt>{copy.attack}</dt><dd>{copy.attackText}</dd></div>
          <div><dt>{copy.defend}</dt><dd>{copy.defendText}</dd></div>
        </dl>
      </section>
      <section>
        <h3>{copy.ladder}</h3>
        <div className="ladder-grid">
          {Object.entries(ADJECTIVE_LADDER).sort((a, b) => Number(b[0]) - Number(a[0])).map(([value, label]) => (
            <React.Fragment key={value}>
              <b>{Number(value) >= 0 ? "+" + value : value}</b><span>{label[language]}</span>
            </React.Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}

const privateLibraryCopy = {
  pt: {
    eyebrow: "Acesso restrito",
    heading: "Biblioteca privada da Mesa",
    description: "O Narrador pode guardar aqui os PDFs integrais que possui. Eles não entram no site público e só são entregues a participantes aprovados desta Mesa.",
    openRooms: "Abrir Mesas",
    noRoom: "Abra ou crie uma Mesa para usar a biblioteca privada.",
    syncing: "Sincronizando a Mesa privada…",
    pending: "A biblioteca aparecerá depois que o Narrador aprovar sua entrada.",
    room: "Mesa",
    privacy: "Acesso autenticado · participantes aprovados · sem indexação pública",
    usage: (used: string, limit: string) => `${used} usados de ${limit}`,
    fileLimit: (size: string, count: number) => `Até ${size} por PDF · ${count} arquivos por envio`,
    warning: "O espaço está em atenção. Baixe uma cópia e exclua o que não precisar antes de outro envio grande.",
    add: "Adicionar PDFs",
    adding: "Enviando…",
    gmOnly: "Somente o Narrador adiciona livros; participantes aprovados podem ler e baixar.",
    empty: "O Narrador ainda não adicionou nenhum PDF integral a esta Mesa.",
    open: "Ler PDF",
    download: "Baixar cópia",
    delete: "Excluir PDF",
    deleteTitle: "Excluir este PDF da biblioteca privada?",
    deleteDescription: (name: string) => `“${name}” será removido da Mesa e do armazenamento. Os mapas públicos, as Fichas e o Histórico permanecem intactos.`,
    deleted: "PDF excluído da biblioteca privada.",
    close: "Fechar",
    viewerDescription: "Arquivo integral privado da Mesa. Se o navegador não exibir o PDF, baixe uma cópia.",
  },
  en: {
    eyebrow: "Restricted access",
    heading: "Table private library",
    description: "The Game Master can keep complete PDFs they own here. They are not bundled with the public site and are delivered only to approved participants in this table.",
    openRooms: "Open Tables",
    noRoom: "Open or create a Table to use the private library.",
    syncing: "Syncing the private Table…",
    pending: "The library will appear after the Game Master approves your entry.",
    room: "Table",
    privacy: "Authenticated access · approved participants · no public indexing",
    usage: (used: string, limit: string) => `${used} used of ${limit}`,
    fileLimit: (size: string, count: number) => `Up to ${size} per PDF · ${count} files per upload`,
    warning: "Storage needs attention. Download a copy and delete anything you no longer need before another large upload.",
    add: "Add PDFs",
    adding: "Uploading…",
    gmOnly: "Only the Game Master adds books; approved participants can read and download them.",
    empty: "The Game Master has not added any complete PDFs to this Table yet.",
    open: "Read PDF",
    download: "Download copy",
    delete: "Delete PDF",
    deleteTitle: "Delete this PDF from the private library?",
    deleteDescription: (name: string) => `“${name}” will be removed from the Table and file storage. Public maps, character sheets, and history remain intact.`,
    deleted: "PDF deleted from the private library.",
    close: "Close",
    viewerDescription: "Complete private Table file. If the browser cannot display the PDF, download a copy.",
  },
};

function isPdfEntry(entry: RoomEntry) {
  if (entry.type !== "file") return false;
  const file = entry.data as RoomFileData;
  return file.contentType === "application/pdf" || file.name.toLocaleLowerCase("en-US").endsWith(".pdf");
}

function PrivateTableLibrary({
  language,
  store,
  onOpenRooms,
}: {
  language: Language;
  store: RoomStore;
  onOpenRooms?: () => void;
}) {
  const copy = privateLibraryCopy[language];
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [opening, setOpening] = React.useState("");
  const [viewer, setViewer] = React.useState<{ entry: RoomEntry; name: string; url: string } | null>(null);
  const snapshot = store.snapshot;
  const gm = snapshot?.participants.find((participant) => participant.role === "gm");
  const books = snapshot?.files.filter((entry) => isPdfEntry(entry) && entry.actor.id === gm?.id) ?? [];
  const storage = snapshot?.storage.files;
  const approved = snapshot?.self.status === "approved";
  const canManage = approved && snapshot?.self.role === "gm";

  React.useEffect(() => () => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url);
  }, [viewer?.url]);

  const uploadBooks = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length || uploading || !store || !storage || !canManage) return;
    if (selected.length > MAX_ROOM_FILES_PER_UPLOAD) {
      toast.error(language === "pt" ? `Escolha até ${MAX_ROOM_FILES_PER_UPLOAD} PDFs por vez.` : `Choose up to ${MAX_ROOM_FILES_PER_UPLOAD} PDFs at a time.`);
      return;
    }
    if (selected.some((file) => file.type !== "application/pdf" && !file.name.toLocaleLowerCase("en-US").endsWith(".pdf"))) {
      toast.error(language === "pt" ? "Esta biblioteca aceita somente arquivos PDF." : "This library accepts PDF files only.");
      return;
    }
    const totalBytes = selected.reduce((total, file) => total + file.size, 0);
    if (selected.some((file) => !file.size || file.size > storage.maxFileBytes)) {
      toast.error(language === "pt" ? `Cada PDF deve ter até ${formatStorageBytes(storage.maxFileBytes, "pt-BR")}.` : `Each PDF must be no larger than ${formatStorageBytes(storage.maxFileBytes, "en-US")}.`);
      return;
    }
    if (storage.count + selected.length > storage.maxCount || storage.usedBytes + totalBytes > storage.limitBytes) {
      toast.error(language === "pt" ? "Esses PDFs ultrapassariam o espaço seguro da Mesa. Exclua arquivos antes de continuar." : "These PDFs would exceed the Table's safe storage. Delete files before continuing.");
      return;
    }

    setUploading(true);
    let published = 0;
    try {
      for (const file of selected) {
        await store.postFile(file);
        published += 1;
      }
      toast.success(language === "pt" ? `${published} PDF(s) adicionado(s) à biblioteca privada.` : `${published} PDF(s) added to the private library.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : language === "pt" ? "O envio não terminou." : "The upload did not finish.";
      toast.error(published ? `${published}/${selected.length}: ${reason}` : reason);
    } finally {
      setUploading(false);
    }
  };

  const openBook = async (entry: RoomEntry) => {
    if (!store || opening) return;
    setOpening(entry.id);
    try {
      const file = entry.data as RoomFileData;
      const blob = await store.readFile(entry);
      const pdf = blob.type === "application/pdf" ? blob : blob.slice(0, blob.size, "application/pdf");
      setViewer({ entry, name: file.name, url: URL.createObjectURL(pdf) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : language === "pt" ? "O PDF não pôde ser aberto." : "The PDF could not be opened.");
    } finally {
      setOpening("");
    }
  };

  return (
    <section className="private-rule-library" data-ready={approved ? "true" : "false"} aria-labelledby="private-library-heading">
      <header>
        <div className="private-library-title">
          <LockKeyhole aria-hidden="true" />
          <div><p className="eyebrow">{copy.eyebrow}</p><h2 id="private-library-heading">{copy.heading}</h2></div>
        </div>
        <p>{copy.description}</p>
      </header>

      {!store.session ? (
        <div className="private-library-state"><span>{copy.noRoom}</span>{onOpenRooms && <Button type="button" variant="outline" size="sm" onClick={onOpenRooms}>{copy.openRooms}</Button>}</div>
      ) : !snapshot ? (
        <div className="private-library-state"><Loader2 className="animate-spin" aria-hidden="true" /><span>{copy.syncing}</span></div>
      ) : !approved ? (
        <div className="private-library-state"><span>{copy.pending}</span>{onOpenRooms && <Button type="button" variant="outline" size="sm" onClick={onOpenRooms}>{copy.openRooms}</Button>}</div>
      ) : (
        <>
          <div className="private-library-access">
            <div><b>{copy.room}: {snapshot.room.name}</b><span>{copy.privacy}</span></div>
            {storage && <div className="private-library-storage"><span>{copy.usage(formatStorageBytes(storage.usedBytes, language === "pt" ? "pt-BR" : "en-US"), formatStorageBytes(storage.limitBytes, language === "pt" ? "pt-BR" : "en-US"))}</span><progress value={storage.usedBytes} max={storage.limitBytes} aria-label={copy.usage(formatStorageBytes(storage.usedBytes), formatStorageBytes(storage.limitBytes))} /></div>}
          </div>
          {storage && storage.usedBytes >= storage.warningBytes && <p className="private-library-warning">{copy.warning}</p>}
          <div className="private-library-tools">
            <span>{copy.gmOnly}</span>
            {canManage && <><Button type="button" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <FileUp />} {uploading ? copy.adding : copy.add}</Button><input ref={fileInput} className="sr-only" type="file" accept=".pdf,application/pdf" multiple onChange={uploadBooks} />{storage && <small>{copy.fileLimit(formatStorageBytes(storage.maxFileBytes, language === "pt" ? "pt-BR" : "en-US"), MAX_ROOM_FILES_PER_UPLOAD)}</small>}</>}
          </div>
          {books.length ? (
            <div className="private-book-list">
              {books.map((entry) => {
                const file = entry.data as RoomFileData;
                return <article key={entry.id} className="private-book-card"><FileText aria-hidden="true" /><div><b>{file.name}</b><span>{formatStorageBytes(file.size, language === "pt" ? "pt-BR" : "en-US")} · {entry.actor.name}</span></div><div><Button type="button" variant="outline" size="sm" disabled={Boolean(opening)} onClick={() => void openBook(entry)}>{opening === entry.id ? <Loader2 className="animate-spin" /> : <BookOpen />} {copy.open}</Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`${copy.download}: ${file.name}`} onClick={() => void store.downloadFile(entry).catch((error) => toast.error(error instanceof Error ? error.message : copy.download))}><Download /></Button>{canManage && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`${copy.delete}: ${file.name}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>{copy.deleteTitle}</AlertDialogTitle><AlertDialogDescription>{copy.deleteDescription(file.name)}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{copy.close}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void store.deleteFile(entry).then(() => toast.success(copy.deleted)).catch((error) => toast.error(error instanceof Error ? error.message : copy.delete))}>{copy.delete}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div></article>;
              })}
            </div>
          ) : <div className="private-library-empty"><BookOpen aria-hidden="true" /><p>{copy.empty}</p></div>}
        </>
      )}

      <Dialog open={Boolean(viewer)} onOpenChange={(open) => { if (!open) setViewer(null); }}>
        <DialogContent className="private-book-reader-dialog">
          <DialogHeader><DialogTitle>{viewer?.name}</DialogTitle><DialogDescription>{copy.viewerDescription}</DialogDescription></DialogHeader>
          {viewer && <iframe src={viewer.url} title={viewer.name} />}
          {viewer && <DialogFooter><Button type="button" variant="outline" onClick={() => void store.downloadFile(viewer.entry).catch((error) => toast.error(error instanceof Error ? error.message : copy.download))}><Download /> {copy.download}</Button></DialogFooter>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function RulesLibrary({
  onShareRule,
  roomReady,
  openReference,
  tableConfig,
  onOpenSettings,
  roomStore,
  onOpenRooms,
}: {
  onShareRule?: (title: string, reference: string) => Promise<void> | void;
  roomReady?: boolean;
  openReference?: string;
  tableConfig: TableConfig;
  onOpenSettings: () => void;
  roomStore: RoomStore;
  onOpenRooms?: () => void;
}) {
  const [language, setLanguage] = React.useState<Language>("pt");
  const [sourceId, setSourceId] = React.useState("fate-condensed");
  const [chapterId, setChapterId] = React.useState(chapters[0].id);
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const pendingAnchor = React.useRef<string | null>(null);
  const [sharing, setSharing] = React.useState(false);
  const contextualRules = getContextRules(tableConfig, "rules");
  const copy = interfaceCopy[language];

  const sources = React.useMemo<ReaderSource[]>(() => {
    const condensedChapters: ReaderChapter[] = chapters.map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title,
      label: {
        pt: "Capítulo " + String(index + 1).padStart(2, "0"),
        en: "Chapter " + String(index + 1).padStart(2, "0"),
      },
      mode: "principal",
      html: chapter.html,
      slugs: chapter.slugs,
    }));

    const condensedWords = condensedChapters.reduce(
      (total, chapter) => total + stripHtml(chapter.html[language]).split(/\s+/).filter(Boolean).length,
      0,
    );

    return [
      {
        id: "fate-condensed",
        title: { pt: "Fate Condensado", en: "Fate Condensed" },
        shortTitle: { pt: "Fate Condensado", en: "Fate Condensed" },
        year: 2020,
        kind: "principal",
        tags: [{ pt: "Oficial", en: "Official" }, { pt: "Principal", en: "Principal" }],
        description: {
          pt: "A regra completa, direta e mais recente da linha Core. É sempre a base deste site.",
          en: "The complete, direct, and most recent ruleset in the Core line. It is always this site's foundation.",
        },
        contentNote: {
          pt: "Texto integral em português e inglês.",
          en: "Complete text in Portuguese and English.",
        },
        officialUrl: "https://evilhat.com/product/fate-condensed/",
        referenceUrl: {
          pt: "https://fatesrdbrasil.gitlab.io/fate-srd-brasil/fate-condensado/",
          en: "https://fate-srd.com/fate-condensed",
        },
        licenseUrl: language === "pt"
          ? "https://creativecommons.org/licenses/by/4.0/"
          : "https://creativecommons.org/licenses/by/3.0/",
        attribution: condensedAttribution,
        chapters: condensedChapters,
        wordCount: condensedWords,
      },
      ...expansions.sources.map((source) => ({
        ...source,
        attribution: { pt: [source.attribution.pt], en: [source.attribution.en] },
      })),
    ];
  }, [language]);

  const currentSource = sources.find((source) => source.id === sourceId) ?? sources[0];
  const current = currentSource.chapters.find((chapter) => chapter.id === chapterId) ?? currentSource.chapters[0];
  const currentHtml = current.html[language];

  const searchDocuments = React.useMemo(
    () => sources.flatMap((source) => source.chapters.map((chapter) => {
      const text = stripHtml(chapter.html[language]);
      const bilingualText = stripHtml(chapter.html.pt) + " " + stripHtml(chapter.html.en);
      const searchableText = [
        source.title.pt,
        source.title.en,
        chapter.title.pt,
        chapter.title.en,
        bilingualText,
        terminologyAliases(bilingualText),
      ].join(" ");
      return {
        source,
        chapter,
        text,
        searchable: normalizeSearch(searchableText),
      };
    })),
    [language, sources],
  );

  const results = React.useMemo<SearchResult[]>(() => {
    const cleaned = deferredQuery.trim();
    if (cleaned.length < 2) return [];
    const normalizedQuery = normalizeSearch(cleaned);
    const found: SearchResult[] = [];

    for (const document of searchDocuments) {
      if (document.searchable.includes(normalizedQuery)) {
        found.push({
          source: document.source,
          chapter: document.chapter,
          snippet: makeSnippet(document.text, cleaned),
        });
      }
      if (found.length >= 60) return found;
    }

    return found;
  }, [deferredQuery, searchDocuments]);

  const customResults = React.useMemo(() => {
    const cleaned = normalizeSearch(deferredQuery.trim());
    if (cleaned.length < 2) return [];
    return tableConfig.customRules.filter(
      (rule) => rule.enabled && normalizeSearch(rule.name + " " + rule.description).includes(cleaned),
    );
  }, [deferredQuery, tableConfig.customRules]);

  React.useEffect(() => {
    if (!pendingAnchor.current) return;
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    window.requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [chapterId, language, sourceId]);

  React.useEffect(() => {
    if (!openReference) return;
    const parts = openReference.split(":");
    const isLegacy = !sources.some((item) => item.id === parts[1]);
    const targetSource = isLegacy ? "fate-condensed" : parts[1];
    const targetChapter = isLegacy ? parts[1] : parts[2];
    const targetLanguage = isLegacy ? parts[2] : parts[3];
    const source = sources.find((item) => item.id === targetSource);
    if (!source || !source.chapters.some((chapter) => chapter.id === targetChapter)) return;

    const handle = window.setTimeout(() => {
      if (targetLanguage === "pt" || targetLanguage === "en") setLanguage(targetLanguage);
      setSourceId(source.id);
      setChapterId(targetChapter);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [openReference, sources]);

  const chooseSource = (nextSource: ReaderSource) => {
    setSourceId(nextSource.id);
    setChapterId(nextSource.chapters[0].id);
    setQuery("");
  };

  const chooseResult = (source: ReaderSource, chapter: ReaderChapter) => {
    setSourceId(source.id);
    setChapterId(chapter.id);
    setQuery("");
    window.requestAnimationFrame(() => document.getElementById("rule-reader")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const openCondensedOptions = () => {
    const principal = sources[0];
    const options = principal.chapters.find((chapter) => chapter.id === "opcionais");
    setSourceId(principal.id);
    setChapterId(options?.id ?? principal.chapters[0].id);
  };

  const shareCurrentRule = async () => {
    if (!onShareRule || !roomReady || sharing) return;
    setSharing(true);
    try {
      await onShareRule(
        localized(current.title, language),
        "rules:" + currentSource.id + ":" + current.id + ":" + language,
      );
      const { toast } = await import("sonner");
      toast.success(copy.publishSuccess);
    } catch (error) {
      const { toast } = await import("sonner");
      toast.error(error instanceof Error ? error.message : copy.publishError);
    } finally {
      setSharing(false);
    }
  };

  const followRuleLink = (event: React.MouseEvent<HTMLDivElement>) => {
    if (currentSource.id !== "fate-condensed") return;
    const target = event.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href) && !href.includes("fate-srd.com/fate-condensed")) return;

    const hash = href.includes("#") ? decodeURIComponent(href.split("#")[1]) : "";
    const slug = href
      .replace(/^.*\/fate-condensed\//, "")
      .replace(/^\.\.\//, "")
      .split(/[\/#]/)[0];
    const destination = currentSource.chapters.find((chapter) => chapter.slugs?.[language] === slug);
    if (destination || href.startsWith("#")) {
      event.preventDefault();
      if (hash) pendingAnchor.current = hash;
      if (destination) setChapterId(destination.id);
      else if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="workspace-panel rules-workspace" aria-labelledby="rules-heading">
      <header className="workspace-toolbar rules-toolbar">
        <div>
          <p className="eyebrow">{copy.principalEyebrow}</p>
          <h1 id="rules-heading">{copy.heading}</h1>
          <p>{copy.introduction}</p>
        </div>
        <div className="toolbar-actions">
          <div className="language-switch" role="group" aria-label={copy.languageAria}>
            <Button size="sm" variant={language === "pt" ? "default" : "outline"} aria-pressed={language === "pt"} onClick={() => setLanguage("pt")}>PT-BR</Button>
            <Button size="sm" variant={language === "en" ? "default" : "outline"} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</Button>
          </div>
          <Sheet>
            <SheetTrigger asChild><Button variant="outline" size="sm"><BookOpen /> {copy.quick}</Button></SheetTrigger>
            <SheetContent className="quick-sheet">
              <SheetHeader>
                <SheetTitle>{copy.quick}</SheetTitle>
                <SheetDescription>{copy.quickDescription}</SheetDescription>
              </SheetHeader>
              <QuickReference language={language} />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="active-profile-strip">
        <BookOpen aria-hidden="true" />
        <div>
          <b>{tableConfig.profileName}</b>
          <span>
            {contextualRules.length
              ? copy.rulesInUse(contextualRules.length)
              : copy.profileDefault}
          </span>
        </div>
        <div className="inline-actions">
          {contextualRules.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={openCondensedOptions}><BookOpen /> {copy.viewOptions}</Button>}
          <Button type="button" variant="ghost" size="sm" aria-label={`${copy.adjust}: ${tableConfig.profileName}`} onClick={onOpenSettings}><Settings2 /> {copy.adjust}</Button>
        </div>
      </div>

      <PrivateTableLibrary language={language} store={roomStore} onOpenRooms={onOpenRooms} />

      <section className="rule-source-catalog" aria-labelledby="rule-sources-heading">
        <header className="rule-source-catalog-header">
          <div className="rule-source-catalog-title">
            <p className="eyebrow">{copy.libraryEyebrow}</p>
            <h2 id="rule-sources-heading">{copy.libraryHeading}</h2>
          </div>
          <p className="rule-source-catalog-principle">{localized(expansions.precedence, language)}</p>
        </header>
        <div className="rule-source-list">
          {sources.map((source) => (
            <button
              className={source.kind === "principal" ? "rule-source-choice is-principal" : "rule-source-choice"}
              data-active={source.id === currentSource.id}
              key={source.id}
              type="button"
              aria-pressed={source.id === currentSource.id}
              onClick={() => chooseSource(source)}
            >
              <span className="rule-source-choice-top">
                <b>{localized(source.title, language)}</b>
                <time dateTime={String(source.year)}>{source.year}</time>
              </span>
              <span>{localized(source.description, language)}</span>
              <span className="rule-source-tags" aria-label={copy.classification}>
                {source.tags.map((tag) => <small key={tag.pt}>{localized(tag, language)}</small>)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="license-note" aria-label={copy.sourceCredits}>
        <div>
          <p className="eyebrow">{copy.selectedSource}</p>
          <h2>{localized(currentSource.title, language)}</h2>
          <p>{localized(currentSource.contentNote, language)}</p>
        </div>
        {currentSource.attribution[language].map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        <div className="rule-source-links">
          <a href={currentSource.officialUrl} target="_blank" rel="noreferrer">{copy.officialBook} <ExternalLink /></a>
          <a href={localized(currentSource.referenceUrl, language)} target="_blank" rel="noreferrer">{copy.officialReference} <ExternalLink /></a>
          {currentSource.errataUrl && <a href={currentSource.errataUrl} target="_blank" rel="noreferrer">{copy.officialErrata} <ExternalLink /></a>}
          <a href={currentSource.licenseUrl} target="_blank" rel="noreferrer">{copy.licenseAndUse} <ExternalLink /></a>
        </div>
      </aside>

      {tableConfig.customRules.some((rule) => rule.enabled && rule.scopes.includes("rules")) && (
        <aside className="house-rules-reference" aria-label={copy.customRulesAria}>
          <header><Sparkles /><div><p className="eyebrow">{copy.writtenByTable}</p><h2>{copy.ownRules}</h2></div></header>
          <div>{tableConfig.customRules.filter((rule) => rule.enabled && rule.scopes.includes("rules")).map((rule) => <article key={rule.id}><span>{copy.tableRule}</span><b>{rule.name}</b><p>{rule.description}</p></article>)}</div>
        </aside>
      )}

      <div className="rule-search-wrap">
        <Search aria-hidden="true" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={copy.searchAria} />
        {query && <Button variant="ghost" size="icon-sm" onClick={() => setQuery("")} aria-label={copy.clearSearch}><X /></Button>}
      </div>

      {query.trim().length >= 2 && (
        <div className="rule-search-results" aria-live="polite">
          <p>{results.length + customResults.length ? copy.result(results.length + customResults.length) : copy.noResults}</p>
          {customResults.map((rule) => (
            <article className="custom-rule-search-hit" key={rule.id}>
              <small>{copy.tableRule}</small><b>{rule.name}</b><span>{rule.description}</span>
            </article>
          ))}
          {results.map(({ source, chapter, snippet }) => (
            <button key={source.id + ":" + chapter.id} type="button" onClick={() => chooseResult(source, chapter)}>
              <small>{localized(source.shortTitle, language)} · {chapterModeLabel(chapter, language)}</small>
              <b>{localized(chapter.title, language)}</b>
              <span>{snippet}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chapter-mobile-picker">
        <label htmlFor="rule-chapter-select">{copy.chapter}</label>
        <NativeSelect
          id="rule-chapter-select"
          value={current.id}
          onChange={(event) => setChapterId(event.target.value)}
          aria-label={copy.chooseChapter}
        >
          {currentSource.chapters.map((chapter) => (
            <NativeSelectOption key={chapter.id} value={chapter.id}>
              {localized(chapter.title, language)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="rules-layout">
        <nav className="chapter-nav" aria-label={copy.chapters}>
          {currentSource.chapters.map((chapter, index) => (
            <button key={chapter.id} type="button" aria-current={chapter.id === current.id ? "page" : undefined} onClick={() => setChapterId(chapter.id)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {localized(chapter.title, language)}
            </button>
          ))}
        </nav>

        <article id="rule-reader" className="rule-reader">
          <header>
            <div>
              <p>{localized(currentSource.shortTitle, language)} · {localized(current.label, language)}</p>
              <h2>{localized(current.title, language)}</h2>
              <div className="rule-reader-tags">
                {currentSource.tags.map((tag) => <span key={tag.pt}>{localized(tag, language)}</span>)}
                <span>{chapterModeLabel(current, language)}</span>
              </div>
            </div>
            {onShareRule && (
              <Button variant="outline" size="sm" disabled={!roomReady || sharing} title={roomReady ? copy.publishTitle : copy.publishDisabled} onClick={shareCurrentRule}>
                <Send /> {sharing ? copy.publishing : copy.share}
              </Button>
            )}
          </header>
          <div className="rule-prose" onClick={followRuleLink} dangerouslySetInnerHTML={{ __html: currentHtml }} />
          <footer className="rule-sources">
            <a href={localized(currentSource.referenceUrl, language)} target="_blank" rel="noreferrer">{copy.checkSource} <ExternalLink /></a>
            <a href={currentSource.officialUrl} target="_blank" rel="noreferrer">{copy.seeBook} <ExternalLink /></a>
          </footer>
        </article>
      </div>
    </section>
  );
}
