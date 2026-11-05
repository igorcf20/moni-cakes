import AdminAccountPage from "@/components/admin/AdminAccountPage";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminProducts from "@/components/admin/AdminProducts";
import AdminCoupons from "@/components/admin/AdminCoupons";
import AdminOrdersEnhanced from "@/components/admin/AdminOrdersEnhanced";
import AdminReviews from "@/components/admin/AdminReviews";
import AdminReturns from "@/components/admin/AdminReturns";
import AdminProductCompliance from "@/components/admin/AdminProductCompliance";
import AdminSitePages from "@/components/admin/AdminSitePages";
import AdminFeatures from "@/components/admin/AdminFeatures";
import AdminStockAlerts from "@/components/admin/AdminStockAlerts";
import AdminCartReservations from "@/components/admin/AdminCartReservations";
import AdminPreorders from "@/components/admin/AdminPreorders";
import AdminStockHistory from "@/components/admin/AdminStockHistory";
import AdminStockEntries from "@/components/admin/AdminStockEntries";
import AdminBarcodeLabels from "@/components/admin/AdminBarcodeLabels";
import AdminWarehouses from "@/components/admin/AdminWarehouses";
import AdminVendors from "@/components/admin/AdminVendors";
import AdminAffiliates from "@/components/admin/AdminAffiliates";
import AdminQuotes from "@/components/admin/AdminQuotes";
import AdminBlog from "@/components/admin/AdminBlog";
import AdminPolls from "@/components/admin/AdminPolls";
import AdminPopups from "@/components/admin/AdminPopups";
import AdminForum from "@/components/admin/AdminForum";
import AdminPunchout from "@/components/admin/AdminPunchout";
import AdminNewsletter from "@/components/admin/AdminNewsletter";
import AdminActivityLog from "@/components/admin/AdminActivityLog";
import AdminAccountSecurity from "@/components/admin/AdminAccountSecurity";
import AdminAbandonedCarts from "@/components/admin/AdminAbandonedCarts";
import AdminGiftCards from "@/components/admin/AdminGiftCards";
import AdminSubscriptions from "@/components/admin/AdminSubscriptions";
import AdminRentals from "@/components/admin/AdminRentals";
import AdminDigital from "@/components/admin/AdminDigital";
import AdminCheckoutFields from "@/components/admin/AdminCheckoutFields";
import AdminOrderPrinting from "@/components/admin/AdminOrderPrinting";
import AdminDeliveryDates from "@/components/admin/AdminDeliveryDates";
import AdminRewardPoints from "@/components/admin/AdminRewardPoints";
import AdminSpecs from "@/components/admin/AdminSpecs";
import AdminCrossSell from "@/components/admin/AdminCrossSell";
import AdminCompare from "@/components/admin/AdminCompare";
import AdminProductPage from "@/components/admin/AdminProductPage";
import AdminPriceDisplay from "@/components/admin/AdminPriceDisplay";
import AdminCheckoutPage from "@/components/admin/AdminCheckoutPage";
import AdminProductQuestions from "@/components/admin/AdminProductQuestions";
import AdminProductCodes from "@/components/admin/AdminProductCodes";
import AdminCustomerGroups from "@/components/admin/AdminCustomerGroups";
import AdminBrands from "@/components/admin/AdminBrands";
import AdminProductFeed from "@/components/admin/AdminProductFeed";
import AdminCurrencies from "@/components/admin/AdminCurrencies";
import AdminStats from "@/components/admin/AdminStats";
import AdminBanners from "@/components/admin/AdminBanners";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminVisualSettings from "@/components/admin/AdminVisualSettings";
import AdminSizes from "@/components/admin/AdminSizes";
import AdminShipping from "@/components/admin/AdminShipping";
import AdminPaymentConfig from "@/components/admin/AdminPaymentConfig";
import { AdminCategories } from "@/components/admin/AdminCategories";
import AdminPlugins from "@/components/admin/AdminPlugins";
import AdminCustomers from "@/components/admin/AdminCustomers";
import AdminSiteFaqs from "@/components/admin/AdminSiteFaqs";
import AdminCatalogPage from "@/components/admin/AdminCatalogPage";
import AdminIntegrations from "@/components/admin/AdminIntegrations";
import AdminEmailTemplates from "@/components/admin/AdminEmailTemplates";
import HomeEditor from "@/components/admin/home/HomeEditor";
import AdminPrivacy from "@/components/admin/AdminPrivacy";
import AdminProfitReport from "@/components/admin/AdminProfitReport";
import AdminFinance from "@/components/admin/finance/AdminFinance";
import AdminKits from "@/components/admin/AdminKits";
import { reopenSetupHelper } from "@/components/admin/AdminSetupHelper";
import BrandEditor from "@/components/admin/brand/BrandEditor";
import AdminShell from "@/components/admin/shell/AdminShell";
import { ALL_ADMIN_SECTIONS, adminHref, sectionHintKey, sectionNameKey } from "@/components/admin/shell/adminSections";
import { useMessages } from "@/i18n";
import { adminMessages } from "@/i18n/admin";
import { Info } from "lucide-react";

// ---------------------------------------------------------------------------------
// Página /admin: abre a seção de ?tab=<id> dentro da moldura do painel (AdminShell).
// O menu (grupos, ícones, contadores) está em src/components/admin/shell/adminSections.ts;
// aqui fica só o conteúdo de cada seção. Pedido, cliente e produto abrem em páginas próprias
// (src/pages/admin/*), também dentro da moldura.
// ---------------------------------------------------------------------------------

