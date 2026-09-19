"use client";

import { t, useAppLanguage, getAppLanguage, uiLabel } from "@/lib/app-language";

import * as React from "react";
import { Dices, Download, RotateCcw, Send, Settings2, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  FATE_PROBABILITIES,
  adjectiveFor,
  safeJsonDownload,
  fateSymbol,
  type FateCharacter,
  type LocalRoll,
} from "@/lib/fate";
import { getContextRules, getSkillDefinitions, type TableConfig } from "@/lib/table-config";

import { createLocalRoll, validRollHistory, outcome, outcomeChances } from "@/lib/roll-tools";

const HISTORY_KEY = "fate-gameplay-toolkit.rolls.v1";
const FATE_PROBABILITIES_DESCENDING = [...FATE_PROBABILITIES].sort((left, right) => right.total - left.total);

function readHistory(): LocalRoll[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  return validRollHistory(JSON.parse(raw));
}

export function DiceRoller({
  character,
  roomReady,
  onRoomRoll,
  tableConfig,
  onOpenSettings,
}: {
  character: FateCharacter;
  roomReady?: boolean;
  onRoomRoll?: (modifier: number, label: string) => Promise<LocalRoll>;
  tableConfig: TableConfig;
  onOpenSettings: () => void;
}) {
  useAppLanguage();
  const [manualModifier, setManualModifier] = React.useState(0);
  const [skill, setSkill] = React.useState("manual");
  const [label, setLabel] = React.useState("");
  const [history, setHistory] = React.useState<LocalRoll[]>([]);
  const [rollingRoom, setRollingRoom] = React.useState(false);
  const [fullDefense, setFullDefense] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [difficulty, setDifficulty] = React.useState(2);
  const modifierInput = React.useRef<HTMLInputElement>(null);
  const latest = history[0] ?? null;
  const skills = getSkillDefinitions(tableConfig);
  const diceRules = getContextRules(tableConfig, "dice", t);
  const selectedSkill = skills.find(item => item.id === skill);
  const modifier = selectedSkill ? character.skills[selectedSkill.id] ?? 0 : manualModifier;
  const rollLabel = label.trim() || (selectedSkill ? uiLabel(selectedSkill) : "") || "";
  const effectiveModifier = modifier + (tableConfig.officialRules.fullDefense && fullDefense ? 2 : 0);

  const validRoomModifier = effectiveModifier >= -20 && effectiveModifier <= 20;
  const chances = outcomeChances(effectiveModifier, difficulty);
  const outcomeLabels = { failure: t("Falha"), tie: t("Empate"), success: t("Sucesso"), style: t("Sucesso com estilo") };

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        setHistory(readHistory());
      } catch {
        toast.error(t("O histórico local estava inválido e não foi carregado."));
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  React.useEffect(() => {
    const clear = () => setHistory([]);
    window.addEventListener("fate:roll-history-cleared", clear);
    return () => window.removeEventListener("fate:roll-history-cleared", clear);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    } catch {
      toast.error(t("Não foi possível salvar o histórico neste dispositivo."));
    }
  }, [history, hydrated]);

  const chooseSkill = (value: string) => { setSkill(value); };
  const reuseRoll = (roll: LocalRoll) => {
    setSkill("manual"); setLabel(roll.label); setFullDefense(false); setManualModifier(roll.modifier);
    modifierInput.current?.focus();
    toast.info(t("Bônus e motivo preparados. Escolha onde fazer a nova rolagem."));
  };

  const addRoll = (roll: LocalRoll) => setHistory((current) => [roll, ...current].slice(0, 100));

  const rollLocal = () => {
    try {
      addRoll(createLocalRoll(effectiveModifier, rollLabel));
    } catch {
      toast.error(t("A rolagem segura não está disponível neste navegador."));
    }
  };

  const rollInRoom = async () => {
    if (!onRoomRoll || !roomReady || rollingRoom || !validRoomModifier) return;
    setRollingRoom(true);
    try {
      const roll = await onRoomRoll(effectiveModifier, rollLabel);
      addRoll(roll);
      toast.success(t("Rolagem publicada na Mesa."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("A Mesa não recebeu a rolagem."));
    } finally {
      setRollingRoom(false);
    }
  };

  return (
    <section className="workspace-panel dice-workspace" aria-labelledby="dice-heading">
      <header className="workspace-toolbar">
        <div>
          <p className="eyebrow">{t("4dF exatos")}</p>
          <h1 id="dice-heading">{t("Rolagens")}</h1>
          <p>{t("Quatro dados, três faces equiprováveis em cada dado.")}</p>
        </div>
      </header>

      <div className="active-profile-strip">
        <Dices aria-hidden="true" />
        <div><b>{tableConfig.profileName}</b><span>{diceRules.length ? t(`${diceRules.length} opção${diceRules.length === 1 ? "" : "ões"} aplicada${diceRules.length === 1 ? "" : "s"} nesta tela`, "" + String(diceRules.length) + " active option(s) on this screen") : t("Rolagem Fate padrão")}</span></div>
        <Button type="button" variant="ghost" size="sm" aria-label={t(`Ajustar regras de ${tableConfig.profileName}`, "Adjust rules for " + String(tableConfig.profileName) + "")} onClick={onOpenSettings}><Settings2 /> {t("Ajustar")}</Button>
      </div>

      {diceRules.length > 0 && (
        <aside className="rule-reminders" aria-label={t("Opções ativas para rolagens")}>
          {diceRules.map((rule) => <article key={`${rule.kind}:${rule.id}`}><span className="rule-tag-pair">{rule.kind === "official" ? <><span>{t("Oficial")}</span><span>{t("Opcional")}</span></> : <span>{t("Regra da mesa")}</span>}</span><b>{rule.name}</b><p>{rule.kind === "official" ? t(rule.description) : rule.description}</p></article>)}
        </aside>
      )}

      <div className="dice-layout">
        <section className="roller-card">
          <p className="roll-active-sheet">{t("Ficha em uso:")}<b>{character.name || t("Sem nome")}</b></p>
          <div className="roll-controls">
            <Label className="field-stack">
              <span>{t("Usar perícia da ficha")}</span>
              <Select value={selectedSkill ? skill : "manual"} onValueChange={chooseSkill}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t("Bônus manual")}</SelectItem>
                  {skills.map((item) => <SelectItem key={item.id} value={item.id}>{item.pt} ({(character.skills[item.id] ?? 0) >= 0 ? "+" : ""}{character.skills[item.id] ?? 0})</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
            <Label className="field-stack modifier-field">
              <span>{t("Bônus")}</span>
              <Input ref={modifierInput} type="number" min={-22} max={22} step={1} value={modifier} onChange={(event) => { setSkill("manual"); setFullDefense(false); setManualModifier(Math.max(-22, Math.min(22, Math.trunc(Number(event.target.value) || 0)))); }} />
            </Label>
            <Label className="field-stack roll-label-field">
              <span>{t("Motivo")} <small>{t("opcional")}</small></span>
              <Input placeholder={(selectedSkill ? uiLabel(selectedSkill) : "") || t("O que está em jogo?")} value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} />
            </Label>
          </div>

          {tableConfig.officialRules.fullDefense && (
            <Label className="full-defense-choice">
              <Shield aria-hidden="true" />
              <span><b>{t("Defesa total")}</b><small>{t("Somar +2 a esta rolagem. A ficção ainda decide quando vale.")}</small></span>
              <Switch disabled={modifier > 20} checked={fullDefense} onCheckedChange={setFullDefense} />
            </Label>
          )}

          {(tableConfig.officialRules.scale || tableConfig.officialRules.weaponArmor) && (
            <div className="roll-character-options">
              {tableConfig.officialRules.scale && <span><b>{t("Escala da ficha:")}</b> {({ mundane: "Mundano", supernatural: "Sobrenatural", otherworldly: "Extramundano", legendary: t("Lendário"), divine: "Divino" } as const)[character.optional.scale]}</span>}
              {tableConfig.officialRules.weaponArmor && <span><b>{t("Arma")} {character.optional.weaponRating}</b> · <b>{t("Armadura")} {character.optional.armorRating}</b> <small>{t("aplique depois de comparar os esforços")}</small></span>}
            </div>
          )}

          <div className="dice-stage" data-has-result={Boolean(latest)} aria-live="polite" aria-atomic="true">
            <div className="dice-row" aria-label={latest ? `Dados: ${latest.dice.map(fateSymbol).join(", ")}` : t("Dados ainda não rolados")}>
              {(latest?.dice ?? [0, 0, 0, 0]).map((die, index) => <span key={`${latest?.id ?? "empty"}-${index}`} data-value={fateSymbol(die)}>{latest ? fateSymbol(die) : "·"}</span>)}
            </div>
            {latest && <div className="roll-total"><strong>{latest.total >= 0 ? "+" : ""}{latest.total}</strong><span>{adjectiveFor(latest.total, getAppLanguage())}</span>{latest.label && <small>{latest.label}</small>}</div>}
          </div>

          <div className="roll-buttons">
            <Button size="lg" onClick={rollLocal}><Dices /> {t("Rolar neste dispositivo")}</Button>
            {onRoomRoll && <Button size="lg" variant="outline" disabled={!roomReady || rollingRoom || !validRoomModifier} onClick={rollInRoom}><Send /> {rollingRoom ? t("Rolando…") : t("Rolar na Mesa")}</Button>}
          </div>

          {tableConfig.officialRules.fullDefense && fullDefense && <p className="applied-bonus"><Shield /> {t("Defesa total já incluída:")} {modifier >= 0 ? "+" : ""}{modifier} + 2 = {effectiveModifier >= 0 ? "+" : ""}{effectiveModifier}</p>}

          {!validRoomModifier && <p className="reader-notice">{t("A Mesa aceita bônus final entre −20 e +20. Ajuste o bônus para publicar.")}</p>}
          <details className="roll-comparison">
            <summary>{t("Comparar com uma dificuldade")}</summary>
            <p>{t("Informe a dificuldade ou o esforço da oposição para comparar o resultado. A ação e a ficção determinam o que acontece.")}</p>
            <Label className="field-stack"><span>{t("Dificuldade ou oposição")}</span><Input type="number" min={-26} max={26} step={1} value={difficulty} onChange={event => setDifficulty(Math.max(-26, Math.min(26, Math.trunc(Number(event.target.value) || 0))))} /></Label>
            {latest && <p aria-live="polite"><b>{outcomeLabels[outcome(latest.total, difficulty)]}</b> {t("· Diferença:")} {latest.total - difficulty >= 0 ? "+" : ""}{latest.total - difficulty}</p>}
            <div className="roll-outcomes">{(Object.keys(chances) as Array<keyof typeof chances>).map(key => <div key={key}><small>{outcomeLabels[key]}</small><b>{(chances[key] / 81 * 100).toLocaleString(getAppLanguage() === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 })}%</b></div>)}</div>
            <small>{t("Chances para uma nova rolagem com o bônus atual (")}{effectiveModifier >= 0 ? "+" : ""}{effectiveModifier}).</small>
          </details>
          <p className="fairness-copy">{t("Cada face (−, 0 ou +) tem exatamente 1/3 de chance.")}</p>
        </section>

        <aside className="probability-panel" aria-label={t("Chances do total natural em 4dF")}>
          <header className="probability-heading">
            <p className="eyebrow">{t("Cada resultado tem sua chance")}</p>
            <h2>{t("O que os dados podem contar")}</h2>
            <p>{t("Distribuição dos quatro dados, antes do bônus.")}</p>
          </header>
          <div className="probability-bars">
            {FATE_PROBABILITIES_DESCENDING.map(({ total, ways }) => (
              <div key={total}>
                <b>{total >= 0 ? `+${total}` : total}</b>
                <span><i style={{ width: `${(ways / 19) * 100}%` }} /></span>
                <small>{((ways / 81) * 100).toLocaleString(getAppLanguage() === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</small>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className="roll-history">
        <header>
          <div><p className="eyebrow">{t("Últimas 100")}</p><h2>{t("Histórico deste dispositivo")}</h2></div>
          {history.length > 0 && <Button variant="outline" size="sm" onClick={() => safeJsonDownload("fate-rolagens.json", history)}><Download /> {t("Exportar")}</Button>}
          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 /> {t("Limpar")}</Button></AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader><AlertDialogTitle>{t("Limpar o histórico?")}</AlertDialogTitle><AlertDialogDescription>{t("As rolagens desta lista serão removidas apenas deste dispositivo.")}</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => setHistory([])}>{t("Limpar")}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </header>
        {history.length === 0 ? (
          <div className="empty-inline">{t("As rolagens aparecerão aqui.")}</div>
        ) : (
          <ol>
            {history.map((roll) => (
              <li key={roll.id}>
                <time dateTime={new Date(roll.createdAt).toISOString()}>{new Date(roll.createdAt).toLocaleTimeString(getAppLanguage() === "pt" ? "pt-BR" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                <span className="mini-dice">{roll.dice.map(fateSymbol).join(" ")}</span>
                <b>{roll.modifier >= 0 ? `+${roll.modifier}` : roll.modifier}</b>
                <strong>= {roll.total >= 0 ? `+${roll.total}` : roll.total}</strong>
                <span>{roll.label || (roll.source === "room" ? t("Rolagem da Mesa") : t("Rolagem pessoal"))}</span>
                <Button variant="ghost" size="sm" onClick={() => reuseRoll(roll)}><RotateCcw /> {t("Preparar de novo")}</Button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
