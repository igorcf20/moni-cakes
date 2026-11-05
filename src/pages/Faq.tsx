// Perguntas frequentes (/faq): perguntas da PRINT3D por grupo (os ids dos grupos servem de âncora, ex. /faq#envios),
// busca dentro das perguntas e respostas (também por ?q=), filtro por tema e JSON-LD FAQPage no idioma atual.
// Perguntas escritas no Admin > Perguntas frequentes (site_faqs, useSiteFaqs) entram no grupo com o mesmo nome ou num
// grupo novo; grupos padrão podem ser escondidos no Admin (faq_settings.hiddenGroups).
// Respostas honestas: prazos e preços só como "normalmente" ou "estimado"; países e documento fiscal vêm da configuração.
import { STORE_DEFAULTS } from "@/config/store";
import { useHrefOn } from "@/hooks/useFeatures";
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import {
  ArrowRight, CreditCard, HelpCircle, Layers, Mail, MessageCircle, PackageCheck, RotateCcw, Search, SearchX, Truck, UserRound, X, type LucideIcon,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { LayerArt } from '@/components/MediaImage';
import { PageShell, PageIntro } from '@/components/institutional/ui';
import { btnPrimary, card, linkInline, reveal } from '@/components/institutional/styles';
import { chip, chipActive, chipIdle } from '@/components/catalog/ui';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useTaxIdRules } from '@/hooks/useTaxIdRules';
import { useVisualSettings } from '@/hooks/useVisualSettings';
import { useSiteFaqs } from '@/hooks/useSiteFaqs';
import { useMessages } from '@/i18n';
import { faqMessages } from '@/i18n/pages';
import { countryName, useCountries } from '@/lib/countries';
import { cn } from '@/lib/utils';

type FK = keyof typeof faqMessages['pt-BR'];
/** Pergunta padrão (textos q_<id> / a_<id> no i18n) ou da loja (q / a escritos no Admin). */
type Item = { id: string; link?: { to: string; label: FK }; q?: string; a?: string };
type Group = { id: string; title: FK; Icon: LucideIcon; items: Item[]; label?: string };

const contact = { to: '/contatos', label: 'link_contact' } as const;
const GROUPS: Group[] = [
  {
    id: 'produtos', title: 'g_products', Icon: Layers,
    items: [{ id: 'mat_how' }, { id: 'mat_pla' }, { id: 'mat_other', link: { to: '/orcamento-3d', label: 'link_quote' } }, { id: 'mat_colors' }, { id: 'mat_layers' }, { id: 'mat_strength', link: contact }, { id: 'mat_food' }],
  },
  {
    id: 'pedidos', title: 'g_orders', Icon: PackageCheck,
    items: [
      { id: 'ord_stock' }, { id: 'ord_time' }, { id: 'ord_custom', link: { to: '/personalizar', label: 'link_customizer' } },
      { id: 'ord_file', link: { to: '/orcamento-3d', label: 'link_quote' } }, { id: 'ord_change', link: contact }, { id: 'ord_bulk', link: contact },
    ],
  },
  { id: 'envios', title: 'g_shipping', Icon: Truck, items: [{ id: 'shp_where' }, { id: 'shp_time' }, { id: 'shp_cost' }, { id: 'shp_track', link: { to: '/rastrear', label: 'link_track' } }] },
  { id: 'pagamento', title: 'g_payment', Icon: CreditCard, items: [{ id: 'pay_methods' }, { id: 'pay_safe' }, { id: 'pay_tax' }, { id: 'pay_invoice' }] },
  {
    id: 'devolucoes', title: 'g_returns', Icon: RotateCcw,
    items: [{ id: 'ret_how', link: { to: '/devolucoes', label: 'link_returns' } }, { id: 'ret_custom', link: { to: '/devolucoes', label: 'link_returns' } }, { id: 'ret_damaged', link: contact }],
  },
  {
    id: 'conta', title: 'g_account', Icon: UserRound,
    items: [
      { id: 'acc_need' }, { id: 'acc_password', link: { to: '/auth', label: 'link_auth' } },
      { id: 'acc_orders', link: { to: '/dashboard?tab=pedidos', label: 'link_orders' } }, { id: 'acc_data', link: { to: '/dashboard?tab=privacidade', label: 'link_privacy' } },
    ],
  },
];

