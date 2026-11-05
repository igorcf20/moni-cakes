// Resumo do carrinho: cupom, subtotal, desconto, frete, total e o botão Finalizar compra.
// variant "card" (coluna do resumo) ou "bar" (barra fixa no celular e tablet, por cima da MobileTabBar).
// Os valores chegam em líquido na moeda base (useCart); aqui só se converte e formata. Em países com IVA
// (showsTaxSeparately) o subtotal mostrado já leva o imposto e o total diz "IVA incluído"; no Brasil o preço já é final.
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight, Layers, Lock, RotateCcw, ShieldCheck, type LucideIcon } from "lucide-react";
import CouponReveal from "@/components/cart/CouponReveal";
import { useCheckoutPage } from "@/hooks/useCheckoutPage";
import { useFreeShippingGoal } from "@/components/CartPromoMeta";
import { useCurrency } from "@/hooks/use-currency";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import { CartPriceHint } from "@/components/price/SmartPrice";
import { useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { showsTaxSeparately } from "@/utils/pricing";

type Props = {
  itemCount: number;
  /** subtotal líquido dos itens (moeda base) */
  subtotal: number;
  verificationNet?: number;
  verificationVat?: number;
  vat: number;
  discount: number;
  /** força o estado do frete grátis; sem ele, segue a regra do país (useFreeShippingGoal) */
  freeShipping?: boolean;
  /** mantido por compatibilidade (o valor vem do país) */
  freeShippingFrom?: number;
  coupon: { code: string } | null;
  isValidating: boolean;
  onApplyCoupon: (code: string) => Promise<void> | void;
  onRemoveCoupon: () => void;
  ctaLabel?: string;
  /** rótulo curto para a barra fixa do celular (padrão: ctaLabel) */
  ctaShortLabel?: string;
  ctaDisabled?: boolean;
  /** frase curta por baixo do botão (ex.: sem sessão, ou itens a resolver) */
  ctaHint?: string;
  onCheckout: () => void;
  variant?: "card" | "bar";
  /** link "Continuar comprando" (padrão /produtos; null esconde) */
  continueHref?: string | null;
  showTrust?: boolean;
  /** sem campo de cupom (ex.: compra PunchOut, em que o preço é o da empresa) */
  hideCoupon?: boolean;
  className?: string;
};

export const btnPrimary =
  "group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[16px] font-semibold text-primary-foreground transition-[background-color,transform,box-shadow] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Row({ label, value, tone = "muted" }: { label: React.ReactNode; value: React.ReactNode; tone?: "muted" | "success" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", tone === "success" ? "text-emerald-700" : "text-brand-ink-soft")}>
      <dt className="min-w-0">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

const TRUST: Array<{ Icon: LucideIcon; title: "trustSecure" | "trustMade" | "trustReturns"; text: "trustSecureText" | "trustMadeText" | "trustReturnsText"; href?: string }> = [
  { Icon: ShieldCheck, title: "trustSecure", text: "trustSecureText" },
  { Icon: Layers, title: "trustMade", text: "trustMadeText" },
  { Icon: RotateCcw, title: "trustReturns", text: "trustReturnsText", href: "/devolucoes" },
];

