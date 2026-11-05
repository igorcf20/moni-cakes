// Barra fixa de Comparar produtos (recurso compare): miniaturas dos escolhidos, Limpar e Comparar (N).
// Montada uma vez no App. Escondida em /comparar, no carrinho, no checkout, no Admin e na entrada.
// No computador fica no canto inferior esquerdo (não tapa a área de compra da página do produto).
// No celular fica acima da MobileTabBar e, na página do produto, acima da MobileBuyBar (--pdp-buybar-offset).
// Admin > Comparar produtos: barra completa (miniaturas) ou compacta (só "Comparar (N)" e o X para limpar).
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowRight, GitCompareArrows, ShoppingBag, X } from 'lucide-react';
import { LayerArt } from '@/components/MediaImage';
import { useFeature } from '@/hooks/useFeatures';
import { useCompareSettings } from '@/hooks/useOfferSettings';
import { useProductCards } from '@/hooks/useProductCards';
import { useMessages } from '@/i18n';
import { compareMessages } from '@/i18n/compare';
import { COMPARE_LIMIT, DEFAULT_COMPARE_SETTINGS, useCompare } from '@/lib/compare';
import { cn } from '@/lib/utils';

/** Páginas sem a barra: a própria comparação, carrinho e compra, Admin e entrada. */
const HIDDEN_PREFIXES = ['/comparar', '/carrinho', '/checkout', '/admin', '/shop-kode', '/auth', '/pedido/'];

function Thumb({ image, name, onRemove, removeLabel }: { image: string | null; name: string; onRemove: () => void; removeLabel: string }) {
  return (
    <li className="relative shrink-0">
      <span className="block h-12 w-12 overflow-hidden rounded-xl border border-brand-card-border bg-background" title={name}>
        {image ? <img src={image} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <LayerArt Icon={ShoppingBag} size="sm" />}
      </span>
      <button
        type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel}
        className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-brand-card-border bg-white text-foreground shadow-[var(--shadow-soft)] transition-colors duration-150 before:absolute before:-inset-2.5 before:content-[''] hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
      </button>
    </li>
  );
}

export default function CompareBar() {
  const on = useFeature('compare');
  const { t } = useMessages(compareMessages);
  const { pathname } = useLocation();
  const ids = useCompare((s) => s.ids);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);
  const { data: settings = DEFAULT_COMPARE_SETTINGS } = useCompareSettings();
  const compact = settings.bar === 'compact';
  const hidden = !on || ids.length === 0 || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  const { cards } = useProductCards(hidden || compact ? [] : ids, 'compare-bar');
  const byId = new Map(cards.map((c) => [c.id, c]));
  const n = ids.length;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {!hidden && compact && (
          <motion.div
            key="compact"
            role="region" aria-label={t('barLabel')}
            initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ bottom: 'calc(max(var(--pdp-buybar-offset, 0px), var(--compare-base)) + 0.5rem)' }}
            className="fixed left-3 z-[44] flex items-center gap-1 rounded-full border border-brand-card-border bg-white/95 p-1 shadow-[0_10px_30px_-14px_rgba(23,23,23,0.35)] backdrop-blur-md [--compare-base:calc(4rem+env(safe-area-inset-bottom))] md:[--compare-base:env(safe-area-inset-bottom)] lg:left-6 lg:[--compare-base:0.75rem]"
          >
            <Link
              to="/comparar"
              className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <GitCompareArrows className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              {t('compareN', { count: n })}
            </Link>
            <button
              type="button" onClick={clear} aria-label={t('clearAria')} title={t('clear')}
              className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </motion.div>
        )}
        {!hidden && !compact && (
          <motion.div
            key="full"
            role="region" aria-label={t('barLabel')}
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ bottom: 'calc(max(var(--pdp-buybar-offset, 0px), var(--compare-base)) + 0.5rem)' }}
            className="fixed inset-x-3 z-[44] mx-auto max-w-[760px] rounded-[20px] lg:inset-x-auto lg:left-6 lg:mx-0 lg:max-w-[560px] border border-brand-card-border bg-white/95 p-2.5 shadow-[0_12px_40px_-16px_rgba(23,23,23,0.35)] backdrop-blur-md [--compare-base:calc(4rem+env(safe-area-inset-bottom))] supports-[backdrop-filter]:bg-white/90 sm:p-3 md:[--compare-base:env(safe-area-inset-bottom)] lg:[--compare-base:0.75rem]"
          >
            <div className="flex items-center gap-3">
              <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-primary sm:grid lg:hidden">
                <GitCompareArrows className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <ul className="flex min-w-0 items-center gap-2.5 overflow-x-auto py-2 pl-0.5 pr-2.5 sm:gap-3" aria-label={t('barCount', { count: n, max: COMPARE_LIMIT })}>
                {ids.map((id) => {
                  const c = byId.get(id);
                  const name = c?.name ?? '';
                  return <Thumb key={id} image={c?.image ?? null} name={name} onRemove={() => remove(id)} removeLabel={t('removeThumb', { name })} />;
                })}
                {Array.from({ length: Math.max(0, COMPARE_LIMIT - n) }, (_, i) => (
                  <li key={`empty-${i}`} aria-hidden="true" className="hidden h-12 w-12 shrink-0 rounded-xl border border-dashed border-border md:block lg:hidden" />
                ))}
              </ul>
              <p className="hidden min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground lg:block">
                <span className="block font-semibold text-foreground tabular-nums">{t('barCount', { count: n, max: COMPARE_LIMIT })}</span>
                {n < 2 && t('barHint')}
              </p>
              <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button" onClick={clear} aria-label={t('clearAria')}
                  className="inline-flex min-h-[44px] items-center rounded-xl px-2.5 text-[14px] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
                >
                  {t('clear')}
                </button>
                <Link
                  to="/comparar"
                  className={cn('inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5 sm:text-[15px]')}
                >
                  {t('compareN', { count: n })}
                  <ArrowRight className="hidden h-4 w-4 sm:block" strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