const Admin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, locale } = useMessages(adminMessages);
  // Abas antigas que mudaram de lugar: o menu do site agora são as categorias.
  // Primeiros passos deixou de ser seção: é o cartão do canto (AdminSetupHelper); ?tab=start abre as Estatísticas com ele.
  const MOVED: Record<string, string> = { menu: "categories", start: "stats" };
  const tabOf = (v: string | null) => (v && MOVED[v]) || v;
  const [activeTab, setActiveTab] = useState(tabOf(searchParams.get("tab")) || "stats");

  useEffect(() => {
    if (searchParams.get("tab") === "start") reopenSetupHelper();
  }, [searchParams]);

  useEffect(() => {
    const t = tabOf(searchParams.get("tab")) || "stats";
    if (t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const SECTION_VIEWS: Record<string, JSX.Element> = {
    stats: <AdminStats />,
    profit: <AdminProfitReport />,
    finance: <AdminFinance />,
    orders: <AdminOrdersEnhanced />,
    customers: <AdminCustomers />,
    coupons: <AdminCoupons />,
    reviews: <AdminReviews />,
    returns: <AdminReturns />,
    compliance: <AdminProductCompliance />,
    pages: <AdminSitePages />,
    features: <AdminFeatures />,
    "stock-history": <AdminStockHistory />,
    "stock-entries": <AdminStockEntries />,
    "barcode-labels": <AdminBarcodeLabels />,
    warehouses: <AdminWarehouses />,
    vendors: <AdminVendors />,
    affiliates: <AdminAffiliates />,
    quotes: <AdminQuotes />,
    blog: <AdminBlog />,
    polls: <AdminPolls />,
    popups: <AdminPopups />,
    forum: <AdminForum />,
    punchout: <AdminPunchout />,
    newsletter: <AdminNewsletter />,
    "activity-log": <AdminActivityLog />,
    "account-security": <AdminAccountSecurity />,
    "stock-alerts": <AdminStockAlerts />,
    "cart-reservations": <AdminCartReservations />,
    preorders: <AdminPreorders />,
    "abandoned-carts": <AdminAbandonedCarts />,
    "customer-groups": <AdminCustomerGroups />,
    "gift-cards": <AdminGiftCards />,
    subscriptions: <AdminSubscriptions />,
    rentals: <AdminRentals />,
    downloads: <AdminDigital />,
    "checkout-fields": <AdminCheckoutFields />,
    "order-printing": <AdminOrderPrinting />,
    "delivery-dates": <AdminDeliveryDates />,
    "reward-points": <AdminRewardPoints />,
    specs: <AdminSpecs />,
    "cross-sell": <AdminCrossSell />,
    compare: <AdminCompare />,
    "price-display": <AdminPriceDisplay />,
    "checkout-page": <AdminCheckoutPage />,
    "product-codes": <AdminProductCodes />,
    "product-questions": <AdminProductQuestions />,
    brands: <AdminBrands />,
    "product-feed": <AdminProductFeed />,
    currencies: <AdminCurrencies />,
    products: <AdminProducts />,
    categories: <AdminCategories />,
    sizes: <AdminSizes />,
    kits: <AdminKits />,
    brand: <BrandEditor />,
    visual: <AdminVisualSettings />,
    plugins: <AdminPlugins />,
    banners: <AdminBanners />,
    "home-content": <HomeEditor />,
    "product-page": <AdminProductPage />,
    "account-page": <AdminAccountPage />,
    faq: <AdminSiteFaqs />,
    "catalog-page": <AdminCatalogPage />,
    settings: <AdminSettings />,
    payment: <AdminPaymentConfig />,
    delivery: <AdminShipping />,
    integrations: <AdminIntegrations />,
    privacy: <AdminPrivacy />,
    emails: <AdminEmailTemplates />,
  };
  const current = ALL_ADMIN_SECTIONS.find((s) => s.value === activeTab) ?? ALL_ADMIN_SECTIONS[0];

  return (
    <AdminShell active={current.value}>
      <h1 className="sr-only">{t("panel")}</h1>
      {/* Cabeçalho da seção: nome, o que faz e (nas seções herdadas) o aviso de que o site novo ainda não as mostra */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-foreground">
            {t(sectionNameKey(current.value))}
          </h2>
          <p className="text-muted-foreground mt-1">{t(sectionHintKey(current.value))}</p>
          {current.notOnSite && (
            <p className="mt-3 inline-flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span><strong>{t("not_on_site")}.</strong> {t("not_on_site_hint")}</span>
            </p>
          )}
        </div>
        <p className="shrink-0 text-sm font-medium text-muted-foreground first-letter:uppercase">
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Estatísticas já são feitas de painéis: sem a caixa à volta. */}
      {current.value === "stats" || current.value === "profit" || current.value === "finance" ? (
        <div className="min-w-0">{SECTION_VIEWS[current.value]}</div>
      ) : (
        <div className="bg-card rounded-[20px] border p-3 md:p-6 min-h-[600px] min-w-0">
          {SECTION_VIEWS[current.value]}
        </div>
      )}
    </AdminShell>
  );
};

export default Admin;
