"use client";

import * as React from "react";
import { Dices, Send, Settings2, Shield, Trash2 } from "lucide-react";
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
  createId,
  fateSymbol,
  rollFateDice,
  type FateCharacter,
  type LocalRoll,
} from "@/lib/fate";
import { getContextRules, getSkillDefinitions, type TableConfig } from "@/lib/table-config";

const HISTORY_KEY = "fate-gameplay-toolkit.rolls.v1";
const FATE_PROBABILITIES_DESCENDING = [...FATE_PROBABILITIES].sort((left, right) => right.total - left.total);

function readHistory(): LocalRoll[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as LocalRoll[];
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((roll) => Array.isArray(roll.dice) && roll.dice.length === 4 && Number.isInteger(roll.total))
    .slice(0, 100);
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
  const [modifier, setModifier] = React.useState(0);
  const [skill, setSkill] = React.useState("manual");
  const [label, setLabel] = React.useState("");
  const [history, setHistory] = React.useState<LocalRoll[]>([]);
  const [rollingRoom, setRollingRoom] = React.useState(false);
  const [fullDefense, setFullDefense] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const latest = history[0] ?? null;
  const skills = getSkillDefinitions(tableConfig);
  const diceRules = getContextRules(tableConfig, "dice");
  const effectiveModifier = modifier + (tableConfig.officialRules.fullDefense && fullDefense ? 2 : 0);

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        setHistory(readHistory());
      } catch {
        toast.error("O histórico local estava inválido e não foi carregado.");
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
      toast.error("Não foi possível salvar o histórico neste dispositivo.");
    }
  }, [history, hydrated]);

  const chooseSkill = (value: string) => {
    setSkill(value);
    if (value === "manual") return;
    setModifier(character.skills[value] ?? 0);
    const chosen = skills.find((item) => item.id === value);
    if (chosen && !label.trim()) setLabel(chosen.pt);
  };

  const addRoll = (roll: LocalRoll) => setHistory((current) => [roll, ...current].slice(0, 100));

  const rollLocal = () => {
    try {
      const result = rollFateDice();
      addRoll({
        id: createId("roll"),
        dice: result.dice,
        modifier: effectiveModifier,
        total: result.sum + effectiveModifier,
        label: label.trim(),
        createdAt: Date.now(),
        source: "local",
      });
    } catch {
      toast.error("A rolagem segura não está disponível neste navegador.");
    }
  };

  const rollInRoom = async () => {
    if (!onRoomRoll || !roomReady || rollingRoom) return;
    setRollingRoom(true);
    try {
      const roll = await onRoomRoll(effectiveModifier, label.trim());
      addRoll(roll);
      toast.success("Rolagem publicada na Mesa.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A Mesa não recebeu a rolagem.");
    } finally {
      setRollingRoom(false);
    }
  };

  return (
    <section className="workspace-panel dice-workspace" aria-labelledby="dice-heading">
      <header className="workspace-toolbar">
        <div>
          <p className="eyebrow">4dF exatos</p>
          <h1 id="dice-heading">Rolagens</h1>
          <p>Quatro dados, três faces equiprováveis em cada dado.</p>
        </div>
      </header>

      <div className="active-profile-strip">
        <Dices aria-hidden="true" />
        <div><b>{tableConfig.profileName}</b><span>{diceRules.length ? `${diceRules.length} opção${diceRules.length === 1 ? "" : "ões"} aplicada${diceRules.length === 1 ? "" : "s"} nesta tela` : "Rolagem Fate padrão"}</span></div>
        <Button type="button" variant="ghost" size="sm" aria-label={`Ajustar regras de ${tableConfig.profileName}`} onClick={onOpenSettings}><Settings2 /> Ajustar</Button>
      </div>

      {diceRules.length > 0 && (
        <aside className="rule-reminders" aria-label="Opções ativas para rolagens">
          {diceRules.map((rule) => <article key={`${rule.kind}:${rule.id}`}><span className="rule-tag-pair">{rule.kind === "official" ? <><span>Oficial</span><span>Opcional</span></> : <span>Regra da mesa</span>}</span><b>{rule.name}</b><p>{rule.description}</p></article>)}
        </aside>
      )}

      <div className="dice-layout">
        <section className="roller-card">
          <div className="roll-controls">
            <Label className="field-stack">
              <span>Usar perícia da ficha</span>
              <Select value={skill} onValueChange={chooseSkill}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Bônus manual</SelectItem>
                  {skills.map((item) => <SelectItem key={item.id} value={item.id}>{item.pt} ({(character.skills[item.id] ?? 0) >= 0 ? "+" : ""}{character.skills[item.id] ?? 0})</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
            <Label className="field-stack modifier-field">
              <span>Bônus</span>
              <Input type="number" min={-20} max={20} value={modifier} onChange={(event) => { setSkill("manual"); setModifier(Math.max(-20, Math.min(20, Number(event.target.value) || 0))); }} />
            </Label>
            <Label className="field-stack roll-label-field">
              <span>Motivo <small>opcional</small></span>
              <Input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} />
            </Label>
          </div>

          {tableConfig.officialRules.fullDefense && (
            <Label className="full-defense-choice">
              <Shield aria-hidden="true" />
              <span><b>Defesa total</b><small>Somar +2 a esta rolagem. A ficção ainda decide quando vale.</small></span>
              <Switch checked={fullDefense} onCheckedChange={setFullDefense} />
            </Label>
          )}

          {(tableConfig.officialRules.scale || tableConfig.officialRules.weaponArmor) && (
            <div className="roll-character-options">
              {tableConfig.officialRules.scale && <span><b>Escala da ficha:</b> {({ mundane: "Mundano", supernatural: "Sobrenatural", otherworldly: "Extramundano", legendary: "Lendário", divine: "Divino" } as const)[character.optional.scale]}</span>}
              {tableConfig.officialRules.weaponArmor && <span><b>Arma {character.optional.weaponRating}</b> · <b>Armadura {character.optional.armorRating}</b> <small>aplique depois de comparar os esforços</small></span>}
            </div>
          )}

          <div className="dice-stage" data-has-result={Boolean(latest)} aria-live="polite" aria-atomic="true">
            <div className="dice-row" aria-label={latest ? `Dados: ${latest.dice.map(fateSymbol).join(", ")}` : "Dados ainda não rolados"}>
              {(latest?.dice ?? [0, 0, 0, 0]).map((die, index) => <span key={`${latest?.id ?? "empty"}-${index}`} data-value={fateSymbol(die)}>{latest ? fateSymbol(die) : "·"}</span>)}
            </div>
            {latest && <div className="roll-total"><strong>{latest.total >= 0 ? "+" : ""}{latest.total}</strong><span>{adjectiveFor(latest.total)}</span>{latest.label && <small>{latest.label}</small>}</div>}
          </div>

          <div className="roll-buttons">
            <Button size="lg" onClick={rollLocal}><Dices /> Rolar neste dispositivo</Button>
            {onRoomRoll && <Button size="lg" variant="outline" disabled={!roomReady || rollingRoom} onClick={rollInRoom}><Send /> {rollingRoom ? "Rolando…" : "Rolar na Mesa"}</Button>}
          </div>

          {tableConfig.officialRules.fullDefense && fullDefense && <p className="applied-bonus"><Shield /> Defesa total já incluída: {modifier >= 0 ? "+" : ""}{modifier} + 2 = {effectiveModifier >= 0 ? "+" : ""}{effectiveModifier}</p>}

          <p className="fairness-copy">Cada face (−, 0 ou +) tem exatamente 1/3 de chance.</p>
        </section>

        <aside className="probability-panel" aria-label="Chances do total natural em 4dF">
          <div className="probability-bars">
            {FATE_PROBABILITIES_DESCENDING.map(({ total, ways }) => (
              <div key={total}>
                <b>{total >= 0 ? `+${total}` : total}</b>
                <span><i style={{ width: `${(ways / 19) * 100}%` }} /></span>
                <small>{((ways / 81) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</small>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className="roll-history">
        <header>
          <div><p className="eyebrow">Últimas 100</p><h2>Histórico deste dispositivo</h2></div>
          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 /> Limpar</Button></AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader><AlertDialogTitle>Limpar o histórico?</AlertDialogTitle><AlertDialogDescription>As rolagens desta lista serão removidas apenas deste dispositivo.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => setHistory([])}>Limpar</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </header>
        {history.length === 0 ? (
          <div className="empty-inline">As rolagens aparecerão aqui.</div>
        ) : (
          <ol>
            {history.map((roll) => (
              <li key={roll.id}>
                <time dateTime={new Date(roll.createdAt).toISOString()}>{new Date(roll.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                <span className="mini-dice">{roll.dice.map(fateSymbol).join(" ")}</span>
                <b>{roll.modifier >= 0 ? `+${roll.modifier}` : roll.modifier}</b>
                <strong>= {roll.total >= 0 ? `+${roll.total}` : roll.total}</strong>
                <span>{roll.label || (roll.source === "room" ? "Rolagem da Mesa" : "Rolagem pessoal")}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
