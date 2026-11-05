import { STORE_DEFAULTS } from "@/config/store";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { MotionConfig } from "framer-motion";
import { Package, Truck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import OrderHistory from "@/components/dashboard/OrderHistory";
import OrderHelp from "@/components/dashboard/OrderHelp";
import { EmptyState, btnPrimary, btnSecondary, eyebrowCls, h1Cls } from "@/components/dashboard/ui";
import { useAuth } from "@/hooks/useAuth";
import { useOrders } from "@/hooks/useOrders";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";

/** /minhas-compras: os pedidos da conta (as compras exigem conta; o checkout sem registo foi desativado). */
const MyOrders = () => {
  const { t } = useMessages(accountMessages);
  const { user, loading: authLoading } = useAuth();
  const { orders, isLoading } = useOrders(user?.id);
  const { data: storeInfo } = useStoreInfo();
  const store = storeInfo?.name || STORE_DEFAULTS.name;

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{t("myMeta", { store })}</title>
        <meta name="description" content={t("myMetaDescription")} />
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 pb-16 md:pb-20">
          <div className="shell pt-5 md:pt-8">
            <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("myTitle") }]} />
            <header className="mt-5 flex flex-col gap-4 md:mt-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className={eyebrowCls}>{t("myEyebrow")}</p>
                <h1 className={`${h1Cls} mt-2`}>{t("myTitle")}</h1>
                <p className="mt-2 max-w-2xl text-[16px] text-brand-ink-soft sm:text-[17px]">{t("myLead")}</p>
              </div>
              {user && (
                <div className="flex flex-wrap gap-2">
                  <Link to="/rastrear" className={btnSecondary}><Truck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("dashTrack")}</Link>
                  <Link to="/dashboard" className={btnSecondary}>{t("myGoDashboard")}</Link>
                </div>
              )}
            </header>

            <div className="mx-auto mt-8 max-w-4xl">
              {authLoading ? (
                <div className="space-y-3" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-40 rounded-[20px]" />)}</div>
              ) : !user ? (
                <EmptyState Icon={Package} title={t("myGuestTitle")} text={t("myGuestText")}>
                  <Link to="/auth?redirect=/minhas-compras" className={btnPrimary}>{t("signIn")}</Link>
                  <Link to="/rastrear" className={btnSecondary}><Truck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("myTrackInstead")}</Link>
                </EmptyState>
              ) : (
                <OrderHistory orders={orders} isLoading={isLoading} />
              )}
              <OrderHelp />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
};

export default MyOrders;
