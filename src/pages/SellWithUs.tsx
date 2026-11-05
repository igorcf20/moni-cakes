// /vender: "Venda na <loja>" (recurso marketplace). Explica como funciona (comissão padrão das regras do Admin) e
// recebe o pedido de cadastro de quem tem conta (request_vendor_application). Quem já é vendedor vai para o painel;
// quem já pediu vê o estado do pedido. Com os cadastros fechados em Admin > Vendedores > Regras, só explica.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { BadgePercent, CheckCircle2, Clock, Loader2, PackageCheck, Store, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListingShell } from "@/components/catalog/CatalogLayout";
import { btnPrimary, btnSecondary, cardCls, Field, inputCls } from "@/components/dashboard/ui";
import { useAuth } from "@/hooks/useAuth";
import { useStoreName } from "@/hooks/useBrand";
import { useApplyVendor, useMarketplaceSettings, useMyApplication, useMyVendor } from "@/hooks/useMarketplace";
import { useMessages } from "@/i18n";
import { marketplaceMessages } from "@/i18n/marketplace";
import { applicationErrors, marketplaceErrorOf } from "@/lib/marketplace";
import { cn } from "@/lib/utils";

export default function SellWithUs() {
  const { t } = useMessages(marketplaceMessages);
  const storeName = useStoreName();
  const { user } = useAuth();
  const { data: settings } = useMarketplaceSettings();
  const { data: vendor } = useMyVendor();
  const { data: app, isLoading: appLoading } = useMyApplication();
  const pct = settings?.default_commission ?? 10;
  const steps = [
    { Icon: Store, title: t("sell_s1"), text: t("sell_s1_d") },
    { Icon: PackageCheck, title: t("sell_s2"), text: t("sell_s2_d") },
    { Icon: BadgePercent, title: t("sell_s3"), text: t("sell_s3_d", { pct }) },
    { Icon: Wallet, title: t("sell_s4"), text: t("sell_s4_d") },
  ];

  return (
    <ListingShell>
      <Helmet><title>{`${t("sell_title", { store: storeName })} | ${storeName}`}</title></Helmet>
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t("sell_eyebrow")}</p>
        <h1 className="mt-2 text-[38px] font-[780] leading-[1.04] tracking-[-0.04em] sm:text-[52px]">{t("sell_title", { store: storeName })}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft">{t("sell_lead")}</p>
      </section>

      <ul className="mx-auto mt-8 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ Icon, title, text }, i) => (
          <li key={title} className={cn(cardCls, "p-5")}>
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-brand-orange-soft text-primary"><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
            <p className="mt-3 text-[13px] font-semibold text-brand-orange-text">{i + 1}</p>
            <p className="font-bold">{title}</p>
            <p className="mt-1 text-[14px] text-brand-ink-soft">{text}</p>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-8 max-w-2xl">
        {vendor ? (
          <Notice Icon={CheckCircle2} title={t("sell_is_vendor", { name: vendor.name })} text={t("sell_is_vendor_d")}>
            <Link to="/dashboard?tab=vendedor" className={btnPrimary}>{t("sell_open_panel")}</Link>
          </Notice>
        ) : !user ? (
          <Notice Icon={Store} title={t("sell_login")} text={t("sell_login_d")}>
            <Link to="/auth?redirect=/vender" className={btnPrimary}>{t("sell_login_btn")}</Link>
          </Notice>
        ) : appLoading ? (
          <p className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></p>
        ) : app && app.status === "new" ? (
          <Notice Icon={Clock} title={t("sell_pending")} text={t("sell_pending_d", { name: app.store_name })} />
        ) : settings && !settings.applications_open ? (
          <Notice Icon={Store} title={t("sell_closed")} text={t("sell_closed_d")} />
        ) : (
          <>
            {app?.status === "rejected" && <p className="mb-3 rounded-[14px] bg-brand-alt p-3 text-[14px] text-brand-ink-soft">{t("sell_rejected")}{app.admin_note ? ` ${app.admin_note}` : ""}</p>}
            <ApplyForm defaultEmail={user.email ?? ""} />
          </>
        )}
      </div>
    </ListingShell>
  );
}

function Notice({ Icon, title, text, children }: { Icon: typeof Store; title: string; text: string; children?: React.ReactNode }) {
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
  const { t } = useMessages(marketplaceMessages);
  const apply = useApplyVendor();
  const [f, setF] = useState({ store_name: "", contact_name: "", email: defaultEmail, phone: "", website: "", message: "" });
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errs = applicationErrors(f);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    setErr(null);
    if (errs.length) return;
    try {
      await apply.mutateAsync(f);
    } catch (x) {
      setErr(t(`err_${marketplaceErrorOf((x as Error).message)}`));
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className={cn(cardCls, "space-y-4 p-5 sm:p-6")}>
      <div>
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t("form_title")}</h2>
        <p className="text-[14px] text-brand-ink-soft">{t("form_lead")}</p>
      </div>
      <Field label={t("f_store_name")} htmlFor="ap-store" required error={tried && errs.includes("store_name") ? t("err_store_name") : undefined}>
        <Input id="ap-store" value={f.store_name} onChange={set("store_name")} maxLength={120} className={inputCls} autoComplete="organization" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("f_contact")} htmlFor="ap-contact"><Input id="ap-contact" value={f.contact_name} onChange={set("contact_name")} maxLength={120} className={inputCls} autoComplete="name" /></Field>
        <Field label={t("f_email")} htmlFor="ap-email" required error={tried && errs.includes("email") ? t("err_email") : undefined}>
          <Input id="ap-email" type="email" value={f.email} onChange={set("email")} maxLength={200} className={inputCls} autoComplete="email" />
        </Field>
        <Field label={t("f_phone")} htmlFor="ap-phone"><Input id="ap-phone" type="tel" value={f.phone} onChange={set("phone")} maxLength={40} className={inputCls} autoComplete="tel" /></Field>
        <Field label={t("f_website")} htmlFor="ap-site" hint={t("optional")}><Input id="ap-site" value={f.website} onChange={set("website")} maxLength={300} className={inputCls} placeholder="https://" /></Field>
      </div>
      <Field label={t("f_message")} htmlFor="ap-msg" hint={t("optional")}>
        <Textarea id="ap-msg" rows={4} value={f.message} onChange={set("message")} maxLength={2000} className="rounded-[14px] bg-white text-[16px] md:text-[15px]" placeholder={t("f_message_ph")} />
      </Field>
      {err && <p role="alert" className="rounded-[12px] bg-destructive/5 p-3 text-[14px] text-destructive">{err}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link to="/" className={btnSecondary}>{t("cancel")}</Link>
        <button type="submit" className={btnPrimary} disabled={apply.isPending}>{apply.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("submit")}</button>
      </div>
    </form>
  );
}
