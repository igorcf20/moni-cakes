// Campo de cupom do carrinho, da gaveta e do checkout. A validação é sempre a do servidor (useCoupon:
// RPC check_coupon, com sessão e limite de tentativas); aqui só o visual e os textos.
// Sem props de controle usa o próprio useCoupon; o CartSummary pode passar o estado que já tem.
import { useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useCoupon } from "@/hooks/useCoupon";
import { useCurrency } from "@/hooks/use-currency";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";

interface CouponInputProps {
  totalAmount: number;
  /** mostra o rótulo "Cupom de desconto" por cima do campo (padrão: sim) */
  showLabel?: boolean;
  /** estado vindo de fora (ex.: CartSummary); sem ele, usa useCoupon */
  coupon?: { code: string } | null;
  discount?: number;
  isValidating?: boolean;
  onApply?: (code: string) => Promise<unknown> | void;
  onRemove?: () => void;
  className?: string;
}

const CouponInput = ({ totalAmount, showLabel = true, className, ...controlled }: CouponInputProps) => {
  const { t } = useMessages(cartMessages);
  const id = useId();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [couponCode, setCouponCode] = useState("");
  const own = useCoupon();
  const { currentCurrency, convert } = useCurrency();

  const isControlled = controlled.onApply !== undefined;
  const appliedCoupon = isControlled ? controlled.coupon ?? null : own.appliedCoupon;
  const isValidating = isControlled ? !!controlled.isValidating : own.isValidating;
  const discount = isControlled && controlled.discount !== undefined ? controlled.discount : own.calculateDiscount(totalAmount);

  const handleApply = async () => {
    const code = couponCode.trim();
    if (!code || isValidating) return;
    if (isControlled) await controlled.onApply!(code);
    else await own.validateCoupon(code, totalAmount);
    setCouponCode("");
  };
  const handleRemove = () => (isControlled && controlled.onRemove ? controlled.onRemove() : own.removeCoupon());

  const redirect = encodeURIComponent(`${location.pathname}${location.search}`);

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <label htmlFor={id} className="block text-[14px] font-semibold text-foreground">
          {t("couponLabel")}
        </label>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {!appliedCoupon ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex gap-2"
          >
            <div className="relative min-w-0 flex-1">
              <Tag className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
              <Input
                id={id}
                value={couponCode}
                placeholder={t("couponPlaceholder")}
                aria-label={showLabel ? undefined : t("couponLabel")}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApply(); } }}
                className="h-12 rounded-[14px] border-border bg-white pl-10 text-[15px] uppercase placeholder:normal-case"
              />
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={isValidating || !couponCode.trim()}
              aria-label={isValidating ? t("couponApplying") : undefined}
              className="inline-flex h-12 min-w-[96px] shrink-0 items-center justify-center rounded-[14px] border border-border bg-white px-4 text-[15px] font-semibold text-foreground transition-[border-color,color,transform] duration-150 hover:border-primary hover:text-brand-orange-text active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {isValidating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : t("couponApply")}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="applied"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] border border-emerald-200 bg-emerald-50 py-1.5 pl-3.5 pr-1.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-700" strokeWidth={1.9} aria-hidden="true" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[14px] font-semibold text-emerald-800" aria-live="polite">{t("couponApplied", { code: appliedCoupon.code })}</p>
                {discount > 0 && (
                  <p className="text-[13px] tabular-nums text-emerald-700">{t("couponSaving", { amount: formatPrice(convert(discount), currentCurrency) })}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              aria-label={t("couponRemove", { code: appliedCoupon.code })}
              title={t("couponRemove", { code: appliedCoupon.code })}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-emerald-800 transition-colors duration-150 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {!appliedCoupon && !authLoading && !user && (
        <p className="text-[13px] text-muted-foreground">
          {t("couponLogin")}{" "}
          <Link to={`/auth?redirect=${redirect}`} className="font-semibold text-brand-orange-text underline-offset-4 hover:underline">
            {t("couponLoginLink")}
          </Link>
        </p>
      )}
    </div>
  );
};

export default CouponInput;
