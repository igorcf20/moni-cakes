// Ajudas das listas do Admin: iniciais do avatar, formatação de dinheiro e datas na moeda base da loja (não na moeda que o
// administrador escolheu no seletor de país do site) e paginação no navegador.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/i18n';
import { useCurrency } from '@/hooks/use-currency';
import { formatMoney } from '@/lib/money';

export function useAdminFormat() {
  const locale = useLocale((s) => s.locale);
  const currency = useCurrency((s) => s.baseCurrency);
  const money = useCallback((v: number | string | null | undefined) => formatMoney(Number(v || 0), currency, locale), [currency, locale]);
  const date = useCallback(
    (v: string | Date | null | undefined) => (v ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v)) : ''),
    [locale],
  );
  const dateTime = useCallback(
    (v: string | Date | null | undefined) =>
      v ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : '',
    [locale],
  );
  /** "há 3 dias", "ontem"... para datas recentes. */
  const relative = useCallback(
    (v: string | Date | null | undefined) => {
      if (!v) return '';
      const days = Math.round((new Date(v).getTime() - Date.now()) / 86_400_000);
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      if (Math.abs(days) < 1) {
        const hours = Math.round((new Date(v).getTime() - Date.now()) / 3_600_000);
        return rtf.format(hours, 'hour');
      }
      if (Math.abs(days) < 45) return rtf.format(days, 'day');
      if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month');
      return rtf.format(Math.round(days / 365), 'year');
    },
    [locale],
  );
  return { locale, currency, money, date, dateTime, relative };
}

/** Paginação simples; volta à página 1 quando a lista muda de tamanho (filtro novo). */
export function usePaged<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => setPage(1), [items.length]);
  const current = Math.min(page, pages);
  const slice = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);
  return {
    page: current,
    pages,
    setPage,
    items: slice,
    total: items.length,
    from: items.length ? (current - 1) * pageSize + 1 : 0,
    to: Math.min(current * pageSize, items.length),
  };
}

/** Iniciais para o avatar do cliente ("Ana Souza" -> "AS"). */
export const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
