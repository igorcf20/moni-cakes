// Aba Orçamentos da conta (recurso quotes): cada pedido de orçamento com o estado, os itens e, quando a loja
// respondeu, o preço da proposta, a validade e a mensagem. Aceitar põe os itens no carrinho com o preço combinado
// (design_data.quote; o servidor confere tudo no create-order). Recusar a proposta ou cancelar o pedido em análise
// abre um passo de confirmação na própria lista.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2, Package } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAcceptQuote, useDeclineQuote, useMyQuotes, useQuoteMoney } from "@/hooks/useQuotes";
import { useMessages } from "@/i18n";
import { quotesMessages } from "@/i18n/quotes";
import { canBuy, quoteCartLine, quoteErrorOf, quoteRef, quoteTotals, quoteView, QUOTE_PATH, type Quote, type QuoteView } from "@/lib/quotes";
import { cn } from "@/lib/utils";
import { btnGhost, btnPrimary, btnSecondary, btnSmall, cardCls, EmptyState, ItemThumb } from "./ui";

type T = ReturnType<typeof useMessages<typeof quotesMessages["pt-BR"]>>["t"];

const TONE: Record<QuoteView, string> = {
  new: "bg-amber-50 text-amber-800 ring-amber-200",
  sent: "bg-brand-orange-soft text-brand-orange-text ring-primary/30",
  accepted: "bg-sky-50 text-sky-800 ring-sky-200",
  ordered: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  declined: "bg-slate-100 text-slate-700 ring-slate-200",
  rejected: "bg-rose-50 text-rose-800 ring-rose-200",
  cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
  expired: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function QuoteBadge({ view, t }: { view: QuoteView; t: T }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset", TONE[view])}>{t(`st_${view}`)}</span>;
}

export default function QuotesView() {
  const { t, locale } = useMessages(quotesMessages);
  const { data: quotes = [], isLoading, error } = useMyQuotes();
  const date = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  if (error) return <p className="rounded-[14px] bg-destructive/5 p-4 text-[15px] text-destructive">{t("load_error")}</p>;
  if (!quotes.length) {
    return (
      <EmptyState Icon={ClipboardList} title={t("empty")} text={t("empty_d")}>
        <Link to={QUOTE_PATH} className={btnPrimary}>{t("new_btn")}</Link>
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Link to={QUOTE_PATH} className={btnSmall}>{t("ask_new")}</Link></div>
      {quotes.map((q) => <QuoteCard key={q.id} q={q} date={date} />)}
    </div>
  );
}

function QuoteCard({ q, date }: { q: Quote; date: (d: string) => string }) {
  const { t } = useMessages(quotesMessages);
  const { user } = useAuth();
  const navigate = useNavigate();
  const money = useQuoteMoney();
  const qc = useQueryClient();
  const accept = useAcceptQuote();
  const decline = useDeclineQuote();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const view = quoteView(q);
  const priced = ["sent", "accepted", "ordered", "declined", "expired"].includes(view) && q.items.every((i) => i.unit_price != null);
  const totals = quoteTotals(q.items);
  const buyable = canBuy(q);

  const toCart = async () => {
    setBusy(true);
    try {
      if (q.status === "sent") await accept.mutateAsync(q.id);
      // Linhas antigas deste orçamento saem do carrinho antes de entrar de novo (a quantidade é a da proposta).
      const db = supabase as any;
      const del = await db.from("cart_items").delete().eq("user_id", user!.id).eq("design_data->quote->>id", q.id);
      if (del.error) throw del.error;
      const rows = q.items.map((i) => {
        const l = quoteCartLine(q, i);
        return { user_id: user!.id, product_id: l.productId, variation_id: l.variationId ?? null, size_label: l.sizeLabel ?? null, quantity: l.quantity, design_data: l.designData };
      });
      const ins = await db.from("cart_items").insert(rows);
      if (ins.error) throw ins.error;
      await qc.invalidateQueries({ queryKey: ["cart", user!.id] });
      toast.success(t("accepted_toast"));
      navigate("/carrinho");
    } catch (x) {
      const code = quoteErrorOf((x as Error)?.message);
      toast.error(code === "unknown" ? t("cart_error") : t(`err_${code}`, { n: 1 }));
    } finally {
      setBusy(false);
    }
  };
  const confirmDecline = async () => {
    try {
      await decline.mutateAsync({ id: q.id, reason });
      toast.success(q.status === "new" ? t("cancelled_toast") : t("declined_toast"));
      setAsking(false);
    } catch (x) {
      toast.error(t(`err_${quoteErrorOf((x as Error)?.message)}`, { n: 1 }));
    }
  };

  return (
    <article className={cn(cardCls, "overflow-hidden")} aria-labelledby={`quote-${q.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-card-border p-4 sm:p-5">
        <div className="min-w-0">
          <h3 id={`quote-${q.id}`} className="font-mono text-[16px] font-bold">{quoteRef(q.number)}</h3>
          <p className="text-[13px] text-brand-ink-soft">
            {[q.company, t("requested_on", { date: date(q.created_at) }),
              q.valid_until && (view === "expired" ? t("expired_on", { date: date(q.valid_until) }) : ["sent", "accepted"].includes(view) ? t("valid_until", { date: date(q.valid_until) }) : null)]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        <QuoteBadge view={view} t={t} />
      </header>

      <ul className="divide-y divide-brand-card-border">
        {q.items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 p-4 sm:px-5">
            <ItemThumb src={i.image} alt="" Icon={Package} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{i.name}</p>
              <p className="text-[13px] text-brand-ink-soft">
                {[i.variation_name, i.size_label, `${t("col_qty")} ${i.quantity}`, i.target_price != null ? t("your_target", { v: money(i.target_price) }) : null].filter(Boolean).join(" · ")}
              </p>
              {i.note && <p className="mt-0.5 text-[13px] text-brand-ink-soft">{i.note}</p>}
            </div>
            <div className="shrink-0 text-right text-[14px] tabular-nums">
              {priced ? (
                <>
                  <span className="block font-bold">{money(Number(i.unit_price))}</span>
                  {Number(i.unit_price) < i.list_price && <span className="block text-[12px] text-muted-foreground line-through">{money(i.list_price)}</span>}
                </>
              ) : <span className="text-brand-ink-soft">{money(i.list_price)}</span>}
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-brand-card-border bg-brand-alt/40 p-4 sm:p-5">
        {priced && totals.offer != null ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="text-[14px] text-brand-ink-soft">
              <span>{t("total_list")}: <span className="tabular-nums line-through">{money(totals.list)}</span></span>
              {totals.saving > 0 && <span className="ml-2 rounded-md bg-brand-orange-soft px-1.5 py-0.5 text-[12px] font-semibold text-brand-orange-text">{t("saving", { pct: totals.saving })}</span>}
            </div>
            <p className="text-right"><span className="block text-[12px] text-muted-foreground">{t("total_offer")}</span><span className="text-[22px] font-bold tabular-nums">{money(totals.offer)}</span></p>
          </div>
        ) : view === "new" ? <p className="text-[14px] text-brand-ink-soft">{t("waiting")}</p> : null}

        {q.store_message && (
          <div className="rounded-[14px] bg-white p-3 text-[14px]">
            <p className="text-[12px] font-semibold text-brand-orange-text">{t("store_message")}</p>
            <p className="whitespace-pre-line">{q.store_message}</p>
          </div>
        )}
        {q.message && (
          <details className="text-[14px]">
            <summary className="cursor-pointer font-semibold text-brand-ink-soft">{t("your_message")}</summary>
            <p className="mt-1 whitespace-pre-line text-brand-ink-soft">{q.message}</p>
          </details>
        )}

        {buyable && <p className="text-[13px] text-brand-ink-soft">{t("cart_note")}</p>}

        {asking ? (
          <div className="space-y-2 rounded-[14px] border border-brand-card-border bg-white p-3" role="group" aria-label={q.status === "new" ? t("confirm_cancel_title") : t("confirm_decline_title")}>
            <p className="font-semibold">{q.status === "new" ? t("confirm_cancel_title") : t("confirm_decline_title")}</p>
            {q.status !== "new" && (
              <>
                <label htmlFor={`qd-${q.id}`} className="text-[13px] font-semibold">{t("decline_reason")}</label>
                <Textarea id={`qd-${q.id}`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("decline_reason_ph")} className="rounded-[12px] bg-white text-[16px] md:text-[15px]" />
              </>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} onClick={() => setAsking(false)}>{t("keep")}</button>
              <button type="button" className={cn(btnSecondary, "border-destructive/40 text-destructive hover:border-destructive hover:text-destructive")} onClick={() => void confirmDecline()} disabled={decline.isPending}>
                {decline.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{q.status === "new" ? t("cancel_request") : t("decline")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {q.status === "ordered" && q.order_id && <Link to="/dashboard?tab=pedidos" className={btnSmall}>{t("view_order")}</Link>}
            {(q.status === "new" || buyable) && (
              <button type="button" className={btnGhost} onClick={() => setAsking(true)}>{q.status === "new" ? t("cancel_request") : t("decline")}</button>
            )}
            {buyable && (
              <button type="button" className={btnPrimary} onClick={() => void toCart()} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{q.status === "accepted" ? t("to_cart_again") : t("accept")}
              </button>
            )}
            {view === "expired" && <Link to={QUOTE_PATH} className={btnSmall}>{t("ask_new")}</Link>}
          </div>
        )}
      </div>
    </article>
  );
}
