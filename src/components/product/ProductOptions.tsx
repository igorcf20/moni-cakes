// Opções de compra da página do produto: cor (swatches circulares), tamanho, quantidade [-] 1 [+] e tabela de escalões.
import { useEffect, useState } from 'react';
import { Check, Layers, Minus, Plus } from 'lucide-react';
import type { ColorOption, SizeOption } from '@/hooks/useProductPage';
import { useMessages } from '@/i18n';
import { productMessages } from '@/i18n/product';
import { cn } from '@/lib/utils';

const optionLabel = 'mb-2.5 flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-foreground';

/** Cores reais do produto em círculos de 44px; esgotadas ficam riscadas e não podem ser escolhidas. */
export function ColorSwatches({ options, selectedKey, onSelect, formatModifier }: {
  options: ColorOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  formatModifier: (mod: number) => string | null;
}) {
  const { t } = useMessages(productMessages);
  const selected = options.find((o) => o.key === selectedKey) ?? null;
  const selectedMod = selected ? formatModifier(selected.modifier) : null;
  return (
    <fieldset data-option="color">
      <legend className={optionLabel}>
        {t('color')}
        {selected && <span className="font-normal text-brand-ink-soft">{selected.name}{selectedMod ? ` (${selectedMod})` : ''}</span>}
      </legend>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => {
          const active = o.key === selectedKey;
          const mod = formatModifier(o.modifier);
          const label = o.soldOut ? t('soldOutOption', { name: o.name }) : mod ? `${o.name} (${mod})` : o.name;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => { if (!o.soldOut) onSelect(o.key); }}
              aria-pressed={active}
              aria-disabled={o.soldOut || undefined}
              aria-label={label}
              title={label}
              className={cn(
                'relative grid h-11 w-11 place-items-center rounded-full border-2 p-[3px] transition-[border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'border-primary' : 'border-transparent hover:border-border',
                o.soldOut ? 'cursor-not-allowed opacity-50' : 'active:scale-95',
              )}
            >
              <span
                className="relative grid h-full w-full place-items-center overflow-hidden rounded-full bg-brand-alt text-[11px] font-bold uppercase text-brand-ink-soft ring-1 ring-inset ring-black/10"
                style={o.hex ? { backgroundColor: o.hex } : undefined}
              >
                {!o.hex && o.image && <img src={o.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                {!o.hex && !o.image && o.name.slice(0, 2)}
              </span>
              {o.soldOut && <span className="pointer-events-none absolute h-[2px] w-[120%] rotate-45 rounded-full bg-foreground/70" aria-hidden="true" />}
              {active && (
                <span className="absolute -right-0.5 -top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-white" aria-hidden="true">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Tamanhos (P / M / G ou medidas reais), com acréscimo de preço quando houver. Indisponível (matriz) e esgotado (stock) são distintos. */
export function SizeOptions({ options, selectedId, onSelect, formatModifier }: {
  options: SizeOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  formatModifier: (mod: number) => string | null;
}) {
  const { t } = useMessages(productMessages);
  const selected = options.find((o) => o.id === selectedId && o.purchasable) ?? null;
  return (
    <fieldset data-option="size">
      <legend className={optionLabel}>
        {t('size')}
        {selected && <span className="font-normal text-brand-ink-soft">{selected.label}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.id === selected?.id;
          const mod = formatModifier(o.modifier);
          const label = o.purchasable ? (mod ? `${o.label} (${mod})` : o.label) : !o.available ? t('unavailableOption', { name: o.label }) : t('soldOutOption', { name: o.label });
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => { if (o.purchasable) onSelect(o.id); }}
              aria-pressed={active}
              aria-disabled={!o.purchasable || undefined}
              aria-label={label}
              title={o.purchasable ? undefined : label}
              className={cn(
                'flex min-h-[44px] min-w-[56px] flex-col items-center justify-center rounded-xl border px-4 py-1.5 text-[15px] font-semibold leading-tight transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active && 'border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow-orange)]',
                !active && o.purchasable && 'border-border bg-white text-foreground hover:border-primary hover:text-brand-orange-text active:scale-[0.97]',
                !o.purchasable && 'cursor-not-allowed border-border bg-brand-alt text-muted-foreground line-through decoration-1',
              )}
            >
              <span>{o.label}</span>
              {o.purchasable && mod && <span className={cn('text-[11px] font-medium', active ? 'text-primary-foreground/90' : 'text-muted-foreground')}>{mod}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Quantidade [-] 1 [+]; aceita digitar, com limite entre min e max. */
export function QuantityStepper({ value, onChange, min = 1, max = 9999, id }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; id?: string;
}) {
  const { t } = useMessages(productMessages);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    const next = Number.isFinite(n) ? clamp(n) : value;
    onChange(next);
    setDraft(String(next));
  };
  const btn = 'grid h-12 w-12 place-items-center text-foreground transition-colors duration-150 hover:bg-brand-alt hover:text-brand-orange-text disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';
  return (
    <div className="inline-flex h-12 items-stretch overflow-hidden rounded-full border border-border bg-white">
      <button type="button" className={btn} onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={t('decrease')}>
        <Minus className="h-4 w-4" strokeWidth={2} />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + 1)); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - 1)); }
        }}
        aria-label={t('quantity')}
        className="w-14 border-x border-border bg-transparent text-center text-[16px] font-semibold tabular-nums text-foreground outline-none focus-visible:bg-brand-alt"
      />
      <button type="button" className={btn} onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={t('increase')}>
        <Plus className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

export type TierRow = { id: string; min: number; label: string; price: string; active: boolean };

/** Preço por quantidade: o escalão em vigor fica destacado; tocar numa linha escolhe essa quantidade. */
export function TierTable({ rows, onPick }: { rows: TierRow[]; onPick: (min: number) => void }) {
  const { t } = useMessages(productMessages);
  return (
    <div className="rounded-[18px] border border-brand-card-border bg-white p-2">
      <p className="flex items-center gap-2 px-2.5 pb-1.5 pt-2 text-sm font-semibold text-foreground">
        <Layers className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('tiersTitle')}
      </p>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onPick(r.min)}
              aria-current={r.active ? 'true' : undefined}
              aria-label={`${r.label}: ${r.price} ${t('perUnit')}`}
              title={r.min === 1 ? t('tierPick_one') : t('tierPick', { count: r.min })}
              className={cn(
                'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-2.5 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                r.active ? 'bg-accent text-foreground' : 'text-brand-ink-soft hover:bg-brand-alt',
              )}
            >
              <span className="flex items-center gap-2">
                {r.label}
                {r.active && <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">{t('tierActive')}</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-foreground">{r.price}</span>{' '}
                <span className="text-xs text-muted-foreground">{t('perUnit')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
