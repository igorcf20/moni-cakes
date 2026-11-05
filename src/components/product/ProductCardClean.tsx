// Cartão "limpo" das listagens (Admin > Aparência da loja > Página de catálogo, cartão "Foto e texto"):
// foto em cima, nome, avaliação e preço por baixo, em Inter e sem degradê escuro. Mesmas regras do ProductCard3D
// (estoque, pré-venda, favoritos, comparar, exibição de preços); o cartão de foto inteira continua no ProductCard3D.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Heart, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { useFeature } from '@/hooks/useFeatures';
import { LayerArt } from '@/components/MediaImage';
import { usePreorder } from '@/hooks/usePreorders';
import { useCardStock } from '@/hooks/useCardStock';
import { PreorderChip } from '@/components/product/PreorderInfo';
import { CompareToggle } from '@/components/compare/CompareToggle';
import { LowestPrice, Stars, type CardProduct } from '@/components/product/ProductCard3D';
import { PriceExtras, PriceMain, usePriceView } from '@/components/price/SmartPrice';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { cn } from '@/lib/utils';

export function ProductCardClean({ p, favorite, onFavorite, onAdd, featuredBadge = false }: {
  p: CardProduct; favorite: boolean; onFavorite: (id: string) => void; onAdd: (p: CardProduct) => Promise<void> | void;
  /** mostrar o selo Destaque (Promoção e Novo aparecem sempre) */
  featuredBadge?: boolean;
}) {
  const { t } = useMessages(layoutMessages);
  const wishlistOn = useFeature('wishlist');
  const preorder = usePreorder(p.id);
  const priceCtx = usePriceView('card', p.amount);
  const showOld = !!p.oldPrice && priceCtx.view?.highlight !== 'installment';
  const stock = useCardStock(p.id, !p.needsOptions);
  const [state, setState] = useState<'idle' | 'adding' | 'done'>('idle');
  const add = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (state !== 'idle') return;
    setState('adding');
    try { await onAdd(p); setState('done'); setTimeout(() => setState('idle'), 1400); } catch { setState('idle'); }
  };
  const badges = ([
    p.discountPct ? ['sale', `${t('badge_sale')} -${p.discountPct}%`] : null,
    p.isNew ? ['new', t('badge_new')] : null,
    featuredBadge && p.featured ? ['featured', t('badge_featured')] : null,
  ].filter(Boolean) as [string, string][]).slice(0, 2);
  const soldOut = stock === 'out';
  const roundBtn = 'grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-[background-color,border-color,color,transform] duration-150';

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.22 }}
      className="group relative flex h-full flex-col"
    >
      <div className="relative isolate aspect-[4/5] overflow-hidden rounded-[14px] bg-white shadow-[0_1px_2px_rgba(23,23,21,0.06)] transition-shadow duration-200 group-hover:shadow-[0_14px_32px_-18px_rgba(23,23,21,0.4)]">
        <Link to={`/produto/${p.id}`} className="absolute inset-0 -z-10 block focus-visible:outline-none" aria-label={p.name} tabIndex={-1}>
          {p.image ? (
            <>
              <img src={p.image} alt={p.name} loading="lazy" decoding="async" className={cn('h-full w-full object-cover transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.04]', p.image2 && 'group-hover:opacity-0', soldOut && 'opacity-70 saturate-50')} />
              {p.image2 && <img src={p.image2} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-[1.02] object-cover opacity-0 transition-[transform,opacity] duration-500 ease-out group-hover:scale-[1.04] group-hover:opacity-100" />}
            </>
          ) : <LayerArt Icon={ShoppingBag} size="sm" />}
        </Link>
        <span className="absolute left-2.5 top-2.5 flex flex-col gap-1.5 sm:left-3 sm:top-3">
          {badges.map(([kind, label]) => (
            <span key={kind} className={cn(
              'w-fit rounded-full px-2 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.12em] tabular-nums shadow-sm',
              kind === 'sale' ? 'bg-primary text-primary-foreground' : kind === 'new' ? 'bg-white text-brand-ink' : 'bg-brand-ink text-white',
            )}>{label}</span>
          ))}
          {preorder && <PreorderChip withDate={false} className="bg-white/95" />}
          {soldOut && <span className="w-fit rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-brand-ink shadow-sm">{t('card_sold_out')}</span>}
        </span>
        {wishlistOn && (
          <button
            type="button" onClick={() => onFavorite(p.id)} aria-pressed={favorite} aria-label={favorite ? t('unfavorite') : t('favorite')}
            className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-brand-ink shadow-sm backdrop-blur transition-transform duration-150 hover:scale-105 active:scale-95 sm:right-3 sm:top-3"
          >
            <motion.span key={String(favorite)} initial={{ scale: favorite ? 0.5 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 14 }}>
              <Heart className={cn('h-4 w-4 transition-colors duration-150', favorite ? 'fill-primary text-primary' : 'text-brand-ink')} strokeWidth={1.8} />
            </motion.span>
          </button>
        )}
        <CompareToggle productId={p.id} name={p.name} place="card" besideHeart={wishlistOn} className={cn('absolute right-2.5 text-brand-ink sm:right-3', wishlistOn ? 'top-[50px] sm:top-[54px]' : 'top-2.5 sm:top-3')} />
      </div>

      <div className="flex flex-1 flex-col gap-1 px-0.5 pt-3">
        <Link to={`/produto/${p.id}`} className="line-clamp-2 text-[14px] font-semibold leading-snug tracking-[-0.005em] text-foreground underline-offset-4 transition-colors duration-150 hover:text-brand-orange-text sm:text-[15px]">{p.name}</Link>
        {!!p.reviews && p.rating ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Stars value={p.rating} /><span className="tabular-nums">({p.reviews})</span><span className="sr-only">{p.rating.toFixed(1)} / 5</span></span>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <span className="flex min-w-0 flex-col leading-tight">
            {showOld && <span className="text-xs text-muted-foreground line-through tabular-nums">{p.oldPrice}</span>}
            {priceCtx.view
              ? <PriceMain ctx={priceCtx} labelClassName="text-[11px]" className="text-[15px] font-semibold tabular-nums text-foreground sm:text-[16px]" />
              : <span className="text-[15px] font-semibold tabular-nums text-foreground sm:text-[16px]">{p.price}</span>}
            <span className="hidden sm:contents"><PriceExtras ctx={priceCtx} size="card" /></span>
            {p.oldPrice && <span className="hidden sm:contents"><LowestPrice id={p.id} vatRate={p.vatRate} /></span>}
            <CompareToggle productId={p.id} name={p.name} place="card" slot="body" className="mt-1.5" />
          </span>
          {p.needsOptions ? (
            <Link to={`/produto/${p.id}`} className={cn(roundBtn, 'border-border bg-white text-brand-ink hover:border-primary hover:bg-primary hover:text-primary-foreground')} aria-label={t('chooseOptions')} title={t('chooseOptions')}>
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          ) : stock === 'loading' ? (
            <span role="status" aria-label={t('card_checking')} className="h-10 w-10 shrink-0 rounded-full bg-border motion-safe:animate-pulse" />
          ) : soldOut ? (
            <Link to={`/produto/${p.id}`} className={cn(roundBtn, 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground')} aria-label={t('card_sold_out_see')} title={t('card_sold_out_see')}>
              <ShoppingBag className="h-4 w-4 opacity-70" strokeWidth={1.8} />
            </Link>
          ) : (
            <button type="button" onClick={add} aria-label={t('addToCart')} title={t('addToCart')}
              className={cn(roundBtn, 'active:scale-95', state === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border bg-white text-brand-ink hover:border-primary hover:bg-primary hover:text-primary-foreground')}>
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

export function ProductCardCleanSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton aspect-[4/5] rounded-[14px]" />
      <div className="skeleton mt-3 h-4 w-4/5 rounded" />
      <div className="skeleton mt-2 h-4 w-1/3 rounded" />
    </div>
  );
}
