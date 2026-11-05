// Dados da página do produto (/produto/:id) e regras puras de opções, stock, preço e galeria.
// O carrinho e o servidor identificam cor e tamanho pelo NOME guardado em design_data (variation / size),
// e o preço com selectionPricing; ver buildDesignData. As regras de preço seguem src/hooks/useCart.tsx e
// supabase/functions/_shared/pricing.ts para o valor mostrado ser o mesmo do carrinho e do pedido.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { pgValue } from '@/lib/postgrestFilter';
import { getProductPromo, type ProductPromo } from '@/utils/promo';
import { effectiveUnitPrice, type AppliedTier } from '@/utils/tierPricing';

export type PdpProduct = Tables<'products'> & { sku?: string | null; gtin?: string | null; brand_id?: string | null; internal_code?: string | null; mpn?: string | null };
export type PdpVariation = { id: string; name: string; color_hex: string | null; image_url: string | null; price_modifier: number | null; display_order: number; sku?: string | null; gtin?: string | null; stock_quantity?: number | null };
export type PdpSize = { id: string; size_label: string; price_modifier: number | null; stock_quantity: number | null; display_order: number; sku?: string | null; gtin?: string | null };
export type PdpMatrix = { variation_id: string; product_size_id: string; is_available: boolean; stock_quantity: number | null; price_modifier: number | null; sku?: string | null; gtin?: string | null; image_url?: string | null };
export type PdpTier = { id: string; min_meters: number; price_per_meter: number; label: string | null };
export type PdpImage = { id: string; image_url: string; alt_text: string | null; variation_id: string | null; display_order: number };
export type PdpFaq = { id: string; question: string; answer: string };

export type PdpOptions = {
  variations: PdpVariation[];
  sizes: PdpSize[];
  matrix: PdpMatrix[];
  tiers: PdpTier[];
  images: PdpImage[];
  faqs: PdpFaq[];
};

const EMPTY_OPTIONS: PdpOptions = { variations: [], sizes: [], matrix: [], tiers: [], images: [], faqs: [] };
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Produto ativo por slug ou id (products.id é texto), mais cores, tamanhos, matriz cor x tamanho, escalões, fotos e perguntas. */
export function useProductPage(idOrSlug: string | undefined) {
  const product = useQuery({
    queryKey: ['pdp-product', idOrSlug],
    enabled: !!idOrSlug,
    retry: 1,
    queryFn: async (): Promise<PdpProduct | null> => {
      const { data, error } = await (supabase as any)
        .from('products').select('*')
        .eq('is_active', true)
        .or(`slug.eq.${pgValue(idOrSlug!)},id.eq.${pgValue(idOrSlug!)}`)
        .limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as PdpProduct | null;
    },
  });

  const productId = product.data?.id;
  const options = useQuery({
    queryKey: ['pdp-options', productId],
    enabled: !!productId,
    retry: 1,
    queryFn: async (): Promise<PdpOptions> => {
      const sb = supabase as any;
      const [variations, sizes, tiers, images, faqs] = await Promise.all([
        sb.from('product_variations').select('id,name,color_hex,image_url,price_modifier,display_order,sku,gtin,stock_quantity').eq('product_id', productId).eq('is_active', true).order('display_order'),
        sb.from('product_sizes').select('id,size_label,price_modifier,stock_quantity,display_order,sku,gtin').eq('product_id', productId).eq('is_active', true).order('display_order'),
        sb.from('product_volume_tiers').select('id,min_meters,price_per_meter,label').eq('product_id', productId).order('min_meters'),
        sb.from('product_images').select('id,image_url,alt_text,variation_id,display_order').eq('product_id', productId).order('display_order'),
        sb.from('product_faqs').select('id,question,answer').eq('product_id', productId).eq('is_active', true).order('display_order'),
      ]);
      // Cores, tamanhos e escalões mudam o preço e o stock: sem eles não se compra. Fotos e perguntas são opcionais.
      if (variations.error) throw variations.error;
      if (sizes.error) throw sizes.error;
      if (tiers.error) throw tiers.error;
      const v = (variations.data ?? []) as PdpVariation[];
      const s = (sizes.data ?? []) as PdpSize[];
      let matrix: PdpMatrix[] = [];
      if (v.length && s.length) {
        const m = await sb.from('product_variation_size_availability')
          .select('variation_id,product_size_id,is_available,stock_quantity,price_modifier,sku,gtin,image_url')
          .in('variation_id', v.map((x) => x.id));
        if (m.error) throw m.error;
        matrix = (m.data ?? []) as PdpMatrix[];
      }
      return {
        variations: v,
        sizes: s,
        matrix,
        tiers: ((tiers.data ?? []) as PdpTier[]).map((t) => ({ ...t, min_meters: num(t.min_meters), price_per_meter: num(t.price_per_meter) })),
        images: images.error ? [] : ((images.data ?? []) as PdpImage[]).filter((i) => !!i.image_url),
        faqs: faqs.error ? [] : ((faqs.data ?? []) as PdpFaq[]),
      };
    },
  });

  return {
    product: product.data ?? null,
    isLoading: product.isLoading,
    isError: product.isError,
    refetch: product.refetch,
    options: options.data ?? EMPTY_OPTIONS,
    optionsLoading: !!productId && options.isLoading,
    optionsError: options.isError,
  };
}

