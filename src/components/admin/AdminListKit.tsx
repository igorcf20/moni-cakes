// =====================================================================================
// Peças comuns das listas do Admin (Pedidos, Produtos, Clientes), para as três telas terem o mesmo jeito:
//   AdminStatCard  cartão com um número (pode ser um filtro clicável)
//   FilterChips    fila de filtros rápidos com contagem
//   AdminPager     paginação "1 a 20 de 54" com anterior / seguinte
// Textos em src/i18n/adminManage.ts.
// =====================================================================================
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMessages } from '@/i18n';
import { adminManageMessages } from '@/i18n/adminManage';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'warning' | 'danger' | 'success';

const TONE: Record<Tone, string> = {
  default: 'bg-primary/10 text-brand-orange-text',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-destructive/10 text-destructive',
  success: 'bg-emerald-50 text-emerald-700',
};

export function AdminStatCard({
  icon: Icon, label, value, hint, tone = 'default', active = false, onClick,
}: {
  icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone?: Tone; active?: boolean; onClick?: () => void;
}) {
  const body = (
    <>
      <span className={cn('hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid', TONE[tone])}>
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-xl font-bold tabular-nums [overflow-wrap:normal] leading-tight text-foreground sm:text-2xl">{value}</span>
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </>
  );
  const cls = cn(
    'flex min-h-[76px] items-center gap-3 rounded-[18px] border bg-card p-4 transition-colors duration-200',
    active && 'border-primary ring-1 ring-primary',
  );
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(cls, 'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
      {body}
    </button>
  );
}

export type ChipOption<T extends string> = { value: T; label: string; count?: number; tone?: 'warning' };

export function FilterChips<T extends string>({
  options, value, onChange, label,
}: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-foreground bg-foreground text-background' : 'bg-card text-foreground hover:border-foreground/40',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-xs font-semibold tabular-nums',
                  on ? 'bg-background/20 text-background' : o.tone === 'warning' && o.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AdminPager({
  page, pages, total, from, to, onPage,
}: { page: number; pages: number; total: number; from: number; to: number; onPage: (p: number) => void }) {
  const { t } = useMessages(adminManageMessages);
  if (total === 0) return null;
  return (
    <nav aria-label={t('pager')} className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{t('pager_range', { from, to, total })}</p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="min-h-10" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {t('pager_prev')}
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">{t('pager_page', { page, pages })}</span>
          <Button variant="outline" size="sm" className="min-h-10" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            {t('pager_next')} <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  );
}
