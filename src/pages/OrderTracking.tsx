import { STORE_DEFAULTS } from "@/config/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  Check, CheckCircle2, Clock, Copy, ExternalLink, Loader2, MapPin, Package, PackageX, Search, Truck, Wrench, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import OrderPaymentDetails from "@/components/dashboard/OrderPaymentDetails";
import OrderHelp from "@/components/dashboard/OrderHelp";
import { SHORT_ORDER_RE, UUID_RE, orderCode } from "@/components/dashboard/accountUtils";
import { EmptyState, Field, ItemThumb, StatusBadge, btnPrimary, btnSecondary, btnSmall, cardCls, eyebrowCls, h1Cls, h3Cls, inputCls } from "@/components/dashboard/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/use-currency";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useMessages } from "@/i18n";
import { accountMessages, type AccountKey } from "@/i18n/account";
import { addressCountryCode } from "@/lib/addressFormats";
import { countryName, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { isTrackingUrl } from "@/utils/tracking";

interface OrderData {
  id: string;
  status: string;
  tracking_number: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  total: number;
  shipping_cost: number | null;
  shipping_address: any;
  guest_email: string | null;
  payment_method: string;
  payment_proof_url?: string | null;
  order_items?: Array<{
    id: string;
    quantity: number;
    price: number;
    design_data?: any;
    products?: { name: string; image: string };
  }>;
  tracking_events?: Array<{ status_label: string | null; occurred_at: string }>;
}

const SELECT = `
  id, status, tracking_number, created_at, shipped_at, delivered_at,
  total, shipping_cost, shipping_address, guest_email, payment_method, payment_proof_url,
  order_items (
    id, quantity, price, design_data,
    products:product_id (name, image)
  ),
  tracking_events (status_label, occurred_at)
`;

const STEPS: { key: "pending" | "paid" | "preparing" | "shipped" | "delivered"; label: AccountKey; Icon: LucideIcon }[] = [
  { key: "pending", label: "trkStep_pending", Icon: Clock },
  { key: "paid", label: "trkStep_paid", Icon: CheckCircle2 },
  { key: "preparing", label: "trkStep_preparing", Icon: Wrench },
  { key: "shipped", label: "trkStep_shipped", Icon: Truck },
  { key: "delivered", label: "trkStep_delivered", Icon: Package },
];
// Estados que não estão na linha do tempo, mapeados para a etapa equivalente.
const STEP_OF: Record<string, number> = { pending: 0, awaiting_payment: 0, paid: 1, preparing: 2, shipped: 3, ready_for_pickup: 3, delivered: 4, completed: 4 };

const OrderTracking = () => {
  const { t, locale } = useMessages(accountMessages);
  const { currentCurrency, convert } = useCurrency();
  const { user, loading: authLoading } = useAuth();
  const { data: storeInfo } = useStoreInfo();
  const country = useCountry();
  const [searchParams] = useSearchParams();
  // Com o número completo na URL, o campo mostra o número curto que o cliente conhece (#A1B2C3D4).
  const initialQuery = searchParams.get("pedido") || searchParams.get("codigo") || "";
  const [query, setQuery] = useState(UUID_RE.test(initialQuery) ? orderCode(initialQuery) : initialQuery);
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [queryError, setQueryError] = useState("");
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const autoRan = useRef(false);
  const store = storeInfo?.name || STORE_DEFAULTS.name;

  const money = (v: number | null | undefined) => formatPrice(convert(Number(v) || 0), currentCurrency);
  const dateTime = (v: string) => new Date(v).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const dateOnly = (v: string) => new Date(v).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const runSearch = useCallback(async (rawQuery: string, rawEmail: string) => {
    const raw = rawQuery.trim().replace(/^#/, "").trim();
    if (!raw) {
      setQueryError(t("trkQueryRequired"));
      return;
    }
    setQueryError("");
    setLoading(true);
    setSearched(true);
    try {
      const lower = raw.toLowerCase();
      const find = async (by: "id" | "short" | "tracking") => {
        let q = (supabase as any).from("orders").select(SELECT);
        if (by === "id") q = q.eq("id", lower);
        else if (by === "short") q = q.gte("id", `${lower}-0000-0000-0000-000000000000`).lte("id", `${lower}-ffff-ffff-ffff-ffffffffffff`);
        else q = q.eq("tracking_number", raw);
        // E-mail só para pedidos antigos sem conta; com sessão, a própria conta já limita os resultados.
        if (rawEmail.trim() && !user) q = q.eq("guest_email", rawEmail.trim().toLowerCase());
        const { data, error } = await q.order("created_at", { ascending: false }).limit(1);
        if (error) throw error;
        return (data?.[0] as OrderData) ?? null;
      };
      // Número completo, número curto (#A1B2C3D4, os 8 primeiros caracteres) ou código de rastreio da transportadora.
      // Um código de rastreio de 8 caracteres hexadecimais (ex.: só dígitos) também é procurado como rastreio.
      let found: OrderData | null;
      if (UUID_RE.test(lower)) found = await find("id");
      else if (SHORT_ORDER_RE.test(lower)) found = (await find("short")) ?? (await find("tracking"));
      else found = await find("tracking");
      setOrder(found);
    } catch (e) {
      console.error("order lookup failed", e);
      setOrder(null);
      toast.error(t("trkError"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);

  // Vindo de "Rastrear" na conta (?pedido=...), a busca corre sozinha depois de a sessão carregar.
  useEffect(() => {
    if (authLoading || autoRan.current) return;
    const initial = searchParams.get("pedido") || searchParams.get("codigo");
    if (!initial) return;
    autoRan.current = true;
    runSearch(initial, searchParams.get("email") || "");
  }, [authLoading, searchParams, runSearch]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query, email);
  };

  const copy = (value: string) => {
    navigator.clipboard?.writeText(value).then(() => toast.success(t("copied")), () => {});
  };

  // Login e volta a este rastreio (ex.: link do e-mail aberto sem sessão).
  const typed = query.trim().replace(/^#/, "").trim();
  const signInHref = `/auth?redirect=${encodeURIComponent(typed ? `/rastrear?pedido=${encodeURIComponent(typed)}` : "/rastrear")}`;
  const closed = order && (order.status === "cancelled" || order.status === "refunded");
  const stepIndex = order ? STEP_OF[order.status] ?? -1 : -1;
  const stepDate = (key: string) => (!order ? null : key === "pending" ? order.created_at : key === "shipped" ? order.shipped_at : key === "delivered" ? order.delivered_at : null);
  const events = [...(order?.tracking_events ?? [])].sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const addr = order?.shipping_address;
  const addrCountry = addr ? addressCountryCode(addr.country, country.code) : null;
  const deliverTo = addr ? [addr.city, addr.district || addr.state, addrCountry ? countryName(addrCountry, locale) : null].filter(Boolean).join(", ") : "";

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{t("trkMeta", { store })}</title>
        <meta name="description" content={t("trkMetaDescription")} />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 pb-16 md:pb-20">
          <div className="shell pt-5 md:pt-8">
            <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("trkTitle") }]} />
            <header className="mt-5 md:mt-6">
              <p className={eyebrowCls}>{t("trkEyebrow")}</p>
              <h1 className={`${h1Cls} mt-2`}>{t("trkTitle")}</h1>
              <p className="mt-2 max-w-2xl text-[16px] text-brand-ink-soft sm:text-[17px]">{t("trkLead")}</p>
            </header>

            <div className="mx-auto mt-8 max-w-4xl space-y-5">
              {/* Busca */}
              <form onSubmit={submit} className={cn(cardCls, "p-5 sm:p-6")} noValidate role="search" aria-label={t("trkTitle")} id="track-form">
                <div className={cn("grid gap-4", !user && "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
                  <Field label={t("trkQuery")} htmlFor="track-query" error={queryError} errorId="track-query-error">
                    <Input
                      id="track-query" value={query} onChange={(e) => { setQuery(e.target.value); setQueryError(""); }}
                      placeholder={t("trkQueryPlaceholder")} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                      aria-invalid={!!queryError || undefined} aria-describedby={queryError ? "track-query-error" : undefined}
                      className={cn(inputCls, "font-mono", queryError && "border-destructive")}
                    />
                  </Field>
                  {!user && (
                    <Field label={t("trkEmail")} htmlFor="track-email" hint={t("optional")}>
                      <Input id="track-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("authEmailPlaceholder")} className={inputCls} />
                    </Field>
                  )}
                </div>
                <button type="submit" disabled={loading} aria-busy={loading || undefined} className={cn(btnPrimary, "mt-5 w-full sm:w-auto")}>
                  {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Search className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
                  {loading ? t("trkSearching") : t("trkSearch")}
                </button>
              </form>

              <div aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  {loading ? (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4" aria-busy="true">
                      <div className="skeleton h-40 rounded-[20px]" />
                      <div className="skeleton h-64 rounded-[20px]" />
                    </motion.div>
                  ) : searched && !order ? (
                    <motion.div key="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <EmptyState Icon={PackageX} title={t("trkNotFoundTitle")} text={user ? t("trkNotFoundText") : `${t("trkNotFoundText")} ${t("trkSignInHint")}`}>
                        {!user && <Link to={signInHref} className={btnPrimary}>{t("signIn")}</Link>}
                        {user && <Link to="/dashboard?tab=pedidos" className={btnSecondary}>{t("trkSeeInAccount")}</Link>}
                      </EmptyState>
                    </motion.div>
                  ) : order ? (
                    <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="space-y-5">
                      {/* Resumo do pedido */}
                      <section className={cn(cardCls, "p-5 sm:p-6")} aria-labelledby="track-order-title">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 id="track-order-title" className="text-[22px] font-bold tracking-[-0.02em]">{t("orderCode", { code: orderCode(order.id) })}</h2>
                              <StatusBadge status={order.status} />
                            </div>
                            <p className="mt-1 text-[14px] text-muted-foreground">{t("ordersPlaced", { date: dateOnly(order.created_at) })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] text-muted-foreground">{t("total")}</p>
                            <p className="text-[22px] font-bold tabular-nums">{money(order.total)}</p>
                          </div>
                        </div>

                        {deliverTo && (
                          <p className="mt-4 flex items-start gap-2 text-[15px] text-brand-ink-soft">
                            <MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            <span><span className="font-semibold text-foreground">{t("trkDeliverTo")}:</span> {deliverTo}</span>
                          </p>
                        )}

                        {order.tracking_number && (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-primary/20 bg-accent p-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white text-primary"><Truck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /></span>
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium text-brand-ink-soft">{isTrackingUrl(order.tracking_number) ? t("ordersTrackingLink") : t("ordersTrackingCode")}</p>
                                <p className="break-all font-mono text-[15px] font-bold">{order.tracking_number}</p>
                              </div>
                            </div>
                            {isTrackingUrl(order.tracking_number) ? (
                              <a href={order.tracking_number} target="_blank" rel="noopener noreferrer" className={btnSmall}>
                                {t("ordersOpenCarrier")}<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                              </a>
                            ) : (
                              <button type="button" onClick={() => copy(order.tracking_number!)} className={btnSmall}>
                                <Copy className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t("copy")}
                              </button>
                            )}
                          </div>
                        )}
                      </section>

                      {/* Pedido cancelado ou reembolsado */}
                      {closed && (
                        <section className="rounded-[20px] border border-destructive/25 bg-destructive/[0.04] p-5 text-center sm:p-6">
                          <span className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-white text-destructive"><PackageX className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" /></span>
                          <h3 className="mt-3 text-[18px] font-bold text-destructive">{order.status === "cancelled" ? t("trkCancelled") : t("trkRefunded")}</h3>
                          <p className="mt-1 text-[15px] text-muted-foreground">{t("trkClosedText")}</p>
                        </section>
                      )}

                      {/* Pagamento pendente */}
                      {order.status === "pending" && (
                        <OrderPaymentDetails
                          orderId={order.id}
                          paymentMethod={order.payment_method}
                          total={order.total}
                          guestEmail={order.guest_email}
                          paymentProofUrl={order.payment_proof_url}
                          proof="when-required"
                        />
                      )}

                      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        {/* Andamento */}
                        {!closed && (
                          <section className={cn(cardCls, "p-5 sm:p-6")} aria-labelledby="track-progress-title">
                            <h3 id="track-progress-title" className={h3Cls}>{t("trkProgress")}</h3>
                            <ol className="mt-5">
                              {STEPS.map((step, i) => {
                                const done = i <= stepIndex;
                                const isCurrent = i === stepIndex;
                                const when = stepDate(step.key);
                                const last = i === STEPS.length - 1;
                                return (
                                  <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0" aria-current={isCurrent ? "step" : undefined}>
                                    {!last && <span className={cn("absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-0.5 rounded-full", i < stepIndex ? "bg-primary" : "bg-brand-card-border")} aria-hidden="true" />}
                                    <span className={cn(
                                      "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200",
                                      done ? "border-primary bg-primary text-primary-foreground" : "border-brand-card-border bg-white text-muted-foreground",
                                      isCurrent && "shadow-[var(--shadow-ring-royal)]",
                                    )}>
                                      {done && !isCurrent ? <Check className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" /> : <step.Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
                                    </span>
                                    <div className="min-w-0 pt-2">
                                      <p className={cn("text-[15px] leading-tight", done ? "font-semibold text-foreground" : "text-muted-foreground")}>{t(step.label)}</p>
                                      {when && done && <p className="mt-1 text-[13px] text-muted-foreground">{dateTime(when)}</p>}
                                    </div>
                                  </li>
                                );
                              })}
                            </ol>
                          </section>
                        )}

                        {/* Eventos da transportadora, do mais recente para o mais antigo */}
                        {events.length > 0 && (
                          <section className={cn(cardCls, "p-5 sm:p-6")} aria-labelledby="track-events-title">
                            <h3 id="track-events-title" className={h3Cls}>{t("trkCarrierEvents")}</h3>
                            <ol className="mt-5 space-y-4 border-l-2 border-brand-card-border pl-5">
                              {events.map((ev, i) => (
                                <li key={`${ev.occurred_at}-${i}`} className="relative">
                                  <span className={cn("absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white", i === 0 ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden="true" />
                                  <p className={cn("text-[15px]", i === 0 ? "font-semibold text-foreground" : "text-brand-ink-soft")}>{ev.status_label || t("trkEventFallback")}</p>
                                  <p className="text-[13px] text-muted-foreground">{dateTime(ev.occurred_at)}</p>
                                </li>
                              ))}
                            </ol>
                          </section>
                        )}

                        {/* Itens */}
                        {!!order.order_items?.length && (
                          <section className={cn(cardCls, "p-5 sm:p-6", (closed || events.length > 0) && "lg:col-span-2")} aria-labelledby="track-items-title">
                            <h3 id="track-items-title" className={h3Cls}>{t("ordersItems")}</h3>
                            <ul className="mt-4 divide-y divide-brand-card-border">
                              {order.order_items.map((item) => {
                                const name = item.products?.name || item.design_data?.name || t("ordersProduct");
                                return (
                                  <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                    <ItemThumb src={item.products?.image || item.design_data?.image || null} alt={name} Icon={Package} />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[15px] font-semibold">{name}</p>
                                      <p className="text-[13px] text-muted-foreground">{t("qty", { count: item.quantity })}</p>
                                    </div>
                                    <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">{money(item.price * item.quantity)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        )}
                      </div>

                      {user && (
                        <div className="flex justify-center">
                          <Link to="/dashboard?tab=pedidos" className={btnSecondary}>{t("trkSeeInAccount")}</Link>
                        </div>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <OrderHelp />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
};

export default OrderTracking;
