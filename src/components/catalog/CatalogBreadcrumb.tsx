import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useMessages } from '@/i18n';
import { catalogMessages } from '@/i18n/catalog';
import type { Crumb } from './listing';

/** Trilho de navegação das listagens (o último item é a página atual). No celular, links com 44px de altura. */
export function CatalogBreadcrumb({ items }: { items: Crumb[] }) {
  const { t } = useMessages(catalogMessages);
  return (
    <nav aria-label={t('breadcrumb')} className="-my-2 text-[13px] text-muted-foreground md:my-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />}
              {c.href && !last ? (
                <Link to={c.href} className="inline-flex min-h-[44px] items-center rounded-md transition-colors duration-150 hover:text-brand-orange-text md:min-h-0 md:py-1">{c.label}</Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="truncate py-1 font-medium text-foreground">{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
