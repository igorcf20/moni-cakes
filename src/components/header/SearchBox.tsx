import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, ImageOff, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { pgValue } from '@/lib/postgrestFilter';
import { useCurrency } from '@/hooks/use-currency';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { cn } from '@/lib/utils';
import { hasConsent } from '@/lib/consent';

// Buscas recentes = categoria Preferências do aviso de cookies: só guardadas com esse consentimento
// (retirar o consentimento apaga-as; ver src/lib/consent.ts).
const RECENT_KEY = 'print3d-recent-searches';
const readRecent = (): string[] => { if (!hasConsent('preferences')) return []; try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 5); } catch { return []; } };
const saveRecent = (q: string) => {
  if (!hasConsent('preferences')) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5))); } catch { /* navegador sem armazenamento */ }
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Option = { id: string; kind: 'recent' | 'category' | 'product'; label: string; href?: string; query?: string; image?: string | null; price?: string; sub?: string };

/** Busca com autocomplete: produtos com miniatura e preço, categorias e histórico recente. Setas + Enter. */
/** `compact`: campo estreito do cabeçalho editorial (sem botão Buscar: Enter busca; sugestões numa caixa mais larga). */
export function SearchBox({ autoFocus = false, onDone, className, compact = false }: { autoFocus?: boolean; onDone?: () => void; className?: string; compact?: boolean }) {
  const { t } = useMessages(layoutMessages);
  const navigate = useNavigate();
  const menu = useCatalogMenu();
  const { currentCurrency, convert } = useCurrency();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const term = q.trim();

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const { data: products = [], isFetching } = useQuery({
    queryKey: ['header-search', term],
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const like = `%${term}%`;
      const { data, error } = await (supabase as any).from('products').select('id,name,image,price,vat_rate,category').eq('is_active', true)
        .or(`name.ilike.${pgValue(like)},description.ilike.${pgValue(like)},category.ilike.${pgValue(like)}`).limit(5);
      if (error) throw error;
      return data || [];
    },
  });

  const options = useMemo<Option[]>(() => {
    if (term.length < 2) {
      const rec = recent.map((r, i) => ({ id: `r${i}`, kind: 'recent' as const, label: r, query: r }));
      const cats = menu.map((c) => ({ id: `c-${c.slug}`, kind: 'category' as const, label: c.name, href: `/categoria/${c.slug}` }));
      return [...rec, ...cats];
    }
    const n = norm(term);
    const cats: Option[] = [];
    for (const c of menu) {
      if (norm(c.name).includes(n)) cats.push({ id: `c-${c.slug}`, kind: 'category', label: c.name, href: `/categoria/${c.slug}` });
      for (const s of c.subs) if (norm(s.label).includes(n)) cats.push({ id: `s-${c.slug}-${s.id}`, kind: 'category', label: s.label, sub: c.name, href: s.href });
    }
    const prods: Option[] = products.map((p: any) => ({
      id: `p-${p.id}`, kind: 'product', label: p.name, href: `/produto/${p.id}`, image: p.image,
      price: formatPrice(convert(withVat(Number(p.price || 0), p.vat_rate)), currentCurrency),
    }));
    return [...prods, ...cats.slice(0, 4)];
  }, [term, recent, products, menu, convert, currentCurrency]);

  const close = () => { setOpen(false); setActive(-1); onDone?.(); };
  const submit = (value = term) => {
    if (!value) return;
    saveRecent(value);
    setRecent(readRecent());
    setQ('');
    close();
    navigate(`/produtos?q=${encodeURIComponent(value)}`);
  };
  const choose = (o: Option) => {
    if (o.query) return submit(o.query);
    if (term) saveRecent(term);
    setQ('');
    close();
    if (o.href) navigate(o.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && options[active]) choose(options[active]); else submit(); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const groups: [Option['kind'], string][] = term.length < 2 ? [['recent', t('recent')], ['category', t('suggestedCategories')]] : [['product', t('productsLabel')], ['category', t('suggestedCategories')]];
  const show = open && (options.length > 0 || term.length >= 2);

  return (
    <div ref={box} className={cn('relative w-full', className)}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
        <input
          value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          placeholder={t('searchPlaceholder')} aria-label={t('search')} role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className={cn('w-full rounded-full border border-border bg-white pl-11 text-[15px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--shadow-ring-royal)]', compact ? 'h-11 pr-10 text-[14px]' : 'h-12 pr-28')}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label={t('clearRecent')} className={cn('absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary', compact ? 'right-1.5' : 'right-[92px]')}>
            <X className="h-4 w-4" />
          </button>
        )}
        {!compact && (
          <button type="submit" className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
            {t('search')}
          </button>
        )}
      </form>

      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }}
            className={cn('absolute top-[calc(100%+8px)] z-50 overflow-hidden rounded-[18px] border border-border bg-white shadow-[var(--shadow-elevated)]', compact ? 'right-0 w-[420px]' : 'inset-x-0')}
          >
            <ul id={listId} role="listbox" aria-label={t('search')} className="max-h-[70vh] overflow-y-auto p-2">
              {term.length >= 2 && !products.length && (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">{isFetching ? t('searching') : t('noResults')}</li>
              )}
              {groups.map(([kind, title]) => {
                const items = options.map((o, i) => ({ o, i })).filter((x) => x.o.kind === kind);
                if (!items.length) return null;
                return (
                  <li key={kind} role="presentation">
                    <div className="flex items-center justify-between px-3 pb-1 pt-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
                      {kind === 'recent' && (
                        <button type="button" className="text-xs font-medium text-brand-orange-text hover:underline" onClick={() => { try { localStorage.removeItem(RECENT_KEY); } catch { /* sem armazenamento */ } setRecent([]); }}>{t('clearRecent')}</button>
                      )}
                    </div>
                    <ul role="presentation" className={kind === 'category' && term.length < 2 ? 'flex flex-wrap gap-1.5 px-2 pb-2' : ''}>
                      {items.map(({ o, i }) => (
                        <li
                          key={o.id} id={`${listId}-${i}`} role="option" aria-selected={active === i}
                          onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                          className={cn(
                            'cursor-pointer transition-colors duration-150',
                            kind === 'category' && term.length < 2
                              ? cn('rounded-full border border-border px-3 py-1.5 text-sm', active === i ? 'border-primary bg-accent text-brand-orange-text' : 'bg-white')
                              : cn('flex items-center gap-3 rounded-xl px-2.5 py-2', active === i && 'bg-accent'),
                          )}
                        >
                          {kind === 'product' && (
                            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-secondary">
                              {o.image ? <img src={o.image} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-4 w-4 text-muted-foreground" />}
                            </span>
                          )}
                          {kind === 'recent' && <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                          {kind === 'category' && term.length < 2 ? o.label : (
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{o.label}</span>
                              {o.sub && <span className="block truncate text-xs text-muted-foreground">{o.sub}</span>}
                            </span>
                          )}
                          {o.price && <span className="shrink-0 text-sm font-semibold tabular-nums">{o.price}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            {term.length >= 2 && (
              <button type="button" onMouseDown={(e) => { e.preventDefault(); submit(); }} className="block w-full border-t border-border px-4 py-3 text-left text-sm font-semibold text-brand-orange-text hover:bg-accent">
                {t('seeAllResults')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
