import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, Mail, Pencil, Save, ShieldCheck, User, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import PhoneInputWithDDI, { getFullPhoneDisplay } from "@/components/PhoneInputWithDDI";
import { useAuth } from "@/hooks/useAuth";
import { useTaxIdRules } from "@/hooks/useTaxIdRules";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { EMAIL_RE, authErrorKey, passwordOk } from "./accountUtils";
import { Field, PasswordChecklist, PasswordInput, btnPrimary, btnSecondary, cardCls, h3Cls, iconTile, inputCls } from "./ui";

/** Cabeçalho de um cartão da conta: ícone, título, texto e ações à direita. */
function CardHead({ Icon, title, text, actions }: { Icon: typeof User; title: string; text?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={iconTile}><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className={h3Cls}>{title}</h3>
          {text && <p className="mt-1 text-[14px] text-muted-foreground">{text}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export const SecuritySection = ({ currentEmail }: { currentEmail: string }) => {
  const { t } = useMessages(accountMessages);
  const [email, setEmail] = useState(currentEmail);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || trimmed === currentEmail.toLowerCase()) return setEmailError(t("secEmailSame"));
    if (!EMAIL_RE.test(trimmed)) return setEmailError(t("errEmail"));
    setEmailError("");
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed }, { emailRedirectTo: `${window.location.origin}/dashboard` });
    setEmailSaving(false);
    if (error) {
      console.error("email change failed", error.message);
      toast.error(t(authErrorKey(error.message)));
      return;
    }
    toast.success(t("secEmailConfirm"));
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordOk(pwd)) return setPwdError(t("errPasswordRules"));
    if (pwd !== pwd2) return setPwdError(t("errPasswordMatch"));
    setPwdError("");
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setPwdSaving(false);
    if (error) {
      console.error("password change failed", error.message);
      toast.error(t(authErrorKey(error.message)));
      return;
    }
    setPwd(""); setPwd2("");
    toast.success(t("authPasswordUpdated"));
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleEmailChange} className={cn(cardCls, "space-y-5 p-5 sm:p-6")} noValidate>
        <CardHead Icon={Mail} title={t("secEmailTitle")} text={t("secText")} />
        <Field label={t("secEmail")} htmlFor="security-email" error={emailError} errorId="security-email-error">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="security-email" type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(""); }} placeholder={t("secEmailPlaceholder")}
              aria-invalid={!!emailError || undefined} aria-describedby={emailError ? "security-email-error" : "security-email-hint"}
              className={cn(inputCls, "flex-1", emailError && "border-destructive")}
            />
            <button type="submit" disabled={emailSaving} className={btnSecondary} aria-busy={emailSaving || undefined}>
              {emailSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("secEmailChange")}
            </button>
          </div>
        </Field>
        <p id="security-email-hint" className="-mt-3 text-[13px] text-muted-foreground">{t("secEmailHint")}</p>
      </form>

      <form onSubmit={handlePasswordChange} className={cn(cardCls, "space-y-5 p-5 sm:p-6")} noValidate>
        <CardHead Icon={KeyRound} title={t("secPasswordTitle")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("secPassword")} htmlFor="security-password">
            <PasswordInput id="security-password" value={pwd} onChange={(v) => { setPwd(v); setPwdError(""); }} autoComplete="new-password" invalid={!!pwdError} describedBy={pwdError ? "security-password-error" : undefined} />
          </Field>
          <Field label={t("secPasswordConfirm")} htmlFor="security-password-confirm">
            <PasswordInput id="security-password-confirm" value={pwd2} onChange={(v) => { setPwd2(v); setPwdError(""); }} autoComplete="new-password" invalid={!!pwdError} describedBy={pwdError ? "security-password-error" : undefined} />
          </Field>
        </div>
        {pwd && <PasswordChecklist value={pwd} />}
        {pwdError && <p id="security-password-error" role="alert" className="text-[13px] text-destructive">{pwdError}</p>}
        <button type="submit" disabled={pwdSaving || !pwd} className={btnPrimary} aria-busy={pwdSaving || undefined}>
          {pwdSaving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("secPasswordUpdate")}
        </button>
      </form>
    </div>
  );
};

interface ProfileViewProps {
  user: any;
}

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  tax_id: string | null;
  tax_id_country?: string | null;
  date_of_birth: string | null;
  newsletter_subscription: boolean | null;
}

/** Linha de leitura (rótulo e valor), com "Não informado" quando vazio. */
function InfoRow({ label, value }: { label: string; value: string }) {
  const { t } = useMessages(accountMessages);
  return (
    <div className="rounded-[14px] bg-background px-4 py-3">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-[15px] font-medium", !value && "font-normal text-muted-foreground")}>{value || t("notInformed")}</dd>
    </div>
  );
}

