// Página do produto: "Compra única" ou "Assinar" com os planos do produto (recurso subscriptions). Cartões de rádio
// com o preço de cada forma; o desconto é conferido no servidor (priceItems). Na renovação (?renovar=<id>) mostra só a
// faixa da assinatura do cliente.
import { Check, Repeat } from 'lucide-react';
import { useMessages } from '@/i18n';
import { everyText, subscriptionsMessages } from '@/i18n/subscriptions';
import { subscriptionUnit, type SubscriptionPlan, type SubscriptionSettings } from '@/lib/subscriptions';
import { cn } from '@/lib/utils';

export function SubscribeOption({ plans, value, onChange, unitNet, fmt, settings }: {
  plans: SubscriptionPlan[];
  /** null = compra única; senão o id do plano. */
  value: string | null;
  onChange: (planId: string | null) => void;
  unitNet: number;
  fmt: (net: number) => string;
  settings: SubscriptionSettings;
}) {
  const { t } = useMessages(subscriptionsMessages);
  if (!plans.length) return null;
  const chosen = plans.find((p) => p.id === value) ?? null;
  const card = (active: boolean) => cn(
    'flex w-full items-start gap-3 rounded-[14px] border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150',
    active ? 'border-primary bg-brand-orange-soft/60 shadow-[0_0_0_1px_hsl(var(--primary))]' : 'border-border bg-card hover:border-foreground/30',
  );
  const dot = (active: boolean) => (
    <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', active ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')} aria-hidden="true">
      {active && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
  return (
    <fieldset data-option="subscription">
      <legend className="mb-2.5 text-[15px] font-semibold text-foreground">{t('buy_title')}</legend>
      <div className="space-y-2" role="radiogroup">
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={card(value === null)}>
          {dot(value === null)}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{t('once')}</span>
            <span className="block text-[13px] text-brand-ink-soft">{t('once_hint')}</span>
          </span>
          <span className="text-[15px] font-semibold tabular-nums">{fmt(unitNet)}</span>
        </button>
        {plans.map((p) => {
          const active = value === p.id;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={active} onClick={() => onChange(p.id)} className={card(active)}>
              {dot(active)}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold">
                  <Repeat className="h-4 w-4 text-brand-orange-text" strokeWidth={1.9} aria-hidden="true" />
                  {t('subscribe')} · {everyText(t, p.interval_unit, p.interval_count)}
                  {p.discount_percent > 0 && <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">{t('save', { pct: p.discount_percent })}</span>}
                </span>
                {p.min_cycles > 0 && <span className="block text-[13px] text-brand-ink-soft">{t('min_cycles', { n: p.min_cycles })}</span>}
              </span>
              <span className="text-right">
                {p.discount_percent > 0 && <span className="block text-[12px] text-brand-ink-soft line-through tabular-nums">{fmt(unitNet)}</span>}
                <span className="block text-[15px] font-semibold tabular-nums">{fmt(subscriptionUnit(unitNet, p.discount_percent))}</span>
              </span>
            </button>
          );
        })}
      </div>
      {chosen && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-brand-ink-soft">
          {[
            t('sub_hint'),
            settings.customer_pause ? t('sub_hint_pause') : '',
            settings.customer_cancel ? (chosen.min_cycles > 0 ? t('sub_hint_cancel_min', { n: chosen.min_cycles }) : t('sub_hint_cancel')) : '',
          ].filter(Boolean).join(' ')}
        </p>
      )}
    </fieldset>
  );
}
