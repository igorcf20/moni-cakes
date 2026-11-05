// O que está à espera do administrador, para os contadores do menu lateral do Admin (src/pages/Admin.tsx):
//   orders    pedidos de cancelamento + comprovantes por confirmar + pagos à espera de produção
//   returns   pedidos de devolução novos (à espera de resposta)
//   reviews   avaliações por aprovar
//   products  produtos ativos (não personalizáveis) sem estoque
//   vendors   pedidos de cadastro de vendedor novos (marketplace)
//   affiliates pedidos de cadastro de afiliado novos (affiliates)
//   quotes     pedidos de orçamento novos, sem resposta (quotes)
//   blog       comentários do blog à espera de aprovação (blog)
//   questions  perguntas de clientes sobre produtos à espera de resposta (product_questions)
//   toPrint    pedidos na fila de impressão (order_printing, RPC admin_print_queue)
//   forum      tópicos e respostas do fórum à espera de aprovação e denúncias abertas (forum)
// Recarrega a cada minuto e quando a janela volta ao primeiro plano.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AdminAttention = {
  cancelRequests: number;
  proofsToConfirm: number;
  toProduce: number;
  toShip: number;
  returns: number;
  reviews: number;
  outOfStock: number;
  /** Pedidos de aviso à espera em produtos que já voltaram ao estoque. */
  stockAlerts: number;
  /** Pedidos de cadastro de vendedor à espera (marketplace). */
  vendorApplications: number;
  /** Pedidos de cadastro de afiliado à espera (affiliates). */
  affiliateApplications: number;
  /** Pedidos de orçamento novos (quotes). */
  quoteRequests: number;
  /** Comentários do blog à espera de aprovação (blog). */
  blogComments: number;
  /** Fórum: tópicos e respostas à espera de aprovação mais denúncias abertas (forum). */
  forum: number;
  /** Perguntas de clientes sobre produtos à espera de resposta (product_questions). */
  questions: number;
  /** Pedidos na fila de impressão (order_printing). */
  toPrint: number;
};

export const EMPTY_ATTENTION: AdminAttention = { cancelRequests: 0, proofsToConfirm: 0, toProduce: 0, toShip: 0, returns: 0, reviews: 0, outOfStock: 0, stockAlerts: 0, vendorApplications: 0, affiliateApplications: 0, quoteRequests: 0, blogComments: 0, forum: 0, questions: 0, toPrint: 0 };

export function useAdminAttention(enabled = true) {
  const { data = EMPTY_ATTENTION } = useQuery({
    queryKey: ['admin-attention'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AdminAttention> => {
      const sb = supabase as any;
      const [orders, reviews, products, returns, alerts, vendorApps, affiliateApps, quotes, blogComments, forumTopics, forumPosts, forumReports, questions] = await Promise.all([
        sb.from('orders').select('status, payment_status, payment_proof_url, cancellation_status').eq('archived', false),
        sb.from('product_reviews').select('id', { count: 'exact', head: true }).eq('approved', false),
        sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('customizable', false).lte('stock_quantity', 0),
        sb.from('return_requests').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
        sb.from('stock_alerts').select('id, products!inner(stock_quantity)', { count: 'exact', head: true })
          .eq('status', 'waiting').gt('products.stock_quantity', 0),
        sb.from('vendor_applications').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        sb.from('affiliates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('quote_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        sb.from('blog_comments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('forum_topics').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('forum_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('forum_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null),
        sb.from('product_questions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      // Fila de impressão: RPC só de administradores; sem a migration ou com o recurso desligado = 0.
      const toPrint: unknown[] = await sb.rpc('admin_print_queue', { _limit: 300 }).then((r: any) => r.data ?? [], () => []);
      const rows: any[] = orders.data ?? [];
      const open = (o: any) => !['cancelled', 'refunded'].includes(o.status);
      return {
        cancelRequests: rows.filter((o) => o.cancellation_status === 'requested').length,
        proofsToConfirm: rows.filter((o) => open(o) && o.payment_status !== 'paid' && !!o.payment_proof_url).length,
        toProduce: rows.filter((o) => o.status === 'paid').length,
        toShip: rows.filter((o) => o.status === 'preparing').length,
        returns: returns.count ?? 0,
        reviews: reviews.count ?? 0,
        outOfStock: products.count ?? 0,
        stockAlerts: alerts.count ?? 0,
        vendorApplications: vendorApps.count ?? 0,
        affiliateApplications: affiliateApps.count ?? 0,
        quoteRequests: quotes.count ?? 0,
        blogComments: blogComments.count ?? 0,
        forum: (forumTopics.count ?? 0) + (forumPosts.count ?? 0) + (forumReports.count ?? 0),
        questions: questions.count ?? 0,
        toPrint: toPrint.length,
      };
    },
  });
  return data;
}
