"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAppLanguage } from "@/lib/app-language";
import { diagnosticsEnabled, setDiagnosticsEnabled, readDiagnostics } from "@/lib/local-diagnostics";
import { safeJsonDownload } from "@/lib/fate";

export function DiagnosticsSettings() {
  const { t } = useAppLanguage();
  const [enabled, setEnabled] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { const timer = setTimeout(() => setEnabled(diagnosticsEnabled()), 0); return () => clearTimeout(timer); }, []);
  return <section className="storage-action-section">
    <h3>{t("Diagnóstico privado", "Private diagnostics")}</h3>
    <p>{t("Opcional. Guarda neste navegador até 100 registros técnicos por até 7 dias: área, resultado, duração e código HTTP. Sem nomes, textos, arquivos, URLs, fichas ou credenciais. Nada é enviado automaticamente.", "Optional. Keeps up to 100 technical events in this browser for up to 7 days: area, outcome, duration and HTTP status. No names, text, files, URLs, sheets or credentials. Nothing is sent automatically.")}</p>
    <label><input type="checkbox" checked={enabled} onChange={event => { try { setDiagnosticsEnabled(event.target.checked); setEnabled(event.target.checked); setFailed(false); } catch { setFailed(true); } }} /> {t("Guardar diagnóstico local", "Keep local diagnostics")}</label>
    {failed && <p role="alert">{t("Este navegador não permitiu salvar a preferência.", "This browser could not save the preference.")}</p>}
    {enabled && <Button variant="outline" onClick={() => safeJsonDownload("fate-diagnostics.json", { format: "fate-diagnostics", version: 1, events: readDiagnostics() })}>{t("Exportar diagnóstico", "Export diagnostics")}</Button>}
  </section>;
}
