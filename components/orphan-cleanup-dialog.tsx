"use client";

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
  if (!result.found) return "Nenhuma cópia sem registro foi encontrada. Os arquivos publicados foram preservados.";
  const pending = result.pending || Math.max(0, result.found - result.removed);
  return `${result.found} cópia(s) sem registro encontrada(s); ${result.removed} removida(s)${pending ? `; ${pending} aguardando limpeza automática` : ""}.`;
}

export function OrphanCleanupDialog({
  onCleanup,
  disabled = false,
}: {
  onCleanup: () => Promise<OrphanCleanupResult>;
  disabled?: boolean;
}) {
  const [working, setWorking] = React.useState(false);

  const cleanup = async () => {
    if (working) return;
    setWorking(true);
    try {
      toast.success(cleanupMessage(await onCleanup()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A verificação não terminou. Nenhuma cópia publicada foi alterada.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled || working}>
          <RefreshCw className={working ? "animate-spin" : undefined} /> Verificar e limpar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm" className="maintenance-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Verificar cópias sem registro?</AlertDialogTitle>
          <AlertDialogDescription>
            Um envio interrompido pode deixar uma cópia no armazenamento sem aparecer no Histórico. Esta ação procura somente essas cópias e não remove arquivos publicados, Fichas, regras ou o Histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={working} onClick={() => void cleanup()}>
            {working ? "Verificando…" : "Verificar e limpar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
