// =====================================================================================
// Admin > Configurações > Segurança da conta (recursos admin_2fa e social_login). Sem janelas:
//   Sua conta        verificação em dois passos do próprio admin: ativar (QR + chave + código) ou desativar
//   Regras da loja   exigir 2FA de todos os administradores (só com o seu ativo)
//   Administradores  quem tem 2FA; tirar o 2FA de outro admin que perdeu o celular
//   Google/Facebook  estado no servidor e passos para configurar (as chaves ficam no env do servidor)
// Também exporta AdminMfaGate (passo do código ao abrir o Admin; usado pelo AdminShell) e TotpSetup.
// Regras em src/lib/adminSecurity.ts; dados em src/hooks/useAdminSecurity.ts; textos em src/i18n/adminSecurity.ts.
// =====================================================================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Copy, KeyRound, Loader2, LogOut, ShieldAlert, ShieldCheck, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/brand/Logo";
import AdminHelp from "./AdminHelp";
import { AdminPanel } from "./shell/AdminPageParts";
import { adminHref } from "./shell/adminSections";
import { useInlineConfirm } from "./shell/useInlineConfirm";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { adminSecurityMessages } from "@/i18n/adminSecurity";
import { useAdminFormat } from "@/hooks/useAdminList";
import { useFeature } from "@/hooks/useFeatures";
import {
  useAuthProviders, useEnrollTotp, useMfaFactors, useResetAdminMfa, useSaveSecuritySettings, useSecurityOverview, useSecuritySettings,
  useUnenrollFactor, useVerifyTotp,
} from "@/hooks/useAdminSecurity";
import {
  SOCIAL_PROVIDERS, cleanTotpCode, formatTotpSecret, oauthCallbackUrl, securityErrorCode, socialProvidersOn, totpCodeReady,
  type AdminAccessState,
} from "@/lib/adminSecurity";
import { siteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

const PROVIDER_NAME: Record<string, string> = { google: "Google", facebook: "Facebook" };

/* ---------- campo do código ---------- */

function CodeInput({ id, value, onChange, autoFocus }: { id: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Input id={id} value={value} onChange={(e) => onChange(cleanTotpCode(e.target.value))} inputMode="numeric" autoComplete="one-time-code"
      pattern="[0-9]*" maxLength={6} placeholder="000000" autoFocus={autoFocus}
      className="h-14 max-w-[14rem] text-center font-mono text-2xl tracking-[0.4em]" />
  );
}

/* ---------- ativar (QR, chave, código) ---------- */

export function TotpSetup({ onDone, onCancel, startLabel }: { onDone?: () => void; onCancel?: () => void; startLabel?: string }) {
  const { t } = useMessages(adminSecurityMessages);
  const enroll = useEnrollTotp();
  const verify = useVerifyTotp();
  const [code, setCode] = useState("");
  const data = enroll.data;

  const start = async () => {
    try { await enroll.mutateAsync("Admin"); } catch { toast.error(t("setup_error")); }
  };
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !totpCodeReady(code)) return;
    try {
      await verify.mutateAsync({ factorId: data.id, code });
      toast.success(t("setup_done"));
      onDone?.();
    } catch (err) {
      setCode("");
      toast.error(securityErrorCode((err as { message?: string })?.message) === "invalid_code" ? t("err_invalid_code") : t("err_unknown"));
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(data!.secret); toast.success(t("setup_copied")); } catch { /* sem área de transferência */ }
  };

  if (!data) {
    return (
      <Button onClick={start} disabled={enroll.isPending}>
        {enroll.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Smartphone className="mr-1.5 h-4 w-4" strokeWidth={1.8} />}
        {enroll.isPending ? t("setup_starting") : startLabel ?? t("setup_start")}
      </Button>
    );
  }
  return (
    <form onSubmit={confirm} className="space-y-4">
      <p className="text-sm">{t("setup_step1")}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <img src={data.qr} alt={t("qr_alt")} width={176} height={176} className="h-44 w-44 shrink-0 rounded-xl border bg-white p-2" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm">{t("setup_step2")}</p>
          <p className="text-xs text-muted-foreground">{t("setup_secret")}</p>
          <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">{formatTotpSecret(data.secret)}</p>
          <Button type="button" variant="outline" size="sm" onClick={copy}><Copy className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("setup_copy")}</Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="totp-setup-code">{t("setup_step3")}</Label>
        <CodeInput id="totp-setup-code" value={code} onChange={setCode} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!totpCodeReady(code) || verify.isPending}>
          {verify.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{verify.isPending ? t("verifying") : t("verify")}
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>{t("setup_cancel")}</Button>}
      </div>
    </form>
  );
}

