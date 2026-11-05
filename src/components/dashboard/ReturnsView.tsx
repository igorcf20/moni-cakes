// =====================================================================================
// Aba Devoluções da área do cliente (/dashboard?tab=devolucoes).
//   Lista      cada pedido de devolução com estado, itens, motivo, o que o cliente pediu e a resposta da loja
//   Formulário ?tab=devolucoes&pedido=<id> (botão "Devolver ou trocar" na aba Pedidos): itens e quantidades, motivo,
//              o que prefere (só as opções que a loja aceita) e comentário
// O servidor confere tudo de novo (public.request_return): dono do pedido, estado, prazo, quantidades.
// =====================================================================================
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Clock, Loader2, MessageSquareText, Minus, Package, Plus, RotateCcw } from "lucide-react";
import type { Order } from "@/hooks/useOrders";
import { useMyReturns, useRequestReturn, useReturnSettings } from "@/hooks/useReturns";
import { useMessages } from "@/i18n";
import { returnsMessages } from "@/i18n/returns";
import {
  RETURN_REASONS, canRequestReturn, returnDeadline, returnErrorCode, returnableQuantities,
  type ReturnAction, type ReturnReason, type ReturnRequest, type ReturnStatus,
} from "@/lib/returns";
import { cn } from "@/lib/utils";
import { orderCode } from "./accountUtils";
import { EmptyState, ItemThumb, btnPrimary, btnSecondary, btnSmall, cardCls, focusRing, h3Cls, labelCls } from "./ui";

