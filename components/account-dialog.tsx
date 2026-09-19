"use client";

import * as React from "react";
import { Cloud, LogIn, LogOut, UserRound } from "lucide-react";
import { t, useAppLanguage } from "@/lib/app-language";
import { accountRequest } from "@/lib/workspace-sync";
import { useAccount, type AccountStatus } from "@/components/account-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function accountMessage(code: string) {
  if (code === "account_deleted") return t("Este cadastro foi apagado. Você pode continuar neste aparelho ou criar outra conta.", "This account was deleted. You can continue on this device or create another account.");
  if (code === "tab_conflict") return t("Há outra aba com mudanças nesta conta. Salve o que está editando e feche uma das abas para continuar.", "Another tab has changes in this account. Save your work and close one tab to continue.");
  if (code === "invalid_password") return t("Confira sua senha e tente de novo.", "Check your password and try again.");
  if (["INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD"].includes(code)) return t("Confira o e-mail e a senha e tente de novo.", "Check your email and password, then try again.");
  if (code.includes("USER_ALREADY_EXISTS")) return t("Este e-mail já tem uma conta. Você pode entrar ou recuperar o acesso.", "This email already has an account. Sign in or recover access.");
  if (code === "invalid_recovery") return t("Confira o e-mail e a chave de recuperação.", "Check your email and recovery key.");
  if (code === "sign_in_required" || code === "account_changed") return t("Entre novamente para abrir sua conta.", "Sign in again to open your account.");
  if (code === "workspace_conflict") return t("Escolha qual versão manter para continuar.", "Choose which version to keep to continue.");
  if (["account_storage_full", "workspace_invalid", "request_too_large"].includes(code)) return t("Não foi possível guardar tudo na conta. Exporte uma cópia e libere espaço em Seu Fate antes de tentar de novo.", "Your account could not save everything. Export a copy and free up space in Your Fate before trying again.");
  if (code === "room_already_linked") return t("Uma destas Mesas já está ligada a outra conta. Entre nessa conta para continuar.", "One of these tables is already linked to another account. Sign in to that account to continue.");
  if (["image_not_found", "invalid_image"].includes(code)) return t("Não foi possível abrir uma imagem da Ficha. Confira a imagem antes de tentar de novo.", "A sheet image could not be opened. Check the image before trying again.");
  if (code === "recovery_not_created") return t("Sua conta foi criada. Abra Chave de recuperação para guardar uma forma de recuperar o acesso.", "Your account is ready. Open Recovery key to save a way to recover access.");
  if (["RATE_LIMITED", "TOO_MANY_REQUESTS", "rate_limited"].includes(code)) return t("Foram muitas tentativas seguidas. Espere alguns minutos e tente de novo.", "There have been too many attempts. Wait a few minutes and try again.");
  if (["sync_before_logout", "local_save_failed", "sync_busy"].includes(code)) return t("Ainda há mudanças para salvar. Aguarde a sincronização antes de sair.", "There are still changes to save. Wait for them to sync before signing out.");
  return t("Não foi possível conectar agora. Suas mudanças continuam neste aparelho. Tente novamente quando a conexão voltar.", "Could not connect right now. Your changes are still on this device. Try again when your connection is back.");
}

export function AccountButton() {
  const account = useAccount();
  const attention = account.user && ["error", "conflict", "pending"].includes(account.status);
  return <Button type="button" variant="outline" className="account-button" onClick={account.open}>
    {account.user ? <UserRound /> : <LogIn />}<span>{account.user ? t("Minha conta", "My account") : t("Entrar", "Sign in")}</span>
    {attention ? <span className="account-attention" aria-label={t("Há mudanças para sincronizar", "Changes need syncing")} /> : null}
  </Button>;
}

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; user: { id: string; name: string; email: string } | null;
  available: boolean; status: AccountStatus; error: string; recoveryKey: string; setRecoveryKey: (key: string) => void;
  authenticate: (mode: "login" | "signup", input: { email: string; password: string; name: string; importDevice: boolean }) => Promise<void>;
  logout: () => Promise<void>; remove: (password: string) => Promise<{ cleanupPending: boolean } | undefined>;
  sync: () => Promise<boolean>; resolve: (prefer: "local" | "remote") => Promise<void>;
};

