// Página legal comum (privacidade, termos, devoluções) no visual PRINT3D.
// O texto vem de src/legal/<jurisdição>.ts conforme o país atual; a moldura (título, índice, avisos e botões)
// vem de src/i18n/legal.ts no idioma da interface. Dados da loja via useStoreInfo, sem morada.
// Com uma versão publicada no Admin > Páginas da loja (site_pages, idioma do visitante), o texto da loja substitui o
// texto automático (título, abertura e corpo); a moldura, o contato e os outros documentos continuam.
import { STORE_DEFAULTS } from "@/config/store";
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { MotionConfig, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, ArrowUp, CalendarDays, Check, ChevronDown, Cookie, Copy, ExternalLink, FileText, Info, Languages,
  LifeBuoy, ListOrdered, Mail, MapPin, RotateCcw, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { CatalogBreadcrumb } from '@/components/catalog/CatalogBreadcrumb';
import { btnPrimary, btnSecondary } from '@/components/catalog/ui';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useSitePage } from '@/hooks/useSitePages';
import SiteHtml from '@/components/SiteHtml';
import { hasHtmlText } from '@/lib/sitePages';
import { LOCALE_NAMES, useMessages, type Locale } from '@/i18n';
import { legalMessages } from '@/i18n/legal';
import { countryName, useCountry } from '@/lib/countries';
import { openConsentPreferences } from '@/lib/consent';
import { activeTools } from '@/lib/privacy';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';
import { cn } from '@/lib/utils';
import { legalPackFor } from './index';
import { isEU } from './shared';
import type { LegalBlock, LegalContext, LegalDocKind, LegalSection, Maybe } from './types';

type LK = keyof (typeof legalMessages)['pt-BR'];

const DOCS: Record<LegalDocKind, { path: string; title: LK; lead: LK; meta: LK; Icon: LucideIcon }> = {
  privacy: { path: '/politica-privacidade', title: 'privacy_title', lead: 'privacy_lead', meta: 'privacy_meta', Icon: ShieldCheck },
  terms: { path: '/termos', title: 'terms_title', lead: 'terms_lead', meta: 'terms_meta', Icon: FileText },
  returns: { path: '/devolucoes', title: 'returns_title', lead: 'returns_lead', meta: 'returns_meta', Icon: RotateCcw },
};
const ORDER: LegalDocKind[] = ['privacy', 'terms', 'returns'];

const EASE = [0.16, 1, 0.3, 1] as const;
const appear = (i = 0) => ({
  initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: EASE, delay: i * 0.05 },
});

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const linkCls = cn(
  'rounded-[4px] font-semibold text-brand-orange-text underline decoration-brand-orange-text/35 underline-offset-[3px] transition-colors duration-150 [overflow-wrap:anywhere] hover:decoration-current',
  focusRing,
);
const cardCls = 'rounded-[20px] border border-brand-card-border bg-white';

const present = <T,>(items: Maybe<T>[]): T[] => items.filter(Boolean) as T[];

function languageName(lang: Locale, ui: Locale): string {
  try {
    return new Intl.DisplayNames([ui], { type: 'language' }).of(lang) ?? LOCALE_NAMES[lang];
  } catch {
    return LOCALE_NAMES[lang];
  }
}

function formatDate(iso: string, locale: Locale): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Põe o foco no título da secção (depois do salto pela âncora), sem novo scroll. */
const focusHeading = (id: string) => {
  requestAnimationFrame(() => document.getElementById(`${id}-h`)?.focus({ preventScroll: true }));
};

/* ---------- texto rico: **negrito** e [rótulo](destino) ---------- */

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

function RichLink({ label, href }: { label: string; href: string }) {
  const { t, locale } = useMessages(legalMessages);
  // Só os destinos documentados em types.ts; o resto (javascript:, //outro-site...) fica como texto simples.
  if (href.startsWith('/') && !href.startsWith('//')) return <Link to={href} className={linkCls}>{label}</Link>;
  if (href.startsWith('#')) {
    return <Link to={{ hash: href }} replace onClick={() => focusHeading(href.slice(1))} className={linkCls}>{label}</Link>;
  }
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {label}<span className="sr-only" lang={locale}> ({t('newTab')})</span>
      </a>
    );
  }
  if (/^(mailto|tel):/i.test(href)) return <a href={href} className={linkCls}>{label}</a>;
  return <>{label}</>;
}

