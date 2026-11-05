import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useSavedDesigns = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["savedDesigns", userId],
    queryFn: async () => {
      return [];
    },
    enabled: !!userId,
  });

  const saveDesign = useMutation({
    mutationFn: async (design: any) => {
      toast.success("Design salvo (mock)");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedDesigns", userId] });
    },
  });

  const deleteDesign = useMutation({
    mutationFn: async (designId: string) => {
      toast.success("Design removido (mock)");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedDesigns", userId] });
    },
  });

  return {
    savedDesigns: data,
    isLoading,
    saveDesign: saveDesign.mutate,
    deleteDesign: deleteDesign.mutate,
  };
};
