"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, ChevronDown, Download, ExternalLink, FileText, FileUp, Link2, List, Loader2, LockKeyhole, Search, Send, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_READING, bookSearchDocuments, EMPTY_SEARCH, loadBook, loadSearch, normalizeSearch, readerCatalog, readingFromHash, readingHash, readingKey, searchChapters, type BookText, type Localized, type ReaderChapter, type ReaderLocation, type ReaderSource, type SearchDocument } from "@/lib/reader-library";
import { mergeReading, parseReading, rememberReading, toggleBookmark } from "@/lib/reading-state";
import { updateReading, useReadingState } from "@/lib/use-reading-state";
import { readerSections } from "@/lib/reader-sections";
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
import { ADJECTIVE_LADDER, safeJsonDownload, type Language } from "@/lib/fate";
import { MAX_ROOM_FILES_PER_UPLOAD, type RoomEntry, type RoomFileData } from "@/lib/room-contracts";
import { prepareRuleHtml } from "@/lib/rule-content";
import { getContextRules, type TableConfig } from "@/lib/table-config";
import { formatStorageBytes } from "@/lib/storage-policy";
import type { RoomStore } from "@/lib/use-room";

const sources = readerCatalog.sources;

function localized(value: Localized, language: Language) {
  return value[language];
}

