import { useCartDrawer } from "@/hooks/useCartDrawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ArrowRight, Minus, Plus, Sparkles, Truck, Clock, Palette, Check, ChevronDown } from "lucide-react";
import { useProductImages } from "@/hooks/useProductImages";
import { usePrintMethods } from "@/hooks/usePrintMethods";
import { formatPrice } from "@/utils/currency";
import { useCurrency } from "@/hooks/use-currency";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PriceDisplay from "./PriceDisplay";
import WishlistButton from "./WishlistButton";
import { Badge } from "@/components/ui/badge";
import VariationSelector from "./VariationSelector";
import SizeQuantitySelector, { type SizeQuantity } from "./SizeQuantitySelector";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getProductPromo, formatPromoBadge } from "@/utils/promo";
import { isLegacyRollProduct } from "@/lib/legacyRolls";
import PromoCountdown from "./PromoCountdown";

const stripHtml = (html: string): string => {
  if (!html) return "";
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").trim();
  }
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
};

interface QuickViewModalProps {
  product: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QuickViewModal = ({ product, open, onOpenChange }: QuickViewModalProps) => {
  const { user } = useAuth();
  const { addToCartAsync, addSelectionAsync, isAddingToCart } = useCart(user?.id);
  const [sizeQuantities, setSizeQuantities] = useState<SizeQuantity[]>([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const navigate = useNavigate();
  const { currentCurrency, convert } = useCurrency();

  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<any>(null);
  const [variationHasStock, setVariationHasStock] = useState(true);
  const [variationStockQty, setVariationStockQty] = useState(0);
  const [varSizeExtraMod, setVarSizeExtraMod] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => { setSizeQuantities([]); setSelectedSize(null); setQuantity(1); }, [product?.id, selectedVariation?.id]);
  const changeSizes = (values: SizeQuantity[]) => {
    setSizeQuantities(values); setSelectedSize(values[0]?.label ?? null);
    setQuantity(values.reduce((sum, v) => sum + v.quantity, 0) || 1);
  };

  const isMeter = isLegacyRollProduct(product?.unit_type, product?.price_per_meter);
  const requiresCustomization = product?.customizable !== false;

  const { data: variations = [] } = useQuery<any[]>({
    queryKey: ["qv-variations", product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      const { data } = await (supabase as any)
        .from("product_variations").select("id")
        .eq("product_id", product.id).eq("is_active", true);
      return data || [];
    },
    enabled: !!product?.id && !isMeter,
  });
  const { data: productSizes = [] } = useQuery<any[]>({
    queryKey: ["qv-product-sizes", product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      const { data } = await (supabase as any)
        .from("product_sizes").select("id, size_label, price_modifier")
        .eq("product_id", product.id).eq("is_active", true);
      return data || [];
    },
    enabled: !!product?.id && !isMeter,
  });
  // sizes are now defined at the product level — same source for variation flow too
  const variationSizes = productSizes;

  const [descOpen, setDescOpen] = useState(false);
  const [pickedImage, setPickedImage] = useState<string | null>(null);
  useEffect(() => { setDescOpen(false); setPickedImage(null); }, [product?.id]);
  useEffect(() => { setPickedImage(null); }, [selectedVariation?.id]);
  const { labels: methodLabels } = usePrintMethods();
  const { data: galleryRows = [] } = useProductImages(product?.id ?? "", selectedVariation?.id);
  const { data: qtyTiers = [] } = useQuery<{ min: number; price: number }[]>({
    queryKey: ["qv-tiers", product?.id],
    enabled: !!product?.id && !isMeter,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("product_volume_tiers").select("min_meters, price_per_meter")
        .eq("product_id", product.id).order("min_meters", { ascending: true });
      return (data || []).map((t: any) => ({ min: Number(t.min_meters), price: Number(t.price_per_meter) }))
        .filter((t: { min: number; price: number }) => Number.isFinite(t.min) && Number.isFinite(t.price));
    },
  });
  const { data: printAreas = [] } = useQuery<{ label: string; allowed_techniques: string[] | null }[]>({
    queryKey: ["qv-areas", product?.id],
    enabled: !!product?.id && requiresCustomization,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("product_print_areas").select("label, allowed_techniques")
        .eq("product_id", product.id).eq("is_active", true).order("display_order");
      return data || [];
    },
  });

