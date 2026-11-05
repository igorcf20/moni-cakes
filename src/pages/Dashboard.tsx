// =====================================================================================
// Área do cliente (/dashboard?tab=...). Abas em dois grupos:
//   Compras      Resumo (andamento, compre de novo, sugestões), Pedidos, Devoluções, Faturas, Favoritos
//   Minha conta  Dados pessoais, Endereços, Segurança, Privacidade (dados, cookies, apagar conta)
// Formato (saudação, menu, números, blocos do resumo, ajuda): Admin > Aparência da loja > Área do cliente
// (store_settings.account_page, src/lib/accountPage.ts, useAccountPage).
// Aba nova = uma entrada em SECTIONS (com o grupo) + sec_<id> e sec_<id>_hint em src/i18n/account.ts.
// =====================================================================================
import { STORE_DEFAULTS } from "@/config/store";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "framer-motion";
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronRight, LifeBuoy, MessageCircle, Coins, Download, Heart, Repeat, KeyRound, LayoutGrid, LogOut, MapPin, Package,
  Receipt, RotateCcw, ShieldCheck, Truck, User, Store, Megaphone, ClipboardList,
} from "lucide-react";
import { Helmet } from "react-helmet";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import OrderHistory from "@/components/dashboard/OrderHistory";
import AddressManager from "@/components/dashboard/AddressManager";
import WishlistView from "@/components/dashboard/WishlistView";
import ProfileView, { SecuritySection } from "@/components/dashboard/ProfileView";
import DangerZone from "@/components/dashboard/DangerZone";
import InvoicesView from "@/components/dashboard/InvoicesView";
import ReturnsView from "@/components/dashboard/ReturnsView";
import RewardPointsView from "@/components/dashboard/RewardPointsView";
import DownloadsView from "@/components/dashboard/DownloadsView";
import SubscriptionsView from "@/components/dashboard/SubscriptionsView";
import VendorPanelView from "@/components/dashboard/VendorPanelView";
import AffiliatePanelView from "@/components/dashboard/AffiliatePanelView";
import QuotesView from "@/components/dashboard/QuotesView";
import AccountForYou from "@/components/dashboard/AccountForYou";
import { initialsOf, joinList, orderCode } from "@/components/dashboard/accountUtils";
import { ItemThumb, StatusBadge, btnPrimary, btnSecondary, btnSmall, cardCls, eyebrowCls, focusRing, h1Cls, h3Cls, iconTile } from "@/components/dashboard/ui";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { useAddresses } from "@/hooks/useAddresses";
import { useWishlist } from "@/hooks/useWishlist";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useTaxIdRules } from "@/hooks/useTaxIdRules";
import { useCurrency } from "@/hooks/use-currency";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { isValidTaxId } from "@/lib/taxId";
import { useFeature } from "@/hooks/useFeatures";
import { useMyVendor } from "@/hooks/useMarketplace";
import { useMyAffiliate } from "@/hooks/useAffiliates";
import { ReviewReminder } from "@/components/dashboard/ReviewReminder";
import { useCountry } from "@/lib/countries";
import { useAccountPage } from "@/hooks/useAccountPage";
import { accountPageMessages } from "@/i18n/accountPage";
import { showReadiness } from "@/lib/accountPage";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";

const EASE = [0.16, 1, 0.3, 1] as const;