const interfaceCopy = {
  pt: {
    principalEyebrow: "Fate Condensado · regra principal",
    heading: "Central de Regras",
    introduction: "Comece com o livro. Mude só o que ajudar a mesa.",
    languageAria: "Idioma das regras",
    browseBooks: "Escolher outro livro",
    readingNow: "Na sua leitura",
    chapterPosition: (index: number, total: number) => `Capítulo ${index} de ${total}`,
    readingTime: (minutes: number) => `${minutes} min de leitura`,
    previousChapter: "Capítulo anterior",
    nextChapter: "Próximo capítulo",
    privateBooks: "PDFs da sua Mesa",
    searchPlaceholder: "Busque uma regra, um termo ou uma ideia…",
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
    searchAria: "Buscar regras",
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
    browseBooks: "Choose another book",
    readingNow: "Now reading",
    chapterPosition: (index: number, total: number) => `Chapter ${index} of ${total}`,
    readingTime: (minutes: number) => `${minutes} min read`,
    previousChapter: "Previous chapter",
    nextChapter: "Next chapter",
    privateBooks: "Your Table’s PDFs",
    searchPlaceholder: "Find a rule, a term, or an idea…",
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
    searchAria: "Search rules",
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
  const reading = useReadingState();
  const [location, setLocation] = React.useState<ReaderLocation>(DEFAULT_READING);
  const { language, sourceId, chapterId } = location;
  const [initialized, setInitialized] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<"book" | "all">("book");
  const [resultLimit, setResultLimit] = React.useState(20);
  const deferredQuery = React.useDeferredValue(query);
  const [book, setBook] = React.useState<BookText | null>(null);
  const [bookError, setBookError] = React.useState("");
  const [allSearch, setAllSearch] = React.useState<{ language: Language; documents: SearchDocument[] } | null>(null);
  const [searchError, setSearchError] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [savedOpen, setSavedOpen] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const catalogRef = React.useRef<HTMLDetailsElement>(null);
  const sectionsRef = React.useRef<HTMLDetailsElement>(null);
  const searchInput = React.useRef<HTMLInputElement>(null);
  const importInput = React.useRef<HTMLInputElement>(null);
  const scrollIntent = React.useRef<"restore" | "start">("restore");
  const visibleAnchor = React.useRef("");
  const contextualRules = getContextRules(tableConfig, "rules");
  const copy = interfaceCopy[language];
  const currentSource = sources.find(source => source.id === sourceId) ?? sources[0];
  const current = currentSource.chapters.find(chapter => chapter.id === chapterId) ?? currentSource.chapters[0];
  const currentIndex = currentSource.chapters.findIndex(chapter => chapter.id === current.id);
  const previousChapter = currentSource.chapters[currentIndex - 1];
  const nextChapter = currentSource.chapters[currentIndex + 1];
  const rawHtml = book?.sourceId === sourceId && book.language === language ? book.chapters[current.id] : undefined;
  const prepared = React.useMemo(() => readerSections(prepareRuleHtml(rawHtml ?? "", language)), [rawHtml, language]);
  const readingMinutes = Math.max(1, Math.ceil(current.wordCount[language] / 220));
  const key = readingKey(location);
  const bookmarked = reading.state.bookmarks.some(item => readingKey(item) === key);
  const needsSearch = scope === "all" && query.trim().length >= 2;

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      let saved = DEFAULT_READING;
      try { const raw = localStorage.getItem("fate-gameplay-toolkit.reading.v1"); if (raw) saved = parseReading(JSON.parse(raw)).last; } catch { /* Use the session default without deleting unreadable data. */ }
      setLocation(readingFromHash(window.location.hash) ?? saved);
      setInitialized(true);
    }, 0);
    const navigate = () => {
      const target = readingFromHash(window.location.hash);
      if (target) { scrollIntent.current = "restore"; setLocation(target); }
    };
    window.addEventListener("hashchange", navigate);
    return () => { window.clearTimeout(handle); window.removeEventListener("hashchange", navigate); };
  }, []);

  React.useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    loadBook(currentSource, language).then(value => {
      if (!cancelled) { setBook(value); setBookError(""); }
    }).catch(() => { if (!cancelled) setBookError(currentSource.id + ":" + language); });
    return () => { cancelled = true; };
  }, [currentSource, language, initialized, retry]);

  React.useEffect(() => {
    if (!needsSearch) return;
    let cancelled = false;
    loadSearch(language).then(documents => {
      if (!cancelled) { setAllSearch({ language, documents }); setSearchError(false); }
    }).catch(() => { if (!cancelled) setSearchError(true); });
    return () => { cancelled = true; };
  }, [needsSearch, language, retry]);

  const bookSearch = React.useMemo(() => bookSearchDocuments(book, sourceId, language), [book, sourceId, language]);
  const documents = scope === "all" ? allSearch?.language === language ? allSearch.documents : EMPTY_SEARCH : bookSearch;
  const results = React.useMemo(() => searchChapters(documents, deferredQuery, language), [documents, deferredQuery, language]);
  const customResults = React.useMemo(() => {
    const terms = normalizeSearch(deferredQuery.trim()).split(/\s+/);
    return deferredQuery.trim().length < 2 ? [] : tableConfig.customRules.filter(rule => rule.enabled && terms.every(term => normalizeSearch(rule.name + " " + rule.description).includes(term)));
  }, [deferredQuery, tableConfig.customRules]);

  // Restore after the selected language has loaded; never display the previous language as a fallback.
  React.useEffect(() => {
    if (!initialized || rawHtml === undefined) return;
    const reader = document.getElementById("rule-reader");
    const prose = reader?.querySelector<HTMLElement>(".rule-prose");
    if (!reader || !prose) return;
    const saved = reading.state.positions[key];
    const intent = scrollIntent.current;
    let ready = false;
    let timer = 0;
    let lastPosition = saved;
    const frame = requestAnimationFrame(() => {
      const anchor = location.anchor || (intent === "restore" ? saved?.anchor : "");
      const element = anchor ? document.getElementById(anchor) : null;
      const top = element && prose.contains(element) ? element.getBoundingClientRect().top + window.scrollY + (location.anchor ? 0 : saved?.offset ?? 0) - 110 : reader.getBoundingClientRect().top + window.scrollY - 90;
      if (intent === "start" || anchor || saved?.progress) window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      if (intent === "start" || location.anchor) reader.focus({ preventScroll: true });
      ready = true;
      updateReading(state => rememberReading(state, location));
    });
    const measure = () => {
      if (!ready) return;
      const blocks = Array.from(prose.querySelectorAll<HTMLElement>('[id]'));
      const visible = blocks.filter(element => element.getBoundingClientRect().top <= 120).at(-1) ?? blocks[0];
      const rect = prose.getBoundingClientRect();
      // Do not replace a saved position while the reader is completely below the viewport.
      if (rect.top > window.innerHeight) return;
      visibleAnchor.current = visible?.id ?? "";
      lastPosition = { anchor: visible?.id ?? "", offset: visible ? 110 - visible.getBoundingClientRect().top : 0, progress: Math.max(0, Math.min(1, (110 - rect.top) / Math.max(1, rect.height - window.innerHeight + 110))) };
      updateReading(state => ({ ...state, positions: { ...state.positions, [key]: lastPosition! } }));
    };
    const scroll = () => { window.clearTimeout(timer); timer = window.setTimeout(measure, 450); };
    const saveBeforeLeaving = () => { window.clearTimeout(timer); measure(); };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); window.removeEventListener("scroll", scroll); window.removeEventListener("pagehide", saveBeforeLeaving); if (lastPosition) updateReading(state => ({ ...state, positions: { ...state.positions, [key]: lastPosition } })); };
    // Position changes are saved by this effect; only navigation/content should restore the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, rawHtml, key, location.anchor]);

  const navigate = (target: ReaderLocation, intent: "restore" | "start" = "start") => {
    scrollIntent.current = intent;
    visibleAnchor.current = "";
    setLocation(target);
    updateReading(state => rememberReading(state, target));
    const hash = readingHash(target);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    setSavedOpen(false);
    if (sectionsRef.current) sectionsRef.current.open = false;
  };
  const chooseChapter = (id: string) => navigate({ sourceId, chapterId: id, language });
  const chooseSource = (source: ReaderSource) => {
    if (catalogRef.current) catalogRef.current.open = false;
    navigate(reading.state.recent.find(item => item.sourceId === source.id && item.language === language) ?? { sourceId: source.id, chapterId: source.chapters[0].id, language }, "restore");
    setQuery("");
  };
  const chooseResult = (source: ReaderSource, chapter: ReaderChapter) => { navigate({ sourceId: source.id, chapterId: chapter.id, language }); setQuery(""); };
  const changeLanguage = (next: Language) => navigate({ sourceId, chapterId, language: next }, "restore");
  const openCondensedOptions = () => navigate({ sourceId: sources[0].id, chapterId: sources[0].chapters.find(chapter => chapter.id === "opcionais")?.id ?? sources[0].chapters[0].id, language });

  React.useEffect(() => {
    if (!openReference) return;
    const parts = openReference.split(":");
    const legacy = !sources.some(item => item.id === parts[1]);
    const hash = readingHash({ sourceId: legacy ? "fate-condensed" : parts[1], chapterId: legacy ? parts[1] : parts[2], language: (legacy ? parts[2] : parts[3]) as Language });
    const target = readingFromHash(hash);
    if (!target) return;
    const handle = window.setTimeout(() => { scrollIntent.current = "start"; setLocation(target); window.history.replaceState(null, "", hash); }, 0);
    return () => window.clearTimeout(handle);
  }, [openReference]);

  const copyLink = async () => {
    const target = { ...location, ...(visibleAnchor.current ? { anchor: visibleAnchor.current } : {}) };
    const url = new URL(window.location.href);
    url.hash = readingHash(target);
    try { await navigator.clipboard.writeText(url.href); toast.success(language === "pt" ? "Link da leitura copiado." : "Reading link copied."); }
    catch { toast.error(language === "pt" ? "Não foi possível copiar. Copie o endereço na barra do navegador." : "Could not copy. Copy the address from your browser’s address bar."); window.history.replaceState(null, "", url); }
  };
  const importReading = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error();
      const incoming = parseReading(JSON.parse(await file.text()));
      const saved = updateReading(state => mergeReading(state, incoming));
      toast[saved ? "success" : "warning"](language === "pt" ? saved ? "Favoritos e posições de leitura importados." : "Importado apenas nesta aba: o navegador não conseguiu salvar." : saved ? "Bookmarks and reading positions imported." : "Imported in this tab only: browser storage is unavailable.");
    } catch { toast.error(language === "pt" ? "Escolha uma cópia de leitura exportada pela biblioteca (até 1 MB)." : "Choose a reading backup exported by this library (up to 1 MB)."); }
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
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    if (!href) return;
    try {
      const url = new URL(href, currentSource.referenceUrl[language]);
      const hash = decodeURIComponent(url.hash.slice(1));
      const slug = url.pathname.split('/').filter(Boolean).at(-1);
      const isSource = url.origin === new URL(currentSource.referenceUrl[language]).origin;
      const destination = isSource && currentSource.chapters.find(chapter => chapter.slugs?.[language] === slug || chapter.id === slug);
      if (destination || href.startsWith("#")) {
        event.preventDefault();
        navigate({ sourceId, chapterId: destination ? destination.id : chapterId, language, ...(hash ? { anchor: hash } : {}) });
      }
    } catch { /* Leave unknown external references to the browser. */ }
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
            <Button size="sm" variant={language === "pt" ? "default" : "outline"} aria-pressed={language === "pt"} onClick={() => changeLanguage("pt")}>PT-BR</Button>
            <Button size="sm" variant={language === "en" ? "default" : "outline"} aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>English</Button>
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


      <details className="rule-source-catalog" ref={catalogRef}>
        <summary className="library-book-selector">
          <span className="library-book-icon" aria-hidden="true"><BookOpen /></span>
          <span className="library-book-current"><small>{copy.readingNow}</small><b>{localized(currentSource.title, language)}</b></span>
          <span className="library-book-change">{copy.browseBooks} <ChevronDown aria-hidden="true" /></span>
        </summary>
        <div className="library-catalog-body">
        <header className="rule-source-catalog-header">
          <div className="rule-source-catalog-title">
            <p className="eyebrow">{copy.libraryEyebrow}</p>
            <h2 id="rule-sources-heading">{copy.libraryHeading}</h2>
          </div>
          <p className="rule-source-catalog-principle">{localized(readerCatalog.precedence, language)}</p>
        </header>
        <div className="rule-source-list">
          {sources.map((source, index) => (
            <button
              className={source.kind === "principal" ? "rule-source-choice is-principal" : "rule-source-choice"}
              data-active={source.id === currentSource.id}
              data-source={source.id}
              key={source.id}
              type="button"
              aria-pressed={source.id === currentSource.id}
              onClick={() => chooseSource(source)}
            >
              <span className="book-edition-line" aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><BookOpen /></span>
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
        </div>
      </details>



      {tableConfig.customRules.some((rule) => rule.enabled && rule.scopes.includes("rules")) && (
        <aside className="house-rules-reference" aria-label={copy.customRulesAria}>
          <header><Sparkles /><div><p className="eyebrow">{copy.writtenByTable}</p><h2>{copy.ownRules}</h2></div></header>
          <div>{tableConfig.customRules.filter((rule) => rule.enabled && rule.scopes.includes("rules")).map((rule) => <article key={rule.id}><span>{copy.tableRule}</span><b>{rule.name}</b><p>{rule.description}</p></article>)}</div>
        </aside>
      )}

      <div className="rule-search-wrap">
        <Search aria-hidden="true" />
        <Input ref={searchInput} value={query} maxLength={160} onChange={(event) => { setQuery(event.target.value); setResultLimit(20); }} onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} aria-label={copy.searchAria} placeholder={copy.searchPlaceholder} />
        {query && <Button variant="ghost" size="icon-sm" onClick={() => setQuery("")} aria-label={copy.clearSearch}><X /></Button>}
      </div>

      <div className="reader-search-options">
        <label htmlFor="reader-search-scope">{language === "pt" ? "Buscar em" : "Search in"}</label>
        <NativeSelect id="reader-search-scope" value={scope} onChange={event => { setScope(event.target.value as "book" | "all"); setResultLimit(20); }}>
          <NativeSelectOption value="book">{language === "pt" ? "Livro aberto" : "Current book"}</NativeSelectOption>
          <NativeSelectOption value="all">{language === "pt" ? "Toda a biblioteca" : "Entire library"}</NativeSelectOption>
        </NativeSelect>
        <Button variant="ghost" size="sm" onClick={() => setSavedOpen(true)}><Bookmark /> {language === "pt" ? "Minha leitura" : "My reading"}</Button>
      </div>
      {query.trim().length >= 2 && (
        <div className="rule-search-results" aria-live="polite">
          {(scope === "all" && allSearch?.language !== language) || (scope === "book" && !rawHtml) ? <p role="status">{(scope === "all" && searchError) || bookError === sourceId + ":" + language ? <><span>{language === "pt" ? "A busca não carregou. Confira a conexão." : "Search could not load. Check your connection."}</span> <Button size="sm" variant="outline" onClick={() => setRetry(value => value + 1)}>{language === "pt" ? "Tentar de novo" : "Try again"}</Button></> : <><Loader2 className="animate-spin" /> {language === "pt" ? "Preparando a busca…" : "Preparing search…"}</>}</p> : <p>{results.length + customResults.length ? copy.result(results.length + customResults.length) : copy.noResults}</p>}
          {customResults.map((rule) => (
            <article className="custom-rule-search-hit" key={rule.id}>
              <small>{copy.tableRule}</small><b>{rule.name}</b><span>{rule.description}</span>
            </article>
          ))}
          {results.slice(0, resultLimit).map(hit => {
            const source = sources.find(item => item.id === hit.sourceId)!;
            const chapter = source.chapters.find(item => item.id === hit.chapterId)!;
            return <button key={source.id + ":" + chapter.id} type="button" onClick={() => chooseResult(source, chapter)}>
              <small>{localized(source.shortTitle, language)} · {chapterModeLabel(chapter, language)}</small>
              <b>{localized(chapter.title, language)}</b><span>{hit.snippet}</span>
            </button>;
          })}
          {results.length > resultLimit && <Button variant="outline" onClick={() => setResultLimit(value => value + 20)}>{language === "pt" ? "Mostrar mais resultados" : "Show more results"}</Button>}
        </div>
      )}

      <div className="chapter-mobile-picker">
        <label htmlFor="rule-chapter-select">{copy.chapter}</label>
        <NativeSelect
          id="rule-chapter-select"
          value={current.id}
          onChange={(event) => chooseChapter(event.target.value)}
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
          <div className="chapter-nav-heading"><BookOpen aria-hidden="true" /><span>{copy.chapters}</span><small>{currentSource.chapters.length}</small></div>
          {currentSource.chapters.map((chapter, index) => (
            <button key={chapter.id} type="button" aria-current={chapter.id === current.id ? "page" : undefined} onClick={() => chooseChapter(chapter.id)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {localized(chapter.title, language)}
            </button>
          ))}
        </nav>

        <article id="rule-reader" className="rule-reader" lang={language === "pt" ? "pt-BR" : "en"} tabIndex={-1}>
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
          <div className="reading-status"><span>{copy.chapterPosition(currentIndex + 1, currentSource.chapters.length)}</span><span>{copy.readingTime(readingMinutes)}</span></div>
          <div className="reader-tools">
            <Button variant="ghost" size="sm" aria-pressed={bookmarked} onClick={() => updateReading(state => toggleBookmark(state, { ...location, ...(visibleAnchor.current ? { anchor: visibleAnchor.current } : {}) }))}>{bookmarked ? <Check /> : <Bookmark />} {language === "pt" ? bookmarked ? "Salvo nos favoritos" : "Salvar favorito" : bookmarked ? "Bookmarked" : "Bookmark"}</Button>
            <Button variant="ghost" size="sm" onClick={() => void copyLink()}><Link2 /> {language === "pt" ? "Copiar link" : "Copy link"}</Button>
            {prepared.sections.length > 0 && <details className="reader-sections" ref={sectionsRef}><summary><List /> {language === "pt" ? "Neste capítulo" : "In this chapter"}<ChevronDown /></summary><nav aria-label={language === "pt" ? "Seções deste capítulo" : "Sections in this chapter"}>{prepared.sections.map(section => <a key={section.id} data-level={section.level} href={readingHash({ sourceId, chapterId, language, anchor: section.id })} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate({ sourceId, chapterId, language, anchor: section.id }); } }}>{section.title}</a>)}</nav></details>}
          </div>
          {!reading.saved && <p className="reader-state-notice" role="status">{language === "pt" ? "A leitura está guardada só nesta aba. Exporte uma cópia em Minha leitura para preservá-la." : "Reading is saved in this tab only. Export a copy from My reading to keep it."}</p>}
          {rawHtml === undefined ? <div className="reader-loading" role="status">{bookError === sourceId + ":" + language ? <><p>{language === "pt" ? "Não foi possível abrir este livro. Confira a conexão e tente novamente." : "Could not open this book. Check your connection and try again."}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{language === "pt" ? "Tentar de novo" : "Try again"}</Button></> : <><Loader2 className="animate-spin" /><p>{language === "pt" ? "Abrindo o texto em português…" : "Opening the English text…"}</p></>}</div> : <div className="rule-prose" onClick={followRuleLink} dangerouslySetInnerHTML={{ __html: prepared.html }} />}
          <nav className="reader-pagination" aria-label={copy.chapters}>
            {previousChapter ? <button type="button" onClick={() => chooseChapter(previousChapter.id)}><ArrowLeft aria-hidden="true" /><span><small>{copy.previousChapter}</small><b>{localized(previousChapter.title, language)}</b></span></button> : <span />}
            {nextChapter ? <button type="button" onClick={() => chooseChapter(nextChapter.id)}><span><small>{copy.nextChapter}</small><b>{localized(nextChapter.title, language)}</b></span><ArrowRight aria-hidden="true" /></button> : <span />}
          </nav>
      <details className="license-note reader-credits">
        <summary>{copy.sourceCredits}<ChevronDown aria-hidden="true" /></summary>
        <div className="reader-credits-body">
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
          <a href={currentSource.licenseUrlByLanguage?.[language] ?? currentSource.licenseUrl} target="_blank" rel="noreferrer">{copy.licenseAndUse} <ExternalLink /></a>
        </div>
        </div>
      </details>
          <footer className="rule-sources">
            <a href={localized(currentSource.referenceUrl, language)} target="_blank" rel="noreferrer">{copy.checkSource} <ExternalLink /></a>
            <a href={currentSource.officialUrl} target="_blank" rel="noreferrer">{copy.seeBook} <ExternalLink /></a>
          </footer>
        </article>
      </div>
      <Dialog open={savedOpen} onOpenChange={setSavedOpen}>
        <DialogContent className="reading-library-dialog">
          <DialogHeader><DialogTitle>{language === "pt" ? "Minha leitura" : "My reading"}</DialogTitle><DialogDescription>{language === "pt" ? "Retome seus capítulos e leve seus favoritos para outro dispositivo. A cópia reúne apenas suas marcações de leitura." : "Resume your chapters and take your bookmarks to another device. The backup contains only your reading marks."}</DialogDescription></DialogHeader>
          <div className="reading-saved-list">
            {[{ title: language === "pt" ? "Favoritos" : "Bookmarks", items: reading.state.bookmarks }, { title: language === "pt" ? "Última leitura por livro e idioma" : "Last read by book and language", items: reading.state.recent }].map(group => <section key={group.title}><h3>{group.title}</h3>{!group.items.length && <p>{language === "pt" ? "Salve um capítulo usando Salvar favorito." : "Save a chapter using Bookmark."}</p>}{group.items.map(item => {
              const source = sources.find(source => source.id === item.sourceId)!;
              const chapter = source.chapters.find(chapter => chapter.id === item.chapterId)!;
              const progress = reading.state.positions[readingKey(item)]?.progress ?? 0;
              return <button key={readingKey(item)} type="button" onClick={() => navigate(item, "restore")}><BookOpen /><span><small>{source.shortTitle[language]} · {item.language === "pt" ? "PT-BR" : "English"}</small><b>{chapter.title[language]}</b><small>{Math.round(progress * 100)}% {language === "pt" ? "do capítulo" : "of chapter"}</small></span><ArrowRight /></button>;
            })}</section>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => safeJsonDownload("fate-minha-leitura.json", reading.state)}><Download /> {language === "pt" ? "Exportar leitura" : "Export reading"}</Button><Button variant="outline" onClick={() => importInput.current?.click()}><FileUp /> {language === "pt" ? "Importar leitura" : "Import reading"}</Button><input ref={importInput} hidden type="file" accept=".json,application/json" onChange={event => void importReading(event)} /></DialogFooter>
        </DialogContent>
      </Dialog>
      <details className="private-library-disclosure">
        <summary><LockKeyhole aria-hidden="true" /><span>{copy.privateBooks}</span><ChevronDown aria-hidden="true" /></summary>
        <PrivateTableLibrary language={language} store={roomStore} onOpenRooms={onOpenRooms} />
      </details>
    </section>
  );
}
