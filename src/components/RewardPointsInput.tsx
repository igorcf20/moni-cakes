// Pontos no checkout (recurso reward_points em Admin > Recursos da loja). Mostra o saldo, deixa usar o máximo
// permitido pelas regras e diz quantos pontos a compra rende. Só o visual: o create-order confere e desconta.
// Textos em src/i18n/rewardPoints.ts.
import { useId } from "react";
import { Coins } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatures";
import { useMyRewardPoints, usePointsChoice, useRewardSettings } from "@/hooks/useRewardPoints";
import { pointsValue } from "@/lib/rewardPoints";
import { useMessages } from "@/i18n";
import { rewardPointsMessages } from "@/i18n/rewardPoints";

export default function RewardPointsInput({ maxPoints, earn, money }: { maxPoints: number; earn: number; money: (v: number) => string }) {
  const { t, locale } = useMessages(rewardPointsMessages);
  const on = useFeature("reward_points");
  const { user } = useAuth();
  const id = useId();
  const { data: bal } = useMyRewardPoints();
  const { data: s } = useRewardSettings();
  const { use, setUse } = usePointsChoice();
  if (!on || !user || !bal || !s) return null;
  const n = (v: number) => new Intl.NumberFormat(locale).format(v);

  return (
    <div className="space-y-2 rounded-[14px] border border-border bg-white p-3.5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
        <Coins className="h-4 w-4 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{t("co_title")}
      </p>
      <p className="text-[13px] text-brand-ink-soft">{t("co_balance", { points: n(bal.balance), value: money(pointsValue(Math.max(0, bal.balance), s)) })}</p>
      {maxPoints > 0 ? (
        <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] font-medium">
          <Checkbox id={id} checked={use} onCheckedChange={(v) => setUse(v === true)} />
          <span>{t("co_use", { points: n(maxPoints), value: money(pointsValue(maxPoints, s)) })}</span>
        </label>
      ) : (
        <p className="text-[13px] text-brand-ink-soft">{t("co_below_min", { min: n(s.min_redeem) })}</p>
      )}
      {s.max_percent < 100 && maxPoints > 0 && <p className="text-[12px] text-muted-foreground">{t("co_cap", { pct: s.max_percent })}</p>}
      {earn > 0 && <p className="text-[13px] font-medium text-emerald-700">{t("co_earn", { points: n(earn) })}</p>}
    </div>
  );
}
