// Banners de campanha na página inicial (Admin > Banners): um banner largo, ou dois e três lado a lado
// (rolagem lateral no celular). Some quando não há banners ativos. Textos sobre a foto com véu escuro
// para manter o contraste, qualquer que seja a imagem. Textos no idioma do visitante (texts_i18n).
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useCampaignBanners, isBannerLink, bannerInLocale, type CampaignBanner } from '@/hooks/useCampaignBanners';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

function BannerCard({ b, wide }: { b: CampaignBanner; wide: boolean }) {
  const href = b.cta_url && isBannerLink(b.cta_url) ? b.cta_url : null;
  const body = (
    <>
      <img src={b.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 via-45% to-black/0" aria-hidden="true" />
      <div className="relative mt-auto p-6 text-white sm:p-8">
        <p className={cn('font-editorial leading-[1.05] [text-shadow:0_1px_12px_rgba(0,0,0,0.35)]', wide ? 'text-[30px] md:text-[42px]' : 'text-[26px] md:text-[32px]')}>{b.title}</p>
        {b.subtitle && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,0.4)] md:text-base">{b.subtitle}</p>}
        {href && b.cta_text && (
          <span className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-brand-ink transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
            {b.cta_text}<ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </>
  );
  const cls = cn('group relative flex overflow-hidden rounded-[14px] bg-brand-alt', wide ? 'aspect-[4/3] sm:aspect-[21/8]' : 'aspect-[4/3.2] w-[85%] shrink-0 snap-start sm:w-auto');
  if (!href) return <div className={cls}>{body}</div>;
  return href.startsWith('/')
    ? <Link to={href} className={cls}>{body}</Link>
    : <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>;
}

export function CampaignBanners() {
  const { data = [] } = useCampaignBanners();
  const locale = useLocale((s) => s.locale);
  if (!data.length) return null;
  const items = data.slice(0, 3).map((b) => bannerInLocale(b, locale));
  return (
    <section className="shell py-8 md:py-10">
      {items.length === 1 ? (
        <BannerCard b={items[0]} wide />
      ) : (
        <div className={cn('-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:overflow-visible sm:px-0 md:gap-4', items.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          {items.map((b) => <BannerCard key={b.id} b={b} wide={false} />)}
        </div>
      )}
    </section>
  );
}
