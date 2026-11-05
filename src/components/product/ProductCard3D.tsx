import { useState } from 'react';
import { useFeature } from "@/hooks/useFeatures";
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Heart, ShoppingBag, SlidersHorizontal, Star, type LucideIcon } from 'lucide-react';
import { LayerArt } from '@/components/MediaImage';
import { useCurrency } from '@/hooks/use-currency';
import { useLowestPrice } from '@/hooks/useProductCompliance';
import { usePreorder } from '@/hooks/usePreorders';
import { useCardStock } from '@/hooks/useCardStock';
import { PreorderChip } from '@/components/product/PreorderInfo';
import { CompareToggle } from '@/components/compare/CompareToggle';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { PriceExtras, PriceMain, usePriceView } from '@/components/price/SmartPrice';

export type CardProduct = {
  id: string;
  name: string;
  image: string | null;
  /** segunda foto, mostrada ao passar o mouse */
  image2?: string | null;
  /** preço final já convertido e formatado */
  price: string;
  /** preço final na moeda base, com imposto (preço à vista e parcelas da Exibição de preços); sem ele, só o preço */
  amount?: number | null;
  /** preço antes da promoção (formatado), quando houver */
  oldPrice?: string | null;
  discountPct?: number;
  /** taxa de imposto do produto, para mostrar o menor preço dos 30 dias na promoção (Diretiva Omnibus) */
  vatRate?: number | null;
  isNew?: boolean;
  /** marcado como destaque no Admin (selo Destaque) */
  featured?: boolean;
  rating?: number;
  reviews?: number;
  /** precisa escolher opções na página do produto antes de ir para o carrinho */
  needsOptions?: boolean;
};

/** Promoção: menor preço dos 30 dias antes da redução, quando a regra da loja vale no país (Admin > Preços e segurança). */
export function LowestPrice({ id, vatRate }: { id: string; vatRate?: number | null }) {
  const { t } = useMessages(layoutMessages);
  const { currentCurrency, convert } = useCurrency();
  const { data } = useLowestPrice(id, true);
  if (data == null) return null;
  return <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground tabular-nums">{t('cardLowest30', { price: formatPrice(convert(withVat(data, vatRate)), currentCurrency) })}</span>;
}

/** Estrelas com meio-ponto, cor laranja. */
export function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('h-3.5 w-3.5', value >= i - 0.25 ? 'fill-primary text-primary' : value >= i - 0.75 ? 'fill-primary/40 text-primary' : 'text-border')} strokeWidth={1.6} />
      ))}
    </span>
  );
}

