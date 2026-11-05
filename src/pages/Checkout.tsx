// Checkout PRINT3D (/checkout). Desktop: formulário em secções numeradas (60%) e resumo fixo (40%);
// celular: uma coluna, com o resumo recolhível no topo.
//
// O pedido é criado como antes, com os mesmos valores enviados: Edge Function create-order (com country_code),
// recurso à RPC antiga quando a função não está implantada (404) e guest-order para convidados. O servidor
// recalcula tudo; os valores daqui servem só para mostrar.
//
// País (useCountry): endereço, impostos, documento fiscal e meios de pagamento seguem o país atual.
// Frete: o cálculo por distrito (zonas Continente / Madeira / Açores) só existe para Portugal, igual a shippingFor
// em supabase/functions/_shared/pricing.ts; noutros países o servidor só aceita o método com
// config.shipping_mode === 'flat_rate' (flat_rate + extra_cost). Sem esse método, o checkout explica e bloqueia.
// Com formas de envio ligadas (Admin > Frete e entrega), essas regras antigas ficam de lado: as opções vêm da
// função shipping-quote para o endereço escolhido (transportadora, preço, prazo) e o pedido leva shipping_service_id.
// A retirada na loja continua a vir de delivery_methods.
import { CartKitHints } from "@/components/cart/CartKitHints";
import { STORE_DEFAULTS } from "@/config/store";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Helmet } from "react-helmet";
import { toast } from "sonner";
import {
  AlertCircle, ArrowRight, Box, CalendarCheck, CalendarClock, CalendarOff, CheckCircle2, ChevronDown, ChevronLeft, Clock, Coins, Copy, CreditCard, FileDown, Gift, Info,
  Landmark, Loader2, Lock, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Printer, QrCode, Receipt, RefreshCw, ShieldCheck,
  ListChecks, ShoppingBag, Smartphone, Store, Tag, Truck, User, Wallet, type LucideIcon,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CustomizationAreaFiles from "@/components/customizer/CustomizationAreaFiles";
import CouponReveal from "@/components/cart/CouponReveal";
import { useCheckoutPage } from "@/hooks/useCheckoutPage";
import { checkoutPageMessages } from "@/i18n/checkoutPage";
import { nextStepTarget, stepFolded, type CheckoutStepId } from "@/lib/checkoutPage";
import GiftCardInput from "@/components/GiftCardInput";
import RewardPointsInput from "@/components/RewardPointsInput";
import { rewardPointsMessages } from "@/i18n/rewardPoints";
import { useMyRewardPoints, usePointsChoice, useRewardSettings } from "@/hooks/useRewardPoints";
import { maxRedeemable, pointsEarned, pointsValue } from "@/lib/rewardPoints";
import { giftCardsMessages } from "@/i18n/giftCards";
import { useAppliedGiftCard } from "@/hooks/useGiftCards";
import { useFeature } from "@/hooks/useFeatures";
import { useCheckoutFields } from "@/hooks/useCheckoutFields";
import { useDeliveryRules, useLeadTimes } from "@/hooks/useDeliveryDates";
import { deliveryDatesMessages } from "@/i18n/deliveryDates";
import { everyText, subscriptionsMessages } from "@/i18n/subscriptions";
import { periodsText, rentalRangeText, rentalsMessages } from "@/i18n/rentals";
import { digitalMessages } from "@/i18n/digitalProducts";
import { useDigitalOnlyIds } from "@/hooks/useDigitalProducts";
import { cartLeadTime, estimateDelivery, formatDay } from "@/lib/deliveryDates";
import CheckoutExtraFields from "@/components/checkout/CheckoutExtraFields";
import { checkoutFieldsMessages } from "@/i18n/checkoutFields";
import { answerLines, answerText, localText, type Answers } from "@/lib/checkoutFields";
import { giftApplied, giftCodeTail } from "@/lib/giftCards";
import AddressForm from "@/components/dashboard/AddressForm";
import VivaCardEmbed from "@/components/checkout/VivaCardEmbed";
import BillingTaxIdCard from "@/components/checkout/BillingTaxIdCard";
import PhoneInputWithDDI, { getFullPhoneDisplay } from "@/components/PhoneInputWithDDI";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { LayerArt } from "@/components/MediaImage";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useCartStock } from "@/hooks/useCartStock";
import { CartStockNotice } from "@/components/cart/CartStockNotice";
import { CartReservationTimer } from "@/components/cart/CartReservation";
import { usePreorders } from "@/hooks/usePreorders";
import { preordersMessages } from "@/i18n/preorders";
import { cartMessages } from "@/i18n/cart";
import { useAddresses } from "@/hooks/useAddresses";
import { useCoupon } from "@/hooks/useCoupon";
import { useCurrency } from "@/hooks/use-currency";
import { calculateShippingByDistrict, getFreeShippingThreshold } from "@/hooks/useShipping";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useTaxIdRules } from "@/hooks/useTaxIdRules";
import { useVisualSettings } from "@/hooks/useVisualSettings";
import { useLocale, useMessages, type Locale } from "@/i18n";
import { addressMessages, parishKey, postalKey, regionKey } from "@/i18n/address";
import { checkoutMessages, type CheckoutKey } from "@/i18n/checkout";
import { supabase } from "@/integrations/supabase/client";
import {
  addressCountryCode, addressFormat, findRegion, isValidPostal, lookupPostal, regionToValue, type AddressFormat,
} from "@/lib/addressFormats";
import { countryName, getCountry, useCountries, useCountry, useCountryStore, type Country } from "@/lib/countries";
import { CountryPicker } from "@/components/CountryPicker";
import PaymentMethods from "@/components/PaymentMethods";
import { Flag } from "@/components/Flag";
import { jurisdictionOf } from "@/legal/shared";
import {
  getReturnDate, isProductionPauseActive, pauseNoteForOrder, resolveText, type ProductionPauseConfig,
} from "@/lib/productionPause";
import { isValidTaxId } from "@/lib/taxId";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { getPending, delPending } from "@/utils/pendingDesigns";
import { getVatRate, showsTaxSeparately } from "@/utils/pricing";
import { effectiveUnitPrice, VolumeTier } from "@/utils/tierPricing";
import { useHasShippingServices, useShippingQuote } from "@/hooks/useShippingQuote";
import { fromCents } from "@/lib/money";
import { CartPriceHint } from "@/components/price/SmartPrice";
import { isOnlineGateway, localized, methodBlock, paymentDiscount, paymentIconOf } from "@/lib/paymentMethods";
import { currentAffiliateCode } from "@/lib/affiliateTracking";

type PaymentMethod = "multibanco" | "mbway" | "transfer" | "on_delivery" | "stripe" | "pix" | "viva" | "mercado_pago" | "paypal" | "bizum";
type DeliveryType = "delivery" | "pickup";
type ShippingRegion = "continente" | "ilhas";
type Translate = (key: CheckoutKey, vars?: Record<string, string | number>) => string;

interface DeliveryMethodData {
  id: string;
  type: DeliveryType;
  name: string;
  description: string;
  is_active: boolean;
  config: Record<string, any>;
}

interface PaymentConfigData {
  id: string;
  type: PaymentMethod;
  name: string;
  is_active: boolean;
  details: Record<string, any>;
  countries?: string[] | null;
  name_i18n?: Record<string, string> | null;
  instructions_i18n?: Record<string, string> | null;
  discount_percent?: number | string | null;
  min_total?: number | string | null;
  max_total?: number | string | null;
}

type GuestAddress = {
  name: string; street: string; number: string; complement: string; parish: string;
  city: string; district: string; postal_code: string; country: string;
};

type SummaryItem = {
  key: string;
  image: string;
  name: string;
  meta: string;
  quantity: number;
  price: number;
  areas?: Record<string, { areaLabel: string; notes?: string; addonPrice?: number }>;
};

type ContactProfile = { exists: boolean; fullName: string; phone: string };

/** País com frete por distrito (zonas Continente / Madeira / Açores da tabela DISTRICT_ZONE do servidor). */
const DISTRICT_SHIPPING_COUNTRY = "PT";


const phoneDigits = (v: string | null | undefined) => {
  const s = String(v ?? "");
  return (s.includes(":") ? s.split(":")[1] ?? "" : s).replace(/\D/g, "");
};
/** Telefone guardado como "BR:11999998888": mostrado com o indicativo e a máscara do país, como no perfil. */
const phoneDisplay = (v: string | null | undefined) => getFullPhoneDisplay(String(v ?? ""));
const isContactComplete = (p: ContactProfile | undefined) => !!p?.fullName.trim() && phoneDigits(p.phone).length >= 6;

/** Linhas de um endereço guardado (mesmos campos em todos os países). */
function addressLines(a: any, locale: Locale, fallbackCountry: string): string[] {
  if (!a) return [];
  const l1 = [a.street, a.number].filter(Boolean).join(", ") + (a.complement ? ` - ${a.complement}` : "");
  const l2 = [[a.parish, a.city].filter(Boolean).join(", "), a.district || a.state].filter(Boolean).join(" - ");
  const code = addressCountryCode(a.country ?? a.country_code, fallbackCountry);
  const l3 = [a.postal_code || a.zip_code, countryName(code, locale)].filter(Boolean).join(" · ");
  return [l1, l2, l3].filter((s) => s.trim());
}

const parseYMD = (s?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return match;
}

// Visual PRINT3D
const card = "rounded-[20px] border border-brand-card-border bg-white shadow-[var(--shadow-card)]";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const btnPrimary = cn(
  "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform,box-shadow] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-primary/45 disabled:shadow-none disabled:active:scale-100",
  focusRing,
);
const btnSecondary = cn(
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:border-primary hover:text-brand-orange-text disabled:opacity-60",
  focusRing,
);
const btnGhost = cn(
  "inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] px-3 text-[14px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent",
  focusRing,
);
const inputCls = "h-12 rounded-[14px] border-border bg-white text-[16px] md:text-[15px]";
const labelCls = "text-[14px] font-semibold text-foreground";
const optionCls = (active: boolean, disabled = false) =>
  cn(
    "flex items-start gap-3 rounded-[16px] border p-4 transition-[border-color,background-color,box-shadow] duration-150",
    disabled ? "cursor-not-allowed border-border bg-brand-alt/50 opacity-70" : "cursor-pointer",
    !disabled && (active ? "border-primary bg-accent/50 shadow-[var(--shadow-ring-royal)]" : "border-border bg-white hover:border-primary/40"),
  );