/* ---------- Cores ---------- */

/** Cor de product_variations: o carrinho junta linhas por variation_id e o servidor e o stock usam o nome. */
export type ColorOption = {
  key: string;
  name: string;
  hex: string | null;
  image: string | null;
  modifier: number;
  variationId: string;
  soldOut: boolean;
  /** estoque próprio da cor (produto sem tamanhos, recurso variants); null = usa o do produto */
  stock: number | null;
};

export const normalizeHex = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const c = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase() : null;
};

const matrixRow = (matrix: PdpMatrix[], variationId: string | undefined, sizeId: string) =>
  variationId ? matrix.find((m) => m.variation_id === variationId && m.product_size_id === sizeId) : undefined;

/* ---------- Tamanhos ---------- */

export type SizeOption = { id: string; label: string; modifier: number; stock: number; available: boolean; purchasable: boolean };

/**
 * Tamanhos para a cor escolhida. Sem linha na matriz, o tamanho está disponível com o stock do próprio tamanho.
 * Acréscimo: o da matriz substitui o do tamanho quando não é 0 (mesma regra de _shared/pricing.ts).
 * stockControlled = produto não personalizável (o trigger de stock ignora os personalizáveis).
 */
export function sizeOptionsFor(sizes: PdpSize[], matrix: PdpMatrix[], variationId: string | undefined, stockControlled: boolean): SizeOption[] {
  return sizes.map((s) => {
    const row = matrixRow(matrix, variationId, s.id);
    const available = row ? row.is_available !== false : true;
    const stock = num(row ? row.stock_quantity : s.stock_quantity);
    const modifier = row && num(row.price_modifier) !== 0 ? num(row.price_modifier) : num(s.price_modifier);
    return { id: s.id, label: s.size_label, modifier, stock, available, purchasable: available && (!stockControlled || stock > 0) };
  });
}

/**
 * Tamanhos antes de escolher a cor: cada tamanho junta o que vale em todas as cores (matriz incluída).
 * Pode ser comprado se o for em pelo menos uma cor; stock máximo e acréscimo mínimo entre essas cores.
 */
export function sizeOptionsAcross(sizes: PdpSize[], matrix: PdpMatrix[], variationIds: string[], stockControlled: boolean): SizeOption[] {
  if (!variationIds.length) return sizeOptionsFor(sizes, matrix, undefined, stockControlled);
  const perColor = variationIds.map((id) => sizeOptionsFor(sizes, matrix, id, stockControlled));
  return sizes.map((s, i) => {
    const all = perColor.map((list) => list[i]);
    const buyable = all.filter((o) => o.purchasable);
    const available = all.filter((o) => o.available);
    const pool = buyable.length ? buyable : available.length ? available : all;
    return {
      id: s.id,
      label: s.size_label,
      modifier: Math.min(...pool.map((o) => o.modifier)),
      stock: Math.max(...pool.map((o) => o.stock)),
      available: available.length > 0,
      purchasable: buyable.length > 0,
    };
  });
}

/**
 * Cores reais do produto (product_variations ativas). Sem tamanhos e com o recurso variants, a cor pode ter estoque
 * próprio (colorStock); vazio usa o estoque do produto, como o servidor (_adjust_order_item_stock).
 */