const SECTIONS = [
  { id: "resumo", Icon: LayoutGrid, group: "shop" },
  { id: "pedidos", Icon: Package, group: "shop" },
  { id: "devolucoes", Icon: RotateCcw, group: "shop" },
  { id: "orcamentos", Icon: ClipboardList, group: "shop" },
  { id: "faturas", Icon: Receipt, group: "shop" },
  { id: "favoritos", Icon: Heart, group: "shop" },
  { id: "assinaturas", Icon: Repeat, group: "shop" },
  { id: "downloads", Icon: Download, group: "shop" },
  { id: "pontos", Icon: Coins, group: "shop" },
  { id: "vendedor", Icon: Store, group: "shop" },
  { id: "afiliado", Icon: Megaphone, group: "shop" },
  { id: "perfil", Icon: User, group: "account" },
  { id: "moradas", Icon: MapPin, group: "account" },
  { id: "seguranca", Icon: KeyRound, group: "account" },
  { id: "privacidade", Icon: ShieldCheck, group: "account" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const GROUPS = [{ id: "shop", label: "navShop" }, { id: "account", label: "navAccount" }] as const;

// Links antigos usavam nomes em inglês; continuam a funcionar.
const ALIASES: Record<string, SectionId> = { orders: "pedidos", invoices: "faturas", returns: "devolucoes", addresses: "moradas", wishlist: "favoritos", points: "pontos", subscriptions: "assinaturas", profile: "perfil", security: "seguranca", privacy: "privacidade" };
const CLOSED_STATUSES = ["delivered", "completed", "cancelled", "refunded"];

const Dashboard = () => {
  const { t, locale } = useMessages(accountMessages);
  const { t: ta } = useMessages(accountPageMessages);
  const layout = useAccountPage();
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const { orders, isLoading: ordersLoading } = useOrders(user?.id);
  const { addresses } = useAddresses(user?.id);
  const { wishlistItems } = useWishlist(user?.id);
  const { data: storeInfo } = useStoreInfo();
  const { currentCurrency, convert } = useCurrency();
  const country = useCountry();
  const taxRules = useTaxIdRules();
  const store = storeInfo?.name || STORE_DEFAULTS.name;
  const activeChip = useRef<HTMLButtonElement>(null);
  const chipsNav = useRef<HTMLElement>(null);

  // Abas de recursos desligados em Admin > Recursos da loja não aparecem (e o endereço delas abre o resumo).
  const returnsOn = useFeature("returns");
  const wishlistOn = useFeature("wishlist");
  const pointsOn = useFeature("reward_points");
  const subscriptionsOn = useFeature("subscriptions");
  const downloadsOn = useFeature("digital_products");
  const quotesOn = useFeature("quotes");
  // Aba Vendedor: só para contas ligadas a um vendedor do marketplace (useMyVendor já respeita o recurso).
  const { data: myVendor } = useMyVendor();
  // Aba Afiliado: só para afiliados aprovados (ativos ou pausados).
  const { data: myAffiliate } = useMyAffiliate();
  const affiliateOn = !!myAffiliate && (myAffiliate.status === "active" || myAffiliate.status === "paused");
  const tabs = SECTIONS.filter((s) => (s.id !== "devolucoes" || returnsOn) && (s.id !== "orcamentos" || quotesOn) && (s.id !== "favoritos" || wishlistOn) && (s.id !== "pontos" || pointsOn) && (s.id !== "assinaturas" || subscriptionsOn) && (s.id !== "downloads" || downloadsOn) && (s.id !== "vendedor" || !!myVendor) && (s.id !== "afiliado" || affiliateOn));
  const raw = params.get("tab") || "resumo";
  const wanted = (tabs.some((s) => s.id === raw) ? raw : ALIASES[raw] ?? "resumo") as SectionId;
  const section: SectionId = tabs.some((s) => s.id === wanted) ? wanted : "resumo";
  const go = (id: SectionId) => {
    setParams(id === "resumo" ? {} : { tab: id });
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Sem sessão: login e volta para a mesma aba (ex.: links de e-mail para ?tab=pedidos).
  const tabQuery = params.toString();
  useEffect(() => {
    if (!authLoading && !user) navigate(`/auth?redirect=${encodeURIComponent(`/dashboard${tabQuery ? `?${tabQuery}` : ""}`)}`, { replace: true });
  }, [user, authLoading, navigate, tabQuery]);

  // No celular, a aba ativa fica centrada na faixa rolável (sem mexer na rolagem da página).
  const hasUser = !!user;
  useEffect(() => {
    const nav = chipsNav.current;
    const chip = activeChip.current;
    if (!nav || !chip) return;
    nav.scrollLeft = Math.max(0, chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2);
  }, [section, hasUser]);

  const label = (id: SectionId) => t(`sec_${id}`);
  // Sem documento fiscal no país (taxIdKind none), o resumo de Dados pessoais não o menciona.
  const hint = (id: SectionId) => (id === "perfil" && !taxRules.enabled ? t("sec_perfil_hint_basic") : t(`sec_${id}_hint`, { label: taxRules.label }));

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1" aria-busy="true" aria-label={t("dashLoading")}>
          <div className="shell space-y-6 pb-16 pt-6 md:pt-8">
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-32 rounded-[24px]" />
            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="skeleton hidden h-80 rounded-[20px] lg:block" />
              <div className="space-y-4"><div className="skeleton h-28 rounded-[20px]" /><div className="skeleton h-48 rounded-[20px]" /></div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const list = orders || [];
  const active = list.filter((o: any) => !CLOSED_STATUSES.includes(o.status));
  const latest: any = list[0];
  const money = (v: number) => formatPrice(convert(Number(v) || 0), currentCurrency);

  const fullName: string = profile?.full_name || user.user_metadata?.full_name || "";
  const firstName = fullName.trim().split(/\s+/)[0] || user.email?.split("@")[0] || t("dashCustomer");
  const initials = initialsOf(fullName || user.email || "");

  // O que ainda falta para finalizar a compra sem interrupções.
  const missingProfile = [
    !fullName.trim() && t("missName"),
    String(profile?.phone || "").replace(/\D/g, "").length < 9 && t("missPhone"),
    country.taxIdRequired && !isValidTaxId(country.taxIdKind, String(profile?.tax_id || "")) && taxRules.label,
  ].filter(Boolean) as string[];
  const missingAddress = !(addresses?.length);
  const missing = missingAddress ? [...missingProfile, t("missAddress")] : missingProfile;
  const completeness = Math.round(((4 - missing.length) / 4) * 100);

  const stats = [
    { id: "pedidos" as SectionId, label: t("statOrders"), value: list.length, sub: active.length ? t("statOrdersActive", { count: active.length }) : t("statOrdersNone"), Icon: Package },
    ...(wishlistOn ? [{ id: "favoritos" as SectionId, label: t("statFavorites"), value: wishlistItems?.length || 0, sub: t("statFavoritesSub"), Icon: Heart }] : []),
    { id: "moradas" as SectionId, label: t("statAddresses"), value: addresses?.length || 0, sub: t("statAddressesSub"), Icon: MapPin },
  ];

  // Números ao lado dos itens do menu (Admin > Área do cliente > Contadores no menu).
  const navCount = (id: SectionId): { n: number; label: string } | null => {
    if (!layout.nav_counts) return null;
    if (id === "pedidos" && active.length) return { n: active.length, label: ta("nav_active", { count: active.length }) };
    if (id === "favoritos" && wishlistItems?.length) return { n: wishlistItems.length, label: ta("nav_count", { count: wishlistItems.length }) };
    if (id === "moradas" && addresses?.length) return { n: addresses.length, label: ta("nav_count", { count: addresses.length }) };
    return null;
  };
  const since = user.created_at ? new Date(user.created_at).toLocaleDateString(locale, { month: "short", year: "numeric" }) : null;
  const readinessOn = showReadiness(layout.readiness, completeness);
  const latestOn = active.length === 0;

  const crumbs = [{ label: t("home"), href: "/" }, { label: t("account"), href: "/dashboard" }, ...(section === "resumo" ? [] : [{ label: label(section) }])];

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{t("dashMeta", { section: label(section), store })}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 pb-16 md:pb-20">
          <div className="shell pt-5 md:pt-8">
            <CatalogBreadcrumb items={crumbs} />

            {/* Saudação: faixa compacta (nome em texto normal) ou o cartão alto com título grande (modelo Clássico) */}
            {layout.header === "compact" ? (
              <section className={cn(cardCls, "mt-5 p-4 sm:p-5")} aria-labelledby="account-hello">
                <div className="flex items-center gap-3.5 sm:gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-primary text-[17px] font-bold tracking-tight text-primary-foreground" aria-hidden="true">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p id="account-hello" role="heading" aria-level={1} className="truncate text-[21px] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[24px]">{t("dashHello", { name: firstName })}</p>
                    <p className="mt-0.5 truncate text-[14px] text-muted-foreground">
                      {user.email}
                      {since && <span className="hidden sm:inline"><span aria-hidden="true"> · </span>{ta("since", { date: since })}</span>}
                    </p>
                  </div>
                  <div className="hidden shrink-0 gap-2 sm:flex">
                    <Link to="/rastrear" className={btnSmall}><Truck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("dashTrack")}</Link>
                    <Link to="/produtos" className={cn(btnSmall, "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground")}>{t("exploreProducts")}<ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></Link>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:hidden">
                  <Link to="/rastrear" className={cn(btnSmall, "px-3")}><Truck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("dashTrack")}</Link>
                  <Link to="/produtos" className={cn(btnSmall, "border-primary bg-primary px-3 text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground")}>{t("exploreProducts")}</Link>
                </div>
              </section>
            ) : (
              <section className={cn(cardCls, "mt-5 rounded-[24px] p-5 sm:p-7")} aria-labelledby="account-hello">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] bg-[image:var(--gradient-primary)] text-[22px] font-bold tracking-tight text-white shadow-[var(--shadow-glow-orange)]" aria-hidden="true">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={eyebrowCls}>{t("account")}</p>
                    <h1 id="account-hello" className={cn(h1Cls, "mt-1.5 truncate")}>{t("dashHello", { name: firstName })}</h1>
                    <p className="mt-1 truncate text-[15px] text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-nowrap">
                    <Link to="/produtos" className={btnPrimary}>{t("exploreProducts")}<ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" /></Link>
                    <Link to="/rastrear" className={btnSecondary}><Truck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("dashTrack")}</Link>
                  </div>
                </div>
              </section>
            )}

            {/* Abas roláveis no celular */}
            <nav ref={chipsNav} aria-label={t("dashNav")} className="relative -mx-4 mt-6 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6 lg:hidden">
              <ul className="flex gap-2">
                {tabs.map(({ id, Icon, group }, i) => {
                  const on = id === section;
                  return [
                    i > 0 && group !== tabs[i - 1].group && <li key={`sep-${id}`} className="my-2 w-px shrink-0 self-stretch bg-border" aria-hidden="true" />,
                    <li key={id} className="shrink-0">
                      <button
                        ref={on ? activeChip : undefined}
                        type="button" onClick={() => go(id)} aria-current={on ? "page" : undefined}
                        className={cn(
                          "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[12px] border px-4 text-[14px] font-semibold transition-colors duration-150",
                          on ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow-orange)]" : "border-border bg-white text-foreground hover:border-primary hover:text-brand-orange-text",
                          focusRing,
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        {label(id)}
                        {navCount(id) && <span className={cn("rounded-full px-1.5 text-[12px] font-semibold tabular-nums", on ? "bg-white/20" : "bg-brand-alt text-brand-ink-soft")} aria-label={navCount(id)!.label}>{navCount(id)!.n}</span>}
                        {id === "perfil" && missingProfile.length > 0 && <><span className={cn("h-2 w-2 rounded-full", on ? "bg-white" : "bg-primary")} aria-hidden="true" /><span className="sr-only">{t("dashMissingDot")}</span></>}
                      </button>
                    </li>,
                  ];
                })}
              </ul>
            </nav>

            <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
              {/* Navegação lateral no desktop */}
              <nav aria-label={t("dashNav")} className="hidden lg:block">
                <div className="sticky top-[100px] space-y-4">
                <div className={cn(cardCls, "p-2")}>
                  {GROUPS.map((g, gi) => (
                  <div key={g.id} className={cn(gi > 0 && "mt-2 border-t border-brand-card-border pt-2")}>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t(g.label)}</p>
                  <ul className="space-y-0.5">
                    {tabs.filter((s) => s.group === g.id).map(({ id, Icon }) => {
                      const on = id === section;
                      return (
                        <li key={id}>
                          <button
                            type="button" onClick={() => go(id)} aria-current={on ? "page" : undefined}
                            className={cn(
                              "relative flex w-full items-center gap-3 rounded-[14px] px-3 text-left transition-colors duration-150",
                              layout.nav_hints ? "py-2.5" : "min-h-11 py-1.5",
                              on ? "bg-accent" : "hover:bg-brand-alt",
                              focusRing,
                            )}
                          >
                            {on && <motion.span layoutId="account-nav" className="absolute inset-y-2.5 left-0 w-1 rounded-full bg-primary" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} aria-hidden="true" />}
                            <span className={cn("grid shrink-0 place-items-center rounded-[10px]", layout.nav_hints ? "h-9 w-9" : "h-8 w-8", on ? "bg-white text-primary" : "bg-brand-alt text-brand-ink-soft")}>
                              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className={cn("text-[15px]", on ? "font-semibold text-foreground" : "font-medium text-foreground")}>{label(id)}</span>
                              {layout.nav_hints && <span className="truncate text-[12px] text-muted-foreground">{hint(id)}</span>}
                            </span>
                            {navCount(id) && (
                              <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums", on ? "bg-white text-brand-orange-text" : "bg-brand-alt text-brand-ink-soft")} aria-label={navCount(id)!.label}>{navCount(id)!.n}</span>
                            )}
                            {id === "perfil" && missingProfile.length > 0 && <><span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span className="sr-only">{t("dashMissingDot")}</span></>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  </div>
                  ))}
                  <div className="mt-1 border-t border-brand-card-border pt-1">
                    <button type="button" onClick={signOut} className={cn("flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium text-brand-ink-soft transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive", focusRing)}>
                      <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("dashSignOut")}
                    </button>
                  </div>
                </div>
                {layout.help_card && <HelpCard />}
                </div>
              </nav>

              <AnimatePresence mode="wait" initial={false}>
                <motion.section
                  key={section}
                  aria-labelledby="account-section-title"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="min-w-0"
                >
                  <header className="mb-5">
                    <h2 id="account-section-title" className="text-[24px] font-bold leading-tight tracking-[-0.03em] sm:text-[28px]">{label(section)}</h2>
                    <p className="mt-1 text-[15px] text-muted-foreground">{hint(section)}</p>
                  </header>

                  {section === "resumo" && (
                    <div className="space-y-5">
                      <ReviewReminder userId={user?.id} />
                      {/* Números da conta: uma faixa só (padrão) ou cartões separados (modelo Clássico) */}
                      {layout.stats === "strip" && (
                        <div className={cn(cardCls, "grid divide-x divide-brand-card-border", stats.length === 3 ? "grid-cols-3" : "grid-cols-2")} role="group" aria-label={ta("stats")}>
                          {stats.map(({ id, label: statLabel, value, sub, Icon }) => (
                            <button
                              key={id} type="button" onClick={() => go(id)}
                              className={cn("group flex min-w-0 flex-col items-start gap-1 p-3.5 text-left transition-colors duration-150 first:rounded-l-[20px] last:rounded-r-[20px] hover:bg-brand-alt sm:flex-row sm:items-center sm:gap-3.5 sm:p-5", focusRing)}
                            >
                              <span className={cn(iconTile, "hidden sm:grid")}><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                              <span className="min-w-0">
                                <span className="block text-[24px] font-bold leading-none tabular-nums tracking-[-0.03em] sm:text-[26px]">{value}</span>
                                <span className="mt-1 block truncate text-[13px] font-semibold text-foreground sm:text-[14px]">{statLabel}</span>
                                <span className="hidden truncate text-[12px] text-muted-foreground sm:block">{sub}</span>
                              </span>
                              <ChevronRight className="ml-auto hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 lg:block" aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      )}
                      {layout.stats === "cards" && <div className="grid gap-3 sm:grid-cols-3">
                        {stats.map(({ id, label: statLabel, value, sub, Icon }, i) => (
                          <motion.button
                            key={id} type="button" onClick={() => go(id)}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE, delay: i * 0.05 }}
                            className={cn(cardCls, "group flex items-center gap-4 p-4 text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] sm:flex-col sm:items-start sm:p-5", focusRing)}
                          >
                            <span className={iconTile}><Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="text-[28px] font-bold leading-none tabular-nums tracking-[-0.03em]">{value}</span>
                                <span className="text-[15px] font-semibold text-foreground">{statLabel}</span>
                              </span>
                              <span className="mt-1.5 block truncate text-[13px] text-muted-foreground">{sub}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 sm:hidden" aria-hidden="true" />
                          </motion.button>
                        ))}
                      </div>}

                      {(readinessOn || latestOn) && <div className={cn("grid gap-5", readinessOn && latestOn && "xl:grid-cols-2")}>
                        {/* Conta pronta para comprar (Admin > Área do cliente: some quando está tudo preenchido, sempre, ou nunca) */}
                        {readinessOn && <div className={cn(cardCls, "p-5 sm:p-6")}>
                          <div className="flex items-center justify-between gap-3">
                            <h3 className={h3Cls}>{t("readyTitle")}</h3>
                            <span className="text-[15px] font-bold tabular-nums text-brand-orange-text">{completeness}%</span>
                          </div>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-brand-alt" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completeness} aria-label={t("readyTitle")}>
                            <motion.div className="h-full origin-left rounded-full bg-primary" initial={{ scaleX: 0 }} animate={{ scaleX: completeness / 100 }} transition={{ duration: 0.6, ease: EASE }} />
                          </div>
                          {missing.length ? (
                            // Sozinho na linha (sem o cartão do último pedido), o que falta e o botão ficam lado a lado.
                            <div className={cn("mt-3", !latestOn && "sm:flex sm:items-center sm:justify-between sm:gap-6")}>
                              <p className="flex items-start gap-2 text-[15px] leading-relaxed text-brand-ink-soft">
                                <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                                {t("readyMissing", { list: joinList(missing, locale) })}
                              </p>
                              <button type="button" onClick={() => go(missingProfile.length ? "perfil" : "moradas")} className={cn(latestOn ? "mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-[12px] text-[15px] font-semibold text-brand-orange-text hover:underline" : cn(btnSmall, "mt-3 shrink-0 sm:mt-0"), focusRing)}>
                                {t("readyComplete")}<ChevronRight className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <p className="mt-4 flex items-start gap-2 text-[15px] leading-relaxed text-brand-ink-soft">
                              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-600" strokeWidth={1.8} aria-hidden="true" />{t("readyDone")}
                            </p>
                          )}
                        </div>}

                        {/* Último pedido (com pedidos em andamento, o bloco de andamento abaixo mostra-os) */}
                        {latestOn && <div className={cn(cardCls, "p-5 sm:p-6")}>
                          <h3 className={h3Cls}>{t("latestTitle")}</h3>
                          {ordersLoading ? (
                            <div className="skeleton mt-4 h-24 rounded-[14px]" />
                          ) : latest ? (
                            <>
                              <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-[15px] font-semibold">{t("orderCode", { code: orderCode(latest.id) })}</p>
                                  <p className="mt-0.5 text-[13px] text-muted-foreground">{new Date(latest.created_at).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}</p>
                                </div>
                                <StatusBadge status={latest.status} />
                              </div>
                              {!!latest.order_items?.length && (
                                <div className="mt-4 flex gap-2">
                                  {latest.order_items.slice(0, 4).map((it: any) => (
                                    <ItemThumb key={it.id} src={it.products?.image || it.design_data?.image || null} alt={it.products?.name || ""} Icon={Package} className="h-12 w-12" />
                                  ))}
                                  {latest.order_items.length > 4 && <span className="grid h-12 w-12 place-items-center rounded-[12px] bg-brand-alt text-[13px] font-semibold text-brand-ink-soft">+{latest.order_items.length - 4}</span>}
                                </div>
                              )}
                              <div className="mt-4 flex items-center justify-between gap-3 border-t border-brand-card-border pt-4">
                                <span className="text-[18px] font-bold tabular-nums">{money(latest.total)}</span>
                                <button type="button" onClick={() => go("pedidos")} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-[12px] text-[15px] font-semibold text-brand-orange-text hover:underline", focusRing)}>
                                  {t("latestSee")}<ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="mt-4">
                              <p className="text-[15px] text-brand-ink-soft">{t("latestNone")}</p>
                              <Link to="/produtos" className={cn("mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-[12px] text-[15px] font-semibold text-brand-orange-text hover:underline", focusRing)}>
                                {t("exploreProducts")}<ChevronRight className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            </div>
                          )}
                        </div>}
                      </div>}

                      <AccountForYou userId={user.id} orders={list} ordersLoading={ordersLoading} onOrders={() => go("pedidos")} onFavorites={() => go("favoritos")} show={layout.summary} />

                    </div>
                  )}

                  {section === "pedidos" && <div className="mb-5"><ReviewReminder userId={user?.id} /></div>}
                  {section === "pedidos" && <OrderHistory orders={list} isLoading={ordersLoading} onInvoices={() => go("faturas")} />}
                  {section === "devolucoes" && <ReturnsView userId={user.id} orders={list} isLoading={ordersLoading} onOrders={() => go("pedidos")} />}
                  {section === "faturas" && <InvoicesView orders={list} isLoading={ordersLoading} profile={profile} onEditProfile={() => go("perfil")} />}
                  {section === "moradas" && <AddressManager />}
                  {section === "favoritos" && <WishlistView />}
                  {section === "assinaturas" && <SubscriptionsView />}
                  {section === "downloads" && <DownloadsView />}
                  {section === "vendedor" && <VendorPanelView />}
                  {section === "afiliado" && <AffiliatePanelView />}
                  {section === "orcamentos" && <QuotesView />}
                  {section === "pontos" && <RewardPointsView money={money} />}
                  {section === "perfil" && <ProfileView user={user} />}
                  {section === "seguranca" && <SecuritySection currentEmail={user.email || ""} />}
                  {section === "privacidade" && <DangerZone />}

                  {layout.help_card && <HelpCard className="mt-8 lg:hidden" />}

                  <button type="button" onClick={signOut} className={cn("mt-8 inline-flex min-h-11 items-center gap-2 rounded-[12px] px-1 text-[15px] font-medium text-brand-ink-soft hover:text-destructive lg:hidden", focusRing)}>
                    <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("dashSignOut")}
                  </button>
                </motion.section>
              </AnimatePresence>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
};

/** Atalhos de ajuda (Admin > Área do cliente > Cartão de ajuda): perguntas frequentes e contato da loja. */
function HelpCard({ className }: { className?: string }) {
  const { t } = useMessages(accountPageMessages);
  const link = cn("inline-flex min-h-10 items-center gap-2 rounded-[10px] text-[14px] font-semibold text-brand-orange-text hover:underline", focusRing);
  return (
    <aside className={cn("rounded-[20px] border border-brand-card-border bg-brand-alt p-4", className)} aria-label={t("help_title")}>
      <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <LifeBuoy className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t("help_title")}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t("help_text")}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 lg:flex-col">
        <Link to="/faq" className={link}><ChevronRight className="h-4 w-4" aria-hidden="true" />{t("help_faq")}</Link>
        <Link to="/contatos" className={link}><MessageCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("help_contact")}</Link>
      </div>
    </aside>
  );
}

export default Dashboard;
