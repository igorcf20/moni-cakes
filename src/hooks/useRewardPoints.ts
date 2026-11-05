// =====================================================================================
// Programa de pontos (src/lib/rewardPoints.ts; regras na migration 20261006200000_reward_points.sql).
//   Regras     useRewardSettings (store_settings.reward_points), useSaveRewardSettings (Admin)
//   Cliente    useMyRewardPoints (saldo e vencimento), useMyRewardHistory (extrato), usePointsChoice (checkout: usar ou não)
//   Admin      useAdminRewardCustomers, useAdminRewardOf, useRewardHistory, useRecentRewardEntries, useAdjustRewardPoints
// O extrato só muda pelas funções do servidor; aqui nada escreve nele diretamente.
// =====================================================================================
import { create } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFeature } from '@/hooks/useFeatures';
import { normalizeRewardSettings, type RewardSettings } from '@/lib/rewardPoints';

const sb = supabase as any;
const KEY = ['reward-points'] as const;
const SETTINGS_KEY = ['reward-points', 'settings'] as const;

export type RewardKind = 'earn' | 'signup' | 'redeem' | 'refund' | 'reverse' | 'adjust' | 'expire';
export type RewardEntry = {
  id: string; user_id: string; points: number; kind: RewardKind; order_id: string | null; note: string | null;
  expires_at: string | null; created_at: string;
};
export type RewardBalance = { balance: number; expiring: number; next_expiry: string | null };
export type RewardCustomer = {
  user_id: string; full_name: string | null; email: string | null; balance: number; earned: number; redeemed: number; last_activity: string;
};

const ENTRY_COLUMNS = 'id,user_id,points,kind,order_id,note,expires_at,created_at';
const toBalance = (row: any): RewardBalance => ({
  balance: Number(row?.balance) || 0, expiring: Number(row?.expiring) || 0, next_expiry: row?.next_expiry ?? null,
});

/* ---------- Regras ---------- */

export function useRewardSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RewardSettings> => {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'reward_points').maybeSingle();
      if (error) throw error;
      return normalizeRewardSettings(data?.value);
    },
  });
}

export function useSaveRewardSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: RewardSettings) => {
      const { error } = await supabase.from('store_settings')
        .upsert({ key: 'reward_points', value: normalizeRewardSettings(next) as any }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

/* ---------- Cliente ---------- */

export function useMyRewardPoints() {
  const { user } = useAuth();
  const on = useFeature('reward_points');
  return useQuery({
    queryKey: [...KEY, 'mine', user?.id],
    enabled: !!user?.id && on,
    queryFn: async (): Promise<RewardBalance> => {
      const { data, error } = await sb.rpc('my_reward_points');
      if (error) throw error;
      return toBalance((data ?? [])[0]);
    },
  });
}

export function useMyRewardHistory() {
  const { user } = useAuth();
  const on = useFeature('reward_points');
  return useQuery({
    queryKey: [...KEY, 'mine-history', user?.id],
    enabled: !!user?.id && on,
    queryFn: async (): Promise<RewardEntry[]> => {
      const { data, error } = await sb.from('reward_point_entries').select(ENTRY_COLUMNS)
        .eq('user_id', user!.id).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as RewardEntry[];
    },
  });
}

/** Checkout: o cliente escolheu usar os pontos (memória da aba, como o vale-presente). */
export const usePointsChoice = create<{ use: boolean; setUse: (v: boolean) => void }>((set) => ({ use: false, setUse: (use) => set({ use }) }));

/* ---------- Admin ---------- */

export function useAdminRewardCustomers() {
  return useQuery({
    queryKey: [...KEY, 'customers'],
    queryFn: async (): Promise<RewardCustomer[]> => {
      const { data, error } = await sb.rpc('admin_reward_points_customers');
      if (error) throw error;
      return ((data ?? []) as RewardCustomer[]).map((r) => ({ ...r, balance: Number(r.balance), earned: Number(r.earned), redeemed: Number(r.redeemed) }));
    },
  });
}

export function useAdminRewardOf(userId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'of', userId],
    enabled: !!userId,
    queryFn: async (): Promise<RewardBalance & { full_name: string | null; email: string | null }> => {
      const { data, error } = await sb.rpc('admin_reward_points_of', { _user_id: userId });
      if (error) throw error;
      const row = (data ?? [])[0];
      return { ...toBalance(row), full_name: row?.full_name ?? null, email: row?.email ?? null };
    },
  });
}

export function useRewardHistory(userId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'history', userId],
    enabled: !!userId,
    queryFn: async (): Promise<RewardEntry[]> => {
      const { data, error } = await sb.from('reward_point_entries').select(ENTRY_COLUMNS)
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as RewardEntry[];
    },
  });
}

/** Movimentos dos últimos dias (números do Admin > Pontos). */
export function useRecentRewardEntries(days: number) {
  return useQuery({
    queryKey: [...KEY, 'recent', days],
    queryFn: async (): Promise<RewardEntry[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await sb.from('reward_point_entries').select(ENTRY_COLUMNS).gte('created_at', since).limit(20000);
      if (error) throw error;
      return (data ?? []) as RewardEntry[];
    },
  });
}

export function useAdjustRewardPoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, points, note }: { userId: string; points: number; note: string }) => {
      const { error } = await sb.rpc('admin_adjust_reward_points', { _user_id: userId, _points: points, _note: note });
      if (error) throw new Error(String(error.message ?? '').includes('negative_balance') ? 'negative_balance' : 'error');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
