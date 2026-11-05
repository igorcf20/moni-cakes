// =====================================================================================
// /kit/<slug> (recurso kits): página própria do kit. Galeria, nome, resumo e destaques; lista das peças com foto,
// quantidade, nota da loja e escolha de cor e tamanho de cada peça (as mesmas regras da página do produto);
// preços (separado, desconto, total) e o botão que põe o kit inteiro no carrinho; descrição longa (HTML do Admin
// limpo com DOMPurify) e outros kits. O desconto só vale com todas as peças no carrinho (kitPricing + servidor).
// =====================================================================================
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Box, Check, ChevronLeft, ChevronRight, Gift, Info, Loader2, PackageCheck, ShoppingBag, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/institutional/ui';
import { CatalogBreadcrumb } from '@/components/catalog/CatalogBreadcrumb';
import { btnPrimary, btnSecondary, card, h3, reveal } from '@/components/institutional/styles';
import { LayerArt } from '@/components/MediaImage';
import SiteHtml, { siteProse } from '@/components/SiteHtml';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useCurrency } from '@/hooks/use-currency';
import { useStoreName } from '@/hooks/useBrand';
import { useFeature } from '@/hooks/useFeatures';
import { useKit, useKitPieceOptions, useKits, type KitPiece } from '@/hooks/useKits';
import {
  colorOptionsFor, priceFor, sizeOptionsFor, sizeOptionsAcross, type ColorOption, type PdpOptions, type PdpProduct, type SizeOption,
} from '@/hooks/useProductPage';
import { useMessages } from '@/i18n';
import { kitPageMessages } from '@/i18n/kits';
import { useCountry } from '@/lib/countries';
import { kitCartLines, type KitPieceChoice } from '@/lib/kitPricing';
import { kitHighlights, kitHref, kitPhotos, kitPrices, kitText, pieceSoldOut, type KitRow } from '@/lib/kits';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/utils/currency';
import { showsTaxSeparately, withVat } from '@/utils/pricing';

type Choice = { colorKey: string | null; sizeId: string | null };
const EMPTY_OPTS: PdpOptions = { variations: [], sizes: [], matrix: [], tiers: [], images: [], faqs: [] };

/** Estado de uma peça: opções disponíveis, escolha atual, se falta escolher e o preço unitário líquido. */
function pieceState(piece: KitPiece, opts: PdpOptions, choice: Choice, variantsOn: boolean) {
  const product = piece.product as unknown as PdpProduct | null;
  if (!product) return null;
  const stockControlled = !product.customizable;
  const colors: ColorOption[] = colorOptionsFor(opts, stockControlled, variantsOn, product.stock_quantity ?? null);
  const color = colors.find((c) => c.key === choice.colorKey) ?? (colors.length === 1 && !colors[0].soldOut ? colors[0] : null);
  const sizes: SizeOption[] = opts.sizes.length
    ? (color ? sizeOptionsFor(opts.sizes, opts.matrix, color.variationId, stockControlled) : sizeOptionsAcross(opts.sizes, opts.matrix, colors.map((c) => c.variationId), stockControlled))
    : [];
  const buyableSizes = sizes.filter((s) => s.purchasable);
  const size = sizes.find((s) => s.id === choice.sizeId && s.purchasable) ?? (buyableSizes.length === 1 && sizes.length === 1 ? buyableSizes[0] : null);
  const needsColor = colors.length > 0 && !color;
  const needsSize = sizes.length > 0 && !size;
  const modifier = (color?.modifier ?? 0) + (size?.modifier ?? 0);
  const price = priceFor(product, [], piece.quantity, modifier);
  const soldOut = pieceSoldOut(piece.product) || (colors.length > 0 && colors.every((c) => c.soldOut)) || (sizes.length > 0 && !buyableSizes.length);
  return { product, colors, color, sizes, size, needsColor, needsSize, modifier, price, soldOut };
}

