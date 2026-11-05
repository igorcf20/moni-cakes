// Perguntas e respostas no produto (loja): leitura pela RPC product_questions_public e envio por ask_product_question.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parsePublicQuestions, questionError, type PublicQuestion } from '@/lib/productQuestions';

export function useProductQuestions(productId: string, perPage: number, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['product-questions', productId, perPage],
    enabled,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam }): Promise<{ total: number; items: PublicQuestion[]; offset: number }> => {
      const { data, error } = await (supabase as any).rpc('product_questions_public', { _product: productId, _limit: perPage, _offset: pageParam });
      if (error) throw error;
      return { ...parsePublicQuestions(data), offset: pageParam as number };
    },
    getNextPageParam: (last) => (last.items.length >= perPage ? last.offset + perPage : undefined),
  });
}

export function useAskQuestion(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ question, locale }: { question: string; locale: string }) => {
      const { error } = await (supabase as any).rpc('ask_product_question', { _product: productId, _question: question, _locale: locale });
      if (error) throw new Error(questionError(error.message));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-questions', productId] }),
  });
}

// ---------- Admin > Perguntas dos clientes ----------
export type AdminQuestion = {
  id: string; product_id: string; author_name: string | null; locale: string | null; question: string; answer: string | null;
  status: 'pending' | 'published' | 'rejected'; created_at: string; answered_at: string | null;
  products: { name: string | null; image: string | null } | null;
};

export function useAdminQuestions() {
  return useQuery({
    queryKey: ['admin-product-questions'],
    queryFn: async (): Promise<AdminQuestion[]> => {
      const { data, error } = await (supabase as any).from('product_questions')
        .select('id,product_id,author_name,locale,question,answer,status,created_at,answered_at,products(name,image)')
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return (data || []) as AdminQuestion[];
    },
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<AdminQuestion, 'answer' | 'status'>> | 'delete' }) => {
      const table = (supabase as any).from('product_questions');
      const { error } = patch === 'delete' ? await table.delete().eq('id', id) : await table.update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-product-questions'] });
      qc.invalidateQueries({ queryKey: ['product-questions'] });
      qc.invalidateQueries({ queryKey: ['admin-attention'] });
    },
  });
}
