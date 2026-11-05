// Sobre a loja (/sobre): história curta, como fazemos (#como-fazemos), ingredientes (#materiais),
// valores (#feito-a-mao) e chamada para o cardápio e o contato. Sem números, prémios nem morada inventados.
// Com uma versão publicada no Admin > Páginas da loja (site_pages, idioma do visitante), mostra o texto da loja
// no lugar deste (CustomAbout).
import { STORE_DEFAULTS } from "@/config/store";
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import {
  ArrowRight, BadgeCheck, CakeSlice, ChefHat, Flower2, Hand, Heart, Layers, MessageCircle, PackageCheck, Palette, Sparkles, Truck, Wand2, Wheat,
  type LucideIcon,
} from 'lucide-react';
import { MediaImage, LayerArt } from '@/components/MediaImage';
import { PageIntro, PageShell } from '@/components/institutional/ui';
import SiteHtml from '@/components/SiteHtml';
import { btnPrimary, btnSecondary, card, eyebrow, h1, h2, h3, reveal, appear } from '@/components/institutional/styles';
import { CatalogBreadcrumb } from '@/components/catalog/CatalogBreadcrumb';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useSitePage } from '@/hooks/useSitePages';
import { hasHtmlText, type SitePage } from '@/lib/sitePages';
import { useMessages } from '@/i18n';
import { aboutMessages } from '@/i18n/pages';
import { cn } from '@/lib/utils';

type T = ReturnType<typeof useMessages<typeof aboutMessages['pt-BR']>>['t'];
type K = Parameters<T>[0];

const POINTS: [LucideIcon, K][] = [[PackageCheck, 'point1'], [Wand2, 'point2'], [Hand, 'point3']];
const STEPS: [LucideIcon, K, K][] = [
  [MessageCircle, 'step1Title', 'step1Text'],
  [ChefHat, 'step2Title', 'step2Text'],
  [Sparkles, 'step3Title', 'step3Text'],
  [Truck, 'step4Title', 'step4Text'],
];
const MATERIALS: [LucideIcon, K, K][] = [
  [Wheat, 'matPlaTitle', 'matPlaText'],
  [CakeSlice, 'matPetgTitle', 'matPetgText'],
  [Flower2, 'matOtherTitle', 'matOtherText'],
];
const VALUES: [LucideIcon, K, K, string?][] = [
  [Palette, 'valDesignTitle', 'valDesignText'],
  [BadgeCheck, 'valQualityTitle', 'valQualityText'],
  [Wand2, 'valCustomTitle', 'valCustomText'],
  [Heart, 'valSustainTitle', 'valSustainText', 'feito-a-mao'],
];

function IconTile({ Icon, className }: { Icon: LucideIcon; className?: string }) {
  return (
    <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-accent text-primary', className)}>
      <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
    </span>
  );
}