function Rich({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        }
        const m = LINK.exec(part);
        if (m) return <RichLink key={i} label={m[1]} href={m[2]} />;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/* ---------- blocos ---------- */

function TemplateBlock({ title, text }: { title: string; text: string }) {
  const { t, locale } = useMessages(legalMessages);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t('copied'));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyError'));
    }
  };
  return (
    <figure className="overflow-hidden rounded-[16px] border border-brand-card-border bg-brand-alt">
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-card-border bg-white px-4 py-2.5 sm:px-5">
        <span className="text-[15px] font-semibold text-foreground">{title}</span>
        <button
          type="button" onClick={copy} lang={locale}
          className={cn('inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-border bg-white px-4 text-[14px] font-semibold text-foreground transition-colors duration-150 hover:border-foreground/30', focusRing)}
        >
          {copied ? <Check className="h-4 w-4 text-primary" strokeWidth={2} aria-hidden="true" /> : <Copy className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />}
          {t('copy')}
        </button>
      </figcaption>
      <pre className="whitespace-pre-wrap break-words px-4 py-4 font-sans text-[15px] leading-[1.7] text-foreground sm:px-5">{text}</pre>
    </figure>
  );
}

function CookieButton() {
  const { t, locale } = useMessages(legalMessages);
  return (
    <div>
      <button type="button" lang={locale} onClick={openConsentPreferences} className={btnSecondary}>
        <Cookie className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />
        {t('manageCookies')}
      </button>
    </div>
  );
}

