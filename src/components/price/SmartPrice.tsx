// =====================================================================================
// Preço como forma de marketing (recurso price_display, regras em src/lib/priceDisplay.ts, Admin > Exibição de preços):
//   usePriceView(lugar, valor)  o que mostrar (valor = preço final na moeda base, já com imposto; null = só o preço)
//   PriceMain                   o número grande pelo destaque escolhido (cartão, à vista, parcela)
//   PriceExtras                 as linhas abaixo dele (à vista, parcelas, economia), completas ou discretas
//   InstallmentTable            "Ver parcelas" na página do produto
// O desconto à vista é o do meio de pagamento (Admin > Pagamentos), o mesmo que o servidor cobra no pedido.
// =====================================================================================
import { useId, useState } from 'react';
import { ChevronDown, CreditCard, QrCode } from 'lucide-react';
import { useFeature } from '@/hooks/useFeatures';
import { usePriceDisplaySettings } from '@/hooks/useOfferSettings';
import { usePaymentMethods } from '@/components/PaymentMethods';
import { useCurrency } from '@/hooks/use-currency';
import { useCountry } from '@/lib/countries';
import { useMessages } from '@/i18n';
import { priceDisplayMessages, type PriceDisplayKey } from '@/i18n/priceDisplay';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/utils/currency';
import {
  cashDiscountFor, installmentPlan, installmentsServe, priceView,
  type PriceDisplaySettings, type PricePlace, type PriceView,
} from '@/lib/priceDisplay';

const VIA: Record<string, PriceDisplayKey> = {
  pix: 'via_pix', transfer: 'via_transfer', mbway: 'via_mbway', multibanco: 'via_multibanco', bizum: 'via_bizum', on_delivery: 'via_on_delivery',
};

export type PriceCtx = {
  view: PriceView | null;
  settings: PriceDisplaySettings | undefined;
  /** Formata um valor da moeda base no da moeda do cliente. */
  money: (base: number) => string;
  /** "no Pix", "à vista"... */
  via: string;
  t: (k: PriceDisplayKey, v?: Record<string, string | number>) => string;
  locale: string;
};

/** Leitura comum: regras da loja + meio com desconto ativo no país do cliente. */
export function usePriceRules() {
  const on = useFeature('price_display');
  const { data: settings } = usePriceDisplaySettings();
  const { data: methods } = usePaymentMethods();
  const country = useCountry();
  const { currentCurrency, convert } = useCurrency();
  const { t, locale } = useMessages(priceDisplayMessages);
  const method = settings ? methods?.find((m) => m.type === settings.cash.method) : undefined;
  const via = settings?.cash.label === 'cash' || !method ? t('via_cash') : t(VIA[method.type] ?? 'via_cash');
  const money = (base: number) => formatPrice(convert(base), currentCurrency);
  return { on: on && !!settings, settings, method, countryCode: country.code, money, via, t, locale };
}

export function usePriceView(place: PricePlace, amount: number | null | undefined): PriceCtx {
  const r = usePriceRules();
  const value = Number(amount) || 0;
  const view = r.on && r.settings && value > 0
    ? priceView(value, r.settings, place, { cashPct: cashDiscountFor(r.method, r.countryCode, value), countryCode: r.countryCode })
    : null;
  return { view, settings: r.settings, money: r.money, via: r.via, t: r.t, locale: r.locale };
}

/** O número grande. Com o destaque "parcela": "3x R$ 30,00" e, pequeno ao lado, sem juros ou com juros. */
export function PriceMain({ ctx, className, labelClassName }: { ctx: PriceCtx; className?: string; labelClassName?: string }) {
  const v = ctx.view!;
  if (v.highlight === 'installment' && v.installment) {
    const i = v.installment;
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        <span className={cn('whitespace-nowrap', className)}>
          <span aria-hidden="true">{i.n}x </span><span aria-hidden="true">{ctx.money(i.value)}</span>
          <span className="sr-only">{ctx.t('inst_main_sr', { n: i.n, value: ctx.money(i.value) })}</span>
        </span>
        <span className={cn('font-semibold', i.free ? 'text-emerald-700' : 'text-muted-foreground', labelClassName)}>{ctx.t(i.free ? 'inst_main_free' : 'inst_main_interest')}</span>
      </span>
    );
  }
  if (v.highlight === 'cash' && v.cash) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        <span className={cn('whitespace-nowrap', className)}>{ctx.money(v.cash.amount)}</span>
        <span className={cn('font-semibold text-emerald-700', labelClassName)}>{ctx.via}</span>
      </span>
    );
  }
  return <span className={className}>{ctx.money(v.main)}</span>;
}