const STATUS_TONE: Record<ReturnStatus, { box: string; dot: string }> = {
  requested: { box: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  approved: { box: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  received: { box: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  completed: { box: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  rejected: { box: "bg-rose-50 text-rose-800 ring-rose-200", dot: "bg-rose-500" },
};

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  const { t } = useMessages(returnsMessages);
  const tone = STATUS_TONE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset", tone.box)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden="true" />{t(`status_${status}`)}
    </span>
  );
}

type Props = { userId: string; orders: Order[]; isLoading: boolean; onOrders: () => void };

export default function ReturnsView({ userId, orders, isLoading, onOrders }: Props) {
  const { t } = useMessages(returnsMessages);
  const [params, setParams] = useSearchParams();
  const { data: settings, isLoading: settingsLoading } = useReturnSettings();
  const { data: returns = [], isLoading: returnsLoading } = useMyReturns(userId);
  const orderId = params.get("pedido");
  const closeForm = () => setParams({ tab: "devolucoes" });

  if (isLoading || settingsLoading || returnsLoading) {
    return <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-36 rounded-[20px]" />)}</div>;
  }

  if (orderId) {
    const order = orders.find((o) => o.id === orderId);
    return <ReturnForm order={order ?? null} returns={returns.filter((r) => r.order_id === orderId)} onDone={closeForm} />;
  }

  return (
    <div className="space-y-4">
      {settings && !settings.enabled && (
        <p className={cn(cardCls, "p-4 text-[14px] text-brand-ink-soft")}>{t("disabled")}</p>
      )}
      {settings?.enabled && returns.length > 0 && (
        <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{t("window_note", { days: settings.days })}
        </p>
      )}
      {returns.length === 0 ? (
        <EmptyState Icon={RotateCcw} title={t("empty_title")} text={settings?.enabled ? `${t("empty_text")} ${t("window_note", { days: settings.days })}` : t("empty_text")}>
          <button type="button" onClick={onOrders} className={btnPrimary}>{t("see_orders")}</button>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {returns.map((r) => <ReturnCard key={r.id} r={r} />)}
        </ul>
      )}
    </div>
  );
}

function ReturnCard({ r }: { r: ReturnRequest }) {
  const { t, locale } = useMessages(returnsMessages);
  const date = (v: string) => new Date(v).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return (
    <li className={cn(cardCls, "p-4 sm:p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold tracking-[-0.01em]">{t("order_code", { code: orderCode(r.order_id) })}</h3>
            <ReturnStatusBadge status={r.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("requested_on", { date: date(r.created_at) })}</p>
        </div>
      </div>
      <p className="mt-3 text-[14px] text-brand-ink-soft">{t(`status_${r.status}_hint`)}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("items_label")}</h4>
          <ul className="mt-2 space-y-1 text-[14px]">
            {r.items.map((it) => <li key={it.order_item_id}>{t("qty", { count: it.quantity, name: it.name })}</li>)}
          </ul>
        </div>
        <div className="space-y-1 text-[14px]">
          <p>{t("wants", { action: t(`action_${r.action}`) })}</p>
          <p className="text-brand-ink-soft">{t("reason_label", { reason: t(`reason_${r.reason}`) })}</p>
        </div>
      </div>

      {r.comment && (
        <div className="mt-4 rounded-[14px] bg-brand-alt p-3 text-[14px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t("your_comment")}</p>
          <p className="mt-1 whitespace-pre-line">{r.comment}</p>
        </div>
      )}
      {r.store_reply && (
        <div className="mt-3 rounded-[14px] border border-primary/20 bg-accent p-3 text-[14px]">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-orange-text">
            <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t("store_reply")}
          </p>
          <p className="mt-1 whitespace-pre-line">{r.store_reply}</p>
        </div>
      )}
    </li>
  );
}

function ReturnForm({ order, returns, onDone }: { order: Order | null; returns: ReturnRequest[]; onDone: () => void }) {
  const { t, locale } = useMessages(returnsMessages);
  const { data: settings } = useReturnSettings();
  const send = useRequestReturn();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [action, setAction] = useState<ReturnAction | "">("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => order?.order_items ?? [], [order]);
  const left = useMemo(() => returnableQuantities(items, returns), [items, returns]);
  const actions = settings?.actions ?? [];
  const chosenAction = action || (actions.length === 1 ? actions[0] : "");
  const date = (v: Date | string) => new Date(v).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const back = (
    <button type="button" onClick={onDone} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-[12px] text-[14px] font-semibold text-brand-ink-soft hover:text-foreground", focusRing)}>
      <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("form_cancel")}
    </button>
  );

  if (!order) return <div className="space-y-3">{back}<p className={cn(cardCls, "p-5 text-[15px]")}>{t("form_not_found")}</p></div>;
  const hasOpen = returns.some((r) => ["requested", "approved", "received"].includes(r.status));
  if (!settings || !canRequestReturn(order, settings) || hasOpen) {
    return (
      <div className="space-y-3">
        {back}
        <p className={cn(cardCls, "p-5 text-[15px]")}>{hasOpen ? t("err_return_already_open") : settings && !settings.enabled ? t("disabled") : t("form_not_allowed")}</p>
      </div>
    );
  }

  const deadline = returnDeadline(order, settings);
  const nothingLeft = items.every((it) => (left[it.id] ?? 0) <= 0);
  const set = (id: string, v: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(left[id] ?? 0, v)) }));
  const picked = items.filter((it) => (qty[it.id] ?? 0) > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!picked.length) return setError(t("form_pick_item"));
    if (!reason) return setError(t("form_pick_reason"));
    if (!chosenAction) return setError(t("err_invalid_action"));
    send.mutate(
      { orderId: order.id, items: picked.map((it) => ({ order_item_id: it.id, quantity: qty[it.id] })), reason, action: chosenAction, comment },
      {
        onSuccess: () => { toast.success(t("form_sent")); onDone(); },
        onError: (err) => {
          const code = returnErrorCode(err);
          setError(code ? t(`err_${code}`) : t("err_generic"));
        },
      },
    );
  };

  const choice = (on: boolean) => cn(
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[14px] font-medium transition-colors duration-150",
    on ? "border-primary bg-accent text-foreground" : "border-border bg-white hover:border-primary/50",
  );

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {back}
      <div className={cn(cardCls, "space-y-6 p-4 sm:p-6")}>
        <div>
          <h2 className={h3Cls}>{t("form_title")}</h2>
          <p className="mt-1 text-[14px] text-brand-ink-soft">{t("form_lead", { code: orderCode(order.id), date: date(order.created_at) })}</p>
          {deadline && <p className="mt-1 text-[13px] text-muted-foreground">{t("form_deadline", { date: date(deadline) })}</p>}
        </div>

        <fieldset className="space-y-2">
          <legend className={labelCls}>{t("form_items")}</legend>
          <p className="text-[13px] text-muted-foreground">{nothingLeft ? t("form_none_left") : t("form_items_hint")}</p>
          <ul className="space-y-2 pt-1">
            {items.map((it) => {
              const max = left[it.id] ?? 0;
              const name = it.products?.name || it.design_data?.name || t("item_fallback");
              const v = qty[it.id] ?? 0;
              return (
                <li key={it.id} className={cn("flex items-center gap-3 rounded-[16px] border border-brand-card-border bg-white p-3", max <= 0 && "opacity-50")}>
                  <ItemThumb src={it.products?.image || it.design_data?.image || null} alt={name} Icon={Package} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">{name}</p>
                    <p className="text-[13px] text-muted-foreground">{t("of_n", { n: max })}</p>
                  </div>
                  <div className="flex items-center gap-1" role="group" aria-label={t("qty_label", { name })}>
                    <button type="button" className={cn(btnSmall, "h-11 w-11 px-0")} onClick={() => set(it.id, v - 1)} disabled={v <= 0} aria-label="-">
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="w-8 text-center text-[15px] font-semibold tabular-nums" aria-live="polite">{v}</span>
                    <button type="button" className={cn(btnSmall, "h-11 w-11 px-0")} onClick={() => set(it.id, v + 1)} disabled={v >= max} aria-label="+">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={labelCls}>{t("form_reason")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {RETURN_REASONS.map((r) => (
              <label key={r} className={choice(reason === r)}>
                <input type="radio" name="return-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[hsl(var(--primary))]" />
                {t(`reason_${r}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {actions.length > 1 && (
          <fieldset className="space-y-2">
            <legend className={labelCls}>{t("form_action")}</legend>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <label key={a} className={choice(chosenAction === a)}>
                  <input type="radio" name="return-action" value={a} checked={chosenAction === a} onChange={() => setAction(a)} className="accent-[hsl(var(--primary))]" />
                  {t(`action_${a}`)}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="space-y-1.5">
          <label htmlFor="return-comment" className={labelCls}>{t("form_comment")}</label>
          <textarea
            id="return-comment" rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={t("form_comment_ph")}
            className={cn("w-full rounded-[14px] border border-border bg-white px-3.5 py-3 text-[16px] md:text-[15px]", focusRing)}
          />
        </div>

        {error && <p role="alert" className="rounded-[12px] bg-destructive/5 p-3 text-[14px] text-destructive">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDone} className={btnSecondary}>{t("form_cancel")}</button>
          <button type="submit" className={btnPrimary} disabled={send.isPending || nothingLeft}>
            {send.isPending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("form_sending")}</> : t("form_send")}
          </button>
        </div>
        <p className="text-center text-[13px] text-muted-foreground sm:text-right">
          <Link to="/devolucoes" className="font-semibold text-brand-orange-text hover:underline">{t("policy_link")}</Link>
        </p>
      </div>
    </form>
  );
}
