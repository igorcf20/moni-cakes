import { useQuery } from "@tanstack/react-query";

interface FrameOption {
  id: string;
  name: string;
  material: string;
  base_price: number;
  image_url?: string;
  color?: string;
}

export const useFrameOptions = () => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["frameOptions"],
    queryFn: async () => {
      return [] as FrameOption[];
    },
  });

  return { data, isLoading };
};

export const useProductFramePricing = (productId: string) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ["productFramePricing", productId],
    queryFn: async () => {
      return [];
    },
  });

  return { data, isLoading };
};
