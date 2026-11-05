import { STORE_DEFAULTS } from "@/config/store";
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { MotionConfig, useReducedMotion } from 'framer-motion';
import {
  Box, Cable, Dog, Flower2, Gamepad2, Headphones, KeyRound, Lamp, SearchX, Smartphone, Sprout, type LucideIcon,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { LayerArt } from '@/components/MediaImage';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { catalogMessages } from '@/i18n/catalog';
import { layoutMessages } from '@/i18n/layout';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { mediaUrl, type MediaKey } from '@/lib/media';
import { cn } from '@/lib/utils';
import { CatalogBreadcrumb } from './CatalogBreadcrumb';
import { ActiveFilters, FilterPanel, FilterSheet } from './CatalogFilters';
import { GridSkeleton, ListingEmpty, ListingError, ListingSoon, ProductResults } from './CatalogGrid';
import { CatalogToolbar } from './CatalogToolbar';
import { breadcrumbJsonLd } from './listing';
import { btnPrimary, chip, chipIdle } from './ui';
import type { Listing, useListingText } from './useListing';
import { RESULTS_TOP_ID, revealResults } from './useListingParams';
import { useCatalogPage } from '@/hooks/useCatalogPage';

/** Moldura das listagens: cabeçalho, conteúdo e rodapé, com animações que respeitam "reduzir movimento". */
export function ListingShell({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 pb-16 md:pb-20">
          <div className="shell pt-5 md:pt-8">{children}</div>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

type LT = ReturnType<typeof useMessages<typeof layoutMessages['pt-BR']>>['t'];
const IDEAS: [Parameters<LT>[0], LucideIcon][] = [
  ['demo_dragon', Gamepad2], ['demo_vase', Flower2], ['demo_organizer', Box], ['demo_phone', Smartphone], ['demo_lamp', Lamp],
  ['demo_keychain', KeyRound], ['demo_planter', Sprout], ['demo_headphone', Headphones], ['demo_cable', Cable], ['demo_octopus', Dog],
];

/** Ideias para o catálogo vazio: as subcategorias da categoria ou exemplos gerais (sempre com o selo "Em breve"). */
function useIdeas(listing: Listing) {
  const { t } = useMessages(layoutMessages);
  const c = listing.category;
  if (!c) return IDEAS.map(([k, Icon]) => ({ name: t(k), Icon }));
  const subs = c.subs.filter((s) => s.slug).map((s) => ({ name: s.label, Icon: c.Icon }));
  return c.slug === 'personalizados' ? [...subs, { name: t('demo_keychain'), Icon: KeyRound }] : subs;
}

/**
 * Corpo partilhado de /produtos e /categoria/:slug: filtros (coluna de ~260px no desktop, drawer no celular),
 * ordenação, filtros ativos e a grade com "Carregar mais" ou o estado vazio adequado.
 */
export function ListingBody({ listing, text }: { listing: Listing; text: ReturnType<typeof useListingText> }) {
  const { t } = useMessages(catalogMessages);
  const [sheetOpen, setSheetOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const ideas = useIdeas(listing);
  const settings = useCatalogPage();
  const sidebar = settings.filters === 'sidebar';
  const p = listing.params;
  const showFilters = !listing.catalogEmpty && !listing.isError;

  const done = () => {
    setSheetOpen(false);
    revealResults((reduceMotion ? 'instant' : 'smooth') as ScrollBehavior);
  };

  // Recomeça a paginação quando a lista muda.
  const resetKey = [listing.category?.slug ?? '', p.q, p.sort, p.promo, p.cats.join(','), listing.sub?.slug ?? '', listing.price ? `${listing.price.min}-${listing.price.max}` : ''].join('|');

  let body: ReactNode;
  if (listing.isError) body = <ListingError onRetry={listing.refetch} />;
  else if (listing.isLoading) body = <GridSkeleton count={10} />;
  else if (listing.catalogEmpty) body = <ListingSoon ideas={ideas} />;
  else if (!listing.results.length) {
    const c = listing.category;
    if (listing.activeCount > 0) {
      body = (
        <ListingEmpty
          Icon={SearchX} title={t('emptyTitle')} text={p.q ? t('emptySearch', { q: p.q }) : t('emptyFilters')}
          primary={<button type="button" onClick={listing.clearFilters} className={btnPrimary}>{t('clearFilters')}</button>}
        />
      );
    } else if (c && listing.sub && listing.inCategory > 0) {
      body = (
        <ListingEmpty
          Icon={c.Icon} title={t('emptySubTitle', { name: text.subLabel })} text={t('emptySub')}
          primary={<Link to={`/categoria/${c.slug}`} className={btnPrimary}>{t('seeAllIn', { name: text.catLabel })}</Link>}
        />
      );
    } else if (c) {
      body = (
        <ListingEmpty
          Icon={c.Icon} title={t('emptyCategoryTitle', { name: text.catLabel })} text={t('emptyCategory')} showAll={false}
          primary={<Link to="/produtos" className={btnPrimary}>{t('seeAllProducts')}</Link>}
        />
      );
    } else {
      body = <ListingEmpty Icon={SearchX} title={t('emptyTitle')} text={t('emptyFilters')} showAll={false} />;
    }
  } else {
    body = (
      <>
        <ProductResults key={resetKey} items={listing.results} />
        {listing.truncated && <p className="mx-auto mt-6 max-w-md text-center text-[13px] leading-snug text-muted-foreground">{t('truncatedNote')}</p>}
      </>
    );
  }

  if (!showFilters) return <div className="mt-8">{body}</div>;

  return (
    <div className={cn('mt-5 grid gap-6 lg:mt-7', sidebar && 'lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10')}>
      {sidebar && (
        <aside aria-label={t('filters')} className="hidden lg:block">
          <div className="sticky top-[100px] max-h-[calc(100vh-116px)] overflow-y-auto overscroll-contain pr-2 pt-1 [scrollbar-width:thin]">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('filters')}</p>
            <FilterPanel listing={listing} />
          </div>
        </aside>
      )}

      <section aria-label={t('results')} className="min-w-0">
        <div id={RESULTS_TOP_ID} />
        <div className="sticky top-[65px] z-30 -mx-4 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
          <CatalogToolbar listing={listing} onOpenFilters={() => setSheetOpen(true)} filtersButton={!sidebar} />
        </div>
        <div className="mb-5 mt-1 empty:hidden"><ActiveFilters listing={listing} /></div>
        <div aria-busy={listing.isUpdating || undefined} className={cn('mt-3 transition-opacity duration-200', listing.isUpdating && 'opacity-60')}>{body}</div>
      </section>

      <FilterSheet listing={listing} open={sheetOpen} onOpenChange={setSheetOpen} onDone={done} />
    </div>
  );
}

/** SEO das listagens: título com o nome da loja, descrição, canonical do próprio domínio e trilho em JSON-LD. */
export function ListingSeo({ text, image, imageUrl }: { text: ReturnType<typeof useListingText>; image?: MediaKey | null; imageUrl?: string | null }) {
  const { data: info } = useStoreInfo();
  const name = info?.name || STORE_DEFAULTS.name;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}${text.canonicalPath}`;
  const title = `${text.seoTitle} | ${name}`;
  const img = imageUrl || (image ? mediaUrl(image) : null);
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={text.seoDescription} />
      <link rel="canonical" href={url} />
      {text.noindex && <meta name="robots" content="noindex,follow" />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={name} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={text.seoDescription} />
      <meta property="og:url" content={url} />
      {img && <meta property="og:image" content={/^https?:/.test(img) ? img : `${origin}${img}`} />}
      <script type="application/ld+json">{breadcrumbJsonLd(text.crumbs, origin)}</script>
    </Helmet>
  );
}

/** Enquanto uma categoria que não está no catálogo PRINT3D é procurada na BD. */
export function CategorySkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton h-4 w-48 rounded" />
      <div className="mt-4 grid overflow-hidden rounded-[24px] border border-brand-card-border bg-white md:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4 p-6 sm:p-8 lg:p-12"><div className="skeleton h-3 w-24 rounded" /><div className="skeleton h-12 w-3/4 rounded-lg" /><div className="skeleton h-4 w-full rounded" /><div className="skeleton h-4 w-2/3 rounded" /></div>
        <div className="skeleton aspect-[16/7] md:aspect-auto md:min-h-[260px]" />
      </div>
      <div className="mt-8"><GridSkeleton count={10} /></div>
    </div>
  );
}

/** Categoria inexistente: explica e mostra as categorias da loja. */
export function CategoryNotFound() {
  const { t } = useMessages(catalogMessages);
  const menu = useCatalogMenu();
  const { data: info } = useStoreInfo();
  return (
    <>
      <Helmet>
        <title>{`${t('notFoundTitle')} | ${info?.name || STORE_DEFAULTS.name}`}</title>
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <CatalogBreadcrumb items={[{ label: t('home'), href: '/' }, { label: t('products'), href: '/produtos' }, { label: t('notFoundTitle') }]} />
      <section className="mt-4 rounded-[24px] border border-brand-card-border bg-white px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-[20px] sm:h-36 sm:w-36"><LayerArt Icon={SearchX} /></div>
        <h1 className="mx-auto mt-6 max-w-xl text-[28px] font-[780] leading-tight tracking-[-0.02em] sm:text-[34px]">{t('notFoundTitle')}</h1>
        <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-muted-foreground">{t('notFoundText')}</p>
        <ul className="mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-2">
          {menu.map((c) => (
            <li key={c.slug}>
              <Link to={`/categoria/${c.slug}`} className={cn(chip, chipIdle, 'pl-2.5')}>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-orange-soft text-primary"><c.Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/produtos" className={cn(btnPrimary, 'mt-8')}>{t('seeAllProducts')}</Link>
      </section>
    </>
  );
}
