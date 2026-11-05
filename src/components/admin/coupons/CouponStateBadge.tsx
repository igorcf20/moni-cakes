// Etiqueta do estado do cupom (valendo, agendado, expirado, esgotado, desligado) na lista e na página do cupom.
import { Badge } from "@/components/ui/badge";
import { useMessages } from "@/i18n";
import { adminCouponsMessages, type AdminCouponsKey } from "@/i18n/adminCoupons";
import type { CouponState } from "@/hooks/useAdminCoupons";
import { cn } from "@/lib/utils";

const TONE: Record<CouponState, string> = {
  active: "border-emerald-600/40 bg-emerald-50 text-emerald-700",
  scheduled: "border-sky-600/40 bg-sky-50 text-sky-700",
  expired: "border-border bg-muted text-muted-foreground",
  exhausted: "border-amber-500/50 bg-amber-50 text-amber-800",
  inactive: "border-border bg-muted text-muted-foreground",
};

export function CouponStateBadge({ state, className }: { state: CouponState; className?: string }) {
  const { t } = useMessages(adminCouponsMessages);
  return (
    <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px] font-semibold", TONE[state], className)}>
      {t(`st_${state}` as AdminCouponsKey)}
    </Badge>
  );
}
