import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SizeSelectorProps {
  productId: string;
  selectedSize: string | null;
  onSizeChange: (size: string) => void;
}

interface ProductSize {
  id: string;
  size_label: string;
  stock_quantity: number;
  display_order: number;
  is_active: boolean;
  price_modifier?: number | null;
}

const SizeSelector = ({ productId, selectedSize, onSizeChange }: SizeSelectorProps) => {
  const { data: sizes = [] } = useQuery({
    queryKey: ["productSizes", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_sizes")
        .select("*")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data as ProductSize[];
    },
    enabled: !!productId,
  });

  if (sizes.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Tamanho</label>
      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const outOfStock = size.stock_quantity <= 0;
          const isSelected = selectedSize === size.size_label;
          const mod = Number(size.price_modifier || 0);
          return (
            <button
              key={size.id}
              onClick={() => !outOfStock && onSizeChange(size.size_label)}
              disabled={outOfStock}
              className={cn(
                "min-w-[3rem] px-3 py-2 rounded-md border text-sm font-medium transition-all flex flex-col items-center leading-tight",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : outOfStock
                  ? "border-border bg-muted text-muted-foreground line-through opacity-50 cursor-not-allowed"
                  : "border-border bg-card hover:border-primary cursor-pointer"
              )}
            >
              <span>{size.size_label}</span>
              {mod !== 0 && (
                <span className={cn("text-[10px] font-semibold", isSelected ? "text-primary-foreground/90" : (mod > 0 ? "text-primary" : "text-emerald-500"))}>
                  {mod > 0 ? "+" : ""}{mod.toFixed(2).replace(".", ",")} €
                </span>
              )}
              {outOfStock && (
                <span className="block text-[10px] no-underline">Esgotado</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SizeSelector;