/** Página Sobre escrita pela loja no Admin (título, abertura e texto rico). */
function CustomAbout({ page, name }: { page: SitePage; name: string }) {
  const { t } = useMessages(aboutMessages);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const heading = page.title || t('title');
  const title = `${page.title || t('seoTitle')} | ${name}`;
  const description = page.seo_description || page.intro || t('seoDescription', { name });
  return (
    <PageShell>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${origin}/sobre`} />
        <meta property="og:site_name" content={name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </Helmet>
      <div className="shell">
        <PageIntro crumbs={[{ label: t('home'), href: '/' }, { label: t('breadcrumb') }]} kicker={t('eyebrow', { name })} title={heading} lead={page.intro || undefined} />
        {hasHtmlText(page.body) && (
          <motion.div {...reveal()} className={cn(card, 'mt-8 max-w-[860px] p-6 sm:p-8 lg:p-10')}>
            <SiteHtml html={page.body!} />
          </motion.div>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/produtos" className={cn(btnPrimary, 'group')}>
            {t('ctaProducts')}<ArrowRight className="h-[18px] w-[18px] transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link to="/contatos" className={btnSecondary}>{t('ctaContact')}</Link>
        </div>
      </div>
    </PageShell>
  );
}

const About = () => {
  const { t } = useMessages(aboutMessages);
  const { data: info } = useStoreInfo();
  const { page: custom, isLoading: customLoading } = useSitePage('about');
  const name = info?.name || STORE_DEFAULTS.name;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const title = `${t('seoTitle')} | ${name}`;
  const description = t('seoDescription', { name });

  if (customLoading) return <PageShell><div className="shell space-y-4 pt-8" aria-busy="true"><div className="skeleton h-4 w-40 rounded" /><div className="skeleton h-14 w-2/3 rounded-xl" /><div className="skeleton h-64 rounded-[24px]" /></div></PageShell>;
  if (custom) return <CustomAbout page={custom} name={name} />;

  return (
    <PageShell>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${origin}/sobre`} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={`${origin}/sobre`} />
      </Helmet>

      {/* Abertura: texto e imagem */}
      <section className="shell pt-5 md:pt-8">
        <CatalogBreadcrumb items={[{ label: t('home'), href: '/' }, { label: t('breadcrumb') }]} />
        <div className="mt-6 grid items-center gap-8 md:mt-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <motion.div {...appear()}>
            <p className={eyebrow}>{t('eyebrow', { name })}</p>
            <h1 className={cn(h1, 'mt-3')}>{t('title')}</h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-brand-ink-soft md:text-lg">{t('lead')}</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {POINTS.map(([Icon, k]) => (
                <li key={k} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-brand-card-border bg-white px-3.5 text-[14px] font-medium text-brand-ink-soft">
                  <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t(k)}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/produtos" className={cn(btnPrimary, 'group')}>
                {t('ctaProducts')}<ArrowRight className="h-[18px] w-[18px] transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <Link to="/contatos" className={btnSecondary}>
                <MessageCircle className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('ctaQuote')}
              </Link>
            </div>
          </motion.div>
          <motion.div {...appear(1)}>
            <MediaImage
              src="/images/moni/bolo-floral.webp" alt={t('heroAlt')} eager imgClassName="object-contain p-6 sm:p-10"
              className="aspect-[4/3] rounded-[24px] bg-[radial-gradient(circle_at_50%_60%,hsl(var(--brand-orange-soft)),hsl(var(--brand-alt))_70%)]"
              fallback={<LayerArt Icon={CakeSlice} size="lg" />}
            />
          </motion.div>
        </div>
      </section>

      {/* História curta */}
      <section className="shell py-14 md:py-20">
        <motion.div {...reveal()} className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <h2 className={h2}>{t('storyTitle')}</h2>
          <div className="space-y-4 text-[17px] leading-relaxed text-brand-ink-soft">
            <p>{t('storyP1')}</p>
            <p>{t('storyP2')}</p>
            <p>{t('storyP3')}</p>
          </div>
        </motion.div>
      </section>

      {/* Como fazemos */}
      <section id="como-fazemos" className="scroll-mt-28 border-y border-border bg-white py-14 md:py-20" aria-labelledby="about-process">
        <div className="shell">
          <motion.div {...reveal()} className="max-w-2xl">
            <p className={eyebrow}>{t('processEyebrow')}</p>
            <h2 id="about-process" className={cn(h2, 'mt-3')}>{t('processTitle')}</h2>
            <p className="mt-3 text-[17px] text-muted-foreground">{t('processLead')}</p>
          </motion.div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([Icon, title, text], i) => (
              <motion.li key={title} {...reveal(i)} className="relative rounded-[20px] border border-brand-card-border bg-background p-6">
                <div className="flex items-center justify-between">
                  <IconTile Icon={Icon} className="bg-white" />
                  <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-brand-orange-text">{t('stepLabel', { n: i + 1 })}</span>
                </div>
                <h3 className={cn(h3, 'mt-5')}>{t(title)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t(text)}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Materiais */}
      <section id="materiais" className="shell scroll-mt-28 py-14 md:py-20" aria-labelledby="about-materials">
        <motion.div {...reveal()} className="max-w-2xl">
          <p className={eyebrow}>{t('materialsEyebrow')}</p>
          <h2 id="about-materials" className={cn(h2, 'mt-3')}>{t('materialsTitle')}</h2>
          <p className="mt-3 text-[17px] text-muted-foreground">{t('materialsLead')}</p>
        </motion.div>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {MATERIALS.map(([Icon, title, text], i) => (
            <motion.li key={title} {...reveal(i)} className={cn(card, 'p-6')}>
              <IconTile Icon={Icon} />
              <h3 className={cn(h3, 'mt-5')}>{t(title)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t(text)}</p>
            </motion.li>
          ))}
        </ul>
      </section>

      {/* Valores */}
      <section className="bg-brand-alt py-14 md:py-20" aria-labelledby="about-values">
        <div className="shell">
          <motion.div {...reveal()} className="max-w-2xl">
            <p className={eyebrow}>{t('valuesEyebrow')}</p>
            <h2 id="about-values" className={cn(h2, 'mt-3')}>{t('valuesTitle')}</h2>
          </motion.div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(([Icon, title, text, anchor], i) => (
              <motion.li key={title} id={anchor} {...reveal(i)} className={cn(card, 'scroll-mt-28 p-6', anchor && 'ring-1 ring-primary/20')}>
                <IconTile Icon={Icon} />
                <h3 className={cn(h3, 'mt-5')}>{t(title)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t(text)}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      {/* Chamada final */}
      <section className="shell pt-14 md:pt-20">
        <motion.div {...reveal()} className="relative overflow-hidden rounded-[24px] bg-[image:var(--gradient-primary)] p-7 text-white sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10" aria-hidden="true" />
          <div className="relative flex flex-col gap-7 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-xl">
              <h2 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-white md:text-[36px]">{t('ctaTitle')}</h2>
              <p className="mt-3 text-[17px] leading-relaxed text-white/90">{t('ctaText')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:shrink-0 xl:flex-nowrap">
              <Link to="/produtos" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] bg-white px-6 text-[15px] font-semibold text-brand-ink transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">
                {t('ctaProducts')}<ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
              </Link>
              <Link to="/categoria/bolos-personalizados" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-white/45 px-6 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <Wand2 className="h-[18px] w-[18px]" aria-hidden="true" />{t('ctaCustom')}
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </PageShell>
  );
};

export default About;
