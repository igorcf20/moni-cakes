// =============================================================================================
// Campos extra no checkout (recurso checkout_fields). Regras puras em src/lib/checkoutFields.ts.
//   useCheckoutFields(país)   campos ativos que o cliente deste país vê (checkout)
//   useAdminCheckoutFields    todos os campos (Admin > Campos do checkout)
//   useSaveCheckoutField / useDeleteCheckoutField / useMoveCheckoutField
//   useCheckoutFieldUsage     pedidos dos últimos 30 dias com cada campo e o valor que renderam
// Migration 20261007060000_checkout_fields.sql.
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatures";
import { fieldsFor, normalizeField, orderAnswerLines, type CheckoutField } from "@/lib/checkoutFields";

const sb = supabase as any;
const KEY = ["checkout-fields"] as const;

async function loadFields(activeOnly: boolean): Promise<CheckoutField[]> {
  let q = sb.from("checkout_fields").select("*").order("display_order").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalizeField);
}

export function useCheckoutFields(countryCode: string) {
  const on = useFeature("checkout_fields");
  const q = useQuery({ queryKey: [...KEY, "public"], enabled: on, staleTime: 5 * 60_000, queryFn: () => loadFields(true) });
  return { ...q, data: on ? fieldsFor(q.data ?? [], countryCode) : [] };
}

export function useAdminCheckoutFields() {
  return useQuery({ queryKey: [...KEY, "admin"], queryFn: () => loadFields(false) });
}

const toRow = (f: CheckoutField) => ({
  name: f.name.trim(), kind: f.kind, label_i18n: f.label_i18n, help_i18n: f.help_i18n,
  options: f.kind === "select" ? f.options : [], price: f.kind === "select" ? 0 : f.price,
  required: f.required, max_length: f.max_length, countries: f.countries, is_active: f.is_active, display_order: f.display_order,
});

export function useSaveCheckoutField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: CheckoutField): Promise<string> => {
      if (f.id) {
        const { error } = await sb.from("checkout_fields").update(toRow(f)).eq("id", f.id);
        if (error) throw error;
        return f.id;
      }
      const { data, error } = await sb.from("checkout_fields").insert(toRow(f)).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCheckoutField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("checkout_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Troca a posição de dois campos (setas da lista). A ordem é regravada 10, 20, 30... para não haver empates. */
export function useMoveCheckoutField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fields, from, to }: { fields: CheckoutField[]; from: number; to: number }) => {
      const next = [...fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      for (const [i, f] of next.entries()) {
        const order = (i + 1) * 10;
        if (f.display_order === order) continue;
        const { error } = await sb.from("checkout_fields").update({ display_order: order }).eq("id", f.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export type FieldUsage = { orders: number; amount: number; byField: Record<string, { orders: number; amount: number }> };

export function useCheckoutFieldUsage() {
  return useQuery({
    queryKey: [...KEY, "usage"],
    queryFn: async (): Promise<FieldUsage> => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await sb.from("orders").select("checkout_fields, extras_amount, status")
        .gte("created_at", since).not("checkout_fields", "is", null).neq("status", "cancelled").limit(2000);
      if (error) throw error;
      const out: FieldUsage = { orders: 0, amount: 0, byField: {} };
      for (const o of data ?? []) {
        const lines = orderAnswerLines(o.checkout_fields);
        if (!lines.length) continue;
        out.orders += 1;
        out.amount += Number(o.extras_amount || 0);
        for (const l of lines) {
          const u = (out.byField[l.field_id] ??= { orders: 0, amount: 0 });
          u.orders += 1;
          u.amount += l.price;
        }
      }
      out.amount = Math.round(out.amount * 100) / 100;
      return out;
    },
  });
}
