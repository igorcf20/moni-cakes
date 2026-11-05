// Botão Comparar (recurso compare): no cartão de produto e na página do produto, no formato escolhido em
// Admin > Comparar produtos (store_settings.compare, src/lib/compare.ts):
//   cartão   icon = ícone redondo abaixo do coração; heart = ícone pequeno ao lado do coração; text = "Comparar" simples
//            abaixo do preço (o cartão pede o lugar com `slot`); off = nada
//   produto  button = botão inteiro; text = link simples; off = nada
// Lista cheia = aviso (sonner) com atalho para /comparar. Recurso desligado = nada.
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, GitCompareArrows } from 'lucide-react';
import { useFeature } from '@/hooks/useFeatures';
import { useCompareSettings } from '@/hooks/useOfferSettings';
import { useMessages } from '@/i18n';
import { compareMessages } from '@/i18n/compare';
import { COMPARE_LIMIT, DEFAULT_COMPARE_SETTINGS, useCompare } from '@/lib/compare';
import { cn } from '@/lib/utils';

type Props = {
  productId: string;
  name: string;
  /** card = cartão de produto; product = página do produto */
  place: 'card' | 'product';
  /** no cartão: top = sobre a foto (icon, heart); body = abaixo do preço (text) */
  slot?: 'top' | 'body';
  /** no cartão com o formato heart: há coração ao lado? (o lugar é fixo; className só vale nos outros formatos) */
  besideHeart?: boolean;
  className?: string;
};

export function CompareToggle({ productId, name, place, slot = 'top', besideHeart = true, className }: Props) {
  const on = useFeature('compare');
  const { data: settings = DEFAULT_COMPARE_SETTINGS } = useCompareSettings();
  const { t } = useMessages(compareMessages);
  const navigate = useNavigate();
  const active = useCompare((s) => s.ids.includes(productId));
  const toggle = useCompare((s) => s.toggle);
  const style = place === 'card' ? settings.card : settings.product;
  if (!on || style === 'off') return null;
  if (place === 'card' && (slot === 'body') !== (style === 'text')) return null;

  const click = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (toggle(productId) === 'full') {
      toast(t('fullTitle', { max: COMPARE_LIMIT }), {
        id: 'compare-full',
        description: t('fullText'),
        action: { label: t('fullAction'), onClick: () => navigate('/comparar') },
      });
    }
  };
  const label = active ? t('removeAria', { name }) : t('addAria', { name });

  if (style === 'heart') {
    // Discreto: ícone pequeno na mesma linha do coração (à esquerda dele), sem sombra até passar o rato.
    return (
      <button
        type="button" onClick={click} aria-pressed={active} aria-label={label} title={active ? t('toggleOn') : t('toggle')}
        className={cn(
          'absolute top-3 grid h-10 w-10 place-items-center rounded-full transition-[background-color,color,opacity,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          besideHeart ? 'right-[60px]' : 'right-3',
          active ? 'bg-primary text-primary-foreground' : 'bg-white/80 text-foreground/80 hover:bg-white hover:text-brand-orange-text md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
        )}
      >
        <GitCompareArrows className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </button>
    );
  }

  if (style === 'text') {
    // Discreto: caixinha e a palavra Comparar, sem botão.
    return (
      <button
        type="button" onClick={click} aria-pressed={active} aria-label={label}
        className={cn(
          'inline-flex min-h-[32px] w-fit items-center gap-1.5 rounded-md text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'text-brand-orange-text' : 'text-muted-foreground hover:text-foreground',
          place === 'product' && 'self-center px-2 text-[14px]',
          className,
        )}
      >
        <span className={cn('grid h-4 w-4 place-items-center rounded-[5px] border transition-colors duration-150', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-white')} aria-hidden="true">
          {active && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        {active ? t('toggleOn') : t('toggle')}
      </button>
    );
  }

  if (style === 'icon') {
    return (
      <button
        type="button" onClick={click} aria-pressed={active} aria-label={label} title={active ? t('toggleOn') : t('toggle')}
        className={cn(
          'grid h-9 w-9 place-items-center rounded-full shadow-[var(--shadow-soft)] backdrop-blur transition-[background-color,color,transform] duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          active ? 'bg-primary text-primary-foreground' : 'bg-white/90 text-foreground hover:text-brand-orange-text',
          className,
        )}
      >
        <GitCompareArrows className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button" onClick={click} aria-pressed={active} aria-label={label}
      className={cn(
        'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border px-5 text-[15px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active ? 'border-primary bg-accent text-brand-orange-text' : 'border-border bg-white text-foreground hover:border-foreground/30',
        className,
      )}
    >
      {active ? <Check className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" /> : <GitCompareArrows className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />}
      {active ? t('toggleOn') : t('toggle')}
    </button>
  );
}
