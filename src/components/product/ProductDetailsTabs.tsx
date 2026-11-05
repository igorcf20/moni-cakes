// Abaixo da compra: descrição completa (com uso e observações), especificações reais, segurança do produto
// (GPSR: fabricante, responsável na UE e avisos, quando a loja os preencheu) e avaliações.
// layout 'tabs' = abas; 'sections' = descrição e ficha técnica lado a lado e avaliações numa seção própria
// (Admin > Aparência da loja > Página do produto, store_settings.product_page.details).
import { forwardRef, useMemo, type ReactNode } from 'react';
import { useFeature } from "@/hooks/useFeatures";
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import { Building2, Info, ShieldAlert, ShieldCheck, Tag } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isProductionKey, type PdpProduct } from '@/hooks/useProductPage';
import { useMessages, type Locale } from '@/i18n';
import { productMessages, type ProductMessages } from '@/i18n/product';
import { useProductCompliance } from '@/hooks/useProductCompliance';
import { useCountry } from '@/lib/countries';
import { appliesTo, resolveSafety, type ResolvedSafety, type SafetyParty } from '@/lib/productCompliance';
import { ProductReviewsPanel } from './ProductReviewsPanel';
import { useProductSpecOptionIds, useSpecAttributes } from '@/hooks/useProductSpecs';
import { productSpecRows } from '@/lib/productSpecs';
import { useProductCodes } from '@/components/product/ProductCodes';
import { cn } from '@/lib/utils';
import { productPageMessages } from '@/i18n/productPage';
import type { ProductPageDetails } from '@/lib/productPage';

export type DetailsTab = 'description' | 'specs' | 'safety' | 'reviews';
type T = (key: keyof ProductMessages, vars?: Record<string, string | number>) => string;

const prose =
  'prose prose-neutral max-w-none text-[16px] leading-relaxed prose-headings:font-bold prose-headings:tracking-[-0.02em] prose-headings:text-foreground prose-p:text-brand-ink-soft prose-li:text-brand-ink-soft prose-strong:text-foreground prose-a:font-semibold prose-a:text-brand-orange-text';

const humanize = (k: string) => {
  const s = k.replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : k;
};

/** Padrões do Admin para um produto novo (embalagem 30 x 20 x 10 cm, 0,3 kg): não são dados reais, ficam de fora. */
const DEFAULT_PACKAGE = { length: 30, width: 20, height: 10, weight: 0.3 };

/**
 * Linhas da ficha: só dados reais do produto (código, material, specifications e technical_specs).
 * dimensions e weight são da EMBALAGEM (servem para o frete): vêm no fim, com esse rótulo, e só se não forem os padrões.
 */
/** Códigos que a loja mostra na aba (Admin > Códigos do produto); sem a regra, o SKU como antes. */
export type SpecCode = { label: string; value: string };

export function specRows(product: PdpProduct, t: T, locale: Locale, codes?: SpecCode[]): { label: string; value: string }[] {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const rows: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  const add = (label: string, value: string) => {
    const k = label.toLowerCase();
    if (!value.trim() || seen.has(k)) return;
    seen.add(k);
    rows.push({ label, value });
  };
  if (codes) codes.forEach((c) => add(c.label, c.value));
  else if (product.sku) add(t('specSku'), String(product.sku));
  const mats = (product.materials ?? []).filter((m) => typeof m === 'string' && m.trim());
  if (mats.length) add(t('specMaterial'), mats.join(', '));
  else if (product.material) add(t('specMaterial'), product.material);
  for (const src of [product.specifications, product.technical_specs]) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (isProductionKey(k) || v == null) continue;
      if (typeof v === 'boolean') add(humanize(k), v ? t('yes') : t('no'));
      else if (typeof v === 'number') add(humanize(k), nf.format(v));
      else if (typeof v === 'string') add(humanize(k), v);
      else if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) add(humanize(k), v.join(', '));
    }
  }
  const d = product.dimensions && typeof product.dimensions === 'object' && !Array.isArray(product.dimensions) ? (product.dimensions as Record<string, unknown>) : null;
  if (d) {
    const dims = [d.length, d.width, d.height].map(Number);
    const isDefault = dims[0] === DEFAULT_PACKAGE.length && dims[1] === DEFAULT_PACKAGE.width && dims[2] === DEFAULT_PACKAGE.height;
    const parts = dims.filter((n) => Number.isFinite(n) && n > 0);
    if (parts.length && !isDefault) add(t('specPackageDimensions'), `${parts.map((n) => nf.format(n)).join(' x ')} cm`);
  }
  const w = Number(product.weight);
  if (Number.isFinite(w) && w > 0 && w !== DEFAULT_PACKAGE.weight) add(t('specPackageWeight'), w < 1 ? `${nf.format(Math.round(w * 1000))} g` : `${nf.format(w)} kg`);
  return rows;
}

const hasHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);

