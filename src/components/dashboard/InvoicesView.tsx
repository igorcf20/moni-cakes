// =====================================================================================
// Aba Faturas da área do cliente.
//
//   Dados para o documento fiscal   nome e documento (CPF/CNPJ, NIF...) do perfil, com atalho para editar
//   Comprovante                     resumo da compra gerado no navegador, numa janela própria para imprimir ou
//                                   guardar em PDF (não é documento fiscal; o texto diz isso)
//   Documento fiscal                número, data e PDF de order_invoices, pela função my_invoices() (só os
//                                   pedidos do cliente); PDF no bucket privado "invoices", aberto por URL assinada.
//                                   O Admin envia o PDF no pedido (Admin > Pedidos). Migration 20261005150000.
// =====================================================================================
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2, Pencil, Printer, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { STORE_DEFAULTS } from "@/config/store";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/hooks/useOrders";
import { useCurrency } from "@/hooks/use-currency";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useTaxIdRules } from "@/hooks/useTaxIdRules";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { addressCountryCode } from "@/lib/addressFormats";
import { countryName, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { addressLines, orderCode, paymentKey, statusKey } from "./accountUtils";
import { EmptyState, StatusBadge, btnSmall, cardCls, h3Cls, iconTile } from "./ui";

type Invoice = { order_id: string; number: string | null; issued_at: string | null; document_path: string | null };
type Profile = { full_name?: string | null; tax_id?: string | null } | null | undefined;

const PAID = ["paid", "preparing", "in_production", "processing", "ready_for_pickup", "shipped", "delivered", "completed"];
const CANCELLED = ["cancelled", "refunded"];

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export default function InvoicesView({ orders, isLoading, profile, onEditProfile }: { orders: Order[]; isLoading: boolean; profile: Profile; onEditProfile: () => void }) {
  const { t, locale } = useMessages(accountMessages);
  const { currentCurrency, convert } = useCurrency();
  const { data: storeInfo } = useStoreInfo();
  const taxRules = useTaxIdRules();
  const country = useCountry();
  const [opening, setOpening] = useState<string | null>(null);
  const store = storeInfo?.name || STORE_DEFAULTS.name;

  const invoices = useQuery({
    queryKey: ["my-invoices"],
    retry: 1,
    queryFn: async (): Promise<Map<string, Invoice>> => {
      const { data, error } = await (supabase as any).rpc("my_invoices");
      if (error) throw error;
      return new Map(((data ?? []) as Invoice[]).map((i) => [i.order_id, i]));
    },
  });

  const money = (v: number | null | undefined) => formatPrice(convert(Number(v) || 0), currentCurrency);
  const date = (v: string) => new Date(v).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const openPdf = async (inv: Invoice) => {
    if (!inv.document_path) return;
    setOpening(inv.order_id);
    try {
      const { data, error } = await supabase.storage.from("invoices").createSignedUrl(inv.document_path, 120);
      if (error || !data?.signedUrl) throw error ?? new Error("no_url");
      window.open(data.signedUrl, "_blank", "noopener");
    } catch {
      toast.error(t("invDocError"));
    } finally {
      setOpening(null);
    }
  };

  /** Comprovante numa janela própria (HTML simples, com os dados escapados), pronto para imprimir. */
  const printReceipt = (order: Order) => {
    const w = window.open("", "_blank");
    if (!w) return toast.error(t("invPopupBlocked"));
    const o = order as Order & { billing_address?: unknown; discount_amount?: number | null };
    const addr = o.shipping_address as Record<string, unknown> | null;
    const addrCountry = addr ? addressCountryCode(addr.country as string, country.code) : null;
    const pk = paymentKey(o.payment_method);
    const sk = statusKey(o.status);
    const name = profile?.full_name || o.guest_name || "";
    const rows = (o.order_items || [])
      .map((it) => {
        const label = it.products?.name || it.custom_name || it.design_data?.name || "";
        return `<tr><td>${esc(label)}</td><td class="n">${it.quantity}</td><td class="n">${esc(money(it.price * it.quantity))}</td></tr>`;
      })
      .join("");
    const line = (label: string, value: string, cls = "") => `<tr class="${cls}"><td colspan="2">${esc(label)}</td><td class="n">${esc(value)}</td></tr>`;
    const html = `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><title>${esc(t("rcTitle"))} ${esc(orderCode(o.id))}</title>
<style>
  body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#171717;margin:0;padding:32px;background:#fff}
  .w{max-width:720px;margin:0 auto} h1{font-size:22px;margin:0 0 4px} .muted{color:#737373}
  .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #171717;padding-bottom:16px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px} .grid p{margin:2px 0}
  table{width:100%;border-collapse:collapse} th,td{padding:8px 4px;border-bottom:1px solid #EDE9E3;text-align:left;vertical-align:top}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#737373} .n{text-align:right;white-space:nowrap}
  .total td{font-weight:700;font-size:16px;border-bottom:0;border-top:2px solid #171717}
  .note{margin-top:24px;padding:12px;border:1px solid #EDE9E3;border-radius:10px;font-size:12px;color:#404040}
  button{margin-top:20px;font:600 14px system-ui;padding:10px 18px;border-radius:12px;border:0;background:#171717;color:#fff;cursor:pointer}
  @media print{body{padding:0} button{display:none}}
</style></head><body><div class="w">
<div class="head"><div><h1>${esc(t("rcTitle"))}</h1><div class="muted">${esc(store)}${storeInfo?.email ? ` · ${esc(storeInfo.email)}` : ""}</div></div>
<div class="n"><strong>${esc(t("rcOrder"))} #${esc(orderCode(o.id))}</strong><div class="muted">${esc(date(o.created_at))}</div></div></div>
<div class="grid"><div><p class="muted">${esc(t("rcCustomer"))}</p><p>${esc(name)}</p>${profile?.tax_id ? `<p>${esc(taxRules.label)}: ${esc(profile.tax_id)}</p>` : ""}</div>
<div><p class="muted">${esc(t("rcAddress"))}</p>${addr ? addressLines(addr as never, addrCountry ? countryName(addrCountry, locale) : null).map((l) => `<p>${esc(l)}</p>`).join("") : "<p>-</p>"}</div>
<div><p class="muted">${esc(t("rcPayment"))}</p><p>${esc(pk ? t(pk) : o.payment_method || "-")}</p></div>
<div><p class="muted">${esc(t("rcStatus"))}</p><p>${esc(sk ? t(sk) : o.status)}</p></div></div>
<table><thead><tr><th>${esc(t("rcItem"))}</th><th class="n">${esc(t("rcQty"))}</th><th class="n">${esc(t("rcAmount"))}</th></tr></thead><tbody>${rows}
${o.shipping_cost != null ? line(t("rcShipping"), money(o.shipping_cost)) : ""}
${Number(o.discount_amount) > 0 ? line(t("rcDiscount"), `-${money(o.discount_amount)}`) : ""}
${Number(o.vat_total) > 0 ? line(t("rcTax"), money(o.vat_total)) : ""}
${line(t("rcTotal"), money(o.total), "total")}</tbody></table>
<p class="note">${esc(t("rcNotFiscal"))}</p>
<button type="button" onclick="window.print()">${esc(t("rcPrint"))}</button>
</div></body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const billingName = profile?.full_name?.trim();
  const billingTax = profile?.tax_id?.trim();
  const list = orders;

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-brand-ink-soft">{t("invIntro")}</p>

      {/* Dados que vão no documento fiscal */}
      <section className={cn(cardCls, "flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6")} aria-labelledby="billing-title">
        <div className="flex min-w-0 items-start gap-3">
          <span className={iconTile}><FileText className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 id="billing-title" className={h3Cls}>{t("invBillingTitle")}</h3>
            <p className="mt-1 text-[14px] text-muted-foreground">{t("invBillingText")}</p>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
              <div><dt className="inline text-muted-foreground">{t("invBillingName")}: </dt><dd className="inline font-semibold">{billingName || t("invBillingEmpty")}</dd></div>
              {taxRules.enabled && (
                <div><dt className="inline text-muted-foreground">{taxRules.label}: </dt><dd className="inline font-semibold tabular-nums">{billingTax || t("invBillingEmpty")}</dd></div>
              )}
            </dl>
          </div>
        </div>
        <button type="button" onClick={onEditProfile} className={cn(btnSmall, "shrink-0")}>
          <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("invBillingEdit")}
        </button>
      </section>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-28 rounded-[20px]" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState Icon={Receipt} title={t("invEmptyTitle")} text={t("invEmptyText")} />
      ) : (
        <ul className="space-y-3">
          {list.map((order) => {
            const inv = invoices.data?.get(order.id);
            const cancelled = CANCELLED.includes(order.status);
            const paid = PAID.includes(order.status) || order.payment_status === "paid";
            return (
              <li key={order.id} className={cn(cardCls, "p-4 sm:p-5")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[16px] font-bold">{t("orderCode", { code: orderCode(order.id) })}</p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{date(order.created_at)}</p>
                  </div>
                  <p className="text-[17px] font-bold tabular-nums">{money(order.total)}</p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {/* Comprovante */}
                  <div className="flex items-center justify-between gap-3 rounded-[16px] border border-brand-card-border bg-background p-3.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[14px] font-semibold"><Receipt className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t("invReceipt")}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{t("invReceiptHint")}</p>
                    </div>
                    <button type="button" onClick={() => printReceipt(order)} className={cn(btnSmall, "shrink-0 px-3")} aria-label={`${t("rcPrint")}: ${t("orderCode", { code: orderCode(order.id) })}`}>
                      <Printer className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                      <span className="hidden sm:inline">{t("rcPrint")}</span>
                    </button>
                  </div>

                  {/* Documento fiscal */}
                  <div className={cn("flex items-center justify-between gap-3 rounded-[16px] border p-3.5", inv ? "border-primary/30 bg-accent/50" : "border-dashed border-brand-card-border")}>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[14px] font-semibold">
                        <FileText className={cn("h-4 w-4", inv ? "text-primary" : "text-muted-foreground")} strokeWidth={1.8} aria-hidden="true" />
                        {inv?.number ? t("invDoc", { number: inv.number }) : t("invDocFile")}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                        {inv
                          ? [inv.issued_at && t("invDocIssued", { date: date(inv.issued_at) }), !inv.document_path && t("invDocAsk")].filter(Boolean).join(". ")
                          : invoices.isLoading
                            ? "..."
                            : cancelled ? t("invDocCancelled") : paid ? t("invDocPending") : t("invDocAfterPay")}
                      </p>
                    </div>
                    {inv?.document_path && (
                      <button type="button" onClick={() => openPdf(inv)} disabled={opening === inv.order_id} className={cn(btnSmall, "shrink-0 px-3")}>
                        {opening === inv.order_id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                        <span className="hidden sm:inline">{t("invDocDownload")}</span>
                        <span className="sr-only sm:hidden">{t("invDocDownload")}</span>
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
