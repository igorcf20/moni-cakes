// Garantias da compra na página do produto (Admin > Aparência da loja > Página do produto, store_settings.product_page.trust):
// cartão com título e explicação por linha, ou lista curta (discreta). Só com dados reais: envio, prazo de produção ou data
// de saída, devolução pelo prazo do recurso Devoluções, compra segura e os meios de pagamento ativos no país.
// Também a linha de disponibilidade (Em estoque, Últimas unidades, Feito sob encomenda) e o botão Compartilhar.
import { Share2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import PaymentMethods from '@/components/PaymentMethods';
import { useMessages } from '@/i18n';
import { productPageMessages } from '@/i18n/productPage';
import type { Availability, ProductPageTrustStyle } from '@/lib/productPage';
import { cn } from '@/lib/utils';

export type TrustRow = { key: string; Icon: LucideIcon; title: string; text?: string | null };

export function ProductTrust({ rows, style, payments, className }: {
  rows: TrustRow[]; style: ProductPageTrustStyle; payments: boolean; className?: string;
}) {
  const { t } = useMessages(productPageMessages);
  if (!rows.length) return null;
  if (style === 'list') {
    return (
      <div className={cn('border-t border-border pt-6', className)}>
        <ul aria-label={t('trustTitle')} className="grid grid-cols-2 gap-x-4 gap-y-4">
          {rows.map(({ key, Icon, title }) => (
            <li key={key} className="flex items-center gap-3 text-[13.5px] leading-snug text-brand-ink-soft">
              <Icon className="h-6 w-6 shrink-0 text-foreground" strokeWidth={1.4} aria-hidden="true" />{title}
            </li>
          ))}
        </ul>
        {payments && <PaymentMethods className="mt-5" />}
      </div>
    );
  }
  return (
    <section aria-label={t('trustTitle')} className={cn('overflow-hidden rounded-[18px] border border-brand-card-border bg-white', className)}>
      <ul className="divide-y divide-border">
        {rows.map(({ key, Icon, title, text }) => (
          <li key={key} className="flex items-start gap-3.5 px-4 py-3.5 sm:px-5">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-alt text-foreground">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold leading-snug text-foreground">{title}</span>
              {text && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{text}</span>}
            </span>
          </li>
        ))}
      </ul>
      {payments && (
        <div className="border-t border-border bg-background/60 px-4 py-3.5 sm:px-5">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('trustPayments')}</p>
          <PaymentMethods />
        </div>
      )}
    </section>
  );
}

/** Linha curta perto do preço: ponto colorido e o texto. */
export function AvailabilityLine({ value, time, className }: { value: Availability | null; time?: string | null; className?: string }) {
  const { t } = useMessages(productPageMessages);
  if (!value) return null;
  const text = value.kind === 'in_stock' ? t('avInStock')
    : value.kind === 'low' ? (value.count === 1 ? t('avLow_one') : t('avLow_other', { count: value.count }))
    : time ? t('avMadeToOrderTime', { time }) : t('avMadeToOrder');
  const dot = value.kind === 'in_stock' ? 'bg-emerald-600' : value.kind === 'low' ? 'bg-primary' : 'bg-foreground/40';
  return (
    <p className={cn('flex items-center gap-2 text-[14px] font-medium', value.kind === 'low' ? 'text-brand-orange-text' : value.kind === 'in_stock' ? 'text-emerald-700' : 'text-brand-ink-soft', className)}>
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        {value.kind === 'in_stock' && <span className="absolute inset-0 rounded-full bg-emerald-500/40 motion-safe:animate-ping [animation-duration:2.4s]" />}
        <span className={cn('relative h-2.5 w-2.5 rounded-full', dot)} />
      </span>
      {text}
    </p>
  );
}

/** Compartilhar: menu do aparelho quando existe (celular), senão copia o link. */
export function ShareButton({ name, url, className }: { name: string; url: string; className?: string }) {
  const { t } = useMessages(productPageMessages);
  const share = async () => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try { await nav.share({ title: name, url }); } catch { /* o cliente fechou o menu */ }
      return;
    }
    try {
      await nav?.clipboard?.writeText(url);
      toast.success(t('shareCopied'), { id: 'pdp-share' });
    } catch {
      toast.error(t('shareError'), { id: 'pdp-share' });
    }
  };
  return (
    <button
      type="button" onClick={() => void share()} aria-label={t('shareAria', { name })} title={t('share')}
      className={cn('inline-flex min-h-[44px] items-center gap-2 rounded-full px-3 text-[14px] font-medium text-brand-ink-soft transition-colors duration-150 hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      <Share2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      <span className="hidden sm:inline">{t('share')}</span>
    </button>
  );
}
