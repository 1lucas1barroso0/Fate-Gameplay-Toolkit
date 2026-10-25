"use client";

import { useEffect, useRef } from "react";
import { useAppLanguage } from "@/lib/app-language";
import { workspaceStorage } from "@/lib/workspace-storage";
import { Button } from "@/components/ui/button";

const KEY = "fate-gameplay-toolkit.first-steps.v1";

export function GettingStarted({ onCreate, onRooms, onRules }: { onCreate: () => void; onRooms: () => void; onRules: () => void }) {
  const { t } = useAppLanguage();
  const panel = useRef<HTMLDetailsElement>(null);
  const ready = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { if (panel.current) panel.current.open = workspaceStorage.getItem(KEY) !== "closed"; }
      catch { /* The guide can still be opened without storage. */ }
      ready.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <details ref={panel} className="getting-started" onToggle={event => {
    if (ready.current && !event.currentTarget.open) {
      try { workspaceStorage.setItem(KEY, "closed"); } catch { /* Closing help must always work. */ }
    }
  }}>
    <summary>{t("Primeira vez por aqui?", "First time here?")}</summary>
    <ol>
      <li><b>{t("Crie sua Ficha", "Create your sheet")}</b><p>{t("Dê um nome e escreva quem é seu personagem. Os outros campos podem ser preenchidos aos poucos.", "Give your character a name and describe who they are. You can fill in the other fields as you go.")}</p><Button type="button" size="sm" variant="outline" onClick={onCreate}>{t("Criar uma Ficha", "Create a sheet")}</Button></li>
      <li><b>{t("Jogue com seu grupo", "Play with your group")}</b><p>{t("Em Mesas, use o código do narrador para pedir entrada. Se você vai narrar, crie uma Mesa e compartilhe o código.", "In Tables, use your narrator’s code to ask to join. If you are narrating, create a table and share its code.")}</p><Button type="button" size="sm" variant="outline" onClick={onRooms}>{t("Ir para Mesas", "Go to tables")}</Button></li>
      <li><b>{t("Consulte quando precisar", "Look things up when needed")}</b><p>{t("Em Regras, pesquise uma dúvida ou comece pela introdução. Em Dados, escolha a perícia da Ficha e role quando a mesa pedir.", "In Rules, search for an answer or start with the introduction. In Dice, choose a sheet skill and roll when your group calls for it.")}</p><Button type="button" size="sm" variant="outline" onClick={onRules}>{t("Abrir as regras", "Open the rules")}</Button></li>
    </ol>
    <p className="getting-started-note">{t("Você pode começar sem conta. Use “Entrar” no topo se quiser levar seus dados para outros dispositivos.", "You can start without an account. Use “Sign in” at the top if you want your data on other devices.")}</p>
  </details>;
}