export function colorOptionsFor(o: PdpOptions, stockControlled: boolean, colorStock = false, productStock: number | null = null): ColorOption[] {
  return o.variations.map((v) => {
    const own = colorStock && !o.sizes.length && v.stock_quantity != null ? Math.max(0, num(v.stock_quantity)) : null;
    const effective = own ?? productStock;
    return {
      key: `v:${v.id}`,
      name: v.name,
      hex: normalizeHex(v.color_hex),
      image: v.image_url || null,
      modifier: num(v.price_modifier),
      variationId: v.id,
      stock: own,
      soldOut: o.sizes.length > 0
        ? sizeOptionsFor(o.sizes, o.matrix, v.id, stockControlled).every((s) => !s.purchasable)
        : colorStock && stockControlled && effective != null && effective <= 0,
    };
  });
}

/** Produto inteiro esgotado (nenhuma combinação pode ser comprada). Só faz sentido com as opções já carregadas. */
export function isSoldOut(product: PdpProduct, o: PdpOptions, colors: ColorOption[], stockControlled: boolean): boolean {
  if (o.sizes.length) {
    if (o.variations.length) return colors.length > 0 && colors.every((c) => c.soldOut);
    return sizeOptionsFor(o.sizes, o.matrix, undefined, stockControlled).every((s) => !s.purchasable);
  }
  // Cores com estoque próprio: esgotado só quando todas as cores estão esgotadas.
  if (o.variations.length && colors.some((c) => c.stock != null)) return colors.length > 0 && colors.every((c) => c.soldOut);
  return stockControlled && product.stock_quantity != null && product.stock_quantity <= 0;
}

/**
 * Acréscimo (cor + tamanho) a mostrar: o menor entre as combinações compráveis que ainda cabem na escolha atual,
 * com a matriz cor x tamanho. varies = há combinações com acréscimos diferentes (preço "A partir de").
 */
export function modifierFor(o: PdpOptions, colors: ColorOption[], color: ColorOption | null, sizeId: string | null, stockControlled: boolean): { min: number; varies: boolean } {
  const totals = (onlyBuyable: boolean) => {
    const out: number[] = [];
    const cands: (ColorOption | null)[] = color ? [color] : colors.length ? colors.filter((c) => !onlyBuyable || !c.soldOut) : [null];
    for (const c of cands) {
      const sizes: (SizeOption | null)[] = o.sizes.length
        ? sizeOptionsFor(o.sizes, o.matrix, c?.variationId, stockControlled).filter((s) => (!onlyBuyable || s.purchasable) && (!sizeId || s.id === sizeId))
        : [null];
      for (const s of sizes) out.push((c?.modifier ?? 0) + (s?.modifier ?? 0));
    }
    return out;
  };
  let list = totals(true);
  if (!list.length) list = totals(false);
  if (!list.length) return { min: 0, varies: false };
  const min = Math.min(...list);
  return { min, varies: list.some((x) => Math.abs(x - min) > 1e-9) };
}

/* ---------- Preço ---------- */

export type PriceInfo = {
  promo: ProductPromo | null;
  /** preço base líquido (promoção já aplicada) */
  basePrice: number;
  /** rácio da promoção aplicado aos escalões */
  tierRatio: number;
  /** preço unitário líquido final para a quantidade e as opções */
  unit: number;
  /** mesmo cálculo sem promoção, para riscar (null sem promoção ativa) */
  oldUnit: number | null;
  tier: AppliedTier | null;
};

/** Unidade = (escalão x rácio da promoção, ou preço base) + acréscimos de cor e tamanho. Igual ao carrinho e ao servidor. */
export function priceFor(product: PdpProduct, tiers: PdpTier[], quantity: number, modifier: number): PriceInfo {
  const rawBase = num(product.price);
  const promo = getProductPromo(product);
  const basePrice = promo?.isActive ? promo.effectivePrice : rawBase;
  const tierRatio = rawBase > 0 ? basePrice / rawBase : 1;
  const scaled = tierRatio === 1 ? tiers : tiers.map((t) => ({ ...t, price_per_meter: t.price_per_meter * tierRatio }));
  const { unit, tier } = effectiveUnitPrice(basePrice, quantity, scaled);
  const oldUnit = promo?.isActive ? effectiveUnitPrice(rawBase, quantity, tiers).unit + modifier : null;
  return { promo: promo?.isActive ? promo : null, basePrice, tierRatio, unit: Math.max(0, unit + modifier), oldUnit, tier };
}