export default function KitDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useMessages(kitPageMessages);
  const storeName = useStoreName();
  const variantsOn = useFeature('variants');
  const { user } = useAuth();
  const { addItems } = useCart(user?.id);
  const { currentCurrency, convert } = useCurrency();
  useCountry(); // withVat segue o país atual: redesenha quando o cliente troca de país
  const { data: kit, isLoading, isError, refetch } = useKit(slug);
  const { data: allKits = [] } = useKits();
  const pieces = useMemo(() => kit?.pieces ?? [], [kit]);
  const { data: optionsMap = {}, isLoading: optsLoading } = useKitPieceOptions(pieces.map((p) => p.product_id));
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [photo, setPhoto] = useState(0);
  const [state, setState] = useState<'idle' | 'adding' | 'done'>('idle');

  useEffect(() => { setChoices({}); setPhoto(0); setState('idle'); }, [kit?.id]);

  const money = (net: number) => formatPrice(convert(withVat(net)), currentCurrency);
  const taxed = showsTaxSeparately();

  const states = pieces.map((p, i) => pieceState(p, optionsMap[p.product_id] ?? EMPTY_OPTS, choices[i] ?? { colorKey: null, sizeId: null }, variantsOn));
  const unavailable = !optsLoading && (pieces.length === 0 || states.some((s) => !s || s.soldOut));
  const missing = states.some((s) => s && (s.needsColor || s.needsSize));
  const prices = kit
    ? kitPrices(kit, pieces.map((p, i) => ({ list: Number(p.product?.price) || 0, unit: states[i]?.price.unit ?? 0, quantity: p.quantity })))
    : { pct: 0, original: 0, discount: 0, final: 0 };

  const setChoice = (i: number, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [i]: { ...(c[i] ?? { colorKey: null, sizeId: null }), ...patch } }));

  const buy = () => {
    if (!kit || unavailable || missing || state === 'adding') return;
    const parts: KitPieceChoice[] = pieces.flatMap((p, i) => {
      const s = states[i];
      if (!s || !p.product) return [];
      return [{
        product: { id: String(p.product.id), name: p.product.name, image: p.product.image ?? null, price: p.product.price, weight: (p.product as { weight?: number }).weight ?? null },
        quantity: p.quantity,
        variationId: s.color?.variationId,
        variationName: s.color?.name,
        colorHex: s.color?.hex ?? null,
        sizeLabel: s.size?.label,
        basePrice: s.price.basePrice,
        modifier: s.modifier,
        tierRatio: s.price.tierRatio,
        image: s.color?.image ?? null,
      }];
    });
    setState('adding');
    addItems(kitCartLines({ id: kit.id, name: kitText(kit, 'name', locale), discount_type: kit.discount_type, discount_value: Number(kit.discount_value) }, parts), {
      onSettled: () => setState('done'),
    });
  };

  if (isLoading) {
    return (
      <PageShell>
        <div className="shell py-10" role="status" aria-label={t('adding')}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="skeleton aspect-[4/3] rounded-[24px]" />
            <div className="space-y-4"><div className="skeleton h-10 w-2/3 rounded-xl" /><div className="skeleton h-5 w-full rounded" /><div className="skeleton h-40 rounded-[20px]" /></div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (isError || !kit) {
    return (
      <PageShell>
        <div className="shell py-16">
          <div className={cn(card, 'mx-auto max-w-xl px-6 py-12 text-center')} role={isError ? 'alert' : undefined}>
            <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-[20px]"><LayerArt Icon={Gift} /></div>
            <h1 className="mt-6 text-[26px] font-bold tracking-[-0.03em]">{t('not_found')}</h1>
            <p className="mt-2 text-muted-foreground">{t('not_found_text')}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {isError && <button type="button" className={btnSecondary} onClick={() => refetch()}>{t('retry')}</button>}
              <Link to="/kits" className={btnPrimary}>{t('all_kits')}</Link>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const name = kitText(kit, 'name', locale);
  const lead = kitText(kit, 'description', locale);
  const longHtml = kitText(kit, 'long_description', locale);
  const highlights = kitHighlights(kit, locale);
  const photos = kitPhotos(kit);
  const pctLabel = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(prices.pct);
  const badge = kit.discount_type === 'percentage' ? t('off', { value: pctLabel }) : t('off', { value: money(Number(kit.discount_value) || 0) });
  const units = pieces.reduce((s, p) => s + p.quantity, 0);
  const others = allKits.filter((k) => k.id !== kit.id).slice(0, 3);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const title = `${kit.seo_title || name} | ${storeName}`;
  const description = kit.seo_description || lead || t('seo_desc', { name, count: units, pct: pctLabel, store: storeName });
  const endDate = kit.ends_at ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(kit.ends_at)) : null;

  return (
    <PageShell>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${origin}${kitHref(kit)}`} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {photos[0] && <meta property="og:image" content={photos[0]} />}
      </Helmet>

      <div className="shell">
        <div className="pt-5 md:pt-8"><CatalogBreadcrumb items={[{ label: t('home'), href: '/' }, { label: t('kits'), href: '/kits' }, { label: name }]} /></div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          {/* Galeria */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative overflow-hidden rounded-[24px] bg-brand-alt">
              <div className="aspect-[4/3]">
                <AnimatePresence mode="wait" initial={false}>
                  {photos.length ? (
                    <motion.img key={photos[photo]} src={photos[photo]} alt={photos.length > 1 ? `${name}, ${t('photo', { n: photo + 1, total: photos.length })}` : name}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                      className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full grid-cols-2 gap-2 p-4">
                      {pieces.slice(0, 4).map((p, i) => (
                        <div key={i} className="relative overflow-hidden rounded-[18px] bg-white">
                          {p.product?.image ? <img src={p.product.image} alt="" className="h-full w-full object-cover" /> : <LayerArt Icon={Box} size="sm" />}
                        </div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </div>
              <span className="absolute left-4 top-4 rounded-[10px] bg-primary px-3 py-1.5 text-[14px] font-bold text-primary-foreground shadow-[var(--shadow-glow-orange)]">{badge}</span>
              {photos.length > 1 && (
                <>
                  <button type="button" aria-label={t('photo', { n: ((photo - 1 + photos.length) % photos.length) + 1, total: photos.length })}
                    onClick={() => setPhoto((n) => (n - 1 + photos.length) % photos.length)}
                    className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-sm transition-colors duration-150 hover:bg-white">
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={t('photo', { n: ((photo + 1) % photos.length) + 1, total: photos.length })}
                    onClick={() => setPhoto((n) => (n + 1) % photos.length)}
                    className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-sm transition-colors duration-150 hover:bg-white">
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            {photos.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {photos.map((src, i) => (
                  <button key={src} type="button" onClick={() => setPhoto(i)} aria-label={t('photo', { n: i + 1, total: photos.length })} aria-current={i === photo}
                    className={cn('h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border-2 transition-colors duration-150', i === photo ? 'border-primary' : 'border-transparent opacity-80 hover:opacity-100')}>
                    <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compra */}
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-brand-orange-text">
              {pieces.length === 1 ? t('pieces_one') : t('pieces_other', { count: pieces.length })}
            </p>
            <h1 className="mt-2 text-[36px] font-[800] leading-[1.05] tracking-[-0.04em] md:text-[48px]">{name}</h1>
            {lead && <p className="mt-3 text-[17px] leading-relaxed text-brand-ink-soft">{lead}</p>}

            {highlights.length > 0 && (
              <section className="mt-6" aria-labelledby="kit-highlights">
                <h2 id="kit-highlights" className="text-[15px] font-bold">{t('highlights')}</h2>
                <ul className="mt-3 space-y-2">
                  {highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-[15px] text-brand-ink-soft">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-brand-orange-text"><Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" /></span>
                      {h}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Peças, com escolha de cor e tamanho */}
            <section className="mt-8" aria-labelledby="kit-pieces">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="kit-pieces" className={h3}>{t('in_the_box')}</h2>
                  <p className="mt-1 text-[14px] text-muted-foreground">{t('in_the_box_hint')}</p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-alt px-3 py-1 text-[13px] font-semibold">{units === 1 ? t('units_one') : t('units_other', { count: units })}</span>
              </div>
              <ul className="mt-4 space-y-3">
                {pieces.map((p, i) => {
                  const s = states[i];
                  const pName = p.product?.name ?? '';
                  const img = s?.color?.image || p.product?.image;
                  return (
                    <motion.li key={`${p.product_id}-${i}`} {...reveal(i)} className={cn(card, 'p-4')}>
                      <div className="flex gap-4">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[14px] bg-brand-alt">
                          {img ? <img src={img} alt={pName} className="h-full w-full object-cover" loading="lazy" /> : <LayerArt Icon={Box} size="sm" />}
                          {p.quantity > 1 && <span className="absolute bottom-1 right-1 rounded-full bg-foreground px-2 py-0.5 text-[12px] font-bold text-background">x{p.quantity}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[16px] font-semibold">{pName}</p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                                {t('qty', { count: p.quantity })}
                                {s && <span>{t('each', { value: money(s.price.unit) })}</span>}
                                {s?.soldOut && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[12px] font-semibold text-destructive">{t('sold_out')}</span>}
                              </p>
                            </div>
                            {p.product && (
                              <Link to={`/produto/${p.product.slug || p.product.id}`} className="shrink-0 text-[13px] font-semibold text-brand-orange-text hover:underline">{t('see_product')}</Link>
                            )}
                          </div>
                          {p.note && <p className="mt-1.5 text-[13px] text-brand-ink-soft">{p.note}</p>}
                        </div>
                      </div>

                      {s && !s.soldOut && s.colors.length > 0 && (
                        <fieldset className="mt-4">
                          <legend className="text-[13px] font-semibold">{t('color')}{s.color && <span className="ml-1.5 font-normal text-muted-foreground">{s.color.name}</span>}</legend>
                          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('choose_color', { name: pName })}>
                            {s.colors.map((c) => {
                              const on = s.color?.key === c.key;
                              return (
                                <button key={c.key} type="button" role="radio" aria-checked={on} disabled={c.soldOut}
                                  aria-label={c.soldOut ? `${c.name}, ${t('unavailable_option')}` : c.name}
                                  onClick={() => setChoice(i, { colorKey: c.key, sizeId: null })}
                                  className={cn('flex min-h-10 items-center gap-2 rounded-[12px] border px-3 text-[14px] font-medium transition-colors duration-150',
                                    on ? 'border-primary bg-accent text-foreground' : 'border-brand-card-border bg-white hover:border-foreground/30',
                                    c.soldOut && 'cursor-not-allowed opacity-45 line-through')}>
                                  {c.hex && <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: c.hex }} aria-hidden="true" />}
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                      {s && !s.soldOut && s.sizes.length > 0 && (
                        <fieldset className="mt-3">
                          <legend className="text-[13px] font-semibold">{t('size')}{s.size && <span className="ml-1.5 font-normal text-muted-foreground">{s.size.label}</span>}</legend>
                          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('choose_size', { name: pName })}>
                            {s.sizes.map((z) => {
                              const on = s.size?.id === z.id;
                              return (
                                <button key={z.id} type="button" role="radio" aria-checked={on} disabled={!z.purchasable}
                                  aria-label={z.purchasable ? z.label : `${z.label}, ${t('unavailable_option')}`}
                                  onClick={() => setChoice(i, { sizeId: z.id })}
                                  className={cn('min-h-10 min-w-12 rounded-[12px] border px-3 text-[14px] font-semibold transition-colors duration-150',
                                    on ? 'border-primary bg-accent' : 'border-brand-card-border bg-white hover:border-foreground/30',
                                    !z.purchasable && 'cursor-not-allowed opacity-45 line-through')}>
                                  {z.label}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
            </section>

            {/* Preço e compra */}
            <div className={cn(card, 'mt-6 p-5 md:p-6')}>
              <dl className="space-y-2 text-[15px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('separate')}</dt>
                  <dd className="tabular-nums text-muted-foreground line-through decoration-muted-foreground/60">{money(prices.original)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-brand-orange-text">{t('kit_discount')} ({pctLabel})</dt>
                  <dd className="font-medium tabular-nums text-brand-orange-text">- {money(prices.discount)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                  <dt className="font-semibold">{t('total')}</dt>
                  <dd className="text-[30px] font-extrabold tabular-nums tracking-[-0.03em]">{money(prices.final)}</dd>
                </div>
              </dl>
              <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-[13px]">
                <span className="text-muted-foreground">{taxed ? t('tax_included') : ''}</span>
                {prices.discount > 0 && <span className="font-semibold text-brand-orange-text">{t('save', { value: money(prices.discount) })}</span>}
              </p>

              {unavailable ? (
                <p role="note" className="mt-4 flex items-start gap-2 rounded-[14px] bg-brand-alt px-3 py-2.5 text-[14px] text-brand-ink-soft">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />{t('unavailable_hint')}
                </p>
              ) : missing ? (
                <p role="note" className="mt-4 flex items-start gap-2 rounded-[14px] bg-accent px-3 py-2.5 text-[14px] text-brand-ink-soft">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange-text" aria-hidden="true" />{t('missing_choices')}
                </p>
              ) : null}

              {state === 'done' ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <span className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-emerald-50 text-[15px] font-semibold text-emerald-800">
                    <PackageCheck className="h-5 w-5" aria-hidden="true" />{t('added')}
                  </span>
                  <button type="button" className={cn(btnPrimary, 'flex-1')} onClick={() => navigate('/carrinho')}>
                    {t('go_cart')}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={buy} disabled={unavailable || missing || optsLoading || state === 'adding'}
                  className={cn(btnPrimary, 'mt-4 w-full disabled:pointer-events-none disabled:opacity-60')}>
                  {state === 'adding' ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />}
                  {state === 'adding' ? t('adding') : unavailable ? t('unavailable') : t('buy')}
                </button>
              )}
              <p className="mt-3 flex items-start gap-2 text-[13px] text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t('rule')}
              </p>
              {endDate && <p className="mt-1 text-[13px] font-medium text-brand-orange-text">{t('ends', { date: endDate })}</p>}
            </div>
          </div>
        </div>

        {/* Descrição completa */}
        {longHtml && (
          <section className="mt-14 max-w-3xl" aria-labelledby="kit-about">
            <h2 id="kit-about" className="flex items-center gap-2 text-[28px] font-bold tracking-[-0.03em]">
              <Sparkles className="h-6 w-6 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('about')}
            </h2>
            <SiteHtml html={longHtml} className={cn(siteProse, 'mt-4')} />
          </section>
        )}

        {/* Outros kits */}
        {others.length > 0 && (
          <section className="mt-14" aria-labelledby="kit-more">
            <div className="flex items-end justify-between gap-4">
              <h2 id="kit-more" className="text-[28px] font-bold tracking-[-0.03em]">{t('more_kits')}</h2>
              <Link to="/kits" className="text-[14px] font-semibold text-brand-orange-text hover:underline">{t('all_kits')}</Link>
            </div>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((k: KitRow) => {
                const p = kitPhotos(k)[0];
                return (
                  <li key={k.id}>
                    <Link to={kitHref(k)} className={cn(card, 'group flex items-center gap-4 p-3 transition-shadow duration-200 hover:shadow-[var(--shadow-hover)]')}>
                      <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[14px] bg-brand-alt">
                        {p ? <img src={p} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" loading="lazy" /> : <LayerArt Icon={Gift} size="sm" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[16px] font-semibold">{kitText(k, 'name', locale)}</span>
                        <span className="text-[13px] font-medium text-brand-orange-text">{t('in_kit_cta')}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}
