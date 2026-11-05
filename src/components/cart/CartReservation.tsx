// Reserva no carrinho (recurso cart_reservations): sincronização global e aviso do tempo restante.
//   CartReservationSync   montado no App: reserva assim que o carrinho muda (também fora da página do carrinho) e
//                         solta a reserva quando o carrinho fica vazio.
//   CartReservationTimer  carrinho, gaveta e checkout: "reservados por 4:32" e o aviso quando a reserva venceu
//                         (só com o aviso ao cliente ligado em Admin > Reserva no carrinho).
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useCartStock } from "@/hooks/useCartStock";
import { useFeature } from "@/hooks/useFeatures";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import { cn } from "@/lib/utils";

export function CartReservationSync() {
  const { t } = useMessages(cartMessages);
  const { user } = useAuth();
  const { pathname } = useLocation();
  const on = useFeature("cart_reservations");
  const { cartItems, isLoading } = useCart(user?.id);
  const items = cartItems as any[];
  // Só chama com o carrinho vazio se ele já teve itens nesta visita (para soltar a reserva).
  const hadItems = useRef(false);
  if (items.length) hadItems.current = true;
  const admin = pathname.startsWith("/admin");
  const stock = useCartStock(items, on && !admin && !isLoading, hadItems.current);

  // Fora do carrinho e do checkout (que já mostram), um aviso quando nem tudo pôde ser reservado.
  const shown = useRef(0);
  const count = stock.problems.length;
  useEffect(() => {
    if (count > shown.current && !/^\/(carrinho|checkout)/.test(pathname)) toast.warning(t("reserveFewer"));
    shown.current = count;
  }, [count, pathname, t]);
  return null;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function CartReservationTimer({ notice, expiresAt, expired, className, compact = false }: {
  notice: boolean;
  expiresAt: number | null;
  expired: boolean;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useMessages(cartMessages);
  const now = useNow(notice && !!expiresAt);
  if (!notice) return null;
  const left = expiresAt ? Math.max(0, expiresAt - now) : 0;

  if (left > 0) {
    const min = Math.floor(left / 60_000);
    const sec = Math.floor((left % 60_000) / 1000);
    const time = `${min}:${String(sec).padStart(2, "0")}`;
    const urgent = left < 60_000;
    return (
      <div role="status" className={cn("flex items-start gap-3 rounded-[16px] border p-3.5", urgent ? "border-amber-300 bg-amber-50 text-amber-900" : "border-primary/25 bg-accent/60 text-foreground", className)}>
        <Clock className={cn("mt-0.5 h-5 w-5 shrink-0", urgent ? "text-amber-700" : "text-brand-orange-text")} strokeWidth={1.8} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">
            {t("reserveTimer")} <span className="tabular-nums" aria-live="off">{time}</span>
          </p>
          {!compact && <p className="mt-0.5 text-[13px] text-muted-foreground">{t("reserveTimerHint")}</p>}
        </div>
      </div>
    );
  }
  if (!expired) return null;
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-[16px] border border-amber-300 bg-amber-50 p-3.5 text-amber-900", className)}>
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" strokeWidth={1.8} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{t("reserveExpired")}</p>
        {!compact && <p className="mt-0.5 text-[13px] opacity-90">{t("reserveExpiredText")}</p>}
      </div>
    </div>
  );
}
