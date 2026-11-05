// =====================================================================================
// Pré-visualização da marca no Admin: um mini site (cabeçalho, destaque, cartão de produto,
// rodapé) pintado com o tema em edição. As variáveis CSS do tema são aplicadas só neste bloco
// (style do contentor), por isso o resto do painel não muda até publicar.
// =====================================================================================
import type { CSSProperties } from 'react';
import { Heart, Search, ShoppingBag, Star } from 'lucide-react';
import { themeVars } from '@/theme/themeVars';
import { splitAccent } from '@/theme/brand';
import type { StoreBrand } from '@/theme/types';

type T = (k: 'preview_menu_1' | 'preview_menu_2' | 'preview_menu_3' | 'preview_hero' | 'preview_hero_sub' | 'preview_cta' | 'preview_secondary' | 'preview_badge' | 'preview_product' | 'preview_price' | 'preview_add' | 'preview_footer') => string;

function PreviewName({ brand, light = false }: { brand: StoreBrand; light?: boolean }) {
  const src = light ? brand.logos.wordmarkLight : brand.logos.wordmark;
  if (src) return <img src={src} alt={brand.name} className="h-5 w-auto max-w-[140px] object-contain object-left" />;
  const [head, accent] = splitAccent(brand.name, brand.nameAccent);
  return (
    <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-foreground'}`}>
      {head}
      {accent && <span className="text-primary">{accent}</span>}
    </span>
  );
}

function PreviewMark({ brand }: { brand: StoreBrand }) {
  if (brand.logos.icon) return <img src={brand.logos.icon} alt="" className="h-8 w-8 object-contain" />;
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-sm font-extrabold text-primary-foreground">
      {brand.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function BrandPreview({ brand, t }: { brand: StoreBrand; t: T }) {
  const style = themeVars(brand.theme) as CSSProperties;
  return (
    <div style={{ ...style, fontFamily: 'var(--font-body)' }} className="overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm">
      {/* cabeçalho */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <PreviewMark brand={brand} />
        <PreviewName brand={brand} />
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          <Search className="h-4 w-4" strokeWidth={1.8} />
          <ShoppingBag className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </div>
      <div className="flex gap-4 border-b border-border bg-card px-4 py-2 text-xs font-medium">
        <span className="text-brand-orange-text">{t('preview_menu_1')}</span>
        <span>{t('preview_menu_2')}</span>
        <span>{t('preview_menu_3')}</span>
      </div>

      {/* destaque */}
      <div className="space-y-3 bg-[image:var(--gradient-hero)] px-4 py-6">
        <span className="inline-flex rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-brand-orange-text">{t('preview_badge')}</span>
        <p className="text-2xl font-extrabold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>{t('preview_hero')}</p>
        <p className="text-sm text-muted-foreground">{t('preview_hero_sub')}</p>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow-orange)]">{t('preview_cta')}</span>
          <span className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold">{t('preview_secondary')}</span>
        </div>
      </div>

      {/* cartão de produto */}
      <div className="grid grid-cols-2 gap-3 bg-secondary px-4 py-4">
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative aspect-square bg-[image:var(--gradient-card)]">
              <div className="absolute inset-[22%] rounded-xl bg-[image:var(--gradient-primary)] opacity-80" />
              <Heart className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
            </div>
            <div className="space-y-1 p-2.5">
              <p className="truncate text-xs font-semibold">{t('preview_product')}</p>
              <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Star className="h-3 w-3 fill-primary text-primary" /> 4,9
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{t('preview_price')}</span>
                <span className="rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">{t('preview_add')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* rodapé */}
      <div className="flex items-center gap-2 bg-brand-ink px-4 py-4">
        <PreviewName brand={brand} light />
        <span className="ml-auto text-[11px] text-white/60">{t('preview_footer')}</span>
      </div>
    </div>
  );
}
