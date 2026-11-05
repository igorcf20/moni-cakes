// Minha conta > Pontos (aba ?tab=pontos, só com o recurso reward_points ligado): saldo, quanto vale, o que vence
// em 30 dias, como funciona (com as regras da loja) e o extrato. Textos em src/i18n/rewardPoints.ts.
import { CalendarClock, Coins, Info, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useMyRewardHistory, useMyRewardPoints, useRewardSettings } from "@/hooks/useRewardPoints";
import { useMessages } from "@/i18n";
import { rewardPointsMessages } from "@/i18n/rewardPoints";
import { normalizeRewardSettings, pointsValue } from "@/lib/rewardPoints";
import { cn } from "@/lib/utils";
import { orderCode } from "./accountUtils";
import { cardCls, h3Cls, iconTile } from "./ui";

export default function RewardPointsView({ money }: { money: (v: number) => string }) {
  const { t, locale } = useMessages(rewardPointsMessages);
  const { data: bal, isLoading, error } = useMyRewardPoints();
  const { data: history = [] } = useMyRewardHistory();
  const { data: rules } = useRewardSettings();
  const s = rules ?? normalizeRewardSettings(null);
  const n = (v: number) => new Intl.NumberFormat(locale).format(v);
  const date = (v: string) => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(v));

  if (isLoading) return <p className="flex items-center gap-2 py-10 text-[15px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("loading")}</p>;
  if (error || !bal) return <p className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4 text-[15px] text-destructive">{t("load_error")}</p>;

  const how = [
    s.earn_per_unit === 1 ? t("how_earn_one", { unit: money(1) }) : t("how_earn", { unit: money(1), points: n(Math.floor(s.earn_per_unit * 100) / 100) }),
    t("how_use", { min: n(s.min_redeem), pct: s.max_percent, value: money(s.point_value) }),
    s.award_on === "delivered" ? t("how_when_delivered") : t("how_when_paid"),
    s.expire_months > 0 ? t("how_expire", { months: s.expire_months }) : t("how_noexpire"),
    t("how_cancel"),
  ];

  return (
    <div className="space-y-6">
      <div className={cn(cardCls, "flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6")}>
        <div className="flex items-center gap-4">
          <span className={iconTile}><Coins className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
          <div>
            <p className="text-[14px] font-semibold text-brand-ink-soft">{t("balance_label")}</p>
            <p className="text-[34px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{t("points_n", { n: n(bal.balance) })}</p>
            <p className="mt-1 text-[15px] text-brand-ink-soft">{t("worth", { value: money(pointsValue(Math.max(0, bal.balance), s)) })}</p>
          </div>
        </div>
        {bal.expiring > 0 && bal.next_expiry && (
          <p className="flex items-center gap-2 rounded-[14px] bg-amber-50 px-4 py-3 text-[14px] font-medium text-amber-800">
            <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            {t("expiring", { points: n(bal.expiring), date: date(bal.next_expiry) })}
          </p>
        )}
      </div>

      <section className={cn(cardCls, "space-y-3 p-5 sm:p-6")}>
        <h3 className={cn(h3Cls, "flex items-center gap-2")}><Info className="h-5 w-5 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("how_title")}</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-brand-ink-soft">
          {how.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className={cn(cardCls, "p-5 sm:p-6")}>
        <h3 className={h3Cls}>{t("history")}</h3>
        {history.length === 0 ? (
          <p className="mt-3 text-[15px] text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {history.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">
                    {t(`k_${x.kind}`)}
                    {x.order_id && <> · <Link to={`/dashboard?tab=pedidos&pedido=${x.order_id}`} className="text-brand-orange-text hover:underline">{t("order", { code: orderCode(x.order_id) })}</Link></>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">{[date(x.created_at), x.kind === "adjust" ? x.note : null].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={cn("shrink-0 text-[15px] font-bold tabular-nums", x.points < 0 ? "text-destructive" : "text-emerald-700")}>{x.points > 0 ? "+" : ""}{n(x.points)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
