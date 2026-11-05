// =====================================================================================
// useBrand(): a marca da loja (nome, frase, logos, cores, fontes) para qualquer componente.
// Lê de uma vez as chaves de store_settings que a compõem (ver src/theme/brand.ts) e junta
// com os valores-base de src/config/store.ts. Enquanto carrega, devolve os valores-base.
//
//   const brand = useBrand();      brand.name, brand.logos.icon, brand.theme...
//   const name = useStoreName();   só o nome (atalho para títulos e textos)
//
// O Admin, depois de gravar, invalida BRAND_QUERY_KEY para o site todo atualizar.
// =====================================================================================
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { STORE_DEFAULTS } from '@/config/store';
import { mergeBrand, type LegacyBrand, type SavedBrand } from '@/theme/brand';
import type { StoreBrand } from '@/theme/types';

export const BRAND_QUERY_KEY = ['brand'] as const;

const KEYS = ['store_brand', 'store_info', 'visual_settings', 'seo_settings'] as const;

type Row = { key: string; value: unknown };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const s = (v: unknown) => (typeof v === 'string' ? v : undefined);

async function fetchBrand(): Promise<StoreBrand> {
  const { data, error } = await supabase.from('store_settings').select('key, value').in('key', [...KEYS]);
  if (error) throw error;
  const byKey = new Map((data as Row[] | null ?? []).map((r) => [r.key, obj(r.value)]));
  const info = byKey.get('store_info') ?? {};
  const visual = byKey.get('visual_settings') ?? {};
  const seo = byKey.get('seo_settings') ?? {};
  const legacy: LegacyBrand = {
    name: s(info.name),
    primaryColor: s(visual.primary_color),
    logoUrl: s(visual.logo_url),
    description: s(seo.meta_description),
    favicon: s(seo.favicon_url),
  };
  return mergeBrand(STORE_DEFAULTS, (byKey.get('store_brand') as SavedBrand | undefined) ?? null, legacy);
}

export function useBrandQuery() {
  return useQuery({ queryKey: BRAND_QUERY_KEY, queryFn: fetchBrand, staleTime: 5 * 60_000 });
}

export function useBrand(): StoreBrand {
  return useBrandQuery().data ?? STORE_DEFAULTS;
}

export const useStoreName = () => useBrand().name;
