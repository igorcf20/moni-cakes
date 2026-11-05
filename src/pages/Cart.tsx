// Página do carrinho da PRINT3D (/carrinho): etapas da compra, itens em cartões brancos, resumo sticky no desktop,
// barra fixa com total e botão no celular, vazio com atalhos e recomendações em ProductCard3D.
// Preços e totais vêm de useCart (os mesmos que o checkout envia ao servidor, que recalcula tudo); o cupom é
// validado no servidor (useCoupon). Itens com arquivos de personalização guardados neste dispositivo
// (design_data.cartItemKey, pendingDesigns) continuam a ser verificados: sem arquivo, o item pede Refazer ou Remover.
import { STORE_DEFAULTS } from "@/config/store";
import FeatureLink from "@/components/FeatureLink";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, FileImage, Gift, FileText, Minus, Palette, Pencil, ShoppingBag, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CheckoutSteps from "@/components/CheckoutSteps";
import CartSummary from "@/components/CartSummary";
import { useCheckoutPage } from "@/hooks/useCheckoutPage";
import CartPromoMeta from "@/components/CartPromoMeta";
import { CartLineOptions, CartLineRemove, CartLineThumb, QtyStepper } from "@/components/CartSheet";
import { QuoteCartPrompt, QuoteLineBadge, QuoteLineQty } from "@/components/quotes/QuoteCartBits";
import { LayerArt } from "@/components/MediaImage";
import { ProductCard3D, ProductCardSkeleton, type CardProduct } from "@/components/product/ProductCard3D";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart, pruneOrphanGuestCart } from "@/hooks/useCart";
import { useCartStock } from "@/hooks/useCartStock";
import { usePreorders } from "@/hooks/usePreorders";
import { CartReservationTimer } from "@/components/cart/CartReservation";
import { useCoupon } from "@/hooks/useCoupon";
import { useCurrency } from "@/hooks/use-currency";
import { usePrintMethods } from "@/hooks/usePrintMethods";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useWishlist } from "@/hooks/useWishlist";
import { useFeature } from "@/hooks/useFeatures";
import { fetchCartSuggestionRows, useCrossSellSettings } from "@/hooks/useCrossSell";
import { DEFAULT_CROSS_SELL } from "@/lib/crossSell";
import { useMessages } from "@/i18n";
import { cartMessages } from "@/i18n/cart";
import { completeKits } from "@/lib/kitPricing";
import { CartKitHints } from "@/components/cart/CartKitHints";
import { useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { getPending, delPending } from "@/utils/pendingDesigns";
import { showsTaxSeparately, withVat } from "@/utils/pricing";
import { getProductPromo } from "@/utils/promo";
import { useMyGroupPricing } from "@/hooks/useCustomerGroups";
import { groupDisplayName } from "@/lib/customerGroups";
import { customerGroupsMessages } from "@/i18n/customerGroups";
import { usePunchoutSend, usePunchoutSession } from "@/hooks/usePunchout";
import { punchoutMessages } from "@/i18n/punchout";

const btnPrimary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const btnSecondary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-foreground/20 bg-white px-5 text-[15px] font-medium text-foreground transition-[border-color,color,transform] duration-150 hover:border-foreground/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
// Título da página com serifa em tamanho contido (a marca pede serifa só nos títulos, sem letras gigantes).
const h1 = "text-[30px] leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[36px] lg:text-[40px]";

type Area = { areaId?: string; areaLabel?: string; fileDataUrl?: string; fileName?: string; fileType?: string; technique?: string; notes?: string };

/** Áreas personalizadas do item (arquivo enviado, método e observações). */
function CustomizationSummary({ areas, labels }: { areas: Area[]; labels: Record<string, string> }) {
  const { t } = useMessages(cartMessages);
  if (!areas.length) return null;
  return (
    <div className="mt-4 rounded-[14px] bg-brand-alt p-3">
      <p className="text-[13px] font-semibold text-foreground">{t("customFiles")}</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {areas.map((a, i) => {
          const label = a.areaLabel || t("customArea", { n: i + 1 });
          const isImage = !!a.fileDataUrl && a.fileType !== "application/pdf";
          const FileIcon = a.fileType === "application/pdf" ? FileText : FileImage;
          return (
            <li key={a.areaId || `${label}-${i}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-brand-card-border bg-white p-2">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-background">
                {isImage
                  ? <img src={a.fileDataUrl} alt={t("customFileAlt", { area: label })} className="h-full w-full object-contain" />
                  : <FileIcon className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />}
              </span>
              <span className="min-w-0 leading-snug">
                <span className="block truncate text-[13px] font-semibold text-foreground">{label}</span>
                {a.fileName && <span className="block truncate text-[12px] text-muted-foreground">{a.fileName}</span>}
                {a.technique && <span className="block truncate text-[12px] text-muted-foreground">{t("customMethod", { name: labels[a.technique] ?? a.technique })}</span>}
                {a.notes && <span className="block line-clamp-2 text-[12px] text-muted-foreground">{t("customNotes", { text: a.notes })}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Esqueleto enquanto o carrinho carrega. */
function CartSkeleton() {
  const { t } = useMessages(cartMessages);
  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_400px]" aria-busy="true" aria-label={t("loading")}>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4 rounded-[18px] bg-white p-4 sm:p-5">
            <div className="skeleton h-24 w-24 shrink-0 rounded-[14px] sm:h-28 sm:w-28" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="skeleton h-5 w-2/3 rounded-md" />
              <div className="skeleton h-4 w-1/3 rounded-md" />
              <div className="flex items-center justify-between pt-4">
                <div className="skeleton h-11 w-32 rounded-[14px]" />
                <div className="skeleton h-6 w-20 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-[18px] bg-white p-6">
        <div className="skeleton h-6 w-1/2 rounded-md" />
        <div className="skeleton h-12 w-full rounded-[14px]" />
        <div className="skeleton h-4 w-full rounded-md" />
        <div className="skeleton h-4 w-5/6 rounded-md" />
        <div className="skeleton h-[52px] w-full rounded-[14px]" />
      </div>
    </div>
  );
}

/** Carrinho vazio: ilustração de camadas e atalhos para comprar, personalizar ou enviar um arquivo. */
function EmptyCart() {
  const { t } = useMessages(cartMessages);
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-8 overflow-hidden rounded-[18px] bg-white shadow-[var(--shadow-card)]"
      aria-labelledby="cart-empty-title"
    >
      <div className="grid items-center gap-8 p-6 sm:p-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
        <div className="relative mx-auto aspect-square w-full max-w-[200px] overflow-hidden rounded-[20px] sm:max-w-[280px]">
          <LayerArt Icon={ShoppingBag} size="lg" />
        </div>
        <div className="text-center md:text-left">
          <h2 id="cart-empty-title" className="text-[24px] leading-tight tracking-[-0.02em] text-foreground sm:text-[28px]">{t("emptyTitle")}</h2>
          <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-brand-ink-soft md:mx-0">{t("emptyText")}</p>
          <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row sm:flex-wrap md:justify-start">
            <Link to="/produtos" className={btnPrimary}><ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />{t("emptyProducts")}</Link>
            <FeatureLink to="/personalizar" className={btnSecondary}><Palette className="h-[18px] w-[18px] text-brand-orange-text" strokeWidth={1.9} aria-hidden="true" />{t("emptyCustomize")}</FeatureLink>
            <FeatureLink to="/orcamento-3d" className={btnSecondary}><Upload className="h-[18px] w-[18px] text-brand-orange-text" strokeWidth={1.9} aria-hidden="true" />{t("emptyUpload")}</FeatureLink>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

const Cart = () => {
  const { t } = useMessages(cartMessages);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cartItems, isLoading, subtotal, vatTotal, verificationSubtotal, verificationVat, itemCount, updateQuantity, removeFromCart, addToCartAsync } = useCart(user?.id);
  // Kits completos no carrinho (mesma regra do useCart e do servidor): só eles têm o desconto do kit.
  const kitsOn = useFeature("kits");
  const kitsComplete = completeKits((cartItems as any[]).map((i) => ({ product_id: String(i.product_id), quantity: Number(i.quantity) || 0, kit: i.design_data?.kit })));
  const { appliedCoupon, calculateDiscount, removeCoupon, validateCoupon, isValidating } = useCoupon();
  const { currentCurrency, convert } = useCurrency();
  const { isInWishlist, toggleWishlist } = useWishlist(user?.id);
  const { labels: methodLabels } = usePrintMethods();
  const { data: info } = useStoreInfo();
  const country = useCountry();
  // PunchOut (recurso punchout): o carrinho volta ao sistema de compras da empresa em vez de seguir para o checkout.
  const punchout = usePunchoutSession();
  const punchoutSend = usePunchoutSend(punchout);
  const { t: tp } = useMessages(punchoutMessages);
  const store = info?.name || STORE_DEFAULTS.name;

  const [missingOriginalsItem, setMissingOriginalsItem] = useState<{ id: string; key: string } | null>(null);
  // Itens cujo arquivo de personalização (IndexedDB) não está neste dispositivo, embora a linha exista:
  // mostram o bloco "Refazer / Remover" em vez de entrarem no pedido.
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());

  // Ao abrir (e sempre que a lista muda), limpa entradas sem arquivo e verifica os arquivos dos itens personalizados.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const removed = await pruneOrphanGuestCart();
      if (removed.length > 0) {
        toast.info(t(removed.length === 1 ? "pruned_one" : "pruned_other", { count: removed.length }));
      }
      const probes = await Promise.all(
        (cartItems as any[])
          .filter((it) => it?.design_data?.cartItemKey)
          .map(async (it) => {
            const p = await getPending(it.design_data.cartItemKey);
            const ok =
              !!p &&
              Array.isArray(p.planos) &&
              p.planos.length > 0 &&
              p.planos.every((pl) => pl.png && (pl.png as Blob).size > 0);
            return { id: it.id, ok };
          }),
      );
      if (cancelled) return;
      setOrphanIds(new Set(probes.filter((p) => !p.ok).map((p) => p.id)));
    })();
    return () => { cancelled = true; };
    // Volta a correr quando a lista de itens muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.map((i: any) => i.id).join(",")]);

  // Limpeza (melhor esforço) da cópia de edição guardada no IndexedDB para o item.
  const deleteEditDraft = async (key: string) => {
    try {
      const req = indexedDB.open("bom-dtf-configurator-drafts", 1);
      await new Promise<void>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("drafts")) { db.close(); return resolve(); }
          const tx = db.transaction("drafts", "readwrite");
          tx.objectStore("drafts").delete(`dtf-edit:${key}`);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); resolve(); };
        };
        req.onerror = () => resolve();
        req.onupgradeneeded = () => { /* nada para apagar */ };
      });
    } catch { /* ignorar */ }
  };

  /** Remove um item com arquivos guardados neste dispositivo (sem desfazer: os arquivos são apagados). */
  const handleRemoveItem = async (item: any) => {
    const key = item?.design_data?.cartItemKey;
    if (key) {
      await delPending(key);
      await deleteEditDraft(key);
    }
    removeFromCart(item.id);
  };

  const handleEditDesign = async (item: any) => {
    const design = item?.design_data || {};
    const key = design.cartItemKey;
    const productSlug = design.productSlug || item.product_id;
    if (!key || !productSlug) return;
    const pending = await getPending(key);
    if (!pending) {
      setMissingOriginalsItem({ id: item.id, key });
      return;
    }
    navigate(`/produto/${productSlug}`);
  };

  const discount = useMemo(() => calculateDiscount(subtotal), [calculateDiscount, subtotal]);
  const isInvalid = (item: any) => !!item?._invalidReason || orphanIds.has(item?.id);
  // Estoque de agora: item que esgotou (ou tem menos unidades) depois de entrar no carrinho trava o checkout.
  const cartStock = useCartStock(cartItems as any[], !isLoading);
  const preorders = usePreorders();
  // Admin > Carrinho e checkout: no celular, quantidade e subtotal ao lado da foto (linhas mais baixas).
  const checkoutPage = useCheckoutPage();
  const compactLines = checkoutPage.cart_lines === "compact";
  const shortIntro = checkoutPage.intro === "short";
  const stockAlertsOn = useFeature("stock_alerts");
  const blocked = cartItems.some(isInvalid) || cartStock.hasProblems;
  const blockedHint = cartStock.hasProblems ? t("stockBlocked") : t("checkoutBlocked");

  void country; // showsTaxSeparately / withVat seguem o país atual: recalcula quando o cliente troca de país
  const taxed = showsTaxSeparately();
  const money = (v: number) => formatPrice(convert(v), currentCurrency);
  const gross = (net: number) => (taxed ? withVat(net) : net);

  // Recomendações: "Combina com" dos produtos do carrinho (recurso cross_sell, Admin > Venda cruzada), completadas
  // com destaques conforme as regras; com o recurso desligado, só os destaques.
  const crossSellOn = useFeature("cross_sell");
  const { data: crossSettings } = useCrossSellSettings();
  const cartProductIds = Array.from(new Set<string>(cartItems.map((i: any) => String(i.product_id)))).sort();
  // Grupo do cliente (Admin > Grupos de clientes): a etiqueta "Preço <grupo>" nas linhas com o preço do grupo.
  const { t: tg, locale } = useMessages(customerGroupsMessages);
  const { data: groupPricing } = useMyGroupPricing(user ? cartProductIds : []);
  const groupName = groupDisplayName(groupPricing?.group ?? null, locale);
  const suggestions = useQuery({
    queryKey: ["cart-suggestions", cartProductIds.join(","), crossSellOn, crossSettings],
    enabled: !isLoading && (!crossSellOn || !!crossSettings),
    retry: 1,
    queryFn: async () => {
      const sb = supabase as any;
      // Carrinho vazio mostra sempre os destaques.
      const rules = crossSellOn && crossSettings && cartProductIds.length ? crossSettings : { ...DEFAULT_CROSS_SELL, fillWithFeatured: true };
      const rows: any[] = await fetchCartSuggestionRows(crossSellOn ? cartProductIds : [], rules, crossSellOn ? rules.cartLimit : 4);
      if (!rows.length) return [];
      // Produtos com cores, tamanhos ou personalização vão para a página do produto para escolher as opções.
      const ids = rows.map((r) => r.id);
      const [vars, sizes] = await Promise.all([
        sb.from("product_variations").select("product_id").in("product_id", ids).eq("is_active", true),
        sb.from("product_sizes").select("product_id").in("product_id", ids).eq("is_active", true),
      ]);
      const unknown = !!(vars.error || sizes.error);
      const withOptions = new Set<string>([...(vars.data ?? []), ...(sizes.data ?? [])].map((r: any) => String(r.product_id)));
      return rows.map((r) => ({ row: r, options: unknown || !!r.customizable || withOptions.has(String(r.id)) }));
    },
  });

  const suggestionCards = useMemo(() => {
    void country;
    const fmt = (net: number, vat: number) => formatPrice(convert(withVat(net, vat)), currentCurrency);
    return (suggestions.data ?? []).map(({ row, options }) => {
      const promo = getProductPromo(row);
      const base = Number(row.price || 0);
      const effective = promo?.isActive ? promo.effectivePrice : base;
      const extra: string[] = Array.isArray(row.images) ? row.images.filter((x: unknown) => typeof x === "string" && x !== row.image) : [];
      const card: CardProduct = {
        id: row.id,
        name: row.name,
        image: row.image ?? extra[0] ?? null,
        image2: row.image ? extra[0] ?? null : extra[1] ?? null,
        price: fmt(effective, row.vat_rate),
        amount: withVat(effective, row.vat_rate),
        oldPrice: promo?.isActive ? fmt(base, row.vat_rate) : null,
        discountPct: promo?.isActive ? Math.round(promo.discountPct) : 0,
        vatRate: row.vat_rate,
        isNew: !!row.is_new,
        needsOptions: options,
      };
      return { row, options, effective, card };
    });
  }, [suggestions.data, convert, currentCurrency, country]);

  const onFavorite = (id: string) => (user ? toggleWishlist(id) : navigate(`/auth?redirect=${encodeURIComponent("/carrinho")}`));
  const onAddSuggestion = async (p: CardProduct) => {
    const item = suggestionCards.find((s) => s.card.id === p.id);
    if (!item) return;
    if (item.options) { navigate(`/produto/${item.row.slug || item.row.id}`); return; }
    const rawBase = Number(item.row.price || 0);
    await addToCartAsync({
      productId: item.row.id,
      quantity: 1,
      designData: {
        name: item.row.name,
        image: item.row.image || "",
        weight: Number(item.row.weight) || 0.5,
        price: item.effective,
        selectionPricing: { version: 1, basePrice: item.effective, modifier: 0, tierRatio: rawBase > 0 ? item.effective / rawBase : 1 },
      },
    });
  };

  const handleCheckout = () => {
    if (blocked) {
      toast.error(blockedHint);
      return;
    }
    navigate(user ? "/checkout" : "/auth?redirect=/checkout");
  };

  const hasItems = !isLoading && cartItems.length > 0;
  const summaryProps = {
    itemCount,
    subtotal,
    verificationNet: verificationSubtotal,
    verificationVat,
    vat: vatTotal,
    discount,
    coupon: appliedCoupon,
    isValidating,
    onApplyCoupon: async (code: string) => { await validateCoupon(code, subtotal); },
    onRemoveCoupon: () => removeCoupon(),
    ctaDisabled: blocked,
    ctaHint: blocked ? blockedHint : !user ? t("checkoutGuestHint") : undefined,
    onCheckout: handleCheckout,
    ...(punchout ? {
      ctaLabel: punchoutSend.busy === "send" ? tp("cart_sending") : tp("cart_send"),
      ctaShortLabel: punchoutSend.busy === "send" ? tp("cart_sending") : tp("cart_send_short"),
      ctaDisabled: blocked || punchout.operation === "inspect" || !!punchoutSend.busy,
      ctaHint: blocked ? blockedHint : tp(punchout.operation === "inspect" ? "cart_inspect_hint" : "cart_hint"),
      onCheckout: () => void punchoutSend.send(),
      hideCoupon: true,
    } : {}),
  };

  const suggestionsSection = (suggestions.isLoading || suggestionCards.length > 0) && !isLoading && (
    <section className="shell pb-14 md:pb-20" aria-labelledby="cart-suggest-title">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 id="cart-suggest-title" className="text-[24px] leading-tight tracking-[-0.02em] text-foreground sm:text-[28px]">
            {hasItems ? t("suggestTitle") : t("suggestEmptyTitle")}
          </h2>
          {hasItems && <p className="mt-1.5 text-[15px] text-muted-foreground">{t("suggestText")}</p>}
        </div>
        <Link to="/produtos" className="group -mr-3 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-[15px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent">
          {t("seeAll")}<ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {suggestions.isLoading
          ? [0, 1, 2, 3].map((i) => <li key={i}><ProductCardSkeleton /></li>)
          : suggestionCards.map((s) => (
            <li key={s.card.id}>
              <ProductCard3D p={s.card} favorite={isInWishlist(s.card.id)} onFavorite={onFavorite} onAdd={onAddSuggestion} />
            </li>
          ))}
      </ul>
    </section>
  );

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{hasItems ? t("metaTitle", { count: itemCount, store }) : t("metaTitleEmpty", { store })}</title>
        <meta name="description" content={t("metaDescription")} />
        <meta name="robots" content="noindex, follow" />
      </Helmet>

      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          <div className="shell pb-12 pt-6 md:pb-16 md:pt-8">
            <CheckoutSteps current={1} />

            <header className="mt-6 md:mt-8">
              <h1 className={h1}>
                {t("title")}{" "}
                {hasItems && (
                  <span className="ml-1 align-middle text-[18px] font-semibold tracking-normal text-muted-foreground sm:text-[20px]">
                    {t(itemCount === 1 ? "count_one" : "count_other", { count: itemCount })}
                  </span>
                )}
              </h1>
              {hasItems && <p className={cn("mt-2 text-[16px] text-brand-ink-soft", shortIntro && "max-sm:hidden")}>{t("lead")}</p>}
            </header>

            {isLoading ? (
              <CartSkeleton />
            ) : !hasItems ? (
              <EmptyCart />
            ) : (
              <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_400px]">
                <section aria-label={t("itemsLabel")} className="min-w-0 space-y-3">
                  {!punchout && <CartPromoMeta subtotal={subtotal} />}
                  <CartReservationTimer notice={cartStock.reservation.notice} expiresAt={cartStock.expiresAt} expired={cartStock.expired} />

                  {/* Itens num só painel, separados por linhas finas (como na direção editorial). */}
                  <ul className="divide-y divide-border overflow-hidden rounded-[6px] bg-white px-4 sm:px-6">
                    <AnimatePresence initial={false}>
                      {cartItems.map((item: any, index: number) => {
                        const design = item.design_data || {};
                        const name: string = item.products?.name || design.name || t("productFallback");
                        const href = `/produto/${design.productSlug || item.product_id}`;
                        const pricing = item._pricing || {};
                        const basePrice = Number(item.products?.price || 0);
                        const unitPrice = Number(pricing.unitPrice ?? basePrice);
                        const lineTotal = Number(pricing.lineTotal ?? unitPrice * item.quantity);
                        // escalão abaixo do preço base já com a promoção: só aí é desconto por quantidade (e não só a promoção)
                        const tier = !!pricing.appliedTier && Number(pricing.appliedTier.unitPrice) < Number(pricing.basePrice ?? basePrice);
                        const stock = Number(item.products?.stock_quantity ?? 0);
                        const lowStock = !design.customization && !preorders.has(String(item.product_id)) && stock > 0 && stock <= 5;
                        const invalid = isInvalid(item);
                        // só as linhas com _invalidReason ficam fora dos totais (useCart); as outras continuam a contar
                        const excluded = !!item._invalidReason;
                        const areas = Object.values(design.customization?.areas || {}) as Area[];
                        const lineStock = cartStock.lines[index];
                        const stockIssue = !invalid && !!lineStock && lineStock.state !== "ok";
                        return (
                          <motion.li
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className={cn(
                              "py-5 sm:py-6",
                              (invalid || stockIssue) && "-mx-4 border-l-2 border-l-amber-400 bg-amber-50/40 px-4 sm:-mx-6 sm:px-6",
                            )}
                          >
                            {invalid && (
                              <div className="mb-4 flex flex-col gap-3 rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-amber-900 sm:flex-row sm:items-center">
                                <AlertTriangle className="hidden h-5 w-5 shrink-0 sm:block" strokeWidth={1.9} aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[14px] font-semibold">{t("invalidTitle")}</p>
                                  <p className="mt-0.5 text-[13px] opacity-90">{t("invalidText")}</p>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                  {design.cartItemKey && (
                                    <button type="button" onClick={() => handleEditDesign(item)} className={cn(btnSecondary, "min-h-11 px-4 text-[14px]")}>
                                      <Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t("redo")}
                                    </button>
                                  )}
                                  <CartLineRemove item={item} name={name} variant="button" remove={removeFromCart} readd={addToCartAsync} onHardRemove={handleRemoveItem} />
                                </div>
                              </div>
                            )}

                            {stockIssue && (
                              <div role="status" className="mb-4 flex flex-col gap-3 rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-amber-900 sm:flex-row sm:items-center">
                                <AlertTriangle className="hidden h-5 w-5 shrink-0 sm:block" strokeWidth={1.9} aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[14px] font-semibold">
                                    {lineStock.state === "out" ? t("stockOutTitle") : t(lineStock.max === 1 ? "stockShortTitle_one" : "stockShortTitle_other", { count: lineStock.max ?? 0 })}
                                  </p>
                                  <p className="mt-0.5 text-[13px] opacity-90">
                                    {lineStock.state === "out" ? t("stockOutText") : t("stockShortText", { qty: item.quantity })}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  {lineStock.state === "short" && !design.quote && (
                                    <button type="button" onClick={() => updateQuantity({ itemId: item.id, quantity: lineStock.max ?? 1 })} className={cn(btnSecondary, "min-h-11 px-4 text-[14px]")}>
                                      <Minus className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t("stockFix", { count: lineStock.max ?? 1 })}
                                    </button>
                                  )}
                                  {lineStock.state === "out" && stockAlertsOn && (
                                    <Link to={href} className={cn(btnSecondary, "min-h-11 px-4 text-[14px]")}>
                                      <Bell className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t("stockNotify")}
                                    </Link>
                                  )}
                                  <CartLineRemove item={item} name={name} variant="button" remove={removeFromCart} readd={addToCartAsync} onHardRemove={handleRemoveItem} />
                                </div>
                              </div>
                            )}

                            <div className={cn("grid gap-x-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-y-3", compactLines ? "grid-cols-[76px_minmax(0,1fr)] gap-y-3" : "grid-cols-[88px_minmax(0,1fr)] gap-y-4")}>
                              <Link to={href} tabIndex={-1} aria-hidden="true" className={cn("block sm:row-span-2", compactLines && "row-span-2")}>
                                <CartLineThumb item={item} className={cn("sm:h-28 sm:w-28", compactLines ? "h-[76px] w-[76px]" : "h-[88px] w-[88px]")} />
                              </Link>
                              <div className="min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <Link to={href} className="line-clamp-2 text-[16px] font-semibold leading-snug text-foreground transition-colors duration-150 hover:text-brand-orange-text sm:text-[17px]">
                                      {name}
                                    </Link>
                                    <CartLineOptions item={item} className="mt-1.5" />
                                    {kitsOn && design.kit?.id && (
                                      <p className={cn("mt-1.5 inline-flex items-start gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium",
                                        kitsComplete.has(String(design.kit.id)) ? "bg-brand-orange-soft text-brand-orange-text" : "bg-amber-50 text-amber-900")}>
                                        <Gift className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                                        {kitsComplete.has(String(design.kit.id))
                                          ? t("kitOn", { name: design.kit.name, pct: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(Number(design.kit.pct) || 0) })
                                          : t("kitMissing", { name: design.kit.name })}
                                      </p>
                                    )}
                                  </div>
                                  {!invalid && !stockIssue && (
                                    <CartLineRemove item={item} name={name} remove={removeFromCart} readd={addToCartAsync} onHardRemove={handleRemoveItem} className="-mr-2 -mt-2" />
                                  )}
                                </div>

                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                                  <span className="tabular-nums text-muted-foreground">
                                    <span className="sr-only">{t("unitPrice")}: </span>
                                    {t("each", { price: money(gross(unitPrice)) })}
                                  </span>
                                  {design.quote && <QuoteLineBadge />}
                                  {pricing.promoActive && <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">{t("promo")}</span>}
                                  {tier && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-brand-orange-text">{t("tierApplied")}</span>}
                                  {pricing.groupPrice && groupName && <span className="rounded-md bg-brand-orange-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-orange-text">{tg("store_price", { group: groupName })}</span>}
                                  {lowStock && !stockIssue && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">{t(stock === 1 ? "stockLow_one" : "stockLow_other", { count: stock })}</span>}
                                </div>
                              </div>

                              <div className={cn("flex items-end justify-between gap-3 sm:col-span-1 sm:col-start-2 sm:self-end", compactLines ? "col-start-2 flex-wrap gap-y-2" : "col-span-2")}>
                                {design.quote ? <QuoteLineQty qty={item.quantity} /> : <QtyStepper value={item.quantity} name={name} onChange={(quantity) => updateQuantity({ itemId: item.id, quantity })} />}
                                <p className="text-right leading-tight">
                                  <span className={cn("block text-[12px] text-muted-foreground", compactLines && "max-sm:sr-only")}>{t("lineSubtotal")}</span>
                                  <span className={cn("block text-[18px] font-bold tabular-nums", excluded ? "text-muted-foreground line-through" : "text-foreground")}>
                                    {money(gross(lineTotal))}
                                  </span>
                                </p>
                              </div>
                            </div>

                            <CustomizationSummary areas={areas} labels={methodLabels} />
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>

                  {!punchout && <CartKitHints items={cartItems as any[]} />}

                  <Link to="/produtos" className="group inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-[15px] font-semibold text-brand-orange-text transition-colors duration-150 hover:text-foreground">
                    <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" strokeWidth={2} aria-hidden="true" />
                    {t("continueShopping")}
                  </Link>
                </section>

                <aside className="min-w-0 lg:sticky lg:top-[100px]">
                  <CartSummary {...summaryProps} continueHref={null} />
                  <QuoteCartPrompt hasItems={cartItems.some((i: any) => !i.design_data?.customization && !i.design_data?.quote)} />
                </aside>
              </div>
            )}
          </div>

          {suggestionsSection}
        </main>
        <Footer />
        {/* espaço para a barra fixa do total (celular e tablet) */}
        {hasItems && <div className="h-[76px] lg:hidden" aria-hidden="true" />}
      </div>

      {hasItems && <CartSummary {...summaryProps} variant="bar" />}

      <AlertDialog open={!!missingOriginalsItem} onOpenChange={(o) => { if (!o) setMissingOriginalsItem(null); }}>
        <AlertDialogContent className="rounded-[20px] border-brand-card-border bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[20px] font-bold tracking-[-0.02em]">{t("missingTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[15px] leading-relaxed text-brand-ink-soft">{t("missingText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-11 rounded-[14px]">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover"
              onClick={async () => {
                const target = missingOriginalsItem;
                setMissingOriginalsItem(null);
                if (!target) return;
                const item = cartItems.find((i: any) => i.id === target.id);
                if (item) {
                  await handleRemoveItem(item);
                  const slug = (item as any)?.design_data?.productSlug || (item as any)?.product_id;
                  if (slug) navigate(`/produto/${slug}`);
                }
              }}
            >
              {t("removeAndRedo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MotionConfig>
  );
};

export default Cart;
