// =====================================================================================
// Blocos do Resumo da conta que ajudam a voltar a comprar, só com dados reais (nada inventado):
//   Pedidos em andamento   até 3, com a linha do andamento (OrderProgress)
//   Favoritos em promoção  aviso quando algum favorito tem promoção ativa
//   Compre de novo         produtos do catálogo já pedidos (sem personalização), do mais recente
//   Escolhidos para você   mais vendidos e destaques que o cliente ainda não comprou nem favoritou
//   Crie uma peça          atalhos para o personalizador e o orçamento 3D
// Cartões de produto: ProductCard3D (favorito, carrinho com confirmação).
// Cada bloco liga e desliga em Admin > Aparência da loja > Área do cliente (prop `show`, store_settings.account_page).
// =====================================================================================
import { useMemo } from "react";
import { CartStockError } from "@/hooks/useCart";
import { useFeature } from "@/hooks/useFeatures";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, MessageCircle, Package, Percent, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { ProductCard3D, ProductCardSkeleton, type CardProduct } from "@/components/product/ProductCard3D";
import type { Order } from "@/hooks/useOrders";
import { useHomeCatalog } from "@/hooks/useHomeCatalog";
import { useProductCards } from "@/hooks/useProductCards";
import { useQuickAdd } from "@/hooks/useQuickAdd";
import { useWishlist } from "@/hooks/useWishlist";
import { useCurrency } from "@/hooks/use-currency";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/currency";
import { isProgressStatus, orderCode } from "./accountUtils";
import OrderProgress from "./OrderProgress";
import { ItemThumb, StatusBadge, btnPrimary, btnSecondary, cardCls, focusRing, h3Cls, iconTile } from "./ui";

const GRID = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4";
const ACTIVE = ["pending", "awaiting_payment", "paid", "preparing", "in_production", "processing", "ready_for_pickup", "shipped"];

function Strip({ title, text, cards, loading, onAdd, favorites, onSeeAll, seeAll }: {
  title: string; text: string; cards: CardProduct[]; loading: boolean; onAdd: (p: CardProduct) => Promise<void>;
  favorites: { isInWishlist: (id: string) => boolean; toggleWishlist: (id: string) => void }; onSeeAll?: () => void; seeAll: string;
}) {
  if (!loading && cards.length === 0) return null;
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className={h3Cls}>{title}</h3>
          <p className="mt-0.5 text-[14px] text-muted-foreground">{text}</p>
        </div>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className={cn("inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[12px] text-[14px] font-semibold text-brand-orange-text hover:underline", focusRing)}>
            {seeAll}<ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={GRID}>
        {loading
          ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)
          : cards.slice(0, 4).map((p) => (
              <ProductCard3D key={p.id} p={p} favorite={favorites.isInWishlist(p.id)} onFavorite={favorites.toggleWishlist} onAdd={onAdd} />
            ))}
      </div>
    </section>
  );
}

const SHOW_ALL = { active_orders: true, buy_again: true, for_you: true, create: true };

