// Adicionar ao carrinho a partir de um cartão (página inicial, listagens): sem opções escolhidas.
// Busca o produto e os escalões e monta o mesmo designData da página do produto (nome, foto, peso, preço e
// selectionPricing), para o carrinho de visitante mostrar nome, foto e preço certos (sem sessão não há junção com products).
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { buildDesignData, priceFor, type PdpProduct, type PdpTier } from '@/hooks/useProductPage';

export function useQuickAdd() {
  const { user } = useAuth();
  const { addToCartAsync } = useCart(user?.id);

  return useCallback(async (productId: string, quantity = 1) => {
    const sb = supabase as any;
    const [{ data: product, error }, { data: tiers }] = await Promise.all([
      sb.from('products').select('*').eq('id', productId).eq('is_active', true).maybeSingle(),
      sb.from('product_volume_tiers').select('id,min_meters,price_per_meter,label').eq('product_id', productId).order('min_meters'),
    ]);
    if (error || !product) throw error ?? new Error('product_not_found');
    const p = product as PdpProduct;
    const list = ((tiers ?? []) as PdpTier[]).map((t) => ({ ...t, min_meters: Number(t.min_meters) || 0, price_per_meter: Number(t.price_per_meter) || 0 }));
    const designData = buildDesignData(p, priceFor(p, list, quantity, 0), 0, null, null, p.image ?? null);
    await addToCartAsync({ productId, quantity, designData });
  }, [addToCartAsync]);
}
