"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAppLanguage } from "@/lib/app-language";
import { backupDue, readBackupReminder, writeBackupReminder } from "@/lib/backup-tools";

export function BackupReminder({ onOpen }: { onOpen: () => void }) {
  const { t } = useAppLanguage();
  const [due, setDue] = React.useState(false);
  React.useEffect(() => {
    const refresh = () => setDue(backupDue(readBackupReminder()));
    const timer = setTimeout(refresh, 0), interval = setInterval(refresh, 60000);
    window.addEventListener("fate:backup", refresh); window.addEventListener("storage", refresh);
    return () => { clearTimeout(timer); clearInterval(interval); window.removeEventListener("fate:backup", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  if (!due) return null;
  return <aside className="backup-reminder" role="status"><span>{t("Hora de guardar uma cópia do seu Fate.", "Time to save a copy of your Fate.")}</span><Button size="sm" variant="outline" onClick={onOpen}>{t("Abrir backups", "Open backups")}</Button><Button size="sm" variant="ghost" onClick={() => { try { writeBackupReminder({ ...readBackupReminder(), snoozedUntil: Date.now() + 86400000 }); } catch { /* Dismiss for this tab. */ } setDue(false); }}>{t("Lembrar amanhã", "Remind me tomorrow")}</Button></aside>;
}
