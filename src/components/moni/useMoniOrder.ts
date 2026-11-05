// Canal de encomenda da Moni Cakes: WhatsApp configurado no Admin (com a mensagem padrão) ou, sem número, /contatos.
import { useVisualSettings } from '@/hooks/useVisualSettings';
import { useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { orderHref } from '@/lib/moniHome';

export function useMoniOrder() {
  const { t } = useMessages(layoutMessages);
  const { data: visual } = useVisualSettings();
  const wa = visual?.plugins?.whatsapp;
  const order = orderHref(wa?.enabled === false ? '' : wa?.phone, wa?.message || t('waMessage'));
  return { order, whatsHref: order.external ? order.href : null };
}
