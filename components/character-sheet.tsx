"use client";

import * as React from "react";
import { BookOpen, ChevronDown, Copy, Download, Eye, FileUp, Link2, Pencil, Plus, RotateCcw, Settings2, Sparkles, Trash2, Undo2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { SheetImage } from "@/components/sheet-image";
import { SheetView } from "@/components/sheet-view";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adjectiveFor, safeJsonDownload, type FateCharacter, type SheetLinks } from "@/lib/fate";
import type { RulesProfile } from "@/lib/rules-profiles";
import { aspectValue, clearStress, consequenceValue, resourceValue, sheetHasExtraMild, stressBoxes, stressMarks, withAspectValue, withConsequenceValue, withResourceValue, withStressMark } from "@/lib/sheet-data";
import { SKILL_PRESETS, getSkillDefinitions, type TableConfig } from "@/lib/table-config";
import type { SavedRoom } from "@/lib/use-room";

type CharacterStore = {
  characters: FateCharacter[];
  activeCharacter: FateCharacter;
  activeId: string;
  setActiveId: (id: string) => void;
  updateActive: (updater: (character: FateCharacter) => FateCharacter, remember?: boolean) => void;
  addCharacter: (name?: string, links?: Partial<SheetLinks>) => FateCharacter;
  duplicateCharacter: () => void;
  deleteActive: () => void;
  importCharacter: (input: unknown, links?: Partial<SheetLinks>) => Promise<FateCharacter>;
  exportCharacter: (character: FateCharacter) => Promise<FateCharacter>;
  undo: () => void;
  hydrated: boolean;
};

const CONDITIONS = [
  { severity: "Leve", value: 1, physical: "Arranhado", mental: "Assustado", key: "mild" },
  { severity: "Moderado", value: 2, physical: "Machucado", mental: "Abalado", key: "moderate" },
  { severity: "Severo", value: 3, physical: "Ferido", mental: "Desmoralizado", key: "severe" },
] as const;

const SHAPE_HINTS: Record<TableConfig["skillSystem"]["shape"], string> = {
  pyramid: "Pirâmide: cada nível costuma ter uma Perícia a mais que o nível acima.",
  diamond: "Diamante: poucos valores nos extremos e mais Perícias no meio.",
  column: "Coluna: a mesma quantidade de Perícias em cada nível.",
  free: "Livre com limite: distribua como fizer sentido, respeitando o teto escolhido.",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-bar">{children}</h2>;
}

function Counter({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (value: number) => void; label: string }) {
  return <div className="counter" role="group" aria-label={label}><Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Diminuir ${label}`}>−</Button><output aria-live="polite">{value}</output><Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Aumentar ${label}`}>+</Button></div>;
}

function Translation({ children, show }: { children?: string; show: boolean }) {
  return show && children ? <small>{children}</small> : null;
}

type CharacterSheetProps = {
  store: CharacterStore;
  tableConfig: TableConfig;
  rulesProfiles: RulesProfile[];
  activeRulesProfileId: string;
  savedRooms: SavedRoom[];
  onOpenLinkedRoom: (participantId: string) => Promise<void>;
  onOpenLinkedRules: (profileId: string) => void;
  onOpenRulesSettings: (profileId: string) => void;
  onSelectRulesProfile: (profileId: string) => void;
  onImportTableConfig: (input: unknown) => RulesProfile;
};

