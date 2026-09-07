"use client";

import * as React from "react";
import { BookOpen, ExternalLink, Search, Send, Settings2, Sparkles, X } from "lucide-react";
import rulesData from "@/content/rules.json";
import expansionData from "@/content/expansions.json";
import terminologyData from "@/content/fate-terminology.json";
import { Button } from "@/components/ui/button";
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
import { getContextRules, type TableConfig } from "@/lib/table-config";

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

export function RulesLibrary({
  onShareRule,
  roomReady,
  openReference,
  tableConfig,
  onOpenSettings,
}: {
  onShareRule?: (title: string, reference: string) => Promise<void> | void;
  roomReady?: boolean;
  openReference?: string;
  tableConfig: TableConfig;
  onOpenSettings: () => void;
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
