// Página do produto PRINT3D (/produto/:id, aceita slug ou id). Desktop: galeria 55% e compra 45% (sticky).
// Blocos e formato (quantidade ao lado do botão, favoritos e comparar, disponibilidade, compartilhar, garantias, seções ou
// abas, barras de compra) seguem Admin > Aparência da loja > Página do produto (store_settings.product_page).
// Compra: cor, tamanho e quantidade reais do produto; o carrinho recebe design_data com os nomes da cor e do
// tamanho e selectionPricing (contrato de useCart e do servidor, ver src/hooks/useProductPage.ts).
import { STORE_DEFAULTS } from "@/config/store";
import { useFeature } from "@/hooks/useFeatures";
import StockAlertForm from "@/components/product/StockAlertForm";
import { CompareToggle } from "@/components/compare/CompareToggle";
import { PreorderPanel } from "@/components/product/PreorderInfo";
import { usePreorder } from "@/hooks/usePreorders";
import { preordersMessages } from "@/i18n/preorders";
import { QuoteProductLink } from "@/components/quotes/QuoteCartBits";
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, MotionConfig } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, ArrowRight, Box, ChevronRight, Clock, FileDown, Heart, Info, Leaf, PackageSearch, Printer, RefreshCw, Repeat, RotateCcw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PromoCountdown from '@/components/PromoCountdown';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AddToCartButton, type AddState } from '@/components/product/AddToCartButton';
import { MobileBuyBar } from '@/components/product/MobileBuyBar';
import { ProductDetailsTabs, specRows, type DetailsTab } from '@/components/product/ProductDetailsTabs';
import { ProductGallery } from '@/components/product/ProductGallery';
import { ColorSwatches, QuantityStepper, SizeOptions, TierTable, type TierRow } from '@/components/product/ProductOptions';
import { RatingStars } from '@/components/product/RatingStars';
import { RelatedProducts3D } from '@/components/product/RelatedProducts3D';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/use-currency';
import { useProductRating } from '@/hooks/useProductRating';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useWishlist } from '@/hooks/useWishlist';
import {
  buildDesignData, colorOptionsFor, galleryFor, isSoldOut, withMedia, mainMaterial, modifierFor, priceFor, productionTime, sizeOptionsAcross,
  sizeOptionsFor, useProductPage, type PdpOptions, type PdpProduct,
} from '@/hooks/useProductPage';
import { useMessages, type Locale } from '@/i18n';
import { productMessages } from '@/i18n/product';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import type { MenuCategory } from '@/lib/catalogMenu';
import { useCountry } from '@/lib/countries';
import { useDeliveryRules } from '@/hooks/useDeliveryDates';
import { deliveryDatesMessages, leadText } from '@/i18n/deliveryDates';
import { estimateDelivery, formatDay, leadTimeFor } from '@/lib/deliveryDates';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/utils/currency';
import { ProductCodesLine } from '@/components/product/ProductCodes';
import { ShippingEstimate } from '@/components/product/ShippingEstimate';
import { ProductQuestions } from '@/components/product/ProductQuestions';
import { useReturnSettings } from '@/hooks/useReturns';
import { InstallmentTable, PriceExtras, PriceMain, usePriceView } from '@/components/price/SmartPrice';
import { getVatRate, showsTaxSeparately, withVat } from '@/utils/pricing';
import { getProductPromo } from '@/utils/promo';
import { useLowestPrice } from '@/hooks/useProductCompliance';
import ProductPointsHint from '@/components/product/ProductPointsHint';
import GroupPriceHint from '@/components/product/GroupPriceHint';
import { SubscribeOption } from '@/components/product/SubscribeOption';
import { RentalPicker, type RentalChoice } from '@/components/product/RentalPicker';
import { DigitalNote } from '@/components/product/DigitalNote';
import { VendorLine } from '@/components/marketplace/VendorLine';
import { ProductKitOffer } from '@/components/product/ProductKitOffer';
import { useProductDigital } from '@/hooks/useDigitalProducts';
import { digitalMessages } from '@/i18n/digitalProducts';
import { useProductRental, useRentalRules } from '@/hooks/useRentals';
import { useMySubscriptions, useProductPlans, useSubscriptionRules } from '@/hooks/useSubscriptions';
import { everyText, subscriptionsMessages } from '@/i18n/subscriptions';
import { addDays as addDaysSub, renewalOpen } from '@/lib/subscriptions';
import { useBrands } from '@/hooks/useBrands';
import { catalogMessages } from '@/i18n/catalog';
import { pickVariant, variantRows } from '@/lib/variants';
import { useProductPageSettings } from '@/hooks/useOfferSettings';
import { DEFAULT_PRODUCT_PAGE, availabilityFor } from '@/lib/productPage';
import { productPageMessages } from '@/i18n/productPage';
import { AvailabilityLine, ProductTrust, ShareButton, type TrustRow } from '@/components/product/ProductTrust';

const btnPrimary = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]';
const btnSecondary = 'inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full border border-foreground/20 bg-white px-5 text-[15px] font-medium text-foreground transition-[border-color,color,transform] duration-150 hover:border-foreground/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const prose = 'prose prose-neutral max-w-none text-[16px] leading-relaxed prose-p:text-brand-ink-soft prose-li:text-brand-ink-soft prose-strong:text-foreground prose-a:font-semibold prose-a:text-brand-orange-text';

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const stripHtml = (s: string | null | undefined) => (s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/** JSON-LD dentro de <script>: "<" escapado para um "</script>" no nome ou na descrição não fechar o bloco. */
const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
/** og:locale no formato ll_CC. */
const OG_LOCALE: Record<Locale, string> = { 'pt-BR': 'pt_BR', 'pt-PT': 'pt_PT', en: 'en_US', es: 'es_ES' };

/** products.category é texto livre: liga ao slug de uma categoria do menu ou ao nome dela ou de uma sub em qualquer idioma. */
const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
function matchCategory(category: string | null | undefined, menu: MenuCategory[]): MenuCategory | null {
  if (!category) return null;
  const n = slugify(category);
  if (!n) return null;
  const same = (labels: string[]) => labels.some((l) => slugify(l) === n);
  return menu.find((c) => c.slug === n) ?? menu.find((c) => same(c.labels) || c.subs.some((s) => same(s.labels))) ?? null;
}

function PageShell({ children, buySpacer = false, desktopBar = false }: { children: ReactNode; buySpacer?: boolean; desktopBar?: boolean }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {/* espaço para a barra fixa de compra (celular e tablet) */}
        {buySpacer && <div className={cn('h-[72px]', desktopBar ? 'lg:h-[84px]' : 'lg:hidden')} aria-hidden="true" />}
      </div>
    </MotionConfig>
  );
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const page = useProductPage(id);
  const { data: pp = DEFAULT_PRODUCT_PAGE } = useProductPageSettings();

  if (page.isLoading) return <PageShell><ProductSkeleton /></PageShell>;
  if (page.isError) return <PageShell><ProductMessage kind="error" onRetry={() => void page.refetch()} /></PageShell>;
  if (!page.product) return <PageShell><ProductMessage kind="notFound" /></PageShell>;
  return (
    <PageShell buySpacer desktopBar={pp.desktop_bar}>
      <ProductView key={page.product.id} product={page.product} options={page.options} optionsLoading={page.optionsLoading} optionsError={page.optionsError} />
    </PageShell>
  );
};

