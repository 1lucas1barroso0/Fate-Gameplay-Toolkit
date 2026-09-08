"use client";

import * as React from "react";
import { BookOpen, Dices, FileText, Sparkles, UsersRound } from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { FateMark } from "@/components/fate-mark";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCharacterStore } from "@/lib/use-character-store";
import { useRoom } from "@/lib/use-room";
import { useTableConfig } from "@/lib/use-table-config";

const LoadingWorkspace = () => <div className="loading-panel">Abrindo…</div>;
const CharacterSheet = dynamic(() => import("@/components/character-sheet").then((module) => module.CharacterSheet), { loading: LoadingWorkspace });
const RulesLibrary = dynamic(() => import("@/components/rules-library").then((module) => module.RulesLibrary), { loading: LoadingWorkspace });
const DiceRoller = dynamic(() => import("@/components/dice-roller").then((module) => module.DiceRoller), { loading: LoadingWorkspace });
const Rooms = dynamic(() => import("@/components/rooms").then((module) => module.Rooms), { loading: LoadingWorkspace });
const TableSettings = dynamic(() => import("@/components/table-settings").then((module) => module.TableSettings), { loading: LoadingWorkspace });

type Workspace = "ficha" | "regras" | "dados" | "salas" | "seu-fate";

export function FateApp() {
  const characterStore = useCharacterStore();
  const roomStore = useRoom();
  const tableStore = useTableConfig();
  const [workspace, setWorkspace] = React.useState<Workspace>("ficha");
  const [ruleTarget, setRuleTarget] = React.useState("");
  const { characters, activeCharacter, activeId, hydrated: charactersHydrated, replaceRulesProfileLink, replaceRoomLink } = characterStore;
  const { savedRooms, session, hydrated: roomsHydrated, linkRulesProfile, replaceRulesProfileLink: replaceRoomRulesProfileLink } = roomStore;
  const { profiles, activeProfileId, hydrated: rulesHydrated, getProfile, selectProfile } = tableStore;

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      const saved = localStorage.getItem("fate-gameplay-toolkit.workspace");
      if (saved === "ficha" || saved === "regras" || saved === "dados" || saved === "salas" || saved === "seu-fate") setWorkspace(saved);
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  const changeWorkspace = (value: string) => {
    const next = value as Workspace;
    setWorkspace(next);
    try {
      localStorage.setItem("fate-gameplay-toolkit.workspace", next);
    } catch {
      toast.info("A área foi aberta, mas o navegador não conseguiu lembrar esta preferência.");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openSharedRule = (reference: string) => {
    setRuleTarget(`${reference}:${Date.now()}`);
    changeWorkspace("regras");
  };

  const openRules = (profileId: string) => {
    tableStore.selectProfile(profileId);
    changeWorkspace("regras");
  };

  const openRulesSettings = (profileId: string) => {
    tableStore.selectProfile(profileId);
    changeWorkspace("seu-fate");
  };

  const openSavedRoom = async (participantId: string) => {
    const saved = roomStore.savedRooms.find((room) => room.session.participantId === participantId);
    if (saved?.rulesProfileId) tableStore.selectProfile(saved.rulesProfileId);
    await roomStore.switchRoom(participantId);
    changeWorkspace("salas");
  };

  const selectSheetRules = (profileId: string) => {
    tableStore.selectProfile(profileId);
  };

  const deleteRulesProfile = (profileId: string) => {
    const replacementId = tableStore.deleteProfile(profileId);
    replaceRulesProfileLink(profileId, replacementId);
    replaceRoomRulesProfileLink(profileId, replacementId);
  };

  const deleteRulesProfiles = (profileIds: string[]) => {
    const result = tableStore.deleteProfiles(profileIds);
    for (const profileId of result.removedIds) {
      replaceRulesProfileLink(profileId, result.replacementId);
      replaceRoomRulesProfileLink(profileId, result.replacementId);
    }
    return result;
  };

  React.useEffect(() => {
    if (!charactersHydrated || !roomsHydrated || !rulesHydrated) return;
    const profileIds = new Set(profiles.map((profile) => profile.id));
    const roomIds = new Set(savedRooms.map((room) => room.session.participantId));
    const invalidProfiles = new Set(characters.map((character) => character.optional.links.rulesProfileId).filter((id) => id && !profileIds.has(id)));
    const invalidRooms = new Set(characters.map((character) => character.optional.links.roomParticipantId).filter((id) => id && !roomIds.has(id)));
    if (characters.some((character) => !character.optional.links.rulesProfileId)) replaceRulesProfileLink("", activeProfileId);
    savedRooms.filter((room) => !room.rulesProfileId).forEach((room) => linkRulesProfile(room.session.participantId, activeProfileId));
    invalidProfiles.forEach((id) => replaceRulesProfileLink(id, activeProfileId));
    invalidRooms.forEach((id) => replaceRoomLink(id));
  }, [activeProfileId, characters, charactersHydrated, linkRulesProfile, profiles, replaceRoomLink, replaceRulesProfileLink, roomsHydrated, rulesHydrated, savedRooms]);

  React.useEffect(() => {
    if (workspace !== "ficha" || !charactersHydrated || !rulesHydrated) return;
    const linkedId = activeCharacter.optional.links.rulesProfileId;
    if (linkedId && getProfile(linkedId)) {
      selectProfile(linkedId);
    }
  }, [activeCharacter.optional.links.rulesProfileId, activeId, charactersHydrated, getProfile, rulesHydrated, selectProfile, workspace]);

  React.useEffect(() => {
    if (workspace !== "salas" || !session) return;
    const saved = savedRooms.find((room) => room.session.participantId === session.participantId);
    if (saved?.rulesProfileId && getProfile(saved.rulesProfileId)) selectProfile(saved.rulesProfileId);
  }, [getProfile, savedRooms, selectProfile, session, workspace]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">Pular para o conteúdo</a>
      <header className="app-header">
        <div className="brand-lockup" aria-label="Fate Gameplay Toolkit">
          <FateMark className="app-mark" />
          <span><span className="brand-title"><b>Fate</b><strong>Gameplay Toolkit</strong></span><small>Fichas, regras e mesas do seu jeito</small></span>
        </div>
      </header>

      <Tabs value={workspace} onValueChange={changeWorkspace}>
        <nav className="main-nav" aria-label="Áreas da ferramenta">
          <TabsList variant="line">
            <TabsTrigger value="ficha"><FileText /> <span>Fichas</span></TabsTrigger>
            <TabsTrigger value="regras"><BookOpen /> <span>Regras</span></TabsTrigger>
            <TabsTrigger value="dados"><Dices /> <span>Dados</span></TabsTrigger>
            <TabsTrigger value="salas"><UsersRound /> <span>Mesas</span></TabsTrigger>
            <TabsTrigger value="seu-fate"><Sparkles /> <span>Seu Fate</span></TabsTrigger>
          </TabsList>
        </nav>

        <main id="workspace-content">
          <TabsContent value="ficha"><CharacterSheet store={characterStore} tableConfig={tableStore.config} rulesProfiles={tableStore.profiles} activeRulesProfileId={tableStore.activeProfileId} savedRooms={roomStore.savedRooms} onOpenLinkedRoom={openSavedRoom} onOpenLinkedRules={openRules} onOpenRulesSettings={openRulesSettings} onSelectRulesProfile={selectSheetRules} onImportTableConfig={tableStore.importConfig} /></TabsContent>
          <TabsContent value="regras"><RulesLibrary openReference={ruleTarget} roomReady={roomStore.roomReady} onShareRule={async (title, reference) => { await roomStore.postRule(title, reference); }} tableConfig={tableStore.config} onOpenSettings={() => openRulesSettings(tableStore.activeProfileId)} /></TabsContent>
          <TabsContent value="dados"><DiceRoller character={characterStore.activeCharacter} roomReady={roomStore.roomReady} onRoomRoll={roomStore.roll} tableConfig={tableStore.config} onOpenSettings={() => openRulesSettings(tableStore.activeProfileId)} /></TabsContent>
          <TabsContent value="salas"><Rooms store={roomStore} onOpenRule={openSharedRule} rulesProfiles={tableStore.profiles} activeRulesProfileId={tableStore.activeProfileId} onSelectRulesProfile={tableStore.selectProfile} onOpenRulesProfile={openRules} onOpenSheets={() => changeWorkspace("ficha")} onOpenDice={() => changeWorkspace("dados")} /></TabsContent>
          <TabsContent value="seu-fate"><TableSettings store={tableStore} savedRooms={roomStore.savedRooms} roomReady={roomStore.roomReady} onShare={roomStore.postNote} onOpenRule={openSharedRule} onOpenRoom={openSavedRoom} onDeleteProfile={deleteRulesProfile} onDeleteProfiles={deleteRulesProfiles} characterStore={characterStore} roomStore={roomStore} /></TabsContent>
        </main>
      </Tabs>

      <footer className="app-footer">
        <p>Ferramenta independente. Fate™ é marca registrada da Evil Hat Productions, LLC. Não há patrocínio nem endosso da Evil Hat.</p>
        <p>Créditos, licenças e fontes de cada material estão identificados na Central de Regras.</p>
      </footer>
      <Toaster position="bottom-center" richColors closeButton />
    </div>
  );
}
