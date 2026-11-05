import { Link, useLocation } from 'react-router-dom';
import { useHrefOn } from "@/hooks/useFeatures";
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Upload, Wand2 } from 'lucide-react';
import { LayerArt, MediaImage } from '@/components/MediaImage';
import { useMessages } from '@/i18n';
import { catalogMessages, countKey } from '@/i18n/catalog';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { cn } from '@/lib/utils';
import { useCatalogPage } from '@/hooks/useCatalogPage';
import { CatalogBreadcrumb } from './CatalogBreadcrumb';
import { chip, chipActive, chipIdle } from './ui';
import type { Listing, useListingText } from './useListing';

type Text = ReturnType<typeof useListingText>;

const h1 = 'text-[32px] leading-[1.04] [overflow-wrap:anywhere] [text-wrap:balance] sm:text-[40px] lg:text-[46px]';
/** Título do cabeçalho compacto (Admin > Página de catálogo): serifa em tamanho moderado. */
const h1Compact = 'text-[28px] leading-[1.06] [overflow-wrap:anywhere] [text-wrap:balance] sm:text-[34px] lg:text-[38px]';

/** "24 produtos" (anunciado aos leitores de ecrã quando muda). */
function ResultCount({ listing, className, light = false }: { listing: Listing; className?: string; light?: boolean }) {
  const { t } = useMessages(catalogMessages);
  const n = listing.results.length;
  if (listing.catalogEmpty) return null;
  if (listing.isLoading) return <span className={cn('skeleton inline-block h-7 w-28 rounded-lg', className)} aria-hidden="true" />;
  return (
    <p role="status" className={cn('inline-flex w-fit items-center gap-2 text-[13.5px] font-medium tabular-nums', light ? 'text-white/85' : 'text-muted-foreground', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', light ? 'bg-white/70' : 'bg-primary')} aria-hidden="true" />
      {t(countKey(n), { count: n })}
    </p>
  );
}

/** Atalhos para as categorias do menu (na entrada de /produtos, para quem está no celular sem abrir os filtros). */
function CategoryLinks() {
  const { t } = useMessages(catalogMessages);
  const menu = useCatalogMenu();
  return (
    <nav aria-label={t('exploreCategories')} className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-2 md:flex-wrap">
        {menu.map((c) => (
          <li key={c.slug}>
            <Link to={`/categoria/${c.slug}`} className={cn(chip, chipIdle, 'md:min-h-[40px]')}>
              <c.Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Cabeçalho de /produtos: trilho, H1 (todos, busca, mais vendidos, novidades, ofertas), contagem e texto de apoio. */
export function ListingHero({ listing, text }: { listing: Listing; text: Text }) {
  const p = listing.params;
  const landing = !p.q && !p.cats.length && !p.promo && p.sort === 'relevancia' && !listing.price && !p.brands.length;
  const brand = listing.brandPage;
  const { t } = useMessages(catalogMessages);
  const settings = useCatalogPage();
  const compact = settings.header === 'compact';
  return (
    <header>
      <CatalogBreadcrumb items={text.crumbs} />
      <div className={cn('flex flex-col md:flex-row md:items-end md:justify-between md:gap-8', compact ? 'mt-3 gap-2' : 'mt-4 gap-4')}>
        <div className="min-w-0 max-w-3xl">
          {brand?.logo_url && (
            <img src={brand.logo_url} alt="" className="mb-4 h-20 w-auto max-w-[240px] rounded-[16px] border border-brand-card-border bg-white object-contain p-2" />
          )}
          <motion.h1 id="listing-title" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className={compact ? h1Compact : h1}>{text.title}</motion.h1>
          <p className={cn('mt-2.5 max-w-2xl leading-relaxed text-brand-ink-soft', compact ? 'text-[15.5px]' : 'text-[17px]', compact && !settings.lead_mobile && 'hidden sm:block')}>{text.lead}</p>
          {brand?.website && (
            <a href={brand.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[15px] font-semibold text-brand-orange-text underline-offset-4 hover:underline">
              {t('brand_site')}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {compact && <ResultCount listing={listing} className="mt-2" />}
        </div>
        {!compact && <ResultCount listing={listing} className="shrink-0" />}
      </div>
      {landing && settings.shortcuts && <CategoryLinks />}
    </header>
  );
}

/**
 * Banner da categoria (editorial): com foto (da categoria ou de produtos dela), a foto ocupa o banner e o texto fica
 * por cima, em branco; sem nenhuma foto, texto à esquerda e a reserva em camadas à direita.
 */
export function CategoryHero({ listing, text }: { listing: Listing; text: Text }) {
  const { t } = useMessages(catalogMessages);
  const c = listing.category!;
  const shots = listing.results.map((i) => i.card.image).filter((x): x is string => !!x).slice(0, 3);
  const own = !!(c.image || c.imageUrl);
  const eyebrow = listing.sub ? text.catLabel : t('categoryEyebrow');
  const settings = useCatalogPage();
  if (settings.header === 'compact') {
    const thumb = shots[0] ? <img src={shots[0]} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" /> : <LayerArt Icon={c.Icon} size="sm" />;
    return (
      <header>
        <CatalogBreadcrumb items={text.crumbs} />
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mt-3 flex items-center gap-4 sm:gap-5">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[14px] bg-white shadow-[0_1px_2px_rgba(23,23,21,0.08)] sm:h-[88px] sm:w-[88px] sm:rounded-[16px]">
            {own ? <MediaImage k={c.image} src={c.imageUrl} alt="" eager className="absolute inset-0 h-full w-full" fallback={thumb} /> : thumb}
          </div>
          <div className="min-w-0 flex-1">
            {listing.sub && <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>}
            <h1 id="listing-title" className={cn(h1Compact, listing.sub && 'mt-1')}>{text.title}</h1>
            <ResultCount listing={listing} className="mt-1.5" />
          </div>
        </motion.div>
        <p className={cn('mt-3 max-w-2xl text-[15.5px] leading-relaxed text-brand-ink-soft', !settings.lead_mobile && 'hidden sm:block')}>{text.lead}</p>
        <SubNav listing={listing} />
        {c.slug === 'personalizados' && <CustomCtas />}
      </header>
    );
  }
  if (!own && !shots.length) {
    return (
      <header>
        <CatalogBreadcrumb items={text.crumbs} />
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="mt-4 grid overflow-hidden rounded-[18px] bg-white md:grid-cols-[1.3fr_1fr]">
          <div className="order-2 flex flex-col justify-center p-6 sm:p-8 md:order-1 lg:px-12 lg:py-10">
            <p className="text-[11.5px] font-medium uppercase tracking-[0.3em] text-muted-foreground">{eyebrow}</p>
            <h1 id="listing-title" className={cn(h1, 'mt-3')}>{text.title}</h1>
            <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-brand-ink-soft">{text.lead}</p>
            <ResultCount listing={listing} className="mt-5" />
          </div>
          <div className="relative order-1 aspect-[16/7] md:order-2 md:aspect-auto md:min-h-[260px]"><LayerArt Icon={c.Icon} size="lg" /></div>
        </motion.section>
        <SubNav listing={listing} />
        {c.slug === 'personalizados' && <CustomCtas />}
      </header>
    );
  }
  const art = (
    <div className="absolute inset-0 grid auto-cols-fr grid-flow-col gap-px" aria-hidden="true">
      {shots.map((src) => <img key={src} src={src} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" />)}
    </div>
  );
  return (
    <header>
      <CatalogBreadcrumb items={text.crumbs} />
      {/* Banner em duas partes: texto sobre grafite à esquerda e a foto à direita, sem esticar a foto à largura toda. */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
        className="relative mt-4 grid overflow-hidden rounded-[6px] bg-brand-ink md:min-h-[300px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:min-h-[340px]"
      >
        <div className="relative order-1 aspect-[16/9] md:order-2 md:aspect-auto">
          {own
            ? <MediaImage k={c.image} src={c.imageUrl} alt="" eager className="absolute inset-0 h-full w-full" fallback={art} />
            : art}
          <span className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-brand-ink via-brand-ink/25 to-transparent md:block" aria-hidden="true" />
        </div>
        <div className="relative order-2 flex flex-col justify-center p-6 text-white sm:p-8 md:order-1 lg:px-12 lg:py-10">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.3em] text-white/70">{eyebrow}</p>
          <h1 id="listing-title" className={cn(h1, 'mt-3 text-white')}>{text.title}<span className="text-primary">.</span></h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-white/85 md:text-[17px]">{text.lead}</p>
          <ResultCount listing={listing} className="mt-5" light />
        </div>
      </motion.section>
      <SubNav listing={listing} />
      {c.slug === 'personalizados' && <CustomCtas />}
    </header>
  );
}

/** Chips das subcategorias (do menu, src/lib/catalogMenu.ts), com a atual em laranja. As que levam a outras páginas têm seta. */
function SubNav({ listing }: { listing: Listing }) {
  const { t } = useMessages(catalogMessages);
  const { pathname } = useLocation();
  const c = listing.category!;
  if (!c.subs.length) return null;
  const current = listing.sub?.slug ?? null;
  return (
    <nav aria-label={t('subNav')} className="-mx-4 mt-4 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex gap-2 md:flex-wrap">
        <li>
          <Link to={`${pathname}${listing.hrefWith({ sub: null })}`} onClick={listing.keepScroll} aria-current={!current ? 'page' : undefined} className={cn(chip, !current ? chipActive : chipIdle, 'md:min-h-[40px]')}>
            {t('subAll')}
          </Link>
        </li>
        {c.subs.map((s) => {
          if (!s.slug) {
            return (
              <li key={s.id}>
                <Link to={s.href} className={cn(chip, chipIdle, 'md:min-h-[40px]')}>
                  {s.label}<ArrowUpRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
                </Link>
              </li>
            );
          }
          const active = current === s.slug;
          return (
            <li key={s.id}>
              <Link to={`${pathname}${listing.hrefWith({ sub: s.slug })}`} onClick={listing.keepScroll} aria-current={active ? 'page' : undefined} className={cn(chip, active ? chipActive : chipIdle, 'md:min-h-[40px]')}>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Em Personalizados: atalhos para criar uma peça e enviar um modelo 3D. */
function CustomCtas() {
  const { t } = useMessages(catalogMessages);
  const hrefOn = useHrefOn();
  const items = [
    { to: '/personalizar', Icon: Wand2, title: t('customCreateTitle'), text: t('customCreateText') },
    { to: '/orcamento-3d', Icon: Upload, title: t('customUploadTitle'), text: t('customUploadText') },
  ].filter((i) => hrefOn(i.to));
  if (!items.length) return null;
  return (
    <ul className="mt-5 grid gap-3 sm:grid-cols-2 md:gap-4">
      {items.map(({ to, Icon, title, text }) => (
        <li key={to}>
          <Link to={to} className="group flex h-full items-center gap-4 rounded-[18px] border border-brand-card-border bg-white p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] sm:p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-orange-soft text-primary"><Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-bold tracking-[-0.01em]">{title}</span>
              <span className="mt-0.5 block text-[14px] leading-snug text-muted-foreground">{text}</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