function ResourceLinks({ items }: { items: { label: string; text?: string; href?: string }[] }) {
  const { t, locale } = useMessages(legalMessages);
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((l) => {
        let host = '';
        try { host = l.href ? new URL(l.href).host : ''; } catch { host = ''; }
        const body = (
          <>
            <span className="flex items-center gap-2 text-[16px] font-semibold leading-snug text-foreground">
              {l.label}
              {l.href && <ExternalLink className="h-4 w-4 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />}
            </span>
            {l.text && <span className="mt-1 block text-[14px] leading-relaxed text-muted-foreground">{l.text}</span>}
            {host && <span className="mt-2 block text-[13px] font-semibold text-brand-orange-text">{host}</span>}
          </>
        );
        return (
          <li key={l.label}>
            {l.href ? (
              <a
                href={l.href} target="_blank" rel="noopener noreferrer"
                className={cn('block h-full rounded-[16px] border border-brand-card-border bg-background p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-[var(--shadow-hover)]', focusRing)}
              >
                {body}<span className="sr-only" lang={locale}> ({t('newTab')})</span>
              </a>
            ) : (
              <div className="h-full rounded-[16px] border border-brand-card-border bg-background p-4">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'p':
      return <p><Rich text={block.text} /></p>;
    case 'list': {
      const items = present(block.items);
      if (!items.length) return null;
      if (block.ordered) {
        return (
          <ol className="space-y-3">
            {items.map((it, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden="true" className="mt-[2px] grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-accent text-[13px] font-bold tabular-nums text-brand-orange-text">{i + 1}</span>
                <span className="min-w-0"><Rich text={it} /></span>
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0"><Rich text={it} /></span>
            </li>
          ))}
        </ul>
      );
    }
    case 'note':
      return (
        <div role="note" className="flex gap-3 rounded-[16px] border border-primary/20 bg-accent/70 p-4 text-foreground sm:p-5">
          <Info className="mt-[3px] h-5 w-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
          <p className="min-w-0"><Rich text={block.text} /></p>
        </div>
      );
    case 'facts': {
      const items = present(block.items);
      return (
        <dl className="overflow-hidden rounded-[16px] border border-brand-card-border">
          {items.map((f) => (
            <div key={f.label} className="grid gap-0.5 border-b border-brand-card-border bg-background px-4 py-3 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4 sm:px-5">
              <dt className="text-[14px] leading-[1.7] text-muted-foreground">{f.label}</dt>
              <dd className="font-medium text-foreground [overflow-wrap:anywhere]"><Rich text={f.value} /></dd>
            </div>
          ))}
        </dl>
      );
    }
    case 'entities': {
      const items = present(block.items);
      return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((e) => (
            <li key={e.name} className="rounded-[16px] border border-brand-card-border bg-background p-4">
              <p className="text-[16px] font-semibold leading-snug text-foreground">{e.name}</p>
              {e.place && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{e.place}</p>}
              <p className="mt-2 text-[15px] leading-relaxed"><Rich text={e.text} /></p>
            </li>
          ))}
        </ul>
      );
    }
    case 'links':
      return <ResourceLinks items={present(block.items)} />;
    case 'template':
      return <TemplateBlock title={block.title} text={block.text} />;
    case 'cookieSettings':
      return <CookieButton />;
    default:
      return null;
  }
}

function SectionCard({ section, index }: { section: LegalSection; index: number }) {
  const blocks = present(section.blocks);
  return (
    <section id={section.id} aria-labelledby={`${section.id}-h`} className={cn(cardCls, 'scroll-mt-4 p-5 sm:p-7 lg:scroll-mt-8 lg:p-9')}>
      <h2 id={`${section.id}-h`} tabIndex={-1} className="flex items-start gap-3 text-[22px] font-bold leading-snug tracking-[-0.02em] text-foreground outline-none md:text-[26px]">
        <span aria-hidden="true" className="mt-[2px] grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent text-[14px] font-bold tabular-nums tracking-normal text-brand-orange-text md:mt-[3px]">{index + 1}</span>
        <span className="min-w-0">{section.title}</span>
      </h2>
      <div className="mt-5 max-w-[72ch] space-y-4 text-[16px] leading-[1.7] text-brand-ink-soft md:text-[17px]">
        {blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>
    </section>
  );
}

/* ---------- índice ---------- */

/** Secção visível no topo da janela, para destacar no índice. */
function useActiveSection(ids: string[]) {
  const key = ids.join('|');
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const list = key ? key.split('|') : [];
    setActive(list[0] ?? null);
    if (!list.length || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
        const first = list.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-150px 0px -55% 0px' },
    );
    list.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [key]);
  return active;
}

function TocList({ sections, active, lang, onPick }: { sections: LegalSection[]; active: string | null; lang: Locale; onPick?: () => void }) {
  return (
    <ol lang={lang} className="space-y-0.5">
      {sections.map((s, i) => {
        const on = active === s.id;
        return (
          <li key={s.id}>
            <Link
              to={{ hash: `#${s.id}` }} replace aria-current={on ? 'location' : undefined}
              onClick={() => { onPick?.(); focusHeading(s.id); }}
              className={cn(
                'flex min-h-[44px] items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-[14px] leading-snug transition-colors duration-150 lg:min-h-[40px] lg:py-2',
                focusRing,
                on ? 'bg-accent font-semibold text-foreground' : 'text-brand-ink-soft hover:bg-brand-alt hover:text-foreground',
              )}
            >
              <span aria-hidden="true" className={cn('w-5 shrink-0 tabular-nums', on ? 'text-brand-orange-text' : 'text-muted-foreground')}>{i + 1}</span>
              <span className="min-w-0">{s.title}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function OtherDocs({ kind, className }: { kind: LegalDocKind; className?: string }) {
  const { t } = useMessages(legalMessages);
  const items: { to: string; label: string; Icon: LucideIcon }[] = [
    ...ORDER.filter((k) => k !== kind).map((k) => ({ to: DOCS[k].path, label: t(DOCS[k].title), Icon: DOCS[k].Icon })),
  ];
  return (
    <nav aria-label={t('otherDocs')} className={cn(cardCls, 'p-4', className)}>
      <p className="px-2 pt-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('otherDocs')}</p>
      <ul className="mt-2 grid gap-1 md:grid-cols-2">
        {items.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link to={to} className={cn('group flex min-h-[48px] items-center gap-3 rounded-[12px] px-2 text-[15px] font-medium text-foreground transition-colors duration-150 hover:bg-brand-alt', focusRing)}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent text-primary">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">{label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ArticleSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only" role="status">{label}</span>
      <div className="space-y-3 px-1">
        <div className="skeleton h-5 w-full rounded" />
        <div className="skeleton h-5 w-4/5 rounded" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn(cardCls, 'p-5 sm:p-7 lg:p-9')}>
          <div className="skeleton h-7 w-1/2 rounded-lg" />
          <div className="mt-6 space-y-3">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-11/12 rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- página ---------- */

export function LegalPage({ kind }: { kind: LegalDocKind }) {
  const { t, locale } = useMessages(legalMessages);
  const { data: info, isLoading: infoLoading, failureCount } = useStoreInfo();
  const country = useCountry();
  const privacy = usePrivacySettings();
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const tocRef = useRef<HTMLDetailsElement>(null);
  // Skeleton só no primeiro pedido dos dados da loja: se falhar, o texto aparece já com os valores de reserva
  // (sem esperar pelas novas tentativas do React Query) e atualiza quando os dados chegarem.
  const { page: custom, isLoading: customLoading } = useSitePage(kind);
  const isLoading = (infoLoading && failureCount === 0) || customLoading;
  const waitedRef = useRef(isLoading);

  const pack = legalPackFor(country.code);
  const meta = DOCS[kind];
  const store = (info?.name || '').trim() || STORE_DEFAULTS.name;
  const email = (info?.email || '').trim();
  const phone = (info?.phone || '').trim();
  const taxId = (info?.nif || '').trim();

  const doc = useMemo(() => {
    const ctx: LegalContext = { store, email, phone, taxId, country, eu: isEU(country.code), tools: activeTools(privacy), consentMonths: privacy.consentMonths };
    if (custom) return { intro: [], sections: [] };
    const d = pack.docs[kind](ctx);
    return { intro: present(d.intro), sections: present(d.sections) };
  }, [pack, kind, store, email, phone, taxId, country, privacy, custom]);

  const active = useActiveSection(isLoading ? [] : doc.sections.map((s) => s.id));

  // Link com âncora (ex.: /termos#personalizados aberto num separador novo pelo checkout): se o texto só apareceu
  // depois de o ScrollToTop desistir de procurar a secção, salta para ela quando o skeleton sai.
  useEffect(() => {
    if (isLoading) { waitedRef.current = true; return; }
    if (!waitedRef.current) return;
    waitedRef.current = false;
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ''; }
    if (!id) return;
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(raf);
  }, [isLoading, location.hash]);

  const title = custom?.title || t(meta.title);
  const description = custom?.seo_description || custom?.intro || t(meta.meta, { store });
  const lead = custom?.intro || t(meta.lead, { store });
  const updated = custom ? custom.updated_at.slice(0, 10) : pack.updated;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}${meta.path}`;
  const count = doc.sections.length;
  const countLabel = count === 1 ? t('sections_one') : t('sections_other', { count });

  return (
    <MotionConfig reducedMotion="user">
      <Helmet>
        <title>{`${title} | ${store}`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={store} />
        <meta property="og:title" content={`${title} | ${store}`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
      </Helmet>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main id="conteudo" className="flex-1 pb-16 md:pb-20">
          <div className="shell pt-5 md:pt-8">
            <CatalogBreadcrumb items={[{ label: t('home'), href: '/' }, { label: t('help'), href: '/ajuda' }, { label: title }]} />

            <motion.header {...appear()} className="mt-6 max-w-3xl md:mt-8">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-orange-text">{t('eyebrow')}</p>
              <h1 id="legal-title" className="mt-3 text-[34px] font-extrabold leading-[1.06] tracking-[-0.035em] [text-wrap:balance] sm:text-[44px] lg:text-[52px]">{title}</h1>
              <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-brand-ink-soft md:text-lg">{lead}</p>
              <ul className="mt-6 flex flex-wrap gap-2 text-[14px] text-brand-ink-soft">
                <li className="inline-flex min-h-[36px] items-center gap-2 rounded-[12px] border border-brand-card-border bg-white px-3.5">
                  <CalendarDays className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                  {t('updated', { date: formatDate(updated, locale) })}
                </li>
                {!custom && <li className="inline-flex min-h-[36px] items-center gap-2 rounded-[12px] border border-brand-card-border bg-white px-3.5">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                  {t('appliesTo', { country: countryName(country.code, locale) })}
                </li>}
              </ul>
              {!custom && <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{t('changeCountry')}</p>}
            </motion.header>

            {!custom && pack.lang !== locale && (
              <motion.div {...appear(1)} role="note" className="mt-5 flex max-w-2xl items-start gap-3 rounded-[16px] border border-primary/20 bg-accent/70 p-4 text-[15px] leading-relaxed text-foreground">
                <Languages className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                <p>{t('langNotice', { language: languageName(pack.lang, locale) })}</p>
              </motion.div>
            )}

            <div className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
              <aside className="hidden lg:block">
                {!isLoading && count > 0 && (
                  <nav aria-label={t('toc')} className={cn(cardCls, 'sticky top-[100px] max-h-[calc(100vh-120px)] overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]')}>
                    <p className="px-3 pb-2 pt-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('toc')}</p>
                    <TocList sections={doc.sections} active={active} lang={pack.lang} />
                  </nav>
                )}
              </aside>

              <div className="min-w-0 max-w-[820px]">
                {!isLoading && count > 0 && (
                  <details ref={tocRef} className={cn(cardCls, 'group mb-5 lg:hidden')}>
                    <summary className={cn('flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 rounded-[20px] px-5 text-[16px] font-semibold [&::-webkit-details-marker]:hidden', focusRing)}>
                      <span className="flex items-center gap-2.5">
                        <ListOrdered className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />
                        {t('toc')}
                      </span>
                      <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                        {countLabel}
                        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                    </summary>
                    <div className="border-t border-brand-card-border p-2">
                      <TocList sections={doc.sections} active={active} lang={pack.lang} onPick={() => { if (tocRef.current) tocRef.current.open = false; }} />
                    </div>
                  </details>
                )}

                {isLoading ? (
                  <ArticleSkeleton label={t('loading')} />
                ) : custom ? (
                  hasHtmlText(custom.body) && (
                    <article lang={custom.locale} aria-labelledby="legal-title" className={cn(cardCls, 'p-5 sm:p-7 lg:p-9')}>
                      <SiteHtml html={custom.body!} />
                    </article>
                  )
                ) : (
                  <article lang={pack.lang} aria-labelledby="legal-title" className="space-y-4">
                    {doc.intro.length > 0 && (
                      <div className="max-w-[72ch] space-y-4 px-1 pb-2 text-[17px] leading-[1.7] text-foreground md:text-[18px]">
                        {doc.intro.map((p, i) => <p key={i}><Rich text={p} /></p>)}
                      </div>
                    )}
                    {doc.sections.map((s, i) => <SectionCard key={s.id} section={s} index={i} />)}
                  </article>
                )}

                {!isLoading && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })}
                      className={cn('inline-flex min-h-[44px] items-center gap-2 rounded-[12px] px-3 text-[14px] font-semibold text-brand-ink-soft transition-colors duration-150 hover:bg-brand-alt hover:text-foreground', focusRing)}
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                      {t('backToTop')}
                    </button>
                  </div>
                )}

                <section aria-labelledby="legal-contact" className="mt-6 grid gap-5 rounded-[24px] bg-brand-alt p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-center">
                  <div>
                    <h2 id="legal-contact" className="text-[24px] font-bold leading-tight tracking-[-0.03em] md:text-[28px]">{t('contactTitle')}</h2>
                    <p className="mt-1.5 text-[16px] leading-relaxed text-brand-ink-soft">{t('contactText')}</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link to="/contatos" className={btnPrimary}>
                      <Mail className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                      {t('contactCta')}
                    </Link>
                    <Link to="/ajuda" className={btnSecondary}>
                      <LifeBuoy className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />
                      {t('helpCenter')}
                    </Link>
                  </div>
                </section>

                <OtherDocs kind={kind} className="mt-6" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
