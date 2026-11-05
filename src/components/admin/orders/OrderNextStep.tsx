// =====================================================================================
// Botão "próximo passo" de cada pedido no Admin > Pedidos: um clique leva o pedido à etapa seguinte.
//   aguardando pagamento -> Confirmar pagamento (pagamento e pedido passam a Pago)
//   pago                 -> Iniciar produção
//   em produção          -> Marcar como enviado (pede o código de rastreio, opcional)
//   enviado / retirada   -> Marcar como entregue
// Pedido com cancelamento pedido, cancelado, reembolsado ou entregue não tem botão.
// Mudar o estado usa useUpdateOrderStatus, que regista o histórico.
// Enviar pede o código de rastreio num painel na página do pedido (sem janela por cima): na lista, o botão
// abre a página do pedido (/admin/pedidos/<id>?enviar=1); na página (mode="page"), o painel abre logo abaixo.
// =====================================================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Hammer, PackageCheck, Truck, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUpdateOrderStatus } from '@/hooks/useOrders';
import { normalizeOrderStatus } from '@/lib/orderStatusStyles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlinePanel } from '@/components/admin/shell/AdminPageParts';
import { adminHref } from '@/components/admin/shell/adminSections';
import { useMessages } from '@/i18n';
import { adminManageMessages, type AdminManageKey } from '@/i18n/adminManage';

type Step = { key: 'confirm_payment' | 'start_production' | 'ship' | 'deliver'; icon: LucideIcon; next: string };

function nextStepOf(order: { status: string; payment_status?: string | null; cancellation_status?: string | null }): Step | null {
  if (order.cancellation_status === 'requested') return null;
  const s = normalizeOrderStatus(order.status);
  if ((s === 'pending' || s === 'awaiting_payment') && order.payment_status !== 'paid') return { key: 'confirm_payment', icon: BadgeCheck, next: 'paid' };
  if (s === 'pending' || s === 'awaiting_payment' || s === 'paid') return { key: 'start_production', icon: Hammer, next: 'preparing' };
  if (s === 'preparing') return { key: 'ship', icon: Truck, next: 'shipped' };
  if (s === 'shipped' || s === 'ready_for_pickup') return { key: 'deliver', icon: PackageCheck, next: 'delivered' };
  return null;
}

export default function OrderNextStep({
  order, onDone, className, mode = 'list', startShipping = false,
}: { order: any; onDone: () => void; className?: string; mode?: 'list' | 'page'; startShipping?: boolean }) {
  const { t } = useMessages(adminManageMessages);
  const navigate = useNavigate();
  const updateStatus = useUpdateOrderStatus();
  const [busy, setBusy] = useState(false);
  const [askTracking, setAskTracking] = useState(mode === 'page' && startShipping);
  const [tracking, setTracking] = useState<string>(order.tracking_number || '');
  const step = nextStepOf(order);
  if (!step) return null;

  const run = async (trackingNumber?: string) => {
    setBusy(true);
    try {
      if (step.key === 'confirm_payment') {
        const { error } = await (supabase as any).rpc('admin_set_payment_status', { _order_id: order.id, _payment_status: 'paid', _note: null });
        if (error) throw error;
      }
      await updateStatus.mutateAsync({ orderId: order.id, status: step.next, trackingNumber: trackingNumber || undefined });
      setAskTracking(false);
      onDone();
    } catch (e: any) {
      toast.error(t('step_error'), { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const Icon = step.icon;
  return (
    <>
      <Button
        size="sm"
        className={className ?? 'min-h-9 whitespace-nowrap'}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          if (step.key !== 'ship') void run();
          else if (mode === 'list') navigate(`${adminHref.order(order.id)}?enviar=1`);
          else { setTracking(order.tracking_number || ''); setAskTracking(true); }
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
        {t(`step_${step.key}` as AdminManageKey)}
      </Button>
      {mode === 'page' && step.key === 'ship' && (
        <InlinePanel open={askTracking} onClose={() => setAskTracking(false)} title={t('ship_title', { id: order.id.slice(0, 8) })} description={t('ship_hint')} className="mt-3">
          {order.has_customizable_items && (
            <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t('ship_files_warning')}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`trk-${order.id}`}>{t('ship_tracking')}</Label>
            <Input id={`trk-${order.id}`} value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder={t('ship_tracking_ph')} className="text-base md:text-sm" autoFocus />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void run(tracking.trim())}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('ship_confirm')}
            </Button>
            <Button variant="outline" onClick={() => setAskTracking(false)}>{t('cancel')}</Button>
          </div>
        </InlinePanel>
      )}
    </>
  );
}
