import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Eye, ShoppingCart, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import WishlistButton from "./WishlistButton";
import QuickViewModal from "./QuickViewModal";
import { formatPrice } from "@/utils/currency";
import { withVat, getVatRate } from "@/utils/pricing";
import { useState } from "react";
import StockIndicator from "./StockIndicator";
import ProductCardImage from "./ProductCardImage";
import { useCurrency } from "@/hooks/use-currency";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useProductRating } from "@/hooks/useProductRating";
import ProductReviewsModal from "./ProductReviewsModal";
import { getProductPromo, formatPromoBadge } from "@/utils/promo";
import { isLegacyRollProduct } from "@/lib/legacyRolls";
import PromoCountdown from "./PromoCountdown";

interface ProductCardProps {
  id: string;
  image: string;
  title: string;
  price: number | string;
  description: string;
  isNew?: boolean;
  isBestseller?: boolean;
  discount?: number;
  stock_quantity?: number;
  unit_type?: string;
  price_per_meter?: number | null;
  customizable?: boolean;
  categoryLabel?: string;
  slug?: string;
  min_price?: number | null;
  has_variants?: boolean;
  vat_rate?: number | null;
  promo_active?: boolean | null;
  promo_type?: string | null;
  promo_value?: number | null;
  promo_label?: string | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  promo_show_countdown?: boolean | null;
}