export function AccountDialog(props: Props) {
  useAppLanguage();
  const [mode, setMode] = React.useState<"login" | "signup" | "recover" | "delete" | "key" | "password">("login");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [failure, setFailure] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [nextPassword, setNextPassword] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const formId = React.useId();
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setFailure(""); setMessage("");
    try { await action(); setPassword(""); setNextPassword(""); setConfirmed(false); }
    catch (error) { setFailure(accountMessage(error instanceof Error ? error.message : "")); }
    finally { setBusy(false); }
  };
  const changeMode = (next: typeof mode) => { setMode(next); setPassword(""); setNextPassword(""); setFailure(""); setMessage(""); setConfirmed(false); };
  const onOpenChange = (open: boolean) => {
    if (busy) return;
    if (!open) { changeMode("login"); }
    props.onOpenChange(open);
  };
  const saveKey = () => {
    const blob = new Blob([`Fate Gameplay Toolkit\n${props.user?.email ?? ""}\n\n${props.recoveryKey}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "fate-chave-de-recuperacao.txt"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const title = props.user ? mode === "delete" ? t("Apagar cadastro", "Delete account") : mode === "key" ? t("Chave de recuperação", "Recovery key") : mode === "password" ? t("Trocar senha", "Change password") : t("Minha conta", "My account")
    : mode === "signup" ? t("Criar conta", "Create account") : mode === "recover" ? t("Recuperar acesso", "Recover access") : t("Entrar", "Sign in");
  return <Dialog open={props.open} onOpenChange={onOpenChange}>
    <DialogContent className="account-dialog" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>
        {props.user ? props.user.email : t("Suas Fichas e Mesas com você, em qualquer aparelho.", "Your sheets and tables with you, on any device.")}
      </DialogDescription></DialogHeader>
      {message ? <p role="status" className="account-success">{message}</p> : null}
      {failure || props.error ? <p role="alert" className="account-error">{failure || accountMessage(props.error)}</p> : null}
      {props.recoveryKey ? <div className="account-key">
        <p>{t("Guarde esta chave fora do Fate. Ela recupera seu acesso se você esquecer a senha.", "Keep this key somewhere outside Fate. It restores access if you forget your password.")}</p>
        <code>{props.recoveryKey}</code><Button onClick={saveKey}>{t("Baixar chave", "Download key")}</Button>
        <Button variant="ghost" onClick={() => props.setRecoveryKey("")}>{t("Já guardei", "I saved it")}</Button>
      </div> : null}
      {props.user ? <>
        {mode === "delete" ? <form className="account-form" onSubmit={event => { event.preventDefault(); void run(async () => {
          const result = await props.remove(password); changeMode("login");
          setMessage(result?.cleanupPending ? t("Cadastro apagado. A remoção dos arquivos está sendo concluída.", "Account deleted. File removal is finishing.") : t("Cadastro e dados da conta apagados.", "Account and account data deleted."));
        }); }}>
          <p>{t("Isso apaga suas Fichas, imagens, preferências e acessos da conta. As Mesas que você criou também serão apagadas, junto com seus arquivos. Nas outras Mesas, serão apagados seus envios.", "This deletes your account’s sheets, images, preferences and table access. Tables you created and their files will also be deleted. In other tables, your contributions will be removed.")}</p>
          <p>{t("Não dá para desfazer. Os dados usados só neste aparelho ficam aqui.", "This cannot be undone. Data used only on this device stays here.")}</p>
          <label htmlFor={formId + "-delete"}>{t("Sua senha", "Your password")}</label><Input id={formId + "-delete"} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
          <label className="account-checkbox"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t("Quero apagar meu cadastro e os dados da conta.", "I want to delete my account and its data.")}</label>
          <Button type="submit" variant="destructive" disabled={busy || !confirmed}>{busy ? t("Apagando…", "Deleting…") : t("Apagar cadastro e dados", "Delete account and data")}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => changeMode("login")}>{t("Voltar", "Back")}</Button>
        </form> : mode === "key" || mode === "password" ? <form className="account-form" onSubmit={event => { event.preventDefault(); void run(async () => {
          if (mode === "key") { const result = await accountRequest("/api/account/recovery", { method: "POST", body: JSON.stringify({ password }) }); props.setRecoveryKey(result.key); }
          else { await accountRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: password, newPassword: nextPassword, revokeOtherSessions: true }) }); setMessage(t("Senha alterada.", "Password changed.")); }
          setMode("login");
        }); }}>
          <p>{mode === "key" ? t("A nova chave substitui a anterior. Confirme sua senha para criá-la.", "The new key replaces the previous one. Confirm your password to create it.") : t("Use pelo menos 12 caracteres na nova senha.", "Use at least 12 characters in your new password.")}</p>
          <label htmlFor={formId + "-current"}>{t("Senha atual", "Current password")}</label><Input id={formId + "-current"} required type="password" autoComplete="current-password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
          {mode === "password" ? <><label htmlFor={formId + "-new"}>{t("Nova senha", "New password")}</label><Input id={formId + "-new"} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></> : null}
          <Button type="submit" disabled={busy}>{busy ? t("Salvando…", "Saving…") : mode === "key" ? t("Criar nova chave", "Create new key") : t("Salvar senha", "Save password")}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => changeMode("login")}>{t("Voltar", "Back")}</Button>
        </form> : <div className="account-form">
          <div className="account-sync" role="status"><Cloud /><span>{props.status === "saved" ? t("Tudo salvo na sua conta.", "Everything is saved to your account.") : props.status === "syncing" ? t("Salvando na sua conta…", "Saving to your account…") : props.status === "conflict" ? t("Há duas versões de uma mudança.", "A change has two versions.") : t("Há mudanças para sincronizar.", "Some changes still need to sync.")}</span></div>
          {props.status === "conflict" ? <div className="account-conflict"><p>{t("A mesma informação foi alterada aqui e em outro aparelho. Qual versão você quer manter nesses pontos?", "The same information changed here and on another device. Which version should we keep for those changes?")}</p><Button disabled={busy} onClick={() => void run(() => props.resolve("local"))}>{t("Manter a deste aparelho", "Keep this device’s version")}</Button><Button variant="outline" disabled={busy} onClick={() => void run(() => props.resolve("remote"))}>{t("Manter a da conta", "Keep the account’s version")}</Button></div> : null}
          <Button variant="outline" disabled={busy || props.status === "syncing"} onClick={() => void run(props.sync)}>{t("Sincronizar agora", "Sync now")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => changeMode("password")}>{t("Trocar senha", "Change password")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => changeMode("key")}>{t("Chave de recuperação", "Recovery key")}</Button>
          <Button disabled={busy} onClick={() => void run(props.logout)}><LogOut />{t("Sair da conta", "Sign out")}</Button>
          <p className="account-hint">{t("Sair mantém tudo na sua conta. Você volta a usar os dados deste aparelho.", "Signing out keeps everything in your account. You return to this device’s data.")}</p>
          <Button className="account-delete-link" variant="ghost" disabled={busy} onClick={() => changeMode("delete")}>{t("Apagar cadastro", "Delete account")}</Button>
        </div>}
      </> : !props.available ? <><p>{t("O cadastro está indisponível no momento. Você pode continuar usando neste aparelho.", "Accounts are unavailable right now. You can keep using Fate on this device.")}</p><Button onClick={() => onOpenChange(false)}>{t("Continuar neste aparelho", "Continue on this device")}</Button></> : <form className="account-form" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void run(async () => {
          if (mode === "recover") { await accountRequest("/api/account/recovery", { method: "PATCH", body: JSON.stringify({ email: data.get("email"), key: data.get("key"), password }) }, null); changeMode("login"); setMessage(t("Senha redefinida. Agora você pode entrar.", "Password reset. You can sign in now.")); }
          else { if (mode === "signup" && password !== nextPassword) { setFailure(t("As senhas precisam ser iguais.", "The passwords need to match.")); return; }
            await props.authenticate(mode === "signup" ? "signup" : "login", { email: String(data.get("email")), name: String(data.get("name") ?? ""), password, importDevice: data.get("importDevice") === "on" }); }
        });
      }}>
        {mode === "signup" ? <><label htmlFor={formId + "-name"}>{t("Como quer ser chamado?", "What should we call you?")}</label><Input id={formId + "-name"} name="name" autoComplete="nickname" required maxLength={80} /></> : null}
        <label htmlFor={formId + "-email"}>{t("E-mail", "Email")}</label><Input id={formId + "-email"} name="email" type="email" autoComplete="email" required maxLength={254} />
        {mode === "recover" ? <><label htmlFor={formId + "-key"}>{t("Chave de recuperação", "Recovery key")}</label><Input id={formId + "-key"} name="key" autoComplete="off" required maxLength={100} /><p className="account-hint">{t("Use a chave que você guardou ao criar sua conta. Ela vale uma vez; depois, crie outra em Minha conta.", "Use the key you saved when creating your account. It works once; afterwards, create a new one in My account.")}</p></> : null}
        <label htmlFor={formId + "-password"}>{mode === "recover" ? t("Nova senha", "New password") : t("Senha", "Password")}</label><Input id={formId + "-password"} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
        {mode !== "login" ? <p className="account-hint">{t("Pelo menos 12 caracteres.", "At least 12 characters.")}</p> : null}
        {mode === "signup" ? <><label htmlFor={formId + "-confirm"}>{t("Repita a senha", "Repeat your password")}</label><Input id={formId + "-confirm"} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></> : null}
        {mode !== "recover" ? <label className="account-checkbox"><input type="checkbox" name="importDevice" />{t("Levar os dados deste aparelho para a conta", "Bring this device’s data into the account")}</label> : null}
        <Button type="submit" disabled={busy}>{busy ? t("Só um instante…", "One moment…") : mode === "signup" ? t("Criar conta", "Create account") : mode === "recover" ? t("Redefinir senha", "Reset password") : t("Entrar", "Sign in")}</Button>
        <div className="account-links"><Button type="button" variant="ghost" disabled={busy} onClick={() => changeMode(mode === "signup" || mode === "recover" ? "login" : "signup")}>{mode === "signup" || mode === "recover" ? t("Já tenho conta", "I have an account") : t("Criar conta", "Create account")}</Button>{mode === "login" ? <Button type="button" variant="ghost" disabled={busy} onClick={() => changeMode("recover")}>{t("Esqueci a senha", "Forgot password")}</Button> : null}</div>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>{t("Continuar sem conta", "Continue without an account")}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
}
