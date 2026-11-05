// Cupom do carrinho e do checkout com Admin > Carrinho e checkout > Cupom: "link" guarda o campo atrás de
// "Tem um cupom de desconto?" (o resumo fica mais curto e quem não tem cupom não sente falta de nada);
// "field" mostra o campo aberto, como antes. Com cupom aplicado o campo aparece sempre, para dar para tirar.
import { useState, type ComponentProps } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Tag } from "lucide-react";
import CouponInput from "@/components/CouponInput";
import { useCoupon } from "@/hooks/useCoupon";
import { useCheckoutPage } from "@/hooks/useCheckoutPage";
import { useMessages } from "@/i18n";
import { checkoutPageMessages } from "@/i18n/checkoutPage";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof CouponInput>;

export default function CouponReveal(props: Props) {
  const { t } = useMessages(checkoutPageMessages);
  const { coupon: style } = useCheckoutPage();
  const own = useCoupon();
  const applied = props.onApply !== undefined ? !!props.coupon : !!own.appliedCoupon;
  const [open, setOpen] = useState(false);

  if (style === "field" || applied) return <CouponInput {...props} />;

  return (
    <div className={props.className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group -mx-1 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-[14px] font-semibold text-brand-orange-text transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Tag className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        {t("couponAsk")}
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <CouponInput {...props} className="pt-2" showLabel={false} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
