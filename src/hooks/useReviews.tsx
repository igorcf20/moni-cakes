import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { shellMessages } from "@/i18n/pagesShell";

interface Review {
  id: string;
  user_id: string;
  product_id: string;
  rating: number;
  title: string;
  comment?: string;
  created_at: string;
  approved: boolean;
  /** Origem ('site' = cliente no site; outro = trazida pela loja de outro canal), compra verificada, foto e resposta da loja. */
  source?: string;
  verified?: boolean;
  image_url?: string | null;
  admin_reply?: string | null;
  customer_name?: string | null;
  user_profiles?: {
    display_name?: string;
    avatar_url?: string;
  };
}

export const useReviews = (productId: string) => {
  const queryClient = useQueryClient();
  const { t } = useMessages(shellMessages);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews_public" as any)
        .select("*")
        .eq("product_id", productId)
        .eq("approved", true)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching reviews:", error);
        throw error;
      }

      const list = (data || []) as any[];
      return list.map((r) => ({
        ...r,
        user_profiles: r.display_name
          ? { display_name: r.display_name, avatar_url: null }
          : null,
      })) as Review[];
    },
  });

  const addReviewMutation = useMutation({
    mutationFn: async (review: { rating: number; title: string; comment?: string; user_id: string; image_url?: string | null }) => {
      const { error } = await supabase
        .from("product_reviews")
        .insert({
          product_id: productId,
          user_id: review.user_id,
          rating: review.rating,
          title: review.title,
          comment: review.comment,
          image_url: review.image_url ?? null, // só fica se a loja aceitar fotos (trigger product_reviews_guard)
          approved: false, // Reviews need moderation by default
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", productId] });
      toast.success(t("reviewSent"));
    },
    onError: (error) => {
      console.error("Error adding review:", error);
      toast.error(t("reviewError"));
    },
  });

  const averageRating = reviews.length > 0 
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
    : 0;
    
  const totalReviews = reviews.length;

  return { 
    reviews, 
    isLoading, 
    averageRating, 
    totalReviews,
    addReview: addReviewMutation.mutate,
    isAdding: addReviewMutation.isPending,
  };
};
