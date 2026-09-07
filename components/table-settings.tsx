"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Copy,
  Download,
  DoorOpen,
  FileUp,
  LayoutTemplate,
  Palette,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SheetStructureSettings } from "@/components/sheet-structure-settings";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { safeJsonDownload } from "@/lib/fate";
import {
  OFFICIAL_OPTIONAL_RULES,
  SKILL_PRESETS,
  activeRuleCount,
  getSkillDefinitions,
  makeCustomRule,
  makeCustomSkill,
  summarizeTableConfig,
  type RuleScope,
  type SkillPresetId,
  type TableConfig,
} from "@/lib/table-config";
import type { TableConfigStore } from "@/lib/use-table-config";
import type { SavedRoom } from "@/lib/use-room";

const ACCENTS = [
  { value: "#01b4ee", name: "Ciano Fate" },
  { value: "#7667f5", name: "Violeta" },
  { value: "#ef8f32", name: "Âmbar" },
  { value: "#28ad7c", name: "Verde" },
  { value: "#e65d7a", name: "Rosa" },
];

const SCOPE_LABELS: Record<RuleScope, string> = {
  sheet: "Ficha",
  dice: "Rolagens",
  rooms: "Mesas",
  rules: "Regras",
};

const SHAPE_LABELS = {
  pyramid: "Pirâmide",
  diamond: "Diamante",
  column: "Coluna",
  free: "Livre com limite",
} as const;

function SettingChoice({ value, title, description }: { value: string; title: string; description?: string }) {
  return (
    <Label className="setting-choice">
      <RadioGroupItem value={value} />
      <span><b>{title}</b>{description && <small>{description}</small>}</span>
    </Label>
  );
}