/** Selos curtos de confiança (ícones Lucide). */
export function CartTrust({ className }: { className?: string }) {
  const { t } = useMessages(cartMessages);
  return (
    <ul aria-label={t("trustLabel")} className={cn("grid gap-3", className)}>
      {TRUST.map(({ Icon, title, text, href }) => (
        <li key={title} className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center text-foreground">
            <Icon className="h-6 w-6" strokeWidth={1.4} aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-snug">
            {href ? (
              <Link to={href} className="block text-[14px] font-semibold text-foreground underline-offset-4 hover:text-brand-orange-text hover:underline">{t(title)}</Link>
            ) : (
              <span className="block text-[14px] font-semibold text-foreground">{t(title)}</span>
            )}
            <span className="block text-[13px] text-muted-foreground">{t(text)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const CartSummary = (p: Props) => {
  const { t } = useMessages(cartMessages);
  const country = useCountry();
  const { currentCurrency, convert } = useCurrency();
  const goal = useFreeShippingGoal(p.subtotal);
  const page = useCheckoutPage();
  void country; // showsTaxSeparately segue o país atual: recalcula quando o cliente troca de país
  const taxed = showsTaxSeparately();
  const money = (v: number) => formatPrice(convert(v), currentCurrency);

  const verificationNet = p.verificationNet ?? 0;
  const verificationVat = p.verificationVat ?? 0;
  const total = p.subtotal + verificationNet + verificationVat + p.vat - p.discount;
  const itemsShown = p.subtotal + (taxed ? p.vat : 0);
  const extrasShown = verificationNet + (taxed ? verificationVat : 0);
  const freeShipping = p.freeShipping ?? goal.reached;
  const ctaLabel = p.ctaLabel ?? t("checkout");
  const variant = p.variant ?? "card";

  if (variant === "bar") {
    if (typeof document === "undefined") return null;
    return createPortal(
      <div
        role="region"
        aria-label={t("mobileBar")}
        className="fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-[45] border-t border-border bg-white/95 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 md:bottom-0 md:pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="shell flex items-center gap-2.5 py-2.5 sm:gap-3">
          <div className="shrink-0 leading-tight">
            <p className="text-[12px] text-muted-foreground">{freeShipping ? t("total") : t("totalNoShipping")}</p>
            <p className="whitespace-nowrap text-[20px] font-bold tabular-nums text-foreground">{money(total)}</p>
          </div>
          {/* o botão fica com o espaço que sobra, para "Finalizar compra" caber inteiro a partir de 320px */}
          <button type="button" className={cn(btnPrimary, "ml-auto min-w-0 flex-1 px-3 text-[15px] min-[360px]:px-4 sm:max-w-[320px] sm:text-[16px]")} disabled={p.ctaDisabled} onClick={p.onCheckout}>
            <Lock className="h-4 w-4 shrink-0 max-[359px]:hidden" strokeWidth={2} aria-hidden="true" />
            <span className="truncate">{p.ctaShortLabel ?? ctaLabel}</span>
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <section
      aria-labelledby="cart-summary-title"
      className={cn("rounded-[6px] bg-white p-5 sm:p-6", p.className)}
    >
      <h2 id="cart-summary-title" className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-foreground">{t("summaryTitle")}</h2>

      {!p.hideCoupon && <CouponReveal
        className="mt-5"
        totalAmount={p.subtotal}
        coupon={p.coupon}
        discount={p.discount}
        isValidating={p.isValidating}
        onApply={p.onApplyCoupon}
        onRemove={p.onRemoveCoupon}
      />}

      <dl className="mt-5 space-y-3 border-t border-brand-card-border pt-5 text-[15px]">
        <Row label={t(p.itemCount === 1 ? "subtotal_one" : "subtotal_other", { count: p.itemCount })} value={money(itemsShown)} />
        {extrasShown > 0 && <Row label={t("extras")} value={money(extrasShown)} />}
        {p.discount > 0 && (
          <Row tone="success" label={p.coupon ? t("couponLine", { code: p.coupon.code }) : t("discount")} value={`-${money(p.discount)}`} />
        )}
        <Row
          label={t("shipping")}
          value={freeShipping
            ? <span className="font-semibold text-emerald-700">{t("shippingFree")}</span>
            : <span className="text-[13px] text-muted-foreground">{t("shippingNext")}</span>}
        />
      </dl>

      <div className="mt-5 flex items-end justify-between gap-4 border-t border-brand-card-border pt-5">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold text-foreground">{freeShipping ? t("total") : t("totalNoShipping")}</p>
          {taxed && <p className="text-[13px] text-muted-foreground">{t("taxIncluded", { amount: money(p.vat + verificationVat) })}</p>}
        </div>
        <p className="shrink-0 text-[28px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-foreground">{money(total)}</p>
      </div>
      {p.discount > 0 && <p className="mt-2 text-right text-[13px] font-medium text-emerald-700">{t("saving", { amount: money(p.discount) })}</p>}
      <CartPriceHint amount={total} className="mt-2" />

      <button type="button" className={cn(btnPrimary, "mt-6 min-h-[52px] text-[17px]")} disabled={p.ctaDisabled} onClick={p.onCheckout}>
        <Lock className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
        {ctaLabel}
        <ArrowRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden="true" />
      </button>
      {p.ctaHint && <p className="mt-2.5 text-center text-[13px] text-muted-foreground">{p.ctaHint}</p>}

      {p.continueHref !== null && (
        <Link
          to={p.continueHref ?? "/produtos"}
          className="mt-3 flex min-h-11 items-center justify-center rounded-full text-[15px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent"
        >
          {t("continueShopping")}
        </Link>
      )}

      {p.showTrust !== false && page.trust && <CartTrust className="mt-5 border-t border-brand-card-border pt-5" />}
    </section>
  );
};

export default CartSummary;
