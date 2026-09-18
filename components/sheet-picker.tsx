"use client";

import { t, useAppLanguage } from "@/lib/app-language";
import * as React from "react";
import { Check, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { FateCharacter } from "@/lib/fate";
import type { RulesProfile } from "@/lib/rules-profiles";
import type { SavedRoom } from "@/lib/use-room";
import { matchesSheet } from "@/lib/sheet-search";

export function SheetPicker({ characters, activeId, onSelect, rooms, profiles }: { characters: FateCharacter[]; activeId: string; onSelect: (id: string) => void; rooms: SavedRoom[]; profiles: RulesProfile[] }) {
  useAppLanguage();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [room, setRoom] = React.useState("all");
  const [sort, setSort] = React.useState("recent");
  const active = characters.find(item => item.id === activeId);
  const results = React.useMemo(() => characters.filter(item => {
    const linkedRoom = rooms.find(saved => saved.session.participantId === item.optional.links.roomParticipantId);
    const profile = profiles.find(saved => saved.id === item.optional.links.rulesProfileId);
    return (room === "all" || (room === "none" ? !item.optional.links.roomParticipantId : item.optional.links.roomParticipantId === room))
      && matchesSheet(item, query, linkedRoom?.roomName, profile?.config.profileName);
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "pt-BR") : b.updatedAt - a.updatedAt), [characters, profiles, query, room, rooms, sort]);
  const choose = (id: string) => { onSelect(id); setOpen(false); };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" className="character-picker" aria-label={t("Escolher Ficha")}><FileText /><span>{active?.name || t("Sem nome")}</span><small>{characters.length}</small></Button></DialogTrigger>
    <DialogContent className="sheet-picker-dialog">
      <DialogHeader><DialogTitle>{t("Minhas Fichas")}</DialogTitle><DialogDescription>{t("Encontre pelo nome, aspecto, Mesa ou conjunto de regras.")}</DialogDescription></DialogHeader>
      <div className="sheet-search"><Search aria-hidden="true" /><Input autoFocus aria-label="Buscar Fichas" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Quem ou o que você procura?")} onKeyDown={event => { if (event.key === "Enter" && results.length === 1) { event.preventDefault(); choose(results[0].id); } }} /></div>
      <div className="sheet-picker-filters">
        <label>{t("Mesa")}<NativeSelect value={room} onChange={event => setRoom(event.target.value)}><NativeSelectOption value="all">{t("Todas as Mesas")}</NativeSelectOption><NativeSelectOption value="none">{t("Sem Mesa")}</NativeSelectOption>{rooms.map(saved => <NativeSelectOption key={saved.session.participantId} value={saved.session.participantId}>{saved.roomName || saved.session.roomCode}</NativeSelectOption>)}</NativeSelect></label>
        <label>{t("Ordenar")}<NativeSelect value={sort} onChange={event => setSort(event.target.value)}><NativeSelectOption value="recent">{t("Alteradas recentemente")}</NativeSelectOption><NativeSelectOption value="name">{t("Nome: A–Z")}</NativeSelectOption></NativeSelect></label>
      </div>
      <p className="reader-notice" role="status">{results.length} {t("de")} {characters.length} {t("Fichas")}</p>
      <div className="sheet-picker-results">{results.length ? results.map(item => <button type="button" key={item.id} aria-pressed={activeId === item.id} onClick={() => choose(item.id)}><FileText aria-hidden="true" /><span><b>{item.name || t("Sem nome")}</b><small>{item.aspects.highConcept || item.description || t("Ficha sem descrição")}</small></span>{activeId === item.id && <Check aria-hidden="true" />}</button>) : <div className="empty-inline"><p>{t("Nenhuma Ficha corresponde a esta busca.")}</p><Button variant="outline" onClick={() => { setQuery(""); setRoom("all"); }}>{t("Limpar filtros")}</Button></div>}</div>
    </DialogContent>
  </Dialog>;
}