export const ProductDetailsTabs = forwardRef<HTMLElement, {
  product: PdpProduct;
  tab: DetailsTab;
  onTab: (t: DetailsTab) => void;
  reviewsCount: number;
  returnPath: string;
  /** SKU da variante escolhida (cor e tamanho), senão o do produto. */
  sku?: string | null;
  layout?: ProductPageDetails;
}>(function ProductDetailsTabs({ product, tab, onTab, reviewsCount, returnPath, sku, layout = 'tabs' }, ref) {
  const { t, locale } = useMessages(productMessages);
  const { t: tp } = useMessages(productPageMessages);
  const specCodes = useProductCodes(product, 'specs', sku);
  // Características do Admin > Especificações primeiro, depois a ficha do produto (sem repetir rótulos).
  const specsOn = useFeature('spec_filters');
  const { data: specAttributes = [] } = useSpecAttributes(specsOn);
  const { data: specOptionIds = [] } = useProductSpecOptionIds(product.id, specsOn && specAttributes.length > 0);
  const specs = useMemo(() => {
    const structured = specsOn ? productSpecRows(specOptionIds, specAttributes, locale) : [];
    const seen = new Set(structured.map((r) => r.label.toLowerCase()));
    return [...structured, ...specRows(product, t, locale, specCodes).filter((r) => !seen.has(r.label.toLowerCase()))];
  }, [product, t, locale, specsOn, specOptionIds, specAttributes, specCodes]);
  const country = useCountry();
  const { data: compliance } = useProductCompliance();
  const safety = useMemo(
    () => (compliance ? resolveSafety((product as { safety_info?: unknown }).safety_info, compliance, product.sku) : null),
    [compliance, product],
  );
  const safetyOn = useFeature('product_safety');
  const showSafety = safetyOn && !!compliance && !!safety?.any && appliesTo(compliance.safety_show, country.code);
  const active: DetailsTab = (tab === 'specs' && !specs.length) || (tab === 'safety' && !showSafety) ? 'description' : tab;
  const description = product.description?.trim() ?? '';
  const sanitized = useMemo(() => (description && hasHtml(description) ? DOMPurify.sanitize(description) : ''), [description]);
  const hasDescription = !!(description || product.usage_instructions || product.disclaimer);

  const descriptionBody = (
    hasDescription ? (
      <div className="max-w-3xl space-y-8">
        {description && (sanitized
          ? <div className={prose} dangerouslySetInnerHTML={{ __html: sanitized }} />
          : <p className="whitespace-pre-line text-[16px] leading-relaxed text-brand-ink-soft">{description}</p>)}
        {product.usage_instructions && (
          <div>
            <h3 className="mb-3 text-[22px] font-bold tracking-[-0.02em]">{t('usageTitle')}</h3>
            <div className={prose}><ReactMarkdown>{product.usage_instructions}</ReactMarkdown></div>
          </div>
        )}
        {product.disclaimer && (
          <aside className="flex items-start gap-3 rounded-[18px] bg-brand-alt p-4 md:p-5">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
            <div>
              <h3 className="text-[15px] font-semibold">{t('noteTitle')}</h3>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-brand-ink-soft">{product.disclaimer}</p>
            </div>
          </aside>
        )}
      </div>
    ) : (
      <p className="text-[16px] text-brand-ink-soft">{t('noDescription')}</p>
    )
  );

  const trigger =
    'relative min-h-[48px] shrink-0 rounded-none bg-transparent px-4 text-[15px] font-semibold text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-200 data-[state=active]:after:scale-x-100 md:px-5 md:text-[16px]';

  if (layout === 'sections') {
    const h2 = 'text-[26px] leading-tight md:text-[30px]';
    return (
      <section ref={ref} aria-label={t('details')} className="scroll-mt-28 lg:scroll-mt-40">
        <div className={cn('grid gap-5 lg:gap-6', specs.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]')}>
          <div className="rounded-[20px] bg-white p-5 md:p-8">
            <h2 className={cn(h2, 'mb-5')}>{tp('aboutTitle')}</h2>
            {descriptionBody}
          </div>
          {specs.length > 0 && (
            <aside aria-labelledby="pdp-specs-title" className="self-start overflow-hidden rounded-[20px] border border-brand-card-border bg-white lg:sticky lg:top-[100px]">
              <h2 id="pdp-specs-title" className={cn(h2, 'px-5 pb-3 pt-5 md:px-6 md:pt-6')}>{tp('specsTitle')}</h2>
              <dl className="divide-y divide-border border-t border-border">
                {specs.map((r) => (
                  <div key={r.label} className="flex items-baseline justify-between gap-4 px-5 py-3 md:px-6">
                    <dt className="text-[14px] text-muted-foreground">{r.label}</dt>
                    <dd className="text-right text-[14px] font-medium text-foreground [overflow-wrap:anywhere]">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          )}
        </div>
        {showSafety && safety && (
          <div className="mt-5 rounded-[20px] border border-brand-card-border bg-white p-5 md:p-8 lg:mt-6">
            <SafetyPanel safety={safety} t={t} />
          </div>
        )}
        <div id="avaliacoes" className="mt-12 scroll-mt-28 rounded-[20px] border border-brand-card-border bg-white p-5 md:mt-16 md:p-8 lg:scroll-mt-40">
          <h2 className={cn(h2, 'mb-6 flex flex-wrap items-baseline gap-x-3')}>
            {t('reviewsTitle')}
            {reviewsCount > 0 && <span className="font-sans text-[15px] font-semibold tabular-nums text-muted-foreground">({reviewsCount})</span>}
          </h2>
          <ProductReviewsPanel productId={product.id} returnPath={returnPath} />
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} id="avaliacoes" aria-label={t('details')} className="scroll-mt-28 lg:scroll-mt-40">
      <Tabs value={active} onValueChange={(v) => onTab(v as DetailsTab)}>
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="description" className={trigger}>{t('tabDescription')}</TabsTrigger>
          {specs.length > 0 && <TabsTrigger value="specs" className={trigger}>{t('tabSpecs')}</TabsTrigger>}
          {showSafety && <TabsTrigger value="safety" className={trigger}>{t('tabSafety')}</TabsTrigger>}
          <TabsTrigger value="reviews" className={trigger}>
            {t('tabReviews')}
            {reviewsCount > 0 && <span className="ml-2 rounded-md bg-brand-alt px-1.5 py-0.5 text-xs font-bold tabular-nums text-brand-ink-soft">{reviewsCount}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="description" className="mt-6 rounded-[18px] bg-white p-5 md:p-8">
          {descriptionBody}
        </TabsContent>

        {specs.length > 0 && (
          <TabsContent value="specs" className="mt-6 overflow-hidden rounded-[20px] border border-brand-card-border bg-white">
            <dl className="divide-y divide-border">
              {specs.map((r) => (
                <div key={r.label} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[minmax(160px,240px)_1fr] sm:gap-6 md:px-8">
                  <dt className="text-[15px] text-muted-foreground">{r.label}</dt>
                  <dd className="text-[15px] font-medium text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>
          </TabsContent>
        )}

        {showSafety && safety && (
          <TabsContent value="safety" className="mt-6 rounded-[20px] border border-brand-card-border bg-white p-5 md:p-8">
            <SafetyPanel safety={safety} t={t} />
          </TabsContent>
        )}

        <TabsContent value="reviews" className="mt-6 rounded-[20px] border border-brand-card-border bg-white p-5 md:p-8">
          <h2 className="mb-6 text-[30px] font-bold leading-tight tracking-[-0.03em] md:text-[34px] lg:text-[38px]">{t('reviewsTitle')}</h2>
          <ProductReviewsPanel productId={product.id} returnPath={returnPath} />
        </TabsContent>
      </Tabs>
    </section>
  );
});

/** Morada e contacto em linhas; contacto com @ vira link de e-mail, com http vira link. */
function Party({ party }: { party: SafetyParty }) {
  const contact = party.contact.trim();
  const href = /^https?:\/\//i.test(contact) ? contact : /@/.test(contact) && !/\s/.test(contact) ? `mailto:${contact}` : null;
  return (
    <div className="text-[15px] leading-relaxed text-brand-ink-soft">
      {party.name && <p className="font-semibold text-foreground">{party.name}</p>}
      {party.address && <p className="whitespace-pre-line">{party.address}</p>}
      {contact && (href
        ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="break-all font-semibold text-brand-orange-text underline-offset-4 hover:underline">{contact}</a>
        : <p className="break-words">{contact}</p>)}
    </div>
  );
}

function SafetyPanel({ safety, t }: { safety: ResolvedSafety; t: T }) {
  const blocks = [
    safety.manufacturer && { key: 'm', Icon: Building2, title: t('safetyManufacturer'), body: <Party party={safety.manufacturer} /> },
    safety.responsible && { key: 'r', Icon: ShieldCheck, title: t('safetyResponsible'), body: <Party party={safety.responsible} /> },
    safety.model && { key: 'id', Icon: Tag, title: t('safetyModel'), body: <p className="text-[15px] text-brand-ink-soft">{safety.model}</p> },
  ].filter(Boolean) as { key: string; Icon: typeof Building2; title: string; body: ReactNode }[];
  return (
    <div className="max-w-3xl">
      <h2 className="text-[22px] font-bold tracking-[-0.02em]">{t('safetyTitle')}</h2>
      <p className="mt-1.5 text-[15px] text-muted-foreground">{t('safetyLead')}</p>
      {blocks.length > 0 && (
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {blocks.map(({ key, Icon, title, body }) => (
            <div key={key} className="flex gap-3 rounded-[18px] border border-brand-card-border bg-background p-4">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</dt>
                <dd className="mt-1">{body}</dd>
              </div>
            </div>
          ))}
        </dl>
      )}
      {safety.warnings && (
        <aside className="mt-5 flex items-start gap-3 rounded-[18px] bg-brand-alt p-4 md:p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange-text" strokeWidth={1.8} aria-hidden="true" />
          <div>
            <h3 className="text-[15px] font-semibold">{t('safetyWarnings')}</h3>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-brand-ink-soft">{safety.warnings}</p>
          </div>
        </aside>
      )}
    </div>
  );
}
