// Gaveta do carrinho (abre depois de adicionar e pelo ícone do cabeçalho). Lê o mesmo carrinho da página
// /carrinho (visitante e com sessão), por isso quantidades, remoções e cupom funcionam igual nos dois lugares.
// Também exporta as peças de linha usadas pela página do carrinho: miniatura, opções, quantidade e remover.
import { useEffect, useState } from "react";
import { useHrefOn } from "@/hooks/useFeatures";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { ArrowRight, Box, FileDown, Lock, Minus, Plus, Repeat, ShoppingBag, Trash2, X } from "lucide-react";
import { CartPriceHint } from "@/components/price/SmartPrice";
import { toast } from "sonner";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LayerArt } from "@/components/MediaImage";
import CartPromoMeta, { useFreeShippingGoal } from "@/components/CartPromoMeta";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useCartStock } from "@/hooks/useCartStock";
import { usePreorder } from "@/hooks/usePreorders";
import { PreorderChip } from "@/components/product/PreorderInfo";
import { CartReservationTimer } from "@/components/cart/CartReservation";
import { useCartDrawer } from "@/hooks/useCartDrawer";
import { useCoupon } from "@/hooks/useCoupon";
import { useCurrency } from "@/hooks/use-currency";
import { usePrintMethods } from "@/hooks/usePrintMethods";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import { everyText, subscriptionsMessages } from "@/i18n/subscriptions";
import { RentalChip } from "@/components/product/RentalChip";
import { useDigitalOnlyIds } from "@/hooks/useDigitalProducts";
import { digitalMessages } from "@/i18n/digitalProducts";
import { useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { showsTaxSeparately, withVat } from "@/utils/pricing";
import CartSheetCrossSell from "@/components/cart/CartSheetCrossSell";
import { CartKitHints } from "@/components/cart/CartKitHints";
import { QuoteLineQty } from "@/components/quotes/QuoteCartBits";

/* ---------- peças de linha (partilhadas com src/pages/Cart.tsx) ---------- */

/** Miniatura do item: foto da cor, do design_data ou do produto; sem foto, a reserva LayerArt. */
export function CartLineThumb({ item, className }: { item: any; className?: string }) {
  const src: string | null = item?.product_variations?.image_url || item?.design_data?.image || item?.products?.image || null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-[14px] border border-brand-card-border bg-background", className)}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <LayerArt Icon={Box} size="sm" />}
    </div>
  );
}

/** Opções escolhidas: cor (com bolinha) e tamanho. */
export function CartLineOptions({ item, className }: { item: any; className?: string }) {
  const { t } = useMessages(cartMessages);
  const { t: tdig } = useMessages(digitalMessages);
  const d = item?.design_data || {};
  const colorName: string | undefined = item?.product_variations?.name || d.variation;
  const colorHex: string | undefined = item?.product_variations?.color_hex || d.color;
  const size: string | undefined = item?.size_label || d.size;
  // Assinatura (design_data.subscription): plano escolhido no produto ou renovação feita pela conta.
  const sub = d.subscription && typeof d.subscription === "object" ? d.subscription : null;
  // Aluguel (design_data.rental): datas de início e fim e períodos cobrados.
  const rental = d.rental && typeof d.rental === "object" ? d.rental : null;
  // Produto digital (recurso digital_products): etiqueta Download.
  const digital = useDigitalOnlyIds(item?.product_id ? [String(item.product_id)] : []).all.has(String(item?.product_id ?? ""));
  // Pré-venda (recurso preorders): o servidor marca a linha no pedido; aqui o estado de agora do produto.
  const preorder = usePreorder(!d.customization && !rental ? item?.product_id : null);
  if (!colorName && !size && !sub && !rental && !digital && !preorder) return null;
  const chip = "inline-flex items-center gap-1.5 rounded-lg bg-brand-alt px-2 py-1 text-[12px] leading-none text-brand-ink-soft";
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {colorName && (
        <li className={chip}>
          {t("color")}:
          {colorHex && <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: colorHex }} aria-hidden="true" />}
          <span className="font-semibold text-foreground">{colorName}</span>
        </li>
      )}
      {size && (
        <li className={chip}>
          {t("size")}: <span className="font-semibold text-foreground">{size}</span>
        </li>
      )}
      {sub && <SubscriptionChip sub={sub} className={chip} />}
      {rental && <RentalChip rental={rental} className={chip} />}
      {preorder && <li className="inline-flex"><PreorderChip releaseDate={preorder.release_date} /></li>}
      {digital && <li className={cn(chip, "bg-brand-orange-soft text-brand-orange-text")}><FileDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" /><span className="font-semibold">{tdig("cart_chip")}</span></li>}
    </ul>
  );
}

