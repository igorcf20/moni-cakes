import { STORE_DEFAULTS } from "@/config/store";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { MotionConfig } from "framer-motion";
import { Heart } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CatalogBreadcrumb } from "@/components/catalog/CatalogBreadcrumb";
import { ProductCardSkeleton } from "@/components/product/ProductCard3D";
import { FavoritesGrid } from "@/components/dashboard/WishlistView";
import { EmptyState, btnPrimary, btnSecondary, eyebrowCls, h1Cls } from "@/components/dashboard/ui";
import { useAuth } from "@/hooks/useAuth";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";

/** /favoritos: as peças salvas pelo cliente, com o mesmo cartão de produto da loja. */
const Wishlist = () => {
  const { t } = useMessages(accountMessages);
  const { user, loading: authLoading } = useAuth();
  const { data: storeInfo } = useStoreInfo();
  const store = storeInfo?.name || STORE_DEFAULTS.name;

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{t("favMeta", { store })}</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 pb-16 md:pb-20">
          <div className="shell pt-5 md:pt-8">
            <CatalogBreadcrumb items={[{ label: t("home"), href: "/" }, { label: t("favTitle") }]} />
            <header className="mt-5 md:mt-6">
              <p className={eyebrowCls}>{t("favEyebrow")}</p>
              <h1 className={`${h1Cls} mt-2`}>{t("favTitle")}</h1>
              <p className="mt-2 max-w-2xl text-[16px] text-brand-ink-soft sm:text-[17px]">{t("favLead")}</p>
            </header>

            <div className="mt-8">
              {authLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true">
                  {Array.from({ length: 5 }, (_, i) => <ProductCardSkeleton key={i} />)}
                </div>
              ) : !user ? (
                <EmptyState Icon={Heart} title={t("favGuestTitle")} text={t("favGuestText")}>
                  <Link to="/auth?redirect=/favoritos" className={btnPrimary}>{t("favSignIn")}</Link>
                  <Link to="/produtos" className={btnSecondary}>{t("exploreProducts")}</Link>
                </EmptyState>
              ) : (
                <FavoritesGrid userId={user.id} wide />
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
};

export default Wishlist;
