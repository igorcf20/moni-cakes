// =====================================================================================
// Regras de preço e segurança dos produtos (store_settings.product_compliance) e o menor preço dos últimos 30 dias.
//   useProductCompliance()      regras da loja (com os padrões de src/lib/productCompliance.ts)
//   useSaveProductCompliance()  grava no Admin > Preços e segurança
//   useLowestPrice(id, onSale)  menor preço dos 30 dias antes da promoção atual (RPC product_lowest_prices, pedidos
//                               juntos), só quando a regra vale para o país do visitante
// =====================================================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCountry } from '@/lib/countries';
import { useFeature } from '@/hooks/useFeatures';
import { appliesTo, normalizeCompliance, type ProductCompliance } from '@/lib/productCompliance';

export const PRODUCT_COMPLIANCE_KEY = ['product-compliance'] as const;

export function useProductCompliance() {
  return useQuery({
    queryKey: PRODUCT_COMPLIANCE_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductCompliance> => {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'product_compliance').maybeSingle();
      if (error) throw error;
      return normalizeCompliance(data?.value);
    },
  });
}

export function useSaveProductCompliance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: ProductCompliance) => {
      const { error } = await supabase.from('store_settings')
        .upsert({ key: 'product_compliance', value: normalizeCompliance(next) as any }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCT_COMPLIANCE_KEY }),
  });
}

/** Mostrar o menor preço dos 30 dias no país atual? */
export function useShowsLowestPrice(): boolean {
  const country = useCountry();
  const { data } = useProductCompliance();
  const enabled = useFeature('lowest_price');
  return enabled && !!data && appliesTo(data.lowest_price_30d, country.code);
}

// Vários cartões de produto pedem o menor preço ao mesmo tempo: os pedidos de um mesmo instante vão juntos numa
// só chamada à base (em grupos de 500 produtos).
type Waiter = { resolve: (v: number | null) => void; reject: (e: unknown) => void };
let pending = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = pending;
  pending = new Map();
  timer = null;
  try {
    const ids = [...batch.keys()];
    const found = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await (supabase as any).rpc('product_lowest_prices', { _ids: ids.slice(i, i + 500) });
      if (error) throw error;
      for (const r of (data ?? []) as { product_id: string; lowest_price: number | string }[]) {
        const v = Number(r.lowest_price);
        if (Number.isFinite(v)) found.set(r.product_id, v);
      }
    }
    for (const [id, waiters] of batch) waiters.forEach((w) => w.resolve(found.get(id) ?? null));
  } catch (e) {
    for (const waiters of batch.values()) waiters.forEach((w) => w.reject(e));
  }
}

function loadLowest(id: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const list = pending.get(id) ?? [];
    list.push({ resolve, reject });
    pending.set(id, list);
    if (!timer) timer = setTimeout(flush, 15);
  });
}

/**
 * Menor preço base do produto (moeda base da loja, sem imposto nem acréscimos de cor e tamanho) nos 30 dias antes da
 * promoção atual. onSale = o produto está em promoção agora; sem isso, ou se a regra não vale no país, não pede nada.
 */
export function useLowestPrice(productId: string | null | undefined, onSale: boolean) {
  const show = useShowsLowestPrice();
  return useQuery({
    queryKey: ['lowest-price', productId],
    enabled: show && onSale && !!productId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => loadLowest(productId!),
  });
}