/** design_data do carrinho: nome, foto, peso, preço líquido, nomes de cor e tamanho e selectionPricing (contrato de useCart). */
export function buildDesignData(product: PdpProduct, price: PriceInfo, modifier: number, color: ColorOption | null, size: SizeOption | null, image: string | null) {
  return {
    name: product.name,
    image: image || product.image || '',
    weight: num(product.weight) || 0.5,
    price: price.basePrice + modifier,
    ...(color ? { variation: color.name, color: color.hex ?? undefined } : {}),
    ...(size ? { size: size.label } : {}),
    selectionPricing: { version: 1, basePrice: price.basePrice, modifier, tierRatio: price.tierRatio },
  };
}

/* ---------- Galeria ---------- */

/** Item da galeria: foto (padrão), vídeo (MP4/WebM) ou modelo 3D (STL, OBJ ou 3MF, girável). */
export type GalleryImage = { url: string; alt: string; kind?: 'image' | 'video' | 'model' };

/**
 * Foto da variante escolhida (cor x tamanho, recurso variants) e fotos da cor primeiro; depois a foto principal,
 * products.images e as fotos gerais. hero_image só sem outras.
 */
export function galleryFor(product: PdpProduct, images: PdpImage[], color: ColorOption | null, variantImage: string | null = null): GalleryImage[] {
  const seen = new Set<string>();
  const list: GalleryImage[] = [];
  const push = (url: string | null | undefined, alt?: string | null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push({ url, alt: alt || product.name });
  };
  push(variantImage, color ? `${product.name}, ${color.name}` : null);
  if (color?.variationId) images.filter((i) => i.variation_id === color.variationId).forEach((i) => push(i.image_url, i.alt_text));
  if (color?.image) push(color.image, `${product.name}, ${color.name}`);
  push(product.image);
  (product.images ?? []).forEach((u) => typeof u === 'string' && push(u));
  images.filter((i) => !i.variation_id).forEach((i) => push(i.image_url, i.alt_text));
  if (!list.length) push(product.hero_image);
  return list;
}

/** Galeria com mídia: 1.ª foto, o modelo 3D (products.model_url), as outras fotos e os vídeos (products.video_urls). */
export function withMedia(photos: GalleryImage[], product: PdpProduct): GalleryImage[] {
  const model: GalleryImage[] = product.model_url ? [{ url: product.model_url, alt: product.name, kind: 'model' }] : [];
  const videos: GalleryImage[] = (product.video_urls ?? []).filter((u) => typeof u === 'string' && u.trim())
    .map((url) => ({ url, alt: product.name, kind: 'video' }));
  return [...photos.slice(0, 1), ...model, ...photos.slice(1), ...videos];
}

/* ---------- Ficha ---------- */

const PRODUCTION_KEYS = ['production_days', 'productionDays', 'prazo_producao', 'dias_producao', 'lead_time_days', 'production_time'];
export const isProductionKey = (k: string) => PRODUCTION_KEYS.includes(k);

/** Prazo de produção real, se a ficha o tiver (número de dias ou texto); null para usar o padrão do i18n. */
export function productionTime(product: PdpProduct): { days: number } | { text: string } | null {
  for (const src of [product.technical_specs, product.specifications]) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    for (const k of PRODUCTION_KEYS) {
      const v = (src as Record<string, unknown>)[k];
      if (typeof v === 'number' && v > 0) return { days: Math.round(v) };
      if (typeof v === 'string' && v.trim()) return /^\d+$/.test(v.trim()) ? { days: Number(v.trim()) } : { text: v.trim() };
    }
  }
  return null;
}

/** Material principal para "Produzido em ...": materials[0] ou material curto; null sem material (a loja serve qualquer ramo). */
export function mainMaterial(product: PdpProduct): string | null {
  const first = (product.materials ?? []).find((m) => typeof m === 'string' && m.trim());
  if (first) return first.trim();
  const m = product.material?.trim();
  return m && m.length <= 32 ? m : null;
}
