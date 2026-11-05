import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useRole = (userId: string | undefined) => {
  const { data: isAdmin = false, isLoading } = useQuery({
    queryKey: ["userRole", userId],
    queryFn: async () => {
      // Use the SECURITY DEFINER has_role function to bypass RLS issues
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId!,
        _role: "admin",
      });
      if (error) {
        console.error("has_role RPC error:", error);
        return false;
      }
      return !!data;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // cache for 5 minutes
  });

  return { isAdmin, isLoading };
};