function SubscriptionChip({ sub, className }: { sub: { subscription_id?: string; unit?: string; count?: number; pct?: number }; className: string }) {
  const { t } = useMessages(subscriptionsMessages);
  const pct = Number(sub.pct || 0);
  return (
    <li className={cn(className, "bg-brand-orange-soft text-brand-orange-text")}>
      <Repeat className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      <span className="font-semibold">{sub.subscription_id ? t("cart_renewal") : t("cart_label", { every: everyText(t, String(sub.unit), Number(sub.count) || 1) })}</span>
      {pct > 0 && <span>{t("cart_save", { pct })}</span>}
    </li>
  );
}

/** Seletor de quantidade [-] n [+] com alvos de 44px; o número pode ser digitado (confirma ao sair do campo). */
export function QtyStepper({ value, name, onChange, className }: { value: number; name: string; onChange: (quantity: number) => void; className?: string }) {
  const { t } = useMessages(cartMessages);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = parseInt(draft, 10);
    if (Number.isFinite(v) && v >= 1) { if (v !== value) onChange(v); }
    else setDraft(String(value));
  };
  const btn = "grid h-11 w-11 place-items-center rounded-full text-foreground transition-[background-color,transform] duration-150 hover:bg-brand-alt active:scale-90 disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div role="group" aria-label={t("quantityOf", { name })} className={cn("inline-flex items-center rounded-full border border-border bg-white", className)}>
      <button type="button" className={btn} aria-label={t("decrease", { name })} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Minus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={t("quantityOf", { name })}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        className="h-11 w-10 bg-transparent text-center text-[15px] font-semibold tabular-nums text-foreground outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button type="button" className={btn} aria-label={t("increase", { name })} onClick={() => onChange(value + 1)}>
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

type RemoveFn = (itemId: string, options?: { onSuccess?: () => void }) => void;
type ReaddFn = (params: { productId: string; quantity?: number; variationId?: string; sizeLabel?: string; designData?: any }) => Promise<unknown>;

/**
 * Remover com "Desfazer" no aviso. Visitante: a linha volta ao mesmo lugar do carrinho guardado no navegador;
 * com sessão: a linha é adicionada de novo com os mesmos dados. Itens com arquivos guardados neste dispositivo
 * (cartItemKey) não têm desfazer: `onHardRemove` limpa os arquivos e remove.
 */
export function CartLineRemove({ item, name, remove, readd, onHardRemove, variant = "icon", className }: {
  item: any;
  name: string;
  remove: RemoveFn;
  readd: ReaddFn;
  onHardRemove?: (item: any) => Promise<void> | void;
  variant?: "icon" | "button";
  className?: string;
}) {
  const { t } = useMessages(cartMessages);
  const [busy, setBusy] = useState(false);

  const undo = async (snapshot: { index: number; entry: any } | null) => {
    try {
      if (snapshot) {
        const raw = JSON.parse(localStorage.getItem("guest_cart") || "[]");
        const next = Array.isArray(raw) ? [...raw] : [];
        next.splice(Math.min(snapshot.index, next.length), 0, snapshot.entry);
        localStorage.setItem("guest_cart", JSON.stringify(next));
        window.dispatchEvent(new Event("guest_cart_updated"));
      } else {
        await readd({
          productId: String(item.product_id),
          quantity: Number(item.quantity) || 1,
          variationId: item.variation_id ?? undefined,
          sizeLabel: item.size_label ?? undefined,
          designData: item.design_data ?? undefined,
        });
      }
    } catch {
      toast.error(t("undoError"));
    }
  };

  const click = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (item?.design_data?.cartItemKey) {
        if (onHardRemove) await onHardRemove(item);
        else remove(item.id);
        return;
      }
      let snapshot: { index: number; entry: any } | null = null;
      if (String(item.id).startsWith("guest-")) {
        try {
          const raw = JSON.parse(localStorage.getItem("guest_cart") || "[]");
          const index = Number(item._guestIndex);
          if (Array.isArray(raw) && Number.isInteger(index) && raw[index]) snapshot = { index, entry: raw[index] };
        } catch { /* sem cópia, o desfazer volta a adicionar */ }
      }
      remove(item.id, {
        onSuccess: () => {
          // mesmo id do aviso de useCart: substitui-o em vez de mostrar dois avisos
          toast.success(t("removed", { name }), {
            id: "cart-item-removed",
            duration: 6000,
            action: { label: t("undo"), onClick: () => { void undo(snapshot); } },
          });
        },
      });
    } finally {
      setBusy(false);
    }
  };

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={click}
        disabled={busy}
        className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-4 text-[14px] font-semibold text-foreground transition-[border-color,color] duration-150 hover:border-destructive hover:text-destructive disabled:opacity-50", className)}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t("remove")}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      aria-label={t("removeItem", { name })}
      title={t("remove")}
      className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

