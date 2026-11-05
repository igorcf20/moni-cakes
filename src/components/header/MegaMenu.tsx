import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Flame, Gift, Sparkles, Star, type LucideIcon } from 'lucide-react';
import { MediaImage, LayerArt } from '@/components/MediaImage';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { useCatalogMenu } from '@/hooks/useCatalogMenu';
import { useMegaMenuSettings } from '@/hooks/useOfferSettings';
import { LISTINGS } from '@/lib/catalog';
import type { MenuCategory } from '@/lib/catalogMenu';
import { DEFAULT_MEGA_MENU, bannerText, pickFeatured } from '@/lib/megaMenu';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

/**
 * Banner de categoria em destaque: com foto = foto, sombra e texto branco; sem foto = gradiente da marca com o ícone
 * grande ao fundo (nunca a reserva de camadas, que tapava o texto).
 */
export function CategoryBanner({ c, onNavigate, showText, see, className }: { c: MenuCategory; onNavigate: () => void; showText: boolean; see: string; className?: string }) {
  const text = showText ? bannerText(c) : '';
  const url = c.imageUrl || (c.image ? mediaUrl(c.image) : null);
  const [failed, setFailed] = useState(false);
  const photo = !!url && !failed;
  return (
    <Link to={`/categoria/${c.slug}`} onClick={onNavigate} className={cn('group relative block overflow-hidden rounded-[18px]', photo ? 'bg-brand-alt' : 'bg-[image:var(--gradient-primary)]', className)}>
      {photo ? (
        <>
          <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        </>
      ) : (
        <c.Icon aria-hidden="true" strokeWidth={1.4} className="absolute -right-4 -top-4 h-32 w-32 text-white/20 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105" />
      )}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-4 text-white">
        <span className="flex items-center gap-2 text-[17px] font-bold leading-tight tracking-[-0.02em]">
          <c.Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />{c.longName}
        </span>
        {text && <span className="line-clamp-1 text-[13px] text-white/85">{text}</span>}
        <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold">
          {see}<ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

function Column({ c, onNavigate }: { c: MenuCategory; onNavigate: () => void }) {
  return (
    <div className="min-w-0">
      <Link to={`/categoria/${c.slug}`} onClick={onNavigate} className="group mb-3 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] text-foreground">
        <c.Icon className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />
        <span className="transition-colors group-hover:text-brand-orange-text">{c.longName}</span>
      </Link>
      <ul className="space-y-1.5">
        {c.subs.map((s) => (
          <li key={s.id}>
            <Link to={s.href} onClick={onNavigate} className="block py-0.5 text-[14px] text-brand-ink-soft transition-colors duration-150 hover:translate-x-0.5 hover:text-brand-orange-text">
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Mega menu de categorias: 1200px, centrado sob a navegação, abre com fade e 5px de deslocamento.
 * Em cima, as categorias em destaque com banner; embaixo, as colunas; ao lado, Novidades e atalhos
 * (tudo configurável em Admin > Categorias > Menu de categorias, store_settings.mega_menu).
 */
export function MegaMenu({ onNavigate, onMouseEnter, onMouseLeave }: { onNavigate: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void }) {
  const { t } = useMessages(layoutMessages);
  const menu = useCatalogMenu();
  const { data: settings = DEFAULT_MEGA_MENU } = useMegaMenuSettings();
  const featured = pickFeatured(menu, settings);
  const side = settings.sideCard === 'news' || settings.quickLinks;
  // Categorias em filas de 4 colunas (as do Admin > Categorias, pela ordem de lá).
  const [main, extra] = [menu.slice(0, 4), menu.slice(4)];
  const quick: [LucideIcon, string, string][] = [
    [Star, t('quick_best'), LISTINGS.best], [Flame, t('quick_offers'), LISTINGS.offers],
    [Sparkles, t('quick_new'), LISTINGS.new], [Gift, t('quick_gifts'), LISTINGS.gifts],
  ];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-full z-40 flex justify-center px-4">
    <motion.div
      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2, ease: 'easeOut' }}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      className="pointer-events-auto w-full max-w-[1200px] rounded-b-[20px] border border-t-0 border-border bg-white shadow-[var(--shadow-elevated)]"
      role="region" aria-label={t('allCategories')}
    >
      {featured.length > 0 && (
        <div className="px-8 pt-7">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t('mega_featured')}</p>
          <div className={cn('grid gap-4', featured.length === 1 ? 'grid-cols-1' : featured.length === 2 ? 'grid-cols-2' : featured.length === 3 ? 'grid-cols-3' : 'grid-cols-4')}>
            {featured.map((c, i) => (
              <motion.div key={c.slug} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.04 * i }}>
                <CategoryBanner c={c} onNavigate={onNavigate} showText={settings.showText} see={t('mega_see')} className={featured.length === 1 ? 'aspect-[5/1]' : 'aspect-[16/8]'} />
              </motion.div>
            ))}
          </div>
        </div>
      )}
      <div className={cn('grid gap-8 p-8', side && 'grid-cols-[minmax(0,1fr)_minmax(0,0.4fr)]')}>
        <div className="space-y-8">
          <div className="grid grid-cols-4 gap-6">{main.map((c) => <Column key={c.slug} c={c} onNavigate={onNavigate} />)}</div>
          {extra.length > 0 && <div className="grid grid-cols-4 gap-6 border-t border-border pt-6">
            {extra.map((c) => <Column key={c.slug} c={c} onNavigate={onNavigate} />)}
          </div>}
        </div>
        {side && <div className="flex flex-col gap-4">
          {settings.sideCard === 'news' && <Link to={LISTINGS.new} onClick={onNavigate} className={cn('group relative flex flex-col overflow-hidden rounded-[18px] bg-brand-orange-soft p-5', !featured.length && 'flex-1')}>
            {/* Com banners em cima, o cartão fica sem foto para o menu não crescer demais. */}
            {!featured.length && <MediaImage k="mega-novidades" alt={t('mega_title')} className="mb-4 aspect-[4/3] rounded-[14px]" imgClassName="transition-transform duration-200 group-hover:scale-[1.03]" fallback={<LayerArt Icon={Sparkles} />} />}
            <span className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
              <Sparkles className="h-3 w-3" aria-hidden="true" />{t('quick_new')}
            </span>
            <p className="mt-2 text-lg font-bold tracking-tight">{t('mega_title')}</p>
            <p className="mt-1 text-sm leading-relaxed text-brand-ink-soft">{t('mega_text')}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-orange-text">
              {t('mega_cta')}<ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" aria-hidden="true" />
            </span>
          </Link>}
          {settings.quickLinks && <div className="grid grid-cols-2 gap-2">
            {quick.map(([Icon, label, href]) => (
              <Link key={href} to={href} onClick={onNavigate} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium transition-colors duration-150 hover:border-primary/40 hover:bg-accent">
                <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{label}
              </Link>
            ))}
          </div>}
        </div>}
      </div>
    </motion.div>
    </div>
  );
}
