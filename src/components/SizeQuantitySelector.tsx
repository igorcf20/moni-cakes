import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import QuantitySelector from "@/components/QuantitySelector";
import { cn } from "@/lib/utils";

export type SizeQuantity = { label: string; quantity: number; modifier: number; stock: number };

export default function SizeQuantitySelector({ productId, variationId, values, onChange, onReadinessChange }: {
  productId: string; variationId?: string; values: SizeQuantity[]; onChange: (values: SizeQuantity[]) => void;
  onReadinessChange?: (ready: boolean) => void;
}) {
  const sizes = useQuery({ queryKey: ["productSizes", productId], queryFn: async () => {
    const { data, error } = await supabase.from("product_sizes").select("*").eq("product_id", productId).eq("is_active", true).order("display_order");
    if (error) throw error;
    return data;
  } });
  const availability = useQuery({ queryKey: ["variationSizeAvailability", variationId], enabled: !!variationId, queryFn: async () => {
    const { data, error } = await supabase.from("product_variation_size_availability").select("product_size_id,is_available,stock_quantity,price_modifier").eq("variation_id", variationId!);
    if (error) throw error;
    return data;
  } });
  const ready = !sizes.isPending && !sizes.error && (!variationId || (!availability.isPending && !availability.error)) && values.every(value => {
    const size = sizes.data?.find(s => s.size_label === value.label);
    const matrix = variationId && size ? availability.data?.find(a => a.product_size_id === size.id) : undefined;
    return !!size && matrix?.is_available !== false && Number.isSafeInteger(value.quantity) && value.quantity > 0 && value.quantity <= (matrix?.stock_quantity ?? size.stock_quantity);
  });
  useEffect(() => { onReadinessChange?.(ready); }, [ready, onReadinessChange]);
  if (sizes.isLoading || (variationId && availability.isLoading)) return <p role="status">A carregar tamanhos…</p>;
  if (sizes.error || availability.error) return <p role="alert">Não foi possível consultar os tamanhos e o stock. Atualize a página antes de comprar.</p>;
  if (!sizes.data?.length) return null;
  return <section className="space-y-3" aria-label="Tamanhos e quantidades">
    <p className="text-sm font-medium">Tamanhos e quantidades</p>
    <p className="text-xs text-muted-foreground">Selecione os tamanhos desejados. Cada tamanho começa com 1 unidade.</p>
    <div className="flex flex-wrap gap-2">{sizes.data.map(size => {
      const matrix = variationId ? availability.data?.find(a => a.product_size_id === size.id) : undefined;
      const stock = matrix?.stock_quantity ?? size.stock_quantity;
      const disabled = matrix?.is_available === false || stock <= 0;
      const selected = values.some(v => v.label === size.size_label);
      const modifier = Number(size.price_modifier || 0) + Number(matrix?.price_modifier || 0);
      return <Button key={size.id} type="button" variant="outline" aria-pressed={selected} disabled={disabled}
        className={cn("min-h-11 flex-col h-auto min-w-14", selected && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}
        onClick={() => onChange(selected ? values.filter(v => v.label !== size.size_label) : [...values, { label: size.size_label, quantity: 1, modifier, stock }])}>
        {size.size_label}{modifier !== 0 && <span className="text-[10px]">{modifier > 0 ? "+" : ""}{modifier.toFixed(2).replace(".", ",")} €</span>}
        {disabled && <span className="text-[10px]">Indisponível</span>}
      </Button>;
    })}</div>
    {values.map(value => <div key={value.label} className="rounded-lg border p-3 space-y-2" role="group" aria-label={`Quantidade do tamanho ${value.label}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Tamanho {value.label}</span>
        <Button type="button" variant="ghost" onClick={() => onChange(values.filter(v => v.label !== value.label))} aria-label={`Remover tamanho ${value.label}`}>Remover</Button>
      </div>
      <QuantitySelector quantity={value.quantity} max={value.stock} onQuantityChange={quantity => onChange(values.map(v => v.label === value.label ? { ...v, quantity } : v))} />
    </div>)}
    {values.length > 0 && <p className="text-sm" role="status">{values.reduce((sum, v) => sum + v.quantity, 0)} unidades em {values.length} tamanhos</p>}
  </section>;
}