/* ---------- gaveta ---------- */

const linkName = "line-clamp-2 text-[15px] font-semibold leading-snug text-foreground transition-colors duration-150 hover:text-brand-orange-text";
const btnPrimary = "group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[16px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const btnSecondary = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-[border-color,color,transform] duration-150 hover:border-primary hover:text-brand-orange-text active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const CartSheet = () => {
  const navigate = useNavigate();
  const hrefOn = useHrefOn();
  const { t } = useMessages(cartMessages);
  const { user } = useAuth();
  const { open, setOpen } = useCartDrawer();
  const { cartItems, isLoading, subtotal, vatTotal, verificationSubtotal, verificationVat, itemCount, updateQuantity, removeFromCart, addToCartAsync } = useCart(user?.id);
  const { appliedCoupon, calculateDiscount } = useCoupon();
  const { currentCurrency, convert } = useCurrency();
  const { labels: methodLabels } = usePrintMethods();
  const country = useCountry();

  void country; // showsTaxSeparately / withVat seguem o país atual
  const taxed = showsTaxSeparately();
  const money = (v: number) => formatPrice(convert(v), currentCurrency);
  const gross = (net: number) => (taxed ? withVat(net) : net);
  const discount = calculateDiscount(subtotal);
  const itemsShown = subtotal + (taxed ? vatTotal : 0) + verificationSubtotal + (taxed ? verificationVat : 0);
  const total = Math.max(0, subtotal + verificationSubtotal + verificationVat + vatTotal - discount);
  // Estoque de agora (só com a gaveta aberta): item esgotado ou com menos unidades trava o checkout.
  const cartStock = useCartStock(cartItems as any[], open);
  const blocked = cartItems.some((i: any) => i._invalidReason) || cartStock.hasProblems;
  const freeShipping = useFreeShippingGoal(subtotal).reached;

  const go = (path: string) => { setOpen(false); navigate(path); window.scrollTo(0, 0); };
  const checkout = () => go(user ? "/checkout" : "/auth?redirect=/checkout");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-0 border-l border-brand-card-border bg-background p-0 sm:max-w-[440px] [&>button:last-child]:hidden">
        <MotionConfig reducedMotion="user">
          <header className="flex items-center justify-between gap-3 border-b border-brand-card-border bg-white py-3 pl-5 pr-3">
            <div className="min-w-0">
              <SheetTitle className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-foreground">{t("title")}</SheetTitle>
              <SheetDescription className="mt-0.5 text-[13px] text-muted-foreground">
                {itemCount > 0 ? t(itemCount === 1 ? "count_one" : "count_other", { count: itemCount }) : t("sheetEmpty")}
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <button type="button" aria-label={t("close")} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground transition-colors duration-150 hover:bg-brand-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
              </button>
            </SheetClose>
          </header>

          {isLoading ? (
            <div className="flex-1 space-y-3 p-4" aria-busy="true" aria-label={t("loading")}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3 rounded-[18px] border border-brand-card-border bg-white p-3">
                  <div className="skeleton h-20 w-20 shrink-0 rounded-[14px]" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="skeleton h-4 w-3/4 rounded-md" />
                    <div className="skeleton h-3 w-1/2 rounded-md" />
                    <div className="skeleton mt-4 h-9 w-28 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : cartItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
              <div className="relative h-32 w-32 overflow-hidden rounded-[24px] border border-brand-card-border">
                <LayerArt Icon={ShoppingBag} />
              </div>
              <div>
                <h3 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">{t("emptyTitle")}</h3>
                <p className="mt-1.5 text-[15px] text-muted-foreground">{t("sheetEmptyText")}</p>
              </div>
              <div className="grid w-full max-w-[280px] gap-2">
                <button type="button" className={btnPrimary} onClick={() => go("/produtos")}>{t("emptyProducts")}</button>
                {hrefOn("/personalizar") && <button type="button" className={btnSecondary} onClick={() => go("/personalizar")}>{t("emptyCustomize")}</button>}
              </div>
            </div>
          ) : (
            <>
              <CartPromoMeta subtotal={subtotal} variant="inline" />
              <CartReservationTimer notice={cartStock.reservation.notice} expiresAt={cartStock.expiresAt} expired={cartStock.expired} compact className="mx-4 mt-3" />

              {/* o Radix envolve o conteúdo num display:table que cresce com nomes longos; block mantém os cartões na largura da gaveta */}
              <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
                <ul className="space-y-3 p-4" aria-label={t("itemsLabel")}>
                  <AnimatePresence initial={false}>
                    {cartItems.map((item: any, index: number) => {
                      const lineStock = cartStock.lines[index];
                      const name: string = item.products?.name || item.design_data?.name || t("productFallback");
                      const href = `/produto/${item.design_data?.productSlug || item.product_id}`;
                      const unit = Number(item._pricing?.unitPrice ?? item.products?.price ?? 0);
                      const line = Number(item._pricing?.lineTotal ?? unit * item.quantity);
                      const areas = Object.values(item.design_data?.customization?.areas || {}) as Array<{ areaLabel?: string; technique?: string }>;
                      return (
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -16 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="flex gap-3 rounded-[18px] border border-brand-card-border bg-white p-3"
                        >
                          <Link to={href} onClick={() => setOpen(false)} tabIndex={-1} aria-hidden="true">
                            <CartLineThumb item={item} className="h-20 w-20" />
                          </Link>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex items-start justify-between gap-1">
                              <Link to={href} onClick={() => setOpen(false)} className={cn(linkName, "pt-0.5")}>{name}</Link>
                              <CartLineRemove item={item} name={name} remove={removeFromCart} readd={addToCartAsync} className="-mr-1.5 -mt-1.5" />
                            </div>
                            <CartLineOptions item={item} className="mt-1" />
                            {areas.length > 0 && (
                              <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                                {areas.map((a, i) => [a.areaLabel || t("customArea", { n: i + 1 }), a.technique && (methodLabels[a.technique] ?? a.technique)].filter(Boolean).join(", ")).join(" / ")}
                              </p>
                            )}
                            {item._invalidReason && <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">{t("sheetFileMissing")}</p>}
                            {!item._invalidReason && lineStock && lineStock.state !== "ok" && (
                              <p role="status" className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[12px] font-semibold text-amber-900">
                                {lineStock.state === "out" ? t("stockOutTitle") : t(lineStock.max === 1 ? "stockShortTitle_one" : "stockShortTitle_other", { count: lineStock.max ?? 0 })}
                              </p>
                            )}
                            <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                              {item.design_data?.quote ? <QuoteLineQty qty={item.quantity} /> : <QtyStepper value={item.quantity} name={name} onChange={(quantity) => updateQuantity({ itemId: item.id, quantity })} />}
                              <p className="text-right leading-tight">
                                <span className="block text-[16px] font-bold tabular-nums text-foreground">{money(gross(line))}</span>
                                {item.quantity > 1 && <span className="text-[12px] tabular-nums text-muted-foreground">{t("each", { price: money(gross(unit)) })}</span>}
                              </p>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
                <CartKitHints items={cartItems as any[]} place="side" onNavigate={() => setOpen(false)} />
                <CartSheetCrossSell
                  cartIds={Array.from(new Set<string>(cartItems.map((i: any) => String(i.product_id)))).sort()}
                  onNavigate={() => setOpen(false)}
                  add={addToCartAsync as any}
                />
              </ScrollArea>

              <footer className="space-y-4 border-t border-brand-card-border bg-white px-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] pt-4">
                <dl className="space-y-2 text-[15px]">
                  <div className="flex justify-between gap-4 text-brand-ink-soft">
                    <dt>{t("subtotal")}</dt>
                    <dd className="tabular-nums">{money(itemsShown)}</dd>
                  </div>
                  {appliedCoupon && discount > 0 && (
                    <div className="flex justify-between gap-4 text-emerald-700">
                      <dt>{t("couponLine", { code: appliedCoupon.code })}</dt>
                      <dd className="tabular-nums">-{money(discount)}</dd>
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-4 pt-1">
                    <dt className="leading-tight">
                      <span className="block text-[16px] font-semibold text-foreground">{t("total")}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {freeShipping ? t("sheetNoteFree") : t("sheetNote")}
                        {taxed && <>. {t("taxIncluded", { amount: money(vatTotal + verificationVat) })}</>}
                      </span>
                    </dt>
                    <dd className="text-[24px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-foreground">{money(total)}</dd>
                  </div>
                </dl>
                <CartPriceHint amount={total} place="cart" className="-mt-1" />
                <div className="grid gap-2">
                  <button type="button" className={btnPrimary} onClick={checkout} disabled={blocked}>
                    <Lock className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                    {t("checkout")}
                    <ArrowRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => go("/carrinho")}>{t("viewCart")}</button>
                </div>
                {blocked && <p className="text-center text-[13px] text-amber-800">{cartStock.hasProblems ? t("stockBlocked") : t("checkoutBlocked")}</p>}
              </footer>
            </>
          )}
        </MotionConfig>
      </SheetContent>
    </Sheet>
  );
};

export default CartSheet;
