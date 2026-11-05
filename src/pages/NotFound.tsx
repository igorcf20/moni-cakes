// Página não encontrada (404): ilustração de camadas, busca de produtos (/produtos?q=), categorias e atalhos.
import { STORE_DEFAULTS } from "@/config/store";
import { useHrefOn } from "@/hooks/useFeatures";
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, HelpCircle, House, MessageSquareText, PackageSearch, Search, SearchX, ShoppingBag, Upload, Wand2, type LucideIcon } from 'lucide-react';
import { LayerArt } from '@/components/MediaImage';
import { PageShell } from '@/components/institutional/ui';
import { appear, btnPrimary, btnSecondary, card, eyebrow, h1 } from '@/components/institutional/styles';
import { chip, chipIdle } from '@/components/catalog/ui';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { notFoundMessages } from '@/i18n/pages';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { cn } from '@/lib/utils';

type NK = keyof typeof notFoundMessages['pt-BR'];
const LINKS: [LucideIcon, NK, string][] = [
  [Wand2, 'linkCustom', '/personalizar'],
  [Upload, 'linkQuote', '/orcamento-3d'],
  [HelpCircle, 'linkFaq', '/faq'],
  [PackageSearch, 'linkTrack', '/rastrear'],
  [MessageSquareText, 'linkContact', '/contatos'],
];

const NotFound = () => {
  const { t } = useMessages(notFoundMessages);
  const hrefOn = useHrefOn();
  const menu = useCatalogMenu();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: info } = useStoreInfo();
  const [q, setQ] = useState('');
  const name = info?.name || STORE_DEFAULTS.name;
  // "Voltar" só quando a página anterior é do próprio site (aberta pelo link direto, sairia da loja).
  const canGoBack = location.key !== 'default';

  useEffect(() => {
    console.error('404: rota inexistente:', location.pathname);
  }, [location.pathname]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/produtos?q=${encodeURIComponent(term)}` : '/produtos');
  };

  return (
    <PageShell>
      <Helmet>
        <title>{`${t('seoTitle')} | ${name}`}</title>
        <meta name="robots" content="noindex,follow" />
      </Helmet>

      <div className="shell pt-6 md:pt-10">
        <motion.section {...appear()} className={cn(card, 'overflow-hidden')} aria-labelledby="nf-title">
          <div className="grid items-center md:grid-cols-[1fr_1.1fr]">
            <div className="relative order-first aspect-[16/10] md:order-last md:aspect-auto md:h-full md:min-h-[420px]">
              <LayerArt Icon={SearchX} size="lg" />
              <span className="pointer-events-none absolute left-1/2 top-[14%] hidden -translate-x-1/2 select-none text-[110px] font-extrabold leading-none tracking-[-0.06em] text-foreground/[0.06] md:block" aria-hidden="true">404</span>
            </div>
            <div className="p-6 sm:p-10 lg:p-12">
              <p className={eyebrow}>{t('code')}</p>
              <h1 id="nf-title" className={cn(h1, 'mt-3')}>{t('title')}</h1>
              <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-brand-ink-soft">{t('text')}</p>
              <p className="mt-3 flex max-w-lg flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {t('address')}:
                <code className="max-w-full truncate rounded-lg bg-brand-alt px-2 py-1 font-mono text-[12px] text-foreground">{location.pathname}</code>
              </p>

              <form role="search" onSubmit={search} className="mt-7 flex flex-col gap-2 sm:flex-row">
                <label htmlFor="nf-search" className="sr-only">{t('searchLabel')}</label>
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
                  <input
                    id="nf-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPh')} autoComplete="off"
                    className="h-12 w-full rounded-[14px] border border-border bg-white pl-12 pr-4 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--shadow-ring-royal)]"
                  />
                </div>
                <button type="submit" className={btnPrimary}>{t('search')}</button>
              </form>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link to="/" className={btnSecondary}><House className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('home')}</Link>
                <Link to="/produtos" className={btnSecondary}><ShoppingBag className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('products')}</Link>
              </div>
              {canGoBack && (
                <button
                  type="button" onClick={() => navigate(-1)}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[14px] font-medium text-muted-foreground transition-colors duration-150 hover:text-brand-orange-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('back')}
                </button>
              )}
            </div>
          </div>
        </motion.section>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <motion.section {...appear(1)} aria-labelledby="nf-cats">
            <h2 id="nf-cats" className="text-[22px] font-bold tracking-[-0.02em]">{t('categories')}</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {menu.map((c) => (
                <li key={c.slug}>
                  <Link to={`/categoria/${c.slug}`} className={cn(chip, chipIdle, 'pl-2.5')}>
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-orange-soft text-primary"><c.Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
          <motion.section {...appear(2)} aria-labelledby="nf-links">
            <h2 id="nf-links" className="text-[22px] font-bold tracking-[-0.02em]">{t('linksTitle')}</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {LINKS.filter(([, , to]) => hrefOn(to)).map(([Icon, k, to]) => (
                <li key={to}>
                  <Link to={to} className="group flex min-h-[52px] items-center gap-3 rounded-[14px] border border-brand-card-border bg-white px-4 text-[15px] font-semibold transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Icon className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />
                    <span className="flex-1">{t(k)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>
      </div>
    </PageShell>
  );
};

export default NotFound;
