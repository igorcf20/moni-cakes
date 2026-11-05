import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "./useCart";
import { useCreateOrder } from "./useOrders";
import { calculateShippingByDistrict, getFreeShippingThreshold } from "./useShipping";
import { toast } from "sonner";

interface CheckoutData {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    nif?: string;
  };
  shippingAddress: {
    id?: string;
    name: string;
    street: string;
    number?: string;
    complement?: string;
    parish?: string;
    city: string;
    district: string;
    postal_code: string;
  };
  paymentMethod: "multibanco" | "mbway" | "transfer" | "on_delivery";
  couponCode?: string;
  discountAmount?: number;
}

export const useCheckout = (userId: string | undefined) => {
  const navigate = useNavigate();
  const { cartItems, subtotal, totalWeight, clearCart } = useCart(userId);
  const createOrder = useCreateOrder();

  const [isProcessing, setIsProcessing] = useState(false);
  const [shippingCost, setShippingCost] = useState(0);
  const [estimatedDays, setEstimatedDays] = useState({ min: 0, max: 0 });
  const [freeShipping, setFreeShipping] = useState(false);

  // Calculate shipping when district changes
  const calculateShipping = useCallback(
    async (district: string) => {
      if (!district) return;

      const result = await calculateShippingByDistrict(totalWeight, district, subtotal);

      if (result) {
        setShippingCost(result.cost);
        setEstimatedDays(result.estimatedDays);
        setFreeShipping(result.freeShipping);
      }
    },
    [totalWeight, subtotal]
  );

  const getFreeShippingInfo = useCallback((district: string) => {
    const threshold = getFreeShippingThreshold(district);
    const remaining = Math.max(0, threshold - subtotal);
    return { threshold, remaining, qualified: remaining === 0 };
  }, [subtotal]);

  // Process the order
  const processOrder = useCallback(
    async (data: CheckoutData) => {
      if (!userId) {
        toast.error("Tem de iniciar sessão para finalizar a compra");
        navigate("/auth");
        return null;
      }

      if (cartItems.length === 0) {
        toast.error("Seu carrinho está vazio");
        return null;
      }

      setIsProcessing(true);

      try {
        // Prepare order items
        const items = cartItems.map((item) => {
          const v: any = (item as any).product_variations;
          const enrichedDesign = {
            ...(item.design_data || {}),
            ...(v?.name ? { variation: { id: v.id, name: v.name, color_hex: v.color_hex, image_url: v.image_url } } : {}),
            ...(item.size_label ? { size_label: item.size_label } : {}),
            product_name: item.products?.name,
            product_image: item.products?.image,
          };
          return {
            productId: item.product_id,
            quantity: item.quantity,
            price: item.products.price,
            designData: enrichedDesign,
          };
        });

        // Calculate final total
        const discount = data.discountAmount || 0;
        const total = subtotal - discount + shippingCost;

        // Create order
        const order = await createOrder.mutateAsync({
          userId,
          items,
          total,
          shippingAddress: data.shippingAddress,
          shippingCost,
          couponCode: data.couponCode,
          discountAmount: discount,
          paymentMethod: data.paymentMethod,
        });

        // Clear cart after successful order
        clearCart();

        // Navigate to success page
        navigate(`/pedido/${order.id}/sucesso`);

        return order;
      } catch (error) {
        console.error("Error processing order:", error);
        toast.error("Erro ao processar pedido. Tente novamente.");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [userId, cartItems, subtotal, shippingCost, createOrder, clearCart, navigate]
  );

  return {
    cartItems,
    subtotal,
    totalWeight,
    shippingCost,
    estimatedDays,
    freeShipping,
    total: subtotal + shippingCost,
    isProcessing,
    calculateShipping,
    getFreeShippingInfo,
    processOrder,
  };
};
