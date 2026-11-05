// Central de ajuda (/ajuda): busca nas perguntas frequentes (abre /faq?q=), cartões para FAQ, rastreio, trocas e
// devoluções, termos, privacidade, contato, conta e cookies, e os dados da loja que o Admin preencheu (sem morada).
import { STORE_DEFAULTS } from "@/config/store";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { ArrowRight, Cookie, FileText, HelpCircle, Mail, MessageSquareText, PackageSearch, Phone, RotateCcw, Search, ShieldCheck, Store, UserRound, type LucideIcon } from 'lucide-react';
import { PageShell, PageIntro } from '@/components/institutional/ui';
import { card, h3, reveal } from '@/components/institutional/styles';
import { useAuth } from '@/hooks/useAuth';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { helpMessages } from '@/i18n/pages';
import { openConsentPreferences } from '@/lib/consent';
import { cn } from '@/lib/utils';

type HK = keyof typeof helpMessages['pt-BR'];
type Topic = { key: string; Icon: LucideIcon; title: HK; text: HK; to?: string; onClick?: () => void; cta?: HK };

const tileCls = cn(card, 'group flex h-full flex-col p-6 text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2');

function TopicBody({ Icon, title, text, cta }: { Icon: LucideIcon; title: string; text: string; cta?: string }) {
  return (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-accent text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
          <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
        {!cta && <ArrowRight className="mt-1 h-5 w-5 text-muted-foreground transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />}
      </span>
      <span className={cn(h3, 'mt-5 block')}>{title}</span>
      <span className="mt-1.5 block flex-1 text-[15px] leading-relaxed text-muted-foreground">{text}</span>
      {cta && (
        <span className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-brand-orange-text">
          {cta}<ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      )}
    </>
  );
}

const HelpAndTerms = () => {
  const { t } = useMessages(helpMessages);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: info } = useStoreInfo();
  const [q, setQ] = useState('');

  const name = info?.name || STORE_DEFAULTS.name;
  const email = (info?.email || '').trim();
  const phone = (info?.phone || '').trim();
  const taxId = (info?.nif || '').trim();
  const hasStoreData = !!(email || phone || taxId);

  const topics: Topic[] = [
    { key: 'faq', Icon: HelpCircle, title: 'faqTitle', text: 'faqText', to: '/faq' },
    { key: 'track', Icon: PackageSearch, title: 'trackTitle', text: 'trackText', to: '/rastrear' },
    { key: 'returns', Icon: RotateCcw, title: 'returnsTitle', text: 'returnsText', to: '/devolucoes' },
    { key: 'contact', Icon: MessageSquareText, title: 'contactTitle', text: 'contactText', to: '/contatos' },
    { key: 'account', Icon: UserRound, title: 'accountTitle', text: 'accountText', to: user ? '/dashboard' : '/auth?redirect=/dashboard' },
    { key: 'terms', Icon: FileText, title: 'termsTitle', text: 'termsText', to: '/termos' },
    { key: 'privacy', Icon: ShieldCheck, title: 'privacyTitle', text: 'privacyText', to: '/politica-privacidade' },
    { key: 'cookies', Icon: Cookie, title: 'cookiesTitle', text: 'cookiesText', onClick: openConsentPreferences, cta: 'cookiesCta' },
  ];

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/faq?q=${encodeURIComponent(term)}` : '/faq');
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const title = `${t('seoTitle')} | ${name}`;

  return (
    <PageShell>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={t('seoDescription', { name })} />
        <link rel="canonical" href={`${origin}/ajuda`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={t('seoDescription', { name })} />
      </Helmet>

      <div className="shell">
        <PageIntro crumbs={[{ label: t('home'), href: '/' }, { label: t('breadcrumb') }]} kicker={t('eyebrow')} title={t('title')} lead={t('lead')}>
          <form role="search" onSubmit={search} className="mt-7 flex max-w-xl flex-col gap-2 sm:flex-row">
            <label htmlFor="help-search" className="sr-only">{t('searchLabel')}</label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
              <input
                id="help-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPh')} autoComplete="off"
                className="h-14 w-full rounded-[14px] border border-border bg-white pl-12 pr-4 text-[16px] shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--shadow-ring-royal)]"
              />
            </div>
            <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)] transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {t('search')}
            </button>
          </form>
        </PageIntro>

        <section aria-labelledby="help-topics" className="mt-10 md:mt-14">
          <h2 id="help-topics" className="sr-only">{t('topicsTitle')}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {topics.map(({ key, Icon, title: tk, text, to, onClick, cta }, i) => (
              <motion.li key={key} {...reveal(i)}>
                {to ? (
                  <Link to={to} className={tileCls}><TopicBody Icon={Icon} title={t(tk)} text={t(text)} cta={cta && t(cta)} /></Link>
                ) : (
                  <button type="button" onClick={onClick} className={cn(tileCls, 'w-full')}><TopicBody Icon={Icon} title={t(tk)} text={t(text)} cta={cta && t(cta)} /></button>
                )}
              </motion.li>
            ))}
          </ul>
        </section>

        {hasStoreData && (
          <motion.section {...reveal()} aria-labelledby="help-store" className={cn(card, 'mt-10 p-6 sm:p-8')}>
            <h2 id="help-store" className="flex items-center gap-3 text-[22px] font-bold tracking-[-0.02em]">
              <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-brand-alt text-brand-ink-soft"><Store className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
              {t('storeTitle')}
            </h2>
            <dl className="mt-5 grid gap-4 text-[15px] sm:grid-cols-3">
              <div>
                <dt className="font-semibold">{name}</dt>
                {taxId && <dd className="mt-1 text-muted-foreground">{t('storeTaxId', { value: taxId })}</dd>}
              </div>
              {email && (
                <div>
                  <dt className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('storeEmail')}</dt>
                  <dd className="mt-1"><a href={`mailto:${email}`} className="break-all text-muted-foreground transition-colors duration-150 hover:text-brand-orange-text">{email}</a></dd>
                </div>
              )}
              {phone && (
                <div>
                  <dt className="flex items-center gap-2 font-semibold"><Phone className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('storePhone')}</dt>
                  <dd className="mt-1"><a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="text-muted-foreground transition-colors duration-150 hover:text-brand-orange-text">{phone}</a></dd>
                </div>
              )}
            </dl>
          </motion.section>
        )}
      </div>
    </PageShell>
  );
};

export default HelpAndTerms;