/* ---------- passo ao abrir o Admin ---------- */

export function AdminMfaGate({ state }: { state: Exclude<AdminAccessState, "ok" | "not_admin"> }) {
  const { t } = useMessages(adminSecurityMessages);
  const { data: factors = [] } = useMfaFactors();
  const verify = useVerifyTotp();
  const [code, setCode] = useState("");
  const factor = factors.find((f) => f.status === "verified");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factor || !totpCodeReady(code)) return;
    try {
      await verify.mutateAsync({ factorId: factor.id, code });
    } catch (err) {
      setCode("");
      const c = securityErrorCode((err as { message?: string })?.message);
      toast.error(c === "invalid_code" ? t("err_invalid_code") : t("err_unknown"));
    }
  };
  const signOut = async () => { await supabase.auth.signOut(); window.location.assign("/"); };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg space-y-6 rounded-[20px] border bg-card p-6 shadow-sm sm:p-8">
        <Logo className="h-8" />
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
            {state === "mfa_required" ? t("gate_title") : t("gate_setup_title")}
          </h1>
          <p className="text-muted-foreground">{state === "mfa_required" ? t("gate_code_hint") : t("gate_setup_hint")}</p>
        </div>
        {state === "mfa_required" ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="totp-gate-code">{t("code_label")}</Label>
              <CodeInput id="totp-gate-code" value={code} onChange={setCode} autoFocus />
            </div>
            <Button type="submit" className="w-full sm:w-auto" disabled={!factor || !totpCodeReady(code) || verify.isPending}>
              {verify.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{verify.isPending ? t("verifying") : t("verify")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("lost_phone")}</p>
          </form>
        ) : (
          <TotpSetup />
        )}
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("sign_out")}</Button>
      </div>
    </div>
  );
}

/* ---------- seção do Admin ---------- */

function MyAccount() {
  const { t } = useMessages(adminSecurityMessages);
  const { date } = useAdminFormat();
  const { data: factors = [], isLoading } = useMfaFactors();
  const { data: sec } = useSecuritySettings();
  const unenroll = useUnenrollFactor();
  const { ask, confirmSlot } = useInlineConfirm();
  const verified = factors.filter((f) => f.status === "verified");
  const on = verified.length > 0;
  const required = !!sec?.settings.require_admin_2fa;

  const remove = async (id: string) => {
    if (required && verified.length <= 1) { toast.error(t("factor_remove_blocked")); return; }
    if (!(await ask(t("factor_remove_confirm"), { tone: "danger", confirmLabel: t("factor_remove") }))) return;
    try {
      await unenroll.mutateAsync(id);
      toast.success(t("factor_removed"));
    } catch (err) {
      const c = securityErrorCode((err as { message?: string })?.message);
      toast.error(c === "forbidden" ? t("err_forbidden") : t("err_unknown"));
    }
  };

  return (
    <AdminPanel title={t("my_title")} icon={KeyRound}>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
        <div className="space-y-4">
          <p className={cn("flex items-start gap-2.5 rounded-xl p-3 text-sm", on ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
            {on ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <span><strong>{on ? t("my_on") : t("my_off")}.</strong> {on ? t("my_on_hint") : t("my_off_hint")}</span>
          </p>
          {on ? (
            <ul className="divide-y rounded-xl border">
              {verified.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-muted-foreground" />{t("factor_added", { date: date(f.created_at) })}</span>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => remove(f.id)} disabled={unenroll.isPending}>{t("factor_remove")}</Button>
                </li>
              ))}
            </ul>
          ) : <TotpSetup />}
          {confirmSlot}
        </div>
      )}
    </AdminPanel>
  );
}

function StoreRule({ ownOn }: { ownOn: boolean }) {
  const { t } = useMessages(adminSecurityMessages);
  const { data } = useSecuritySettings();
  const save = useSaveSecuritySettings();
  const on = !!data?.settings.require_admin_2fa;
  const toggle = async (v: boolean) => {
    if (!data) return;
    try {
      await save.mutateAsync({ next: { ...data.settings, require_admin_2fa: v }, raw: data.raw });
      toast.success(t("rule_saved"));
    } catch (err) {
      const c = securityErrorCode((err as { message?: string })?.message);
      toast.error(c === "mfa_needed_first" ? t("err_mfa_needed_first") : t("err_unknown"));
    }
  };
  return (
    <AdminPanel title={t("rule_title")} icon={ShieldCheck}>
      <label className="flex items-start gap-3">
        <Switch checked={on} onCheckedChange={toggle} disabled={save.isPending || (!on && !ownOn)} className="mt-0.5" />
        <span className="text-sm">
          <span className="block font-medium">{t("rule_require")}</span>
          <span className="block text-muted-foreground">{!on && !ownOn ? t("rule_require_needs_own") : t("rule_require_hint")}</span>
        </span>
      </label>
    </AdminPanel>
  );
}