/** Linhas abaixo do preço. size: product (página do produto), card (cartões e barra), cart. */
export function PriceExtras({ ctx, size = 'product', className }: { ctx: PriceCtx; size?: 'product' | 'card'; className?: string }) {
  const v = ctx.view;
  const s = ctx.settings;
  if (!v || !s) return null;
  const discreet = v.style === 'discreet';
  const lines: React.ReactNode[] = [];
  const inst = v.installment;
  const instText = inst ? ctx.t(inst.free ? 'inst_free' : 'inst_interest', { n: inst.n, value: ctx.money(inst.value) }) : null;
  const text = size === 'card' ? 'text-[12px]' : 'text-[14px]';

  if (v.highlight === 'card') {
    if (v.cash) lines.push(<CashLine key="cash" ctx={ctx} discreet={discreet} size={size} />);
    if (instText && !(discreet && v.cash)) lines.push(<span key="inst" className={cn(text, 'text-muted-foreground')}>{instText}</span>);
  } else if (v.highlight === 'cash') {
    const full = inst
      ? ctx.t(inst.free ? 'or_full_inst' : 'or_full_inst_interest', { price: ctx.money(v.full), n: inst.n, value: ctx.money(inst.value) })
      : ctx.t('or_full', { price: ctx.money(v.full) });
    lines.push(<span key="full" className={cn(text, 'text-muted-foreground')}>{full}</span>);
    if (!discreet && s.cash.badge && v.cash) lines.push(<Badge key="pct" text={ctx.t('cash_pct', { pct: fmtPct(v.cash.pct, ctx.locale) })} size={size} />);
  } else if (v.highlight === 'installment' && inst) {
    lines.push(<span key="total" className={cn(text, 'text-muted-foreground')}>{ctx.t('full_price', { price: ctx.money(v.full) })}</span>);
    if (v.cash) lines.push(<CashLine key="cash" ctx={ctx} discreet={discreet} size={size} />);
  }
  if (!discreet && s.cash.savings && v.cash && size === 'product') {
    lines.push(<span key="save" className={cn(text, 'font-semibold text-emerald-700')}>{ctx.t('savings', { amount: ctx.money(v.cash.savings) })}</span>);
  }
  if (!lines.length) return null;
  return <span className={cn('flex flex-col gap-0.5 leading-snug tabular-nums', size === 'product' ? 'mt-2 gap-1' : 'mt-0.5', className)}>{lines}</span>;
}

function CashLine({ ctx, discreet, size }: { ctx: PriceCtx; discreet: boolean; size: 'product' | 'card' }) {
  const c = ctx.view!.cash!;
  const text = ctx.t('cash_line', { price: ctx.money(c.amount), via: ctx.via });
  if (discreet) return <span className={cn(size === 'card' ? 'text-[12px]' : 'text-[14px]', 'text-muted-foreground')}>{text}</span>;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-emerald-700', size === 'card' ? 'text-[12.5px]' : 'text-[15px]')}>
      {size === 'product' && <QrCode className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />}
      {text}
      {ctx.settings?.cash.badge && <Badge text={ctx.t('cash_pct_short', { pct: fmtPct(c.pct, ctx.locale) })} size={size} />}
    </span>
  );
}