export function CharacterSheet({ store, tableConfig, rulesProfiles, activeRulesProfileId, savedRooms, onOpenLinkedRoom, onOpenLinkedRules, onOpenRulesSettings, onSelectRulesProfile, onImportTableConfig }: CharacterSheetProps) {
  const character = store.activeCharacter;
  const structure = tableConfig.sheetStructure;
  const [newName, setNewName] = React.useState("");
  const [newOpen, setNewOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"edit" | "view">("edit");
  const [linksOpen, setLinksOpen] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      const saved = localStorage.getItem("fate-gameplay-toolkit.sheet-mode");
      if (saved === "edit" || saved === "view") setMode(saved);
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  const changeMode = (next: "edit" | "view") => {
    setMode(next);
    try {
      localStorage.setItem("fate-gameplay-toolkit.sheet-mode", next);
    } catch {
      toast.info("O modo foi alterado, mas o navegador não conseguiu lembrar esta preferência.");
    }
  };

  const linkedRoom = savedRooms.find((room) => room.session.participantId === character.optional.links.roomParticipantId);
  const linkedProfile = rulesProfiles.find((profile) => profile.id === character.optional.links.rulesProfileId)
    ?? rulesProfiles.find((profile) => profile.id === activeRulesProfileId)
    ?? rulesProfiles[0];

  const setLinks = (next: Partial<SheetLinks>) => store.updateActive((current) => ({
    ...current,
    optional: { ...current.optional, links: { ...current.optional.links, ...next } },
  }));

  const chooseRoom = (participantId: string) => setLinks({ roomParticipantId: participantId === "none" ? "" : participantId });
  const chooseRules = (rulesProfileId: string) => {
    setLinks({ rulesProfileId });
    onSelectRulesProfile(rulesProfileId);
  };

  const skills = getSkillDefinitions(tableConfig);
  const extraMild = sheetHasExtraMild(character, tableConfig);
  const customSheetRules = tableConfig.customRules.filter((rule) => rule.enabled && rule.scopes.includes("sheet"));
  const listName = tableConfig.skillSystem.preset === "custom" ? "Lista da Mesa" : SKILL_PRESETS[tableConfig.skillSystem.preset].name;
  const visibleConsequences = structure.consequences.filter((item) => item.availability === "always" || extraMild);

  const changeOptional = (next: Partial<FateCharacter["optional"]>) => store.updateActive((current) => ({ ...current, optional: { ...current.optional, ...next } }));
  const setCustomValue = (ruleId: string, value: string) => store.updateActive((current) => ({ ...current, optional: { ...current.optional, customValues: { ...current.optional.customValues, [ruleId]: value } } }));
  const toggleCondition = (key: string, index: number, checked: boolean) => store.updateActive((current) => {
    const existing = current.optional.conditionMarks[key] ?? [];
    const marks = Array.from({ length: Math.max(existing.length, index + 1) }, (_, markIndex) => existing[markIndex] ?? false);
    marks[index] = checked;
    return { ...current, optional: { ...current.optional, conditionMarks: { ...current.optional.conditionMarks, [key]: marks } } };
  });

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) return toast.error("Esse arquivo é grande demais para ser uma Ficha exportada por esta ferramenta.");
    try {
      const parsed = JSON.parse(await file.text()) as { sheet?: unknown; tableConfig?: unknown };
      const importedProfile = parsed && typeof parsed === "object" && parsed.tableConfig
        ? onImportTableConfig(parsed.tableConfig)
        : null;
      const imported = await store.importCharacter(
        parsed && typeof parsed === "object" && "sheet" in parsed ? parsed.sheet : parsed,
        { rulesProfileId: importedProfile?.id ?? activeRulesProfileId },
      );
      toast.success(`${imported.name || "Ficha"} foi importada sem substituir as demais${parsed?.tableConfig ? ", com sua configuração" : ""}.`);
    } catch {
      toast.error("O arquivo não é uma Ficha válida desta ferramenta.");
    }
  };

  const exportSheet = async () => {
    try {
      const exportable = await store.exportCharacter(character);
      safeJsonDownload(`${character.name || "ficha"}.fate.json`, { format: "fate-sheet", bundleVersion: 4, exportedAt: Date.now(), sheet: exportable, tableConfig });
      toast.success("Ficha exportada com sua imagem.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A Ficha não pôde ser exportada.");
    }
  };
  const resetScene = () => {
    store.updateActive((current) => clearStress(current, structure.stressTracks.map((track) => track.id)));
    toast.success("Estresse limpo para a próxima cena.");
  };
  const startSession = () => {
    store.updateActive((current) => withResourceValue(current, "fatePoints", String(Math.max(current.refresh, current.session.fatePoints))));
    toast.success("Pontos de Destino conferidos pela Recarga.");
  };

  if (!store.hydrated) return <div className="loading-panel" aria-live="polite">Abrindo suas Fichas…</div>;

  return (
    <section className="workspace-panel sheet-workspace" aria-labelledby="sheet-heading">
      <header className="workspace-toolbar sheet-toolbar">
        <h1 id="sheet-heading" className="sr-only">{character.name || "Ficha sem nome"}</h1>
        <div className="toolbar-actions sheet-toolbar-actions">
          <Select value={store.activeId} onValueChange={store.setActiveId}><SelectTrigger className="character-picker" aria-label="Escolher Ficha"><SelectValue /></SelectTrigger><SelectContent>{store.characters.map((item) => <SelectItem key={item.id} value={item.id}>{item.name || "Sem nome"}</SelectItem>)}</SelectContent></Select>
          <div className="sheet-mode-switch" role="group" aria-label="Modo da Ficha"><Button type="button" size="sm" variant={mode === "edit" ? "default" : "ghost"} aria-pressed={mode === "edit"} onClick={() => changeMode("edit")}><Pencil /> Editar</Button><Button type="button" size="sm" variant={mode === "view" ? "default" : "ghost"} aria-pressed={mode === "view"} onClick={() => changeMode("view")}><Eye /> Visualizar</Button></div>
          {mode === "edit" && <div className="sheet-edit-actions">
            <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogTrigger asChild><Button className="sheet-new-action" size="sm"><Plus /> Nova Ficha</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Nova Ficha</DialogTitle><DialogDescription>Ela pode representar uma pessoa, criatura, veículo, lugar, organização ou qualquer outra coisa.</DialogDescription></DialogHeader><Label htmlFor="new-sheet-name">Nome da Ficha</Label><Input id="new-sheet-name" value={newName} maxLength={240} autoFocus onChange={(event) => setNewName(event.target.value)} /><DialogFooter><Button onClick={() => { store.addCharacter(newName.trim() || undefined, { rulesProfileId: activeRulesProfileId }); setNewName(""); setNewOpen(false); }}>Criar Ficha</Button></DialogFooter></DialogContent></Dialog>
            <div className="sheet-utility-actions" role="group" aria-label="Ações desta Ficha">
              <Button variant="outline" size="icon-sm" onClick={store.undo} aria-label="Desfazer última mudança"><Undo2 /></Button><Button variant="outline" size="icon-sm" onClick={store.duplicateCharacter} aria-label="Duplicar Ficha"><Copy /></Button><Button variant="outline" size="icon-sm" onClick={() => void exportSheet()} aria-label="Exportar Ficha"><Download /></Button><Button variant="outline" size="icon-sm" onClick={() => fileInput.current?.click()} aria-label="Importar Ficha"><FileUp /></Button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
              <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="icon-sm" aria-label="Excluir Ficha"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir esta Ficha?</AlertDialogTitle><AlertDialogDescription>Ela sairá deste dispositivo. Exporte antes se quiser guardar uma cópia completa.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={store.deleteActive}>Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            </div>
          </div>}
        </div>
      </header>

      <div className="sheet-links-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="active-profile-strip table-link-strip" type="button" aria-label="Abrir Mesa ou regras desta Ficha">
              <Link2 aria-hidden="true" />
              <div><b>Mesa: {linkedRoom?.roomName || "Nenhuma"}</b><span>Regras: {linkedProfile?.config.profileName || "Fate Condensado"}</span></div>
              <ChevronDown aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="sheet-links-menu" align="start">
            {linkedRoom
              ? <DropdownMenuItem onSelect={() => void onOpenLinkedRoom(linkedRoom.session.participantId).catch((error) => toast.error(error instanceof Error ? error.message : "A Mesa não pôde ser aberta."))}><UsersRound /> Mesa: {linkedRoom.roomName || "Mesa vinculada"}</DropdownMenuItem>
              : <DropdownMenuItem onSelect={() => setLinksOpen(true)}><UsersRound /> Mesa: escolher</DropdownMenuItem>}
            {linkedProfile && <DropdownMenuItem onSelect={() => onOpenLinkedRules(linkedProfile.id)}><BookOpen /> Regras: {linkedProfile.config.profileName}</DropdownMenuItem>}
            {mode === "edit" && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setLinksOpen(true)}><Settings2 /> Ajustar escolhas</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={linksOpen} onOpenChange={setLinksOpen}>
          <DialogContent className="sheet-links-dialog">
            <DialogHeader className="sr-only"><DialogTitle>Escolhas da Ficha</DialogTitle><DialogDescription>Escolha a Mesa e as regras desta Ficha.</DialogDescription></DialogHeader>
            <Label className="field-stack"><span>Mesa:</span><Select value={linkedRoom?.session.participantId ?? "none"} onValueChange={chooseRoom}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhuma</SelectItem>{savedRooms.map((room) => <SelectItem key={room.session.participantId} value={room.session.participantId}>{room.roomName || `Mesa ${room.session.roomCode}`}</SelectItem>)}</SelectContent></Select></Label>
            <Label className="field-stack"><span>Regras:</span><Select value={linkedProfile?.id ?? activeRulesProfileId} onValueChange={chooseRules}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rulesProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.config.profileName}</SelectItem>)}</SelectContent></Select></Label>
          </DialogContent>
        </Dialog>
      </div>

      {mode === "view" ? <SheetView character={character} tableConfig={tableConfig} /> : <div className="sheet-editor">
        {tableConfig.createDuringPlay && <aside className="friendly-note"><Sparkles aria-hidden="true" /><p><b>Pode começar pequeno.</b> Nome, conceito e um ponto forte já bastam. Complete a Ficha quando a história pedir.</p></aside>}

        <section className="sheet-identity-editor">
          <SheetImage image={character.optional.image} name={character.name} shape={structure.imageShape} editable onChange={(image) => changeOptional({ image })} />
          <div className="sheet-identity-fields"><Label className="field-stack"><span>{structure.labels.name}</span><Textarea className="sheet-name-field" value={character.name} maxLength={240} rows={1} onChange={(event) => store.updateActive((current) => ({ ...current, name: event.target.value }))} /></Label><Label className="field-stack"><span>{structure.labels.description}</span><Textarea value={character.description} maxLength={8000} rows={4} onChange={(event) => store.updateActive((current) => ({ ...current, description: event.target.value }))} /></Label></div>
        </section>

        <div className="sheet-grid sheet-grid-top">
          <section className="sheet-aspects-section"><SectionTitle>{structure.labels.aspects}</SectionTitle><div className="sheet-section-body aspect-list">{structure.aspects.length ? structure.aspects.map((aspect) => <Label key={aspect.id} className="field-stack"><span>{aspect.label} <Translation show={structure.showTranslations}>{aspect.translation}</Translation></span><Textarea value={aspectValue(character, aspect.id)} maxLength={4000} rows={2} onChange={(event) => store.updateActive((current) => withAspectValue(current, aspect.id, event.target.value))} /></Label>) : <div className="empty-editor-state">Nenhum tipo de Aspecto neste perfil. Você pode adicioná-los em “Seu Fate”.</div>}</div></section>

          <section className="sheet-state-section"><SectionTitle>{structure.labels.state}</SectionTitle><div className="sheet-section-body vitals">
            {structure.resources.length > 0 && <div className="resource-editor-grid">{structure.resources.map((resource) => {
              const raw = resourceValue(character, resource.id);
              if (resource.kind === "check") return <Label key={resource.id} className="resource-check"><Checkbox checked={raw === "true"} onCheckedChange={(checked) => store.updateActive((current) => withResourceValue(current, resource.id, checked === true ? "true" : "false"))} /><span>{resource.label}<Translation show={structure.showTranslations}>{resource.translation}</Translation></span></Label>;
              if (resource.kind === "text") return <Label key={resource.id} className="field-stack"><span>{resource.label}<Translation show={structure.showTranslations}>{resource.translation}</Translation></span><Input value={raw} maxLength={1200} onChange={(event) => store.updateActive((current) => withResourceValue(current, resource.id, event.target.value))} /></Label>;
              const value = Math.max(resource.minimum, Math.min(resource.maximum, Number(raw) || 0));
              return <div key={resource.id} className="resource-counter"><span className="field-label">{resource.label}<Translation show={structure.showTranslations}>{resource.translation}</Translation></span><Counter value={value} min={resource.minimum} max={resource.maximum} label={resource.label} onChange={(next) => store.updateActive((current) => withResourceValue(current, resource.id, String(next)))} /></div>;
            })}</div>}

            {structure.stressTracks.map((track) => { const count = stressBoxes(character, track); const marks = stressMarks(character, track.id); return <div className="stress-track" key={track.id}><span className="field-label">{track.label}<Translation show={structure.showTranslations}>{track.translation}</Translation></span><div className="stress-boxes">{Array.from({ length: count }, (_, index) => <Checkbox key={index} checked={marks[index] ?? false} onCheckedChange={(checked) => store.updateActive((current) => withStressMark(current, track.id, index, checked === true))} aria-label={`${track.label}, caixa ${index + 1}`} />)}</div></div>; })}

            {tableConfig.damageMode === "consequences" ? <div className="consequence-list">{visibleConsequences.map((item) => <Label key={item.id} className="consequence-field"><span><b>{item.value}</b><span>{item.label}{item.qualifier && <small>{item.qualifier}</small>}<Translation show={structure.showTranslations}>{item.translation}</Translation></span></span><Textarea value={consequenceValue(character, item.id)} maxLength={4000} rows={2} onChange={(event) => store.updateActive((current) => withConsequenceValue(current, item.id, event.target.value))} /></Label>)}</div> : <div className="conditions-panel"><header><div><b>Condições</b><span>{tableConfig.damageMode === "split-conditions" ? "duas caixas por condição" : "uma caixa por condição"}</span></div>{extraMild && <Label>Suave extra em<Select value={character.optional.conditionExtraTrack} onValueChange={(conditionExtraTrack) => changeOptional({ conditionExtraTrack: conditionExtraTrack as "physical" | "mental" })}><SelectTrigger size="sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="physical">Físico</SelectItem><SelectItem value="mental">Mental</SelectItem></SelectContent></Select></Label>}</header><div className="condition-grid">{CONDITIONS.flatMap((condition) => (["physical", "mental"] as const).map((track) => { const key = `${condition.key}:${track}`; const extra = extraMild && condition.key === "mild" && character.optional.conditionExtraTrack === track ? 2 : 0; const count = (tableConfig.damageMode === "split-conditions" ? 2 : 1) + extra; const label = condition[track]; return <div className="condition-row" key={key}><span><b>{condition.value}</b><span>{label}<small>{condition.severity} · {track === "physical" ? "físico" : "mental"}</small></span></span><div>{Array.from({ length: count }, (_, index) => <Checkbox key={index} checked={character.optional.conditionMarks[key]?.[index] ?? false} onCheckedChange={(checked) => toggleCondition(key, index, checked === true)} aria-label={`${label}, caixa ${index + 1}`} />)}</div></div>; }))}</div><p>Marque conforme a ficção pedir. A Mesa continua livre para abrir ou fechar exceções.</p></div>}

            {tableConfig.officialRules.extremeConsequences && <Label className="consequence-field optional-feature-field"><span><b>8</b><span>Extrema<small>Muda um Aspecto</small></span></span><Textarea value={character.optional.extremeConsequence} maxLength={4000} rows={2} onChange={(event) => changeOptional({ extremeConsequence: event.target.value })} /></Label>}
            {(tableConfig.officialRules.scale || tableConfig.officialRules.weaponArmor) && <div className="sheet-options-row">{tableConfig.officialRules.scale && <Label className="field-stack"><span>Escala</span><Select value={character.optional.scale} onValueChange={(scale) => changeOptional({ scale: scale as FateCharacter["optional"]["scale"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mundane">Mundano</SelectItem><SelectItem value="supernatural">Sobrenatural</SelectItem><SelectItem value="otherworldly">Extramundano</SelectItem><SelectItem value="legendary">Lendário</SelectItem><SelectItem value="divine">Divino</SelectItem></SelectContent></Select></Label>}{tableConfig.officialRules.weaponArmor && <><div><span className="field-label">Arma</span><Counter value={character.optional.weaponRating} min={0} max={4} label="nível de Arma" onChange={(weaponRating) => changeOptional({ weaponRating })} /></div><div><span className="field-label">Armadura</span><Counter value={character.optional.armorRating} min={0} max={4} label="nível de Armadura" onChange={(armorRating) => changeOptional({ armorRating })} /></div></>}</div>}
            <div className="inline-actions"><Button variant="outline" size="sm" onClick={resetScene}><RotateCcw /> Encerrar cena</Button>{structure.resources.some((resource) => resource.id === "refresh") && structure.resources.some((resource) => resource.id === "fatePoints") && <Button variant="outline" size="sm" onClick={startSession}>Iniciar sessão</Button>}</div>
          </div></section>
        </div>

        <div className="sheet-grid sheet-grid-bottom">
          <section className="sheet-stunts-section"><SectionTitle>{structure.labels.stunts}</SectionTitle><div className="sheet-section-body stunt-list"><p className="section-hint">{structure.stunts.freeCount ? `As ${structure.stunts.freeCount} primeiras Façanhas são gratuitas no atual conjunto de regras.` : "Não há Façanhas gratuitas no atual conjunto de regras."}</p>{character.stunts.map((stunt, index) => <div className="stunt-row" key={index}><span aria-hidden="true">{index + 1}</span><Textarea value={stunt} maxLength={8000} rows={3} aria-label={`Façanha ${index + 1}`} onChange={(event) => store.updateActive((current) => { const stunts = [...current.stunts]; stunts[index] = event.target.value; return { ...current, stunts }; })} /><Button variant="ghost" size="icon-sm" aria-label={`Remover Façanha ${index + 1}`} onClick={() => store.updateActive((current) => ({ ...current, stunts: current.stunts.filter((_, stuntIndex) => stuntIndex !== index) }))}><Trash2 /></Button></div>)}{character.stunts.length < structure.stunts.maximum && <Button variant="outline" size="sm" onClick={() => store.updateActive((current) => ({ ...current, stunts: [...current.stunts, ""] }))}><Plus /> Adicionar Façanha</Button>}{!character.stunts.length && <p className="empty-editor-state">Nenhuma Façanha ainda.</p>}</div></section>

          <section className="sheet-skills-section"><SectionTitle>{structure.labels.skills}</SectionTitle><div className="sheet-section-body skill-list"><p className="section-hint"><b>{listName}.</b> {SHAPE_HINTS[tableConfig.skillSystem.shape]}</p>{skills.map((skill) => { const rating = character.skills[skill.id] ?? 0; const choices = Array.from({ length: tableConfig.skillSystem.ratingCeiling - tableConfig.skillSystem.ratingFloor + 1 }, (_, index) => tableConfig.skillSystem.ratingCeiling - index); if (!choices.includes(rating)) choices.push(rating); choices.sort((a, b) => b - a); return <div className="skill-row" key={skill.id}><Select value={String(rating)} onValueChange={(value) => store.updateActive((current) => ({ ...current, skills: { ...current.skills, [skill.id]: Number(value) } }))}><SelectTrigger size="sm" aria-label={`Nível de ${skill.pt}`}><SelectValue>{rating >= 0 ? `+${rating}` : rating}</SelectValue></SelectTrigger><SelectContent>{choices.map((value) => <SelectItem key={value} value={String(value)}>{value >= 0 ? `+${value}` : value} · {adjectiveFor(value)}</SelectItem>)}</SelectContent></Select><span><b>{skill.pt}</b><Translation show={structure.showTranslations}>{skill.en}</Translation></span></div>; })}{!skills.length && <div className="empty-editor-state">Nenhuma Perícia neste conjunto. Adicione as que o jogo precisa em “Seu Fate”.</div>}</div></section>

          <section className="sheet-notes-section"><SectionTitle>{structure.labels.notes}</SectionTitle><div className="sheet-section-body"><Textarea className="notes-textarea" value={character.notes} maxLength={16000} rows={6} aria-label={structure.labels.notes} onChange={(event) => store.updateActive((current) => ({ ...current, notes: event.target.value }))} /></div></section>
        </div>

        {customSheetRules.length > 0 && <section className="custom-sheet-section" aria-labelledby="custom-sheet-heading"><header><Sparkles /><div><p className="eyebrow">Regras da Mesa</p><h2 id="custom-sheet-heading">Espaço do seu jogo</h2></div><Button variant="ghost" size="sm" onClick={() => linkedProfile && onOpenRulesSettings(linkedProfile.id)}><Settings2 /> Ajustar</Button></header><div>{customSheetRules.map((rule) => <article key={rule.id}><div><b>{rule.name}</b><p>{rule.description}</p></div>{rule.field && (rule.field.type === "check" ? <Label className="custom-check-field"><Checkbox checked={character.optional.customValues[rule.id] === "true"} onCheckedChange={(checked) => setCustomValue(rule.id, checked === true ? "true" : "false")} /><span>{rule.field.label}<small>{rule.field.hint}</small></span></Label> : <Label className="field-stack"><span>{rule.field.label}{rule.field.hint && <small>{rule.field.hint}</small>}</span><Input type={rule.field.type === "number" ? "number" : "text"} value={character.optional.customValues[rule.id] ?? ""} maxLength={1200} onChange={(event) => setCustomValue(rule.id, event.target.value)} /></Label>)}</article>)}</div></section>}
      </div>}
    </section>
  );
}
