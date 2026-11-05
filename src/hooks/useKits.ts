// =====================================================================================
// Kits no site: lista (/kits, página inicial), um kit (/kit/<slug>), kits de um produto (página do produto e carrinho)
// e as opções (cores e tamanhos) das peças. A leitura pública de kits já filtra ativos, período e o recurso
// (política kit_is_live); kit_items não tem chave estrangeira para products, por isso os produtos vêm à parte.
// =====================================================================================
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFeature } from '@/hooks/useFeatures';
import type { KitItemRow, KitProduct, KitRow } from '@/lib/kits';
import type { PdpOptions, PdpSize, PdpVariation, PdpMatrix } from '@/hooks/useProductPage';

export type KitPiece = KitItemRow & { product: KitProduct | null };
export type KitWithPieces = KitRow & { pieces: KitPiece[] };

const sb = supabase as any;

async function loadPieces(kitIds: string[]): Promise<Record<string, KitPiece[]>> {
  if (!kitIds.length) return {};
  const { data: items, error } = await sb.from('kit_items').select('kit_id,product_id,quantity,note,display_order').in('kit_id', kitIds);
  if (error) throw error;
  const ids = [...new Set((items ?? []).map((i: KitItemRow) => String(i.product_id)))];
  const { data: products, error: pErr } = ids.length ? await sb.from('products').select('*').in('id', ids) : { data: [], error: null };
  if (pErr) throw pErr;
  const byId = new Map<string, KitProduct>((products ?? []).map((p: KitProduct) => [String(p.id), p]));
  const out: Record<string, KitPiece[]> = {};
  for (const i of (items ?? []) as KitItemRow[]) {
    (out[i.kit_id] ||= []).push({ ...i, quantity: Number(i.quantity) || 1, product: byId.get(String(i.product_id)) ?? null });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return out;
}

/** Kits do site, pela ordem do Admin. onlyHome = só os marcados para a página inicial. */
export function useKits(opts: { onlyHome?: boolean } = {}) {
  const on = useFeature('kits');
  return useQuery({
    queryKey: ['site-kits', !!opts.onlyHome],
    enabled: on,
    staleTime: 60_000,
    queryFn: async (): Promise<KitWithPieces[]> => {
      let q = sb.from('kits').select('*').order('display_order', { ascending: true });
      if (opts.onlyHome) q = q.eq('show_on_home', true);
      const { data, error } = await q;
      if (error) throw error;
      const kits = (data ?? []) as KitRow[];
      const pieces = await loadPieces(kits.map((k) => k.id));
      return kits.map((k) => ({ ...k, pieces: pieces[k.id] ?? [] }));
    },
  });
}

/** Um kit pelo endereço (slug) ou pelo id. */
export function useKit(slugOrId: string | undefined) {
  const on = useFeature('kits');
  return useQuery({
    queryKey: ['site-kit', slugOrId],
    enabled: on && !!slugOrId,
    queryFn: async (): Promise<KitWithPieces | null> => {
      const value = String(slugOrId);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      const { data, error } = await sb.from('kits').select('*').eq(isUuid ? 'id' : 'slug', value).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const pieces = await loadPieces([data.id]);
      return { ...(data as KitRow), pieces: pieces[data.id] ?? [] };
    },
  });
}

/** Kits que incluem algum destes produtos (página do produto e carrinho). */
export function useKitsWithProducts(productIds: string[]) {
  const on = useFeature('kits');
  const ids = [...new Set(productIds.filter(Boolean).map(String))].sort();
  return useQuery({
    queryKey: ['site-kits-for', ids],
    enabled: on && ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<{ kits: KitWithPieces[]; links: KitItemRow[] }> => {
      const { data: links, error } = await sb.from('kit_items').select('kit_id,product_id,quantity').in('product_id', ids);
      if (error) throw error;
      const kitIds = [...new Set((links ?? []).map((l: KitItemRow) => l.kit_id))] as string[];
      if (!kitIds.length) return { kits: [], links: [] };
      const { data: kits, error: kErr } = await sb.from('kits').select('*').in('id', kitIds).order('display_order', { ascending: true });
      if (kErr) throw kErr;
      const visible = (kits ?? []) as KitRow[];
      const pieces = await loadPieces(visible.map((k) => k.id));
      const live = new Set(visible.map((k) => k.id));
      return { kits: visible.map((k) => ({ ...k, pieces: pieces[k.id] ?? [] })), links: (links ?? []).filter((l: KitItemRow) => live.has(l.kit_id)) };
    },
  });
}

/** Cores, tamanhos e matriz das peças (para escolher dentro do kit), no formato da página do produto. */
export function useKitPieceOptions(productIds: string[]) {
  const ids = [...new Set(productIds.filter(Boolean).map(String))].sort();
  return useQuery({
    queryKey: ['site-kit-options', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, PdpOptions>> => {
      const [variations, sizes] = await Promise.all([
        sb.from('product_variations').select('id,product_id,name,color_hex,image_url,price_modifier,display_order,sku,gtin,stock_quantity').in('product_id', ids).eq('is_active', true).order('display_order'),
        sb.from('product_sizes').select('id,product_id,size_label,price_modifier,stock_quantity,display_order,sku,gtin').in('product_id', ids).eq('is_active', true).order('display_order'),
      ]);
      if (variations.error) throw variations.error;
      if (sizes.error) throw sizes.error;
      const vIds = (variations.data ?? []).map((v: { id: string }) => v.id);
      let matrix: (PdpMatrix & { variation_id: string })[] = [];
      if (vIds.length && (sizes.data ?? []).length) {
        const m = await sb.from('product_variation_size_availability')
          .select('variation_id,product_size_id,is_available,stock_quantity,price_modifier,sku,gtin,image_url').in('variation_id', vIds);
        if (m.error) throw m.error;
        matrix = m.data ?? [];
      }
      const out: Record<string, PdpOptions> = {};
      for (const id of ids) {
        const v = (variations.data ?? []).filter((x: { product_id: string }) => String(x.product_id) === id) as PdpVariation[];
        const vSet = new Set(v.map((x) => x.id));
        out[id] = {
          variations: v,
          sizes: (sizes.data ?? []).filter((x: { product_id: string }) => String(x.product_id) === id) as PdpSize[],
          matrix: matrix.filter((m) => vSet.has(m.variation_id)),
          tiers: [],
          images: [],
          faqs: [],
        };
      }
      return out;
    },
  });
}
