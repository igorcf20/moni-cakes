// Kits (/kits): conjuntos de peças com desconto por unidade quando o kit completo está no carrinho
// (regra em src/lib/kitPricing.ts, conferida no servidor). Preços mostrados com o imposto do país (withVat).
import { STORE_DEFAULTS } from "@/config/store";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { AlertCircle, Box, Gift, Info, Loader2, ShoppingBag } from 'lucide-react';
import { LayerArt } from '@/components/MediaImage';
import { KitCover } from '@/components/kits/KitCover';
import { PageShell, PageIntro } from '@/components/institutional/ui';
import { btnPrimary, btnSecondary, card, h3, reveal } from '@/components/institutional/styles';
import { useKitPieceOptions, useKits } from '@/hooks/useKits';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/use-currency';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { kitsMessages } from '@/i18n/pages';
import { useCountry } from '@/lib/countries';
import { kitCartItems } from '@/lib/kitPricing';
import { kitHref, kitText } from '@/lib/kits';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/utils/currency';
import { showsTaxSeparately, withVat } from '@/utils/pricing';

/** Foto (do kit ou do produto) com a reserva de camadas se faltar ou falhar. */
function Photo({ src, alt, className, iconSize = 'md' }: { src?: string | null; alt: string; className?: string; iconSize?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-brand-alt', className)}>
      {src && !failed
        ? <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        : <LayerArt Icon={iconSize === 'sm' ? Box : Gift} size={iconSize} />}
    </div>
  );
}

function KitSkeleton() {
  return (
    <div className={cn(card, 'overflow-hidden')} aria-hidden="true">
      <div className="skeleton aspect-[16/9]" />
      <div className="space-y-3 p-6">
        <div className="skeleton h-6 w-2/3 rounded-lg" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-16 w-full rounded-[14px]" />
        <div className="skeleton h-16 w-full rounded-[14px]" />
        <div className="skeleton h-12 w-full rounded-[14px]" />
      </div>
    </div>
  );
}

