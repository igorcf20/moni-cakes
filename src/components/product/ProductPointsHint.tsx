// "Ganhe X pontos com esta compra" na página do produto (recurso reward_points). Só aviso: os pontos são dados
// pelo servidor quando o pedido é pago ou entregue. Valor em moeda base com imposto, como o create-order conta.
import { Coins } from "lucide-react";
import { useFeature } from "@/hooks/useFeatures";
import { useRewardSettings } from "@/hooks/useRewardPoints";
import { pointsEarned } from "@/lib/rewardPoints";
import { useMessages } from "@/i18n";
import { rewardPointsMessages } from "@/i18n/rewardPoints";

export default function ProductPointsHint({ value }: { value: number }) {
  const { t, locale } = useMessages(rewardPointsMessages);
  const on = useFeature("reward_points");
  const { data: s } = useRewardSettings();
  const points = on && s ? pointsEarned(value, s) : 0;
  if (!points) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
      <Coins className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {t("product_earn", { points: new Intl.NumberFormat(locale).format(points) })}
    </p>
  );
}
