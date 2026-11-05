// Minha conta > Afiliado (aba ?tab=afiliado, só para afiliados aprovados e com o recurso affiliates ligado): o link
// com o botão Copiar e o gerador de link para qualquer página, números (visitas, pedidos, aguardando entrega, a
// receber), pedidos pelo link (sem dados do comprador), pagamentos e como receber. Valores na moeda base da loja.
// Regras em src/lib/affiliates.ts; dados em src/hooks/useAffiliates.ts; textos em src/i18n/affiliates.ts.
import { useState } from "react";
import { toast } from "sonner";
import { Banknote, Copy, Link2, Loader2, Megaphone, ShoppingBag, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/hooks/use-currency";
import { useAffiliatePayouts, useAffiliateSettings, useMyAffiliate, useMyAffiliateOrders, useSavePayoutInfo, type MyAffiliate } from "@/hooks/useAffiliates";
import { useMessages } from "@/i18n";
import { affiliatesMessages } from "@/i18n/affiliates";
import { affiliateErrorOf, affiliateLink, conversionRate } from "@/lib/affiliates";
import { siteUrl } from "@/lib/siteUrl";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { btnSmall, cardCls, EmptyState, StatusBadge } from "./ui";

type Tab = "orders" | "payouts" | "settings";
const PAGE = 10;

function useMoney() {
  const { locale } = useMessages(affiliatesMessages);
  const base = useCurrency((s) => s.baseCurrency);
  return (v: number) => formatMoney(v, base, locale);
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(text);
  }
}

