// Vale-presente (src/lib/giftCards.ts; regras na migration 20261006190000_gift_cards.sql):
//   useAppliedGiftCard()     checkout: vale aplicado (memória da aba) e check_gift_card para validar o código
//   useGiftCards()           Admin: lista; useGiftCard(id) e useGiftCardHistory(id) para a página do vale
//   useSaveGiftCard()        Admin: criar ou editar (o saldo só muda por useAdjustGiftCard)
import { create } from 'zustand';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeGiftCode } from '@/lib/giftCards';

const sb = supabase as any;
const KEY = ['gift-cards'] as const;

export type GiftCard = {
  id: string; code: string; initial_amount: number; balance: number; expires_at: string | null; is_active: boolean;
  recipient_name: string | null; recipient_email: string | null; sender_name: string | null; message: string | null;
  notes: string | null; created_at: string; updated_at: string;
};
export type GiftCardTx = {
  id: string; gift_card_id: string; order_id: string | null; amount: number; kind: 'issue' | 'redeem' | 'refund' | 'adjust';
  note: string | null; created_at: string;
};
export type GiftCardInputValues = Pick<GiftCard, 'code' | 'expires_at' | 'is_active' | 'recipient_name' | 'recipient_email' | 'sender_name' | 'message' | 'notes'> & { initial_amount?: number };

/** Erros do check_gift_card com texto próprio (src/i18n/giftCards.ts: e_<código>). */
export const GIFT_ERRORS = ['gift_card_login', 'gift_card_disabled', 'gift_card_too_many', 'gift_card_invalid'] as const;
export type GiftError = (typeof GIFT_ERRORS)[number] | 'error';

type Applied = { code: string; balance: number } | null;
const useAppliedStore = create<{ applied: Applied; set: (a: Applied) => void }>((set) => ({ applied: null, set: (applied) => set({ applied }) }));

export function useAppliedGiftCard() {
  const { applied, set } = useAppliedStore();
  const check = useMutation({
    mutationFn: async (raw: string): Promise<Applied> => {
      const { data, error } = await sb.rpc('check_gift_card', { _code: normalizeGiftCode(raw) });
      if (error) {
        const code = GIFT_ERRORS.find((c) => String(error.message ?? '').includes(c));
        throw new Error(code ?? 'error');
      }
      const row = (data ?? [])[0];
      if (!row) throw new Error('gift_card_invalid');
      return { code: row.code, balance: Number(row.balance) || 0 };
    },
    onSuccess: (a) => set(a),
  });
  return { applied, apply: check.mutateAsync, isChecking: check.isPending, remove: () => set(null) };
}

export function useGiftCards() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<GiftCard[]> => {
      const { data, error } = await sb.from('gift_cards').select('*').order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      return ((data ?? []) as GiftCard[]).map((g) => ({ ...g, balance: Number(g.balance), initial_amount: Number(g.initial_amount) }));
    },
  });
}

export function useGiftCard(id: string | null) {
  const list = useGiftCards();
  return { ...list, data: list.data?.find((g) => g.id === id) ?? null };
}

export function useGiftCardHistory(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'history', id],
    enabled: !!id,
    queryFn: async (): Promise<GiftCardTx[]> => {
      const { data, error } = await sb.from('gift_card_transactions').select('*').eq('gift_card_id', id).order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as GiftCardTx[]).map((x) => ({ ...x, amount: Number(x.amount) }));
    },
  });
}

export function useSaveGiftCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: GiftCardInputValues }): Promise<string> => {
      if (id) {
        const { initial_amount: _ignored, code: _code, ...rest } = values;
        const { error } = await sb.from('gift_cards').update(rest).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await sb.from('gift_cards').insert({ ...values, code: normalizeGiftCode(values.code), balance: values.initial_amount }).select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAdjustGiftCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, note }: { id: string; amount: number; note: string }) => {
      const { error } = await sb.rpc('admin_adjust_gift_card', { _id: id, _amount: amount, _note: note || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
