"use client";

import { t, useAppLanguage } from "@/lib/app-language";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type OrphanCleanupResult = {
  found: number;
  removed: number;
  pending: number;
};

function cleanupMessage(result: OrphanCleanupResult) {
  if (!result.found) return t("Tudo certo. Nenhuma sobra de envio foi encontrada e os arquivos publicados continuam intactos.");
  const pending = result.pending || Math.max(0, result.found - result.removed);
  const found = result.found === 1 ? "1 sobra de envio encontrada" : `${result.found} sobras de envio encontradas`;
  const removed = result.removed === 1 ? "1 removida" : `${result.removed} removidas`;
  const waiting = pending ? pending === 1 ? "; 1 será removida automaticamente" : `; ${pending} serão removidas automaticamente` : "";
  return t(`${found}; ${removed}${waiting}.`, `${result.found} interrupted-upload ${result.found === 1 ? "copy" : "copies"} found; ${result.removed} removed${pending ? `; ${pending} will be removed automatically` : ""}.`);
}

export function OrphanCleanupDialog({
  onCleanup,
  disabled = false,
}: {
  onCleanup: () => Promise<OrphanCleanupResult>;
  disabled?: boolean;
}) {
  useAppLanguage();
  const [working, setWorking] = React.useState(false);

  const cleanup = async () => {
    if (working) return;
    setWorking(true);
    try {
      toast.success(cleanupMessage(await onCleanup()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("A verificação não terminou. Nenhum arquivo publicado foi alterado."));
    } finally {
      setWorking(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled || working}>
          <RefreshCw className={working ? "animate-spin" : undefined} /> {t("Conferir envios")}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm" className="maintenance-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Conferir envios interrompidos?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("Se um envio parar no meio, pode sobrar uma cópia fora do Histórico. A ferramenta procura e remove somente essas sobras. Arquivos publicados, Fichas, regras e o Histórico ficam intactos.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={working} onClick={() => void cleanup()}>
            {working ? t("Conferindo…") : t("Conferir e limpar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
