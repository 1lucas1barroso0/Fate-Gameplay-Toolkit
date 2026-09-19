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
    <p>{t("Opcional. Guarda neste navegador um resumo técnico dos últimos 7 dias para ajudar a entender falhas. Não inclui nomes, textos, arquivos, endereços, Fichas nem dados de acesso. Nada é enviado sozinho.", "Optional. Keeps a technical summary from the last 7 days in this browser to help investigate failures. It never includes names, text, files, addresses, sheets or access details. Nothing is sent on its own.")}</p>
    <label><input type="checkbox" checked={enabled} onChange={event => { try { setDiagnosticsEnabled(event.target.checked); setEnabled(event.target.checked); setFailed(false); } catch { setFailed(true); } }} /> {t("Guardar diagnóstico neste navegador", "Keep diagnostics in this browser")}</label>
    {failed && <p role="alert">{t("Este navegador não permitiu salvar a preferência.", "This browser could not save the preference.")}</p>}
    {enabled && <Button variant="outline" onClick={() => safeJsonDownload("fate-diagnostics.json", { format: "fate-diagnostics", version: 1, events: readDiagnostics() })}>{t("Exportar diagnóstico", "Export diagnostics")}</Button>}
  </section>;
}
