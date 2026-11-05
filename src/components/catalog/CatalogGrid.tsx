import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CartStockError } from "@/hooks/useCart";
import FeatureLink from "@/components/FeatureLink";
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, ChevronDown, RefreshCw, Upload, Wand2, WifiOff, type LucideIcon } from 'lucide-react';
import { LayerArt } from '@/components/MediaImage';
import { ProductCard3D, ProductCardSkeleton, ProductCardSoon, type CardProduct } from '@/components/product/ProductCard3D';
import { useAuth } from '@/hooks/useAuth';
import { useQuickAdd } from '@/hooks/useQuickAdd';
import { useWishlist } from '@/hooks/useWishlist';
import type { CatalogItem } from '@/hooks/useCatalogProducts';
import { useMessages } from '@/i18n';
import { catalogMessages } from '@/i18n/catalog';
import { layoutMessages } from '@/i18n/layout';
import { ProductCardClean, ProductCardCleanSkeleton } from '@/components/product/ProductCardClean';
import { useCatalogPage } from '@/hooks/useCatalogPage';
import { catalogGrid } from '@/lib/catalogPage';
import { cn } from '@/lib/utils';
import { btnPrimary, btnSecondary, productGridWide } from './ui';

/* Colunas reais da grade (as mesmas larguras das classes de catalogGrid), para carregar sempre linhas completas. */
function useGridCols(cols: [string, number][]) {
  const read = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return 4;
    for (const [q, n] of cols) if (window.matchMedia(q).matches) return n;
    return 2;
  };
  const subscribe = useMemo(() => (cb: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const list = cols.map(([q]) => window.matchMedia(q));
    list.forEach((m) => m.addEventListener?.('change', cb));
    return () => list.forEach((m) => m.removeEventListener?.('change', cb));
  }, [cols]);
  return useSyncExternalStore(subscribe, read, () => 4);
}
const ROWS = 6;

export function GridSkeleton({ count = 8 }: { count?: number }) {
  const s = useCatalogPage();
  const grid = catalogGrid(s);
  return (
    <div className={grid.className} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (s.card === 'clean' ? <ProductCardCleanSkeleton key={i} /> : <ProductCardSkeleton key={i} />))}
    </div>
  );
}

/** Ações do cartão como na página inicial: favorito (pede login) e carrinho com aviso. */
function useCardActions() {
  const { t } = useMessages(layoutMessages);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const quickAdd = useQuickAdd();
  const { isInWishlist, toggleWishlist } = useWishlist(user?.id);
  return {
    isFav: (id: string) => isInWishlist(id),
    fav: (id: string) => (user ? toggleWishlist(id) : navigate(`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`)),
    add: async (p: CardProduct) => {
      try {
        await quickAdd(p.id);
      } catch (e) {
        if (!(e instanceof CartStockError)) toast.error(t('addError'));
        throw e;
      }
      toast.success(t('added'), { description: p.name });
    },
  };
}

