// Reserva no carrinho no Admin: regras (store_settings.cart_reservations) e reservas a valer.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCartReservations, type CartReservationSettings } from "@/lib/cartReservations";

const sb = supabase as any;
const SETTINGS_KEY = ["cart-reservation-settings"] as const;
const LIST_KEY = ["admin-cart-reservations"] as const;

export type ActiveReservation = {
  holder: string; slot: string; product_id: string; product_name: string | null; quantity: number; requested: number;
  expires_at: string; created_at: string; customer_email: string | null; is_guest: boolean;
};

export function useCartReservationSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<CartReservationSettings> => {
      const { data, error } = await supabase.from("store_settings").select("value").eq("key", "cart_reservations").maybeSingle();
      if (error) throw error;
      return normalizeCartReservations(data?.value);
    },
  });
}

export function useSaveCartReservationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: CartReservationSettings) => {
      const { error } = await supabase.from("store_settings")
        .upsert({ key: "cart_reservations", value: normalizeCartReservations(next) as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useActiveCartReservations() {
  return useQuery({
    queryKey: LIST_KEY,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ActiveReservation[]> => {
      const { data, error } = await sb.rpc("admin_cart_reservations");
      if (error) throw error;
      return (data ?? []) as ActiveReservation[];
    },
  });
}

export function useReleaseCartReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { holder: string; slot: string }) => {
      const { error } = await sb.rpc("admin_release_cart_reservation", { _holder: r.holder, _slot: r.slot });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}
