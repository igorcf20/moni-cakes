import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { ordersMessages } from "@/i18n/orders";
import { orderStatusStyle, paymentMethodLabel } from "@/lib/orderStatusStyles";

interface OrderItem {
  id: string;
  product_id: string | null;
  quantity: number;
  price: number;
  design_data?: any;
  custom_name?: string | null;
  custom_description?: string | null;
  products?: {
    name: string;
    image: string;
    roll_width_cm?: number | null;
  };
}

interface Order {
  id: string;
  user_id: string;
  total: number;
  status: string;
  shipping_address: any;
  coupon_code?: string;
  discount_amount?: number;
  tracking_number?: string;
  payment_method?: string;
  payment_status?: string;
  shipping_cost?: number;
  notes?: string;
  shipped_at?: string;
  delivered_at?: string;
  created_at: string;
  guest_email?: string;
  guest_name?: string;
  guest_phone?: string;
  requires_customer_config?: boolean;
  files_pending?: boolean;
  subtotal_net?: number;
  vat_total?: number;
  order_items?: OrderItem[];
  delivery_method_id?: string | null;
  delivery_methods?: { id: string; name: string; type: string } | null;
}

export type { Order, OrderItem };

export const useOrders = (userId: string | undefined) => {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          delivery_methods:delivery_method_id ( id, name, type ),
          order_items (
            id,
            product_id,
            quantity,
            price,
            design_data,
            products:product_id (name, image, roll_width_cm)
          )
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching orders:", error);
        throw error;
      }

      return data as Order[];
    },
    enabled: !!userId,
  });

  return { data: orders, orders, isLoading };
};

// Admin hook to fetch all orders
export const useAllOrders = () => {
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["allOrders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          delivery_methods:delivery_method_id ( id, name, type ),
          order_items (
            id,
            product_id,
            quantity,
            price,
            design_data,
            products:product_id (name, image, roll_width_cm)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching all orders:", error);
        throw error;
      }

      return data as Order[];
    },
  });

  return { orders, isLoading, refetch };
};

// Create order mutation
export const useCreateOrder = () => {
  const queryClient = useQueryClient();
  const { t } = useMessages(ordersMessages);

  return useMutation({
    mutationFn: async ({
      userId,
      items,
      total,
      shippingAddress,
      shippingCost,
      couponCode,
      discountAmount,
      paymentMethod = "pix",
    }: {
      userId: string;
      items: Array<{ productId: string; quantity: number; price: number; designData?: any }>;
      total: number;
      shippingAddress: any;
      shippingCost: number;
      couponCode?: string;
      discountAmount?: number;
      paymentMethod?: string;
    }) => {
      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          total,
          shipping_address: shippingAddress,
          shipping_cost: shippingCost,
          coupon_code: couponCode,
          discount_amount: discountAmount || 0,
          payment_method: paymentMethod,
          payment_status: "pending",
          status: "pending",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        price: item.price,
        design_data: item.designData,
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Update coupon usage if applicable
      if (couponCode) {
        try {
          await supabase
            .from("coupons")
            .update({ current_uses: supabase.rpc ? 1 : 1 }) // This will be handled manually
            .eq("code", couponCode);
        } catch {
          // Ignore if update fails
        }
      }

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error) => {
      console.error("Error creating order:", error);
      toast.error(t("orderCreateError"));
    },
  });
};

// Update order status (admin)
export const useUpdateOrderStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      status,
      trackingNumber,
      notes,
    }: {
      orderId: string;
      status: string;
      trackingNumber?: string;
      notes?: string;
    }) => {
      const updates: any = { status };

      if (trackingNumber !== undefined) {
        updates.tracking_number = trackingNumber;
      }
      if (notes !== undefined) {
        updates.notes = notes;
      }

      // Set timestamps based on status
      if (status === "shipped") {
        updates.shipped_at = new Date().toISOString();
      } else if (status === "delivered") {
        updates.delivered_at = new Date().toISOString();
      } else if (status === "paid") {
        updates.payment_status = "paid";
      }

      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", orderId);

      if (error) throw error;

      // Log status change
      await supabase.from("order_status_history").insert({
        order_id: orderId,
        status,
        notes,
      });

      // Fire-and-forget: notify the customer (and admin for cancellations).
      try {
        const { notifyOrderStatusChange } = await import("@/lib/notifyOrderEmail");
        notifyOrderStatusChange(orderId, status, { reason: notes }).catch(() => {});
      } catch (_) {}
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allOrders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Status atualizado com sucesso");
    },
    onError: (error) => {
      console.error("Error updating order:", error);
      toast.error("Erro ao atualizar pedido");
    },
  });
};

// Order status labels and colors for the Admin (pt-BR). On the site use orderStatusLabel(status, locale)
// and paymentMethodLabel(method, locale) from src/lib/orderStatusStyles.
export const orderStatusConfig: Record<string, { label: string; color: string }> = Object.fromEntries(
  Object.entries(orderStatusStyle).map(([k, v]) => [k, { label: v.label, color: v.dot }])
);

export { paymentMethodLabel };

// Payment method labels for the Admin (pt-BR): the shared labels plus more detail where the Admin needs it.
export const paymentMethodLabels: Record<string, string> = {
  ...Object.fromEntries(
    ["pix", "card", "credit_card", "boleto", "mercado_pago", "transfer", "mbway", "reference", "on_delivery"].map((m) => [m, paymentMethodLabel(m)])
  ),
  multibanco: "Multibanco / Referência",
  viva: "Viva Wallet (Cartão / MB WAY / Multibanco)",
};
