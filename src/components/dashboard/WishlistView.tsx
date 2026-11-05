import { useMemo, useState } from "react";
import { CartStockError } from "@/hooks/useCart";
import FeatureLink from "@/components/FeatureLink";
import { Link } from "react-router-dom";
import { ChevronDown, Heart, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { ProductCard3D, ProductCardSkeleton, type CardProduct } from "@/components/product/ProductCard3D";
import { useAuth } from "@/hooks/useAuth";
import { useWishlist } from "@/hooks/useWishlist";
import { useQuickAdd } from "@/hooks/useQuickAdd";
import { useProductCards } from "@/hooks/useProductCards";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { cn } from "@/lib/utils";
import { EmptyState, btnPrimary, btnSecondary, focusRing } from "./ui";
import { useAccountPage } from "@/hooks/useAccountPage";
import { accountPageMessages } from "@/i18n/accountPage";
import { sortFavorites, type FavoriteSort } from "@/lib/accountPage";

const GRID_NARROW = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4";
const GRID_WIDE = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

/**
 * Grade dos favoritos com o cartão de produto PRINT3D (preço pelo país e moeda, promoção e avaliação reais).
 * `wide`: página /favoritos (sem coluna lateral); sem `wide`: aba Favoritos da conta.
 * Ordenar e "Em promoção": Admin > Aparência da loja > Área do cliente (favorites_tools).
 */
export function FavoritesGrid({ userId, wide = false }: { userId: string; wide?: boolean }) {
  const { t } = useMessages(accountMessages);
  const { wishlistItems, isLoading: wishlistLoading, isInWishlist, toggleWishlist } = useWishlist(userId);
  const quickAdd = useQuickAdd();
  const ids = useMemo(() => wishlistItems.map((i: any) => i.product_id as string), [wishlistItems]);
  const products = useProductCards(ids, "wishlist-cards");
  const cards = products.cards;
  const { t: ta } = useMessages(accountPageMessages);
  const tools = useAccountPage().favorites_tools;
  const [sort, setSort] = useState<FavoriteSort>("recent");
  const [onlySale, setOnlySale] = useState(false);
  const onSale = cards.filter((c) => (c.discountPct ?? 0) > 0).length;
  const shown = tools ? sortFavorites(cards, sort, onlySale && onSale > 0) : cards;

  const grid = wide ? GRID_WIDE : GRID_NARROW;

  if (wishlistLoading || (ids.length > 0 && products.isLoading)) {
    return <div className={grid} aria-busy="true">{Array.from({ length: wide ? 5 : 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</div>;
  }

  if (products.isError) {
    return (
      <div role="alert" className="rounded-[24px] border border-brand-card-border bg-white px-5 py-12 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] bg-brand-orange-soft text-primary"><WifiOff className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
        <h2 className="mt-5 text-[22px] font-bold tracking-[-0.02em]">{t("favErrorTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{t("favErrorText")}</p>
        <button type="button" onClick={() => products.refetch()} className={cn(btnPrimary, "mt-7")}>
          <RefreshCw className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t("retry")}
        </button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <EmptyState Icon={Heart} title={t("favEmptyTitle")} text={t("favEmptyText")}>
        <Link to="/produtos" className={btnPrimary}>{t("exploreProducts")}</Link>
        <FeatureLink to="/personalizar" className={btnSecondary}>{t("favCreate")}</FeatureLink>
      </EmptyState>
    );
  }

  const add = async (p: CardProduct) => {
    try {
      await quickAdd(p.id);
    } catch (e) {
      if (!(e instanceof CartStockError)) toast.error(t("favAddError"));
      throw e;
    }
    toast.success(t("favAdded"), { description: p.name });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">{cards.length === 1 ? t("favCount_one") : t("favCount_other", { count: cards.length })}</p>
        {tools && cards.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {onSale > 0 && (
              <button type="button" aria-pressed={onlySale} onClick={() => setOnlySale((v) => !v)}
                className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors duration-150",
                  onlySale ? "border-foreground bg-foreground text-background" : "border-border bg-white text-foreground hover:border-primary", focusRing)}>
                {ta("fav_sale")}
                <span className={cn("rounded-full px-1.5 text-[12px] tabular-nums", onlySale ? "bg-white/20" : "bg-brand-alt text-brand-ink-soft")}>{onSale}</span>
              </button>
            )}
            <label className="relative">
              <span className="sr-only">{ta("fav_sort")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as FavoriteSort)}
                className={cn("h-10 appearance-none rounded-full border border-border bg-white pl-4 pr-9 text-[14px] font-semibold text-foreground hover:border-primary", focusRing)}>
                <option value="recent">{ta("fav_recent")}</option>
                <option value="price_asc">{ta("fav_price_asc")}</option>
                <option value="price_desc">{ta("fav_price_desc")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            </label>
          </div>
        )}
      </div>
      <div className={grid}>
        {shown.map((p) => (
          <ProductCard3D key={p.id} p={p} favorite={isInWishlist(p.id)} onFavorite={toggleWishlist} onAdd={add} />
        ))}
      </div>
    </div>
  );
}

/** Aba Favoritos de /dashboard. */
const WishlistView = () => {
  const { user } = useAuth();
  if (!user) return null;
  return <FavoritesGrid userId={user.id} />;
};

export default WishlistView;
