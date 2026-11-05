// Botão laranja de compra com estados: a carregar (skeleton), adicionar, a adicionar, adicionado (check) e erro (tentar de novo).
import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Loader2, ShoppingBag } from 'lucide-react';
import { useMessages } from '@/i18n';
import { productMessages } from '@/i18n/product';
import { cn } from '@/lib/utils';

export type AddState = 'idle' | 'adding' | 'done' | 'error';

export const AddToCartButton = forwardRef<HTMLButtonElement, {
  state: AddState;
  disabled?: boolean;
  soldOut?: boolean;
  onClick: () => void;
  compact?: boolean;
  describedBy?: string;
  className?: string;
  /** texto do botão parado (ex.: "Comprar na pré-venda"); padrão "Adicionar ao carrinho" */
  idleLabel?: string;
  /** estoque ainda a carregar: espaço do botão em skeleton, sem mostrar "Adicionar" nem "Esgotado" antes da hora */
  loading?: boolean;
}>(function AddToCartButton({ state, disabled, soldOut, onClick, compact, describedBy, className, idleLabel, loading }, ref) {
  const { t } = useMessages(productMessages);
  if (loading) {
    return (
      <div role="status" aria-label={t('checkingStock')}
        className={cn('w-full rounded-full bg-foreground/[0.08] motion-safe:animate-pulse', compact ? 'min-h-[48px]' : 'min-h-[56px]', className)} />
    );
  }
  const off = disabled || soldOut || state === 'adding';
  const view = soldOut
    ? { key: 'sold', Icon: ShoppingBag, label: t('soldOut') }
    : state === 'adding' ? { key: 'adding', Icon: Loader2, label: t('adding') }
    : state === 'done' ? { key: 'done', Icon: Check, label: compact ? t('addedShort') : t('added') }
    : state === 'error' ? { key: 'error', Icon: AlertCircle, label: t('tryAgain') }
    : { key: 'idle', Icon: ShoppingBag, label: idleLabel ?? t('addToCart') };
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={off}
      aria-disabled={off || undefined}
      aria-describedby={describedBy}
      aria-live="polite"
      className={cn(
        'relative inline-flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full font-semibold text-primary-foreground transition-[background-color,box-shadow,transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        compact ? 'min-h-[48px] px-4 text-[15px]' : 'min-h-[56px] px-6 text-[16px]',
        state === 'done' ? 'bg-emerald-600' : state === 'error' ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary-hover',
        !off && 'active:scale-[0.98]',
        (disabled || soldOut) && 'cursor-not-allowed bg-primary/45 shadow-none hover:bg-primary/45',
        state === 'adding' && 'cursor-wait',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={view.key}
          className="inline-flex items-center gap-2.5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
        >
          <view.Icon className={cn('h-5 w-5 shrink-0', view.key === 'adding' && 'animate-spin motion-reduce:animate-none')} strokeWidth={view.key === 'done' ? 2.4 : 1.9} aria-hidden="true" />
          <span className="truncate">{view.label}</span>
        </motion.span>
      </AnimatePresence>
    </button>
  );
});