  const handlePersonalize = () => {
    navigate(`/produto/${product.slug || product.id}`);
    onOpenChange(false);
  };

  const handleAddToCart = async () => {
    if (!variationHasStock && selectedVariation !== null) {
      toast.error("Este produto está esgotado nesta variação/tamanho");
      return;
    }
    if (product.stock_quantity <= 0 && !selectedVariation) {
      toast.error("Produto esgotado");
      return;
    }
    // Block when product has variations and none was picked
    if (Array.isArray(variations) && variations.length > 0 && !selectedVariation) {
      toast.error("Selecione uma variação antes de adicionar ao carrinho.");
      return;
    }
    // Block when sizes are available (on the variation or on the product) and none was picked
    const needsSize =
      (selectedVariation && variationSizes.length > 0) ||
      (!selectedVariation && productSizes.length > 0);
    if (needsSize && !sizeQuantities.length) {
      toast.error("Selecione um tamanho antes de adicionar ao carrinho.");
      return;
    }
    const productSizeMod = Number(
      (productSizes as any[]).find((s) => s.size_label === selectedSize)?.price_modifier || 0
    );
    const varMod = Number(selectedVariation?.price_modifier || 0);
    const sizeMod = selectedVariation ? Number(varSizeExtraMod || 0) : productSizeMod;
    const rawBase = typeof product.price === "number" ? product.price : Number(product.price) || 0;
    const promo = getProductPromo(product);
    const basePrice = promo?.isActive ? promo.effectivePrice : rawBase;
    const designData = selectedVariation || selectedSize ? {
      variation: selectedVariation?.name,
      size: selectedSize,
      color: selectedVariation?.color_hex
    } : null;
    try {
    if (sizeQuantities.length) {
      await addSelectionAsync(sizeQuantities.map(v => ({ productId: product.id, quantity: v.quantity,
        variationId: selectedVariation?.id, sizeLabel: v.label,
        designData: { name: product.name, image: product.image, price: basePrice + varMod + v.modifier,
          selectionPricing: { version: 1, basePrice, modifier: varMod + v.modifier, tierRatio: rawBase > 0 ? basePrice / rawBase : 1 }, variation: selectedVariation?.name, size: v.label, color: selectedVariation?.color_hex } })));
    } else await addToCartAsync({
      productId: product.id, 
      quantity: quantity,
      variationId: selectedVariation?.id,
      sizeLabel: selectedSize,
      designData: {
        ...(designData || {}),
        name: product.name,
        image: product.image,
        price: basePrice + varMod + sizeMod,
      }
    });
    onOpenChange(false);
    useCartDrawer.getState().setOpen(true);
    } catch { /* Keep the modal and selection available after a failed write. */ }
  };

  const handleViewDetails = () => {
    navigate(`/produto/${product.id}`);
    onOpenChange(false);
  };

  if (!product) return null;

