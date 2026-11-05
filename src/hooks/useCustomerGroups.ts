// =============================================================================================
// Grupos de clientes e tabelas de preço (recurso customer_groups). Conta do preço em src/lib/customerGroups.ts.
//   Loja    useMyGroupPricing (carrinho e página do produto: grupo do cliente com sessão e os preços dos produtos)
//   Admin   useCustomerGroups (lista com membros e preços), useSaveCustomerGroup, useDeleteCustomerGroup,
//           useGroupMembers + useSetCustomerGroup (cliente entra ou sai), useGroupPrices + useSaveGroupPrices,
//           useAdminCustomerOptions (clientes para escolher), useCustomerGroupOf (grupo de um cliente)
// =============================================================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeGroupPricing, type GroupPricing } from "@/lib/customerGroups";
import { useFeature } from "@/hooks/useFeatures";

const sb = supabase as any;
const EMPTY: GroupPricing = { group: null, prices: [] };

/* ---------- Loja ---------- */

/** Grupo do cliente com sessão e os preços da tabela para estes produtos. Só mostra: o servidor confere no pedido. */
export function useMyGroupPricing(productIds: string[]) {
  const on = useFeature("customer_groups");
  const key = [...new Set(productIds.map(String))].sort();
  return useQuery({
    queryKey: ["my-group-pricing", key.join(",")],
    enabled: on && key.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<GroupPricing> => {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) return EMPTY;
      const { data, error } = await sb.rpc("my_group_pricing", { _product_ids: key });
      if (error) return EMPTY;
      return normalizeGroupPricing(data);
    },
    placeholderData: EMPTY,
  });
}

/* ---------- Admin ---------- */

export type CustomerGroup = {
  id: string;
  name: string;
  name_i18n: Record<string, string>;
  description: string | null;
  discount_percent: number;
  is_active: boolean;
  created_at: string;
  members: number;
  prices: number;
};

export type CustomerGroupInput = Pick<CustomerGroup, "name" | "name_i18n" | "description" | "discount_percent" | "is_active"> & { id?: string };

const GROUPS_KEY = ["customer-groups"] as const;

export function useCustomerGroups() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: async (): Promise<CustomerGroup[]> => {
      const [groups, members, prices] = await Promise.all([
        sb.from("customer_groups").select("*").order("name"),
        sb.from("customer_group_members").select("group_id").limit(50000),
        sb.from("customer_group_prices").select("group_id").limit(50000),
      ]);
      for (const r of [groups, members, prices]) if (r.error) throw r.error;
      const count = (rows: any[], id: string) => rows.filter((r) => r.group_id === id).length;
      return (groups.data ?? []).map((g: any) => ({
        ...g,
        name_i18n: g.name_i18n ?? {},
        discount_percent: Number(g.discount_percent) || 0,
        members: count(members.data ?? [], g.id),
        prices: count(prices.data ?? [], g.id),
      }));
    },
  });
}

/** Código estável do erro ao gravar um grupo (nome repetido ou fora das regras). */
export function groupErrorCode(error: unknown): "name_taken" | "invalid" | "unknown" {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "23505") return "name_taken";
  if (e?.code === "23514") return "invalid";
  return "unknown";
}

export function useSaveCustomerGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomerGroupInput): Promise<string> => {
      const row = {
        name: input.name.trim(),
        name_i18n: input.name_i18n,
        description: input.description?.trim() || null,
        discount_percent: input.discount_percent,
        is_active: input.is_active,
      };
      if (input.id) {
        const { error } = await sb.from("customer_groups").update(row).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await sb.from("customer_groups").insert(row).select("id").single();
      if (error) throw error;
      return String(data.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useDeleteCustomerGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("customer_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      qc.invalidateQueries({ queryKey: ["customer-group-of"] });
    },
  });
}

export type AdminCustomerOption = { user_id: string; email: string | null; full_name: string | null; is_admin: boolean };

export function useAdminCustomerOptions() {
  return useQuery({
    queryKey: ["admin-customers-profiles"],
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await sb.rpc("admin_list_customers");
      if (error) throw error;
      return data ?? [];
    },
    select: (rows: any[]): AdminCustomerOption[] => rows.map((r) => ({ user_id: String(r.user_id), email: r.email ?? null, full_name: r.full_name ?? null, is_admin: !!r.is_admin })),
  });
}

export function useGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["customer-group-members", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<{ user_id: string; added_at: string }[]> => {
      const { data, error } = await sb.from("customer_group_members").select("user_id,added_at").eq("group_id", groupId).order("added_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Grupo de um cliente (página do cliente no Admin). */
export function useCustomerGroupOf(userId: string | null) {
  return useQuery({
    queryKey: ["customer-group-of", userId],
    enabled: !!userId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb.from("customer_group_members").select("group_id").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data?.group_id ?? null;
    },
  });
}

/** Põe o cliente num grupo (troca o anterior) ou tira de todos (groupId null). */
export function useSetCustomerGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, groupId }: { userId: string; groupId: string | null }) => {
      const { error } = groupId
        ? await sb.from("customer_group_members").upsert({ user_id: userId, group_id: groupId, added_at: new Date().toISOString() }, { onConflict: "user_id" })
        : await sb.from("customer_group_members").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      qc.invalidateQueries({ queryKey: ["customer-group-members"] });
      qc.invalidateQueries({ queryKey: ["customer-group-of"] });
      qc.invalidateQueries({ queryKey: ["customer-group-memberships"] });
    },
  });
}

/** Grupo de cada cliente (lista de clientes no Admin). */
export function useCustomerGroupMemberships(enabled = true) {
  return useQuery({
    queryKey: ["customer-group-memberships"],
    enabled,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await sb.from("customer_group_members").select("user_id,group_id").limit(50000);
      if (error) throw error;
      return new Map((data ?? []).map((r: any) => [String(r.user_id), String(r.group_id)]));
    },
  });
}

export type GroupPriceRow = { product_id: string; min_quantity: number; price: number };

export function useGroupPrices(groupId: string | null) {
  return useQuery({
    queryKey: ["customer-group-prices", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<GroupPriceRow[]> => {
      const { data, error } = await sb.from("customer_group_prices").select("product_id,min_quantity,price").eq("group_id", groupId).order("product_id").order("min_quantity");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ product_id: String(r.product_id), min_quantity: Number(r.min_quantity), price: Number(r.price) }));
    },
  });
}

/** Troca a tabela de preço inteira do grupo pela lista dada (RPC admin_set_group_prices, numa só transação). */
export function useSaveGroupPrices(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: GroupPriceRow[]) => {
      const { error } = await sb.rpc("admin_set_group_prices", { _group_id: groupId, _rows: rows });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-group-prices", groupId] });
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}