function ProductView({ product, options, optionsLoading, optionsError }: {
  product: PdpProduct; options: PdpOptions; optionsLoading: boolean; optionsError: boolean;
}) {
  const { t, locale } = useMessages(productMessages);
  const { t: tc } = useMessages(catalogMessages);
  const { t: tp } = useMessages(productPageMessages);
  const { data: pp = DEFAULT_PRODUCT_PAGE } = useProductPageSettings();
  const menu = useCatalogMenu();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToCartAsync, cartItems, updateQuantity } = useCart(user?.id);
  const { isInWishlist, toggleWishlist } = useWishlist(user?.id);
  const wishlistOn = useFeature('wishlist');
  const variantsOn = useFeature('variants');
  // Marca do produto (Admin > Marcas, recurso brands): link para os produtos da marca e brand no JSON-LD.
  const brandsOn = useFeature('brands');
  const { data: brandList = [] } = useBrands(brandsOn && !!product.brand_id);
  const brand = brandsOn && product.brand_id ? brandList.find((b) => b.id === product.brand_id) ?? null : null;
  const { currentCurrency, convert } = useCurrency();
  const country = useCountry(); // impostos e moeda seguem o país: volta a desenhar quando o cliente troca de país
  const returnsOn = useFeature('returns');
  const { data: returnSettings } = useReturnSettings();
  // Prazos e entrega (recurso delivery_dates): prazo do produto e até quando sai um pedido feito agora.
  const delivery = useDeliveryRules();
  const { t: tdd } = useMessages(deliveryDatesMessages);
  const { t: tsub } = useMessages(subscriptionsMessages);
  const { data: storeInfo } = useStoreInfo();
  const rating = useProductRating(product.id);

  // ?cor=<id da cor>&tamanho=<id do tamanho> (links do feed de produtos): a variante já vem escolhida.
  const [colorKey, setColorKey] = useState<string | null>(() => { const v = new URLSearchParams(location.search).get('cor'); return v ? `v:${v}` : null; });
  const [sizeId, setSizeId] = useState<string | null>(() => new URLSearchParams(location.search).get('tamanho') || null);
  const [quantity, setQuantity] = useState(1);
  const [addState, setAddState] = useState<AddState>('idle');
  const [tab, setTab] = useState<DetailsTab>(() => (location.hash === '#avaliacoes' ? 'reviews' : 'description'));
  const [ctaInView, setCtaInView] = useState(true);
  const ctaRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);

  // Personalizáveis não baixam stock no servidor (trigger de stock): só os outros respeitam as quantidades.
  // Produto digital sem entrega física (recurso digital_products): só arquivos, nunca esgota.
  const digital = useProductDigital(product.id);
  const { t: tdig } = useMessages(digitalMessages);
  // Pré-venda (recurso preorders): vende-se antes de haver estoque; só o limite de unidades da pré-venda conta.
  const preorder = usePreorder(product.id);
  const { t: tpre } = useMessages(preordersMessages);
  const stockControlled = !product.customizable && !(digital && !digital.ships) && !preorder;
  // Sem as opções (a carregar ou com erro) não se sabe o stock real: nada de "Esgotado" nem de limites de quantidade.
  const optionsReady = !optionsLoading && !optionsError;
  const colors = useMemo(() => colorOptionsFor(options, stockControlled, variantsOn, product.stock_quantity ?? null), [options, stockControlled, variantsOn, product.stock_quantity]);
  const color = colors.find((c) => c.key === colorKey && !c.soldOut) ?? null;
  // Antes da cor, os tamanhos juntam a matriz de todas as cores; depois, só a da cor escolhida.
  const sizes = useMemo(
    () => (color ? sizeOptionsFor(options.sizes, options.matrix, color.variationId, stockControlled)
      : sizeOptionsAcross(options.sizes, options.matrix, colors.map((c) => c.variationId), stockControlled)),
    [options.sizes, options.matrix, color, colors, stockControlled],
  );
  const size = sizes.find((s) => s.id === sizeId && s.purchasable) ?? null;
  const soldOut = useMemo(() => preorder?.remaining === 0 || (optionsReady && isSoldOut(product, options, colors, stockControlled)), [preorder?.remaining, optionsReady, product, options, colors, stockControlled]);

  // Uma única opção possível já vem escolhida; com várias, o cliente escolhe.
  useEffect(() => { if (colors.length === 1 && !colors[0].soldOut) setColorKey((k) => k ?? colors[0].key); }, [colors]);
  useEffect(() => { if (sizes.length === 1 && sizes[0].purchasable) setSizeId((s) => s ?? sizes[0].id); }, [sizes]);

  const needsColor = colors.length > 0 && !color;
  const needsSize = sizes.length > 0 && !size;
  const mod = useMemo(() => modifierFor(options, colors, color, size?.id ?? null, stockControlled), [options, colors, color, size?.id, stockControlled]);
  const modifier = mod.min;
  const isFrom = (needsColor || needsSize) && mod.varies;

  const maxQty = preorder?.remaining != null ? preorder.remaining
    : !stockControlled || !optionsReady ? 9999
    : options.sizes.length ? (size ? size.stock : 9999)
    : color?.stock != null ? color.stock
    : product.stock_quantity != null ? Math.max(0, product.stock_quantity) : 9999;
  const qty = Math.max(1, Math.min(quantity, Math.max(1, maxQty)));

  // Assinaturas (recurso subscriptions): plano escolhido ou renovação pela conta (?renovar=<id>), com a quantidade,
  // a cor e o tamanho da assinatura. O desconto só vai quando a renovação já está liberada (o servidor confere).
  const subRules = useSubscriptionRules();
  const plans = useProductPlans(product.id);
  const [planId, setPlanId] = useState<string | null>(null);
  const renewId = new URLSearchParams(location.search).get('renovar');
  const { data: mySubs = [] } = useMySubscriptions(!!renewId && subRules.on);
  const renewing = (renewId && mySubs.find((x) => x.id === renewId && x.product_id === product.id && x.status !== 'cancelled')) || null;
  const renewOk = !!renewing && renewalOpen(renewing, new Date().toISOString().slice(0, 10), subRules.settings);
  const chosenPlan = !renewing ? plans.find((p) => p.id === planId) ?? null : null;
  const subData = renewing && renewOk
    ? { subscription_id: renewing.id, pct: renewing.discount_percent, unit: renewing.interval_unit, count: renewing.interval_count }
    : chosenPlan ? { plan_id: chosenPlan.id, pct: chosenPlan.discount_percent, unit: chosenPlan.interval_unit, count: chosenPlan.interval_count } : null;
  const subKey = subData ? ('plan_id' in subData ? subData.plan_id : subData.subscription_id) : null;
  useEffect(() => {
    if (!renewing) return;
    setQuantity(renewing.quantity);
    const c = colors.find((x) => x.name === renewing.options?.variation);
    if (c) setColorKey(c.key);
  }, [renewing, colors]);
  useEffect(() => {
    if (!renewing?.options?.size) return;
    const z = sizes.find((x) => x.label === renewing.options.size);
    if (z) setSizeId(z.id);
  }, [renewing, sizes]);
  // Aluguel (recurso rentals): produto com aluguel ativo só vai para o carrinho com as datas (design_data.rental).
  const rental = useProductRental(product.id);
  const rentalRules = useRentalRules();
  const [rentStart, setRentStart] = useState('');
  const [rentEnd, setRentEnd] = useState('');
  const [rentalChoice, setRentalChoice] = useState<RentalChoice | null>(null);
  // Ao trocar para um tamanho com menos stock, a quantidade escolhida desce até ao máximo disponível.
  useEffect(() => { setQuantity((q) => Math.min(q, Math.max(1, maxQty))); }, [maxQty]);

  // A promoção começa ou acaba com a página aberta: volta a calcular o preço nesse momento (o carrinho grava o preço atual).
  const [promoTick, setPromoTick] = useState(0);
  useEffect(() => {
    const promo = getProductPromo(product);
    const at = promo?.isScheduled ? promo.startsAt : promo?.isActive ? promo.endsAt : null;
    if (!at) return;
    const delay = Math.min(Math.max(0, at.getTime() - Date.now()) + 250, 2_147_483_000);
    const id = window.setTimeout(() => setPromoTick((n) => n + 1), delay);
    return () => window.clearTimeout(id);
  }, [product, promoTick]);
  const price = useMemo(() => {
    void promoTick;
    return priceFor(product, options.tiers, qty, modifier);
  }, [product, options.tiers, qty, modifier, promoTick]);
  // Variante escolhida (recurso variants): foto própria da combinação e código mostrado ao cliente.
  const variant = useMemo(() => {
    if (!variantsOn) return null;
    const rows = variantRows(product, options.variations, options.sizes, options.matrix);
    return pickVariant(rows, color?.variationId ?? null, size?.id ?? null);
  }, [variantsOn, product, options.variations, options.sizes, options.matrix, color?.variationId, size?.id]);
  const variantImage = variant?.kind === 'combo'
    ? options.matrix.find((m) => m.variation_id === variant.variationId && m.product_size_id === variant.sizeId)?.image_url || null
    : null;
  const shownSku = variant?.sku ?? product.sku ?? null;
  const gallery = useMemo(() => galleryFor(product, options.images, color, variantImage), [product, options.images, color, variantImage]);
  // Na galeria entram também o modelo 3D e os vídeos; carrinho, SEO e partilha continuam só com fotos.
  const media = useMemo(() => withMedia(gallery, product), [gallery, product]);
  const category = useMemo(() => matchCategory(product.category, menu), [product.category, menu]);

  const fmt = (net: number) => formatPrice(convert(withVat(net, product.vat_rate)), currentCurrency);
  // Preço final de 1 unidade na moeda base (com imposto): base do preço à vista e das parcelas (Exibição de preços).
  const grossUnit = withVat(price.unit, product.vat_rate);
  const fmtMod = (m: number) => (m ? `${m > 0 ? '+' : '-'}${fmt(Math.abs(m))}` : null);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const avgText = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rating.average);
  // Percentagem real entre os dois preços mostrados (os acréscimos de cor e tamanho não têm desconto).
  const hasOldPrice = price.oldUnit != null && price.oldUnit > price.unit + 1e-9;
  const discountPct = hasOldPrice && price.oldUnit ? Math.round((1 - price.unit / price.oldUnit) * 100) : 0;
  const tierDiscount = !!price.tier && price.tier.unitPrice + 1e-9 < price.basePrice;
  // Promoção: menor preço dos 30 dias antes da redução (Diretiva Omnibus), com os mesmos acréscimos de cor e tamanho.
  const { data: lowest30 } = useLowestPrice(product.id, !!price.promo);
  // Preço à vista e parcelas (recurso price_display); aluguel tem preço por período e fica de fora.
  const priceCtx = usePriceView('product', rental ? null : grossUnit);
  // Calcular frete na página (recurso shipping_estimate): a mesma linha que iria ao carrinho, sem produto digital nem aluguel.
  const shippingLine = useMemo(() => (digital && !digital.ships) || rental ? null : {
    product_id: product.id, quantity: qty, price: price.unit,
    design_data: buildDesignData(product, price, modifier, color, size, null),
  }, [digital, rental, product, qty, price, modifier, color, size]);

  const canAdd = !soldOut && optionsReady && !needsColor && !needsSize && maxQty >= 1 && (!rental || !!rentalChoice);
  const hint = !optionsReady || soldOut ? null
    : needsColor && needsSize ? t('chooseColorSize') : needsColor ? t('chooseColor') : needsSize ? t('chooseSize') : null;

  // Conta a visita uma vez por sessão (RLS permite insert anónimo).
  useEffect(() => {
    let seen = false;
    try {
      const k = `pv:${product.id}`;
      seen = !!sessionStorage.getItem(k);
      if (!seen) sessionStorage.setItem(k, '1');
    } catch { /* sem sessionStorage: conta na mesma */ }
    if (seen) return;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        await (supabase as any).from('product_views').insert({ product_id: product.id, user_id: data?.user?.id ?? null });
      } catch { /* a contagem de visitas é opcional */ }
    })();
  }, [product.id]);

  // A barra fixa do celular aparece quando o botão principal sai da tela.
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCtaInView(e.isIntersecting), { rootMargin: '0px 0px -72px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  useEffect(() => { if (location.hash === '#avaliacoes') setTab('reviews'); }, [location.hash]);

  // Linha do carrinho com este produto e a mesma cor e tamanho (sem personalização): a quantidade passa a editar o
  // carrinho e o botão principal leva até ele.
  const inCart = rental ? null : cartItems.find((i) => i.product_id === product.id && !i.design_data?.customization && !i.design_data?.quote
    && (i.design_data?.subscription?.plan_id ?? i.design_data?.subscription?.subscription_id ?? null) === subKey
    && (i.variation_id ?? null) === (color?.variationId ?? null) && (i.size_label ?? null) === (size?.label ?? null)) ?? null;
  const setCartQty = (n: number) => inCart && n !== inCart.quantity && updateQuantity({ itemId: inCart.id, quantity: n });
  const showGoToCart = !!inCart && optionsReady && !soldOut && addState !== 'done' && addState !== 'adding';

  const add = async () => {
    if (!canAdd || addState === 'adding') return;
    window.clearTimeout(resetTimer.current);
    setAddState('adding');
    let ok = false;
    try {
      // O toast de confirmação e o contador do cabeçalho vêm do próprio useCart.
      await addToCartAsync({
        productId: product.id,
        quantity: qty,
        variationId: color?.variationId,
        sizeLabel: size?.label,
        designData: { ...buildDesignData(product, price, modifier, color, size, gallery[0]?.url ?? null), ...(subData ? { subscription: subData } : {}), ...(rental && rentalChoice ? { rental: rentalChoice } : {}) },
      });
      ok = true;
    } catch { /* o useCart já mostra o erro; o botão fica em "tentar de novo" */ }
    setAddState(ok ? 'done' : 'error');
    resetTimer.current = window.setTimeout(() => setAddState('idle'), ok ? 2200 : 4000);
  };

  const favorite = isInWishlist(product.id);
  const onFavorite = () => (user ? toggleWishlist(product.id) : navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`));

  const scrollTo = (el: HTMLElement | null, block: ScrollLogicalPosition) => el?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block });
  const openReviews = (e: React.MouseEvent) => {
    e.preventDefault();
    setTab('reviews');
    requestAnimationFrame(() => scrollTo(document.getElementById('avaliacoes') ?? detailsRef.current, 'start'));
  };
  const chooseOptions = () => {
    const box = optionsRef.current;
    scrollTo(box, 'center');
    // Foca a opção que falta: a cor primeiro; com a cor já escolhida, o primeiro tamanho livre.
    const missing = needsColor ? 'color' : 'size';
    const target = box?.querySelector<HTMLElement>(`fieldset[data-option="${missing}"] button:not([aria-disabled="true"]):not([aria-pressed="true"])`);
    window.setTimeout(() => target?.focus({ preventScroll: true }), reduceMotion() ? 0 : 350);
  };

  // Vantagens só com dados do produto (a loja serve qualquer ramo): material se houver; "sob encomenda" e prazo só
  // quando a ficha tem prazo de produção; envio e compra segura sempre.
  const prod = productionTime(product);
  const material = mainMaterial(product);
  const productionText = prod && ('days' in prod ? (prod.days === 1 ? t('days_one') : t('days_other', { count: prod.days })) : prod.text);
  const showDates = delivery.on && delivery.settings.show_on_product;
  const lead = leadTimeFor(product, delivery.settings);
  const shipsBy = showDates ? estimateDelivery(new Date(), lead, null, delivery.settings, country.code).ship_by : null;
  // Produto digital sem entrega física: sem prazo de envio nem frete, só o download.
  const digitalOnly = !!digital && !digital.ships;
  const showReturns = pp.trust.returns && returnsOn && !!returnSettings?.enabled && returnSettings.days > 0;
  const trustRows: TrustRow[] = digitalOnly ? [
    { key: 'digital', Icon: FileDown, title: tdig('badge'), text: tp('trustDigitalText') },
    { key: 'secure', Icon: ShieldCheck, title: t('securePurchase'), text: tp('trustSecureText') },
  ] : [
    ...(material && pp.trust.style === 'list' ? [{ key: 'material', Icon: Leaf, title: t('madeIn', { material }) }] : []),
    ...(showDates
      ? [{ key: 'lead', Icon: Clock, title: leadText(tdd, lead) }]
      : productionText ? [{ key: 'production', Icon: Printer, title: tp('trustProduction'), text: t('production', { time: productionText }) }] : []),
    { key: 'shipping', Icon: Truck, title: tp('trustShipping'), text: showDates ? tp('trustShipsBy', { date: formatDay(shipsBy!, locale) }) : tp('trustShippingText') },
    ...(showReturns ? [{ key: 'returns', Icon: RotateCcw, title: tp('trustReturns', { days: returnSettings!.days }), text: tp('trustReturnsText') }] : []),
    { key: 'secure', Icon: ShieldCheck, title: t('securePurchase'), text: tp('trustSecureText') },
  ];
  const hiddenSpecs = [t('specSku'), t('specPackageDimensions'), t('specPackageWeight')];
  const quickSpecs = specRows(product, t, locale).filter((s) => !hiddenSpecs.includes(s.label)).slice(0, 4);

  const showTiers = options.tiers.length > 1 || (options.tiers.length === 1 && options.tiers[0].min_meters > 1);
  const tierRows: TierRow[] = [
    // Primeiro escalão acima de 1: a linha de 1 unidade mostra o preço base (fica ativa abaixo do primeiro escalão).
    ...(options.tiers.length && options.tiers[0].min_meters > 1
      ? [{ id: 'base', min: 1, label: t('tierFrom_one'), price: fmt(price.basePrice + modifier), active: !price.tier }]
      : []),
    ...options.tiers.map((tr) => ({
      id: tr.id,
      min: tr.min_meters,
      label: tr.label?.trim() || (tr.min_meters <= 1 ? t('tierFrom_one') : t('tierFrom_other', { count: nf.format(tr.min_meters) })),
      price: fmt(tr.price_per_meter * price.tierRatio + modifier),
      active: price.tier?.min === tr.min_meters,
    })),
  ];
  // O stock só é conhecido com a combinação escolhida (com cores e tamanhos, a matriz depende da cor).
  const stockKnown = !options.sizes.length || (!!size && (!options.variations.length || !!color));
  // Com a linha de disponibilidade ligada, as últimas unidades aparecem nela (não repetidas por baixo da quantidade).
  const stockNote = stockControlled && optionsReady && maxQty > 0 && maxQty < 9999 && stockKnown
    ? maxQty <= 5 ? (pp.availability ? null : maxQty === 1 ? t('stockLow_one') : t('stockLow_other', { count: maxQty }))
      : qty >= maxQty ? t('maxQty', { count: maxQty }) : null
    : null;
  const availability = pp.availability && !rental && !preorder ? availabilityFor({
    ready: optionsReady, soldOut, stockControlled,
    stock: stockKnown && maxQty < 9999 ? maxQty : null,
    madeToOrder: !!productionText || !!product.customizable,
  }) : null;

  // Quantidade: por cima do botão (como antes) ou ao lado dele (quantity_inline); a caixa das opções some quando fica vazia.
  const optionsEmpty = pp.quantity_inline && !optionsLoading && !optionsError && !colors.length && !sizes.length && !showTiers && !digital && !rental && !(subRules.on && (renewing || plans.length > 0));
  const qtyStepper = inCart
    ? <QuantityStepper id="pdp-qty" value={inCart.quantity} onChange={setCartQty} min={1} max={Math.max(1, maxQty, inCart.quantity)} />
    : renewing
      ? <QuantityStepper id="pdp-qty" value={renewing.quantity} onChange={() => undefined} min={renewing.quantity} max={renewing.quantity} />
      : <QuantityStepper id="pdp-qty" value={qty} onChange={setQuantity} min={1} max={Math.max(1, maxQty)} />;
  const lineQty = inCart ? inCart.quantity : !rental ? qty : 1;
  const qtyTotal = lineQty > 1 ? <span className="text-sm text-brand-ink-soft" aria-live="polite">{t('lineTotal', { qty: lineQty, total: fmt(price.unit * lineQty) })}</span> : null;
  const qtyNotes = (
    <>
      {inCart && <p className="mt-2 text-[13px] text-brand-ink-soft">{t('inCartNote')}</p>}
      {stockNote && <p className="mt-2 text-[13px] font-semibold text-brand-orange-text">{stockNote}</p>}
      <ProductCodesLine product={product} sku={variantsOn ? shownSku : product.sku} gtin={variant?.gtin ?? product.gtin} className="mt-2" />
    </>
  );

  // SEO
  const storeName = storeInfo?.name || STORE_DEFAULTS.name;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = `/produto/${product.slug || product.id}`;
  const canonical = `${origin}${path}`;
  const seoDescription = (product.short_description?.trim() || stripHtml(product.description) || t('seoFallback')).slice(0, 160);
  const ogImage = gallery[0]?.url ?? null;
  const categoryLabel = category ? category.name : product.category;
  const categoryHref = category ? `/categoria/${category.slug}` : `/produtos?q=${encodeURIComponent(product.category || '')}`;
  const shownPrice = Number(convert(withVat(price.unit, product.vat_rate)).toFixed(2));
  const ldImages = gallery.slice(0, 6).map((g) => g.url);
  // Dados para o Google: promoção com data de fim, vendedor, código da marca e política de devolução da loja.
  const ldPromo = getProductPromo(product);
  const ldValidUntil = ldPromo?.isActive && ldPromo.endsAt ? ldPromo.endsAt.toISOString().slice(0, 10) : null;
  const ldReturns = returnsOn && returnSettings
    ? (returnSettings.enabled && returnSettings.days > 0
      ? { '@type': 'MerchantReturnPolicy', applicableCountry: country.code, returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: returnSettings.days }
      : { '@type': 'MerchantReturnPolicy', applicableCountry: country.code, returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' })
    : null;
  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: seoDescription,
    ...(ldImages.length ? { image: ldImages } : {}),
    sku: shownSku || product.id,
    ...((variant?.gtin ?? product.gtin) ? { gtin: variant?.gtin ?? product.gtin } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    brand: { '@type': 'Brand', name: brand?.name || storeName },
    ...(categoryLabel ? { category: categoryLabel } : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: currentCurrency,
      price: shownPrice > 0 ? shownPrice.toFixed(2) : undefined,
      // Sem as opções carregadas não se sabe o stock: a disponibilidade fica de fora.
      ...(optionsReady ? { availability: soldOut ? 'https://schema.org/OutOfStock' : preorder ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock' } : {}),
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: storeName },
      ...(ldValidUntil ? { priceValidUntil: ldValidUntil } : {}),
      ...(ldReturns ? { hasMerchantReturnPolicy: ldReturns } : {}),
    },
    ...(rating.count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.average.toFixed(1), reviewCount: rating.count, bestRating: 5, worstRating: 1 } } : {}),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('home'), item: `${origin}/` },
      ...(categoryLabel ? [{ '@type': 'ListItem', position: 2, name: categoryLabel, item: `${origin}${categoryHref}` }] : []),
      { '@type': 'ListItem', position: categoryLabel ? 3 : 2, name: product.name, item: canonical },
    ],
  };

  return (
    <>
      <Helmet>
        <title>{`${product.name} | ${storeName}`}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="product" />
        <meta property="og:site_name" content={storeName} />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content={`${product.name} | ${storeName}`} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:locale" content={OG_LOCALE[locale]} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:alt" content={product.name} />}
        <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
        {shownPrice > 0 && <meta property="product:price:amount" content={shownPrice.toFixed(2)} />}
        {shownPrice > 0 && <meta property="product:price:currency" content={currentCurrency} />}
        <script type="application/ld+json">{jsonLd(productLd)}</script>
        <script type="application/ld+json">{jsonLd(breadcrumbLd)}</script>
      </Helmet>

      <div className="shell pt-2 md:pt-4">
        {/* Trilho: Início > Categoria > Produto */}
        <nav aria-label={t('breadcrumb')}>
          <ol className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground md:text-sm">
            <li className="shrink-0"><Link to="/" className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-brand-orange-text">{t('home')}</Link></li>
            {categoryLabel && (
              <>
                <li aria-hidden="true" className="shrink-0"><ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} /></li>
                <li className="min-w-0 shrink-0 max-w-[40%] truncate"><Link to={categoryHref} className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-brand-orange-text">{categoryLabel}</Link></li>
              </>
            )}
            <li aria-hidden="true" className="shrink-0"><ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} /></li>
            <li className="min-w-0 truncate font-medium text-foreground" aria-current="page">{product.name}</li>
          </ol>
        </nav>

        <div className="mt-2 grid gap-8 md:mt-3 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-12 xl:gap-16">
          {/* As duas colunas são sticky: fica parada a mais curta (a galeria quando a compra é longa, e vice-versa). */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="min-w-0 lg:sticky lg:top-[100px] lg:self-start">
            <ProductGallery images={media} name={product.name} resetKey={color?.key ?? 'none'} FallbackIcon={category?.Icon ?? Box} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}
            className="min-w-0 lg:sticky lg:top-[100px] lg:self-start"
          >
            {(product.is_new || product.customizable || pp.share) && (
              <div className={cn('flex items-center justify-between gap-3', pp.share ? '-mt-2 mb-1' : 'mb-3')}>
                <div className="flex flex-wrap gap-2">
                  {product.is_new && <span className="rounded-full bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase leading-none tracking-[0.16em] text-foreground shadow-[var(--shadow-soft)]">{t('badgeNew')}</span>}
                  {product.customizable && <span className="rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-semibold uppercase leading-none tracking-[0.16em] text-brand-orange-text">{t('badgeCustom')}</span>}
                </div>
                {pp.share && <ShareButton name={product.name} url={canonical} className="-mr-3" />}
              </div>
            )}
            {brand && (
              <Link to={`/produtos?marca=${encodeURIComponent(brand.slug)}`} className="mb-2 inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.12em] text-brand-orange-text underline-offset-4 hover:underline md:min-h-0">
                <span><span className="sr-only">{tc('brand_by')}: </span>{brand.name}</span>
              </Link>
            )}
            <h1 className="text-[30px] leading-[1.06] [text-wrap:balance] sm:text-[34px] lg:text-[36px] xl:text-[40px]">{product.name}</h1>

            {rating.count > 0 && (
              <a href="#avaliacoes" onClick={openReviews} className="group mt-2 inline-flex min-h-[44px] items-center gap-2 text-sm text-brand-ink-soft transition-colors duration-150 hover:text-brand-orange-text">
                <RatingStars value={rating.average} />
                <span className="font-semibold tabular-nums text-foreground" aria-hidden="true">{avgText}</span>
                <span className="underline-offset-4 group-hover:underline">{rating.count === 1 ? t('reviews_one') : t('reviews_other', { count: rating.count })}</span>
                <span className="sr-only">{t('ratingLabel', { value: avgText })}</span>
              </a>
            )}

            {/* Preço */}
            <div className={cn(rating.count > 0 ? 'mt-3' : 'mt-5')}>
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {isFrom && <span className="text-sm font-medium text-muted-foreground">{t('priceFrom')}</span>}
                {priceCtx.view ? (
                  <>
                    {price.promo && <span className="sr-only">{t('newPrice')}: </span>}
                    <PriceMain ctx={priceCtx} labelClassName="text-[16px]"
                      className={cn('text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums md:text-[32px]', price.promo ? 'text-brand-orange-text' : 'text-foreground')} />
                  </>
                ) : (
                  <span className={cn('text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums md:text-[32px]', price.promo ? 'text-brand-orange-text' : 'text-foreground')}>
                    {price.promo && <span className="sr-only">{t('newPrice')}: </span>}{fmt(price.unit)}
                  </span>
                )}
                {hasOldPrice && price.oldUnit != null && priceCtx.view?.highlight !== 'installment' && (
                  <s className="text-[18px] text-muted-foreground tabular-nums"><span className="sr-only">{t('oldPrice')}: </span>{fmt(price.oldUnit)}</s>
                )}
                {discountPct > 0 && (
                  <span className="self-center rounded-full bg-primary px-2.5 py-1 text-[13px] font-semibold leading-none text-primary-foreground">
                    <span aria-hidden="true">-{discountPct}%</span><span className="sr-only">{t('discountOff', { pct: discountPct })}</span>
                  </span>
                )}
              </p>
              <PriceExtras ctx={priceCtx} />
              {!rental && <InstallmentTable amount={grossUnit} />}
              {price.promo && lowest30 != null && (
                <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">{t('lowestPrice30', { price: fmt(lowest30 + modifier) })}</p>
              )}
              <GroupPriceHint productId={product.id} quantity={qty} unit={price.unit} modifier={modifier} fmt={fmt} />
              <ProductPointsHint value={withVat(price.unit, product.vat_rate) * Math.max(1, qty)} />
              {price.promo?.label && <p className="mt-2 text-sm font-semibold text-brand-orange-text">{price.promo.label}</p>}
              {price.promo?.showCountdown && price.promo.endsAt && <PromoCountdown endsAt={price.promo.endsAt} prefix={t('promoEnds')} className="mt-2 text-brand-orange-text" />}
              {(showsTaxSeparately() || tierDiscount) && (
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  {showsTaxSeparately() && <span>{t('taxIncluded', { rate: nf.format(getVatRate(product.vat_rate)) })}</span>}
                  {tierDiscount && <span className="font-semibold text-emerald-700">{t('tierApplied')}</span>}
                </p>
              )}
              <AvailabilityLine value={availability} time={productionText || null} className="mt-3" />
            </div>

            {product.short_description && <p className="mt-5 text-[16px] leading-relaxed text-brand-ink-soft md:text-[17px]">{product.short_description}</p>}
            <VendorLine vendorId={(product as { vendor_id?: string | null }).vendor_id} />

            {/* Ficha rápida: até 4 dados da peça (material, tamanho, acabamento), sem código nem medidas da embalagem. */}
            {pp.quick_specs && quickSpecs.length > 0 && (
              <dl className={cn('mt-5 grid grid-cols-2 gap-2', quickSpecs.length >= 3 && 'sm:grid-cols-3', quickSpecs.length >= 4 && 'xl:grid-cols-4')}>
                {quickSpecs.map((s) => (
                  <div key={s.label} className="min-w-0 rounded-[14px] border border-brand-card-border/70 bg-white px-3.5 py-2.5">
                    <dt className="text-[12px] font-medium leading-snug text-muted-foreground">{s.label}</dt>
                    <dd className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]" title={s.value}>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Opções */}
            <div ref={optionsRef} className={cn('mt-7 space-y-6 border-t border-border pt-6', optionsEmpty && 'hidden')}>
              {optionsLoading ? (
                <div className="space-y-5" role="status" aria-label={t('optionsLoading')}>
                  <div className="flex gap-2.5">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-11 w-11 rounded-full" />)}</div>
                  <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-11 w-14 rounded-xl" />)}</div>
                </div>
              ) : optionsError ? (
                <p className="flex items-start gap-2.5 rounded-[14px] border border-destructive/30 bg-destructive/5 p-3.5 text-sm font-medium text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />{t('optionsError')}
                </p>
              ) : (
                <>
                  {colors.length > 0 && <ColorSwatches options={colors} selectedKey={color?.key ?? null} onSelect={setColorKey} formatModifier={fmtMod} />}
                  {sizes.length > 0 && <SizeOptions options={sizes} selectedId={size?.id ?? null} onSelect={setSizeId} formatModifier={fmtMod} />}
                  {showTiers && <TierTable rows={tierRows} onPick={(min) => setQuantity(Math.max(1, Math.min(Math.ceil(min), Math.max(1, maxQty))))} />}
                </>
              )}

              {digital && <DigitalNote digital={digital} />}

              {rental && (
                <RentalPicker
                  productId={product.id} rental={rental} settings={rentalRules.settings} unitNet={price.unit} fmt={fmt}
                  fmtDeposit={(v) => formatPrice(convert(v), currentCurrency)} qty={qty} start={rentStart} end={rentEnd}
                  onDates={(a, b) => { setRentStart(a); setRentEnd(b); }} onChoice={setRentalChoice}
                />
              )}

              {subRules.on && !rental && (renewing ? (
                <p className="flex items-start gap-2.5 rounded-[14px] border border-primary/40 bg-brand-orange-soft/60 p-3.5 text-[14px] font-medium text-foreground" role="status">
                  <Repeat className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-orange-text" strokeWidth={1.9} aria-hidden="true" />
                  {renewOk
                    ? tsub('renew_banner', { every: everyText(tsub, renewing.interval_unit, renewing.interval_count), pct: renewing.discount_percent })
                    : tsub('renew_banner_off', { date: renewing.next_date ? new Date(`${addDaysSub(renewing.next_date, -subRules.settings.renew_days_before)}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }) : '' })}
                </p>
              ) : (
                <SubscribeOption plans={plans} value={planId} onChange={setPlanId} unitNet={price.unit} fmt={fmt} settings={subRules.settings} />
              ))}

              {!pp.quantity_inline && (
                <div>
                  <label htmlFor="pdp-qty" className="mb-2.5 block text-[15px] font-semibold">{inCart ? t('inCartQty') : t('quantity')}</label>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{qtyStepper}{qtyTotal}</div>
                  {qtyNotes}
                </div>
              )}
            </div>

            {/* Compra */}
            <div ref={ctaRef} className={cn('space-y-3', optionsEmpty ? 'mt-7 border-t border-border pt-6' : 'mt-6')}>
              {(hint || soldOut) && (
                <p id="pdp-hint" className={cn('flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium', soldOut ? 'bg-brand-alt text-brand-ink-soft' : 'bg-accent text-brand-orange-text')} role="status">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />{soldOut ? t('soldOutText') : hint}
                </p>
              )}
              {preorder && <PreorderPanel preorder={preorder} />}
              {soldOut && <StockAlertForm productId={product.id} />}
              {pp.quantity_inline && !soldOut && <label htmlFor="pdp-qty" className="sr-only">{inCart ? t('inCartQty') : t('quantity')}</label>}
              <div className={cn(pp.quantity_inline && !soldOut && 'flex items-stretch gap-3 [&>*:last-child]:min-w-0 [&>*:last-child]:flex-1')}>
                {pp.quantity_inline && !soldOut && <div className="flex shrink-0 [&>div]:h-[56px] [&_button]:h-[54px] [&_button]:w-10 [&_input]:w-11 sm:[&_button]:w-12 sm:[&_input]:w-14">{qtyStepper}</div>}
                {showGoToCart ? (
                  <Link to="/carrinho" className="inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-full bg-primary px-4 text-[15px] font-semibold sm:px-6 sm:text-[16px] text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]">
                    <ShoppingBag className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" /><span className="truncate">{t('goToCart')}</span><ArrowRight className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  </Link>
                ) : (
                  <AddToCartButton loading={optionsLoading} state={addState} soldOut={soldOut} disabled={!canAdd} onClick={() => void add()} describedBy={hint || soldOut ? 'pdp-hint' : undefined} idleLabel={preorder ? tpre('button') : undefined} className={pp.quantity_inline && !soldOut ? 'px-3 text-[15px] sm:px-6 sm:text-[16px]' : undefined} />
                )}
              </div>
              {pp.quantity_inline && !soldOut && <div className="-mt-1">{qtyTotal}{qtyNotes}</div>}
              {pp.quantity_inline && soldOut && <ProductCodesLine product={product} sku={variantsOn ? shownSku : product.sku} gtin={variant?.gtin ?? product.gtin} />}
              {addState === 'error' && <p className="text-sm font-medium text-destructive" role="alert">{t('addError')}</p>}
              {!soldOut && <QuoteProductLink productId={product.id} quantity={qty} variationId={color?.variationId} sizeLabel={size?.label} />}
              {/* Sem botão Personalizar: /customizar/:id ainda não tem fluxo de personalização (só um aviso "em breve"). */}
              <div className={cn(pp.actions === 'compact' ? 'flex flex-wrap gap-2 [&>*]:min-w-[140px] [&>*]:flex-1' : 'space-y-3')}>
                {wishlistOn && <button type="button" onClick={onFavorite} aria-pressed={favorite} title={favorite ? t('removeFavorite') : undefined} className={cn(btnSecondary, pp.actions === 'compact' && 'min-h-[46px] border-border text-[14px]')}>
                  <motion.span key={String(favorite)} initial={{ scale: favorite ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 14 }} className="inline-flex">
                    <Heart className={cn('h-5 w-5 transition-colors duration-150', favorite ? 'fill-primary text-primary' : 'text-current')} strokeWidth={1.8} aria-hidden="true" />
                  </motion.span>
                  {favorite ? t('inFavorites') : pp.actions === 'compact' ? tp('favoriteShort') : t('addFavorite')}
                </button>}
                <CompareToggle productId={product.id} name={product.name} place="product" className={cn(pp.actions === 'compact' && 'min-h-[46px] text-[14px] font-medium')} />
              </div>
            </div>

            {/* Calcular frete e prazo pelo CEP (recurso shipping_estimate) */}
            <ShippingEstimate line={shippingLine} className="mt-5" />

            {/* Kits com esta peça (recurso kits) */}
            <ProductKitOffer productId={product.id} />

            {/* Garantias da compra: envio, produção, devolução, compra segura e meios de pagamento */}
            {pp.trust.on && <ProductTrust rows={trustRows} style={pp.trust.style} payments={pp.trust.payments} className={pp.trust.style === 'card' ? 'mt-6' : 'mt-7'} />}
          </motion.div>
        </div>

        <div className="mt-14 md:mt-20">
          <ProductDetailsTabs ref={detailsRef} product={product} tab={tab} onTab={setTab} reviewsCount={rating.count} returnPath={location.pathname} sku={variantsOn ? shownSku : product.sku} layout={pp.details} />
        </div>

        {options.faqs.length > 0 && (
          <section className="mt-14 md:mt-16" aria-labelledby="pdp-faq-title">
            <h2 id="pdp-faq-title" className="text-[26px] leading-tight md:text-[30px]">{t('faqTitle')}</h2>
            <Accordion type="single" collapsible className="mt-6 divide-y divide-border overflow-hidden rounded-[18px] bg-white">
              {options.faqs.map((f) => (
                <AccordionItem key={f.id} value={f.id} className="border-0 px-5 md:px-6">
                  <AccordionTrigger className="min-h-[56px] py-4 text-left text-[16px] font-semibold hover:text-brand-orange-text hover:no-underline">{f.question}</AccordionTrigger>
                  <AccordionContent className="pb-5"><div className={prose}><ReactMarkdown>{f.answer}</ReactMarkdown></div></AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        <ProductQuestions productId={product.id} returnPath={location.pathname} />
      </div>

      <RelatedProducts3D productId={product.id} category={product.category || null} seeAllHref={category ? `/categoria/${category.slug}` : '/produtos'} />

      <MobileBuyBar
        visible={!ctaInView}
        price={fmt(price.unit)}
        amount={rental ? null : grossUnit}
        oldPrice={hasOldPrice && price.oldUnit != null ? fmt(price.oldUnit) : null}
        from={isFrom}
        state={addState}
        needsOptions={needsColor || needsSize}
        soldOut={soldOut}
        loading={optionsLoading}
        unavailable={optionsLoading || optionsError}
        onAdd={() => void add()}
        onChooseOptions={chooseOptions}
        goToCart={showGoToCart}
        idleLabel={preorder ? tpre('button') : undefined}
        desktop={pp.desktop_bar}
        photo={pp.desktop_bar || pp.mobile_bar_photo ? gallery[0]?.url ?? null : null}
        showPhotoMobile={pp.mobile_bar_photo}
        name={product.name}
      />
    </>
  );
}

function ProductSkeleton() {
  const { t } = useMessages(productMessages);
  return (
    <div className="shell pt-4 md:pt-6" role="status" aria-label={t('loading')}>
      <div className="skeleton h-4 w-56 rounded" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-12 xl:gap-16">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[84px_minmax(0,1fr)] lg:gap-4">
          <div className="order-2 flex gap-2 lg:order-1 lg:flex-col lg:gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[68px] w-[68px] rounded-[14px] lg:h-[84px] lg:w-[84px]" />)}
          </div>
          <div className="skeleton order-1 aspect-square rounded-[24px] lg:order-2" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-11 w-4/5 rounded-xl" />
          <div className="skeleton h-11 w-3/5 rounded-xl" />
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton mt-2 h-9 w-48 rounded-xl" />
          <div className="skeleton h-16 w-full rounded-xl" />
          <div className="flex gap-2.5 pt-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-11 w-11 rounded-full" />)}</div>
          <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-11 w-14 rounded-xl" />)}</div>
          <div className="skeleton mt-4 h-14 w-full rounded-[14px]" />
          <div className="skeleton h-[52px] w-full rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}

function ProductMessage({ kind, onRetry }: { kind: 'notFound' | 'error'; onRetry?: () => void }) {
  const { t } = useMessages(productMessages);
  const { data: storeInfo } = useStoreInfo();
  const title = kind === 'notFound' ? t('notFoundTitle') : t('loadErrorTitle');
  const Icon = kind === 'notFound' ? PackageSearch : AlertCircle;
  return (
    <div className="shell py-14 md:py-24">
      <Helmet>
        <title>{`${title} | ${storeInfo?.name || STORE_DEFAULTS.name}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="mx-auto max-w-xl rounded-[24px] border border-brand-card-border bg-white p-8 text-center shadow-[var(--shadow-card)] md:p-12">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent text-primary"><Icon className="h-7 w-7" strokeWidth={1.7} aria-hidden="true" /></span>
        <h1 className="mt-5 text-[30px] font-[780] leading-tight tracking-[-0.03em] md:text-[36px]">{title}</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-brand-ink-soft">{kind === 'notFound' ? t('notFoundText') : t('loadErrorText')}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {kind === 'error' && onRetry ? (
            <button type="button" onClick={onRetry} className={btnPrimary}><RefreshCw className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />{t('retry')}</button>
          ) : (
            <Link to="/produtos" className={btnPrimary}>{t('seeAllProducts')}</Link>
          )}
          <Link to="/" className={cn(btnSecondary, 'sm:w-auto sm:px-6')}>{t('backHome')}</Link>
        </div>
      </motion.div>
    </div>
  );
}

export default ProductDetail;
