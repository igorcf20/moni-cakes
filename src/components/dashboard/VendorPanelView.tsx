// Minha conta > Vendedor (aba ?tab=vendedor, só para contas ligadas a um vendedor e com o recurso marketplace ligado):
// números (vendas, a receber, repassado, saldo), pedidos com os itens do vendedor e o endereço de entrega, produtos com
// o estoque (o vendedor acerta pela função vendor_set_stock) e repasses da loja. Valores na moeda base da loja.
// Regras em src/lib/marketplace.ts; dados em src/hooks/useMarketplace.ts; textos em src/i18n/marketplace.ts.
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Banknote, ExternalLink, Loader2, MapPin, Package, Store, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/hooks/use-currency";
import { useMyPayouts, useMyVendor, useVendorOrders, useVendorProducts, useVendorSetStock, type MyVendor, type VendorProduct } from "@/hooks/useMarketplace";
import { useMessages } from "@/i18n";
import { marketplaceMessages } from "@/i18n/marketplace";
import { marketplaceErrorOf, shipToLines } from "@/lib/marketplace";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { btnSmall, cardCls, EmptyState, ItemThumb, StatusBadge } from "./ui";

type Tab = "orders" | "products" | "payouts";
const code = (id: string) => id.slice(0, 8).toUpperCase();
const PAGE = 10;

function useMoney() {
  const { locale } = useMessages(marketplaceMessages);
  const base = useCurrency((s) => s.baseCurrency);
  return (v: number) => formatMoney(v, base, locale);
}