function Badge({ text, size }: { text: string; size: 'product' | 'card' }) {
  return <span className={cn('w-fit rounded-md bg-emerald-50 font-bold text-emerald-700', size === 'card' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-[12px]')}>{text}</span>;
}

const fmtPct = (n: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);

/** "Ver parcelas" (página do produto, quando a loja ligou a tabela): cartão que abre uma lista alinhada, sem juros em destaque. */
export function InstallmentTable({ amount }: { amount: number }) {
  const r = usePriceRules();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!r.on || !r.settings || amount <= 0) return null;
  const s = r.settings.installments;
  if (!s.table || !installmentsServe(s, r.countryCode) || !r.settings.places.product.enabled) return null;
  const plan = installmentPlan(amount, s);
  if (plan.length < 2) return null;
  const last = plan[plan.length - 1];
  const bestFree = [...plan].reverse().find((p) => p.free && p.n > 1);
  return (
    <div className="mt-3 overflow-hidden rounded-[16px] border border-brand-card-border bg-white">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF0E7] text-brand-orange-text">
          <CreditCard className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-tight">{r.t(open ? 'table_hide' : 'table_show')}</span>
          <span className="block text-[12.5px] leading-tight text-muted-foreground tabular-nums">
            {r.t('table_summary', { n: (bestFree ?? last).n, value: r.money((bestFree ?? last).value) })}{bestFree ? ` ${r.t('table_free')}` : ''}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <div id={id} className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden" {...(open ? {} : { inert: true })}>
          <div className="border-t border-brand-card-border">
            <p className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{r.t('table_title')}</p>
            <ul className="px-2 pb-2 text-[14px] tabular-nums">
              {plan.map((p) => (
                <li key={p.n} className={cn('grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-3 rounded-[10px] px-2 py-2', p.free ? 'bg-emerald-50/70' : '')}>
                  <span className={cn('font-bold', p.free ? 'text-emerald-800' : 'text-foreground')}>{p.n}x</span>
                  <span className="font-semibold">{r.money(p.value)}</span>
                  {p.free ? (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[12px] font-bold text-emerald-800">{r.t('table_free')}</span>
                  ) : (
                    <span className="text-right text-[12.5px] leading-tight text-muted-foreground">
                      <span className="block">{r.t('table_interest')}</span>
                      <span className="block">{r.t('inst_total', { total: r.money(p.total) })}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="border-t border-brand-card-border px-4 py-2.5 text-[12px] text-muted-foreground">{r.t('table_note')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Carrinho, carrinho lateral e checkout: valor dos produtos no meio com desconto e a parcela, abaixo do total.
 * amount = produtos com imposto e já com o cupom (a mesma base do desconto do meio no servidor), na moeda base.
 */
export function CartPriceHint({ amount, place = 'cart', className }: { amount: number; place?: 'cart' | 'checkout'; className?: string }) {
  const ctx = usePriceView(place, amount);
  const v = ctx.view;
  if (!v || (!v.cash && !v.installment)) return null;
  const discreet = v.style === 'discreet';
  const inst = v.installment;
  if (place === 'checkout') {
    if (!v.cash) return null;
    return <p className={cn('text-[13px] text-emerald-700', className)}>{ctx.t('checkout_cash', { via: ctx.via, price: ctx.money(v.cash.amount) })}</p>;
  }
  return (
    <div className={cn('space-y-0.5 text-right text-[13px] tabular-nums', className)}>
      {v.cash && (
        <p className={cn(discreet ? 'text-muted-foreground' : 'font-semibold text-emerald-700')}>
          {ctx.t('cart_cash', { via: ctx.via })}: {ctx.money(v.cash.amount)}
          {!discreet && ctx.settings?.cash.badge && <> <Badge text={ctx.t('cash_pct_short', { pct: fmtPct(v.cash.pct, ctx.locale) })} size="card" /></>}
        </p>
      )}
      {inst && !(discreet && v.cash) && (
        <p className="text-muted-foreground">{ctx.t(inst.free ? 'cart_inst' : 'cart_inst_interest', { n: inst.n, value: ctx.money(inst.value) })}</p>
      )}
    </div>
  );
}
