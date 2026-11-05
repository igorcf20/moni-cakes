// Carrinhos abandonados (src/lib/cartRecovery.ts):
//   useAbandonedCarts(horas, dias)   lista do Admin (admin_abandoned_carts)
//   useCartRecovered(dias)           clientes contatados que voltaram a comprar (admin_abandoned_cart_recovered)
//   useMarkContacted() / useClearContact()   registo do contato feito pela loja (abandoned_cart_contacts)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ContactChannel } from '@/lib/cartRecovery';

const sb = supabase as any;
const KEY = ['abandoned-carts'] as const;

export type CartProduct = { id: string; name: string; image: string | null; quantity: number; price: number | null };
export type AbandonedCart = {
  user_id: string; email: string; full_name: string | null; phone: string | null; items: number; units: number;
  value: number; started_at: string; last_activity: string; products: CartProduct[];
  contacted_at: string | null; channel: ContactChannel | null; note: string | null;
};

export function useAbandonedCarts(hours: number, days: number) {
  return useQuery({
    queryKey: [...KEY, hours, days],
    queryFn: async (): Promise<AbandonedCart[]> => {
      const { data, error } = await sb.rpc('admin_abandoned_carts', { _after_hours: hours, _days: days });
      if (error) throw error;
      return ((data ?? []) as AbandonedCart[]).map((r) => ({ ...r, value: Number(r.value) || 0, products: r.products ?? [] }));
    },
  });
}

export function useCartRecovered(days: number) {
  return useQuery({
    queryKey: [...KEY, 'recovered', days],
    queryFn: async () => {
      const { data, error } = await sb.rpc('admin_abandoned_cart_recovered', { _days: days });
      if (error) throw error;
      const r = (data ?? [])[0] ?? {};
      return { customers: Number(r.customers) || 0, orders: Number(r.orders) || 0, revenue: Number(r.revenue) || 0 };
    },
  });
}

export function useMarkContacted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { userId: string; channel: ContactChannel; note?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await sb.from('abandoned_cart_contacts').upsert({
        user_id: v.userId, channel: v.channel, note: v.note?.trim() || null,
        contacted_at: new Date().toISOString(), contacted_by: auth.user?.id ?? null,
      }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useClearContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await sb.from('abandoned_cart_contacts').delete().eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