  const isOutOfStock = (!variationHasStock && selectedVariation !== null) || (product.stock_quantity <= 0 && !selectedVariation);
  const maxQty = variationStockQty > 0 ? variationStockQty : product.stock_quantity;
  const displayImage = pickedImage || selectedVariation?.image_url || product.image;
  const gallery: string[] = Array.from(new Set<string>([
    selectedVariation?.image_url || product.image,
    ...(galleryRows as any[]).map((r) => r.image_url),
  ].filter(Boolean)));
  const description = stripHtml(product.description || product.short_description || "");
  const longDescription = description.length > 170;
  const promoInfo = getProductPromo(product);
  const techniques = Array.from(new Set(printAreas.flatMap((a) => a.allowed_techniques || [])));
  const tierBase = typeof product.price === "number" ? product.price : Number(product.price) || 0;
  const tierRows = qtyTiers.filter((t) => t.min > 1 || t.price !== tierBase).slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,780px)] w-[calc(100%-1.5rem)] max-w-[95vw] flex-col gap-0 overflow-hidden rounded-2xl border-border/50 p-0 shadow-2xl sm:max-w-5xl md:h-[min(88dvh,720px)] lg:max-w-6xl">
        <DialogTitle className="sr-only">{product.name}</DialogTitle>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1.05fr_1fr] md:overflow-hidden">
          {/* Gallery: one large photo, a strip of thumbnails underneath */}
          <div className="flex flex-col bg-muted/30 md:min-h-0">
            <div className="group relative aspect-square overflow-hidden md:aspect-auto md:min-h-0 md:flex-1">
              {!imgLoaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
              <img
                key={displayImage}
                src={displayImage}
                alt={product.name}
                onLoad={() => setImgLoaded(true)}
                className={cn(
                  "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out [@media(hover:hover)]:group-hover:scale-[1.03]",
                  imgLoaded ? "opacity-100" : "opacity-0"
                )}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/15 to-transparent" />

              <div className="absolute left-4 top-4 flex flex-col items-start gap-1.5">
                {promoInfo?.isActive && (
                  <Badge variant="destructive" className="rounded-full px-3 py-1 text-[11px] font-semibold shadow-lg">{formatPromoBadge(promoInfo)}</Badge>
                )}
                {product.is_featured && (
                  <Badge className="rounded-full border-0 bg-background/90 px-3 py-1 text-[11px] font-medium text-foreground shadow-lg backdrop-blur">Destaque</Badge>
                )}
              </div>
              <div className="absolute right-4 top-4">
                <WishlistButton productId={product.id} size="icon" />
              </div>
            </div>

            {gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-t border-border/50 bg-background/70 p-3 backdrop-blur" role="listbox" aria-label="Fotografias do produto">
                {gallery.slice(0, 8).map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    role="option"
                    aria-selected={src === displayImage}
                    aria-label={`Ver fotografia ${i + 1}`}
                    onClick={() => { setImgLoaded(false); setPickedImage(src); }}
                    className={cn(
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-[border-color,opacity,transform] duration-200 active:scale-95",
                      src === displayImage ? "border-primary" : "border-transparent opacity-70 [@media(hover:hover)]:hover:opacity-100"
                    )}
                  >
                    <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details: scrolls on its own, the action bar stays in view */}
          <div className="flex flex-col md:min-h-0">
            <div className="flex-1 space-y-6 p-5 sm:p-7 md:overflow-y-auto">
              <header>
                {product.category && (
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{product.category}</span>
                )}
                <h2 className="mt-1.5 font-heading text-2xl leading-tight tracking-tight text-foreground sm:text-3xl">{product.name}</h2>
                {description && (
                  <div className="mt-3">
                    <p className={cn("text-sm leading-relaxed text-muted-foreground", !descOpen && "line-clamp-3")}>{description}</p>
                    {longDescription && (
                      <button type="button" onClick={() => setDescOpen((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                        {descOpen ? "Ver menos" : "Ver mais"}
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", descOpen && "rotate-180")} />
                      </button>
                    )}
                  </div>
                )}
              </header>

              {/* Same promises the rest of the site makes */}
              <ul className="grid grid-cols-3 gap-2 text-center">
                {[
                  { Icon: Palette, title: "Personalização", text: "com o seu logótipo" },
                  { Icon: Clock, title: "Produção", text: "24 a 72h úteis" },
                  { Icon: Truck, title: "Envio", text: "para todo o país" },
                ].map(({ Icon, title, text }) => (
                  <li key={title} className="rounded-xl border border-border/60 bg-muted/30 px-2 py-3">
                    <Icon className="mx-auto h-4 w-4 text-primary" />
                    <p className="mt-1.5 text-xs font-semibold leading-tight">{title}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{text}</p>
                  </li>
                ))}
              </ul>

              {/* Price Block */}
              <div className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-4">
                {isMeter ? (
                (() => {
                  const promo = getProductPromo(product);
                  const rawMeter = Number(product.price_per_meter ?? product.price ?? 0);
                  const effMeter = promo?.isActive && promo.basePrice > 0
                    ? rawMeter * (promo.effectivePrice / promo.basePrice)
                    : rawMeter;
                  return (
                    <div className="space-y-1">
                      {promo?.isActive && (
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-[10px] font-semibold">{formatPromoBadge(promo)}</Badge>
                          {promo.label && <span className="text-[11px] font-medium text-destructive">{promo.label}</span>}
                        </div>
                      )}
                      <p className={cn("text-base font-semibold", promo?.isActive ? "text-destructive" : "text-foreground")}>
                        A partir de {effMeter.toFixed(2).replace(".", ",")} € o metro
                      </p>
                      {promo?.isActive && effMeter < rawMeter && (
                        <p className="text-xs text-muted-foreground/70 line-through">
                          Antes {rawMeter.toFixed(2).replace(".", ",")} € o metro
                        </p>
                      )}
                      {promo?.isActive && promo.showCountdown && promo.endsAt && (
                        <PromoCountdown endsAt={promo.endsAt} compact />
                      )}
                    </div>
                  );
                })()
                ) : (() => {
                const rawBase = typeof product.price === "number" ? product.price : Number(product.price) || 0;
                const promo = getProductPromo(product);
                const basePrice = promo?.isActive ? promo.effectivePrice : rawBase;
                  const varMod = Number(selectedVariation?.price_modifier || 0);
                  const productSizeMod = Number(
                    (productSizes as any[]).find((s) => s.size_label === selectedSize)?.price_modifier || 0
                  );
                  const sizeMod = selectedVariation ? Number(varSizeExtraMod || 0) : productSizeMod;
                  const finalPrice = basePrice + varMod + sizeMod;
                const rawFinal = rawBase + varMod + sizeMod;
                  return (
                    <>
                    {promo?.isActive && (
                      <div className="flex items-center gap-2 pb-1">
                        <Badge variant="destructive" className="text-[10px] font-semibold">
                          {formatPromoBadge(promo)}
                        </Badge>
                        {promo.label && (
                          <span className="text-[11px] font-medium text-destructive">{promo.label}</span>
                        )}
                      </div>
                    )}
                      <PriceDisplay currentPrice={finalPrice} />
                    {promo?.isActive && rawFinal > finalPrice && (
                      <p className="text-xs text-muted-foreground/70 line-through">
                        Antes {rawFinal.toFixed(2).replace(".", ",")} €
                      </p>
                    )}
                    {promo?.isActive && promo.showCountdown && promo.endsAt && (
                      <PromoCountdown endsAt={promo.endsAt} compact />
                    )}
                      {(varMod !== 0 || sizeMod !== 0) && (
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Base {basePrice.toFixed(2).replace(".", ",")} €
                          {varMod !== 0 && ` · Variação ${varMod > 0 ? "+" : ""}${varMod.toFixed(2).replace(".", ",")} €`}
                          {sizeMod !== 0 && ` · Tamanho ${sizeMod > 0 ? "+" : ""}${sizeMod.toFixed(2).replace(".", ",")} €`}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Volume pricing: the reason to order more */}
              {tierRows.length > 0 && (
                <section aria-label="Preços por quantidade">
                  <h3 className="text-sm font-semibold">Preços por quantidade</h3>
                  <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 text-sm">
                    {tierRows.map((t) => {
                      const saving = tierBase > 0 ? Math.round((1 - t.price / tierBase) * 100) : 0;
                      return (
                        <li key={t.min} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="text-muted-foreground">A partir de <span className="font-medium text-foreground">{t.min} un.</span></span>
                          <span className="flex items-center gap-2">
                            {saving > 0 && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">-{saving}%</span>}
                            <span className="font-semibold tabular-nums">{formatPrice(convert(t.price), currentCurrency)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* Where and how it can be personalised */}
              {requiresCustomization && printAreas.length > 0 && (
                <section aria-label="Personalização">
                  <h3 className="text-sm font-semibold">Onde pode personalizar</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {printAreas.map((a) => (
                      <li key={a.label} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1 text-xs">
                        <Check className="h-3 w-3 text-primary" />{a.label}
                      </li>
                    ))}
                  </ul>
                  {techniques.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Técnicas: {techniques.map((t) => methodLabels[t] ?? t).join(", ")}
                    </p>
                  )}
                </section>
              )}

              {/* Selectors */}
              {!isMeter && !requiresCustomization && (
              <div className="space-y-4">
                <VariationSelector
                  hideSizes
                  productId={product.id}
                  selectedVariation={selectedVariation}
                  onVariationChange={setSelectedVariation}
                  selectedSize={selectedSize}
                  onSizeChange={setSelectedSize}
                  onStockInfo={(hasStock, qty) => {
                    setVariationHasStock(hasStock);
                    setVariationStockQty(qty);
                  }}
                  onSizePriceModifier={setVarSizeExtraMod}
                />
                <SizeQuantitySelector productId={product.id} variationId={selectedVariation?.id} values={sizeQuantities} onChange={changeSizes} onReadinessChange={setSelectionReady} />

                {/* Inline Quantity */}
                {productSizes.length === 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Quantidade</span>
                  <div className="flex items-center border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="p-2.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      disabled={quantity <= 1}
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={quantity}
                      aria-label="Quantidade"
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        if (raw === "") { setQuantity(1); return; }
                        const parsed = parseInt(raw, 10);
                        if (!isNaN(parsed)) setQuantity(Math.min(maxQty || parsed, Math.max(1, parsed)));
                      }}
                      className="w-14 text-center text-sm font-semibold tabular-nums bg-transparent outline-none border-x border-border py-2"
                    />
                    <button
                      onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                      className="p-2.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      disabled={quantity >= maxQty}
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                </div>
                )}
              </div>
              )}
            </div>

            {/* Actions stay visible while the details scroll */}
            <div className="sticky bottom-0 space-y-2 border-t border-border/60 bg-background/95 p-4 backdrop-blur sm:px-7">
              {requiresCustomization ? (
                <Button
                  onClick={handlePersonalize}
                  disabled={isOutOfStock || isAddingToCart}
                  className={cn(
                    "w-full min-h-[3.25rem] h-auto px-5 py-3 text-base font-semibold tracking-wide rounded-xl transition-[background-color,box-shadow,transform] duration-300 active:scale-[0.99]",
                    isOutOfStock
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                  )}
                  size="lg"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isOutOfStock ? "Esgotado" : "Personalizar e encomendar"}
                </Button>
              ) : (
                <Button
                  onClick={handleAddToCart}
                  disabled={isOutOfStock || isAddingToCart || (!isMeter && !selectionReady)}
                  className={cn(
                    "w-full min-h-[3.25rem] h-auto px-5 py-3 text-base font-semibold tracking-wide rounded-xl transition-[background-color,box-shadow,transform] duration-300 active:scale-[0.99]",
                    isOutOfStock
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30"
                  )}
                  size="lg"
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {isOutOfStock ? "Esgotado" : "Adicionar ao Carrinho"}
                </Button>
              )}
              <Button variant="ghost" onClick={handleViewDetails} className="h-10 w-full rounded-xl text-sm text-muted-foreground hover:text-foreground">
                Ver página completa do produto
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickViewModal;
