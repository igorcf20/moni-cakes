import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useProductImages = (productId: string, variationId?: string | null) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["productImages", productId, variationId],
    queryFn: async () => {
      let query = (supabase as any)
        .from("product_images")
        .select("*")
        .eq("product_id", productId);
      
      if (variationId) {
        // We filter by variation_id if provided. 
        // We can also include images where variation_id is null as "general" images if needed, 
        // but the prompt says "show the photos of THAT variation".
        query = query.or(`variation_id.eq.${variationId},variation_id.is.null`);
      } else {
        query = query.is("variation_id", null);
      }

      const { data, error } = await query.order("display_order", { ascending: true });
      
      if (error) throw error;
      
      // If we filtered by variation and found nothing, maybe return general images?
      // Or let the UI handle the default image.
      return data || [];
    },
    enabled: !!productId,
  });

  return { data, isLoading };
};

