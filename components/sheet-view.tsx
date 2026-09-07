"use client";

import * as React from "react";
import { Check, Sparkles } from "lucide-react";
import { SheetImage } from "@/components/sheet-image";
import { adjectiveFor, type FateCharacter } from "@/lib/fate";
import {
  aspectValue,
  consequenceValue,
  resourceValue,
  sheetHasExtraMild,
  stressBoxes,
  stressMarks,
} from "@/lib/sheet-data";
import { getSkillDefinitions, type TableConfig } from "@/lib/table-config";

const CONDITIONS = [
  { severity: "Leve", value: 1, physical: "Arranhado", mental: "Assustado", key: "mild" },
  { severity: "Moderado", value: 2, physical: "Machucado", mental: "Abalado", key: "moderate" },
  { severity: "Severo", value: 3, physical: "Ferido", mental: "Desmoralizado", key: "severe" },
] as const;

function CleanSection({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`clean-section ${className}`}><h2>{title}</h2>{children}</section>;
}

export function SheetView({ character, tableConfig }: { character: FateCharacter; tableConfig: TableConfig }) {
  const structure = tableConfig.sheetStructure;
  const skills = getSkillDefinitions(tableConfig)
    .map((skill, order) => ({ ...skill, order, rating: character.skills[skill.id] ?? 0 }))
    .sort((a, b) => b.rating - a.rating || a.order - b.order);
  const extraMild = sheetHasExtraMild(character, tableConfig);
  const visibleConsequences = structure.consequences.filter((item) => item.availability === "always" || extraMild);
  const aspects = structure.aspects.map((item) => ({ ...item, value: aspectValue(character, item.id) })).filter((item) => item.value.trim());
  const stunts = character.stunts.filter((stunt) => stunt.trim());
  const customRules = tableConfig.customRules.filter((rule) => rule.enabled && rule.scopes.includes("sheet"));

  return (
    <article className="clean-sheet" aria-label={`Visualização da Ficha ${character.name || "sem nome"}`}>
      <header className="clean-sheet-hero" data-has-image={Boolean(character.optional.image)}>
        {character.optional.image && <SheetImage image={character.optional.image} name={character.name} shape={structure.imageShape} editable={false} />}
        <div className="clean-identity">
          <h1>{character.name || "Sem nome"}</h1>
          {character.description.trim() && <p>{character.description}</p>}
        </div>
        {structure.resources.length > 0 && (
          <dl className="clean-resources">
            {structure.resources.map((resource) => {
              const value = resourceValue(character, resource.id);
              return <div key={resource.id}><dt>{resource.label}{structure.showTranslations && resource.translation && <small>{resource.translation}</small>}</dt><dd>{resource.kind === "check" ? value === "true" ? <><Check /> Sim</> : "Não" : value || "—"}</dd></div>;
            })}
          </dl>
        )}
      </header>

      <div className="clean-sheet-grid">
        {aspects.length > 0 && (
          <CleanSection title={structure.labels.aspects} className="clean-aspects">
            <dl>{aspects.map((aspect) => <div key={aspect.id}><dt>{aspect.label}{structure.showTranslations && aspect.translation && <small>{aspect.translation}</small>}</dt><dd>{aspect.value}</dd></div>)}</dl>
          </CleanSection>
        )}

        <CleanSection title={structure.labels.state} className="clean-state">
          {structure.stressTracks.length > 0 && (
            <div className="clean-stress-list">
              {structure.stressTracks.map((track) => {
                const count = stressBoxes(character, track);
                const marks = stressMarks(character, track.id);
                return <div key={track.id}><span>{track.label}{structure.showTranslations && track.translation && <small>{track.translation}</small>}</span><div aria-label={`${track.label}: ${marks.slice(0, count).filter(Boolean).length} de ${count} marcadas`}>{Array.from({ length: count }, (_, index) => <i key={index} data-checked={marks[index] ?? false}>{marks[index] ? <Check /> : null}</i>)}</div></div>;
              })}
            </div>
          )}

          {tableConfig.damageMode === "consequences" ? (
            visibleConsequences.length > 0 && <div className="clean-consequences">{visibleConsequences.map((item) => <div key={item.id} data-empty={!consequenceValue(character, item.id).trim()}><span><b>{item.value}</b><span>{item.label}{item.qualifier && <small>{item.qualifier}</small>}</span></span><p>{consequenceValue(character, item.id) || "Livre"}</p></div>)}</div>
          ) : (
            <div className="clean-conditions">
              {CONDITIONS.flatMap((condition) => (["physical", "mental"] as const).map((track) => {
                const key = `${condition.key}:${track}`;
                const extra = extraMild && condition.key === "mild" && character.optional.conditionExtraTrack === track ? 2 : 0;
                const count = (tableConfig.damageMode === "split-conditions" ? 2 : 1) + extra;
                const marks = character.optional.conditionMarks[key] ?? [];
                return <div key={key}><span><b>{condition.value}</b>{condition[track]}<small>{condition.severity} · {track === "physical" ? "físico" : "mental"}</small></span><div>{Array.from({ length: count }, (_, index) => <i key={index} data-checked={marks[index] ?? false}>{marks[index] ? <Check /> : null}</i>)}</div></div>;
              }))}
            </div>
          )}

          {tableConfig.officialRules.extremeConsequences && <div className="clean-extreme"><b>8 · Extrema</b><p>{character.optional.extremeConsequence || "Livre"}</p></div>}
          {(tableConfig.officialRules.scale || tableConfig.officialRules.weaponArmor) && <dl className="clean-combat-options">{tableConfig.officialRules.scale && <div><dt>Escala</dt><dd>{({ mundane: "Mundano", supernatural: "Sobrenatural", otherworldly: "Extramundano", legendary: "Lendário", divine: "Divino" } as const)[character.optional.scale]}</dd></div>}{tableConfig.officialRules.weaponArmor && <><div><dt>Arma</dt><dd>{character.optional.weaponRating}</dd></div><div><dt>Armadura</dt><dd>{character.optional.armorRating}</dd></div></>}</dl>}
        </CleanSection>

        <CleanSection title={structure.labels.skills} className="clean-skills">
          <ol>{skills.map((skill) => <li key={skill.id}><b>{skill.rating >= 0 ? `+${skill.rating}` : skill.rating}</b><span>{skill.pt}{structure.showTranslations && skill.en && <small>{skill.en}</small>}</span><em>{adjectiveFor(skill.rating)}</em></li>)}</ol>
        </CleanSection>

        {stunts.length > 0 && (
          <CleanSection title={structure.labels.stunts} className="clean-stunts">
            <ol>{stunts.map((stunt, index) => <li key={index}><b>{index + 1}</b><p>{stunt}</p></li>)}</ol>
          </CleanSection>
        )}

        {(character.notes.trim() || customRules.length > 0) && (
          <CleanSection title={structure.labels.notes} className="clean-notes">
            {character.notes.trim() && <p>{character.notes}</p>}
            {customRules.length > 0 && <div className="clean-custom-rules">{customRules.map((rule) => <article key={rule.id}><span><Sparkles /> Regra da mesa</span><b>{rule.name}</b><p>{rule.description}</p>{rule.field && <dl><dt>{rule.field.label}</dt><dd>{rule.field.type === "check" ? character.optional.customValues[rule.id] === "true" ? "Sim" : "Não" : character.optional.customValues[rule.id] || "—"}</dd></dl>}</article>)}</div>}
          </CleanSection>
        )}
      </div>
    </article>
  );
}