export default function VendorPanelView() {
  const { t } = useMessages(marketplaceMessages);
  const { data: vendor, isLoading } = useMyVendor();
  const [tab, setTab] = useState<Tab>("orders");
  const money = useMoney();

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  if (!vendor) return <EmptyState Icon={Store} title={t("panel_title")} text={t("panel_none")} />;
  const x = vendor.totals;
  const stats = [
    { label: t("st_sales"), value: money(x.gross), hint: x.orders === 1 ? t("st_orders_one") : t("st_orders", { n: x.orders }) },
    { label: t("st_net"), value: money(x.net), hint: t("st_commission", { pct: vendor.commission_percent }) },
    { label: t("st_paid"), value: money(x.paid) },
    { label: t("st_balance"), value: money(x.balance), hint: x.net_undelivered > 0 ? t("st_undelivered", { value: money(x.net_undelivered) }) : undefined, strong: true },
  ];

  return (
    <div className="space-y-5">
      <section className={cn(cardCls, "flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between")}>
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-brand-alt">
            {vendor.logo_url ? <img src={vendor.logo_url} alt="" className="h-full w-full object-contain" /> : <Store className="h-6 w-6 text-primary" strokeWidth={1.7} aria-hidden="true" />}
          </span>
          <div>
            <p className="text-[20px] font-bold tracking-[-0.02em]">{vendor.name}</p>
            <p className="text-[14px] text-brand-ink-soft">{t("panel_lead")}</p>
          </div>
        </div>
        <Link to={`/vendedor/${vendor.slug}`} className={btnSmall}><ExternalLink className="h-4 w-4" aria-hidden="true" />{t("panel_page")}</Link>
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

      <div role="tablist" aria-label={t("panel_title")} className="flex flex-wrap gap-2">
        {(["orders", "products", "payouts"] as Tab[]).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("min-h-11 rounded-full border px-4 text-[14px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === k ? "border-foreground bg-foreground text-background" : "bg-white hover:border-foreground/40")}>
            {t(`tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === "orders" && <Orders />}
      {tab === "products" && <Products />}
      {tab === "payouts" && <Payouts vendor={vendor} />}
    </div>
  );
}

function Orders() {
  const { t, locale } = useMessages(marketplaceMessages);
  const money = useMoney();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useVendorOrders(page, PAGE);
  const dateFmt = (v: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(v));
  if (isLoading) return <p className="py-6 text-[15px] text-muted-foreground">{t("loading")}</p>;
  if (error) return <p className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[15px] text-destructive">{t("load_error")}</p>;
  const rows = data?.rows ?? [];
  if (!rows.length) return <EmptyState Icon={Package} title={t("tab_orders")} text={t("orders_empty")} />;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {rows.map((o) => {
          const ship = shipToLines(o.ship_to);
          return (
            <li key={o.order_id} className={cn(cardCls, "p-4 sm:p-5", !o.active && "opacity-75")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{t("order_code", { code: code(o.order_id) })} <span className="font-normal text-brand-ink-soft">· {dateFmt(o.created_at)}</span></p>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto]">
                <ul className="space-y-1 text-[15px]">
                  {o.items.map((it, i) => (
                    <li key={i} className={cn("flex justify-between gap-3", it.status !== "active" && "text-muted-foreground line-through")}>
                      <span className="min-w-0">{it.quantity} x {it.name}{[it.variation, it.size].filter(Boolean).length ? ` (${[it.variation, it.size].filter(Boolean).join(" / ")})` : ""}</span>
                      <span className="shrink-0 tabular-nums">{money(it.net)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 border-t pt-1.5 text-[14px] text-brand-ink-soft">
                    <span>{t("order_sum", { gross: money(o.gross), commission: money(o.commission) })}</span>
                    <span className="shrink-0 font-bold tabular-nums text-foreground">{money(o.net)}</span>
                  </li>
                </ul>
                {o.active ? (
                  ship.length > 0 && (
                    <div className="rounded-[14px] bg-brand-alt p-3 text-[14px] md:min-w-[220px]">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold"><MapPin className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("ship_to")}</p>
                      {ship.map((l, i) => <p key={i} className="text-brand-ink-soft">{l}</p>)}
                      {o.tracking_number && <p className="mt-1 text-[13px]">{t("tracking", { code: o.tracking_number })}</p>}
                    </div>
                  )
                ) : <p className="text-[14px] text-muted-foreground">{t("order_cancelled")}</p>}
              </div>
            </li>
          );
        })}
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

function StockInput({ product, part }: { product: VendorProduct; part: { variation_id: string | null; size_id: string | null; label: string | null; stock: number } }) {
  const { t } = useMessages(marketplaceMessages);
  const save = useVendorSetStock();
  const [v, setV] = useState(String(part.stock));
  const changed = v !== String(part.stock) && v.trim() !== "";
  const id = `vs-${product.id}-${part.variation_id ?? ""}-${part.size_id ?? ""}`;
  const run = async () => {
    try {
      await save.mutateAsync({ productId: product.id, variationId: part.variation_id, sizeId: part.size_id, value: Number(v) });
      toast.success(t("stock_saved"));
    } catch (e) {
      toast.error(t(`err_${marketplaceErrorOf((e as Error).message)}`));
    }
  };
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-[14px] text-brand-ink-soft">{part.label ?? t("stock")}</label>
      <Input id={id} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 7))} className="h-10 w-20 rounded-[12px] text-right tabular-nums" />
      <button type="button" className={cn(btnSmall, "min-h-10 px-3")} disabled={!changed || save.isPending} onClick={() => void run()}>{t("save")}</button>
    </div>
  );
}

function Products() {
  const { t } = useMessages(marketplaceMessages);
  const money = useMoney();
  const { data: rows = [], isLoading, error } = useVendorProducts();
  if (isLoading) return <p className="py-6 text-[15px] text-muted-foreground">{t("loading")}</p>;
  if (error) return <p className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[15px] text-destructive">{t("load_error")}</p>;
  if (!rows.length) return <EmptyState Icon={Package} title={t("tab_products")} text={t("products_empty")} />;
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-brand-ink-soft">{t("products_hint")}</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((p) => (
          <li key={p.id} className={cn(cardCls, "space-y-3 p-4")}>
            <div className="flex gap-3">
              <ItemThumb src={p.image} alt="" Icon={Package} />
              <div className="min-w-0">
                <Link to={`/produto/${p.id}`} className="font-semibold hover:text-brand-orange-text">{p.name}</Link>
                <p className="text-[13px] text-brand-ink-soft">{[p.sku, money(p.price), p.is_active ? null : t("product_hidden")].filter(Boolean).join(" · ")}</p>
                <p className="text-[13px] text-brand-ink-soft">{t("sold_30d", { n: p.sold_30d })}</p>
              </div>
            </div>
            <div className="space-y-2 border-t pt-3">
              {p.parts.length > 0
                ? p.parts.map((part) => <StockInput key={`${part.variation_id}-${part.size_id}`} product={p} part={part} />)
                : p.stock != null
                  ? <StockInput product={p} part={{ variation_id: null, size_id: null, label: null, stock: p.stock }} />
                  : <p className="text-[14px] text-muted-foreground">{t("stock_untracked")}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Payouts({ vendor }: { vendor: MyVendor }) {
  const { t, locale } = useMessages(marketplaceMessages);
  const money = useMoney();
  const { data: rows = [], isLoading } = useMyPayouts(vendor.id);
  const dateFmt = (v: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${v}T12:00:00`));
  if (isLoading) return <p className="py-6 text-[15px] text-muted-foreground">{t("loading")}</p>;
  if (!rows.length) return <EmptyState Icon={Wallet} title={t("tab_payouts")} text={t("payouts_empty", { balance: money(vendor.totals.balance) })} />;
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
