// =============================================================================================
// Registo de atividade do Admin. Regras puras em src/lib/activityLog.ts; dados do servidor (só admin):
//   useActivityList      admin_activity_list (filtros e paginação no servidor; _ref = um produto, pedido...)
//   useActivitySummary   admin_activity_summary (mudanças por ação e tabela no período)
//   useActivityActors    admin_activity_actors (administradores e a última ação de cada um)
//   useAdminLogins       admin_activity_logins (entradas e saídas das contas de administrador)
//   useActivitySettings / useSaveActivitySettings   store_settings.activity_log (prazo de guarda)
// =============================================================================================
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRetention, type ActivityAction, type ActivityRow } from "@/lib/activityLog";

const sb = supabase as any;

export type ActivityFilters = {
  since: string | null; entities: string[] | null; actions: ActivityAction[] | null; actor: string | null;
  q: string; ref?: string | null; page: number; pageSize: number;
};

export const activityArgs = (f: ActivityFilters, limit = f.pageSize, offset = (f.page - 1) * f.pageSize) => ({
  _since: f.since, _entities: f.entities, _actions: f.actions, _actor: f.actor, _q: f.q.trim() || null, _ref: f.ref ?? null,
  _limit: limit, _offset: offset,
});

export function useActivityList(f: ActivityFilters, enabled = true) {
  return useQuery({
    queryKey: ["admin-activity", f],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: ActivityRow[]; total: number }> => {
      const { data, error } = await sb.rpc("admin_activity_list", activityArgs(f));
      if (error) throw error;
      const rows = (data ?? []) as (ActivityRow & { total_count: number })[];
      return { rows, total: rows.length ? Number(rows[0].total_count) : 0 };
    },
  });
}

export function useActivitySummary(since: string | null) {
  return useQuery({
    queryKey: ["admin-activity-summary", since],
    queryFn: async (): Promise<{ action: string; entity: string; changes: number }[]> => {
      const { data, error } = await sb.rpc("admin_activity_summary", { _since: since });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, changes: Number(r.changes) }));
    },
  });
}

export type ActivityActor = { actor: string; email: string | null; is_admin: boolean; last_action: string | null; actions: number };

export function useActivityActors() {
  return useQuery({
    queryKey: ["admin-activity-actors"],
    queryFn: async (): Promise<ActivityActor[]> => {
      const { data, error } = await sb.rpc("admin_activity_actors");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, actions: Number(r.actions) }));
    },
  });
}

export type AdminLogin = { created_at: string; actor: string; email: string | null; action: string; ip: string | null };

export function useAdminLogins(limit = 10) {
  return useQuery({
    queryKey: ["admin-activity-logins", limit],
    queryFn: async (): Promise<AdminLogin[]> => {
      const { data, error } = await sb.rpc("admin_activity_logins", { _since: null, _limit: limit });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const SETTINGS_KEY = ["store-settings", "activity_log"] as const;

export function useActivitySettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async (): Promise<{ retentionDays: number; raw: Record<string, unknown> }> => {
      const { data, error } = await sb.from("store_settings").select("value").eq("key", "activity_log").maybeSingle();
      if (error) throw error;
      const raw = data?.value && typeof data.value === "object" ? data.value : {};
      return { retentionDays: normalizeRetention(raw), raw };
    },
  });
}

export function useSaveActivitySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ retentionDays, raw }: { retentionDays: number; raw: Record<string, unknown> }) => {
      const value = { ...raw, retention_days: retentionDays };
      const { error } = await sb.from("store_settings").upsert({ key: "activity_log", value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      qc.invalidateQueries({ queryKey: ["admin-activity"] });
    },
  });
}