export default function AffiliatePanelView() {
  const { t, locale } = useMessages(affiliatesMessages);
  const { data: me, isLoading } = useMyAffiliate();
  const { data: settings } = useAffiliateSettings();
  const [tab, setTab] = useState<Tab>("orders");
  const [target, setTarget] = useState("");
  const money = useMoney();

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  if (!me || !me.totals) return <EmptyState Icon={Megaphone} title={t("panel_title")} text={t("panel_none")} />;
  const x = me.totals;
  const link = affiliateLink(siteUrl(), me.code);
  const custom = target.trim() ? affiliateLink(siteUrl(), me.code, target) : "";
  const stats = [
    { label: t("st_visits"), value: String(x.visits), hint: t("st_visits_30d", { n: x.visits_30d }) },
    { label: t("st_orders"), value: String(x.orders), hint: t("st_conversion", { pct: conversionRate(x).toLocaleString(locale, { maximumFractionDigits: 1 }) }) },
    { label: t("st_pending"), value: money(x.pending), hint: t("st_pending_d") },
    { label: t("st_balance"), value: money(Math.max(0, x.balance)), hint: t("st_balance_d", { v: money(x.paid) }), strong: true },
  ];

  return (
    <div className="space-y-5">
      {me.status === "paused" && <p className="rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-[14px] text-amber-900">{t("panel_paused")}</p>}
      <section className={cn(cardCls, "space-y-3 p-5")}>
        <p className="flex items-center gap-2 text-[15px] font-bold"><Link2 className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("your_link")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={link} aria-label={t("your_link")} className="h-12 flex-1 rounded-[14px] bg-brand-alt font-mono text-[14px]" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className={btnSmall} onClick={() => void copy(link, t("copied"))}><Copy className="h-4 w-4" aria-hidden="true" />{t("copy")}</button>
        </div>
        <p className="text-[14px] text-brand-ink-soft">{t("commission_line", { pct: me.commission_percent })}</p>
        <details className="group rounded-[14px] border border-brand-card-border p-3">
          <summary className="cursor-pointer text-[14px] font-semibold">{t("link_builder")}</summary>
          <p className="mt-2 text-[13px] text-brand-ink-soft">{t("link_builder_d")}</p>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={t("link_builder_ph")} aria-label={t("link_builder")} className="mt-2 h-11 rounded-[12px] text-[14px]" />
          {custom && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={custom} aria-label={t("your_link")} className="h-11 flex-1 rounded-[12px] bg-brand-alt font-mono text-[13px]" />
              <button type="button" className={btnSmall} onClick={() => void copy(custom, t("copied"))}><Copy className="h-4 w-4" aria-hidden="true" />{t("copy")}</button>
            </div>
          )}
        </details>
      </section>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label} className={cn(cardCls, "p-4", s.strong && "border-primary/40")}>
            <p className="text-[13px] font-semibold text-brand-ink-soft">{s.label}</p>
            <p className={cn("mt-1 text-[22px] font-bold tabular-nums tracking-[-0.02em]", s.strong && "text-brand-orange-text")}>{s.value}</p>
            {s.hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{s.hint}</p>}
          </li>
        ))}
      </ul>
      {settings && settings.min_payout > 0 && <p className="text-[13px] text-brand-ink-soft">{t("min_payout", { v: money(settings.min_payout) })}</p>}

      <div role="tablist" aria-label={t("panel_title")} className="flex flex-wrap gap-2">
        {(["orders", "payouts", "settings"] as Tab[]).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("min-h-11 rounded-full border px-4 text-[14px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === k ? "border-foreground bg-foreground text-background" : "bg-white hover:border-foreground/40")}>
            {t(`tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === "orders" && <Orders />}
      {tab === "payouts" && <Payouts me={me} />}
      {tab === "settings" && <PayoutInfo me={me} />}
    </div>
  );
}

function Orders() {
  const { t, locale } = useMessages(affiliatesMessages);
  const money = useMoney();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useMyAffiliateOrders(page, PAGE);
  const dateFmt = (v: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(v));
  if (isLoading) return <p className="py-6 text-[15px] text-muted-foreground">{t("loading")}</p>;
  if (error) return <p className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[15px] text-destructive">{t("load_error")}</p>;
  const rows = data?.rows ?? [];
  if (!rows.length) return <EmptyState Icon={ShoppingBag} title={t("tab_orders")} text={t("orders_empty")} />;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  return (
    <div className="space-y-4">
      <ul className={cn(cardCls, "divide-y")}>
        {rows.map((o) => (
          <li key={o.id} className={cn("flex flex-wrap items-center gap-3 p-4", o.status === "cancelled" && "opacity-70")}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("order_code", { code: o.order_ref })} <span className="font-normal text-brand-ink-soft">· {dateFmt(o.created_at)}</span></p>
              <p className="text-[13px] text-brand-ink-soft">{t("order_base", { v: money(o.base) })} · {o.commission_percent}%</p>
            </div>
            {o.status === "cancelled" ? <span className="text-[13px] font-semibold text-muted-foreground">{t("order_cancelled")}</span> : <StatusBadge status={o.order_status} />}
            <span className={cn("w-24 text-right font-bold tabular-nums", o.status === "cancelled" && "line-through")}>{money(o.commission)}</span>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button type="button" className={btnSmall} disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</button>
          <span className="text-[14px] tabular-nums text-muted-foreground">{t("page", { page, pages })}</span>
          <button type="button" className={btnSmall} disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</button>
        </div>
      )}
    </div>
  );
}

function Payouts({ me }: { me: MyAffiliate }) {
  const { t, locale } = useMessages(affiliatesMessages);
  const money = useMoney();
  const { data: rows = [], isLoading } = useAffiliatePayouts(me.id);
  const dateFmt = (v: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${v}T12:00:00`));
  if (isLoading) return <p className="py-6 text-[15px] text-muted-foreground">{t("loading")}</p>;
  if (!rows.length) return <EmptyState Icon={Wallet} title={t("tab_payouts")} text={t("payouts_empty", { balance: money(Math.max(0, me.totals?.balance ?? 0)) })} />;
  return (
    <ul className={cn(cardCls, "divide-y")}>
      {rows.map((p) => (
        <li key={p.id} className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-orange-soft text-primary"><Banknote className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{dateFmt(p.paid_at)}</p>
            <p className="text-[13px] text-brand-ink-soft">{[p.method, p.reference, p.note].filter(Boolean).join(" · ") || t("payout")}</p>
          </div>
          <span className="font-bold tabular-nums">{money(p.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function PayoutInfo({ me }: { me: MyAffiliate }) {
  const { t } = useMessages(affiliatesMessages);
  const save = useSavePayoutInfo();
  const [v, setV] = useState(me.payout_info ?? "");
  const run = async () => {
    try {
      await save.mutateAsync(v);
      toast.success(t("saved"));
    } catch (e) {
      toast.error(t(`err_${affiliateErrorOf((e as Error).message)}`));
    }
  };
  return (
    <section className={cn(cardCls, "space-y-3 p-5")}>
      <div>
        <label htmlFor="af-payout" className="font-bold">{t("payout_info")}</label>
        <p className="text-[14px] text-brand-ink-soft">{t("payout_info_d")}</p>
      </div>
      <Textarea id="af-payout" rows={3} maxLength={1000} value={v} onChange={(e) => setV(e.target.value)} placeholder={t("payout_info_ph")} className="rounded-[14px] bg-white text-[16px] md:text-[15px]" />
      <div className="flex justify-end">
        <button type="button" className={btnSmall} disabled={save.isPending || v === (me.payout_info ?? "")} onClick={() => void run()}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("save")}
        </button>
      </div>
    </section>
  );
}