const slug = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const Faq = () => {
  const { t, locale } = useMessages(faqMessages);
  const hrefOn = useHrefOn();
  const { data: info } = useStoreInfo();
  const { data: visual } = useVisualSettings();
  const { data: countries } = useCountries();
  const tax = useTaxIdRules();
  const { data: own } = useSiteFaqs();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [active, setActive] = useState<string | null>(null);

  const name = info?.name || STORE_DEFAULTS.name;
  const wa = visual?.plugins?.whatsapp;
  const waDigits = (wa?.phone || '').replace(/\D/g, '');
  const waUrl = wa?.enabled !== false && waDigits.length >= 8 ? `https://wa.me/${waDigits}` : null;

  // Países de entrega ativos (tabela countries), escritos no idioma atual.
  const shipList = useMemo(() => {
    const names = (countries ?? []).map((c) => countryName(c.code, locale));
    if (!names.length) return '';
    try {
      // Intl.ListFormat fica fora do lib ES2020 do TypeScript, mas existe em todos os navegadores atuais.
      return new (Intl as any).ListFormat(locale, { type: 'conjunction' }).format(names) as string;
    } catch {
      return names.join(', ');
    }
  }, [countries, locale]);

  // Grupos padrão visíveis + perguntas da loja (no grupo com o mesmo nome ou num grupo novo, pela ordem do Admin).
  const groups = useMemo<Group[]>(() => {
    const hidden = new Set(own?.settings.hiddenGroups ?? []);
    const list: Group[] = GROUPS.filter((g) => !hidden.has(g.id)).map((g) => ({ ...g, items: [...g.items] }));
    for (const f of own?.faqs ?? []) {
      if (f.locale && f.locale !== locale) continue;
      const key = slug(f.category) || 'mais';
      let g = list.find((x) => x.id === key || slug(t(x.title)) === key || slug(x.label ?? '') === key);
      if (!g) {
        g = { id: `mais-${key}`, title: 'g_products', label: f.category.trim(), Icon: HelpCircle, items: [] };
        list.push(g);
      }
      g.items.push({ id: `own-${f.id}`, q: f.question, a: f.answer });
    }
    return list.filter((g) => g.items.length);
  }, [own, locale, t]);
  const groupTitle = (g: Group) => g.label || t(g.title);

  const answer = (id: string) => {
    const mine = groups.flatMap((g) => g.items).find((it) => it.id === id);
    if (mine?.a) return mine.a;
    if (id === 'pay_invoice') return tax.enabled ? t('a_pay_invoice', { doc: tax.label }) : t('a_pay_invoice_none');
    const base = t(`a_${id}` as FK);
    return id === 'shp_where' && shipList ? `${base} ${t('shipCountries', { list: shipList })}` : base;
  };
  const question = (id: string) => groups.flatMap((g) => g.items).find((it) => it.id === id)?.q ?? t(`q_${id}` as FK);

  const terms = useMemo(() => norm(query).split(/\s+/).filter(Boolean), [query]);
  const matches = (it: Item) => !terms.length || terms.every((w) => norm(`${question(it.id)} ${answer(it.id)}`).includes(w));
  const filtered = groups.map((g) => ({ ...g, items: g.items.filter(matches) }));
  const visible = filtered.filter((g) => g.items.length && (!active || g.id === active));
  const total = visible.reduce((s, g) => s + g.items.length, 0);

  const updateQuery = (value: string) => {
    setQuery(value);
    const next = new URLSearchParams(params);
    if (value.trim()) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const title = `${t('seoTitle')} | ${name}`;
  const description = t('seoDescription', { name });
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: groups.flatMap((g) => g.items).map((it) => ({
      '@type': 'Question',
      name: question(it.id),
      acceptedAnswer: { '@type': 'Answer', text: answer(it.id) },
    })),
  });

  return (
    <PageShell>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${origin}/faq`} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${origin}/faq`} />
        <script type="application/ld+json">{jsonLd}</script>
      </Helmet>

      <div className="shell">
        <PageIntro crumbs={[{ label: t('home'), href: '/' }, { label: t('breadcrumb') }]} kicker={t('eyebrow')} title={t('title')} lead={t('lead')}>
          <form role="search" className="relative mt-7 max-w-xl" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="faq-search" className="sr-only">{t('searchLabel')}</label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <input
              id="faq-search" type="search" value={query} onChange={(e) => updateQuery(e.target.value)} placeholder={t('searchPh')} autoComplete="off"
              className="h-14 w-full rounded-[14px] border border-border bg-white pl-12 pr-14 text-[16px] shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--shadow-ring-royal)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" aria-label={t('clearSearch')} onClick={() => updateQuery('')} className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-[12px] text-muted-foreground transition-colors duration-150 hover:bg-brand-alt hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            )}
          </form>
          <p aria-live="polite" className="mt-3 min-h-[20px] text-[14px] text-muted-foreground">
            {terms.length ? (total === 1 ? t('results_one') : t('results_other', { count: total })) : ''}
          </p>
        </PageIntro>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:mt-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label={t('topics')} className="min-w-0 lg:sticky lg:top-[100px] lg:self-start">
            <p className="mb-3 hidden text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">{t('topics')}</p>
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6 lg:mx-0 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-0">
              {[null, ...groups].map((g) => {
                const on = active === (g?.id ?? null);
                const count = g ? filtered.find((f) => f.id === g.id)!.items.length : filtered.reduce((s, f) => s + f.items.length, 0);
                const Icon = g?.Icon;
                return (
                  <li key={g?.id ?? 'all'} className="shrink-0">
                    <button
                      type="button" aria-pressed={on} onClick={() => setActive(g?.id ?? null)}
                      className={cn(chip, on ? chipActive : chipIdle, 'w-full justify-between gap-3 lg:justify-start')}
                    >
                      <span className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                        {g ? groupTitle(g) : t('all')}
                      </span>
                      <span className={cn('text-[12px] tabular-nums lg:ml-auto', on ? 'text-white/85' : 'text-muted-foreground')}>{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0">
            {visible.length === 0 ? (
              <div className={cn(card, 'px-6 py-12 text-center')}>
                <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-[20px]"><LayerArt Icon={SearchX} /></div>
                <h2 className="mt-6 text-[24px] font-bold tracking-[-0.03em]">{t('emptyTitle')}</h2>
                <p className="mx-auto mt-2 max-w-md text-[16px] text-muted-foreground">{terms.length ? t('emptyQuery', { q: query.trim() }) : t('emptyTopic')}</p>
                <button type="button" className={cn(btnPrimary, 'mt-7')} onClick={() => { updateQuery(''); setActive(null); }}>{t('showAll')}</button>
              </div>
            ) : (
              <div className="space-y-10">
                {visible.map((g) => (
                  <section key={g.id} id={g.id} aria-labelledby={`faq-${g.id}`} className="scroll-mt-28">
                    <h2 id={`faq-${g.id}`} className="mb-4 flex items-center gap-3 text-[24px] font-bold tracking-[-0.03em] md:text-[28px]">
                      <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-accent text-primary"><g.Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
                      {groupTitle(g)}
                    </h2>
                    <Accordion
                      key={terms.join(' ')}
                      type="multiple"
                      defaultValue={terms.length ? g.items.map((it) => it.id) : []}
                      className={cn(card, 'divide-y divide-border overflow-hidden')}
                    >
                      {g.items.map((it) => (
                        <AccordionItem key={it.id} value={it.id} className="border-b-0 px-5 sm:px-6">
                          <AccordionTrigger className="min-h-[56px] gap-4 py-4 text-left text-[16px] font-semibold leading-snug hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>svg]:text-muted-foreground [&[data-state=open]>svg]:text-primary">
                            {question(it.id)}
                          </AccordionTrigger>
                          <AccordionContent className="pb-5 text-[15px] leading-relaxed text-brand-ink-soft md:text-[16px]">
                            <p>{answer(it.id)}</p>
                            {it.link && hrefOn(it.link.to) && (
                              <Link to={it.link.to} className={cn(linkInline, 'mt-3 inline-flex min-h-[44px] items-center gap-1.5 md:min-h-0')}>
                                {t(it.link.label)}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </section>
                ))}
              </div>
            )}

            <motion.div {...reveal()} className="mt-12 grid gap-5 rounded-[24px] bg-brand-alt p-7 md:grid-cols-[1fr_auto] md:items-center md:p-9">
              <div>
                <h2 className="text-[24px] font-bold tracking-[-0.03em] md:text-[28px]">{t('helpTitle')}</h2>
                <p className="mt-1.5 text-[16px] text-brand-ink-soft">{t('helpText')}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link to="/contatos" className={btnPrimary}><Mail className="h-[18px] w-[18px]" aria-hidden="true" />{t('helpCta')}</Link>
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-6 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <MessageCircle className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('whatsapp')}<span className="sr-only">({t('newWindow')})</span>
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default Faq;
