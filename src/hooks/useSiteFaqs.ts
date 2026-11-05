// =====================================================================================
// Perguntas frequentes do Admin para o site (/faq):
//   site_faqs                   perguntas que a loja escreveu (ativas; idioma NULL = todos)
//   store_settings.faq_settings grupos de perguntas padrão escondidos ({"hiddenGroups": [...]})
// O Admin > Perguntas frequentes invalida SITE_FAQS_QUERY_KEY depois de gravar.
// =====================================================================================
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const SITE_FAQS_QUERY_KEY = ['site-faqs'] as const;

export type SiteFaq = { id: string; category: string; question: string; answer: string; display_order: number; locale: string | null };
export type FaqSettings = { hiddenGroups: string[] };

export function parseFaqSettings(value: unknown): FaqSettings {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const hidden = Array.isArray(v.hiddenGroups) ? v.hiddenGroups.filter((g): g is string => typeof g === 'string') : [];
  return { hiddenGroups: [...new Set(hidden)] };
}

export function useSiteFaqs() {
  return useQuery({
    queryKey: SITE_FAQS_QUERY_KEY,
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ faqs: SiteFaq[]; settings: FaqSettings }> => {
      const db = supabase as any;
      const [faqs, settings] = await Promise.all([
        db.from('site_faqs').select('id,category,question,answer,display_order,locale').eq('is_active', true).order('display_order', { ascending: true }),
        supabase.from('store_settings').select('value').eq('key', 'faq_settings').maybeSingle(),
      ]);
      // Banco sem a coluna locale (migration 20261005130000 ainda não aplicada): sem perguntas da loja.
      return { faqs: faqs.error ? [] : (faqs.data ?? []), settings: parseFaqSettings(settings.data?.value) };
    },
  });
}

/** Grupos de perguntas padrão da página /faq (ids = âncoras, títulos em faqMessages). Ver src/pages/Faq.tsx. */
export const DEFAULT_FAQ_GROUPS = [
  { id: 'produtos', prefix: 'q_mat_', title: 'g_products' },
  { id: 'pedidos', prefix: 'q_ord_', title: 'g_orders' },
  { id: 'envios', prefix: 'q_shp_', title: 'g_shipping' },
  { id: 'pagamento', prefix: 'q_pay_', title: 'g_payment' },
  { id: 'devolucoes', prefix: 'q_ret_', title: 'g_returns' },
  { id: 'conta', prefix: 'q_acc_', title: 'g_account' },
] as const;
