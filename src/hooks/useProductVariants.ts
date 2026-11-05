// =============================================================================================
// Dados da aba Variantes do produto no Admin (src/components/admin/ProductVariantsEditor.tsx): o produto, as cores,
// os tamanhos e a matriz cor x tamanho, mais a gravação de código, código de barras, estoque, venda e foto de cada
// variante na tabela certa (ver src/lib/variants.ts). O servidor valida o formato e a unicidade do código.
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VariantColor, VariantCombo, VariantProduct, VariantRow, VariantSize } from "@/lib/variants";

const sb = supabase as any;

export type VariantData = { product: VariantProduct; colors: VariantColor[]; sizes: VariantSize[]; combos: VariantCombo[] };

export const variantKeys = {
  all: (productId: string) => ["productVariants", productId] as const,
};

export function useProductVariantData(productId: string, enabled = true) {
  return useQuery({
    queryKey: variantKeys.all(productId),
    enabled: enabled && !!productId,
    queryFn: async (): Promise<VariantData> => {
      const [product, colors, sizes] = await Promise.all([
        sb.from("products").select("id,name,sku,gtin,stock_quantity").eq("id", productId).maybeSingle(),
        sb.from("product_variations").select("id,name,color_hex,image_url,sku,gtin,stock_quantity,display_order")
          .eq("product_id", productId).eq("is_active", true).order("display_order"),
        sb.from("product_sizes").select("id,size_label,sku,gtin,stock_quantity,display_order")
          .eq("product_id", productId).eq("is_active", true).order("display_order"),
      ]);
      for (const r of [product, colors, sizes]) if (r.error) throw r.error;
      const c = (colors.data ?? []) as VariantColor[];
      let combos: VariantCombo[] = [];
      if (c.length && (sizes.data ?? []).length) {
        const m = await sb.from("product_variation_size_availability")
          .select("variation_id,product_size_id,is_available,stock_quantity,price_modifier,sku,gtin,image_url")
          .in("variation_id", c.map((x) => x.id));
        if (m.error) throw m.error;
        combos = m.data ?? [];
      }
      return { product: (product.data ?? { id: productId }) as VariantProduct, colors: c, sizes: (sizes.data ?? []) as VariantSize[], combos };
    },
  });
}

/** Códigos já usados na loja (para preencher os vazios sem repetir). */
export async function fetchTakenSkus(): Promise<string[]> {
  const res = await Promise.all(
    ["products", "product_sizes", "product_variations", "product_variation_size_availability"].map((t) =>
      sb.from(t).select("sku").not("sku", "is", null).limit(10000)),
  );
  return res.flatMap((r: any) => (r.data ?? []).map((x: { sku: string }) => x.sku));
}

export type VariantPatch = Partial<{ sku: string | null; gtin: string | null; stock: number | null; available: boolean; image: string | null }>;

/** Grava os campos de uma variante na tabela de onde ela vem. */
export async function saveVariant(row: VariantRow, patch: VariantPatch, productId: string) {
  const fields: Record<string, unknown> = {};
  if ("sku" in patch) fields.sku = patch.sku;
  if ("gtin" in patch) fields.gtin = patch.gtin;
  if ("stock" in patch) fields.stock_quantity = patch.stock;
  let q;
  if (row.kind === "combo") {
    if ("available" in patch) fields.is_available = patch.available;
    if ("image" in patch) fields.image_url = patch.image;
    // Linha nova na matriz: guarda o estoque que o site já mostrava (o do tamanho) e a venda ligada.
    const base = row.isDefault ? { stock_quantity: row.stock ?? 0, is_available: row.available } : {};
    q = sb.from("product_variation_size_availability")
      .upsert({ variation_id: row.variationId, product_size_id: row.sizeId, ...base, ...fields }, { onConflict: "variation_id,product_size_id" });
  } else if (row.kind === "color") {
    q = sb.from("product_variations").update(fields).eq("id", row.variationId);
  } else if (row.kind === "size") {
    if (fields.stock_quantity == null && "stock" in patch) fields.stock_quantity = 0;
    q = sb.from("product_sizes").update(fields).eq("id", row.sizeId);
  } else {
    q = sb.from("products").update(fields).eq("id", productId);
  }
  const { error } = await q;
  if (error) throw error;
}

export function useSaveVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ row, patch }: { row: VariantRow; patch: VariantPatch }) => saveVariant(row, patch, productId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: variantKeys.all(productId) });
      // Abas Cores e Tamanhos e o formulário do produto usam as mesmas linhas.
      qc.invalidateQueries({ queryKey: ["adminVariations", productId] });
      qc.invalidateQueries({ queryKey: ["varSizeAvailability", productId] });
      qc.invalidateQueries({ queryKey: ["adminSizesEdit", productId] });
    },
  });
}

/** Código de erro estável do servidor (sku_taken, sku_invalid, gtin_invalid) ou null. */
export function variantErrorCode(e: unknown): "sku_taken" | "sku_invalid" | "gtin_invalid" | null {
  const msg = String((e as { message?: string })?.message ?? "");
  if (msg.includes("sku_taken")) return "sku_taken";
  if (msg.includes("sku_invalid")) return "sku_invalid";
  if (msg.includes("gtin_invalid")) return "gtin_invalid";
  return null;
}