function AdminsList() {
  const { t } = useMessages(adminSecurityMessages);
  const { relative } = useAdminFormat();
  const { data = [], isLoading } = useSecurityOverview();
  const reset = useResetAdminMfa();
  const { ask, confirmSlot } = useInlineConfirm();
  const run = async (id: string, email: string) => {
    if (!(await ask(t("admin_reset_confirm", { email }), { tone: "danger", confirmLabel: t("admin_reset") }))) return;
    try {
      await reset.mutateAsync(id);
      toast.success(t("admin_reset_done"));
    } catch (err) {
      const c = securityErrorCode((err as { message?: string })?.message);
      toast.error(c === "not_self" ? t("err_not_self") : c === "forbidden" ? t("err_forbidden") : t("err_unknown"));
    }
  };
  return (
    <AdminPanel title={t("admins_title")} icon={Users}>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
        <ul className="divide-y">
          {data.map((a) => (
            <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block break-all font-medium">{a.email}{a.is_me && <span className="ml-1.5 text-muted-foreground">({t("admin_you")})</span>}</span>
                <span className="block text-xs text-muted-foreground">{a.last_sign_in_at ? t("admin_last", { when: relative(a.last_sign_in_at) }) : t("admin_never")}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", a.has_2fa ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>{a.has_2fa ? t("admin_on") : t("admin_off")}</span>
                {a.has_2fa && !a.is_me && <Button size="sm" variant="outline" onClick={() => run(a.user_id, a.email)} disabled={reset.isPending}>{t("admin_reset")}</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {confirmSlot}
      <p className="mt-2 text-xs text-muted-foreground">{t("admins_hint")}</p>
    </AdminPanel>
  );
}

function SocialLogin() {
  const { t } = useMessages(adminSecurityMessages);
  const featureOn = useFeature("social_login");
  const { data: external = {} } = useAuthProviders();
  const ready = socialProvidersOn(external, true);
  const callback = oauthCallbackUrl(siteUrl());
  const copy = async () => { try { await navigator.clipboard.writeText(callback); toast.success(t("copied")); } catch { /* sem área de transferência */ } };
  return (
    <AdminPanel title={t("social_title")} icon={KeyRound}
      actions={<span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", featureOn ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>{featureOn ? t("social_feature_on") : t("social_feature_off")}</span>}>
      <p className="mb-3 text-sm text-muted-foreground">{t("social_hint")}</p>
      <ul className="mb-4 space-y-1.5 text-sm">
        {SOCIAL_PROVIDERS.map((p) => (
          <li key={p} className="flex items-start gap-2">
            {ready.includes(p) ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            {ready.includes(p) ? t("social_provider_on", { name: PROVIDER_NAME[p] }) : t("social_provider_off", { name: PROVIDER_NAME[p] })}
          </li>
        ))}
      </ul>
      <h3 className="mb-2 text-sm font-semibold">{t("social_steps_title")}</h3>
      <ol className="space-y-2 text-sm text-muted-foreground">
        <li>{t("social_step1")}</li>
        <li>
          {t("social_step2")}
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-muted px-2.5 py-1.5 text-foreground">{callback}</code>
            <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1.5 h-4 w-4" strokeWidth={1.8} />{t("copy")}</Button>
          </span>
        </li>
        <li>{t("social_step3")}</li>
        <li>{t("social_step4")} <Link to={adminHref.section("features")} className="font-medium text-brand-orange-text hover:underline">{t("open_features")}</Link></li>
      </ol>
    </AdminPanel>
  );
}

export default function AdminAccountSecurity() {
  const { t } = useMessages(adminSecurityMessages);
  const mfaOn = useFeature("admin_2fa");
  const { data: factors = [] } = useMfaFactors();
  const ownOn = factors.some((f) => f.status === "verified");
  return (
    <div className="space-y-5">
      <AdminHelp id="account-security" title={t("help_title")} steps={[t("help_1"), t("help_2"), t("help_3")]} />
      {!mfaOn && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t("feature_off")}</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        {mfaOn && <MyAccount />}
        {mfaOn && <StoreRule ownOn={ownOn} />}
        {mfaOn && <AdminsList />}
        <SocialLogin />
      </div>
    </div>
  );
}
