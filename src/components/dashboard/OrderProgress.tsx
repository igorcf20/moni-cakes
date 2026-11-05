// =====================================================================================
// Linha do andamento do pedido (área do cliente): Pedido feito > Pagamento > Produção > Envio (ou Pronto para
// retirar) > Entregue, com a etapa atual em destaque e as datas conhecidas. Pedidos cancelados ou reembolsados
// não mostram a linha (o selo do estado já diz tudo). Estados em src/components/dashboard/ui.tsx (StatusBadge).
// =====================================================================================
import { Check } from 'lucide-react';
import { useMessages } from '@/i18n';
import { accountMessages } from '@/i18n/account';
import { cn } from '@/lib/utils';
import { PROGRESS_STEP } from './accountUtils';

type ProgressOrder = {
  status: string;
  created_at: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  delivery_methods?: { type?: string | null } | null;
};

export default function OrderProgress({ order, compact = false, className }: { order: ProgressOrder; compact?: boolean; className?: string }) {
  const { t, locale } = useMessages(accountMessages);
  const current = PROGRESS_STEP[order.status];
  if (current === undefined) return null;
  const pickup = order.status === 'ready_for_pickup' || order.delivery_methods?.type === 'pickup';
  const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : null);
  const steps = [
    { label: t('prog_placed'), date: date(order.created_at) },
    { label: t('prog_paid'), date: null },
    { label: t('prog_production'), date: null },
    { label: pickup ? t('prog_pickup') : t('prog_shipped'), date: date(order.shipped_at) },
    { label: t('prog_delivered'), date: date(order.delivered_at) },
  ];
  // Concluído = todas as etapas feitas; senão a etapa atual fica "em curso".
  const finished = current === steps.length - 1;

  return (
    <div className={className}>
      <p className="sr-only">{t('prog_now', { label: steps[current].label })}</p>
      <ol aria-label={t('prog_label')} className="grid grid-cols-5 gap-1">
        {steps.map((s, i) => {
          const done = i < current || (finished && i === current);
          const now = i === current && !finished;
          return (
            <li key={i} className="min-w-0" aria-current={i === current ? 'step' : undefined}>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors duration-200',
                    done && 'bg-primary text-primary-foreground',
                    now && 'bg-white text-primary ring-2 ring-primary',
                    !done && !now && 'bg-brand-alt text-muted-foreground',
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : i + 1}
                </span>
                {i < steps.length - 1 && (
                  <span className={cn('h-[3px] flex-1 rounded-full', i < current ? 'bg-primary' : 'bg-brand-alt')} aria-hidden="true" />
                )}
              </div>
              <p
                className={cn(
                  'mt-1.5 truncate pr-1 text-[12px] leading-tight',
                  now ? 'font-semibold text-foreground' : done ? 'text-brand-ink-soft' : 'text-muted-foreground',
                  'hidden sm:block',
                )}
                title={s.label}
              >
                {s.label}
              </p>
              {!compact && s.date && (done || now) && <p className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">{s.date}</p>}
            </li>
          );
        })}
      </ol>
      {/* No celular os rótulos não cabem: só a etapa atual, por extenso. */}
      <p className="mt-1.5 text-[13px] font-semibold text-foreground sm:hidden" aria-hidden="true">
        {t('prog_now', { label: steps[current].label })}
        {!compact && steps[current].date && <span className="font-normal text-muted-foreground"> · {steps[current].date}</span>}
      </p>
    </div>
  );
}