function changePreset(config: TableConfig, preset: SkillPresetId): TableConfig {
  const defaults: Partial<Record<SkillPresetId, [string, string]>> = {
    default: ["physique", "will"],
    actions: ["actions:endure", "actions:endure"],
    attributes: ["attributes:toughness", "attributes:intelligence"],
  };
  const [physicalStressSkillId, mentalStressSkillId] = defaults[preset] ?? ["", ""];
  return {
    ...config,
    skillSystem: { ...config.skillSystem, preset, physicalStressSkillId, mentalStressSkillId },
    sheetStructure: {
      ...config.sheetStructure,
      stressTracks: config.sheetStructure.stressTracks.map((track) => track.id === "physicalStress"
        ? { ...track, skillId: physicalStressSkillId }
        : track.id === "mentalStress"
          ? { ...track, skillId: mentalStressSkillId }
          : track),
    },
  };
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function TableSettings({
  store,
  savedRooms,
  roomReady,
  onShare,
  onOpenRule,
  onOpenRoom,
  onDeleteProfile,
}: {
  store: TableConfigStore;
  savedRooms: SavedRoom[];
  roomReady: boolean;
  onShare: (text: string) => Promise<unknown>;
  onOpenRule: (reference: string) => void;
  onOpenRoom: (participantId: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => void;
}) {
  const config = store.config;
  const choiceCount = activeRuleCount(config);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [newSkill, setNewSkill] = React.useState("");
  const [ruleName, setRuleName] = React.useState("");
  const [ruleDescription, setRuleDescription] = React.useState("");
  const [ruleScopes, setRuleScopes] = React.useState<RuleScope[]>(["sheet"]);
  const [hasField, setHasField] = React.useState(false);
  const [fieldLabel, setFieldLabel] = React.useState("");
  const [fieldType, setFieldType] = React.useState<"text" | "number" | "check">("text");
  const [fieldHint, setFieldHint] = React.useState("");
  const [sharing, setSharing] = React.useState(false);
  const change = (updater: (current: TableConfig) => TableConfig) => store.update(updater);

  if (!store.hydrated) return <div className="loading-panel">Abrindo o jeito da sua mesa…</div>;

  const toggleScope = (scope: RuleScope, checked: boolean) => {
    setRuleScopes((current) => checked
      ? [...new Set([...current, scope])]
      : current.filter((item) => item !== scope));
  };

  const addSkill = () => {
    if (!newSkill.trim()) return;
    if (config.skillSystem.customSkills.length >= 30) return toast.info("A lista já chegou a 30 Perícias.");
    change((current) => ({
      ...changePreset(current, "custom"),
      skillSystem: {
        ...changePreset(current, "custom").skillSystem,
        customSkills: [...current.skillSystem.customSkills, makeCustomSkill(newSkill)],
      },
    }));
    setNewSkill("");
  };

  const makeListOwn = () => change((current) => ({
    ...changePreset(current, "custom"),
    skillSystem: {
      ...changePreset(current, "custom").skillSystem,
      customSkills: getSkillDefinitions(current).map((skill) => ({ id: skill.id, name: skill.pt, translation: skill.en ?? "" })),
    },
  }));

  const addRule = () => {
    if (config.customRules.length >= 40) {
      toast.info("Este perfil já chegou a 40 regras próprias.");
      return;
    }
    if (!ruleName.trim() || !ruleDescription.trim()) {
      toast.error("Dê um nome à ideia e escreva, em uma frase, o que ela muda.");
      return;
    }
    if (!ruleScopes.length && !hasField) {
      toast.error("Escolha onde aplicar esta regra.");
      return;
    }
    if (hasField && !fieldLabel.trim()) {
      toast.error("Dê um nome ao espaço que aparecerá na ficha.");
      return;
    }
    const scopes = [...new Set(hasField ? [...ruleScopes, "sheet" as const] : ruleScopes)];
    const rule = makeCustomRule({
      name: ruleName.trim(),
      description: ruleDescription.trim(),
      scopes,
      field: hasField ? { label: fieldLabel.trim(), type: fieldType, hint: fieldHint.trim() } : null,
    });
    change((current) => ({ ...current, customRules: [...current.customRules, rule] }));
    setRuleName("");
    setRuleDescription("");
    setRuleScopes(["sheet"]);
    setHasField(false);
    setFieldLabel("");
    setFieldHint("");
    toast.success("Regra colocada no papel.");
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) return toast.error("Esse arquivo é grande demais para ser um perfil de regras.");
    try {
      const imported = store.importConfig(JSON.parse(await file.text()));
      toast.success(`${imported.config.profileName} foi guardado neste dispositivo.`);
    } catch {
      toast.error("Esse arquivo não é um perfil válido desta ferramenta.");
    }
  };

  const addProfile = () => {
    try {
      const profile = store.addProfile();
      toast.success(`${profile.config.profileName} está pronto para receber suas ideias.`);
    } catch (error) {
      toast.info(error instanceof Error ? error.message : "Não foi possível criar outro conjunto de regras.");
    }
  };

  const duplicateProfile = () => {
    try {
      const profile = store.duplicateProfile();
      toast.success(`${profile.config.profileName} foi criado sem alterar o original.`);
    } catch (error) {
      toast.info(error instanceof Error ? error.message : "Não foi possível duplicar este conjunto.");
    }
  };

  const linkedRooms = savedRooms.filter((room) => room.rulesProfileId === store.activeProfileId);

  const share = async () => {
    if (!roomReady || sharing) return;
    setSharing(true);
    try {
      await onShare(summarizeTableConfig(config));
      toast.success("Resumo publicado na Mesa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "O resumo não foi publicado.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <section className="workspace-panel settings-workspace" aria-labelledby="settings-heading">
      <header className="workspace-toolbar settings-toolbar">
        <div>
          <p className="eyebrow">Do seu jeito, sem deixar de ser Fate</p>
          <h1 id="settings-heading">Seu Fate</h1>
          <p>Comece com o livro. Mude só o que ajudar a mesa. Tudo fica salvo neste dispositivo. Mude o que quiser e faça o que for melhor para a sua Mesa. É fácil rebobinar.</p>
        </div>
        <div className="toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => safeJsonDownload(`${config.profileName}.regras-fate.json`, config)}><Download /> Salvar mudanças</Button>
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><FileUp /> Importar mudanças</Button>
          <input ref={fileInput} className="sr-only" type="file" accept="application/json,.json" onChange={importFile} />
        </div>
      </header>

      <div className="settings-intro">
        <section className="profile-summary rules-profile-library" aria-labelledby="rules-profile-library-heading">
          <div className="profile-spark"><Sparkles /></div>
          <div className="rules-profile-main">
            <h2 className="sr-only" id="rules-profile-library-heading">Conjuntos de regras salvos</h2>
            <p>Conjunto em uso</p>
            <Select value={store.activeProfileId} onValueChange={store.selectProfile}><SelectTrigger className="rules-profile-select" aria-label="Escolher conjunto de regras"><SelectValue /></SelectTrigger><SelectContent>{store.profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.config.profileName}</SelectItem>)}</SelectContent></Select>
            <span>{choiceCount ? `${choiceCount} mudança${choiceCount === 1 ? "" : "s"} em relação ao livro` : "Padrão do livro"}</span>
          </div>
          <div className="rules-profile-actions">
            <Button type="button" size="sm" onClick={addProfile}><Plus /> Novo conjunto</Button>
            <Button type="button" variant="outline" size="sm" onClick={duplicateProfile}><Copy /> Duplicar</Button>
            {store.profiles.length > 1 && <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${config.profileName}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Excluir este conjunto de regras?</AlertDialogTitle><AlertDialogDescription>Fichas e Mesas ligadas passarão a usar outro conjunto salvo. Nenhuma Ficha, Mesa ou anotação será apagada.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => onDeleteProfile(store.activeProfileId)}>Excluir regras</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
          </div>
          {linkedRooms.length > 0 && <div className="rules-linked-rooms"><span>Mesas vinculadas</span><div>{linkedRooms.map((room) => <Button type="button" variant="ghost" size="sm" key={room.session.participantId} onClick={() => void onOpenRoom(room.session.participantId).catch((error) => toast.error(error instanceof Error ? error.message : "A Mesa não pôde ser aberta."))}><DoorOpen /> {room.roomName || `Mesa ${room.session.roomCode}`}</Button>)}</div></div>}
        </section>
      </div>

      <Accordion className="settings-accordion" type="multiple" defaultValue={["appearance", "sheet"]}>
        <AccordionItem value="appearance">
          <AccordionTrigger><span className="settings-trigger"><Palette /><b>Cara do site</b><small>Cor, leitura e espaço</small></span></AccordionTrigger>
          <AccordionContent className="settings-content appearance-settings">
            <div className="settings-grid two-columns appearance-primary">
              <Label className="field-stack"><span>Nome deste jeito de jogar</span><Input value={config.profileName} maxLength={80} onChange={(event) => change((current) => ({ ...current, profileName: event.target.value || "Fate Condensado" }))} /></Label>
              <fieldset className="plain-fieldset">
                <legend>Tema</legend>
                <RadioGroup className="choice-grid two theme-options" value={config.appearance.theme} onValueChange={(theme) => change((current) => ({ ...current, appearance: { ...current.appearance, theme: theme as TableConfig["appearance"]["theme"] } }))}>
                  <SettingChoice value="light" title="Claro" />
                  <SettingChoice value="dark" title="Escuro" />
                </RadioGroup>
              </fieldset>
            </div>

            <fieldset className="plain-fieldset accent-fieldset">
              <legend>Cor da mesa</legend>
              <div className="accent-picker-grid">
                <RadioGroup className="accent-options" value={config.appearance.accent.toLowerCase()} onValueChange={(accent) => change((current) => ({ ...current, appearance: { ...current.appearance, accent } }))}>
                  {ACCENTS.map((accent) => (
                    <Label key={accent.value} className="accent-choice" title={accent.name}>
                      <RadioGroupItem value={accent.value} />
                      <span style={{ backgroundColor: accent.value }} /><small>{accent.name}</small>
                    </Label>
                  ))}
                </RadioGroup>
                <Label className="custom-color" data-selected={!ACCENTS.some((accent) => accent.value === config.appearance.accent.toLowerCase())}>
                  <input aria-label="Escolher outra cor" type="color" value={config.appearance.accent} onChange={(event) => change((current) => ({ ...current, appearance: { ...current.appearance, accent: event.target.value } }))} />
                  <small>Outra cor</small>
                </Label>
              </div>
            </fieldset>

            <div className="settings-grid three-columns appearance-selects">
              <Label className="field-stack"><span>Espaço entre coisas</span><Select value={config.appearance.density} onValueChange={(density) => change((current) => ({ ...current, appearance: { ...current.appearance, density: density as "comfortable" | "compact" } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="comfortable">Confortável</SelectItem><SelectItem value="compact">Mais enxuto</SelectItem></SelectContent></Select></Label>
              <Label className="field-stack"><span>Tamanho de leitura</span><Select value={config.appearance.textSize} onValueChange={(textSize) => change((current) => ({ ...current, appearance: { ...current.appearance, textSize: textSize as "normal" | "large" } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="large">Maior</SelectItem></SelectContent></Select></Label>
              <Label className="field-stack"><span>Cantos</span><Select value={config.appearance.corners} onValueChange={(corners) => change((current) => ({ ...current, appearance: { ...current.appearance, corners: corners as "soft" | "square" } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="soft">Suaves</SelectItem><SelectItem value="square">Retos</SelectItem></SelectContent></Select></Label>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sheet">
          <AccordionTrigger><span className="settings-trigger"><Settings2 /><b>Regras da Ficha</b><small>Dano, Perícias e criação</small></span></AccordionTrigger>
          <AccordionContent className="settings-content">
            <fieldset className="plain-fieldset">
              <legend>Dano duradouro</legend>
              <RadioGroup className="choice-grid three damage-mode-options" value={config.damageMode} onValueChange={(damageMode) => change((current) => ({ ...current, damageMode: damageMode as TableConfig["damageMode"] }))}>
                <SettingChoice value="consequences" title="Consequências" description="Padrão do livro" />
                <SettingChoice value="conditions" title="Condições" description="Nomes prontos para o dano" />
                <SettingChoice value="split-conditions" title="Condições separadas" description="Mais caixas físicas e mentais" />
              </RadioGroup>
            </fieldset>

            <div className="settings-grid two-columns">
              <Label className="field-stack"><span>Lista de perícias</span><Select value={config.skillSystem.preset} onValueChange={(preset) => change((current) => changePreset(current, preset as SkillPresetId))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SKILL_PRESETS).map(([id, preset]) => <SelectItem key={id} value={id}>{preset.name} · {preset.idea}</SelectItem>)}<SelectItem value="custom">Minha própria lista</SelectItem></SelectContent></Select></Label>
              <Label className="field-stack"><span>Formato sugerido</span><Select value={config.skillSystem.shape} onValueChange={(shape) => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, shape: shape as TableConfig["skillSystem"]["shape"] } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SHAPE_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></Label>
            </div>

            {config.skillSystem.preset !== "custom" && <div className="own-list-callout"><div><b>Quer mudar esta lista?</b><span>Faça uma cópia própria e edite nomes, traduções e ordem sem alterar o padrão.</span></div><Button type="button" variant="outline" onClick={makeListOwn}>Personalizar esta lista</Button></div>}

            {config.skillSystem.preset === "custom" && (
              <div className="custom-skill-editor">
                <div><Label className="field-stack"><span>Nova perícia</span><Input value={newSkill} maxLength={60} onChange={(event) => setNewSkill(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }} /></Label><Button type="button" variant="outline" onClick={addSkill}><Plus /> Adicionar</Button></div>
                {config.skillSystem.customSkills.length ? <ol>{config.skillSystem.customSkills.map((skill, index) => <li key={skill.id}><div className="order-buttons"><Button variant="ghost" size="icon-sm" disabled={index === 0} aria-label={`Mover ${skill.name} para cima`} onClick={() => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, customSkills: moveItem(current.skillSystem.customSkills, index, -1) } }))}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" disabled={index === config.skillSystem.customSkills.length - 1} aria-label={`Mover ${skill.name} para baixo`} onClick={() => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, customSkills: moveItem(current.skillSystem.customSkills, index, 1) } }))}><ArrowDown /></Button></div><Label className="field-stack"><span>Nome</span><Input value={skill.name} maxLength={60} onChange={(event) => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, customSkills: current.skillSystem.customSkills.map((item) => item.id === skill.id ? { ...item, name: event.target.value || item.name } : item) } }))} /></Label><Label className="field-stack"><span>Inglês <small>opcional</small></span><Input value={skill.translation} maxLength={80} onChange={(event) => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, customSkills: current.skillSystem.customSkills.map((item) => item.id === skill.id ? { ...item, translation: event.target.value } : item) } }))} /></Label><Button variant="ghost" size="icon-sm" aria-label={`Remover ${skill.name}`} onClick={() => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, customSkills: current.skillSystem.customSkills.filter((item) => item.id !== skill.id) } }))}><Trash2 /></Button></li>)}</ol> : <p>Comece com uma palavra: “Coragem”, “Magia”, “Diplomacia”…</p>}
              </div>
            )}

            <div className="settings-grid two-columns">
              <Label className="field-stack"><span>Menor valor</span><Input type="number" min={-20} max={config.skillSystem.ratingCeiling} value={config.skillSystem.ratingFloor} onChange={(event) => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, ratingFloor: Math.max(-20, Math.min(current.skillSystem.ratingCeiling, Number(event.target.value) || 0)) } }))} /></Label>
              <Label className="field-stack"><span>Maior valor</span><Input type="number" min={config.skillSystem.ratingFloor} max={20} value={config.skillSystem.ratingCeiling} onChange={(event) => change((current) => ({ ...current, skillSystem: { ...current.skillSystem, ratingCeiling: Math.min(20, Math.max(current.skillSystem.ratingFloor, Number(event.target.value) || 0)) } }))} /></Label>
            </div>

            <Label className="switch-row"><span><b>Começar uma Ficha durante o jogo</b><small>Nome, conceito e um ponto forte já bastam; complete quando a história pedir.</small></span><Switch checked={config.createDuringPlay} onCheckedChange={(createDuringPlay) => change((current) => ({ ...current, createDuringPlay }))} /></Label>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="structure">
          <AccordionTrigger><span className="settings-trigger"><LayoutTemplate /><b>Estrutura da Ficha</b><small>Aspectos, Estresse, Consequências, recursos e nomes</small></span></AccordionTrigger>
          <AccordionContent className="settings-content"><SheetStructureSettings config={config} onChange={change} /></AccordionContent>
        </AccordionItem>

        <AccordionItem value="official">
          <AccordionTrigger><span className="settings-trigger"><BookOpen /><b>Opções do livro</b><small>Regras oficiais, desligadas por padrão</small></span></AccordionTrigger>
          <AccordionContent className="settings-content">
            <div className="official-option-list">
              {OFFICIAL_OPTIONAL_RULES.map((rule) => (
                <Label className="switch-row" key={rule.id}>
                  <span><b>{rule.title}</b><span className="rule-tag-pair"><Badge variant="outline">Oficial</Badge><Badge variant="secondary">Opcional</Badge></span><small>{rule.short}</small></span>
                  <Switch checked={config.officialRules[rule.id]} onCheckedChange={(checked) => change((current) => ({ ...current, officialRules: { ...current.officialRules, [rule.id]: checked } }))} />
                </Label>
              ))}
            </div>
            <Button variant="outline" onClick={() => onOpenRule("rules:opcionais:pt")}><BookOpen /> Ler o capítulo completo</Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="custom">
          <AccordionTrigger><span className="settings-trigger"><Sparkles /><b>Suas próprias regras</b><small>Escreva a ideia; o site vai se lembrar dela</small></span></AccordionTrigger>
          <AccordionContent className="settings-content custom-rules-editor">
            {config.customRules.length > 0 && (
              <ul className="custom-rule-list">
                {config.customRules.map((rule) => (
                  <li key={rule.id}>
                    <Switch checked={rule.enabled} aria-label={`${rule.enabled ? "Desligar" : "Ligar"} ${rule.name}`} onCheckedChange={(enabled) => change((current) => ({ ...current, customRules: current.customRules.map((item) => item.id === rule.id ? { ...item, enabled } : item) }))} />
                    <div><b>{rule.name}</b><p>{rule.description}</p><span>{rule.scopes.map((scope) => SCOPE_LABELS[scope]).join(" · ")}{rule.field ? ` · Campo “${rule.field.label}” na ficha` : ""}</span></div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Remover ${rule.name}`}><Trash2 /></Button></AlertDialogTrigger>
                      <AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Remover esta regra?</AlertDialogTitle><AlertDialogDescription>Ela sairá do perfil, mas nenhum outro conteúdo será alterado.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => change((current) => ({ ...current, customRules: current.customRules.filter((item) => item.id !== rule.id) }))}>Remover</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                    </AlertDialog>
                  </li>
                ))}
              </ul>
            )}

            <div className="new-rule-paper">
              <p className="eyebrow">Nova ideia</p>
              <div className="settings-grid two-columns">
                <Label className="field-stack"><span>Nome da regra</span><Input value={ruleName} maxLength={90} onChange={(event) => setRuleName(event.target.value)} /></Label>
                <Label className="field-stack"><span>O que ela muda?</span><Textarea value={ruleDescription} maxLength={1600} rows={3} onChange={(event) => setRuleDescription(event.target.value)} /></Label>
              </div>
              <fieldset className="plain-fieldset"><legend>Escolha onde aplicar</legend><div className="scope-options">{(Object.entries(SCOPE_LABELS) as Array<[RuleScope, string]>).map(([scope, label]) => <Label key={scope}><Checkbox checked={ruleScopes.includes(scope)} onCheckedChange={(checked) => toggleScope(scope, checked === true)} /> {label}</Label>)}</div></fieldset>
              <Label className="switch-row"><span><b>Precisa de um espaço na ficha?</b><small>Use para recursos, marcas, níveis, estados ou qualquer coisa que o jogador preencha.</small></span><Switch checked={hasField} onCheckedChange={setHasField} /></Label>
              {hasField && <div className="settings-grid three-columns"><Label className="field-stack"><span>Nome do espaço</span><Input value={fieldLabel} maxLength={80} onChange={(event) => setFieldLabel(event.target.value)} /></Label><Label className="field-stack"><span>Como preencher</span><Select value={fieldType} onValueChange={(value) => setFieldType(value as typeof fieldType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text">Escrever</SelectItem><SelectItem value="number">Número</SelectItem><SelectItem value="check">Marcar ou desmarcar</SelectItem></SelectContent></Select></Label><Label className="field-stack"><span>Ajuda curta <small>opcional</small></span><Input value={fieldHint} maxLength={160} onChange={(event) => setFieldHint(event.target.value)} /></Label></div>}
              <Button onClick={addRule}><Plus /> Colocar no papel</Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <footer className="settings-footer">
        <Button variant="outline" disabled={!roomReady || sharing} onClick={share}><Send /> {sharing ? "Publicando…" : "Publicar resumo na Mesa"}</Button>
        <div className="settings-recovery-actions" aria-label="Recuperar ou restaurar configurações">
          <Button variant="ghost" onClick={() => { try { store.restoreBackup(); toast.success("A versão anterior foi recuperada."); } catch (error) { toast.info(error instanceof Error ? error.message : "Não há uma versão anterior para recuperar."); } }}><RotateCcw /> Recuperar versão anterior</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost">Restaurar este conjunto ao padrão</Button></AlertDialogTrigger>
            <AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Restaurar este conjunto ao padrão?</AlertDialogTitle><AlertDialogDescription>As escolhas deste conjunto voltam ao Fate Condensado como no livro. A versão atual poderá ser recuperada depois. Fichas, Mesas, notas, rolagens e arquivos não serão apagados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={store.reset}>Restaurar conjunto</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>
        </div>
      </footer>
    </section>
  );
}
