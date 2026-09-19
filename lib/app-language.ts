"use client";

import { WORKSPACE_EVENT, workspaceStorage as localStorage } from "@/lib/workspace-storage";

import { useSyncExternalStore } from "react";
import messages from "@/content/interface-en.json";

export type AppLanguage = "pt" | "en";
const key = "fate-gameplay-toolkit.language.v1";
let language: AppLanguage = "pt";
let initialized = false;
const listeners = new Set<() => void>();
function notify() { listeners.forEach(listener => listener()); }
export function setAppLanguage(next: AppLanguage) {
  language = next;
  try { localStorage.setItem(key, next); } catch { /* Remains available in this tab. */ }
  document.documentElement.lang = next === "pt" ? "pt-BR" : "en";
  notify();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    try { language = localStorage.getItem(key) === "en" ? "en" : "pt"; } catch { /* Portuguese is the default. */ }
    document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
    window.addEventListener(WORKSPACE_EVENT, () => {
      try { language = localStorage.getItem(key) === "en" ? "en" : "pt"; } catch { language = "pt"; }
      document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
      notify();
    });
    window.addEventListener("storage", event => {
      if (event.key === key) { language = event.newValue === "en" ? "en" : "pt"; document.documentElement.lang = language === "pt" ? "pt-BR" : "en"; notify(); }
    });
    notify();
  }
  return () => { listeners.delete(listener); };
}
export function getAppLanguage(): AppLanguage { return typeof window === "undefined" ? "pt" : language; }
export function t(pt: string, en?: string): string {
  if (getAppLanguage() === "pt") return pt;
  return en ?? (messages as Record<string, string>)[pt] ?? pt;
}
export function useAppLanguage() {
  const language = useSyncExternalStore(subscribe, getAppLanguage, () => "pt" as const);
  return { language, locale: language === "pt" ? "pt-BR" : "en-US", setLanguage: setAppLanguage, t };
}
export function uiLabel(value: { label?: string; translation?: string; pt?: string; en?: string }) {
  return getAppLanguage() === "en" ? value.en || value.translation || t(value.pt || value.label || "") : value.pt || value.label || "";
}
