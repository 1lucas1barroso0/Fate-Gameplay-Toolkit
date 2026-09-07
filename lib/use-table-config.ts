"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  createDefaultTableConfig,
  normalizeTableConfig,
  tableConfigSchema,
  type TableConfig,
} from "@/lib/table-config";
import {
  MAX_RULES_PROFILES,
  createRulesProfile,
  createRulesProfileCollection,
  duplicateRulesProfile,
  normalizeRulesProfileCollection,
  type RulesProfileCollection,
} from "@/lib/rules-profiles";

const LEGACY_STORE_KEY = "fate-gameplay-toolkit.table-config.v1";
const LEGACY_BACKUP_KEY = "fate-gameplay-toolkit.table-config.backup.v1";
const STORE_KEY = "fate-gameplay-toolkit.rules-profiles.v1";
const BACKUP_KEY = "fate-gameplay-toolkit.rules-profiles.backup.v1";

function readStoredCollection() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) return normalizeRulesProfileCollection(JSON.parse(raw));
  const legacy = localStorage.getItem(LEGACY_STORE_KEY);
  return legacy
    ? createRulesProfileCollection(tableConfigSchema.parse(JSON.parse(legacy)))
    : null;
}

function accentForeground(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 145 ? "#071217" : "#ffffff";
}

export function useTableConfig() {
  const initial = React.useMemo(() => createRulesProfileCollection(), []);
  const [collection, setCollection] = React.useState<RulesProfileCollection>(initial);
  const [hydrated, setHydrated] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const lastSerialized = React.useRef("");
  const { setTheme } = useTheme();

  const activeProfile = collection.profiles.find((profile) => profile.id === collection.activeProfileId)
    ?? collection.profiles[0];
  const config = activeProfile.config;

  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const stored = readStoredCollection();
        if (stored) setCollection(stored);
      } catch {
        toast.error("As regras salvas estavam inválidas. O padrão do livro foi mantido.");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.style.setProperty("--user-accent", config.appearance.accent);
    root.style.setProperty("--accent-on", accentForeground(config.appearance.accent));
    root.dataset.density = config.appearance.density;
    root.dataset.textSize = config.appearance.textSize;
    root.dataset.corners = config.appearance.corners;
    setTheme(config.appearance.theme);
  }, [config.appearance, hydrated, setTheme]);

  React.useEffect(() => {
    if (!hydrated) return;
    const handle = window.setTimeout(() => {
      const serialized = JSON.stringify(collection);
      if (serialized === lastSerialized.current) return;
      try {
        const previous = localStorage.getItem(STORE_KEY);
        if (previous && previous !== serialized) localStorage.setItem(BACKUP_KEY, previous);
        localStorage.setItem(STORE_KEY, serialized);
        localStorage.setItem(LEGACY_STORE_KEY, JSON.stringify(config));
        lastSerialized.current = serialized;
        setLastSavedAt(Date.now());
      } catch {
        toast.error("Não foi possível guardar as regras neste dispositivo.");
      }
    }, 220);
    return () => window.clearTimeout(handle);
  }, [collection, config, hydrated]);

  const update = React.useCallback((updater: (current: TableConfig) => TableConfig) => {
    setCollection((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => {
        if (profile.id !== current.activeProfileId) return profile;
        const now = Date.now();
        return { ...profile, config: { ...updater(profile.config), updatedAt: now }, updatedAt: now };
      }),
    }));
  }, []);

  const getProfile = React.useCallback((profileId: string) => collection.profiles.find((profile) => profile.id === profileId), [collection.profiles]);

  const selectProfile = React.useCallback((profileId: string) => {
    setCollection((current) => current.profiles.some((profile) => profile.id === profileId)
      ? { ...current, activeProfileId: profileId }
      : current);
  }, []);

  const addProfile = React.useCallback((name = "Novo conjunto") => {
    if (collection.profiles.length >= MAX_RULES_PROFILES) throw new Error("Você já guardou muitos conjuntos de regras neste dispositivo.");
    const profile = createRulesProfile({ ...createDefaultTableConfig(), profileName: name });
    setCollection((current) => ({ ...current, activeProfileId: profile.id, profiles: [...current.profiles, profile] }));
    return profile;
  }, [collection.profiles.length]);

  const duplicateProfile = React.useCallback((profileId = collection.activeProfileId) => {
    if (collection.profiles.length >= MAX_RULES_PROFILES) throw new Error("Você já guardou muitos conjuntos de regras neste dispositivo.");
    const source = collection.profiles.find((profile) => profile.id === profileId) ?? activeProfile;
    const profile = duplicateRulesProfile(source);
    setCollection((current) => ({ ...current, activeProfileId: profile.id, profiles: [...current.profiles, profile] }));
    return profile;
  }, [activeProfile, collection.activeProfileId, collection.profiles]);

  const deleteProfile = React.useCallback((profileId: string) => {
    if (collection.profiles.length <= 1) return collection.profiles[0].id;
    const profiles = collection.profiles.filter((profile) => profile.id !== profileId);
    const replacementId = profiles.find((profile) => profile.id === collection.activeProfileId)?.id ?? profiles[0].id;
    setCollection({ version: 1, activeProfileId: replacementId, profiles });
    return replacementId;
  }, [collection]);

  const importConfig = React.useCallback((input: unknown) => {
    if (collection.profiles.length >= MAX_RULES_PROFILES) throw new Error("Você já guardou muitos conjuntos de regras neste dispositivo.");
    const profile = createRulesProfile(normalizeTableConfig(input));
    setCollection((current) => ({ ...current, activeProfileId: profile.id, profiles: [...current.profiles, profile] }));
    return profile;
  }, [collection.profiles.length]);

  const reset = React.useCallback(() => {
    update(() => createDefaultTableConfig());
  }, [update]);

  const restoreBackup = React.useCallback(() => {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (raw) {
      setCollection(normalizeRulesProfileCollection(JSON.parse(raw)));
      return;
    }
    const legacy = localStorage.getItem(LEGACY_BACKUP_KEY);
    if (!legacy) throw new Error("Não há uma versão anterior para recuperar.");
    const restored = tableConfigSchema.parse(JSON.parse(legacy));
    setCollection(createRulesProfileCollection(restored));
  }, []);

  return {
    config,
    profiles: collection.profiles,
    activeProfile,
    activeProfileId: activeProfile.id,
    getProfile,
    selectProfile,
    addProfile,
    duplicateProfile,
    deleteProfile,
    update,
    importConfig,
    reset,
    restoreBackup,
    hydrated,
    lastSavedAt,
  };
}

export type TableConfigStore = ReturnType<typeof useTableConfig>;
