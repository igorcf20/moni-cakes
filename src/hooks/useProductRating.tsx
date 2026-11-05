import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useProductRating = (productId?: string) => {
  const { data } = useQuery({
    queryKey: ["product-rating", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_reviews_public")
        .select("rating")
        .eq("product_id", productId)
        .eq("approved", true);
      if (error) throw error;
      const list = (data || []) as { rating: number }[];
      const count = list.length;
      const average = count > 0 ? list.reduce((s, r) => s + Number(r.rating || 0), 0) / count : 0;
      return { average, count };
    },
  });
  return { average: data?.average ?? 0, count: data?.count ?? 0 };
};