const ProfileView = ({ user }: ProfileViewProps) => {
  const { t, locale } = useMessages(accountMessages);
  const taxRules = useTaxIdRules();
  const country = useCountry();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxError, setTaxError] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data as unknown as UserProfile | null;
    },
  });

  const reset = () => {
    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || `${country.code}:`);
    setTaxId(profile?.tax_id ? taxRules.format(profile.tax_id) : "");
    setDateOfBirth(profile?.date_of_birth || "");
    setTaxError("");
  };
  // Só quando o perfil chega ou muda (não a cada render, para não apagar o que a pessoa está escrevendo).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (profile) reset(); }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      if (profile) {
        const { error } = await supabase.from("user_profiles").update(data as any).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_profiles").insert({ user_id: user.id, ...data } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["profile-tax-id", user?.id] });
      toast.success(t("profSaved"));
      setIsEditing(false);
    },
    onError: (error: any) => {
      console.error("profile update failed", error);
      toast.error(t("profSaveError"));
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = taxRules.clean(taxId);
    const taxProblem = taxRules.enabled ? taxRules.validate(taxId) : "";
    if (taxProblem) {
      setTaxError(taxProblem);
      document.getElementById("profile-taxid")?.focus();
      return;
    }
    updateProfile.mutate({
      full_name: fullName,
      phone,
      tax_id: cleaned || null,
      tax_id_country: cleaned ? taxRules.country : null,
      date_of_birth: dateOfBirth || null,
    });
  };

  const cancel = () => { reset(); setIsEditing(false); };
  const longDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "");
  const birthLabel = dateOfBirth ? new Date(`${dateOfBirth}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "";

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true">
        <div className="skeleton h-72 rounded-[20px]" />
        <div className="skeleton h-40 rounded-[20px]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSave} className={cn(cardCls, "space-y-5 p-5 sm:p-6")} noValidate>
        <CardHead
          Icon={User}
          title={t("profCardTitle")}
          text={t("profText")}
          actions={isEditing ? (
            <>
              <button type="button" className={cn(btnSecondary, "min-h-11 px-4 text-[14px]")} onClick={cancel}><X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("cancel")}</button>
              <button type="submit" className={cn(btnPrimary, "min-h-11 px-4 text-[14px]")} disabled={updateProfile.isPending} aria-busy={updateProfile.isPending || undefined}>
                {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                {updateProfile.isPending ? t("saving") : t("save")}
              </button>
            </>
          ) : (
            <button type="button" className={cn(btnSecondary, "min-h-11 px-4 text-[14px]")} onClick={() => setIsEditing(true)}><Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("edit")}</button>
          )}
        />

        {isEditing ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("profFullName")} htmlFor="profile-name">
              <Input id="profile-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("profFullNamePlaceholder")} className={inputCls} />
            </Field>
            <Field label={t("profEmail")} htmlFor="profile-email">
              <Input id="profile-email" value={user?.email || ""} readOnly aria-describedby="profile-email-hint" className={cn(inputCls, "bg-brand-alt text-brand-ink-soft")} />
              <p id="profile-email-hint" className="text-[13px] text-muted-foreground">{t("profEmailHint")}</p>
            </Field>
            <Field label={t("profPhone")} htmlFor="profile-phone">
              <PhoneInputWithDDI id="profile-phone" value={phone} onChange={setPhone} />
            </Field>
            {taxRules.enabled && (
              <Field label={taxRules.label} htmlFor="profile-taxid" required={taxRules.required} hint={taxRules.required ? undefined : t("optional")} error={taxError} errorId="profile-taxid-error">
                <Input
                  id="profile-taxid" value={taxId} onChange={(e) => { setTaxId(taxRules.format(e.target.value)); setTaxError(""); }}
                  placeholder={taxRules.placeholder} maxLength={taxRules.maxLength} inputMode={taxRules.inputMode} autoComplete="off"
                  aria-invalid={!!taxError || undefined} aria-describedby={taxError ? "profile-taxid-error" : undefined}
                  className={cn(inputCls, taxError && "border-destructive")}
                />
              </Field>
            )}
            <Field label={t("profBirth")} htmlFor="profile-birth">
              <Input id="profile-birth" type="date" autoComplete="bday" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputCls} />
            </Field>
          </div>
        ) : (
          <dl className="grid gap-3 md:grid-cols-2">
            <InfoRow label={t("profFullName")} value={fullName} />
            <InfoRow label={t("profEmail")} value={user?.email || ""} />
            <InfoRow label={t("profPhone")} value={getFullPhoneDisplay(phone)} />
            {taxRules.enabled && <InfoRow label={taxRules.label} value={taxId} />}
            <InfoRow label={t("profBirth")} value={birthLabel} />
          </dl>
        )}
      </form>

      <section className={cn(cardCls, "space-y-4 p-5 sm:p-6")}>
        <CardHead Icon={ShieldCheck} title={t("profAccountTitle")} />
        <dl className="grid gap-3 md:grid-cols-2">
          <InfoRow label={t("profCreated")} value={longDate(user?.created_at)} />
          <InfoRow label={t("profLastLogin")} value={longDate(user?.last_sign_in_at)} />
        </dl>
        <button type="button" className={cn(btnSecondary, "hover:border-destructive hover:text-destructive")} onClick={signOut}>
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("dashSignOut")}
        </button>
      </section>
    </div>
  );
};

export default ProfileView;