const noteCls = "flex items-start gap-3 rounded-[16px] border p-4 text-[14px] leading-relaxed";

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useMessages(checkoutMessages);
  const country = useCountry();
  const countryLabel = countryName(country.code, locale);
  const taxRules = useTaxIdRules();
  const { t: ta } = useMessages(addressMessages);
  const { t: tg } = useMessages(giftCardsMessages);
  const { t: tp } = useMessages(rewardPointsMessages);
  const { t: tcf } = useMessages(checkoutFieldsMessages);
  const { t: tdd } = useMessages(deliveryDatesMessages);
  const { t: tsub } = useMessages(subscriptionsMessages);
  const { t: trent } = useMessages(rentalsMessages);
  const { t: tdig } = useMessages(digitalMessages);
  // Formulário de convidado (formato do país atual).
  const guestFmt = addressFormat(country.postalCodeKind);
  const { data: storeInfo } = useStoreInfo();
  const storeName = storeInfo?.name || STORE_DEFAULTS.name;
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Compras requerem conta: redireciona convidados para o login com retorno.
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth?redirect=/checkout", { replace: true });
    }
  }, [authLoading, user, navigate]);

  const {
    cartItems,
    subtotal,
    vatTotal,
    verificationSubtotal: vSub,
    verificationVat: vVat,
    totalWeight,
    clearCart,
    removeItem,
    removeFromCartAsync,
    updateQuantityAsync,
  } = useCart(user?.id);
  const { addresses, isLoading: addressesLoading } = useAddresses(user?.id);
  const { appliedCoupon, calculateDiscount, removeCoupon } = useCoupon();
  const { currentCurrency, convert } = useCurrency();
  const money = (n: number) => formatPrice(convert(n), currentCurrency);
  const { data: visualSettings } = useVisualSettings();
  const freeShippingBarEnabled = visualSettings?.plugins?.free_shipping_bar?.enabled !== false;
  const pauseCfg = (visualSettings?.plugins as any)?.production_pause as ProductionPauseConfig | undefined;
  const pauseActive = isProductionPauseActive(pauseCfg);
  const pauseCheckboxText = resolveText(pauseCfg?.checkbox_text, pauseCfg) || t("pauseAckDefault");
  const whatsappDigits = visualSettings?.plugins?.whatsapp?.enabled === false ? "" : String(visualSettings?.plugins?.whatsapp?.phone ?? "").replace(/\D/g, "");

  const [taxIdOk, setTaxIdOk] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [guestAddress, setGuestAddress] = useState<GuestAddress>(() => ({
    name: "",
    street: "",
    number: "",
    complement: "",
    parish: "",
    city: "",
    district: "",
    postal_code: "",
    country: getCountry().code,
  }));

  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<string>("");
  const [showNewBillingAddressForm, setShowNewBillingAddressForm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSnapshot, setProcessingSnapshot] = useState<null | {
    itemCount: number;
    subtotal: number;
    vat: number;
    verificationNet: number;
    verificationGross: number;
    discount: number;
    payDiscount: number;
    giftAmount: number;
    giftCode: string | null;
    pointsUsed: number;
    pointsAmount: number;
    extrasNet: number;
    extrasVat: number;
    shippingGross: number;
    total: number;
    couponCode: string | null;
    items: SummaryItem[];
  }>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("multibanco");
  const paymentTouched = useRef(false);
  const [vivaEmbedOrder, setVivaEmbedOrder] = useState<{ id: string; total: number } | null>(null);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("delivery");
  const [shippingRegion, setShippingRegion] = useState<ShippingRegion>("continente");
  const [pickupEligible, setPickupEligible] = useState<boolean | null>(null);
  const [pickupAck, setPickupAck] = useState(false);
  const [pauseAck, setPauseAck] = useState(false);
  // Campos extra do checkout (Admin > Campos do checkout): respostas do cliente; o servidor confere e soma.
  const [fieldAnswers, setFieldAnswers] = useState<Answers>({});
  const [fieldsTouched, setFieldsTouched] = useState(false);
  const [termsAck, setTermsAck] = useState(false);
  const [personalizedTermsAck, setPersonalizedTermsAck] = useState(false);

  const [shippingInfo, setShippingInfo] = useState<{
    cost: number;
    estimatedDays: { min: number; max: number };
    freeShipping: boolean;
  } | null>(null);

  const [localCart, setLocalCart] = useState<
    Array<{
      productId: string;
      name: string;
      image: string;
      price: number;
      quantity: number;
      weight: number;
      variation?: string;
      size?: string;
      design_data?: { customization?: { areas?: Record<string, { areaLabel: string; notes?: string; addonPrice?: number }> } };
    }>
  >([]);

  // Contato do cliente com conta: o pedido usa o nome e o telefone do perfil (create-order lê o perfil).
  const { data: contactProfile, isLoading: contactLoading } = useQuery({
    queryKey: ["checkout-contact", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ContactProfile> => {
      const { data } = await supabase.from("user_profiles").select("full_name, phone").eq("user_id", user!.id).maybeSingle();
      return { exists: !!data, fullName: String(data?.full_name ?? ""), phone: String(data?.phone ?? "") };
    },
  });
  const contactOk = isContactComplete(contactProfile);

  // Load delivery methods from DB
  const {
    data: deliveryMethods = [],
    isLoading: deliveryMethodsLoading,
    isError: deliveryMethodsError,
    refetch: refetchDeliveryMethods,
  } = useQuery({
    queryKey: ["deliveryMethods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_methods" as any)
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as unknown as DeliveryMethodData[];
    },
  });

  // Load payment configs from DB
  const {
    data: paymentConfigs = [],
    isLoading: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = useQuery({
    queryKey: ["paymentConfigs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_payment_methods" as any);
      if (error) throw error;
      return ((data as any[]) || []) as unknown as PaymentConfigData[];
    },
  });
  // Meios do país de entrega (Admin > Pagamentos, coluna países; vazio = todos). Valor mínimo e máximo mais abaixo.
  const countryPaymentConfigs = useMemo(() => paymentConfigs.filter((c) => methodBlock(c, country.code, 0) !== "country"), [paymentConfigs, country]);

  const isGuest = !user;

  // Volume tiers for guest cart items: auth users already get tier-aware
  // totals from useCart.
  const guestProductIds = Array.from(new Set(localCart.map((i: any) => i.productId).filter(Boolean)));
  const { data: guestTiersByProduct = {} } = useQuery<Record<string, VolumeTier[]>>({
    queryKey: ["checkout-guest-tiers", guestProductIds.sort().join(",")],
    enabled: isGuest && guestProductIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_volume_tiers")
        .select("product_id, min_meters, price_per_meter, label")
        .in("product_id", guestProductIds);
      if (error) throw error;
      const map: Record<string, VolumeTier[]> = {};
      (data || []).forEach((tier: any) => {
        (map[tier.product_id] ||= []).push({
          min_meters: Number(tier.min_meters),
          price_per_meter: Number(tier.price_per_meter),
          label: tier.label,
        });
      });
      return map;
    },
  });

  // Returns the effective per-unit price for a guest cart item, honoring tiers
  // for unit products. Configurator lines (with `length_m` or
  // `design_data.planos`) keep their pre-computed price.
  const guestItemPricing = (item: any) => {
    const design = item.design_data || {};
    if (design.customization && typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0) {
      return { unit: item.price, tier: null, isMeterBundle: false };
    }
    const isMeterBundle =
      typeof design?.totalMeters === "number" || typeof item?.length_m === "number" || Array.isArray(design?.planos);
    if (isMeterBundle) {
      return { unit: Number(item.price || 0), tier: null, isMeterBundle: true };
    }
    const tiers = guestTiersByProduct[item.productId] || [];
    const { unit, tier } = effectiveUnitPrice(Number(item.price || 0), Number(item.quantity || 0), tiers);
    return { unit, tier, isMeterBundle: false };
  };

  // Formas de envio por transportadora: com alguma ligada, as opções de entrega em casa vêm da cotação do servidor
  // para o endereço escolhido (id "svc:<forma de envio>"); as formas de entrega antigas ficam só para a retirada.
  const { data: carrierMode = false, isLoading: carrierModeLoading } = useHasShippingServices();
  const quoteAddress = addresses.find((a) => a.id === selectedAddressId);
  const quoteLines = useMemo(
    () => (cartItems as any[]).map((item) => ({
      product_id: item.product_id, quantity: item.quantity,
      price: Number(item._pricing?.unitPrice ?? item.products?.price ?? 0), design_data: item.design_data ?? null,
    })),
    [cartItems],
  );
  const shippingQuote = useShippingQuote({
    enabled: carrierMode && !!user && deliveryType === "delivery" && !!quoteAddress
      && addressCountryCode(quoteAddress?.country, country.code) === country.code,
    country: country.code,
    postalCode: quoteAddress?.postal_code ?? "",
    region: quoteAddress?.district ?? "",
    city: quoteAddress?.city ?? "",
    items: quoteLines,
  });
  const carrierOptions = useMemo<DeliveryMethodData[]>(
    () => (shippingQuote.data?.options ?? []).map((o) => ({
      id: `svc:${o.service_id}`, type: "delivery", is_active: true,
      name: o.name_i18n?.[locale] || o.name,
      description: o.description_i18n?.[locale] || o.description_i18n?.["pt-BR"] || "",
      config: {
        shipping_mode: "carrier", carrier_cost: fromCents(o.price_cents, o.currency), carrier_free: o.free,
        flat_min_days: o.days_min ?? undefined, flat_max_days: o.days_max ?? o.days_min ?? undefined,
      },
    })),
    [shippingQuote.data, locale],
  );

  const isDistrictCountry = !carrierMode && country.code === DISTRICT_SHIPPING_COUNTRY;
  const optionUsable = (m: DeliveryMethodData | undefined) =>
    !!m && (isDistrictCountry || m.config?.shipping_mode === "flat_rate" || m.config?.shipping_mode === "carrier");
  const pickupMethod = deliveryMethods.find((m) => m.type === "pickup");
  const homeDeliveryOptions = carrierMode ? carrierOptions : deliveryMethods.filter((m) => m.type === "delivery");
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const homeDeliveryMethod = homeDeliveryOptions.find((m) => m.id === selectedDeliveryId) || homeDeliveryOptions[0];
  const flatMode = homeDeliveryMethod?.config?.shipping_mode === "flat_rate" || carrierMode;

  useEffect(() => {
    if (deliveryType !== "delivery" || homeDeliveryOptions.length === 0) return;
    const current = homeDeliveryOptions.find((m) => m.id === selectedDeliveryId);
    // Fora de Portugal só serve o método de tarifa fixa: troca para ele se o escolhido não servir.
    if (current && (optionUsable(current) || !homeDeliveryOptions.some(optionUsable))) return;
    const usable = homeDeliveryOptions.filter(optionUsable);
    const pool = usable.length ? usable : homeDeliveryOptions;
    const def = pool.find((m: any) => m.is_default);
    setSelectedDeliveryId((def || pool[0]).id);
    // optionUsable depende só de isDistrictCountry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryType, homeDeliveryOptions, selectedDeliveryId, isDistrictCountry]);


  // If no pickup available, default to delivery
  useEffect(() => {
    if (!pickupMethod && (homeDeliveryOptions.length > 0 || carrierMode)) setDeliveryType("delivery");
  }, [pickupMethod, homeDeliveryOptions.length, carrierMode]);

  // Só há retirada na loja: fica escolhida (sem isso o frete ficava "a calcular" para sempre).
  useEffect(() => {
    if (!deliveryMethodsLoading && !carrierModeLoading && !carrierMode && homeDeliveryOptions.length === 0 && pickupMethod) setDeliveryType("pickup");
  }, [deliveryMethodsLoading, carrierModeLoading, carrierMode, homeDeliveryOptions.length, pickupMethod]);

  useEffect(() => {
    if (isGuest) {
      const stored = localStorage.getItem("guest_cart");
      if (stored) {
        try {
          setLocalCart(JSON.parse(stored));
        } catch {
          setLocalCart([]);
        }
      }
    }
  }, [isGuest]);

  // O formulário de convidado segue o país atual (código postal e região mudam de formato).
  useEffect(() => {
    setGuestAddress((prev) => (prev.country === country.code ? prev : { ...prev, country: country.code, postal_code: "", district: "", parish: "" }));
  }, [country.code]);

  const effectiveItems = isGuest ? localCart : cartItems;
  // Estoque de agora: o que esgotou (ou tem menos unidades) depois de entrar no carrinho trava o pedido até ajustar.
  // O servidor (create-order) confere o mesmo antes de gravar.
  const cartStock = useCartStock(effectiveItems as any[]);
  // Pré-venda (recurso preorders): o pedido com um item de pré-venda segue junto quando ele estiver disponível.
  const preorders = usePreorders();
  const { t: tpre } = useMessages(preordersMessages);
  const hasPreorder = (effectiveItems as any[]).some((i) => preorders.has(String(i.product_id ?? i.productId ?? "")) && !i.design_data?.customization && !i.design_data?.rental);
  const { t: tcart } = useMessages(cartMessages);
  // Produtos digitais sem entrega física (recurso digital_products): carrinho só com eles não tem frete (o servidor
  // confere o mesmo em create-order).
  const digitalCart = useDigitalOnlyIds((effectiveItems as any[]).map((i) => String(i?.product_id ?? i?.productId ?? "")));
  const digitalOnly = effectiveItems.length > 0 && (effectiveItems as any[]).every((i) => digitalCart.ids.has(String(i?.product_id ?? i?.productId ?? "")));
  // Verification fees stored inside the design_data of configurator lines.
  const guestVerificationNet = isGuest
    ? localCart.reduce(
        (s, i: any) => s + Math.max(0, Number(i?.design_data?.verificationTotal || 0)) * (i.quantity || 1),
        0,
      )
    : 0;
  const guestVerificationVat = isGuest
    ? localCart.reduce((s, i: any) => {
        const n = Math.max(0, Number(i?.design_data?.verificationTotal || 0)) * (i.quantity || 1);
        return s + n * (getVatRate(i.vat_rate) / 100);
      }, 0)
    : 0;
  const verificationSubtotal = isGuest ? guestVerificationNet : vSub;
  const verificationVat = isGuest ? guestVerificationVat : vVat;
  const effectiveSubtotal = isGuest
    ? localCart.reduce((sum, i: any) => {
        const u = guestItemPricing(i).unit;
        const verif = Math.max(0, Number(i?.design_data?.verificationTotal || 0));
        const isBundle = guestItemPricing(i).isMeterBundle;
        return sum + (u - (isBundle ? verif : 0)) * i.quantity;
      }, 0)
    : subtotal;
  const effectiveVat = isGuest
    ? localCart.reduce((sum, i: any) => {
        const p = guestItemPricing(i);
        const verif = Math.max(0, Number(i?.design_data?.verificationTotal || 0));
        const printingUnit = p.isMeterBundle ? Math.max(0, p.unit - verif) : p.unit;
        const taxableLine = printingUnit * i.quantity + verif * i.quantity;
        return sum + taxableLine * (getVatRate(i.vat_rate) / 100);
      }, 0)
    : vatTotal;
  const effectiveWeight = isGuest ? localCart.reduce((sum, i) => sum + (i.weight || 0.5) * i.quantity, 0) : totalWeight;

  // Endereços do país atual (o servidor aplica as regras do país do pedido); os de outros países ficam à parte.
  const countryAddresses = useMemo(
    () => addresses.filter((a) => addressCountryCode(a.country, country.code) === country.code),
    [addresses, country.code],
  );
  const otherAddresses = useMemo(
    () => addresses.filter((a) => addressCountryCode(a.country, country.code) !== country.code),
    [addresses, country.code],
  );
  // País de entrega = país do topo do site (só os países ativos). Escolher um endereço de outro país ativo troca o país,
  // como o seletor do topo (moeda, impostos, frete, pagamento e idioma do país).
  const { data: activeCountries = [] } = useCountries();
  const setCountryCode = useCountryStore((s) => s.setCode);
  const setSiteLocale = useLocale((s) => s.setLocale);
  const deliverToOtherAddress = (a: { id: string; country?: string | null }) => {
    const target = activeCountries.find((c) => c.code === addressCountryCode(a.country, country.code));
    if (!target) return;
    setCountryCode(target.code);
    setSiteLocale(target.locale);
    setSelectedAddressId(a.id);
  };

  const discount = calculateDiscount(effectiveSubtotal);
  const selectedAddress = countryAddresses.find((addr) => addr.id === selectedAddressId);
  const currentDistrict = isGuest ? guestAddress.district : selectedAddress?.district;
  const shippingCost = deliveryType === "pickup" ? 0 : shippingInfo?.cost || 0;
  const SHIPPING_VAT_RATE = showsTaxSeparately() ? getCountry().shippingTaxRate : 0;
  const shippingVat = shippingCost * (SHIPPING_VAT_RATE / 100);
  const shippingGross = shippingCost + shippingVat;
  // Extras do checkout: preço sem imposto (como os produtos) + imposto do país; só com conta (o pedido vai pelo create-order).
  const { data: extraFieldsAll } = useCheckoutFields(country.code);
  const extraFields = isGuest ? [] : extraFieldsAll;
  const extras = answerLines(extraFields, fieldAnswers);
  const extrasNet = extras.total;
  const extrasVat = showsTaxSeparately() ? extrasNet * (getVatRate() / 100) : 0;
  // Prazos e entrega (recurso delivery_dates): o produto mais demorado do carrinho + dias da forma de envio; o
  // create-order grava as mesmas datas no pedido.
  const delivery = useDeliveryRules();
  const datesOn = delivery.on && delivery.settings.show_in_checkout;
  const { data: leadRows } = useLeadTimes(isGuest ? [] : cartItems.map((i: any) => i.product_id), datesOn);
  const cartLead = cartLeadTime(leadRows ?? [], delivery.settings);
  const arrivalText = (min: number | null | undefined, max: number | null | undefined) => {
    if (!datesOn || !leadRows) return null;
    const e = estimateDelivery(new Date(), cartLead, min == null && max == null ? null : { min: min ?? null, max: max ?? null }, delivery.settings, country.code);
    if (!e.deliver_from || !e.deliver_to) return tdd("ships_by_short", { date: formatDay(e.ship_by, locale) });
    return e.deliver_from === e.deliver_to
      ? tdd("arrives_same", { date: formatDay(e.deliver_to, locale) })
      : tdd("arrives", { from: formatDay(e.deliver_from, locale, false), to: formatDay(e.deliver_to, locale, false) });
  };
  const pickupReadyText = datesOn && leadRows
    ? tdd("pickup_ready", { date: formatDay(estimateDelivery(new Date(), cartLead, null, delivery.settings, country.code).ship_by, locale) })
    : null;
  const totalBeforePayment = effectiveSubtotal + verificationSubtotal + effectiveVat + shippingGross + extrasNet + extrasVat - discount;
  // Meios que aceitam este valor (pedido mínimo e máximo) e desconto do meio escolhido (só para mostrar: o servidor recalcula).
  const payableConfigs = useMemo(
    () => countryPaymentConfigs.filter((c) => !methodBlock(c, country.code, totalBeforePayment)),
    [countryPaymentConfigs, country.code, totalBeforePayment],
  );
  const payDiscount = paymentDiscount(payableConfigs.find((c) => c.type === paymentMethod), effectiveSubtotal + verificationSubtotal + effectiveVat - discount);
  // Pontos (só com conta): o máximo que as regras deixam usar e quantos a compra rende; o servidor recalcula.
  const pointsOn = useFeature("reward_points") && !isGuest;
  const { data: pointsBalance } = useMyRewardPoints();
  const { data: pointsRules } = useRewardSettings();
  const { use: usePoints, setUse: setUsePoints } = usePointsChoice();
  const productsPayable = effectiveSubtotal + verificationSubtotal + effectiveVat - discount - payDiscount;
  const pointsMax = pointsOn && pointsBalance && pointsRules ? maxRedeemable(pointsBalance.balance, productsPayable, totalBeforePayment - payDiscount, pointsRules) : 0;
  const pointsUsed = usePoints ? pointsMax : 0;
  const pointsAmount = pointsUsed && pointsRules ? pointsValue(pointsUsed, pointsRules) : 0;
  const pointsEarn = pointsOn && pointsRules ? pointsEarned(productsPayable - pointsAmount, pointsRules) : 0;
  // Vale-presente (só com conta, como o cupom): desconta o saldo até zerar o pedido; o servidor recalcula.
  const giftOn = useFeature("gift_cards");
  const { applied: giftCard, remove: removeGiftCard } = useAppliedGiftCard();
  const giftAmount = giftOn && giftCard && !isGuest ? giftApplied(giftCard.balance, totalBeforePayment - payDiscount - pointsAmount) : 0;
  const finalTotal = totalBeforePayment - payDiscount - pointsAmount - giftAmount;

  // Primeiro meio de pagamento disponível (mantém a escolha do cliente enquanto existir).
  useEffect(() => {
    if (payableConfigs.length === 0) return;
    setPaymentMethod((cur) =>
      paymentTouched.current && payableConfigs.some((c) => c.type === cur) ? cur : payableConfigs[0].type,
    );
  }, [payableConfigs]);

  const itemMeta = (design: any, fallback?: { variation?: string; size?: string }) => {
    const color = design?.variation ?? fallback?.variation;
    const size = design?.size ?? fallback?.size;
    const sub = design?.subscription && typeof design.subscription === "object" ? design.subscription : null;
    return [
      typeof color === "string" && color ? t("sumColor", { name: color }) : "",
      typeof size === "string" && size ? t("sumSize", { name: size }) : "",
      sub ? (sub.subscription_id ? tsub("cart_renewal") : tsub("cart_label", { every: everyText(tsub, String(sub.unit), Number(sub.count) || 1) })) : "",
      design?.rental && typeof design.rental === "object"
        ? `${rentalRangeText(trent, locale, design.rental)} (${periodsText(trent, String(design.rental.unit), Number(design.rental.periods) || 1)})` : "",
    ].filter(Boolean).join(" · ");
  };
  const liveItems: SummaryItem[] = isGuest
    ? localCart.map((item: any, idx) => ({
        key: `${item.productId}-${idx}`,
        image: item.image,
        name: item.name,
        meta: itemMeta(item.design_data, item),
        areas: item.design_data?.customization?.areas,
        quantity: item.quantity,
        price: convert(item.price * item.quantity),
      }))
    : cartItems.map((item: any) => ({
        key: item.id,
        image: item.design_data?.image || item.products?.image || "",
        name: item.products?.name || "",
        meta: itemMeta(item.design_data),
        areas: item.design_data?.customization?.areas,
        quantity: item.quantity,
        price: convert((item._pricing?.unitPrice ?? item.products?.price ?? 0) * item.quantity),
      }));

  const captureProcessingSnapshot = () => {
    setProcessingSnapshot({
      itemCount: effectiveItems.reduce((s, i: any) => s + i.quantity, 0),
      subtotal: effectiveSubtotal,
      vat: effectiveVat,
      verificationNet: verificationSubtotal,
      verificationGross: verificationSubtotal + verificationVat,
      discount,
      payDiscount,
      giftAmount,
      giftCode: giftAmount > 0 && giftCard ? giftCard.code : null,
      pointsUsed,
      pointsAmount,
      extrasNet,
      extrasVat,
      shippingGross,
      total: finalTotal,
      couponCode: appliedCoupon?.code || null,
      items: liveItems,
    });
  };

  const freeShippingThreshold = currentDistrict ? getFreeShippingThreshold(currentDistrict) : 50;
  const remainingForFreeShipping = Math.max(0, freeShippingThreshold - effectiveSubtotal);
  const freeShippingProgress = Math.min(100, (effectiveSubtotal / freeShippingThreshold) * 100);

  useEffect(() => {
    // Com o pagamento Viva aberto, o carrinho já foi esvaziado (o pedido existe): não é um carrinho vazio.
    if (effectiveItems.length === 0 && !isProcessing && !vivaEmbedOrder) {
      const timer = setTimeout(() => {
        if (effectiveItems.length === 0) {
          toast.error(t("toastEmptyCart"));
          navigate("/produtos");
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [effectiveItems, navigate, isProcessing, vivaEmbedOrder, t]);

  useEffect(() => {
    if (isGuest) return;
    if (selectedAddressId && countryAddresses.some((a) => a.id === selectedAddressId)) return;
    const defaultAddress = countryAddresses.find((addr) => addr.is_default) ?? countryAddresses[0];
    setSelectedAddressId(defaultAddress?.id ?? "");
  }, [countryAddresses, selectedAddressId, isGuest]);

  // Preselect billing address (billing default > shipping default > first)
  useEffect(() => {
    if (!isGuest && addresses.length > 0 && !selectedBillingAddressId) {
      const billingDefault = addresses.find((a: any) => a.is_billing_default);
      const shippingDefault = addresses.find((a) => a.is_default);
      setSelectedBillingAddressId((billingDefault || shippingDefault || addresses[0]).id);
    }
  }, [addresses, selectedBillingAddressId, isGuest]);

  // Um endereço acabado de criar no formulário fica escolhido.
  const knownAddressIds = useRef<Set<string> | null>(null);
  const selectNewAddress = useRef<"shipping" | "billing" | null>(null);
  useEffect(() => {
    const prev = knownAddressIds.current;
    knownAddressIds.current = new Set(addresses.map((a) => a.id));
    if (!prev || !selectNewAddress.current) return;
    const fresh = addresses.find((a) => !prev.has(a.id));
    if (!fresh) return;
    if (selectNewAddress.current === "shipping" && countryAddresses.some((a) => a.id === fresh.id)) setSelectedAddressId(fresh.id);
    if (selectNewAddress.current === "billing") setSelectedBillingAddressId(fresh.id);
    selectNewAddress.current = null;
  }, [addresses, countryAddresses]);

  useEffect(() => {
    let cancelled = false;
    const flatInfo = (m: DeliveryMethodData) => ({
      cost: Number(m.config.flat_rate ?? 0) + Number(m.config.extra_cost ?? 0),
      estimatedDays: { min: Number(m.config.flat_min_days ?? 1), max: Number(m.config.flat_max_days ?? 3) },
      freeShipping: false,
    });
    const doCalc = async () => {
      if (digitalOnly) {
        setShippingInfo({ cost: 0, estimatedDays: { min: 0, max: 0 }, freeShipping: true });
        return;
      }
      if (deliveryType === "pickup") {
        setShippingInfo(null);
        return;
      }
      // Forma de envio por transportadora: preço e prazo já vêm da cotação do servidor.
      if (carrierMode) {
        const cfg = homeDeliveryMethod?.config;
        setShippingInfo(cfg?.shipping_mode === "carrier"
          ? {
            cost: Number(cfg.carrier_cost ?? 0),
            estimatedDays: { min: Number(cfg.flat_min_days ?? 0), max: Number(cfg.flat_max_days ?? cfg.flat_min_days ?? 0) },
            freeShipping: !!cfg.carrier_free,
          }
          : null);
        return;
      }
      // Fora de Portugal o servidor só aceita a tarifa fixa (shippingFor em _shared/pricing.ts).
      if (!isDistrictCountry) {
        setShippingInfo(homeDeliveryMethod?.config?.shipping_mode === "flat_rate" ? flatInfo(homeDeliveryMethod) : null);
        return;
      }
      // Ilhas/Açores: entrega sob orçamento, não calcula portes aqui
      if (shippingRegion === "ilhas") {
        setShippingInfo(null);
        return;
      }
      // Flat rate mode (admin-configured fixed shipping)
      if (homeDeliveryMethod?.config?.shipping_mode === "flat_rate") {
        setShippingInfo(flatInfo(homeDeliveryMethod));
        return;
      }
      // Sem o método de entrega carregado não se usa a tabela estática por distrito (gravava tarifas erradas);
      // o total fica indefinido até o método carregar.
      if (deliveryType === "delivery" && (deliveryMethodsLoading || !homeDeliveryMethod)) {
        setShippingInfo(null);
        return;
      }
      const district = isGuest ? guestAddress.district : selectedAddress?.district;
      if (!district) {
        setShippingInfo(null);
        return;
      }
      const result = await calculateShippingByDistrict(effectiveWeight || 0.5, district, effectiveSubtotal);
      if (result && !cancelled)
        setShippingInfo({ cost: result.cost, estimatedDays: result.estimatedDays, freeShipping: result.freeShipping });
    };
    doCalc();
    return () => {
      cancelled = true;
    };
  }, [
    selectedAddress,
    guestAddress.district,
    effectiveWeight,
    effectiveSubtotal,
    isGuest,
    deliveryType,
    homeDeliveryMethod,
    shippingRegion,
    isDistrictCountry,
    deliveryMethodsLoading,
    carrierMode,
    digitalOnly,
  ]);

  // Check pickup eligibility by city match
  useEffect(() => {
    if (deliveryType !== "pickup") return;
    if (!pickupMethod?.config?.city_only || !pickupMethod?.config?.city) {
      setPickupEligible(true);
      return;
    }
    const buyerCity = (isGuest ? guestAddress.city : selectedAddress?.city || "").toLowerCase().trim();
    const storeCity = (pickupMethod.config.city || "").toLowerCase().trim();
    setPickupEligible(!!buyerCity && buyerCity === storeCity);
  }, [deliveryType, pickupMethod, isGuest, guestAddress.city, selectedAddress]);

  const handlePlaceOrder = async () => {
    // Guest checkout is disabled by the guest-order Edge Function (410). Keep
    // the local cart/design blobs untouched and send customers to sign-in
    // instead of creating a broken checkout attempt.
    if (isGuest) {
      toast.error(t("toastGuestLogin"));
      navigate(`/auth?redirect=${encodeURIComponent("/checkout")}`);
      return;
    }
    if (deliveryType === "pickup" && paymentMethod === "on_delivery") {
      // OK - allowed
    } else if (deliveryType === "pickup" && !pickupEligible) {
      toast.error(t("toastPickupCity"));
      return;
    }

    if (deliveryType === "pickup" && !pickupAck) {
      toast.error(t("blockPickupAck"));
      return;
    }

    if (pauseActive && !pauseAck) {
      toast.error(t("blockPause"));
      return;
    }

    if (!termsAck) {
      toast.error(t("blockTerms"));
      return;
    }

    const hasCustomizableItems = (effectiveItems as any[]).some(
      (it) => it?.products?.customizable === true || !!it?.design_data?.cartItemKey || Array.isArray(it?.design_data?.planos),
    );
    if (hasCustomizableItems && !personalizedTermsAck) {
      toast.error(t("blockCustom"));
      return;
    }

    // Helper: after order exists, if Viva Wallet is selected, open the embedded
    // Native Checkout dialog instead of redirecting. Returns true when the flow
    // is being handed off to the embed (so the caller must NOT navigate away).
    const maybeRedirectToViva = async (orderId: string) => {
      // Pedido pago todo com vale-presente: nada a cobrar.
      if (finalTotal <= 0) return false;
      if (isOnlineGateway(paymentMethod)) {
        // Mercado Pago, Stripe ou PayPal: o servidor abre o pagamento com o total do pedido e o cliente segue para lá.
        // Se falhar, a confirmação do pedido mostra o botão para pagar.
        const { data } = await supabase.functions.invoke("payment-start", { body: { orderId, locale } }).catch(() => ({ data: null }));
        if (data?.url) { window.location.assign(String(data.url)); return true; }
        return false;
      }
      if (paymentMethod !== "viva") return false;
      setVivaEmbedOrder({ id: orderId, total: finalTotal });
      return true;
    };

    if (isGuest) {
      if (!guestEmail.trim() || !guestName.trim()) {
        toast.error(t("toastGuestFill"));
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(guestEmail.trim())) {
        toast.error(t("toastEmailInvalid"));
        return;
      }
      if (
        deliveryType === "delivery" &&
        (!guestAddress.street || !guestAddress.city || !guestAddress.district || !guestAddress.postal_code ||
          (guestFmt.parishRequired && !guestAddress.parish))
      ) {
        toast.error(t("blockGuestAddress"));
        return;
      }
      if (deliveryType === "delivery" && !isValidPostal(guestFmt, guestAddress.postal_code)) {
        toast.error(ta("invalidPostal", { label: ta(postalKey(guestFmt)), example: guestFmt.postalPlaceholder }));
        return;
      }
      captureProcessingSnapshot();
      setIsProcessing(true);
      try {
        const items = localCart.map((item: any) => {
          const p = guestItemPricing(item);
          return {
            productId: item.productId,
            quantity: item.quantity,
            price: p.unit, // tier-aware effective unit price
            designData: {
              ...(item.design_data || {}),
              pricing: {
                base_price: Number(item.price || 0),
                unit_price: p.unit,
                applied_tier: p.tier,
              },
            },
          };
        });
        const shippingAddress =
          deliveryType === "pickup"
            ? {
                name: "Levantamento na Loja",
                street: pickupMethod?.config?.address || "",
                city: pickupMethod?.config?.city || "",
                district: pickupMethod?.config?.district || pickupMethod?.config?.state || "",
                postal_code: pickupMethod?.config?.postal_code || pickupMethod?.config?.zip_code || "",
                country: getCountry().code,
              }
            : { ...guestAddress, name: guestName };
        const { data, error } = await supabase.functions.invoke("guest-order", {
          body: {
            action: "create_order",
            guestEmail: guestEmail.trim(),
            guestName: guestName.trim(),
            guestPhone: guestPhone.trim(),
            items,
            total: finalTotal,
            shippingAddress,
            shippingCost,
            couponCode: appliedCoupon?.code,
            discountAmount: discount,
            paymentMethod,
            notes: deliveryType === "pickup" ? "LEVANTAMENTO NA LOJA" : undefined,
            termsAcceptance: {
              hasCustomizableItems: (localCart as any[]).some(
                (it) => !!it?.design_data?.cartItemKey || Array.isArray(it?.design_data?.planos),
              ),
              termsAcceptedAt: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        localStorage.removeItem("guest_cart");
        removeCoupon(true);
        try {
          const { notifyOrderCreated } = await import("@/lib/notifyOrderEmail");
          await notifyOrderCreated(data.order.id);
        } catch (e) {
          console.error(e);
        }
        const redirected = await maybeRedirectToViva(data.order.id);
        if (!redirected) navigate(`/pedido/${data.order.id}/sucesso`);
      } catch {
        // O resumo volta a mostrar os valores atuais (o congelado só serve enquanto o pedido é criado).
        setProcessingSnapshot(null);
        toast.error(t("toastOrderError"));
      } finally {
        setIsProcessing(false);
      }
    } else {
      if (deliveryType === "delivery" && (!selectedAddressId || !selectedAddress)) {
        toast.error(t("blockAddress"));
        return;
      }
      // Pré-validação: todos os itens personalizados do carrinho têm de ter os ficheiros
      // renderizados neste dispositivo antes de sequer criar o pedido. Se algum
      // item falhar (blob em falta, IndexedDB apagado, browser diferente…),
      // recusa o checkout e evita gerar encomendas sem ficheiro de impressão.
      const customFileItems = (cartItems as any[]).filter((it) => it?.design_data?.cartItemKey);
      if (customFileItems.length > 0) {
        for (const it of customFileItems) {
          const key = it.design_data.cartItemKey as string;
          const pending = await getPending(key);
          const ok =
            !!pending &&
            it.design_data?.readyForCheckout === true &&
            Array.isArray(pending.planos) &&
            pending.planos.length > 0 &&
            pending.planos.every((p) => p.png && (p.png as Blob).size > 0 && p.preview && (p.preview as Blob).size > 0);
          if (!ok) {
            const label = it.products?.name || t("itemCustomFallback");
            toast.error(t("toastFileMissing", { name: label }), {
              duration: 12000,
              action: {
                label: t("toastRemoveItem"),
                onClick: async () => {
                  try { await delPending(key); } catch { /* ignore */ }
                  removeItem(it.id);
                  toast.success(t("toastItemRemoved", { name: label }));
                },
              },
            });
            return;
          }
        }
      }
      captureProcessingSnapshot();
      setIsProcessing(true);
      try {
        const shippingAddress =
          deliveryType === "pickup"
            ? {
                name: "Levantamento na Loja",
                street: pickupMethod?.config?.address || "",
                city: pickupMethod?.config?.city || "",
              }
            : selectedAddress;
        // Billing address: same as shipping by default, otherwise the address the user picked.
        const billingAddress = billingSameAsShipping
          ? shippingAddress
          : addresses.find((a) => a.id === selectedBillingAddressId) || shippingAddress;
        // Fetch real profile name/phone so we never store the address label ("casa", "trabalho"…) as the customer's name.
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name, phone, tax_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!profile?.full_name?.trim() || !profile?.phone?.trim() || (getCountry().taxIdRequired && !isValidTaxId(getCountry().taxIdKind, String((profile as any)?.tax_id ?? "")))) {
          setProcessingSnapshot(null);
          setIsProcessing(false);
          toast.error(t("toastProfileIncomplete"));
          navigate("/dashboard?tab=perfil");
          return;
        }
        const customerName =
          (profile?.full_name || "").trim() || ((user.user_metadata as any)?.full_name || "").trim() || null;
        const customerPhone = (profile?.phone || "").trim() || null;
        const pauseNote = pauseNoteForOrder(pauseCfg);
        const notesCombined =
          [deliveryType === "pickup" ? "LEVANTAMENTO NA LOJA" : null, pauseNote || null].filter(Boolean).join("\n") ||
          null;
        const orderItems = cartItems.map((item: any) => {
          const p = item._pricing || {};
          const unit = Number(p.unitPrice ?? item.products.price);
          return {
            product_id: item.product_id,
            quantity: item.quantity,
            price: unit,
            design_data: {
              ...(item.design_data || {}),
              pricing: {
                base_price: Number(p.basePrice ?? item.products.price),
                unit_price: unit,
                applied_tier: p.appliedTier || null,
              },
            },
          };
        });
        const orderPayload = {
          guest_email: user.email || null,
          guest_name: customerName,
          guest_phone: customerPhone,
          total: finalTotal,
          // O servidor calcula o desconto do cupom a partir do subtotal sem IVA.
          subtotal_net: effectiveSubtotal,
          vat_total: effectiveVat,
          shipping_address: shippingAddress as any,
          billing_address: { ...(billingAddress as any), nif: String((profile as any)?.tax_id ?? "").replace(/\D/g, "") } as any,
          shipping_cost: shippingCost,
          coupon_code: appliedCoupon?.code || null,
          discount_amount: discount,
          payment_method: paymentMethod,
          delivery_method_id: deliveryType === "pickup" ? pickupMethod?.id || null : homeDeliveryMethod?.id?.startsWith("svc:") ? null : homeDeliveryMethod?.id || null,
          // Forma de envio por transportadora: o servidor volta a cotar esta opção com o endereço do pedido.
          shipping_service_id: deliveryType === "delivery" && homeDeliveryMethod?.id?.startsWith("svc:") ? homeDeliveryMethod.id.slice(4) : null,
          notes: notesCombined,
          has_customizable_items: (cartItems as any[]).some(
            (it) =>
              it?.products?.customizable === true ||
              !!it?.design_data?.cartItemKey ||
              Array.isArray(it?.design_data?.planos),
          ),
          terms_accepted_at: new Date().toISOString(),
        };
        // O servidor (Edge Function create-order) recalcula todos os valores e grava encomenda, linhas,
        // stock e cupom numa só transação. Os valores enviados daqui servem só de referência.
        let order: any;
        const viaServer = await supabase.functions.invoke("create-order", { body: { order: { ...orderPayload, country_code: getCountry().code, gift_card_code: giftAmount > 0 && giftCard ? giftCard.code : null, reward_points: pointsUsed || null, checkout_fields: showExtras ? fieldAnswers : null }, items: orderItems, affiliate_code: currentAffiliateCode() } });
        if (!viaServer.error) {
          order = (viaServer.data as any)?.order;
          if (!order?.id) throw new Error(t("toastOrderError"));
        } else if ((viaServer.error as any)?.context?.status !== 404) {
          const body = await (viaServer.error as any)?.context?.json?.().catch(() => null);
          // Esgotou enquanto o cliente finalizava: volta a ler o estoque para destacar os itens.
          if (body?.code === "out_of_stock") {
            void cartStock.refetch();
            throw Object.assign(new Error(tcart("stockChanged")), { customer: true });
          }
          throw Object.assign(new Error(body?.message || t("toastOrderError")), { customer: true });
        }
        if (!order) {
          // Função create-order ainda não implantada: caminho anterior (RPC, ou gravação direta sem a RPC).
          const created = await (supabase as any).rpc("create_order_checkout", { _order: orderPayload, _items: orderItems });
          if (created.error && (created.error.code === "PGRST202" || created.error.code === "42883")) {
            const legacy = await supabase
              .from("orders")
              .insert([{ ...orderPayload, user_id: user.id, payment_status: "pending", status: "pending" } as any])
              .select()
              .single();
            if (legacy.error) throw legacy.error;
            const { error: itemsError } = await supabase
              .from("order_items")
              .insert(orderItems.map((line: any) => ({ ...line, order_id: legacy.data.id })));
            if (itemsError) throw itemsError;
            order = legacy.data;
          } else {
            if (created.error) throw created.error;
            order = created.data;
          }
        }
        clearCart();
        removeCoupon(true);
        removeGiftCard();
        setUsePoints(false);
        if (customFileItems.length > 0) {
          // Keep the order pending until the server has verified every file.
          navigate(`/pedido/${order.id}/sucesso`);
        } else {
          try {
            const { notifyOrderCreated } = await import("@/lib/notifyOrderEmail");
            await notifyOrderCreated(order.id);
          } catch (e) {
            console.error(e);
          }
          const redirected = await maybeRedirectToViva(order.id);
          if (!redirected) navigate(`/pedido/${order.id}/sucesso`);
        }
      } catch (error: any) {
        setProcessingSnapshot(null);
        // Mostra só as mensagens pensadas para o cliente (stock, cupom, sessão); o resto fica genérico.
        const message = String(error?.message ?? "");
        toast.error(error?.customer || /^(Stock insuficiente|Cupom|Sessão expirada)/.test(message) ? message : t("toastOrderError"));
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Admin > Carrinho e checkout (store_settings.checkout_page): no modo compacto, as etapas que já chegam preenchidas
  // (contato, entrega, endereço, faturamento) recolhem numa linha com Alterar; o cliente reabre ou recolhe com Continuar.
  // A lista do que está completo é calculada mais abaixo (depois das pendências) e lida por este efeito, que só
  // recolhe nos primeiros segundos depois de tudo carregar e nunca uma etapa que o cliente reabriu.
  const checkoutPage = useCheckoutPage();
  const { t: tcp } = useMessages(checkoutPageMessages);
  const [doneSteps, setDoneSteps] = useState<ReadonlySet<CheckoutStepId>>(() => new Set());
  const [stepTried, setStepTried] = useState<CheckoutStepId | null>(null);
  const reopenedSteps = useRef<Set<CheckoutStepId>>(new Set());
  const autoFold = useRef<{ until: number | null; ready: boolean; complete: CheckoutStepId[] }>({ until: null, ready: false, complete: [] });
  // Sem dependências de propósito: lê o ref escrito a cada desenho e só muda o estado ao acrescentar etapas na janela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = autoFold.current;
    if (checkoutPage.steps !== "compact" || !f.ready) return;
    if (f.until == null) f.until = Date.now() + 2500;
    if (Date.now() > f.until) return;
    const add = f.complete.filter((id) => !reopenedSteps.current.has(id) && !doneSteps.has(id));
    if (add.length) setDoneSteps((prev) => new Set([...prev, ...add]));
  });
  // Documento fiscal guardado (lido pelo BillingTaxIdCard): só para o resumo da etapa recolhida.
  const { data: storedTaxId } = useQuery<{ value: string; country: string | null }>({
    queryKey: ["profile-tax-id", user?.id],
    enabled: false,
    queryFn: async () => ({ value: "", country: null }),
  });
  // Barra fixa do celular: some enquanto o botão Finalizar pedido da revisão está na tela.
  const [placeButtonVisible, setPlaceButtonVisible] = useState(false);
  const placeObserver = useRef<IntersectionObserver | null>(null);
  const placeButtonRef = useCallback((el: HTMLButtonElement | null) => {
    placeObserver.current?.disconnect();
    placeObserver.current = null;
    if (!el || typeof IntersectionObserver === "undefined") return setPlaceButtonVisible(false);
    placeObserver.current = new IntersectionObserver(([entry]) => setPlaceButtonVisible(entry.isIntersecting), { threshold: 0.6 });
    placeObserver.current.observe(el);
  }, []);

  if (authLoading || !user) return <CheckoutShell title={`${t("seoTitle")} | ${storeName}`}><CheckoutSkeleton label={t("loading")} /></CheckoutShell>;
  if (effectiveItems.length === 0 && !isProcessing && !vivaEmbedOrder) return <CheckoutShell title={`${t("seoTitle")} | ${storeName}`}><CheckoutSkeleton label={t("loading")} /></CheckoutShell>;

  const hasCustomizableCartItems = (effectiveItems as any[]).some(
    (it) => it?.products?.customizable === true || !!it?.design_data?.cartItemKey || Array.isArray(it?.design_data?.planos),
  );
  // Erro ao carregar não é o mesmo que "não há formas configuradas": mostra o erro com "Tentar de novo".
  const carrierWaitsAddress = carrierMode && deliveryType === "delivery" && !quoteAddress;
  const carrierQuoteLoading = carrierMode && deliveryType === "delivery" && shippingQuote.isFetching && !shippingQuote.data;
  const noDeliveryOptions = carrierMode
    ? !pickupMethod && !!shippingQuote.data && shippingQuote.data.options.length === 0
    : !deliveryMethodsLoading && !deliveryMethodsError && homeDeliveryOptions.length === 0 && !pickupMethod;
  // Com retirada disponível, um endereço sem formas de envio só pede outra escolha (não bloqueia a página).
  const carrierNoneHere = carrierMode && deliveryType === "delivery" && !!shippingQuote.data && shippingQuote.data.options.length === 0;
  const blockedByIlhas = isDistrictCountry && deliveryType === "delivery" && shippingRegion === "ilhas";
  // Fora de Portugal, sem método de tarifa fixa o servidor não calcula o frete: explica e bloqueia.
  const shippingUnavailable =
    deliveryType === "delivery" && !isDistrictCountry && !deliveryMethodsLoading && homeDeliveryOptions.length > 0 && !flatMode;
  const shippingCalculationPending =
    deliveryType === "delivery" && !blockedByIlhas && !shippingUnavailable && !noDeliveryOptions && !deliveryMethodsError && !shippingInfo;
  const needsAddressForShipping = (isDistrictCountry && !flatMode && !currentDistrict) || carrierWaitsAddress;
  const noPaymentForCountry = !paymentsLoading && !paymentsError && payableConfigs.length === 0;
  const activePaymentConfig = payableConfigs.find((c) => c.type === paymentMethod);
  const payName = (cfg: PaymentConfigData) => localized(cfg.name_i18n, locale, (() => {
    const k = `pm_${cfg.type}` as CheckoutKey;
    return k in checkoutMessages["pt-BR"] ? t(k) : cfg.name;
  })());
  const payInstructions = (cfg: PaymentConfigData) => localized(cfg.instructions_i18n, locale, cfg.details?.instrucoes || "");
  const showBilling = !isGuest && (taxRules.enabled || deliveryType === "delivery");
  const guestAddressOk =
    !!guestAddress.district && !!guestAddress.street && !!guestAddress.postal_code && (!guestFmt.parishRequired || !!guestAddress.parish);

  // O que ainda falta para finalizar (a primeira mensagem aparece junto do botão).
  // Cada pendência sabe em que etapa se resolve: a etapa com pendência não recolhe e a barra do celular leva até ela.
  const blockers: string[] = [];
  const blockerSteps: CheckoutStepId[] = [];
  const block = (text: string, step: CheckoutStepId) => { blockers.push(text); blockerSteps.push(step); };
  if (cartStock.hasProblems) block(tcart("stockBlocked"), "review");
  if (!isGuest && contactLoading) block(t("loading"), "contact");
  else if (isGuest ? !guestEmail.trim() || !guestName.trim() : !contactOk) block(t("blockContact"), "contact");
  if (digitalOnly) {
    // Só produtos digitais: sem frete, mas o endereço continua a servir para a fatura.
    if (isGuest ? !guestAddressOk : !selectedAddressId) block(isGuest ? t("blockGuestAddress") : t("blockAddress"), "address");
  } else if (deliveryMethodsError) block(t("loadError"), "delivery");
  else if (noDeliveryOptions) block(t("blockDelivery"), "delivery");
  if (!digitalOnly && deliveryType === "delivery" && !noDeliveryOptions && !deliveryMethodsError) {
    // Sem frete para o país (ou ilhas sob orçamento), escolher endereço não resolve: essa explicação vem primeiro.
    if (blockedByIlhas) block(t("blockIslands"), "address");
    else if (shippingUnavailable) block(t("blockShipping", { country: countryLabel }), "delivery");
    if (isGuest ? !guestAddressOk : !selectedAddressId) block(isGuest ? t("blockGuestAddress") : t("blockAddress"), "address");
    if (carrierNoneHere) block(t("deliveryNoneHere"), "delivery");
    else if (carrierMode && shippingQuote.isError) block(t("deliveryQuoteError"), "delivery");
    else if (!blockedByIlhas && !shippingUnavailable && shippingCalculationPending && !carrierWaitsAddress) block(t("blockShippingPending"), "delivery");
  }
  // Mesma regra do handler: fora da cidade da loja, a retirada só vale com pagamento na entrega.
  if (!digitalOnly && deliveryType === "pickup" && pickupEligible === false && paymentMethod !== "on_delivery") block(t("toastPickupCity"), "delivery");
  if (!digitalOnly && deliveryType === "pickup" && !pickupAck) block(t("blockPickupAck"), "delivery");
  if (!isGuest && !taxIdOk) block(t("blockTaxId", { label: taxRules.label }), "billing");
  if (paymentsLoading) block(t("payLoading"), "payment");
  else if (paymentsError) block(t("loadError"), "payment");
  else if (noPaymentForCountry) block(t("blockPayment", { country: countryLabel }), "payment");
  if (pauseActive && !pauseAck) block(t("blockPause"), "review");
  if (!termsAck) block(t("blockTerms"), "review");
  if (hasCustomizableCartItems && !personalizedTermsAck) block(t("blockCustom"), "review");
  if (extras.errors.length) block(tcf("block"), "extras");
  const canPlaceOrderWithTerms = blockers.length === 0;

  // Numeração das secções visíveis
  const showExtras = extraFields.length > 0;
  const stepExtras = showBilling ? 5 : 4;
  const stepPay = stepExtras + (showExtras ? 1 : 0);
  const stepOf = { contact: 1, delivery: 2, address: 3, billing: 4, extras: stepExtras, payment: stepPay, review: stepPay + 1 };

  // Etapas recolhidas (modo compacto): completa = sem pendência dessa etapa e já carregada.
  const compactSteps = checkoutPage.steps === "compact";
  const stepComplete = (id: CheckoutStepId) =>
    !blockerSteps.includes(id) && (id !== "delivery" || !deliveryMethodsLoading) && (id !== "address" || !addressesLoading) && (id !== "contact" || !contactLoading);
  autoFold.current.ready = !contactLoading && !addressesLoading && !deliveryMethodsLoading && !paymentsLoading;
  autoFold.current.complete = (["contact", "delivery", "address", "billing"] as CheckoutStepId[]).filter(stepComplete);
  const isFolded = (id: CheckoutStepId) => stepFolded({ steps: checkoutPage.steps, id, complete: stepComplete(id), done: doneSteps });
  const visibleSteps: CheckoutStepId[] = [
    "contact", "delivery", "address",
    ...(showBilling ? ["billing" as const] : []),
    ...(showExtras ? ["extras" as const] : []),
    "payment", "review",
  ];
  const scrollToStep = (id: CheckoutStepId) => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => document.getElementById(`checkout-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
  };
  const reopenStep = (id: CheckoutStepId) => {
    reopenedSteps.current.add(id);
    setDoneSteps((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };
  const goToStep = (id: CheckoutStepId) => {
    if (isFolded(id)) reopenStep(id);
    scrollToStep(id);
  };
  // Continuar: recolhe a etapa (se estiver completa) e leva à seguinte que ainda está aberta.
  const finishStep = (id: CheckoutStepId) => {
    if (!stepComplete(id)) return setStepTried(id);
    setStepTried(null);
    setDoneSteps((prev) => new Set([...prev, id]));
    const after = visibleSteps.slice(visibleSteps.indexOf(id) + 1);
    scrollToStep(after.find((s) => !isFolded(s)) ?? "review");
  };
  const stepName: Record<CheckoutStepId, string> = {
    contact: tcp("stepContact"), delivery: tcp("stepDelivery"), address: tcp("stepAddress"), billing: tcp("stepBilling"),
    extras: tcp("stepExtras"), payment: tcp("stepPayment"), review: tcp("stepReview"),
  };
  const stepFooter = (id: CheckoutStepId) => {
    if (!compactSteps) return null;
    const missing = stepTried === id && !stepComplete(id) ? blockers[blockerSteps.indexOf(id)] : null;
    return (
      <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
        {missing && (
          <p role="status" className="flex items-start gap-2 text-[13px] font-medium text-brand-orange-text sm:mr-auto">
            <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />{missing}
          </p>
        )}
        <button type="button" onClick={() => finishStep(id)} className={cn(btnSecondary, "min-h-[44px] px-5 text-[14px]")}>
          {tcp("continue")}<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    );
  };

  // Resumo (valores congelados enquanto o pedido é criado)
  const S = processingSnapshot;
  const showTax = showsTaxSeparately();
  const taxRate = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(getVatRate());
  const subNet = S ? S.subtotal + S.verificationNet : effectiveSubtotal + verificationSubtotal;
  const extrasNetShown = S ? S.extrasNet : extrasNet;
  const extrasVatShown = S ? S.extrasVat : extrasVat;
  const vatShown = (S ? S.vat : effectiveVat) + extrasVatShown;
  const subtotalShown = showTax ? subNet : subNet + vatShown;
  const discountShown = S ? S.discount : discount;
  const payDiscountShown = S ? S.payDiscount : payDiscount;
  const giftShown = S ? S.giftAmount : giftAmount;
  const giftCodeShown = S ? S.giftCode : giftAmount > 0 && giftCard ? giftCard.code : null;
  const pointsUsedShown = S ? S.pointsUsed : pointsUsed;
  const pointsAmountShown = S ? S.pointsAmount : pointsAmount;
  const couponShown = S ? S.couponCode : appliedCoupon?.code;
  const totalShown = S ? S.total : finalTotal;
  const itemCount = S?.itemCount ?? effectiveItems.reduce((s, i: any) => s + i.quantity, 0);
  const itemsLabel = itemCount === 1 ? t("sumItems_one") : t("sumItems_other", { count: itemCount });
  const summaryItems = S ? S.items : liveItems;
  const withTax = (amount: number) => (showTax ? t("deliveryWithTax", { price: money(amount) }) : money(amount));
  const shippingText = S
    ? S.shippingGross > 0 ? money(S.shippingGross) : t("sumFree")
    : deliveryType === "pickup"
      ? t("sumPickupFree")
      : blockedByIlhas
        ? t("sumQuote")
        : shippingUnavailable || noDeliveryOptions || deliveryMethodsError
          ? t("sumUnavailable")
          : shippingInfo
            ? shippingInfo.freeShipping || shippingGross === 0 ? t("sumFree") : money(shippingGross)
            : needsAddressForShipping
              ? t("sumNeedsAddress")
              : t("sumPending");
  const shippingIsFree = !S && (deliveryType === "pickup" || (!!shippingInfo && (shippingInfo.freeShipping || shippingGross === 0)));
  const showFreeBar =
    !S && freeShippingBarEnabled && isDistrictCountry && !flatMode && deliveryType === "delivery" && !blockedByIlhas && remainingForFreeShipping > 0;

  const pickupAddressText = [pickupMethod?.config?.address, pickupMethod?.config?.postal_code, pickupMethod?.config?.city]
    .filter(Boolean)
    .join(", ");
  const pickupDeadline = Number(pickupMethod?.config?.pickup_deadline_days || 0);

  const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "");

  const contactLinks = (
    <div className="mt-3 flex flex-wrap gap-2">
      {whatsappDigits && (
        <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className={cn(btnSecondary, "min-h-[44px] px-4 text-[14px]")}>
          <MessageCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("contactWhatsapp")}
        </a>
      )}
      {storeInfo?.email && (
        <a href={`mailto:${storeInfo.email}`} className={cn(btnSecondary, "min-h-[44px] px-4 text-[14px]")}>
          <Mail className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("contactByEmail")}
        </a>
      )}
      <Link to="/contatos" className={cn(btnSecondary, "min-h-[44px] px-4 text-[14px]")}>{t("contactPage")}</Link>
    </div>
  );

  const closeVivaDialog = () => {
    const id = vivaEmbedOrder?.id;
    setVivaEmbedOrder(null);
    if (id) navigate(`/pedido/${id}/sucesso`);
  };

  const deliveryValue = deliveryType === "pickup" ? "pickup" : selectedDeliveryId ?? "";
  const onDeliveryChange = (v: string) => {
    if (v === "pickup") {
      setDeliveryType("pickup");
    } else {
      setDeliveryType("delivery");
      setSelectedDeliveryId(v);
    }
  };

  const reviewAddress =
    deliveryType === "pickup"
      ? pickupAddressText
      : isGuest
        ? (guestAddressOk ? addressLines(guestAddress, locale, country.code).join(", ") : "")
        : addressLines(selectedAddress, locale, country.code).join(", ");
  const selectedArrival = homeDeliveryMethod
    ? arrivalText(shippingInfo?.estimatedDays.min ?? (homeDeliveryMethod.config as any)?.flat_min_days, shippingInfo?.estimatedDays.max ?? (homeDeliveryMethod.config as any)?.flat_max_days)
    : null;
  const reviewRows: Array<{ label: string; value: string; href: string }> = [
    {
      label: t("reviewContact"),
      value: isGuest
        ? [guestName.trim(), guestEmail.trim()].filter(Boolean).join(" · ")
        : contactOk ? [contactProfile?.fullName.trim(), phoneDisplay(contactProfile?.phone)].filter(Boolean).join(" · ") : "",
      href: "#checkout-contact",
    },
    {
      label: t("reviewDelivery"),
      value: deliveryType === "pickup" ? pickupMethod?.name ?? "" : homeDeliveryMethod ? `${homeDeliveryMethod.name} · ${shippingText}` : "",
      href: "#checkout-delivery",
    },
    { label: deliveryType === "pickup" ? t("reviewPickup") : t("reviewAddress"), value: reviewAddress, href: "#checkout-address" },
    { label: t("reviewPayment"), value: activePaymentConfig?.name ?? "", href: "#checkout-payment" },
    ...(datesOn && deliveryType === "delivery" && homeDeliveryMethod && selectedArrival
      ? [{ label: tdd("summary"), value: selectedArrival, href: "#checkout-delivery" }]
      : []),
    ...(showExtras && extras.lines.length
      ? [{ label: tcf("section_title"), value: extras.lines.map((l) => `${localText(l.label, locale, l.name)}: ${answerText(l, locale, tcf("yes"))}`).join(" · "), href: "#checkout-extras" }]
      : []),
  ];

  // Resumo de cada etapa recolhida (modo compacto)
  const stepSummary: Partial<Record<CheckoutStepId, string>> = {
    contact: [contactProfile?.fullName.trim(), user.email, phoneDisplay(contactProfile?.phone)].filter(Boolean).join(" · "),
    delivery: [reviewRows[1].value, deliveryType === "delivery" && datesOn ? selectedArrival : null].filter(Boolean).join(" · "),
    address: reviewAddress,
    billing: [
      storedTaxId?.value ? `${taxRules.label} ${taxRules.format(storedTaxId.value)}` : null,
      deliveryType === "delivery" ? (billingSameAsShipping ? tcp("billingSameShort") : tcp("billingDiffShort")) : null,
    ].filter(Boolean).join(" · "),
    extras: extras.lines.map((l) => `${localText(l.label, locale, l.name)}: ${answerText(l, locale, tcf("yes"))}`).join(" · "),
  };
  const shortIntro = checkoutPage.intro === "short";
  const showMobileBar = checkoutPage.mobile_bar && !isDesktop;
  const foldProps = (id: CheckoutStepId) => ({
    folded: isFolded(id),
    summary: stepSummary[id],
    onEdit: () => reopenStep(id),
    footer: stepFooter(id),
  });

  const summaryBody = (
    <div className="space-y-5">
      <ul className="max-h-[340px] space-y-4 overflow-y-auto pr-1" aria-label={t("sumTitle")}>
        {summaryItems.map((item) => (
          <li key={item.key}><CartItemRow item={item} currency={currentCurrency} t={t} /></li>
        ))}
      </ul>
      <div className="border-t border-border pt-5">
        <CouponReveal totalAmount={effectiveSubtotal} />
        {pointsOn && <div className="mt-3"><RewardPointsInput maxPoints={pointsMax} earn={pointsEarn} money={money} /></div>}
        {!isGuest && <div className="mt-3"><GiftCardInput applied={giftAmount} money={money} /></div>}
      </div>
      {showFreeBar && (
        <div className="rounded-[14px] bg-accent px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-brand-orange-text">
            <Truck className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            {t("sumFreeLeft", { amount: money(remainingForFreeShipping) })}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label={t("sumFreeProgress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(freeShippingProgress)}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${freeShippingProgress}%` }} />
          </div>
        </div>
      )}
      <dl className="space-y-2.5 border-t border-border pt-5 text-[15px]">
        <div className="flex justify-between gap-4 text-brand-ink-soft">
          <dt>{showTax ? t("sumSubtotalNet") : t("sumSubtotal")}</dt>
          <dd className="tabular-nums">{money(subtotalShown)}</dd>
        </div>
        {showTax && (
          <div className="flex justify-between gap-4 text-brand-ink-soft">
            <dt>{t("sumTax", { rate: taxRate })}</dt>
            <dd className="tabular-nums">{money(vatShown)}</dd>
          </div>
        )}
        {extrasNetShown > 0 && (
          <div className="flex justify-between gap-4 text-brand-ink-soft">
            <dt className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tcf("summary")}</dt>
            <dd className="tabular-nums">{money(showTax ? extrasNetShown : extrasNetShown + extrasVatShown)}</dd>
          </div>
        )}
        {couponShown && (
          <div className="flex justify-between gap-4 font-medium text-emerald-700">
            <dt className="flex items-center gap-1.5"><Tag className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("sumCoupon", { code: couponShown })}</dt>
            <dd className="tabular-nums">-{money(discountShown)}</dd>
          </div>
        )}
        {pointsAmountShown > 0 && (
          <div className="flex justify-between gap-4 font-medium text-emerald-700">
            <dt className="flex items-center gap-1.5"><Coins className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tp("co_summary", { points: new Intl.NumberFormat(locale).format(pointsUsedShown) })}</dt>
            <dd className="tabular-nums">-{money(pointsAmountShown)}</dd>
          </div>
        )}
        {giftShown > 0 && giftCodeShown && (
          <div className="flex justify-between gap-4 font-medium text-emerald-700">
            <dt className="flex items-center gap-1.5"><Gift className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{tg("summary", { tail: giftCodeTail(giftCodeShown) })}</dt>
            <dd className="tabular-nums">-{money(giftShown)}</dd>
          </div>
        )}
        {payDiscountShown > 0 && (
          <div className="flex justify-between gap-4 font-medium text-emerald-700">
            <dt className="flex items-center gap-1.5"><Tag className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("sumPayDiscount")}</dt>
            <dd className="tabular-nums">-{money(payDiscountShown)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 text-brand-ink-soft">
          <dt className="flex items-center gap-1.5">
            {t("sumShipping")}
            {!S && shippingCalculationPending && !needsAddressForShipping && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          </dt>
          <dd className={cn("text-right tabular-nums", shippingIsFree && "font-semibold text-emerald-700")}>{shippingText}</dd>
        </div>
      </dl>
      <div className="flex items-end justify-between gap-4 border-t border-border pt-5">
        <div>
          <p className="text-[16px] font-semibold">{t("sumTotal")}</p>
          <p className="text-[13px] text-muted-foreground">{showTax ? t("sumTaxIncluded") : t("sumFinalPrice")}</p>
        </div>
        <p className="text-[30px] font-[780] leading-none tracking-[-0.03em] tabular-nums">{money(totalShown)}</p>
      </div>
      {/* Exibição de preços: lembra quanto os produtos custam no meio com desconto enquanto outro meio está escolhido. */}
      {!S && payDiscount === 0 && <CartPriceHint place="checkout" amount={effectiveSubtotal + verificationSubtotal + effectiveVat - discount} className="mt-3 text-right" />}
    </div>
  );

  // O selo de envio só aparece quando há de facto entrega em casa para o país atual.
  const shipsHere = deliveryMethodsLoading || carrierMode || homeDeliveryOptions.some(optionUsable);
  const trustSeals = checkoutPage.trust && (
    <div className="space-y-3">
      <TrustSeals t={t} ships={shipsHere} />
      <PaymentMethods className="justify-center lg:justify-start" />
    </div>
  );

  return (
    <CheckoutShell title={`${t("seoTitle")} | ${storeName}`} description={t("seoDescription")} barSpace={showMobileBar}>
      <div className="shell pt-5 md:pt-8">
        {/* Topo curto (Admin > Carrinho e checkout): no celular só o título e o voltar, para o formulário começar cedo. */}
        <div className={cn(shortIntro && "max-lg:hidden")}>
          <CatalogBreadcrumb items={[{ label: t("crumbHome"), href: "/" }, { label: t("crumbCart"), href: "/carrinho" }, { label: t("crumbCheckout") }]} />
        </div>

        <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", shortIntro ? "mt-1 lg:mt-4" : "mt-4")}>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="max-w-2xl">
            <p className={cn("flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-orange-text", shortIntro && "max-lg:hidden")}>
              <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />{t("eyebrow")}
            </p>
            <h1 className={cn("leading-[1.08] tracking-[-0.02em]", shortIntro ? "text-[28px] sm:text-[32px] lg:mt-2 lg:text-[38px]" : "mt-2 text-[30px] sm:text-[36px] lg:text-[40px]")}>{t("title")}</h1>
            <p className={cn("mt-2 text-[15px] leading-relaxed text-brand-ink-soft md:text-[16px]", shortIntro && "hidden")}>{t("subtitle")}</p>
          </motion.div>
          <Link to="/carrinho" className={cn(btnGhost, shortIntro && "max-lg:-ml-2")}>
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("backToCart")}
          </Link>
        </div>

        {/* Celular e tablet: resumo recolhível no topo */}
        {!isDesktop && (
          <div className={cn(card, shortIntro ? "mt-4" : "mt-6", "overflow-hidden")}>
            <button
              type="button"
              onClick={() => setSummaryOpen((o) => !o)}
              aria-expanded={summaryOpen}
              aria-controls="checkout-summary-mobile"
              className={cn("flex min-h-[60px] w-full items-center gap-3 px-5 py-3 text-left", focusRing)}
            >
              <ShoppingBag className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{summaryOpen ? t("sumHide") : t("sumShow")}</span>
                <span className="block text-[13px] text-muted-foreground">{itemsLabel}</span>
              </span>
              <span className="text-[18px] font-bold tabular-nums">{money(totalShown)}</span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200", summaryOpen && "rotate-180")} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <AnimatePresence initial={false}>
              {summaryOpen && (
                <motion.div
                  id="checkout-summary-mobile"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border px-5 pb-5 pt-5">{summaryBody}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        {!isDesktop && !S && <div className="mt-4"><CartKitHints items={cartItems as any[]} place="checkout" /></div>}

        <div className="mt-6 grid gap-6 pb-16 md:pb-20 lg:mt-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10 xl:gap-12">
          {/* Etapas recolhidas seguidas formam um só cartão, separadas por uma linha (lista curta de "já está feito"). */}
          <div className="min-w-0 space-y-5 [&>[data-folded]:has(+[data-folded])]:rounded-b-none [&>[data-folded]:has(+[data-folded])]:border-b-0 [&>[data-folded]+[data-folded]]:!mt-0 [&>[data-folded]+[data-folded]]:rounded-t-none">
            {/* 1 Contato */}
            <Section id="checkout-contact" step={stepOf.contact} title={t("contactTitle")} sub={t("contactSub")} icon={User} {...foldProps("contact")}>
              {isGuest ? (
                <div className="space-y-4">
                  <p className="rounded-[14px] bg-brand-alt px-4 py-3 text-[14px] text-brand-ink-soft">{t("contactGuestHint")}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("contactName")} htmlFor="guest-name" required>
                      <Input id="guest-name" autoComplete="name" placeholder={t("contactNamePh")} value={guestName} onChange={(e) => setGuestName(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label={t("contactEmail")} htmlFor="guest-email" required>
                      <Input id="guest-email" type="email" autoComplete="email" placeholder={t("contactEmailPh")} value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                  <Field label={t("contactPhone")} htmlFor="guest-phone">
                    <PhoneInputWithDDI id="guest-phone" value={guestPhone || `${country.code}:`} onChange={setGuestPhone} />
                  </Field>
                </div>
              ) : (
                <ContactCard userId={user.id} email={user.email ?? ""} profile={contactProfile} loading={contactLoading} />
              )}
            </Section>

            {/* 2 Entrega */}
            <Section id="checkout-delivery" step={stepOf.delivery} title={t("deliveryTitle")} sub={t("deliverySub")} icon={Truck} {...foldProps("delivery")}>
              {digitalOnly ? (
                <div className={cn(noteCls, "border-primary/30 bg-brand-orange-soft/50")} data-digital-delivery>
                  <FileDown className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
                  <div><p className="font-semibold">{tdig("checkout_title")}</p><p>{tdig("checkout_d")}</p></div>
                </div>
              ) : deliveryMethodsLoading ? (
                <div className="space-y-3" role="status" aria-label={t("deliveryLoading")}>
                  <div className="skeleton h-[84px] rounded-[16px]" />
                  <div className="skeleton h-[84px] rounded-[16px]" />
                </div>
              ) : deliveryMethodsError ? (
                <LoadError text={t("loadError")} retry={t("retry")} onRetry={() => void refetchDeliveryMethods()} />
              ) : noDeliveryOptions ? (
                <div className={cn(noteCls, "border-border bg-brand-alt")}>
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink-soft" strokeWidth={1.8} aria-hidden="true" />
                  <div><p>{carrierMode ? t("deliveryNoneHere") : t("deliveryNone")}</p>{contactLinks}</div>
                </div>
              ) : (
                <>
                {carrierMode && deliveryType === "delivery" && (carrierWaitsAddress || carrierQuoteLoading || carrierNoneHere || shippingQuote.isError) && (
                  carrierQuoteLoading ? (
                    <div className="mb-3 space-y-3" role="status" aria-label={t("deliveryLoading")}>
                      <div className="skeleton h-[84px] rounded-[16px]" />
                    </div>
                  ) : (
                    <div className={cn(noteCls, "mb-3 border-border bg-brand-alt")} role="status">
                      <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink-soft" strokeWidth={1.8} aria-hidden="true" />
                      <div>
                        <p>{carrierWaitsAddress ? t("deliveryNeedsAddress") : carrierNoneHere ? t("deliveryNoneHere") : t("deliveryQuoteError")}</p>
                        {carrierNoneHere && contactLinks}
                      </div>
                    </div>
                  )
                )}
                <RadioGroup value={deliveryValue} onValueChange={onDeliveryChange} className="gap-3" aria-label={t("deliveryTitle")}>
                  {homeDeliveryOptions.map((opt) => {
                    const usable = optionUsable(opt);
                    const isSelected = deliveryType === "delivery" && selectedDeliveryId === opt.id;
                    const cfg: any = opt.config || {};
                    const baseCost = cfg.shipping_mode === "carrier" ? Number(cfg.carrier_cost ?? 0) : typeof cfg.flat_rate === "number" ? cfg.flat_rate : null;
                    const minD = cfg.flat_min_days;
                    const maxD = cfg.flat_max_days;
                    const daysLabel = minD && maxD ? t("deliveryDays", { min: minD, max: maxD }) : minD ? t("deliveryDaysFrom", { min: minD }) : null;
                    const showFree = (isSelected && shippingInfo?.freeShipping) || !!cfg.carrier_free;
                    const grossOf = (n: number) => n * (1 + SHIPPING_VAT_RATE / 100);
                    const priceLabel = showFree
                      ? t("deliveryFree")
                      : isSelected && shippingInfo
                        ? withTax(shippingGross)
                        : baseCost != null
                          ? withTax(grossOf(baseCost))
                          : null;
                    const inlineDays =
                      isSelected && shippingInfo ? t("deliveryDays", { min: shippingInfo.estimatedDays.min, max: shippingInfo.estimatedDays.max }) : daysLabel;
                    const arrival = usable ? arrivalText(isSelected && shippingInfo ? shippingInfo.estimatedDays.min : minD, isSelected && shippingInfo ? shippingInfo.estimatedDays.max : maxD) : null;
                    return (
                      <label key={opt.id} htmlFor={`delivery-${opt.id}`} className={optionCls(isSelected && usable, !usable)}>
                        <RadioGroupItem value={opt.id} id={`delivery-${opt.id}`} disabled={!usable} className="mt-1 h-5 w-5" />
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
                          <Truck className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold">{opt.name}</span>
                          {opt.description && <span className="mt-0.5 block text-[13px] text-muted-foreground">{opt.description}</span>}
                          {usable ? (
                            (priceLabel || inlineDays) && (
                              <span className={cn("mt-1.5 block text-[13px] font-semibold", isSelected ? "text-brand-orange-text" : "text-brand-ink-soft")}>
                                {[priceLabel, inlineDays].filter(Boolean).join(" · ")}
                              </span>
                            )
                          ) : (
                            <span className="mt-1.5 block text-[13px] font-semibold text-brand-ink-soft">{t("deliveryUnavailableIn", { country: countryLabel })}</span>
                          )}
                          {arrival && (
                            <span className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                              <CalendarCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />{arrival}
                            </span>
                          )}
                        </span>
                        {isSelected && usable && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />}
                      </label>
                    );
                  })}

                  {pickupMethod && (
                    <label htmlFor="pickup" className={optionCls(deliveryType === "pickup")}>
                      <RadioGroupItem value="pickup" id="pickup" className="mt-1 h-5 w-5" />
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
                        <Store className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold">{pickupMethod.name}</span>
                          <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[12px] font-bold text-emerald-700">{t("pickupFree")}</span>
                        </span>
                        {pickupMethod.description && <span className="mt-0.5 block text-[13px] text-muted-foreground">{pickupMethod.description}</span>}
                        {pickupMethod.config?.address && (
                          <span className="mt-1 flex items-start gap-1.5 text-[13px] text-brand-ink-soft">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            {[pickupMethod.config.address, pickupMethod.config.city, pickupMethod.config.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {pickupMethod.config?.opening_hours && (
                          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-brand-ink-soft">
                            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            {t("pickupHours", { hours: pickupMethod.config.opening_hours })}
                          </span>
                        )}
                        {pickupReadyText && (
                          <span className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                            <CalendarCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />{pickupReadyText}
                          </span>
                        )}
                        {pickupDeadline > 0 && (
                          <span className="mt-0.5 block text-[13px] font-semibold text-brand-orange-text">
                            {pickupDeadline === 1 ? t("pickupDeadline_one", { count: 1 }) : t("pickupDeadline_other", { count: pickupDeadline })}
                          </span>
                        )}
                        {pickupEligible === true && deliveryType === "pickup" && (
                          <span className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />{t("pickupEligible")}
                          </span>
                        )}
                        {pickupEligible === false && deliveryType === "pickup" && (
                          <span className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-destructive">
                            <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />{t("pickupNotEligible")}
                          </span>
                        )}
                      </span>
                      {deliveryType === "pickup" && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />}
                    </label>
                  )}
                </RadioGroup>
                </>
              )}

              {deliveryType === "pickup" && pickupMethod && (
                <div className={cn(noteCls, "mt-4 border-primary/25 bg-accent/60")}>
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{t("pickupNoticeTitle")}</p>
                    <p className="mt-1 text-brand-ink-soft">{t("pickupNotice", { address: pickupAddressText })}</p>
                    <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3">
                      <Checkbox checked={pickupAck} onCheckedChange={(v) => setPickupAck(!!v)} className="h-5 w-5" />
                      <span className="font-medium text-foreground">{t("pickupAck")}</span>
                    </label>
                  </div>
                </div>
              )}

              {shippingUnavailable && (
                <div className={cn(noteCls, "mt-4 border-amber-300 bg-amber-50")} role="status">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" strokeWidth={1.8} aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-amber-900">{t("shipUnavailableTitle", { country: countryLabel })}</p>
                    <p className="mt-1 text-amber-900/90">{t("shipUnavailableText")}</p>
                    {contactLinks}
                  </div>
                </div>
              )}
            </Section>

            {/* 3 Endereço (entrega) ou local de retirada */}
            <Section
              id="checkout-address"
              step={stepOf.address}
              title={deliveryType === "pickup" ? t("pickupPlaceTitle") : t("addressTitle")}
              icon={deliveryType === "pickup" ? Store : MapPin}
              {...foldProps("address")}
            >
              {deliveryType === "pickup" && pickupMethod ? (
                <div className="space-y-2 text-[15px]">
                  {pickupMethod.config?.address && (
                    <p className="flex items-start gap-2 text-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                      <span>
                        {[pickupMethod.config.address, pickupMethod.config.complement].filter(Boolean).join(", ")}
                        {(pickupMethod.config.neighborhood || pickupMethod.config.city) && (
                          <span className="block text-brand-ink-soft">
                            {[pickupMethod.config.neighborhood, pickupMethod.config.city, pickupMethod.config.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </span>
                    </p>
                  )}
                  {pickupMethod.config?.opening_hours && (
                    <p className="flex items-center gap-2 text-brand-ink-soft">
                      <Clock className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                      {t("pickupHours", { hours: pickupMethod.config.opening_hours })}
                    </p>
                  )}
                  {pickupDeadline > 0 && (
                    <p className="text-[14px] font-semibold text-brand-orange-text">
                      {pickupDeadline === 1 ? t("pickupReady_one", { count: 1 }) : t("pickupReady_other", { count: pickupDeadline })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 rounded-[14px] bg-brand-alt px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-ship-country>
                    <div className="flex items-start gap-3">
                      <Flag code={country.code} className="mt-0.5 w-6 shrink-0" />
                      <p className="text-[14px]">
                        <span className="font-semibold text-foreground">{t("shipCountry", { country: countryLabel })}</span>
                        <span className="block text-muted-foreground">{t("shipCountryHint")}</span>
                      </p>
                    </div>
                    {activeCountries.length > 1 && (
                      <div className="shrink-0">
                        <span className="sr-only">{t("shipCountryChange")}</span>
                        <CountryPicker className="h-11 w-full justify-between sm:w-auto" />
                      </div>
                    )}
                  </div>

                  {/* Portugal: zonas Continente e Ilhas, como antes */}
                  {isDistrictCountry && (
                    <fieldset className="space-y-2">
                      <legend className={cn(labelCls, "mb-2")}>{t("shipRegionLabel")}</legend>
                      <RadioGroup value={shippingRegion} onValueChange={(v) => setShippingRegion(v as ShippingRegion)} className="grid gap-2 sm:grid-cols-2">
                        {(["continente", "ilhas"] as const).map((r) => (
                          <label key={r} htmlFor={`region-${r}`} className={cn(optionCls(shippingRegion === r), "items-center p-3.5")}>
                            <RadioGroupItem value={r} id={`region-${r}`} className="h-5 w-5" />
                            <span className="text-[15px] font-medium">{r === "continente" ? t("shipRegionMainland") : t("shipRegionIslands")}</span>
                          </label>
                        ))}
                      </RadioGroup>
                      {shippingRegion === "ilhas" && (
                        <div className={cn(noteCls, "border-amber-300 bg-amber-50")} role="status">
                          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" strokeWidth={1.8} aria-hidden="true" />
                          <div>
                            <p className="font-semibold text-amber-900">{t("shipIslandsTitle")}</p>
                            <p className="mt-1 text-amber-900/90">{t("shipIslandsText")}</p>
                            {contactLinks}
                          </div>
                        </div>
                      )}
                    </fieldset>
                  )}

                  {isGuest ? (
                    <GuestAddressFields fmt={guestFmt} value={guestAddress} onChange={setGuestAddress} />
                  ) : addressesLoading ? (
                    <div className="space-y-3" role="status" aria-label={t("addressLoading")}>
                      <div className="skeleton h-[92px] rounded-[16px]" />
                      <div className="skeleton h-[92px] rounded-[16px]" />
                    </div>
                  ) : (
                    <>
                      {countryAddresses.length === 0 ? (
                        !showNewAddressForm && (
                          <div className="relative overflow-hidden rounded-[20px] border border-dashed border-border">
                            <div className="relative h-32"><LayerArt Icon={MapPin} size="sm" /></div>
                            <div className="p-5 text-center">
                              <p className="text-[15px] text-brand-ink-soft">{t("addressEmpty", { country: countryLabel })}</p>
                              <button type="button" onClick={() => setShowNewAddressForm(true)} className={cn(btnPrimary, "mt-4")}>
                                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("addressAdd")}
                              </button>
                            </div>
                          </div>
                        )
                      ) : (
                        <>
                          <RadioGroup value={selectedAddressId} onValueChange={setSelectedAddressId} className="gap-3" aria-label={t("addressTitle")}>
                            {countryAddresses.map((address) => (
                              <AddressOption
                                key={address.id}
                                id={address.id}
                                active={selectedAddressId === address.id}
                                name={address.name}
                                badge={address.is_default ? t("addressDefault") : null}
                                lines={addressLines(address, locale, country.code)}
                              />
                            ))}
                          </RadioGroup>
                          {!showNewAddressForm && (
                            <button type="button" className={btnGhost} onClick={() => setShowNewAddressForm(true)}>
                              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("addressAdd")}
                            </button>
                          )}
                        </>
                      )}
                      {showNewAddressForm && (
                        <div className="rounded-[16px] border border-brand-card-border bg-brand-alt/40 p-4 sm:p-5">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <p className="text-[16px] font-semibold">{t("addressNew")}</p>
                            <button type="button" className={btnGhost} onClick={() => setShowNewAddressForm(false)}>{t("cancel")}</button>
                          </div>
                          <AddressForm
                            onSuccess={() => {
                              selectNewAddress.current = "shipping";
                              setShowNewAddressForm(false);
                            }}
                          />
                        </div>
                      )}
                      {otherAddresses.length > 0 && (
                        <details className="group rounded-[16px] border border-border bg-white">
                          <summary className={cn("flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 rounded-[16px] px-4 text-[14px] font-semibold text-brand-ink-soft [&::-webkit-details-marker]:hidden", focusRing)}>
                            {t("addressOther", { count: otherAddresses.length })}
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" strokeWidth={1.8} aria-hidden="true" />
                          </summary>
                          <div className="space-y-3 border-t border-border p-4">
                            <p className="text-[13px] text-muted-foreground">{t("addressOtherHint", { country: countryLabel })}</p>
                            {otherAddresses.map((a) => (
                              <div key={a.id} className="flex flex-col gap-3 rounded-[14px] bg-brand-alt/60 px-4 py-3 text-[13px] text-brand-ink-soft sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="flex items-center gap-2 font-semibold text-foreground">
                                    <Flag code={addressCountryCode(a.country, country.code)} className="w-5 shrink-0" />{a.name}
                                  </p>
                                  {addressLines(a, locale, country.code).map((l) => <p key={l}>{l}</p>)}
                                </div>
                                {activeCountries.some((c) => c.code === addressCountryCode(a.country, country.code)) ? (
                                  <button type="button" className={cn(btnGhost, "shrink-0 border border-border bg-white")} onClick={() => deliverToOtherAddress(a)}>
                                    {t("addressUseHere")}
                                  </button>
                                ) : (
                                  <p className="shrink-0 text-[12px] text-muted-foreground">{t("addressCountryOff")}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  )}

                  {shippingInfo && !digitalOnly && (
                    <div className={cn("flex items-center gap-3 rounded-[14px] px-4 py-3", shippingInfo.freeShipping ? "bg-emerald-50" : "bg-brand-alt")}>
                      <Truck className={cn("h-5 w-5 shrink-0", shippingInfo.freeShipping ? "text-emerald-700" : "text-primary")} strokeWidth={1.8} aria-hidden="true" />
                      <div className="text-[14px]">
                        <p className="font-semibold">{shippingInfo.freeShipping ? t("deliveryFree") : t("shipCost", { price: withTax(shippingGross) })}</p>
                        <p className="text-[13px] text-muted-foreground">{t("shipEstimate", { min: shippingInfo.estimatedDays.min, max: shippingInfo.estimatedDays.max })}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* 4 Faturamento (documento fiscal do país e endereço de cobrança) */}
            {!isGuest && !showBilling && <BillingTaxIdCard userId={user.id} onValidChange={setTaxIdOk} />}
            {showBilling && (
              <Section id="checkout-billing" step={stepOf.billing} title={t("billingTitle")} sub={t("billingSub")} icon={Receipt} {...foldProps("billing")}>
                <div className="space-y-5">
                  <BillingTaxIdCard userId={user.id} onValidChange={setTaxIdOk} embedded />
                  {deliveryType === "delivery" && (
                    <div className="space-y-3">
                      <RadioGroup value={billingSameAsShipping ? "same" : "diff"} onValueChange={(v) => setBillingSameAsShipping(v === "same")} className="gap-2">
                        {(["same", "diff"] as const).map((v) => (
                          <label key={v} htmlFor={`billing-${v}`} className={cn(optionCls(billingSameAsShipping === (v === "same")), "items-center p-3.5")}>
                            <RadioGroupItem value={v} id={`billing-${v}`} className="h-5 w-5" />
                            <span className="text-[15px] font-medium">{v === "same" ? t("billingSame") : t("billingDiff")}</span>
                          </label>
                        ))}
                      </RadioGroup>
                      <AnimatePresence initial={false}>
                        {!billingSameAsShipping && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className="space-y-3 pt-2">
                              {addresses.length > 0 && (
                                <RadioGroup value={selectedBillingAddressId} onValueChange={setSelectedBillingAddressId} className="gap-3" aria-label={t("billingDiff")}>
                                  {addresses.map((address) => (
                                    <AddressOption
                                      key={address.id}
                                      id={`b-${address.id}`}
                                      value={address.id}
                                      active={selectedBillingAddressId === address.id}
                                      name={address.name}
                                      badge={(address as any).is_billing_default ? t("billingTag") : null}
                                      lines={addressLines(address, locale, country.code)}
                                    />
                                  ))}
                                </RadioGroup>
                              )}
                              {showNewBillingAddressForm ? (
                                <div className="rounded-[16px] border border-brand-card-border bg-brand-alt/40 p-4 sm:p-5">
                                  <div className="mb-4 flex items-center justify-between gap-3">
                                    <p className="text-[16px] font-semibold">{t("billingNew")}</p>
                                    <button type="button" className={btnGhost} onClick={() => setShowNewBillingAddressForm(false)}>{t("cancel")}</button>
                                  </div>
                                  <AddressForm
                                    onSuccess={() => {
                                      selectNewAddress.current = "billing";
                                      setShowNewBillingAddressForm(false);
                                    }}
                                  />
                                </div>
                              ) : (
                                <button type="button" className={btnGhost} onClick={() => setShowNewBillingAddressForm(true)}>
                                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("billingNew")}
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* 5 Detalhes do pedido (campos extra do Admin) */}
            {showExtras && (
              <Section id="checkout-extras" step={stepOf.extras} title={tcf("section_title")} sub={tcf("section_sub")} icon={ListChecks} {...foldProps("extras")}>
                <CheckoutExtraFields
                  fields={extraFields}
                  answers={fieldAnswers}
                  onChange={(id, v) => { setFieldsTouched(true); setFieldAnswers((a) => ({ ...a, [id]: v })); }}
                  errors={extras.errors}
                  showErrors={fieldsTouched || blockers[0] === tcf("block")}
                  money={money}
                />
              </Section>
            )}

            {/* 6 Pagamento */}
            <Section id="checkout-payment" step={stepOf.payment} title={t("payTitle")} sub={t("paySub")} icon={CreditCard}>
              {paymentsLoading ? (
                <div className="space-y-3" role="status" aria-label={t("payLoading")}>
                  <div className="skeleton h-[72px] rounded-[16px]" />
                  <div className="skeleton h-[72px] rounded-[16px]" />
                </div>
              ) : paymentsError ? (
                <LoadError text={t("loadError")} retry={t("retry")} onRetry={() => void refetchPayments()} />
              ) : noPaymentForCountry ? (
                <div className={cn(noteCls, "border-border bg-brand-alt")} role="status">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink-soft" strokeWidth={1.8} aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-foreground">{t("payNoneTitle", { country: countryLabel })}</p>
                    <p className="mt-1 text-brand-ink-soft">{t("payNoneText")}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(v) => {
                      paymentTouched.current = true;
                      setPaymentMethod(v as PaymentMethod);
                    }}
                    className="gap-3"
                    aria-label={t("payTitle")}
                  >
                    {payableConfigs.map((cfg) => {
                      const Icon = paymentIconOf(cfg.type);
                      const active = paymentMethod === cfg.type;
                      const pct = Number(cfg.discount_percent) || 0;
                      const descKey = `pmd_${cfg.type}` as CheckoutKey;
                      const desc = payInstructions(cfg) || (descKey in checkoutMessages["pt-BR"] ? t(descKey) : "");
                      return (
                        <label key={cfg.type} htmlFor={`pay-${cfg.type}`} className={optionCls(active)}>
                          <RadioGroupItem value={cfg.type} id={`pay-${cfg.type}`} className="mt-1 h-5 w-5" />
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
                            <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[15px] font-semibold">{payName(cfg)}</span>
                              {pct > 0 && <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[12px] font-bold text-emerald-700">{t("payDiscountBadge", { pct: new Intl.NumberFormat(locale).format(pct) })}</span>}
                              {cfg.type === "pix" && !pct && <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[12px] font-bold text-emerald-700">{t("payInstant")}</span>}
                            </span>
                            {desc && <span className="mt-0.5 block text-[13px] text-muted-foreground">{desc}</span>}
                          </span>
                          {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />}
                        </label>
                      );
                    })}
                  </RadioGroup>

                  {activePaymentConfig && paymentMethod === "pix" && activePaymentConfig.details?.chave_pix && <PaymentDetails config={activePaymentConfig} />}
                  {activePaymentConfig && paymentMethod === "transfer" && activePaymentConfig.details?.banco && <PaymentDetails config={activePaymentConfig} />}
                  {activePaymentConfig &&
                    paymentMethod === "multibanco" &&
                    (activePaymentConfig.details?.entidade || activePaymentConfig.details?.referencia_modelo) && <PaymentDetails config={activePaymentConfig} />}
                  {activePaymentConfig && paymentMethod === "mbway" && activePaymentConfig.details?.telemovel && <PaymentDetails config={activePaymentConfig} />}
                  {activePaymentConfig && paymentMethod === "bizum" && activePaymentConfig.details?.telefone && <PaymentDetails config={activePaymentConfig} />}
                  {activePaymentConfig && isOnlineGateway(paymentMethod) && (
                    <p className="flex items-start gap-2 rounded-[14px] border border-border bg-brand-alt/60 p-3 text-[13px] text-brand-ink-soft">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                      {t("payRedirectNote", { name: paymentMethod === "stripe" ? "Stripe" : payName(activePaymentConfig) })}
                    </p>
                  )}
                </div>
              )}
            </Section>

            {/* 6 Revisão e finalização */}
            <Section id="checkout-review" step={stepOf.review} title={t("reviewTitle")} sub={t("reviewSub")} icon={ShieldCheck}>
              <div className="space-y-5">
                {!compactSteps && <dl className="divide-y divide-border overflow-hidden rounded-[16px] border border-border">
                  {reviewRows.map((row) => (
                    <div key={row.href} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
                      <dt className="col-start-1 row-start-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:pt-0.5">{row.label}</dt>
                      <dd className={cn("col-start-1 row-start-2 mt-0.5 min-w-0 break-words text-[14px] sm:col-start-2 sm:row-start-1 sm:mt-0", row.value ? "text-foreground" : "font-semibold text-brand-orange-text")}>
                        {row.value || t("reviewMissing")}
                      </dd>
                      <dd className="col-start-2 row-span-2 row-start-1 self-center sm:col-start-3 sm:row-span-1">
                        <a href={row.href} className={cn(btnGhost, "-my-2 -mr-2 px-2.5 text-[13px]")}>
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />{t("edit")}
                          <span className="sr-only">: {row.label}</span>
                        </a>
                      </dd>
                    </div>
                  ))}
                </dl>}

                {pauseActive && (
                  <div className={cn(noteCls, "border-amber-300 bg-amber-50")}>
                    <CalendarOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" strokeWidth={1.8} aria-hidden="true" />
                    <div className="flex-1 text-amber-900">
                      <p><strong>{pauseCfg?.reason || t("pauseFallback")}.</strong> {t("pauseText")}</p>
                      <p className="mt-1 text-[13px] opacity-90">
                        {t("pauseDates", { start: fmtDate(parseYMD(pauseCfg?.start_date)), end: fmtDate(parseYMD(pauseCfg?.end_date)), date: fmtDate(getReturnDate(pauseCfg)) })}
                      </p>
                      <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3">
                        <Checkbox checked={pauseAck} onCheckedChange={(v) => setPauseAck(!!v)} className="mt-0.5 h-5 w-5" />
                        <span className="text-[14px] text-foreground">{pauseCheckboxText}</span>
                      </label>
                    </div>
                  </div>
                )}

                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[16px] border border-border bg-brand-alt/40 p-4">
                  <Checkbox checked={termsAck} onCheckedChange={(v) => setTermsAck(!!v)} className="mt-0.5 h-5 w-5" />
                  <span className="text-[14px] leading-relaxed text-foreground">
                    {t("termsBefore")}{" "}
                    <Link to="/termos" target="_blank" className="font-semibold text-brand-orange-text underline underline-offset-2">{t("termsLink")}</Link>{" "}
                    {t("termsAnd")}{" "}
                    <Link to="/politica-privacidade" target="_blank" className="font-semibold text-brand-orange-text underline underline-offset-2">{t("privacyLink")}</Link>
                    . {t("termsAfter")}
                  </span>
                </label>

                {hasCustomizableCartItems && (
                  <div className="rounded-[16px] border border-primary/25 bg-accent/50 p-4">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-orange-text">{t("customTitle")}</p>
                    <label className="mt-2 flex min-h-[44px] cursor-pointer items-start gap-3">
                      <Checkbox checked={personalizedTermsAck} onCheckedChange={(v) => setPersonalizedTermsAck(!!v)} className="mt-0.5 h-5 w-5" />
                      <span className="text-[14px] leading-relaxed text-foreground">
                        {t("customBefore")}{" "}
                        <Link to="/termos#personalizados" target="_blank" className="font-semibold text-brand-orange-text underline underline-offset-2">{t("customLink")}</Link>{" "}
                        {t(["PT", "ES"].includes(jurisdictionOf(country.code)) ? "customAfter" : "customAfterNoWaiver")}
                      </span>
                    </label>
                  </div>
                )}

                <CartReservationTimer notice={cartStock.reservation.notice} expiresAt={cartStock.expiresAt} expired={cartStock.expired} />

                {hasPreorder && (
                  <p role="note" className="flex items-start gap-3 rounded-[16px] border border-primary/25 bg-accent/60 p-3.5 text-[14px]">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />{tpre("order_note")}
                  </p>
                )}

                <CartStockNotice
                  problems={cartStock.problems}
                  onRemove={(id) => removeFromCartAsync(id)}
                  onQuantity={(id, quantity) => updateQuantityAsync({ itemId: id, quantity })}
                />

                <div className="flex items-end justify-between gap-4 rounded-[16px] bg-brand-alt px-4 py-3.5">
                  <div>
                    <p className="text-[15px] font-semibold">{t("sumTotal")}</p>
                    <p className="text-[13px] text-muted-foreground">{showTax ? t("sumTaxIncluded") : t("sumFinalPrice")}</p>
                  </div>
                  <p className="text-[26px] font-[780] leading-none tracking-[-0.03em] tabular-nums">{money(totalShown)}</p>
                </div>

                <div className="space-y-3">
                  <button
                    ref={placeButtonRef}
                    type="button"
                    onClick={handlePlaceOrder}
                    disabled={isProcessing || !canPlaceOrderWithTerms}
                    aria-describedby={!isProcessing && blockers.length ? "checkout-blocker" : undefined}
                    className={cn(btnPrimary, "min-h-[56px] w-full text-[16px]")}
                  >
                    {isProcessing ? (
                      <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />{t("placing")}</>
                    ) : blockedByIlhas ? (
                      <><AlertCircle className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />{t("quoteCta")}</>
                    ) : (
                      <>
                        <Lock className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                        {t("placeOrder")}
                        <ArrowRight className="h-[18px] w-[18px] transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} aria-hidden="true" />
                      </>
                    )}
                  </button>
                  {!isProcessing && blockers[0] && (
                    <p id="checkout-blocker" role="status" className="flex items-start gap-2 rounded-[12px] bg-accent px-3.5 py-2.5 text-[14px] font-medium text-brand-orange-text">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />{blockers[0]}
                    </p>
                  )}
                  {cartItems.some((it: any) => it?.design_data?.cartItemKey) && (
                    <p className="flex items-start gap-2 rounded-[12px] border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-900">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />{t("filesNotice")}
                    </p>
                  )}
                  <p className="text-center text-[13px] text-muted-foreground">
                    {t("returnsBefore")}{" "}
                    <Link to="/devolucoes" className="font-semibold text-brand-orange-text underline underline-offset-2">{t("returnsLink")}</Link>.
                  </p>
                </div>
              </div>
            </Section>

            {!isDesktop && trustSeals}
          </div>

          {isDesktop && (
            <aside className="min-w-0" aria-label={t("sumTitle")}>
              {/* Em ecrãs baixos o resumo rola por dentro, para o total nunca ficar escondido. */}
              <div className="sticky top-[100px] -m-2 max-h-[calc(100vh-108px)] space-y-4 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
                <div className={cn(card, "p-6")}>
                  <div className="mb-5 flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />
                    <h2 className="text-[20px] font-bold tracking-[-0.02em]">{t("sumTitle")}</h2>
                    <span className="ml-auto rounded-lg bg-brand-alt px-2 py-0.5 text-[13px] font-semibold text-brand-ink-soft">{itemsLabel}</span>
                  </div>
                  {summaryBody}
                </div>
                {!S && <CartKitHints items={cartItems as any[]} place="checkout" />}
                {trustSeals}
              </div>
            </aside>
          )}
        </div>
      </div>

      {showMobileBar && (
        <CheckoutMobileBar
          hidden={placeButtonVisible}
          total={money(totalShown)}
          label={canPlaceOrderWithTerms ? tcp("finish") : tcp("continue")}
          hint={canPlaceOrderWithTerms ? undefined : tcp("continueTo", { step: stepName[nextStepTarget(blockerSteps)] })}
          ready={canPlaceOrderWithTerms}
          busy={isProcessing}
          onClick={() => (canPlaceOrderWithTerms ? void handlePlaceOrder() : goToStep(nextStepTarget(blockerSteps)))}
        />
      )}

      {/* O pedido já existe e o carrinho foi esvaziado: fechar leva à confirmação, onde o pagamento continua disponível. */}
      <Dialog open={!!vivaEmbedOrder} onOpenChange={(open) => { if (!open) closeVivaDialog(); }}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg gap-0 overflow-y-auto rounded-[24px] border-brand-card-border p-0 sm:rounded-[24px]"
        >
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle className="text-[20px] font-bold tracking-[-0.02em]">{t("payCardDialog")}</DialogTitle>
          </DialogHeader>
          <div className="p-4 md:p-6">
            {vivaEmbedOrder && (
              <VivaCardEmbed
                orderId={vivaEmbedOrder.id}
                total={vivaEmbedOrder.total}
                onPaid={closeVivaDialog}
                onCancel={closeVivaDialog}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </CheckoutShell>
  );
};

// ── Peças ───────────────────────────────────────────────────

function CheckoutShell({ title, description, children, barSpace = false }: { title: string; description?: string; children: ReactNode; barSpace?: boolean }) {
  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {/* espaço para a barra fixa do total (celular e tablet) */}
        {barSpace && <div className="h-[76px] lg:hidden" aria-hidden="true" />}
      </div>
    </MotionConfig>
  );
}

/**
 * Barra fixa do checkout no celular e tablet (Admin > Carrinho e checkout): total e um botão que leva à próxima etapa
 * com pendência, ou finaliza quando está tudo pronto. Some enquanto o botão da revisão está na tela.
 */
function CheckoutMobileBar({ hidden, total, label, hint, ready, busy, onClick }: {
  hidden: boolean; total: string; label: string; hint?: string; ready: boolean; busy: boolean; onClick: () => void;
}) {
  const { t } = useMessages(checkoutPageMessages);
  const { t: tc } = useMessages(checkoutMessages);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="region"
      aria-label={t("barLabel")}
      aria-hidden={hidden || undefined}
      className={cn(
        "fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-[45] border-t border-border bg-white/95 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur-md transition-[transform,opacity] duration-200 supports-[backdrop-filter]:bg-white/90 md:bottom-0 md:pb-[env(safe-area-inset-bottom)] lg:hidden",
        hidden && "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <div className="shell flex items-center gap-3 py-2.5">
        <div className="shrink-0 leading-tight">
          <p className="text-[12px] text-muted-foreground">{t("barTotal")}</p>
          <p className="whitespace-nowrap text-[19px] font-bold tabular-nums text-foreground">{total}</p>
        </div>
        <button type="button" tabIndex={hidden ? -1 : undefined} onClick={onClick} disabled={busy} aria-label={hint} title={hint} className={cn(btnPrimary, "ml-auto min-h-[48px] min-w-0 flex-1 px-4 text-[15px] sm:max-w-[340px]")}>
          {busy ? (
            <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{tc("placing")}</>
          ) : (
            <>
              {ready && <Lock className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
              <span className="truncate">{label}</span>
              {!ready && <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
            </>
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function CheckoutSkeleton({ label }: { label: string }) {
  return (
    <div className="shell pb-16 pt-5 md:pt-8" role="status" aria-label={label}>
      <div className="skeleton h-4 w-48 rounded" />
      <div className="skeleton mt-6 h-12 w-72 max-w-full rounded-xl" />
      <div className="skeleton mt-3 h-5 w-96 max-w-full rounded" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10">
        <div className="space-y-5">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-48 rounded-[20px]" />)}
        </div>
        <div className="skeleton hidden h-[420px] rounded-[20px] lg:block" />
      </div>
    </div>
  );
}

function Section({ id, step, title, sub, icon: Icon, children, folded, summary, onEdit, footer }: {
  id: string; step: number; title: string; sub?: string; icon: LucideIcon; children: ReactNode;
  /** etapa completa e recolhida (Admin > Carrinho e checkout, etapas compactas): só o resumo e Alterar */
  folded?: boolean; summary?: ReactNode; onEdit?: () => void; footer?: ReactNode;
}) {
  const { t } = useMessages(checkoutMessages);
  const { t: tcp } = useMessages(checkoutPageMessages);
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      aria-labelledby={`${id}-title`}
      data-folded={folded || undefined}
      className={cn(card, "scroll-mt-[116px]", folded ? "px-5 py-4 sm:px-6" : "p-5 sm:p-6")}
    >
      {folded ? (
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">{tcp("stepDone")}</span>
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="font-sans text-[15px] leading-snug text-foreground">
              <span className="sr-only">{t("stepN", { n: step })}: </span>{title}
            </h2>
            {summary && <div className="mt-0.5 line-clamp-2 break-words text-[14px] text-muted-foreground">{summary}</div>}
          </div>
          {onEdit && (
            <button type="button" onClick={onEdit} className={cn(btnGhost, "-my-1.5 -mr-2 shrink-0 px-2.5 text-[13px]")}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />{tcp("change")}<span className="sr-only">: {title}</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <header className="mb-5 flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[14px] font-bold tabular-nums text-primary-foreground">
              <span aria-hidden="true">{step}</span>
            </span>
            <div className="min-w-0 flex-1">
              {/* Título da etapa em Inter (a serifa fica para o título da página) */}
              <h2 id={`${id}-title`} className="flex items-center gap-2 font-sans text-[18px] leading-tight tracking-[-0.01em] sm:text-[19px]">
                <span className="sr-only">{t("stepN", { n: step })}: </span>
                {title}
                <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
              </h2>
              {sub && <p className="mt-1 text-[14px] text-muted-foreground">{sub}</p>}
            </div>
          </header>
          {children}
          {footer}
        </>
      )}
    </motion.section>
  );
}

function LoadError({ text, retry, onRetry }: { text: string; retry: string; onRetry: () => void }) {
  return (
    <div className={cn(noteCls, "border-destructive/30 bg-destructive/5")} role="alert">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={1.8} aria-hidden="true" />
      <div>
        <p className="text-foreground">{text}</p>
        <button type="button" onClick={onRetry} className={cn(btnSecondary, "mt-3 min-h-[44px] px-4 text-[14px]")}>
          <RefreshCw className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{retry}
        </button>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, required, hint, error, children }: {
  label: string; htmlFor?: string; required?: boolean; hint?: string; error?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className={labelCls}>
        {label}{required && <span className="text-destructive" aria-hidden="true"> *</span>}
        {hint && <span className="font-normal text-muted-foreground"> ({hint})</span>}
      </Label>
      {children}
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}

function AddressOption({ id, value, active, name, badge, lines }: {
  id: string; value?: string; active: boolean; name: string; badge: string | null; lines: string[];
}) {
  return (
    <label htmlFor={id} className={optionCls(active)}>
      <RadioGroupItem value={value ?? id} id={id} className="mt-1 h-5 w-5" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold">{name}</span>
          {badge && <span className="rounded-lg bg-brand-alt px-2 py-0.5 text-[12px] font-semibold text-brand-ink-soft">{badge}</span>}
        </span>
        {lines.map((l) => <span key={l} className="mt-0.5 block text-[13px] text-brand-ink-soft">{l}</span>)}
      </span>
      {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />}
    </label>
  );
}

/** Contato do cliente com conta: nome e celular do perfil (o pedido lê-os de lá). */
function ContactCard({ userId, email, profile, loading }: { userId: string; email: string; profile: ContactProfile | undefined; loading: boolean }) {
  const { t } = useMessages(checkoutMessages);
  const country = useCountry();
  const cache = useQueryClient();
  const complete = isContactComplete(profile);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback(() => {
    setName(profile?.fullName ?? "");
    setPhone(profile?.phone || `${country.code}:`);
    setErrors({});
    setEditing(true);
  }, [profile, country.code]);
  useEffect(() => {
    if (!loading && !complete && !editing) startEdit();
  }, [loading, complete, editing, startEdit]);

  const save = async () => {
    const next: { name?: string; phone?: string } = {};
    if (!name.trim()) next.name = t("contactNameRequired");
    if (phoneDigits(phone).length < 6) next.phone = t("contactPhoneRequired");
    if (next.name || next.phone) return setErrors(next);
    setSaving(true);
    const payload = { full_name: name.trim(), phone };
    const { error } = profile?.exists
      ? await supabase.from("user_profiles").update(payload as any).eq("user_id", userId)
      : await supabase.from("user_profiles").insert({ user_id: userId, ...payload } as any);
    if (error) {
      setSaving(false);
      toast.error(t("contactSaveError"));
      return;
    }
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["checkout-contact", userId] }),
      cache.invalidateQueries({ queryKey: ["user-profile", userId] }),
    ]);
    setSaving(false);
    setEditing(false);
    toast.success(t("contactSaved"));
  };

  if (loading) {
    return (
      <div className="space-y-3" role="status">
        <div className="skeleton h-5 w-56 rounded" />
        <div className="skeleton h-5 w-72 max-w-full rounded" />
        <div className="skeleton h-5 w-44 rounded" />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {editing ? (
        <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-4">
          {!complete && <p className="rounded-[14px] bg-accent px-4 py-3 text-[14px] font-medium text-brand-orange-text">{t("contactIncomplete")}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("contactName")} htmlFor="contact-name" required error={errors.name}>
              <Input
                id="contact-name"
                autoComplete="name"
                placeholder={t("contactNamePh")}
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: undefined })); }}
                aria-invalid={!!errors.name}
                className={cn(inputCls, errors.name && "border-destructive")}
              />
            </Field>
            <Field label={t("contactEmail")} htmlFor="contact-email">
              <Input id="contact-email" value={email} readOnly className={cn(inputCls, "bg-brand-alt/60 text-brand-ink-soft")} aria-describedby="contact-email-note" />
              <p id="contact-email-note" className="text-[12px] text-muted-foreground">{t("contactEmailNote")}</p>
            </Field>
          </div>
          <Field label={t("contactPhone")} htmlFor="contact-phone" required error={errors.phone}>
            <PhoneInputWithDDI id="contact-phone" value={phone} onChange={(v) => { setPhone(v); setErrors((er) => ({ ...er, phone: undefined })); }} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t("save")}
            </button>
            {complete && <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>{t("cancel")}</button>}
          </div>
        </motion.div>
      ) : (
        <motion.div key="view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid gap-2.5 text-[15px]">
            {([
              [User, t("contactName"), profile?.fullName ?? ""],
              [Mail, t("contactEmail"), email],
              [Phone, t("contactPhone"), phoneDisplay(profile?.phone)],
            ] as const).map(([Icon, label, value]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="flex min-w-0 items-center gap-3 break-words">
                  <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                  <span className="min-w-0 break-words">{value}</span>
                </dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={startEdit} className={btnGhost}>
            <Pencil className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t("edit")}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Endereço do convidado guiado pelo formato do país (máscara, regiões, bairro e preenchimento pelo CEP no Brasil). */
function GuestAddressFields({ fmt, value, onChange }: {
  fmt: AddressFormat; value: GuestAddress; onChange: (fn: (prev: GuestAddress) => GuestAddress) => void;
}) {
  const { t: ta } = useMessages(addressMessages);
  const numberRef = useRef<HTMLInputElement>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "filled" | "notfound">("idle");
  const [postalTouched, setPostalTouched] = useState(false);
  const set = (patch: Partial<GuestAddress>) => onChange((prev) => ({ ...prev, ...patch }));
  const postalLabel = ta(postalKey(fmt));
  const postalOk = isValidPostal(fmt, value.postal_code);
  const region = findRegion(fmt, value.district);

  useEffect(() => {
    if (!fmt.lookup || !isValidPostal(fmt, value.postal_code)) {
      setLookup("idle");
      return;
    }
    const ctrl = new AbortController();
    setLookup("loading");
    lookupPostal(fmt, value.postal_code, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      if (!r) {
        setLookup("notfound");
        return;
      }
      const found = findRegion(fmt, r.region);
      onChange((prev) => ({
        ...prev,
        street: r.street || prev.street,
        parish: r.parish || prev.parish,
        city: r.city || prev.city,
        district: found ? regionToValue(fmt, found) : r.region || prev.district,
      }));
      setLookup("filled");
      numberRef.current?.focus();
    });
    return () => ctrl.abort();
  }, [fmt, value.postal_code, onChange]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={postalLabel}
          htmlFor="guest-postal"
          required
          error={postalTouched && value.postal_code && !postalOk ? ta("invalidPostal", { label: postalLabel, example: fmt.postalPlaceholder }) : undefined}
        >
          <div className="relative">
            <Input
              id="guest-postal"
              autoComplete="postal-code"
              inputMode={fmt.kind === "generic" ? "text" : "numeric"}
              placeholder={fmt.postalPlaceholder}
              value={value.postal_code}
              onChange={(e) => set({ postal_code: fmt.formatPostal(e.target.value) })}
              onBlur={() => setPostalTouched(true)}
              aria-invalid={postalTouched && !!value.postal_code && !postalOk}
              aria-describedby={fmt.lookup ? "guest-postal-status" : undefined}
              className={cn(inputCls, "pr-10")}
            />
            {lookup === "loading" && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
          </div>
          {fmt.lookup && (
            <p id="guest-postal-status" aria-live="polite" className={cn("text-[13px]", lookup === "notfound" ? "text-brand-orange-text" : "text-muted-foreground")}>
              {lookup === "loading" ? ta("lookupLoading") : lookup === "filled" ? ta("lookupFilled") : lookup === "notfound" ? ta("lookupNotFound") : ""}
            </p>
          )}
        </Field>
        <Field label={ta(regionKey(fmt))} htmlFor="guest-region" required>
          {fmt.regions.length > 0 ? (
            <Select value={region ? regionToValue(fmt, region) : ""} onValueChange={(v) => set({ district: v })}>
              <SelectTrigger id="guest-region" className={inputCls}>
                <SelectValue placeholder={ta("regionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {fmt.regions.map((r) => (
                  <SelectItem key={r.code} value={regionToValue(fmt, r)}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="guest-region" autoComplete="address-level1" value={value.district} onChange={(e) => set({ district: e.target.value })} className={inputCls} />
          )}
        </Field>
      </div>
      <Field label={ta("street")} htmlFor="guest-street" required>
        <Input id="guest-street" autoComplete="address-line1" value={value.street} onChange={(e) => set({ street: e.target.value })} className={inputCls} />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label={ta("number")} htmlFor="guest-number">
          <Input id="guest-number" ref={numberRef} value={value.number} onChange={(e) => set({ number: e.target.value })} className={inputCls} />
        </Field>
        <div className="col-span-2">
          <Field label={ta("complement")} htmlFor="guest-complement" hint={ta("optional")}>
            <Input id="guest-complement" autoComplete="address-line2" placeholder={ta("complementPlaceholder")} value={value.complement} onChange={(e) => set({ complement: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fmt.hasParish && (
          <Field label={ta(parishKey(fmt))} htmlFor="guest-parish" required={fmt.parishRequired} hint={fmt.parishRequired ? undefined : ta("optional")}>
            <Input id="guest-parish" value={value.parish} onChange={(e) => set({ parish: e.target.value })} className={inputCls} />
          </Field>
        )}
        <Field label={ta("city")} htmlFor="guest-city" required>
          <Input id="guest-city" autoComplete="address-level2" value={value.city} onChange={(e) => set({ city: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

function CartItemRow({ item, currency, t }: { item: SummaryItem; currency: any; t: Translate }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="relative h-16 w-16 overflow-hidden rounded-[12px] border border-brand-card-border bg-brand-alt">
            {item.image && !failed
              ? <img src={item.image} alt={item.name} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
              : <LayerArt Icon={Box} size="sm" />}
          </div>
          {item.quantity > 1 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold tabular-nums text-primary-foreground ring-2 ring-white">
              {item.quantity}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight">{item.name || t("itemFallback")}</p>
          {item.meta && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{item.meta}</p>}
          <p className="text-[13px] text-muted-foreground">{t("sumQty", { qty: item.quantity })}</p>
          {Object.values(item.areas || {}).map((area) => (
            <p key={area.areaLabel} className="break-words text-[12px] text-muted-foreground">
              {area.areaLabel}{area.notes ? `: ${area.notes}` : ""}
            </p>
          ))}
        </div>
        <p className="shrink-0 text-[15px] font-semibold tabular-nums">{formatPrice(item.price, currency)}</p>
      </div>
      <CustomizationAreaFiles areas={item.areas} compact />
    </div>
  );
}

function TrustSeals({ t, ships }: { t: Translate; ships: boolean }) {
  const seals: Array<[LucideIcon, string, string]> = [
    [ShieldCheck, t("trustSecure"), t("trustSecureSub")],
    [Printer, t("trustMade"), t("trustMadeSub")],
    ...(ships ? [[Truck, t("trustShip"), t("trustShipSub")] as [LucideIcon, string, string]] : []),
  ];
  return (
    <ul className={cn("grid gap-3 rounded-[20px] border border-brand-card-border bg-white p-4 lg:grid-cols-1", ships ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {seals.map(([Icon, title, sub]) => (
        <li key={title} className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">{title}</span>
            <span className="block text-[13px] text-muted-foreground">{sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const PaymentDetails = ({ config }: { config: PaymentConfigData }) => {
  const { t } = useMessages(checkoutMessages);
  const d = config.details;
  return (
    <div className="space-y-3 rounded-[16px] border border-brand-card-border bg-brand-alt/50 p-4">
      <p className="text-[14px] font-semibold">{t("payDetailsTitle")}</p>
      {config.type === "pix" && (
        <div className="space-y-2">
          {d.nome_titular && <InfoRow label={t("payHolder")} value={d.nome_titular} />}
          {d.chave_pix && <CopyRow label={d.tipo_chave ? t("payPixKeyType", { type: d.tipo_chave }) : t("payPixKey")} value={d.chave_pix} />}
        </div>
      )}
      {config.type === "transfer" && (
        <div className="space-y-2">
          {d.banco && <InfoRow label={t("payBank")} value={d.banco} />}
          {d.tipo_conta && <InfoRow label={t("payAccountType")} value={d.tipo_conta} />}
          {d.agencia && <InfoRow label={t("payAgency")} value={d.agencia} />}
          {d.conta && <CopyRow label={t("payAccount")} value={d.conta} />}
          {d.nome_titular && <InfoRow label={t("payHolder")} value={d.nome_titular} />}
          {d.nif && <InfoRow label={t("payDocument")} value={d.nif} />}
          {d.iban && <CopyRow label={t("payIban")} value={d.iban} />}
        </div>
      )}
      {config.type === "multibanco" && (
        <div className="space-y-2">
          {d.entidade && <CopyRow label={t("payEntity")} value={d.entidade} />}
          {d.referencia_modelo && <CopyRow label={t("payReference")} value={d.referencia_modelo} />}
          <p className="text-[13px] text-muted-foreground">{t("payReferenceNote")}</p>
        </div>
      )}
      {config.type === "mbway" && (
        <div className="space-y-2">
          {d.telemovel && <CopyRow label={t("payMbwayNumber")} value={d.telemovel} />}
          <p className="text-[13px] text-muted-foreground">{t("payMbwayNote")}</p>
        </div>
      )}
      {config.type === "bizum" && (
        <div className="space-y-2">
          {d.nome_titular && <InfoRow label={t("payHolder")} value={d.nome_titular} />}
          {d.telefone && <CopyRow label={t("payBizumNumber")} value={d.telefone} />}
        </div>
      )}
    </div>
  );
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useMessages(checkoutMessages);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    toast.success(t("payCopied", { label }));
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-[12px] border border-border bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        <p className="break-all font-mono text-[14px] font-semibold">{value}</p>
      </div>
      <button type="button" onClick={copy} aria-label={t("payCopy", { label })} className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-brand-ink-soft transition-colors duration-150 hover:bg-accent hover:text-brand-orange-text", focusRing)}>
        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={1.9} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
      </button>
    </div>
  );
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 text-[14px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{value}</span>
  </div>
);

export default Checkout;
