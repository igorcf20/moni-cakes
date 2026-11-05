// /afiliados: "Indique a <loja> e ganhe" (recurso affiliates). Explica como funciona (comissão e dias do link das
// regras do Admin) e recebe o pedido de cadastro de quem tem conta (request_affiliate). Afiliado aprovado vai para a
// área dele na conta; pedido em análise ou recusado mostra o estado. Com os cadastros fechados, só explica.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { BadgePercent, CheckCircle2, Clock, Link2, Loader2, Megaphone, Wallet, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { btnPrimary, btnSecondary, cardCls, Field, inputCls } from "@/components/dashboard/ui";
import { useAuth } from "@/hooks/useAuth";
import { useStoreName } from "@/hooks/useBrand";
import { useAffiliateSettings, useApplyAffiliate, useMyAffiliate } from "@/hooks/useAffiliates";
import { useMessages } from "@/i18n";
import { affiliatesMessages } from "@/i18n/affiliates";
import { affiliateApplicationErrors, affiliateErrorOf } from "@/lib/affiliates";
import { cn } from "@/lib/utils";

export default function AffiliateProgram() {
  const { t } = useMessages(affiliatesMessages);
  const store = useStoreName();
  const { user } = useAuth();
  const { data: settings } = useAffiliateSettings();
  const { data: me, isLoading } = useMyAffiliate();
  const pct = settings?.default_commission ?? 5;
  const days = settings?.cookie_days ?? 30;
  const steps = [
    { Icon: Megaphone, title: t("s1"), text: t("s1_d") },
    { Icon: Link2, title: t("s2"), text: t("s2_d") },
    { Icon: BadgePercent, title: t("s3", { pct }), text: t("s3_d", { days }) },
    { Icon: Wallet, title: t("s4"), text: t("s4_d") },
  ];

  return (
    <ListingShell>
      <Helmet><title>{`${t("eyebrow")} | ${store}`}</title></Helmet>
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t("eyebrow")}</p>
        <h1 className="mt-2 text-[38px] font-[780] leading-[1.04] tracking-[-0.04em] sm:text-[52px]">{t("title", { store })}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft">{t("lead")}</p>
      </section>

      <ul className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ Icon, title, text }, i) => (
          <li key={i} className={cn(cardCls, "p-5")}>
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-brand-orange-soft text-primary"><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
            <p className="mt-3 text-[13px] font-semibold text-brand-orange-text">{i + 1}</p>
            <p className="font-bold">{title}</p>
            <p className="mt-1 text-[14px] text-brand-ink-soft">{text}</p>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-8 max-w-2xl">
        {!user ? (
          <Notice Icon={Megaphone} title={t("login")} text={t("login_d")}>
            <Link to="/auth?redirect=/afiliados" className={btnPrimary}>{t("login_btn")}</Link>
          </Notice>
        ) : isLoading ? (
          <p className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></p>
        ) : me && (me.status === "active" || me.status === "paused") ? (
          <Notice Icon={CheckCircle2} title={t("is_affiliate")} text={t("is_affiliate_d")}>
            <Link to="/dashboard?tab=afiliado" className={btnPrimary}>{t("open_panel")}</Link>
          </Notice>
        ) : me?.status === "pending" ? (
          <Notice Icon={Clock} title={t("pending")} text={t("pending_d")} />
        ) : me?.status === "rejected" ? (
          <Notice Icon={XCircle} title={t("rejected")} text={me.admin_note ? `${t("rejected_d")} ${me.admin_note}` : t("rejected_d")} />
        ) : settings && !settings.applications_open ? (
          <Notice Icon={Megaphone} title={t("closed")} text={t("closed_d")} />
        ) : (
          <ApplyForm defaultEmail={user.email ?? ""} />
        )}
      </div>
    </ListingShell>
  );
}

function Notice({ Icon, title, text, children }: { Icon: typeof Megaphone; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className={cn(cardCls, "flex flex-col items-center gap-3 p-6 text-center")}>
      <Icon className="h-8 w-8 text-brand-orange-text" strokeWidth={1.7} aria-hidden="true" />
      <p className="text-[20px] font-bold tracking-[-0.02em]">{title}</p>
      <p className="max-w-md text-[15px] text-brand-ink-soft">{text}</p>
      {children}
    </div>
  );
}

function ApplyForm({ defaultEmail }: { defaultEmail: string }) {
  const { t } = useMessages(affiliatesMessages);
  const apply = useApplyAffiliate();
  const [f, setF] = useState({ name: "", email: defaultEmail, phone: "", website: "", message: "" });
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errs = affiliateApplicationErrors(f);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    setErr(null);
    if (errs.length) return;
    try {
      await apply.mutateAsync(f);
    } catch (x) {
      setErr(t(`err_${affiliateErrorOf((x as Error).message)}`));
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className={cn(cardCls, "space-y-4 p-5 sm:p-6")}>
      <div>
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t("form_title")}</h2>
        <p className="text-[14px] text-brand-ink-soft">{t("form_lead")}</p>
      </div>
      <Field label={t("f_name")} htmlFor="af-name" required error={tried && errs.includes("name") ? t("err_name") : undefined}>
        <Input id="af-name" value={f.name} onChange={set("name")} maxLength={120} className={inputCls} autoComplete="name" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("f_email")} htmlFor="af-email" required error={tried && errs.includes("email") ? t("err_email") : undefined}>
          <Input id="af-email" type="email" value={f.email} onChange={set("email")} maxLength={200} className={inputCls} autoComplete="email" />
        </Field>
        <Field label={t("f_phone")} htmlFor="af-phone" hint={t("optional")}><Input id="af-phone" type="tel" value={f.phone} onChange={set("phone")} maxLength={40} className={inputCls} autoComplete="tel" /></Field>
      </div>
      <Field label={t("f_website")} htmlFor="af-site" hint={t("optional")}><Input id="af-site" value={f.website} onChange={set("website")} maxLength={300} className={inputCls} placeholder="https://" /></Field>
      <Field label={t("f_message")} htmlFor="af-msg" hint={t("optional")}>
        <Textarea id="af-msg" rows={4} value={f.message} onChange={set("message")} maxLength={2000} className="rounded-[14px] bg-white text-[16px] md:text-[15px]" placeholder={t("f_message_ph")} />
      </Field>
      {err && <p role="alert" className="rounded-[12px] bg-destructive/5 p-3 text-[14px] text-destructive">{err}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link to="/" className={btnSecondary}>{t("cancel")}</Link>
        <button type="submit" className={btnPrimary} disabled={apply.isPending}>{apply.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("submit")}</button>
      </div>
    </form>
  );
}
