// Avise-me quando chegar (src/lib/stockAlerts.ts):
//   useRequestStockAlert()        site: pedido de aviso pela função request_stock_alert (visitante ou cliente)
//   useStockAlertSummary()        Admin: procura por produto (admin_stock_alert_summary)
//   useProductStockAlerts(id)     Admin: pessoas à espera de um produto
//   useUpdateStockAlerts()        Admin: marcar avisado, cancelar, voltar a esperar ou apagar
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { alertResult, type StockAlertStatus } from '@/lib/stockAlerts';

const sb = supabase as any;
const KEY = ['stock-alerts'] as const;

export type StockAlertSummary = {
  product_id: string; name: string; image: string | null; stock_quantity: number | null; is_active: boolean;
  waiting: number; notified: number; last_request: string;
};
export type StockAlertRow = {
  id: string; product_id: string; user_id: string | null; email: string; locale: string | null; country: string | null;
  status: StockAlertStatus; created_at: string; notified_at: string | null;
};

export function useRequestStockAlert() {
  return useMutation({
    mutationFn: async (v: { productId: string; email: string; locale: string; country: string }) => {
      const { data, error } = await sb.rpc('request_stock_alert', { _product_id: v.productId, _email: v.email, _locale: v.locale, _country: v.country });
      if (error) throw error;
      return alertResult(data);
    },
  });
}

export function useStockAlertSummary() {
  return useQuery({
    queryKey: [...KEY, 'summary'],
    queryFn: async (): Promise<StockAlertSummary[]> => {
      const { data, error } = await sb.rpc('admin_stock_alert_summary');
      if (error) throw error;
      return ((data ?? []) as StockAlertSummary[]).map((r) => ({ ...r, waiting: Number(r.waiting), notified: Number(r.notified) }));
    },
  });
}

export function useProductStockAlerts(productId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'product', productId],
    enabled: !!productId,
    queryFn: async (): Promise<StockAlertRow[]> => {
      const { data, error } = await sb.from('stock_alerts').select('*').eq('product_id', productId).order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as StockAlertRow[];
    },
  });
}

export function useUpdateStockAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: StockAlertStatus | 'delete' }) => {
      const q = status === 'delete'
        ? sb.from('stock_alerts').delete().in('id', ids)
        : sb.from('stock_alerts').update({ status, notified_at: status === 'notified' ? new Date().toISOString() : null }).in('id', ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['admin-attention'] });
    },
  });
}
