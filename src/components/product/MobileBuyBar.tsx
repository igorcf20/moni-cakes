// Barra fixa de compra no celular e tablet: preço e botão, por cima da MobileTabBar (64px + área segura).
// Aparece quando o botão principal sai da tela; sem opções escolhidas, o botão leva até elas.
// Com desktop (Admin > Página do produto, desktop_bar) também aparece no computador, com foto e nome do produto;
// photo mostra a miniatura no celular (mobile_bar_photo).
// Vai num portal para o body: a animação de entrada das rotas (PageTransition) deixa um transform no
// contentor, e com ele um position: fixed ficaria preso ao contentor em vez da janela.
// Enquanto está visível, publica em --pdp-buybar-offset (no <html>) a distância do fundo da janela ao topo da
// barra, para outros elementos fixos (ex.: o botão Voltar ao topo) subirem por cima dela.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { useMessages } from '@/i18n';
import { productMessages } from '@/i18n/product';
import { AddToCartButton, type AddState } from './AddToCartButton';
import { PriceExtras, PriceMain, usePriceView } from '@/components/price/SmartPrice';
import { cn } from '@/lib/utils';

const OFFSET_VAR = '--pdp-buybar-offset';

/** Mede a barra (bottom calculado + altura) e mantém a variável CSS em dia; limpa ao esconder. */
function useOffsetVar(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const root = document.documentElement;
    const sync = () => {
      const cs = getComputedStyle(el);
      if (cs.display !== 'none') root.style.setProperty(OFFSET_VAR, `${Math.round((parseFloat(cs.bottom) || 0) + el.offsetHeight)}px`);
      else root.style.removeProperty(OFFSET_VAR);
    };
    sync();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', sync);
      root.style.removeProperty(OFFSET_VAR);
    };
  }, [ref]);
}

function BarFrame({ label, desktop, children }: { label: string; desktop?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useOffsetVar(ref);
  return (
    <motion.div
      ref={ref}
      role="region"
      aria-label={label}
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn('fixed inset-x-0 bottom-[calc(4rem_+_env(safe-area-inset-bottom))] z-[45] border-t border-border bg-white/95 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 md:bottom-0 md:pb-[env(safe-area-inset-bottom)]', desktop ? 'lg:shadow-[0_-12px_32px_-20px_rgba(0,0,0,0.3)]' : 'lg:hidden')}
    >
      {children}
    </motion.div>
  );
}

export function MobileBuyBar({ visible, price, amount, oldPrice, from, state, needsOptions, soldOut, loading, unavailable, onAdd, onChooseOptions, goToCart, idleLabel, desktop, photo, showPhotoMobile, name }: {
  visible: boolean;
  /** também no computador (com foto e nome) */
  desktop?: boolean;
  /** miniatura do produto (no computador aparece sempre que houver foto) */
  photo?: string | null;
  /** foto também no celular e tablet */
  showPhotoMobile?: boolean;
  name?: string;
  price: string;
  /** Preço final na moeda base (com imposto), para o preço à vista e as parcelas (Exibição de preços). */
  amount?: number | null;
  oldPrice?: string | null;
  from?: boolean;
  state: AddState;
  needsOptions: boolean;
  soldOut: boolean;
  idleLabel?: string;
  /** estoque e opções ainda a carregar: botão em skeleton */
  loading?: boolean;
  /** opções não carregaram: não dá para comprar */
  unavailable?: boolean;
  onAdd: () => void;
  onChooseOptions: () => void;
  /** o produto (com esta cor e tamanho) já está no carrinho: o botão leva até ele */
  goToCart?: boolean;
}) {
  const { t } = useMessages(productMessages);
  const priceCtx = usePriceView('buyBar', amount);
  const showOld = !!oldPrice && priceCtx.view?.highlight !== 'installment';
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {visible && (
        <BarFrame key="bar" label={t('buyBar')} desktop={desktop}>
          <div className="shell flex items-center gap-3 py-2.5 lg:gap-5 lg:py-3">
            {photo && (
              <img src={photo} alt="" aria-hidden="true" decoding="async"
                className={cn('h-11 w-11 shrink-0 rounded-[10px] border border-brand-card-border object-cover lg:h-14 lg:w-14 lg:rounded-[12px]', !showPhotoMobile && 'hidden lg:block')} />
            )}
            {desktop && name && <p className="hidden min-w-0 flex-1 truncate text-[16px] font-semibold text-foreground lg:block">{name}</p>}
            <div className={cn('min-w-0 flex-1 leading-tight', desktop && 'lg:flex-none lg:text-right')}>
              {showOld && <p className="truncate text-xs text-muted-foreground line-through tabular-nums"><span className="sr-only">{t('oldPrice')}: </span>{oldPrice}</p>}
              <p className={oldPrice ? 'truncate text-[18px] font-bold tabular-nums text-brand-orange-text' : 'truncate text-[18px] font-bold tabular-nums text-foreground'}>
                {from && <span className="mr-1 text-xs font-medium text-muted-foreground">{t('priceFrom')}</span>}
                {priceCtx.view ? <PriceMain ctx={priceCtx} labelClassName="text-[12px]" /> : price}
              </p>
              {priceCtx.view && <PriceExtras ctx={priceCtx} size="card" className="[&>*:nth-child(n+2)]:hidden [&>*]:truncate" />}
            </div>
            <div className="w-[56%] max-w-[260px] shrink-0 lg:w-[300px] lg:max-w-none">
              {goToCart ? (
                <Link to="/carrinho" className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]">
                  <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" /><span className="truncate">{t('goToCart')}</span>
                </Link>
              ) : loading ? (
                <AddToCartButton compact loading state={state} onClick={onAdd} />
              ) : needsOptions && !soldOut && !unavailable ? (
                <button
                  type="button"
                  onClick={onChooseOptions}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98]"
                >
                  <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />{t('chooseOptions')}
                </button>
              ) : (
                <AddToCartButton compact state={state} soldOut={soldOut} disabled={unavailable} onClick={onAdd} idleLabel={idleLabel} />
              )}
            </div>
          </div>
        </BarFrame>
      )}
    </AnimatePresence>,
    document.body,
  );
}
