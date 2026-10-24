"use client";

import { useEffect } from "react";
import { useAppLanguage } from "@/lib/app-language";
import { recordDiagnostic } from "@/lib/local-diagnostics";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useAppLanguage();
  useEffect(() => { recordDiagnostic("app", "error"); }, []);
  return (
    <main className="workspace-panel" role="alert">
      <h1>{t("Não foi possível abrir esta parte.", "This part could not be opened.")}</h1>
      <p>{t("Tente novamente. Se continuar, recarregue a página.", "Try again. If it keeps happening, reload the page.")}</p>
      <div className="toolbar-actions">
        <button type="button" data-slot="button" data-variant="outline" onClick={reset}>
          {t("Tentar novamente", "Try again")}
        </button>
        <button type="button" data-slot="button" data-variant="outline" onClick={() => window.location.reload()}>
          {t("Recarregar página", "Reload page")}
        </button>
      </div>
    </main>
  );
}