const Kits = () => {
  const { t, locale } = useMessages(kitsMessages);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addItems } = useCart(user?.id);
  const { currentCurrency, convert } = useCurrency();
  const { data: info } = useStoreInfo();
  const country = useCountry();
  const [busyKit, setBusyKit] = useState<string | null>(null);

  // Kits do site (política kit_is_live: ativos, no período e com o recurso ligado) com as peças e os produtos.
  const { data: kits = [], isLoading, isError, refetch } = useKits();
  const itemsLoading = false;
  const kitItemsMap: Record<string, any[]> = Object.fromEntries(kits.map((k) => [k.id, k.pieces.map((p) => ({ ...p, products: p.product }))]));
  // Peças com cor ou tamanho: o cliente escolhe na página do kit (o botão leva até lá).
  const { data: optionsMap = {} } = useKitPieceOptions(kits.flatMap((k) => k.pieces.map((p) => p.product_id)));
  const needsChoice = (items: any[]) => items.some((x: any) => {
    const o = optionsMap[x.product_id];
    return !!o && (o.variations.length > 0 || o.sizes.length > 0);
  });

  void country; // withVat e showsTaxSeparately seguem o país atual: recalcula quando o cliente troca de país
  const taxed = showsTaxSeparately();
  const money = (net: number) => formatPrice(convert(withVat(net)), currentCurrency);

  const kitPrices = (kit: any, items: any[]) => {
    const original = items.reduce((sum: number, item: any) => sum + (Number(item.products?.price) || 0) * item.quantity, 0);
    const discount = kit.discount_type === 'percentage' ? original * (Number(kit.discount_value) / 100) : Number(kit.discount_value) || 0;
    return { original, discount: Math.min(discount, original), final: Math.max(0, original - discount) };
  };

  // Peça fora de venda ou sem estoque: o kit não fecha no checkout, por isso o botão fica bloqueado aqui.
  const soldOut = (p: any) => !p || p.is_active === false || (p.stock_quantity != null && Number(p.stock_quantity) <= 0);

  const buy = (kit: any, items: any[]) => {
    if (needsChoice(items)) { navigate(kitHref(kit)); return; }
    const lines = kitCartItems({ ...kit, name: kitText(kit, 'name', locale) }, items);
    if (!lines.length) return;
    setBusyKit(kit.id);
    addItems(lines, { onSettled: () => setBusyKit(null) });
  };

  const name = info?.name || STORE_DEFAULTS.name;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const title = `${t('seoTitle')} | ${name}`;
  const description = t('seoDescription', { name });

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div role="status" aria-label={t('loading')} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <KitSkeleton key={i} />)}
      </div>
    );
  } else if (isError) {
    body = (
      <div className={cn(card, 'mx-auto max-w-xl px-6 py-12 text-center')} role="alert">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] bg-destructive/10 text-destructive"><AlertCircle className="h-8 w-8" strokeWidth={1.8} aria-hidden="true" /></span>
        <h2 className="mt-6 text-[24px] font-bold tracking-[-0.03em]">{t('errorTitle')}</h2>
        <p className="mt-2 text-[16px] text-muted-foreground">{t('errorText')}</p>
        <button type="button" onClick={() => refetch()} className={cn(btnPrimary, 'mt-7')}>{t('retry')}</button>
      </div>
    );
  } else if (!kits.length) {
    body = (
      <div className={cn(card, 'mx-auto max-w-2xl px-6 py-12 text-center sm:px-10')}>
        <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-[20px]"><LayerArt Icon={Gift} /></div>
        <h2 className="mt-6 text-[26px] font-bold tracking-[-0.03em]">{t('emptyTitle')}</h2>
        <p className="mx-auto mt-2 max-w-md text-[16px] leading-relaxed text-muted-foreground">{t('emptyText')}</p>
        <Link to="/produtos" className={cn(btnPrimary, 'mt-7')}>{t('emptyCta')}</Link>
      </div>
    );
  } else {
    body = (
      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {kits.map((kit: any, i: number) => {
          const items = kitItemsMap[kit.id] || [];
          const { original, discount, final } = kitPrices(kit, items);
          const badge = kit.discount_type === 'percentage'
            ? t('badgePct', { value: Number(kit.discount_value) })
            : t('badgeFixed', { value: money(Number(kit.discount_value) || 0) });
          const busy = busyKit === kit.id;
          const unavailable = !itemsLoading && items.length > 0 && items.some((x: any) => soldOut(x.products));
          return (
            <motion.li key={kit.id} {...reveal(i)} className={cn(card, 'flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-[var(--shadow-hover)]')}>
              <div className="relative">
                <Link to={kitHref(kit)} className="group block" aria-label={t('seeKit', { name: kitText(kit, 'name', locale) })}><KitCover kit={kit} pieces={kit.pieces} className="aspect-[16/9]" /></Link>
                <span className="absolute left-4 top-4 rounded-[10px] bg-primary px-3 py-1.5 text-[13px] font-bold text-primary-foreground shadow-[var(--shadow-glow-orange)]">{badge}</span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h2 className={h3}><Link to={kitHref(kit)} className="transition-colors duration-150 hover:text-brand-orange-text">{kitText(kit, 'name', locale)}</Link></h2>
                {kitText(kit, 'description', locale) && <p className="mt-1.5 line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">{kitText(kit, 'description', locale)}</p>}

                <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {items.length === 1 ? t('includes_one') : t('includes_other', { count: items.length })}
                </p>
                {itemsLoading ? (
                  <div className="mt-3 space-y-2" aria-hidden="true"><div className="skeleton h-16 rounded-[14px]" /><div className="skeleton h-16 rounded-[14px]" /></div>
                ) : items.length === 0 ? (
                  <p className="mt-3 rounded-[14px] bg-brand-alt px-4 py-4 text-center text-[14px] text-muted-foreground">{t('noItems')}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {items.map((item: any, idx: number) => {
                      const p = item.products;
                      const pName = p?.name || t('productFallback');
                      const out = soldOut(p);
                      return (
                        <li key={`${item.product_id}-${idx}`} className="flex items-center gap-3 rounded-[14px] border border-brand-card-border bg-background p-2.5">
                          <Photo src={p?.image} alt={pName} className="h-14 w-14 shrink-0 rounded-[10px]" iconSize="sm" />
                          <div className="min-w-0 flex-1">
                            {p?.id ? (
                              <Link to={`/produto/${p.slug || p.id}`} className="block truncate text-[15px] font-semibold transition-colors duration-150 hover:text-brand-orange-text" aria-label={t('seeProduct', { name: pName })}>{pName}</Link>
                            ) : (
                              <p className="truncate text-[15px] font-semibold">{pName}</p>
                            )}
                            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                              {t('qty', { count: item.quantity })}
                              {out && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[12px] font-semibold text-destructive">{t('outOfStock')}</span>}
                            </p>
                          </div>
                          <p className="whitespace-nowrap text-[15px] font-semibold tabular-nums">{money((Number(p?.price) || 0) * item.quantity)}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <dl className="mt-5 space-y-2 border-t border-border pt-4 text-[15px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('separate')}</dt>
                    <dd className="tabular-nums text-muted-foreground line-through decoration-muted-foreground/60">{money(original)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-medium text-brand-orange-text">{t('kitDiscount')}</dt>
                    <dd className="font-medium tabular-nums text-brand-orange-text">- {money(discount)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 pt-1">
                    <dt className="font-semibold">{t('total')}</dt>
                    <dd className="text-[26px] font-extrabold tabular-nums tracking-[-0.03em]">{money(final)}</dd>
                  </div>
                </dl>
                <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-[13px]">
                  <span className="text-muted-foreground">{taxed ? t('taxIncluded') : ''}</span>
                  {discount > 0 && <span className="font-semibold text-brand-orange-text">{t('save', { value: money(discount) })}</span>}
                </p>

                <div className="mt-auto pt-6">
                  {unavailable && (
                    <p role="note" className="mb-3 flex items-start gap-2 rounded-[14px] bg-brand-alt px-3 py-2.5 text-[13px] leading-relaxed text-brand-ink-soft">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />{t('unavailableHint')}
                    </p>
                  )}
                  <button
                    type="button" onClick={() => buy(kit, items)} disabled={busy || itemsLoading || unavailable || !items.some((x: any) => x.products?.id)}
                    className={cn(btnPrimary, 'w-full disabled:pointer-events-none disabled:opacity-60')}
                  >
                    {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />}
                    {busy ? t('adding') : unavailable ? t('unavailable') : needsChoice(items) ? t('chooseOptions') : t('buy')}
                  </button>
                  <Link to={kitHref(kit)} className={cn(btnSecondary, 'mt-2 w-full')}>{t('seeKitShort')}</Link>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    );
  }

  return (
    <PageShell>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${origin}/kits`} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${origin}/kits`} />
      </Helmet>

      <div className="shell">
        <PageIntro crumbs={[{ label: t('home'), href: '/' }, { label: t('breadcrumb') }]} kicker={t('eyebrow')} title={t('title')} lead={t('lead')}>
          <p className="mt-5 flex max-w-2xl items-start gap-2.5 rounded-[14px] bg-accent px-4 py-3 text-[14px] leading-relaxed text-brand-ink-soft">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.9} aria-hidden="true" />{t('note')}
          </p>
        </PageIntro>
        <div className="mt-8 md:mt-10">{body}</div>
        {!isLoading && !isError && kits.length > 0 && (
          <div className="mt-10 text-center">
            <Link to="/produtos" className={btnSecondary}>{t('emptyCta')}</Link>
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default Kits;