export function ProductCard3D({ p, favorite, onFavorite, onAdd }: { p: CardProduct; favorite: boolean; onFavorite: (id: string) => void; onAdd: (p: CardProduct) => Promise<void> | void }) {
  const { t } = useMessages(layoutMessages);
  const wishlistOn = useFeature('wishlist');
  const preorder = usePreorder(p.id);
  const priceCtx = usePriceView('card', p.amount);
  const showOld = !!p.oldPrice && priceCtx.view?.highlight !== 'installment';
  // Botão direto do carrinho só depois de saber que há estoque (o carrinho também confere ao gravar).
  const stock = useCardStock(p.id, !p.needsOptions);
  const [state, setState] = useState<'idle' | 'adding' | 'done'>('idle');
  const add = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (state !== 'idle') return;
    setState('adding');
    try { await onAdd(p); setState('done'); setTimeout(() => setState('idle'), 1400); } catch { setState('idle'); }
  };
  // No máximo dois selos, por ordem de importância: promoção, novo, destaque.
  const badges = ([
    p.discountPct ? ['sale', `${t('badge_sale')} -${p.discountPct}%`] : null,
    p.isNew ? ['new', t('badge_new')] : null,
    p.featured ? ['featured', t('badge_featured')] : null,
  ].filter(Boolean) as [string, string][]).slice(0, 2);
  const soldOut = stock === 'out';
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.25 }}
      className="group relative isolate aspect-[3/4] overflow-hidden sm:aspect-[4/5] rounded-[10px] bg-brand-ink text-white shadow-[0_1px_2px_rgba(23,23,21,0.06)] transition-shadow duration-200 hover:shadow-[0_18px_40px_-18px_rgba(23,23,21,0.45)]"
    >
      {/* A foto ocupa o cartão todo; nome, preço e carrinho ficam por cima, sobre um degradê escuro. */}
      <Link to={`/produto/${p.id}`} className="absolute inset-0 -z-10 block focus-visible:outline-none" aria-label={p.name} tabIndex={-1}>
        {p.image ? (
          <>
            <img src={p.image} alt={p.name} loading="lazy" decoding="async" className={cn('h-full w-full object-cover transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.05]', p.image2 && 'group-hover:opacity-0', soldOut && 'opacity-70 saturate-50')} />
            {p.image2 && <img src={p.image2} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-[1.02] object-cover opacity-0 transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.05] group-hover:opacity-100" />}
          </>
        ) : <LayerArt Icon={ShoppingBag} size="sm" />}
      </Link>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[68%] bg-gradient-to-t from-black/90 via-black/50 to-transparent" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-black/25 to-transparent" aria-hidden="true" />

      <span className="absolute left-3 top-3 flex flex-col gap-1.5 sm:left-4 sm:top-4">
        {badges.map(([kind, label]) => (
          <span key={kind} className={cn(
            'w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.16em] tabular-nums',
            kind === 'sale' ? 'bg-primary text-primary-foreground' : kind === 'new' ? 'bg-white text-brand-ink' : 'bg-brand-ink/70 text-white ring-1 ring-white/30 backdrop-blur',
          )}>{label}</span>
        ))}
        {preorder && <PreorderChip withDate={false} className="bg-white/95" />}
        {soldOut && <span className="w-fit rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-brand-ink">{t('card_sold_out')}</span>}
      </span>
      {wishlistOn && <button
        type="button" onClick={() => onFavorite(p.id)} aria-pressed={favorite} aria-label={favorite ? t('unfavorite') : t('favorite')}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-brand-ink backdrop-blur transition-transform duration-150 hover:scale-105 active:scale-95 sm:right-4 sm:top-4"
      >
        <motion.span key={String(favorite)} initial={{ scale: favorite ? 0.5 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 14 }}>
          <Heart className={cn('h-4 w-4 transition-colors duration-150', favorite ? 'fill-primary text-primary' : 'text-brand-ink')} strokeWidth={1.8} />
        </motion.span>
      </button>}
      <CompareToggle productId={p.id} name={p.name} place="card" besideHeart={wishlistOn} className={cn('absolute right-3 text-brand-ink sm:right-4', wishlistOn ? 'top-[54px] sm:top-[58px]' : 'top-3 sm:top-4')} />

      {/* Textos claros sobre o degradê: as peças de preço partilhadas usam cores de fundo claro, trocadas aqui. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3.5 sm:p-5 [&_.text-emerald-700]:text-emerald-300 [&_.text-muted-foreground]:text-white/70">
        <Link to={`/produto/${p.id}`} className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-[-0.005em] text-white underline-offset-4 hover:underline sm:text-[15px]">{p.name}</Link>
        {!!p.reviews && p.rating ? (
          <span className="flex items-center gap-1.5 text-xs text-white/75"><Stars value={p.rating} /><span className="tabular-nums">({p.reviews})</span><span className="sr-only">{p.rating.toFixed(1)} / 5</span></span>
        ) : null}
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <span className="flex min-w-0 flex-col leading-tight">
            {showOld && <span className="text-xs text-white/60 line-through tabular-nums">{p.oldPrice}</span>}
            {priceCtx.view
              ? <PriceMain ctx={priceCtx} labelClassName="text-[11px]" className="text-[16px] font-semibold tabular-nums text-white sm:text-[17px]" />
              : <span className="text-[16px] font-semibold tabular-nums text-white sm:text-[17px]">{p.price}</span>}
            <span className="hidden sm:contents"><PriceExtras ctx={priceCtx} size="card" /></span>
            {p.oldPrice && <span className="hidden sm:contents"><LowestPrice id={p.id} vatRate={p.vatRate} /></span>}
            <CompareToggle productId={p.id} name={p.name} place="card" slot="body" className="mt-1.5 text-white" />
          </span>
          {p.needsOptions ? (
            <Link to={`/produto/${p.id}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-brand-ink transition-colors duration-150 hover:bg-primary hover:text-primary-foreground" aria-label={t('chooseOptions')} title={t('chooseOptions')}>
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          ) : stock === 'loading' ? (
            <span role="status" aria-label={t('card_checking')} className="h-10 w-10 shrink-0 rounded-full bg-white/20 motion-safe:animate-pulse" />
          ) : soldOut ? (
            <Link to={`/produto/${p.id}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/40 text-white/80 transition-colors duration-150 hover:bg-white hover:text-brand-ink" aria-label={t('card_sold_out_see')} title={t('card_sold_out_see')}>
              <ShoppingBag className="h-4 w-4 opacity-70" strokeWidth={1.8} />
            </Link>
          ) : (
            <button type="button" onClick={add} aria-label={t('addToCart')} title={t('addToCart')}
              className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-95', state === 'done' ? 'bg-emerald-600 text-white' : 'bg-white text-brand-ink hover:bg-primary hover:text-primary-foreground')}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={state === 'done' ? 'ok' : 'bag'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: state === 'adding' ? 0.6 : 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }}>
                  {state === 'done' ? <Check className="h-4 w-4" strokeWidth={2.2} /> : <ShoppingBag className="h-4 w-4" strokeWidth={1.9} />}
                </motion.span>
              </AnimatePresence>
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

/** Cartão de reserva enquanto o catálogo não tem produtos: mostra a ideia, sem preço nem avaliação inventados. */
export function ProductCardSoon({ name, Icon }: { name: string; Icon: LucideIcon }) {
  const { t } = useMessages(layoutMessages);
  return (
    <article className="group relative aspect-[3/4] overflow-hidden rounded-[10px] bg-white sm:aspect-[4/5]">
      <LayerArt Icon={Icon} className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-white via-white/90 to-transparent p-4 pt-10 sm:p-5 sm:pt-12">
        <p className="line-clamp-2 text-[14px] font-semibold leading-snug sm:text-[15px]">{name}</p>
        <span className="w-fit rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-orange-text">{t('soon')}</span>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true" className="skeleton aspect-[3/4] rounded-[10px] sm:aspect-[4/5]" />
  );
}
