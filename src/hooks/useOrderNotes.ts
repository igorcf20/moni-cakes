// =====================================================================================
// Notas do pedido (tabela order_notes, migration 20261006160200_order_notes.sql).
//   Admin    useOrderNotes(orderId) com o nome de quem escreveu, useOrderNoteMutations (criar, mostrar/ocultar, apagar)
//   Cliente  useCustomerOrderMessages(orderId): só as mensagens que a loja marcou como visíveis (a base filtra)
// =====================================================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export type OrderNote = {
  id: string;
  order_id: string;
  author_id: string | null;
  body: string;
  visible_to_customer: boolean;
  created_at: string;
  author_name?: string | null;
};

export function useOrderNotes(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-notes', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderNote[]> => {
      const { data, error } = await sb.from('order_notes').select('*').eq('order_id', orderId).order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as OrderNote[];
      const authors = [...new Set(rows.map((r) => r.author_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (authors.length) {
        const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name').in('user_id', authors);
        for (const p of (profiles ?? []) as { user_id: string; full_name: string | null }[]) if (p.full_name) names.set(p.user_id, p.full_name);
      }
      return rows.map((r) => ({ ...r, author_name: r.author_id ? names.get(r.author_id) ?? null : null }));
    },
  });
}

export function useOrderNoteMutations(orderId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['order-notes', orderId] });
  const add = useMutation({
    mutationFn: async (v: { body: string; visible: boolean }) => {
      const { error } = await sb.from('order_notes').insert({ order_id: orderId, body: v.body.trim(), visible_to_customer: v.visible });
      if (error) throw error;
    },
    onSuccess: done,
  });
  const setVisible = useMutation({
    mutationFn: async (v: { id: string; visible: boolean }) => {
      const { error } = await sb.from('order_notes').update({ visible_to_customer: v.visible }).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('order_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { add, setVisible, remove };
}

export function useCustomerOrderMessages(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-messages', orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<Pick<OrderNote, 'id' | 'body' | 'created_at'>[]> => {
      const { data, error } = await sb.from('order_notes').select('id, body, created_at')
        .eq('order_id', orderId).eq('visible_to_customer', true).order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
