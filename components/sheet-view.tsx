"use client";

import { t, useAppLanguage, getAppLanguage, uiLabel } from "@/lib/app-language";

import * as React from "react";
import { Check, Sparkles } from "lucide-react";
import { SheetImage } from "@/components/sheet-image";
import { adjectiveFor, type FateCharacter } from "@/lib/fate";
import {
  aspectValue,
  consequenceValue,
  resourceValue,
  sheetHasExtraMild, sheetConsequences,
  stressBoxes,
  stressMarks,
} from "@/lib/sheet-data";
import { getSkillDefinitions, type TableConfig } from "@/lib/table-config";

const CONDITIONS = [
  { get severity() { return t("Leve"); }, value: 1, get physical() { return t("Arranhado"); }, get mental() { return t("Assustado"); }, key: "mild" },
  { get severity() { return t("Moderado"); }, value: 2, get physical() { return t("Machucado"); }, get mental() { return t("Abalado"); }, key: "moderate" },
  { get severity() { return t("Severo"); }, value: 3, get physical() { return t("Ferido"); }, get mental() { return t("Desmoralizado"); }, key: "severe" },
] as const;

function CleanSection({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  useAppLanguage();
  return <section className={`clean-section ${className}`}><h2>{title}</h2>{children}</section>;
}

export function SheetView({ character, tableConfig }: { character: FateCharacter; tableConfig: TableConfig }) {
  useAppLanguage();
  const structure = tableConfig.sheetStructure;
  const skills = getSkillDefinitions(tableConfig)
    .map((skill, order) => ({ ...skill, order, rating: character.skills[skill.id] ?? 0 }))
    .sort((a, b) => b.rating - a.rating || a.order - b.order);
  const extraMild = sheetHasExtraMild(character, tableConfig);
  const visibleConsequences = sheetConsequences(character, tableConfig);
  const aspects = structure.aspects.map((item) => ({ ...item, value: aspectValue(character, item.id) })).filter((item) => item.value.trim());
  const stunts = character.stunts.filter((stunt) => stunt.trim());
  const customRules = tableConfig.customRules.filter((rule) => rule.enabled && rule.scopes.includes("sheet"));

  return (
    <article className="clean-sheet" aria-label={t(`Visualização da Ficha ${character.name || t("sem nome")}`, "Sheet view: " + String(character.name || t("sem nome")) + "")}>
      <header className="clean-sheet-hero" data-has-image={Boolean(character.optional.image)}>
        {character.optional.image && <SheetImage image={character.optional.image} name={character.name} shape={structure.imageShape} editable={false} />}
        <div className="clean-identity">
          <h1>{character.name || t("Sem nome")}</h1>
          {character.description.trim() && <p>{character.description}</p>}
        </div>
        {structure.resources.length > 0 && (
          <dl className="clean-resources">
            {structure.resources.map((resource) => {
              const value = resourceValue(character, resource.id);
              return <div key={resource.id}><dt>{uiLabel(resource)}{false && resource.translation && <small>{resource.translation}</small>}</dt><dd>{resource.kind === "check" ? value === "true" ? <><Check /> {t("Sim")}</> : t("Não") : value || "—"}</dd></div>;
            })}
          </dl>
        )}
      </header>

      <div className="clean-sheet-grid">
        {aspects.length > 0 && (
          <CleanSection title={t(structure.labels.aspects)} className="clean-aspects">
            <dl>{aspects.map((aspect) => <div key={aspect.id}><dt>{uiLabel(aspect)}{false && aspect.translation && <small>{aspect.translation}</small>}</dt><dd>{aspect.value}</dd></div>)}</dl>
          </CleanSection>
        )}

        <CleanSection title={t(structure.labels.state)} className="clean-state">
          {structure.stressTracks.length > 0 && (
            <div className="clean-stress-list">
              {structure.stressTracks.map((track) => {
                const count = stressBoxes(character, track);
                const marks = stressMarks(character, track.id);
                return <div key={track.id}><span>{uiLabel(track)}{false && track.translation && <small>{track.translation}</small>}</span><div aria-label={`${uiLabel(track)}: ${marks.slice(0, count).filter(Boolean).length} de ${count} marcadas`}>{Array.from({ length: count }, (_, index) => <i key={index} data-checked={marks[index] ?? false}>{marks[index] ? <Check /> : null}</i>)}</div></div>;
              })}
            </div>
          )}

          {tableConfig.damageMode === "consequences" ? (
            visibleConsequences.length > 0 && <div className="clean-consequences">{visibleConsequences.map((item) => <div key={item.id} data-empty={!consequenceValue(character, item.id).trim()}><span><b>{item.value}</b><span>{uiLabel(item)}{item.qualifier && <small>{t(item.qualifier)}</small>}{item.track === "physical" && <small>{t("Física", "Physical")}</small>}{item.track === "mental" && <small>{t("Mental", "Mental")}</small>}{item.legacy && <small>{t("Texto anterior preservado — passe para o tipo correspondente.", "Previous text preserved — move it to the matching type.")}</small>}</span></span><p>{consequenceValue(character, item.id) || t("Livre")}</p></div>)}</div>
          ) : (
            <div className="clean-conditions">
              {CONDITIONS.flatMap((condition) => (["physical", "mental"] as const).map((track) => {
                const key = `${condition.key}:${track}`;
                const extra = extraMild && condition.key === "mild" && character.optional.conditionExtraTrack === track ? 2 : 0;
                const count = (tableConfig.damageMode === "split-conditions" ? 2 : 1) + extra;
                const marks = character.optional.conditionMarks[key] ?? [];
                return <div key={key}><span><b>{condition.value}</b>{condition[track]}<small>{condition.severity} · {track === "physical" ? t("físico") : "mental"}</small></span><div>{Array.from({ length: count }, (_, index) => <i key={index} data-checked={marks[index] ?? false}>{marks[index] ? <Check /> : null}</i>)}</div></div>;
              }))}
            </div>
          )}

          {tableConfig.officialRules.extremeConsequences && <div className="clean-extreme"><b>{t("8 · Extrema")}</b><p>{character.optional.extremeConsequence || t("Livre")}</p></div>}
          {(tableConfig.officialRules.scale || tableConfig.officialRules.weaponArmor) && <dl className="clean-combat-options">{tableConfig.officialRules.scale && <div><dt>{t("Escala")}</dt><dd>{({ mundane: "Mundano", supernatural: "Sobrenatural", otherworldly: "Extramundano", legendary: t("Lendário"), divine: "Divino" } as const)[character.optional.scale]}</dd></div>}{tableConfig.officialRules.weaponArmor && <><div><dt>{t("Arma")}</dt><dd>{character.optional.weaponRating}</dd></div><div><dt>{t("Armadura")}</dt><dd>{character.optional.armorRating}</dd></div></>}</dl>}
        </CleanSection>

        <CleanSection title={t(structure.labels.skills)} className="clean-skills">
          <ol>{skills.map((skill) => <li key={skill.id}><b>{skill.rating >= 0 ? `+${skill.rating}` : skill.rating}</b><span>{uiLabel(skill)}{false && skill.en && <small>{skill.en}</small>}</span><em>{adjectiveFor(skill.rating, getAppLanguage())}</em></li>)}</ol>
        </CleanSection>

        {stunts.length > 0 && (
          <CleanSection title={t(structure.labels.stunts)} className="clean-stunts">
            <ol>{stunts.map((stunt, index) => <li key={index}><b>{index + 1}</b><p>{stunt}</p></li>)}</ol>
          </CleanSection>
        )}

        {(character.notes.trim() || customRules.length > 0) && (
          <CleanSection title={t(structure.labels.notes)} className="clean-notes">
            {character.notes.trim() && <p>{character.notes}</p>}
            {customRules.length > 0 && <div className="clean-custom-rules">{customRules.map((rule) => <article key={rule.id}><span><Sparkles /> {t("Regra da mesa")}</span><b>{rule.name}</b><p>{rule.description}</p>{rule.field && <dl><dt>{rule.field.label}</dt><dd>{rule.field.type === "check" ? character.optional.customValues[rule.id] === "true" ? t("Sim") : t("Não") : character.optional.customValues[rule.id] || "—"}</dd></dl>}</article>)}</div>}
          </CleanSection>
        )}
      </div>
    </article>
  );
}
