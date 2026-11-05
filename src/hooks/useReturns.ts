// =====================================================================================
// Devoluções e trocas (tabela return_requests, regras em store_settings.return_settings).
//   Cliente   useReturnSettings, useMyReturns, useRequestReturn (RPC request_return: o servidor confere tudo)
//   Admin     useAdminReturns (com o pedido e o cliente), useAdminReturnNotes, useUpdateReturn, useSaveReturnSettings,
//             useOrderReturns (devoluções de um pedido, na página do pedido)
// As notas internas (admin_notes) nunca vêm no select: só pela função admin_return_notes.
// =====================================================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  RETURN_COLUMNS, normalizeReturnSettings, type ReturnAction, type ReturnReason, type ReturnRequest, type ReturnSettings,
  type ReturnStatus,
} from '@/lib/returns';

const sb = supabase as any;
export const RETURN_SETTINGS_KEY = ['return-settings'] as const;

export function useReturnSettings() {
  return useQuery({
    queryKey: RETURN_SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReturnSettings> => {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'return_settings').maybeSingle();
      if (error) throw error;
      return normalizeReturnSettings(data?.value);
    },
  });
}

export function useSaveReturnSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: ReturnSettings) => {
      const { error } = await supabase.from('store_settings')
        .upsert({ key: 'return_settings', value: normalizeReturnSettings(next) as any }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RETURN_SETTINGS_KEY }),
  });
}

/* ---------- Cliente ---------- */

export function useMyReturns(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-returns', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ReturnRequest[]> => {
      const { data, error } = await sb.from('return_requests').select(RETURN_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReturnRequest[];
    },
  });
}

export type ReturnDraft = {
  orderId: string;
  items: { order_item_id: string; quantity: number }[];
  reason: ReturnReason;
  action: ReturnAction;
  comment: string;
};

export function useRequestReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: ReturnDraft): Promise<string> => {
      const { data, error } = await sb.rpc('request_return', {
        _order_id: d.orderId, _items: d.items, _reason: d.reason, _action: d.action, _comment: d.comment.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-returns'] });
    },
  });
}

/* ---------- Admin ---------- */

export type AdminReturn = ReturnRequest & {
  order: { id: string; created_at: string | null; total: number; status: string; guest_name: string | null; guest_email: string | null } | null;
  customer_name: string | null;
};

export function useAdminReturns() {
  return useQuery({
    queryKey: ['admin-returns'],
    queryFn: async (): Promise<AdminReturn[]> => {
      const { data, error } = await sb.from('return_requests')
        .select(`${RETURN_COLUMNS},order:orders(id,created_at,total,status,guest_name,guest_email)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as (ReturnRequest & { order: AdminReturn['order'] })[];
      const users = [...new Set(rows.map((r) => r.user_id))];
      const names = new Map<string, string>();
      if (users.length) {
        const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name').in('user_id', users);
        for (const p of (profiles ?? []) as { user_id: string; full_name: string | null }[]) if (p.full_name) names.set(p.user_id, p.full_name);
      }
      return rows.map((r) => ({ ...r, customer_name: names.get(r.user_id) ?? r.order?.guest_name ?? null }));
    },
  });
}

/** Devoluções de um pedido (página do pedido no Admin). */
export function useOrderReturns(orderId: string | undefined) {
  return useQuery({
    queryKey: ['admin-returns', 'order', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<ReturnRequest[]> => {
      const { data, error } = await sb.from('return_requests').select(RETURN_COLUMNS).eq('order_id', orderId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReturnRequest[];
    },
  });
}

export function useAdminReturnNotes(id: string | null) {
  return useQuery({
    queryKey: ['admin-return-notes', id],
    enabled: !!id,
    queryFn: async (): Promise<string> => {
      const { data, error } = await sb.rpc('admin_return_notes', { _ids: [id] });
      if (error) throw error;
      return ((data ?? [])[0]?.admin_notes as string | null) ?? '';
    },
  });
}

export function useUpdateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: ReturnStatus; store_reply: string; admin_notes: string }) => {
      const { error } = await sb.from('return_requests').update({
        status: v.status,
        store_reply: v.store_reply.trim() || null,
        admin_notes: v.admin_notes.trim() || null,
      }).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['admin-returns'] });
      void qc.invalidateQueries({ queryKey: ['admin-return-notes', v.id] });
      void qc.invalidateQueries({ queryKey: ['admin-attention'] });
    },
  });
}

export function useDeleteReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('return_requests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-returns'] });
      void qc.invalidateQueries({ queryKey: ['admin-attention'] });
    },
  });
}
