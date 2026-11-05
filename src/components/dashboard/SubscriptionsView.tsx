// Minha conta > Assinaturas (aba ?tab=assinaturas, só com o recurso subscriptions ligado): cada assinatura com estado,
// próxima data, desconto e quantidade; Renovar (abre o produto com ?renovar=<id>, que põe a renovação no carrinho com o
// desconto) quando a renovação está liberada; pausar, retomar, pular e cancelar conforme as regras da loja, pela RPC
// my_subscription_action. Cancelar pede confirmação na própria página. Textos em src/i18n/subscriptions.ts.
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Loader2, Repeat } from "lucide-react";
import { useMySubscriptions, useSubscriptionAction, useSubscriptionRules, type SubscriptionRow } from "@/hooks/useSubscriptions";
import { useMessages } from "@/i18n";
import { everyText, subscriptionsMessages } from "@/i18n/subscriptions";
import { addDays, canCustomerCancel, renewalLate, renewalOpen } from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import { btnDanger, btnPrimary, btnSmall, cardCls, EmptyState, ItemThumb } from "./ui";

type Action = "pause" | "resume" | "skip" | "cancel";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const STATUS_CLS = {
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  paused: "bg-amber-50 text-amber-800 ring-amber-200",
  cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
} as const;

export default function SubscriptionsView() {
  const { t } = useMessages(subscriptionsMessages);
  const { data: subs = [], isLoading } = useMySubscriptions();

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  if (!subs.length) return <EmptyState Icon={Repeat} title={t("title")} text={t("empty")} />;

  return (
    <ul className="space-y-4">
      {subs.map((s) => <li key={s.id}><SubscriptionCard s={s} /></li>)}
    </ul>
  );
}

function SubscriptionCard({ s }: { s: SubscriptionRow }) {
  const { t, locale } = useMessages(subscriptionsMessages);
  const { settings } = useSubscriptionRules();
  const act = useSubscriptionAction();
  const [confirming, setConfirming] = useState(false);
  const now = today();
  const long = (v: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${v}T12:00:00`));
  const open = renewalOpen(s, now, settings);
  const late = renewalLate(s, now);
  const productHref = s.products ? `/produto/${s.products.slug || s.products.id}?renovar=${s.id}` : null;

  const run = async (action: Action) => {
    try {
      await act.mutateAsync({ id: s.id, action });
      toast.success(t(`done_${action}`));
      setConfirming(false);
    } catch (e) {
      const code = (e as Error).message;
      toast.error(code === "min_cycles" ? t("err_min_cycles") : code === "not_allowed" || code === "feature_off" ? t("err_not_allowed") : t("err_unknown"));
    }
  };

  const options = [s.options.variation, s.options.size].filter(Boolean).join(" · ");
  const busy = act.isPending;

  return (
    <article className={cn(cardCls, "space-y-4 p-5 sm:p-6")}>
      <div className="flex items-start gap-4">
        <ItemThumb src={s.products?.image} alt={s.products?.name ?? ""} Icon={Repeat} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold leading-tight tracking-[-0.02em]">{s.products?.name ?? t("product_gone")}</h3>
            <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset", STATUS_CLS[s.status])}>{t(`st_${s.status}`)}</span>
          </div>
          <p className="mt-1 text-[15px] text-brand-ink-soft">
            {[everyText(t, s.interval_unit, s.interval_count), t("discount", { pct: s.discount_percent }), t("qty", { n: s.quantity }), options].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">
            {[s.cycles_done === 1 ? t("cycles_one") : t("cycles", { n: s.cycles_done }), s.min_cycles ? t("min_cycles", { n: s.min_cycles }) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {s.status !== "cancelled" && s.next_date && (
        late ? (
          <p className="flex items-center gap-2 rounded-[14px] bg-amber-50 px-4 py-3 text-[14px] font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{t("late", { date: long(s.next_date) })}
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 rounded-[14px] bg-brand-alt px-4 py-3 text-[14px] font-medium">
            <CalendarClock className="h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("next", { date: long(s.next_date) })}
            {!open && <span className="font-normal text-brand-ink-soft">{t("opens_on", { date: long(addDays(s.next_date, -settings.renew_days_before)) })}</span>}
          </p>
        )
      )}

      {s.status !== "cancelled" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {open && productHref && <Link to={productHref} className={btnPrimary}><Repeat className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("renew")}</Link>}
          {settings.customer_pause && s.status === "active" && <button type="button" className={btnSmall} disabled={busy} onClick={() => void run("pause")}>{t("pause")}</button>}
          {settings.customer_pause && s.status === "paused" && <button type="button" className={btnSmall} disabled={busy} onClick={() => void run("resume")}>{t("resume")}</button>}
          {settings.customer_pause && <button type="button" className={btnSmall} disabled={busy} onClick={() => void run("skip")}>{t("skip")}</button>}
          {canCustomerCancel(s, settings) && !confirming && <button type="button" className={cn(btnSmall, "hover:border-destructive hover:text-destructive")} disabled={busy} onClick={() => setConfirming(true)}>{t("cancel")}</button>}
        </div>
      )}

      {confirming && (
        <div role="alert" className="space-y-3 rounded-[14px] border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-[15px] font-medium">{t("confirm_cancel")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={btnDanger} disabled={busy} onClick={() => void run("cancel")}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("cancel")}</button>
            <button type="button" className={btnSmall} onClick={() => setConfirming(false)}>{t("keep")}</button>
          </div>
        </div>
      )}
    </article>
  );
}
