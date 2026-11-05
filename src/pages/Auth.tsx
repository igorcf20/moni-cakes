import { STORE_DEFAULTS } from "@/config/store";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Box, CheckCircle2, FileText, Heart, Loader2, Lock, Mail, MailCheck, PackageCheck,
  ShoppingBag, User, Zap, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/brand/Logo";
import { LayerArt, MediaImage } from "@/components/MediaImage";
import PhoneInputWithDDI from "@/components/PhoneInputWithDDI";
import SocialLoginButtons from "@/components/SocialLoginButtons";
import { authErrorKey, passwordOk } from "@/components/dashboard/accountUtils";
import { PasswordChecklist, PasswordInput, btnPrimary, btnSecondary, eyebrowCls, focusRing, inputCls, labelCls } from "@/components/dashboard/ui";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useTaxIdRules } from "@/hooks/useTaxIdRules";
import { useLocale, useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "forgot" | "recovery" | "check-email";

const emailSchema = z.string().trim().min(1).email();
const nameSchema = z.string().trim().min(2);
const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 9;
const safeRedirect = (raw: string | null) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/");
const EASE = [0.16, 1, 0.3, 1] as const;

type FieldProps = {
  id: string; label: string; icon: LucideIcon; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; error?: string; autoComplete?: string; isPassword?: boolean;
  hint?: string; optional?: string; trailing?: ReactNode; maxLength?: number; inputMode?: "text" | "numeric" | "email";
};

/** Campo do formulário com ícone, dica e erro ligados por aria-describedby. */
const Field = ({ id, label, icon: Icon, value, onChange, type = "text", placeholder, error, autoComplete, isPassword, hint, optional, trailing, maxLength, inputMode }: FieldProps) => {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <Label htmlFor={id} className={labelCls}>
          {label}{optional && <span className="font-normal text-muted-foreground"> ({optional})</span>}
        </Label>
        {trailing}
      </div>
      <div className="group relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within:text-primary" strokeWidth={1.8} aria-hidden="true" />
        {isPassword ? (
          <PasswordInput id={id} value={value} onChange={onChange} autoComplete={autoComplete} invalid={!!error} describedBy={describedBy} className="pl-11" />
        ) : (
          <Input
            id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            autoComplete={autoComplete} maxLength={maxLength} inputMode={inputMode}
            aria-invalid={error ? true : undefined} aria-describedby={describedBy}
            className={cn(inputCls, "pl-11", error && "border-destructive focus-visible:ring-destructive/30")}
          />
        )}
      </div>
      {error ? <p id={`${id}-error`} role="alert" className="text-[13px] text-destructive">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
};

const Auth = () => {
  const { t } = useMessages(accountMessages);
  const locale = useLocale((s) => s.locale);
  const taxRules = useTaxIdRules();
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const redirectTo = safeRedirect(params.get("redirect"));
  const cameFromCheckout = redirectTo === "/checkout";
  const startsInRecovery = params.get("mode") === "recovery";
  const { data: storeInfo } = useStoreInfo();
  const store = storeInfo?.name || STORE_DEFAULTS.name;

  const [mode, setMode] = useState<Mode>(startsInRecovery ? "recovery" : "signin");
  const recoveryRef = useRef(startsInRecovery);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nif, setNif] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);

  // Leva o cliente para onde ia (ex.: checkout), nunca de volta à página inicial.
  useEffect(() => {
    const go = () => navigate(redirectTo, { replace: true });
    supabase.auth.getSession().then(({ data: { session } }) => { if (session && !recoveryRef.current) go(); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { recoveryRef.current = true; setMode("recovery"); return; }
      if (session && !recoveryRef.current) go();
    });
    return () => subscription.unsubscribe();
  }, [navigate, redirectTo]);

  const switchMode = (next: Mode) => { setMode(next); setErrors({}); setPassword(""); setConfirmPassword(""); };
  // Documento fiscal do país do cliente (CPF/CNPJ, NIF...): regras em useTaxIdRules.
  const nifDigits = taxRules.clean(nif);
  const nifValid = taxRules.isValid(nif);

  const authToast = (message: string | undefined) => {
    console.error("auth error", message);
    toast.error(t(authErrorKey(message)));
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!emailSchema.safeParse(email).success) next.email = t("errEmail");
    if (!password) next.password = t("errPassword");
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      // Proteção contra força bruta: a verificação corre antes da tentativa; uma falha do serviço nunca bloqueia o cliente.
      const { data: rl } = await supabase.functions.invoke("auth-rate-limit", { body: { email } });
      if (rl && rl.allowed === false) {
        toast.error(t("authTooMany", { minutes: rl.retryInMinutes || 15 }));
        setLoading(false);
        return;
      }
    } catch { /* falha em aberto */ }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        supabase.functions.invoke("auth-rate-limit", { body: { email, failure: true } }).catch(() => {});
        authToast(error.message);
        return;
      }
      supabase.functions.invoke("auth-rate-limit", { body: { email, success: true } }).catch(() => {});
      try { localStorage.removeItem("post_auth_redirect"); } catch { /* armazenamento bloqueado */ }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t("authSessionStorage"));
        return;
      }
      toast.success(t("authSignedIn"));
      navigate(redirectTo, { replace: true });
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!nameSchema.safeParse(fullName).success) next.fullName = t("errName");
    if (!emailSchema.safeParse(email).success) next.email = t("errEmail");
    if (!phoneOk(phone)) next.phone = t("errPhone");
    const taxProblem = taxRules.enabled ? taxRules.validate(nif) : "";
    if (taxProblem) next.nif = taxProblem;
    if (!passwordOk(password)) next.password = t("errPasswordRules");
    if (password !== confirmPassword) next.confirmPassword = t("errPasswordMatch");
    if (!acceptTerms) next.acceptTerms = t("errTerms");
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      if (redirectTo !== "/") { try { localStorage.setItem("post_auth_redirect", redirectTo); } catch { /* armazenamento bloqueado */ } }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          // O link de confirmação traz o cliente de volta para onde ia.
          emailRedirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(redirectTo)}`,
          data: {
            full_name: fullName.trim(), phone, nif: nifDigits,
            newsletter_subscription: acceptMarketing,
            consent_terms_accepted_at: new Date().toISOString(),
          },
        },
      });
      if (error) { authToast(error.message); return; }
      if (data.user) {
        await supabase.from("user_profiles").upsert({
          user_id: data.user.id, full_name: fullName.trim(), phone, tax_id: nifDigits || null, tax_id_country: nifDigits ? taxRules.country : null,
          newsletter_subscription: acceptMarketing,
        } as any, { onConflict: "user_id" });
        if (acceptMarketing) supabase.from("newsletter_subscriptions").insert({ email, source: "signup", locale } as any).then(() => {}, () => {});
      }
      if (data.session) { toast.success(t("authAccountCreated")); return; } // o listener de sessão continua para o destino
      switchMode("check-email");
    } finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSchema.safeParse(email).success) { setErrors({ email: t("errEmail") }); return; }
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth?mode=recovery&redirect=${encodeURIComponent(redirectTo)}`,
      });
      // A mesma resposta exista ou não a conta, para o formulário não servir para descobrir e-mails.
      toast.success(t("authResetSent"));
      switchMode("signin");
    } finally { setLoading(false); }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!passwordOk(password)) next.password = t("errPasswordRules");
    if (password !== confirmPassword) next.confirmPassword = t("errPasswordMatch");
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { authToast(error.message); return; }
      toast.success(t("authPasswordUpdated"));
      recoveryRef.current = false;
      navigate(redirectTo, { replace: true });
    } finally { setLoading(false); }
  };

  const heading: Record<Mode, { title: string; text: string }> = {
    signin: { title: t("authSigninTitle"), text: cameFromCheckout ? t("authSigninTextCheckout") : t("authSigninText") },
    signup: { title: t("authSignupTitle"), text: t("authSignupText") },
    forgot: { title: t("authForgotTitle"), text: t("authForgotText") },
    recovery: { title: t("authRecoveryTitle"), text: t("authRecoveryText") },
    "check-email": { title: t("authCheckTitle"), text: "" },
  };
  const metaTitle = mode === "signup" ? t("authMetaSignup", { store }) : mode === "recovery" ? t("authMetaRecovery", { store }) : t("authMetaSignin", { store });

  const submit = (idle: string, busy: string) => (
    <button type="submit" className={cn(btnPrimary, "w-full")} disabled={loading} aria-busy={loading || undefined}>
      {loading ? <><Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />{busy}</> : <>{idle}<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" /></>}
    </button>
  );
  const textLink = cn("rounded font-semibold text-brand-orange-text underline-offset-2 hover:underline", focusRing);
  const benefits: { Icon: LucideIcon; title: string; text: string }[] = [
    { Icon: PackageCheck, title: t("authBenefitOrders"), text: t("authBenefitOrdersText") },
    { Icon: Heart, title: t("authBenefitFavorites"), text: t("authBenefitFavoritesText") },
    { Icon: Zap, title: t("authBenefitFaster"), text: t("authBenefitFasterText") },
  ];
  const tabbed = mode === "signin" || mode === "signup";

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={t("authMetaDescription")} />
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      <div className="grid min-h-[100dvh] bg-background lg:grid-cols-2">
        {/* Formulário */}
        <main className="flex min-h-[100dvh] flex-col px-4 pb-6 pt-4 sm:px-8 lg:px-12 xl:px-16">
          <div className="flex items-center justify-between gap-4">
            <Logo />
            <Link to="/" className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-2 text-[14px] font-medium text-brand-ink-soft transition-colors duration-150 hover:text-foreground", focusRing)}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("authBackToStore")}
            </Link>
          </div>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
            {tabbed && (
              <div role="tablist" aria-label={t("authTabs")} className="mb-8 grid grid-cols-2 gap-1 rounded-[14px] bg-brand-alt p-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m} type="button" role="tab" id={`tab-${m}`} aria-selected={mode === m} aria-controls="auth-panel"
                    tabIndex={mode === m ? 0 : -1}
                    onClick={() => switchMode(m)}
                    onKeyDown={(e) => {
                      // Padrão de abas: setas, Home e End trocam de aba e levam o foco.
                      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                      e.preventDefault();
                      const next = e.key === "Home" ? "signin" : e.key === "End" ? "signup" : m === "signin" ? "signup" : "signin";
                      switchMode(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }}
                    className={cn(
                      "min-h-11 rounded-[11px] text-[15px] font-semibold transition-[background-color,color,box-shadow] duration-200",
                      mode === m ? "bg-white text-foreground shadow-[var(--shadow-soft)]" : "text-brand-ink-soft hover:text-foreground",
                      focusRing,
                    )}
                  >
                    {m === "signin" ? t("authTabSignin") : t("authTabSignup")}
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                id="auth-panel"
                role={tabbed ? "tabpanel" : undefined}
                aria-labelledby={tabbed ? `tab-${mode}` : undefined}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {mode === "check-email" ? (
                  <div className="text-center">
                    <span className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-brand-orange-soft text-primary"><MailCheck className="h-8 w-8" strokeWidth={1.7} aria-hidden="true" /></span>
                    <h1 className="mt-6 text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[40px]">{heading[mode].title}</h1>
                    <p className="mt-3 text-[16px] leading-relaxed text-brand-ink-soft">
                      {t("authCheckText")} <strong className="font-semibold text-foreground">{email}</strong>.{" "}
                      {cameFromCheckout ? t("authCheckTextCheckout") : t("authCheckTextDefault")}
                    </p>
                    <button type="button" className={cn(btnSecondary, "mt-8")} onClick={() => switchMode("signin")}>{t("authCheckBack")}</button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] [text-wrap:balance] sm:text-[40px]">{heading[mode].title}</h1>
                    <p className="mt-2.5 text-[16px] leading-relaxed text-brand-ink-soft">{heading[mode].text}</p>

                    {cameFromCheckout && tabbed && (
                      <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-primary/25 bg-accent px-4 py-3 text-[14px] leading-snug text-foreground">
                        <ShoppingBag className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                        <span>{t("authCheckoutNotice")}</span>
                      </div>
                    )}

                    {mode === "signin" && (
                      <form onSubmit={handleSignIn} className="mt-7 space-y-5" noValidate>
                        <Field id="signin-email" label={t("authEmail")} icon={Mail} type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} placeholder={t("authEmailPlaceholder")} error={errors.email} />
                        <Field
                          id="signin-password" label={t("authPassword")} icon={Lock} isPassword autoComplete="current-password" value={password} onChange={setPassword} error={errors.password}
                          trailing={<button type="button" onClick={() => switchMode("forgot")} className={cn("min-h-8 text-[13px]", textLink)}>{t("authForgotLink")}</button>}
                        />
                        {submit(t("authSubmitSignin"), t("authSubmittingSignin"))}
                        <SocialLoginButtons redirectTo={redirectTo} />
                      </form>
                    )}

                    {mode === "signup" && (
                      <form onSubmit={handleSignUp} className="mt-7 space-y-5" noValidate>
                        <Field id="signup-name" label={t("authFullName")} icon={User} autoComplete="name" value={fullName} onChange={setFullName} placeholder={t("authFullNamePlaceholder")} error={errors.fullName} />
                        <Field id="signup-email" label={t("authEmail")} icon={Mail} type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} placeholder={t("authEmailPlaceholder")} error={errors.email} />
                        <div className="space-y-1.5">
                          <Label htmlFor="signup-phone" className={labelCls}>{t("authPhone")}</Label>
                          <PhoneInputWithDDI id="signup-phone" value={phone} onChange={setPhone} error={errors.phone} />
                        </div>
                        {taxRules.enabled && (
                          <Field
                            id="signup-taxid" label={taxRules.label} optional={taxRules.required ? undefined : t("optional")} icon={FileText}
                            inputMode={taxRules.inputMode} maxLength={taxRules.maxLength} autoComplete="off"
                            value={nif} onChange={(v) => setNif(taxRules.format(v))} placeholder={taxRules.placeholder} error={errors.nif}
                            hint={taxRules.t("billingSub", { label: taxRules.label })}
                            trailing={nifValid ? <span className="flex items-center gap-1 text-[13px] font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("authTaxValid")}</span> : undefined}
                          />
                        )}
                        <Field id="signup-password" label={t("authPassword")} icon={Lock} isPassword autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} />
                        {password && <PasswordChecklist value={password} />}
                        <Field id="signup-confirm" label={t("authConfirmPassword")} icon={Lock} isPassword autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} />

                        <div className="space-y-3 pt-1">
                          <div className="flex items-start gap-3">
                            <Checkbox id="accept-terms" checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(v === true)} className="mt-0.5 h-5 w-5 rounded-[6px]" aria-invalid={errors.acceptTerms ? true : undefined} />
                            <Label htmlFor="accept-terms" className="cursor-pointer text-[14px] font-normal leading-relaxed text-brand-ink-soft">
                              {t("authTermsPrefix")}{" "}
                              <Link to="/politica-privacidade" target="_blank" className={cn("text-foreground underline underline-offset-2", focusRing)}>{t("authTermsPrivacy")}</Link>{" "}
                              {t("authTermsAnd")}{" "}
                              <Link to="/termos" target="_blank" className={cn("text-foreground underline underline-offset-2", focusRing)}>{t("authTermsTerms")}</Link>.
                            </Label>
                          </div>
                          {errors.acceptTerms && <p role="alert" className="pl-8 text-[13px] text-destructive">{errors.acceptTerms}</p>}
                          <div className="flex items-start gap-3">
                            <Checkbox id="accept-marketing" checked={acceptMarketing} onCheckedChange={(v) => setAcceptMarketing(v === true)} className="mt-0.5 h-5 w-5 rounded-[6px]" />
                            <Label htmlFor="accept-marketing" className="cursor-pointer text-[14px] font-normal leading-relaxed text-brand-ink-soft">
                              {t("authMarketing")} <span className="text-muted-foreground">({t("optional")})</span>
                            </Label>
                          </div>
                        </div>
                        {submit(t("authSubmitSignup"), t("authSubmittingSignup"))}
                      </form>
                    )}

                    {mode === "forgot" && (
                      <form onSubmit={handleForgot} className="mt-7 space-y-5" noValidate>
                        <Field id="forgot-email" label={t("authAccountEmail")} icon={Mail} type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} placeholder={t("authEmailPlaceholder")} error={errors.email} />
                        {submit(t("authSubmitForgot"), t("authSubmittingForgot"))}
                        <button type="button" onClick={() => switchMode("signin")} className={cn("mx-auto flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] px-3 text-[14px] font-medium text-brand-ink-soft hover:text-foreground", focusRing)}>
                          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("back")}
                        </button>
                      </form>
                    )}

                    {mode === "recovery" && (
                      <form onSubmit={handleRecovery} className="mt-7 space-y-5" noValidate>
                        <Field id="new-password" label={t("authNewPassword")} icon={Lock} isPassword autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} />
                        {password && <PasswordChecklist value={password} />}
                        <Field id="new-password-confirm" label={t("authConfirmPassword")} icon={Lock} isPassword autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} />
                        {submit(t("authSubmitRecovery"), t("authSubmittingRecovery"))}
                      </form>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="mx-auto flex max-w-[440px] items-start justify-center gap-1.5 text-center text-[13px] leading-snug text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            {t("authSecureNote")}
          </p>
        </main>

        {/* Painel visual (só no desktop) */}
        <aside className="hidden p-4 lg:block xl:p-5">
          <div className="sticky top-4 h-[calc(100dvh-2rem)] min-h-[600px] overflow-hidden rounded-[24px] bg-brand-alt xl:top-5 xl:h-[calc(100dvh-2.5rem)]">
            <MediaImage k="hero" alt="" eager className="absolute inset-0" fallback={<LayerArt Icon={Box} size="lg" />} />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background)/0.94)_0%,hsl(var(--background)/0.55)_30%,hsl(var(--background)/0)_50%,hsl(var(--background)/0.6)_78%,hsl(var(--background)/0.94)_100%)]" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,hsl(var(--brand-orange-2)/0.28),transparent)]" aria-hidden="true" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-8 p-10 xl:p-12">
              <div className="max-w-md">
                <p className={eyebrowCls}>{t("authPanelEyebrow", { store })}</p>
                <h2 className="mt-3 text-[36px] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground [text-wrap:balance] xl:text-[44px]">{t("authPanelTitle")}</h2>
                <p className="mt-3 text-[17px] leading-relaxed text-brand-ink-soft">{t("authPanelLead")}</p>
              </div>
              <ul className="grid max-w-md gap-3">
                {benefits.map(({ Icon, title, text }, i) => (
                  <motion.li
                    key={title}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.08 + i * 0.06, ease: EASE }}
                    className="flex items-start gap-4 rounded-[20px] border border-brand-card-border bg-white/95 p-4 shadow-[var(--shadow-card)] backdrop-blur"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-brand-orange-soft text-primary"><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="block text-[16px] font-semibold text-foreground">{title}</span>
                      <span className="mt-0.5 block text-[14px] leading-relaxed text-brand-ink-soft">{text}</span>
                    </span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </MotionConfig>
  );
};

export default Auth;
