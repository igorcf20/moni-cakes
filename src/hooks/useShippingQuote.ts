// Frete por transportadora (Admin > Frete e entrega): a loja tem formas de envio ativas? E quanto custa cada uma
// para este endereço e este carrinho? A conta é feita no servidor (função shipping-quote); aqui só se mostra.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ShippingQuoteOption = {
  service_id: string; carrier: string; name: string; name_i18n: Record<string, string>; description_i18n: Record<string, string>;
  price_cents: number; currency: string; free: boolean; days_min: number | null; days_max: number | null; source: 'table' | 'api';
};
export type ShippingQuote = { currency: string; weight_kg: number; region: string | null; options: ShippingQuoteOption[] };
export type QuoteLine = { product_id: string; quantity: number; price: number; design_data?: unknown };

/** true quando há pelo menos uma forma de envio ligada (senão o checkout usa as formas de entrega antigas). */
export function useHasShippingServices() {
  return useQuery({
    queryKey: ['shippingServicesActive'],
    queryFn: async () => {
      const { count, error } = await (supabase as any).from('shipping_services').select('id', { count: 'exact', head: true }).eq('is_active', true);
      if (error) return false; // tabela ainda não existe: comportamento antigo
      return (count ?? 0) > 0;
    },
    staleTime: 5 * 60_000,
  });
}

export function useShippingQuote(opts: {
  enabled: boolean; country: string; postalCode: string; region: string; city: string; items: QuoteLine[];
}) {
  const key = opts.items.map((i) => `${i.product_id}:${i.quantity}:${i.price}`).join('|');
  return useQuery({
    queryKey: ['shippingQuote', opts.country, opts.postalCode, opts.region, opts.city, key],
    enabled: opts.enabled && !!opts.postalCode && opts.items.length > 0,
    queryFn: async (): Promise<ShippingQuote> => {
      const { data, error } = await supabase.functions.invoke('shipping-quote', {
        body: {
          country_code: opts.country,
          address: { postal_code: opts.postalCode, region: opts.region, city: opts.city },
          items: opts.items,
        },
      });
      if (error) throw error;
      return data as ShippingQuote;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
