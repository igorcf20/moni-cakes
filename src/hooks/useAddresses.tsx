import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMessages } from "@/i18n";
import { ordersMessages } from "@/i18n/orders";

export interface Address {
  id: string;
  user_id: string;
  name: string;
  street: string;
  number?: string | null;
  complement?: string;
  parish?: string | null;
  city: string;
  district: string;
  postal_code: string;
  country: string;
  is_default: boolean;
  is_billing_default?: boolean;
}

export const useAddresses = (userId: string | undefined) => {
  const queryClient = useQueryClient();
  const { t } = useMessages(ordersMessages);

  const { data = [], isLoading } = useQuery({
    queryKey: ["addresses", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", userId!)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Address[];
    },
    enabled: !!userId,
  });

  const addAddress = useMutation({
    mutationFn: async (address: Omit<Address, "id" | "user_id">) => {
      // If new address is default, unset others first
      if (address.is_default) {
        await supabase
          .from("user_addresses")
          .update({ is_default: false })
          .eq("user_id", userId!);
      }

      const { error } = await supabase
        .from("user_addresses")
        .insert({ ...address, user_id: userId! });

      if (error) throw error;
      toast.success(t("addressAdded"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses", userId] });
    },
    onError: () => {
      toast.error(t("addressAddError"));
    },
  });

  const updateAddress = useMutation({
    mutationFn: async ({ id, ...address }: Partial<Address> & { id: string }) => {
      // If updating to default, unset others first
      if (address.is_default) {
        await supabase
          .from("user_addresses")
          .update({ is_default: false })
          .eq("user_id", userId!);
      }

      const { error } = await supabase
        .from("user_addresses")
        .update(address)
        .eq("id", id)
        .eq("user_id", userId!);

      if (error) throw error;
      toast.success(t("addressUpdated"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses", userId] });
    },
    onError: () => {
      toast.error(t("addressUpdateError"));
    },
  });

  const deleteAddress = useMutation({
    mutationFn: async (addressId: string) => {
      const { error } = await supabase
        .from("user_addresses")
        .delete()
        .eq("id", addressId)
        .eq("user_id", userId!);

      if (error) throw error;
      toast.success(t("addressRemoved"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses", userId] });
    },
    onError: () => {
      toast.error(t("addressRemoveError"));
    },
  });

  return {
    addresses: data,
    isLoading,
    addAddress: addAddress.mutate,
    updateAddress: updateAddress.mutate,
    deleteAddress: deleteAddress.mutate,
  };
};
