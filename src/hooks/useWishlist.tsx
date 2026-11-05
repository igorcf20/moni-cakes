import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";

export const useWishlist = (userId: string | undefined) => {
  const queryClient = useQueryClient();
  const { t } = useMessages(accountMessages);

  const { data: wishlistItems = [], isLoading } = useQuery({
    queryKey: ["wishlist", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from("wishlist")
        .select(`
          id,
          product_id,
          created_at,
          products (
            id,
            name,
            image,
            images,
            price,
            description,
            stock_quantity,
            category,
            slug,
            unit_type,
            price_per_meter,
            customizable,
            vat_rate
          )
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false }); // mais recentes primeiro (ordem "Mais recentes" dos favoritos)

      if (error) {
        console.error("Error fetching wishlist:", error);
        throw error;
      }

      return data || [];
    },
    enabled: !!userId,
  });

  const addToWishlist = useMutation({
    mutationFn: async (productId: string) => {
      if (!userId) {
        toast.error(t("wishLoginRequired"));
        throw new Error("User not logged in");
      }

      const { error } = await supabase
        .from("wishlist")
        .upsert(
          {
            user_id: userId,
            product_id: productId,
          },
          {
            onConflict: "user_id,product_id",
            ignoreDuplicates: true,
          }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist", userId] });
      toast.success(t("wishAdded"));
    },
    onError: (error) => {
      if (error.message !== "User not logged in") {
        console.error("Error adding to wishlist:", error);
        toast.error(t("wishAddError"));
      }
    },
  });

  const removeFromWishlist = useMutation({
    mutationFn: async (productId: string) => {
      if (!userId) return;

      const { error } = await supabase
        .from("wishlist")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", productId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wishlist", userId] });
      toast.success(t("wishRemoved"));
    },
    onError: (error) => {
      console.error("Error removing from wishlist:", error);
      toast.error(t("wishRemoveError"));
    },
  });

  const isInWishlist = (productId: string) => {
    return wishlistItems.some((item: any) => item.product_id === productId);
  };

  const toggleWishlist = (productId: string) => {
    if (isInWishlist(productId)) {
      removeFromWishlist.mutate(productId);
    } else {
      addToWishlist.mutate(productId);
    }
  };

  return {
    wishlistItems,
    isLoading,
    addToWishlist: addToWishlist.mutate,
    removeFromWishlist: removeFromWishlist.mutate,
    toggleWishlist,
    isInWishlist,
  };
};
