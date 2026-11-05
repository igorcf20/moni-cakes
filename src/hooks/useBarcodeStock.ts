// =============================================================================================
// Dados de Admin > Estoque > Entradas e conferência e Etiquetas de código de barras (só admin).
//   useStockUnits          todas as peças com estoque próprio e os seus códigos (src/lib/productLabels.ts), lidas uma vez
//                          para que cada leitura do leitor seja instantânea (sem ida ao servidor por código)
//   useSaveStockEntry      admin_stock_entry (entrada inteira numa transação)
//   useStockEntries        admin_stock_entries (lista paginada)
//   useStockEntryLines     admin_stock_entry_lines (o que uma entrada mudou)
//   useLabelSettings       store_settings.barcode_labels (modelo padrão das etiquetas)
// =============================================================================================
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildStockUnits, normalizeLabelSettings, type LabelSettings, type StockUnit } from "@/lib/productLabels";
import { unitBase } from "@/lib/productFeed";
import type { EntryKind } from "@/lib/stockEntries";

const sb = supabase as any;
const PAGE = 1000;

/** Lê uma tabela inteira em páginas (o servidor devolve no máximo 1000 linhas por pedido). */
async function readAll<T>(table: string, cols: string, order: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    // Ordem única (chave), para as páginas não repetirem nem saltarem linhas.
    let q = sb.from(table).select(cols);
    for (const o of order) q = q.order(o);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

export function useStockUnits(enabled = true) {
  return useQuery({
    queryKey: ["stock-units"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<StockUnit[]> => {
      const [products, variations, sizes, matrix, tiers] = await Promise.all([
        readAll<any>("products", "id, name, price, stock_quantity, image, sku, gtin, internal_code, mpn, is_active", ["name", "id"]),
        readAll<any>("product_variations", "id, product_id, name, price_modifier, stock_quantity, sku, gtin, display_order", ["product_id", "display_order", "id"]),
        readAll<any>("product_sizes", "id, product_id, size_label, price_modifier, stock_quantity, sku, gtin, display_order", ["product_id", "display_order", "id"]),
        readAll<any>("product_variation_size_availability", "variation_id, product_size_id, price_modifier, stock_quantity, sku, gtin", ["variation_id", "product_size_id"]),
        readAll<any>("product_volume_tiers", "id, product_id, min_meters, price_per_meter", ["id"]),
      ]);
      // Preço de 1 unidade como o site cobra (escalão de 1 unidade, senão o preço do produto).
      const priced = products.map((p) => ({ ...p, price: unitBase(p, tiers) }));
      // Combinações só com estoque próprio (as outras seguem a cor ou o tamanho, como no Histórico de estoque).
      return buildStockUnits(priced, variations, sizes, matrix.filter((m) => m.stock_quantity != null || m.sku || m.gtin));
    },
  });
}

export type EntryLineInput = { product_id: string; variation_id: string | null; size_id: string | null; qty: number };
export type EntryResult = { id: string; number: number; lines: number; units_in: number; units_out: number };

export function useSaveStockEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { kind: EntryKind; lines: EntryLineInput[]; supplier: string; document: string; note: string }): Promise<EntryResult> => {
      const { data, error } = await sb.rpc("admin_stock_entry", {
        _kind: a.kind, _lines: a.lines, _supplier: a.supplier.trim() || null, _document: a.document.trim() || null, _note: a.note.trim() || null,
      });
      if (error) throw error;
      return data as EntryResult;
    },
    onSuccess: () => {
      for (const k of ["stock-units", "stock-entries", "stock-movements", "stock-summary", "stock-targets", "admin-catalog-index", "adminProducts"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}

export type StockEntry = {
  id: string; number: number; kind: EntryKind; supplier: string | null; document_ref: string | null; note: string | null;
  lines: number; units_in: number; units_out: number; actor_email: string | null; created_at: string;
};

export function useStockEntries(f: { kind: EntryKind | null; q: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: ["stock-entries", f],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: StockEntry[]; total: number }> => {
      const { data, error } = await sb.rpc("admin_stock_entries", {
        _kind: f.kind, _q: f.q.trim() || null, _limit: f.pageSize, _offset: (f.page - 1) * f.pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as (StockEntry & { total_count: number })[];
      return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
    },
  });
}

export type StockEntryLine = {
  id: number; product_id: string; product_name: string; product_image: string | null; variation_id: string | null; variation_name: string | null;
  size_id: string | null; size_label: string | null; sku: string | null; quantity_before: number | null; quantity_after: number | null; change: number;
};

export function useStockEntryLines(entryId: string | null) {
  return useQuery({
    queryKey: ["stock-entry-lines", entryId],
    enabled: !!entryId,
    queryFn: async (): Promise<StockEntryLine[]> => {
      const { data, error } = await sb.rpc("admin_stock_entry_lines", { _entry_id: entryId });
      if (error) throw error;
      return (data ?? []) as StockEntryLine[];
    },
  });
}

/** Uma entrada pelo id (cabeçalho), lida da tabela (só admin pela RLS). */
export function useStockEntry(entryId: string | null) {
  return useQuery({
    queryKey: ["stock-entries", "one", entryId],
    enabled: !!entryId,
    queryFn: async (): Promise<StockEntry | null> => {
      const { data, error } = await sb.from("stock_entries").select("id, number, kind, supplier, document_ref, note, lines, units_in, units_out, created_at").eq("id", entryId).maybeSingle();
      if (error) throw error;
      return data ? ({ ...data, actor_email: null } as StockEntry) : null;
    },
  });
}

const LABEL_KEY = "barcode_labels";

export function useLabelSettings() {
  return useQuery({
    queryKey: ["store-setting", LABEL_KEY],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LabelSettings> => {
      const { data, error } = await sb.from("store_settings").select("value").eq("key", LABEL_KEY).maybeSingle();
      if (error) throw error;
      return normalizeLabelSettings(data?.value);
    },
  });
}

export function useSaveLabelSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: LabelSettings) => {
      const { error } = await sb.from("store_settings").upsert({ key: LABEL_KEY, value: normalizeLabelSettings(next) }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-setting", LABEL_KEY] }),
  });
}