export default function AccountForYou({ userId, orders, ordersLoading, onOrders, onFavorites, show = SHOW_ALL }: {
  userId: string; orders: Order[]; ordersLoading: boolean; onOrders: () => void; onFavorites: () => void;
  show?: typeof SHOW_ALL;
}) {
  const { t, locale } = useMessages(accountMessages);
  const navigate = useNavigate();
  const quickAdd = useQuickAdd();
  const { currentCurrency, convert } = useCurrency();
  const wishlist = useWishlist(userId);
  const wishlistOn = useFeature("wishlist");
  const home = useHomeCatalog(null);

  const active = orders.filter((o) => ACTIVE.includes(o.status)).slice(0, 3);

  // Produtos do catálogo já pedidos, sem personalização, do pedido mais recente para o mais antigo.
  const boughtIds = useMemo(() => {
    const seen = new Set<string>();
    for (const o of orders) {
      if (["cancelled", "refunded"].includes(o.status)) continue;
      for (const it of o.order_items || []) if (it.product_id && !it.design_data?.customization) seen.add(it.product_id);
    }
    return [...seen].slice(0, 8);
  }, [orders]);
  const again = useProductCards(boughtIds, "account-buy-again");

  const wishIds = useMemo(() => wishlist.wishlistItems.map((i: { product_id: string }) => i.product_id), [wishlist.wishlistItems]);
  const favCards = useProductCards(wishIds, "wishlist-cards");
  const favOnSale = favCards.cards.filter((c) => c.discountPct > 0).length;

  const picks = useMemo(() => {
    const skip = new Set([...boughtIds, ...wishIds]);
    const seen = new Set<string>();
    return [...home.best, ...home.featured].filter((c) => !skip.has(c.id) && !seen.has(c.id) && seen.add(c.id));
  }, [home.best, home.featured, boughtIds, wishIds]);

  const add = async (p: CardProduct) => {
    if (p.needsOptions) {
      navigate(`/produto/${p.id}`);
      return;
    }
    try {
      await quickAdd(p.id); // o carrinho já mostra a confirmação
    } catch (e) {
      if (!(e instanceof CartStockError)) toast.error(t("fyAddError"));
      throw e;
    }
  };
  const money = (v: number) => formatPrice(convert(Number(v) || 0), currentCurrency);
  const favorites = { isInWishlist: wishlist.isInWishlist, toggleWishlist: wishlist.toggleWishlist };

  return (
    <div className="space-y-8">
      {/* Pedidos em andamento */}
      {show.active_orders && !ordersLoading && active.length > 0 && (
        <section className={cn(cardCls, "p-5 sm:p-6")} aria-labelledby="fy-active">
          <div className="flex items-center justify-between gap-3">
            <h3 id="fy-active" className={h3Cls}>{t("fyActiveTitle")}</h3>
            <button type="button" onClick={onOrders} className={cn("inline-flex min-h-11 items-center gap-1 rounded-[12px] text-[14px] font-semibold text-brand-orange-text hover:underline", focusRing)}>
              {t("fyActiveMore")}<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-4 divide-y divide-brand-card-border">
            {active.map((o) => (
              <li key={o.id} className="py-4 first:pt-0 last:pb-0">
                <button type="button" onClick={onOrders} className={cn("w-full rounded-[14px] text-left", focusRing)}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex -space-x-2">
                      {(o.order_items || []).slice(0, 3).map((it) => (
                        <ItemThumb key={it.id} src={it.products?.image || it.design_data?.image || null} alt="" Icon={Package} className="h-10 w-10 ring-2 ring-white" />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{t("orderCode", { code: orderCode(o.id) })}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                        <span aria-hidden="true"> · </span>{money(o.total)}
                      </p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  {isProgressStatus(o.status) && <OrderProgress order={o} compact className="mt-3" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Favoritos em promoção */}
      {wishlistOn && favOnSale > 0 && (
        <div className="flex flex-col gap-3 rounded-[20px] border border-primary/25 bg-accent p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="flex items-center gap-3 text-[15px] font-semibold">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white text-primary"><Percent className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
            {favOnSale === 1 ? t("fyPromo_one") : t("fyPromo_other", { count: favOnSale })}
          </p>
          <button type="button" onClick={onFavorites} className={cn(btnPrimary, "min-h-11 px-5 text-[14px]")}>{t("fyPromoCta")}</button>
        </div>
      )}

      {show.buy_again && <Strip
        title={t("fyBuyAgainTitle")} text={t("fyBuyAgainText")} cards={again.cards} loading={again.isLoading}
        onAdd={add} favorites={favorites} onSeeAll={boughtIds.length > 4 ? onOrders : undefined} seeAll={t("fySeeAll")}
      />}
      {show.for_you && <Strip
        title={t("fyRecoTitle")} text={t("fyRecoText")} cards={picks} loading={home.isLoading}
        onAdd={add} favorites={favorites} onSeeAll={picks.length > 4 ? () => navigate("/produtos?ordem=best") : undefined} seeAll={t("fySeeAll")}
      />}

      {/* Bolo personalizado: atalhos para os personalizados do cardápio e para o contato */}
      {show.create && <section className={cn(cardCls, "relative overflow-hidden p-5 sm:p-7")} aria-labelledby="fy-create">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(23,23,23,0.03) 0 1px, transparent 1px 7px)" }} aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={iconTile}><Sparkles className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
            <div className="min-w-0">
              <h3 id="fy-create" className={h3Cls}>{t("fyCreateTitle")}</h3>
              <p className="mt-1 max-w-xl text-[14px] text-muted-foreground">{t("fyCreateText")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/categoria/bolos-personalizados" className={cn(btnPrimary, "min-h-11 px-5 text-[14px]")}><Wand2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("fyCreateCta")}</Link>
            <Link to="/contatos" className={cn(btnSecondary, "min-h-11 px-5 text-[14px]")}><MessageCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("fyQuoteCta")}</Link>
          </div>
        </div>
      </section>}
    </div>
  );
}
