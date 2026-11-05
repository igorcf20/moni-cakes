import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Variation {
  id: string;
  product_id: string;
  name: string;
  color_hex: string | null;
  image_url: string | null;
  display_order: number;
  price_modifier?: number | null;
}

interface ProductSize {
  id: string;
  size_label: string;
  stock_quantity: number;
  display_order: number;
  price_modifier?: number | null;
  is_active: boolean;
}

interface SizeAvailability {
  product_size_id: string;
  is_available: boolean;
  stock_quantity: number;
  price_modifier?: number | null;
}

interface VariationSelectorProps {
  productId: string;
  selectedVariation: Variation | null;
  onVariationChange: (variation: Variation | null) => void;
  selectedSize: string | null;
  onSizeChange: (size: string | null) => void;
  onStockInfo: (hasStock: boolean, qty: number) => void;
  onSizePriceModifier?: (mod: number) => void;
  hideSizes?: boolean;
}

const VariationSelector = ({
  productId,
  selectedVariation,
  onVariationChange,
  selectedSize,
  onSizeChange,
  onStockInfo,
  onSizePriceModifier,
  hideSizes = false,
}: VariationSelectorProps) => {
  const { data: variations = [] } = useQuery({
    queryKey: ["productVariations", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variations")
        .select("*")
        .eq("product_id", productId)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data as Variation[];
    },
    enabled: !!productId,
  });

  const { data: productSizes = [] } = useQuery({
    queryKey: ["productSizesForVar", productId],
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

  const { data: availability = [] } = useQuery({
    queryKey: ["variationSizeAvailability", selectedVariation?.id],
    queryFn: async () => {
      if (!selectedVariation) return [];
      const { data, error } = await (supabase as any)
        .from("product_variation_size_availability")
        .select("product_size_id, is_available, stock_quantity, price_modifier")
        .eq("variation_id", selectedVariation.id);
      if (error) throw error;
      return (data || []) as SizeAvailability[];
    },
    enabled: !!selectedVariation?.id,
  });

  // Merge product sizes with this variation's availability map.
  // If the variation has no availability row for a size, default to AVAILABLE with the
  // product-level stock (so old products keep working until admin configures the matrix).
  const sizes = productSizes.map((s) => {
    const a = availability.find((x) => x.product_size_id === s.id);
    const isAvail = a ? a.is_available : true;
    const stock = a ? a.stock_quantity : s.stock_quantity;
    const varSizeMod = a ? Number(a.price_modifier || 0) : 0;
    return { ...s, _available: isAvail, _stock: stock, _varSizeMod: varSizeMod };
  });

  // Auto-select first variation
  useEffect(() => {
    if (variations.length > 0 && !selectedVariation) {
      onVariationChange(variations[0]);
    }
  }, [variations]);

  // Reset size when variation changes
  useEffect(() => {
    onSizeChange(null);
  }, [selectedVariation?.id]);

  // Report stock info to parent
  useEffect(() => {
    if (!selectedVariation) {
      onStockInfo(true, 0);
      return;
    }
    if (!selectedSize) {
      if (sizes.length === 0) {
        onStockInfo(true, 0);
        return;
      }
      const totalStock = sizes.reduce((sum, s) => sum + (s._available ? s._stock : 0), 0);
      onStockInfo(totalStock > 0, totalStock);
      return;
    }
    const sizeData = sizes.find((s) => s.size_label === selectedSize);
    const ok = !!sizeData && sizeData._available && sizeData._stock > 0;
    onStockInfo(ok, sizeData?._stock || 0);
  }, [selectedSize, sizes, selectedVariation]);

  // Report per-variation size modifier upstream so the price can update.
  useEffect(() => {
    if (!onSizePriceModifier) return;
    if (!selectedVariation || !selectedSize) { onSizePriceModifier(0); return; }
    const s = sizes.find((x) => x.size_label === selectedSize);
    onSizePriceModifier(s ? Number(s._varSizeMod || 0) + Number(s.price_modifier || 0) : 0);
  }, [selectedSize, selectedVariation?.id, sizes.map(s => `${s.id}:${s._varSizeMod}:${s.price_modifier}`).join(",")]);

  if (variations.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Variation picker with photos */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Variação{selectedVariation ? `: ${selectedVariation.name}` : ""}
        </label>
        <div className="flex flex-wrap gap-2">
          {variations.map((variation) => {
            const isSelected = selectedVariation?.id === variation.id;
            const mod = Number(variation.price_modifier || 0);
            const tooltip = `${variation.name}${mod !== 0 ? ` (${mod > 0 ? "+" : ""}${mod.toFixed(2).replace(".", ",")} €)` : ""}`;
            return (
              <button
                key={variation.id}
                onClick={() => onVariationChange(variation)}
                title={tooltip}
                aria-label={tooltip}
                className={cn(
                  "relative group rounded-full border-2 overflow-hidden transition-all duration-200",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30 shadow-md"
                    : "border-border hover:border-primary/50 hover:shadow-sm"
                )}
              >
                {variation.image_url ? (
                  <div className="w-9 h-9 sm:w-10 sm:h-10">
                    <img
                      src={variation.image_url}
                      alt={variation.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center"
                    style={{ backgroundColor: variation.color_hex || "hsl(var(--muted))" }}
                  >
                    {!variation.color_hex && (
                      <span className="text-[9px] text-muted-foreground px-1 truncate">{variation.name}</span>
                    )}
                  </div>
                )}

                {isSelected && (
                  <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center ring-1 ring-background">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Size selector for selected variation */}
      {!hideSizes && selectedVariation && sizes.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Tamanho</label>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => {
              const outOfStock = !size._available || size._stock <= 0;
              const isSelected = selectedSize === size.size_label;
              const sMod = Number(size.price_modifier || 0);
              return (
                <button
                  key={size.id}
                  onClick={() => !outOfStock && onSizeChange(size.size_label)}
                  disabled={outOfStock}
                  className={cn(
                    "relative min-w-[3.5rem] px-3 py-2 rounded-lg border text-sm font-medium transition-all flex flex-col items-center leading-tight",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : outOfStock
                      ? "border-border bg-muted text-muted-foreground line-through opacity-50 cursor-not-allowed"
                      : "border-border bg-card hover:border-primary cursor-pointer"
                  )}
                  title={outOfStock ? "Indisponível" : undefined}
                  aria-label={outOfStock ? `${size.size_label} indisponível` : size.size_label}
                >
                  <span>{size.size_label}</span>
                  {sMod !== 0 && (
                    <span className={cn("text-[10px] font-semibold", isSelected ? "text-primary-foreground/90" : (sMod > 0 ? "text-primary" : "text-emerald-500"))}>
                      {sMod > 0 ? "+" : ""}{sMod.toFixed(2).replace(".", ",")} €
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default VariationSelector;
