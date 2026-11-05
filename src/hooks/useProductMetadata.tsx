import { useQuery } from "@tanstack/react-query";

interface ProductMetadata {
  title: string;
  description: string;
  image: string;
  price: string;
  category: string;
}

export const useProductMetadata = (productId: string | ProductMetadata) => {
  // If called with an object (SEO metadata), the query stays disabled
  const isId = typeof productId === 'string';

  const { data, isLoading } = useQuery({
    enabled: isId,
    queryKey: ["productMetadata", isId ? productId : null],
    queryFn: async () => {
      return {
        averageRating: 0,
        reviewCount: 0,
        viewCount: 0,
        salesCount: 0,
      };
    },
  });

  return { data, isLoading };
};
