import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProductCard from "./ProductCard";
import SkeletonProductCard from "./SkeletonProductCard";

interface RelatedProductsProps {
  productId: string;
  category?: string;
}

const RelatedProducts = ({ productId, category }: RelatedProductsProps) => {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["related-products", productId, category],
    queryFn: async () => {
      // First, try same category
      if (category) {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .neq("id", productId)
          .eq("is_active", true)
          .eq("category", category)
          .gt("stock_quantity", 0)
          .limit(4);
        if (error) throw error;
        if (data && data.length > 0) return data;
      }
      // Fallback: any other in-stock products
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .neq("id", productId)
        .gt("stock_quantity", 0)
        .limit(4);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8">Produtos Relacionados</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => (
              <SkeletonProductCard key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="py-12 sm:py-16 bg-muted/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8">Também pode gostar</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              image={product.image || product.images?.[0] || ''}
              title={product.name}
              price={product.price}
              description={product.description || ''}
              stock_quantity={product.stock_quantity || 0}
              isNew={(product as any).is_new === true}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default RelatedProducts;
