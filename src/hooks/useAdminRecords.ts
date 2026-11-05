// Registos únicos do Admin para as páginas próprias (pedido, cliente). As chaves partilham a cache das listas:
// "allOrders" (Admin > Pedidos) e "admin-customers-profiles" (Admin > Clientes), para tudo se atualizar junto.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/hooks/useOrders";

const ORDER_SELECT = `
  *,
  delivery_methods:delivery_method_id ( id, name, type ),
  order_items ( id, product_id, quantity, price, vat_rate, custom_name, custom_description, design_data, sku, products:product_id (name, image, roll_width_cm) )
`;

export function useAdminOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["allOrders", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as (Order & Record<string, any>) | null;
    },
  });
}

export type AdminCustomerRow = {
  user_id: string; email: string | null; full_name: string | null; phone: string | null; tax_id: string | null;
  tax_id_country: string | null; created_at: string; last_sign_in_at: string | null; is_admin: boolean;
};

/** Clientes com e-mail (RPC admin_list_customers, só para administradores). */
export function useAdminCustomers() {
  return useQuery({
    queryKey: ["admin-customers-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_list_customers");
      if (error) throw error;
      return (data || []) as AdminCustomerRow[];
    },
  });
}

export function useAdminCustomer(userId: string | undefined) {
  const q = useAdminCustomers();
  return { ...q, customer: q.data?.find((c) => c.user_id === userId) ?? null };
}
