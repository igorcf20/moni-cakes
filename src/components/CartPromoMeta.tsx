// Barra de frete grátis do carrinho (página, gaveta e, se quiser, checkout). Só mostra regras reais:
// o valor mínimo vem do país do cliente (countries.free_shipping_from_cents, na moeda do país) e a barra
// pode ser desligada no Admin (plugins.free_shipping_bar). Sem valor mínimo, ou sem câmbio para a moeda
// mostrada, não aparece nada. As antigas "promoções" fixas (compre 3 leve 4 e afins) foram retiradas.
import { motion } from "framer-motion";
import { CheckCircle2, Truck } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import { useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { formatPrice, type CurrencyCode } from "@/utils/currency";

export type FreeShippingGoal = {
  /** o país tem frete grátis a partir de um valor e dá para o converter para a moeda mostrada */
  available: boolean;
  /** a barra de progresso está ligada no Admin */
  showBar: boolean;
  /** pedido já chega ao valor mínimo */
  reached: boolean;
  /** quanto falta, já na moeda mostrada */
  remaining: number;
  /** 0 a 1 */
  progress: number;
};

/**
 * Progresso para o frete grátis do país atual. `subtotal` é o subtotal líquido dos itens na moeda base da loja
 * (o mesmo valor que o servidor compara); o resultado já vem na moeda mostrada ao cliente.
 */
// eslint-disable-next-line react-refresh/only-export-components -- regra partilhada pela página do carrinho e pela gaveta
export function useFreeShippingGoal(subtotal: number): FreeShippingGoal {
  const country = useCountry();
  const { currentCurrency, baseCurrency, rates, convert } = useCurrency();
  const { data: visualSettings } = useVisualSettings();
  const barEnabled = visualSettings?.plugins?.free_shipping_bar?.enabled !== false;

  const cents = country.freeShippingFromCents;
  const from = country.currency as CurrencyCode;
  let threshold: number | null = null;
  if (cents != null && cents > 0) {
    const amount = cents / 100;
    if (from === currentCurrency) threshold = amount;
    else if (from === baseCurrency || rates[from]) threshold = convert(amount, from);
  }
  if (threshold == null || !(threshold > 0)) return { available: false, showBar: false, reached: false, remaining: 0, progress: 0 };
  const current = convert(Math.max(0, subtotal));
  return {
    available: true,
    showBar: barEnabled,
    reached: current >= threshold,
    remaining: Math.max(0, threshold - current),
    progress: Math.min(1, current / threshold),
  };
}

interface CartPromoMetaProps {
  subtotal: number;
  /** mantido por compatibilidade */
  itemCount?: number;
  /** "card": cartão branco (página); "inline": faixa compacta (gaveta) */
  variant?: "card" | "inline";
  className?: string;
}

const CartPromoMeta = ({ subtotal, variant = "card", className }: CartPromoMetaProps) => {
  const { t } = useMessages(cartMessages);
  const { currentCurrency } = useCurrency();
  const goal = useFreeShippingGoal(subtotal);
  if (!goal.showBar) return null;

  const Icon = goal.reached ? CheckCircle2 : Truck;
  const pct = Math.round(goal.progress * 100);
  const label = goal.reached
    ? t("freeShippingReached")
    : t("freeShippingMissing", { amount: formatPrice(goal.remaining, currentCurrency) });

  return (
    <div
      className={cn(
        variant === "card"
          ? "rounded-[6px] bg-white px-5 py-4"
          : "border-b border-brand-card-border bg-brand-alt px-5 py-3",
        className,
      )}
    >
      <p className={cn("flex items-center gap-2.5 text-foreground", variant === "card" ? "text-[15px]" : "text-[13px]")} aria-live="polite">
        <span className={cn("grid shrink-0 place-items-center rounded-full", variant === "card" ? "h-8 w-8" : "h-6 w-6", goal.reached ? "bg-emerald-50 text-emerald-700" : "bg-accent text-brand-orange-text")}>
          <Icon className={variant === "card" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className={cn("min-w-0 flex-1", goal.reached && "font-semibold text-emerald-700")}>{label}</span>
        {!goal.reached && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>}
      </p>
      <div
        className={cn("overflow-hidden rounded-full bg-brand-alt", variant === "card" ? "mt-3 h-2" : "mt-2 h-1.5 bg-white")}
        role="progressbar"
        aria-label={t("freeShippingProgress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <motion.div
          className={cn("h-full origin-left rounded-full", goal.reached ? "bg-emerald-600" : "bg-primary")}
          initial={false}
          animate={{ scaleX: goal.progress }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
      </div>
    </div>
  );
};

export default CartPromoMeta;