const ProductCard = ({ 
  id, image, title, price, description,
  isNew = false, isBestseller = false, discount = 0, stock_quantity = 0,
  unit_type = "unit", price_per_meter, customizable = true, categoryLabel, slug,
  min_price, has_variants = false, vat_rate,
  promo_active, promo_type, promo_value, promo_label,
  promo_starts_at, promo_ends_at, promo_show_countdown,
}: ProductCardProps) => {
  const navigate = useNavigate();
  const [showQuickView, setShowQuickView] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const { currentCurrency, convert } = useCurrency();
  const { user } = useAuth();
  const { addToCart } = useCart(user?.id);
  const { average: rating, count: reviewCount } = useProductRating(id);

  const product = {
    id, name: title, description, price, image,
    stock_quantity, is_featured: isBestseller, category: categoryLabel || "", material: "",
    unit_type, customizable, slug,
    price_per_meter,
    promo_active,
    promo_type,
    promo_value,
    promo_label,
    promo_starts_at,
    promo_ends_at,
    promo_show_countdown,
  };

  const isMeter = isLegacyRollProduct(unit_type, price_per_meter);
  const requiresCustomization = customizable;

  const handlePrimary = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Sempre encaminhar para a página do produto — lá o cliente escolhe
    // variação/tamanho e (se personalizável) faz upload do ficheiro.
    navigate(`/produto/${slug || id}`);
  };

  const numericBase = typeof price === "number" ? price : Number(price) || 0;
  const rawNetPrice = (() => {
    if (isMeter) return Number(min_price ?? price_per_meter ?? numericBase) || 0;
    return Number(min_price ?? numericBase) || 0;
  })();

  // Promotion state — when active, promo price becomes the new base.
  const promo = getProductPromo({
    price: isMeter ? undefined : numericBase,
    price_per_meter: isMeter ? (price_per_meter ?? numericBase) : undefined,
    unit_type,
    promo_active,
    promo_type,
    promo_value,
    promo_label,
    promo_starts_at,
    promo_ends_at,
    promo_show_countdown,
  });

  // Apply the promo discount to whatever "from" price we would normally show.
  const netPrice =
    promo?.isActive && promo.basePrice > 0
      ? Math.max(0, rawNetPrice * (promo.effectivePrice / promo.basePrice))
      : rawNetPrice;
  const originalPrice = rawNetPrice;

  const showFrom = has_variants || isMeter;
  const formattedPrice = formatPrice(convert(netPrice), currentCurrency);
  const formattedOriginal =
    promo?.isActive && originalPrice !== netPrice
      ? formatPrice(convert(originalPrice), currentCurrency)
      : null;
  const vatPct = getVatRate(vat_rate);
  const vatLabel = `+ IVA ${vatPct.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;

  return (
    <>
      <div className="group card-luxe h-full flex flex-col">
        <div className="relative overflow-hidden rounded-t-2xl">
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
            {isNew && (
              <Badge className="border-0 text-white text-[9px] px-2.5 py-1 rounded-full font-bold tracking-[0.14em] uppercase shadow-sm"
                style={{ background: "linear-gradient(135deg, hsl(var(--brand-royal-light)), hsl(var(--brand-royal)))" }}>
                Novo
              </Badge>
            )}
            {isBestseller && (
              <Badge className="border-0 text-white text-[9px] px-2.5 py-1 rounded-full font-bold tracking-[0.14em] uppercase shadow-sm"
                style={{ background: "linear-gradient(135deg, hsl(var(--brand-navy)), hsl(var(--brand-royal)))" }}>
                Top
              </Badge>
            )}
            {discount > 0 && (
              <Badge variant="destructive" className="text-[9px] px-2 py-1 rounded-full font-bold tracking-[0.1em]">
                -{discount}%
              </Badge>
            )}
            {promo?.isActive && (
              <Badge
                variant="destructive"
                className="text-[9px] px-2 py-1 rounded-full font-bold tracking-[0.1em]"
              >
                {formatPromoBadge(promo)}
              </Badge>
            )}
            {promo?.isActive && promo.label && (
              <Badge className="bg-destructive/10 text-destructive border border-destructive/30 text-[9px] px-2 py-0.5 rounded-full">
                {promo.label}
              </Badge>
            )}
          </div>

          <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
            <WishlistButton productId={id} size="icon" />
          </div>

          <div className="relative bg-[hsl(var(--brand-mist))] overflow-hidden">
            <ProductCardImage
              productId={id}
              fallbackImage={image}
              alt={title}
              onClick={() => navigate(`/produto/${slug || id}`)}
            />
            {/* Subtle overlay on hover */}
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, transparent 45%, hsl(var(--brand-navy) / 0.35) 100%)",
              }}
            />
          </div>

          <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-400 ease-out">
            <Button
              size="sm"
              className="w-full rounded-none text-[10px] tracking-[0.22em] uppercase h-10 border-0 text-white"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-royal)) 100%)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setShowQuickView(true);
              }}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Ver rápido
            </Button>
          </div>
        </div>

        <div className="p-3 sm:p-4 md:p-5 space-y-2 flex-1 flex flex-col cursor-pointer" onClick={() => navigate(`/produto/${slug || id}`)}>
          <div className="flex-1 space-y-1.5">
            {categoryLabel && (
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-primary/80">
                {categoryLabel}
              </p>
            )}
            <h3 className="font-heading font-semibold text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-300 tracking-tight text-[hsl(var(--brand-navy))]">
              {title}
            </h3>

            {reviewCount > 0 ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowReviews(true); }}
                className="flex items-center gap-1.5 group/rating hover:text-primary transition-colors"
                aria-label="Ver avaliações"
              >
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-2.5 w-2.5 ${
                        i < Math.round(rating) ? "fill-primary text-primary" : "text-muted-foreground/25"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground group-hover/rating:text-primary">
                  {rating.toFixed(1).replace(".", ",")} ({reviewCount})
                </span>
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground/70 italic">Sem avaliações</span>
            )}
          </div>

          <div className="space-y-2.5 pt-2.5 border-t border-border/40">
            <div className="flex items-end justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex flex-col leading-tight flex-1">
                {showFrom && (
                  <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                    A partir de
                  </span>
                )}
                <span className={`font-heading text-lg sm:text-xl font-bold whitespace-nowrap ${promo?.isActive ? "text-destructive" : "text-[hsl(var(--brand-navy))]"}`}>
                  {formattedPrice}
                  {isMeter && (
                    <span className={`ml-1 text-[11px] font-normal ${promo?.isActive ? "text-destructive/70" : "text-muted-foreground"}`}>
                      / m
                    </span>
                  )}
                </span>
                {formattedOriginal && (
                  <span className="text-[10px] text-muted-foreground/70 line-through decoration-muted-foreground/60">
                    Antes {formattedOriginal}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground">
                  {vatLabel}
                </span>
                {promo?.isActive && promo.showCountdown && promo.endsAt && (
                  <PromoCountdown endsAt={promo.endsAt} compact className="mt-0.5" />
                )}
              </div>
              {!isMeter && <StockIndicator stock={stock_quantity} showCount={false} />}
            </div>
            <Button
              size="lg"
              className="w-full min-h-[3.5rem] sm:min-h-[3.25rem] h-auto px-4 py-3 text-xs sm:text-[11px] font-bold tracking-[0.14em] uppercase text-primary-foreground border-0 rounded-full shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-[transform,box-shadow,background-color] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--brand-royal-light)) 0%, hsl(var(--brand-royal)) 100%)",
              }}
              onClick={handlePrimary}
              disabled={!isMeter && stock_quantity === 0}
            >
              {!isMeter && stock_quantity === 0 ? (
                <>Esgotado</>
              ) : requiresCustomization ? (
                <>
                  <ArrowRight className="h-4 w-4 mr-1.5" />
                  Personalizar
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 mr-1.5" />
                  Adicionar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>


      <QuickViewModal
        product={product}
        open={showQuickView}
        onOpenChange={setShowQuickView}
      />
      <ProductReviewsModal
        productId={id}
        productName={title}
        open={showReviews}
        onOpenChange={setShowReviews}
      />
    </>
  );
};

export default ProductCard;