/** Grade de produtos com "Carregar mais" (linhas completas) e foco no primeiro produto novo. */
export function ProductResults({ items }: { items: CatalogItem[] }) {
  const { t } = useMessages(catalogMessages);
  const actions = useCardActions();
  const s = useCatalogPage();
  const grid = useMemo(() => catalogGrid({ columns: s.columns, filters: s.filters }), [s.columns, s.filters]);
  const cols = useGridCols(grid.cols);
  const perPage = cols * ROWS;
  const [pages, setPages] = useState(1);
  const [anchor, setAnchor] = useState<number | null>(null);
  const focusNext = useRef(false);
  const anchorRef = useRef<HTMLLIElement>(null);
  const total = items.length;
  const visible = Math.min(total, pages * perPage);

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    anchorRef.current?.focus({ preventScroll: true });
  }, [anchor]);

  const more = () => {
    focusNext.current = true;
    setAnchor(visible);
    setPages((n) => n + 1);
  };

  return (
    <>
      <ul role="list" aria-label={t('results')} className={grid.className}>
        {items.slice(0, visible).map((it, i) => (
          <li key={it.id} ref={i === anchor ? anchorRef : undefined} tabIndex={i === anchor ? -1 : undefined} className="rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {s.card === 'clean'
              ? <ProductCardClean p={it.card} featuredBadge={s.featured_badge} favorite={actions.isFav(it.id)} onFavorite={actions.fav} onAdd={actions.add} />
              : <ProductCard3D p={s.featured_badge ? it.card : { ...it.card, featured: false }} favorite={actions.isFav(it.id)} onFavorite={actions.fav} onAdd={actions.add} />}
          </li>
        ))}
      </ul>
      {total > perPage && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{t('showing', { shown: visible, total })}</p>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${(visible / total) * 100}%` }} />
          </div>
          {visible < total ? (
            <button type="button" onClick={more} className={cn(btnSecondary, 'mt-2 min-w-[200px]')}>
              {t('loadMore')}<ChevronDown className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('allShown')}</p>
          )}
        </div>
      )}
    </>
  );
}

/** Botões de sugestão comuns aos estados vazios: personalizar e enviar modelo 3D. */
function CreateLinks() {
  const { t } = useMessages(catalogMessages);
  return (
    <>
      <FeatureLink to="/personalizar" className={btnSecondary}><Wand2 className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('customize')}</FeatureLink>
      <FeatureLink to="/orcamento-3d" className={btnSecondary}><Upload className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('upload3d')}</FeatureLink>
    </>
  );
}

/** Nada encontrado: ilustração em camadas, explicação e caminhos para continuar. */
export function ListingEmpty({ Icon, title, text, primary, showAll = true }: { Icon: LucideIcon; title: string; text: string; primary?: ReactNode; showAll?: boolean }) {
  const { t } = useMessages(catalogMessages);
  return (
    <div className="rounded-[20px] border border-brand-card-border bg-white px-5 py-10 text-center sm:px-10 sm:py-12">
      <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-[18px] sm:h-28 sm:w-28"><LayerArt Icon={Icon} /></div>
      <h2 className="mx-auto mt-5 max-w-lg text-[22px] font-bold leading-tight tracking-[-0.02em] [text-wrap:balance] sm:text-[26px]">{title}</h2>
      <p className="mx-auto mt-2.5 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base">{text}</p>
      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {primary}
        {showAll && <Link to="/produtos" className={btnSecondary}>{t('seeAllProducts')}<ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" /></Link>}
        <CreateLinks />
      </div>
    </div>
  );
}

/** Catálogo ainda sem produtos: ideias do que vem aí (sem preço nem avaliação inventados) e caminhos de criação. */
export function ListingSoon({ ideas }: { ideas: { name: string; Icon: LucideIcon }[] }) {
  const { t } = useMessages(catalogMessages);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 rounded-[24px] bg-brand-alt p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t('soonEyebrow')}</p>
          <h2 className="mt-2 text-[24px] font-bold leading-tight tracking-[-0.02em] sm:text-[28px]">{t('soonTitle')}</h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-brand-ink-soft sm:text-base">{t('soonText')}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <FeatureLink to="/personalizar" className={btnPrimary}><Wand2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t('customCreateTitle')}</FeatureLink>
          <FeatureLink to="/orcamento-3d" className={btnSecondary}><Upload className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('upload3d')}</FeatureLink>
        </div>
      </div>
      {ideas.length > 0 && (
        <ul role="list" className={productGridWide}>
          {ideas.map((d, i) => <li key={`${d.name}-${i}`}><ProductCardSoon name={d.name} Icon={d.Icon} /></li>)}
        </ul>
      )}
    </div>
  );
}

/** Erro ao carregar: mensagem curta e botão para tentar de novo. */
export function ListingError({ onRetry }: { onRetry: () => void }) {
  const { t } = useMessages(catalogMessages);
  return (
    <div role="alert" className="rounded-[24px] border border-brand-card-border bg-white px-5 py-12 text-center sm:py-16">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] bg-brand-orange-soft text-primary"><WifiOff className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
      <h2 className="mt-5 text-[22px] font-bold tracking-[-0.02em] sm:text-[26px]">{t('errorTitle')}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-muted-foreground">{t('errorText')}</p>
      <button type="button" onClick={onRetry} className={cn(btnPrimary, 'mt-7')}><RefreshCw className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />{t('retry')}</button>
    </div>
  );
}
