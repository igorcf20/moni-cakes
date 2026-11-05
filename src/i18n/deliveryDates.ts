// Textos do prazo de produção e da data de entrega para o cliente (produto, checkout, pedido) e do bloco no pedido do
// Admin. Sem emojis nem travessões.
import { defineMessages } from './index';

const ptBR = {
  lead_range: 'Produção em {min} a {max} dias úteis',
  lead_one: 'Produção em {n} dia útil',
  lead_same: 'Produção em {n} dias úteis',
  lead_zero: 'Pronto para envio',
  ships_by: 'Peça hoje e enviamos até {date}',
  ships_by_cutoff: 'Pedidos até as {hour}h contam no mesmo dia.',
  arrives: 'Chega entre {from} e {to}',
  arrives_same: 'Chega em {date}',
  ships_by_short: 'Enviamos até {date}',
  pickup_ready: 'Pronto para retirar a partir de {date}',
  summary: 'Previsão de entrega',
  order_title: 'Previsão',
  order_ships_by: 'Envio até {date}',
  admin_ship_by: 'Enviar até {date}',
  admin_late: 'Atrasado: era para sair até {date}',
  admin_today: 'Sai hoje',
  admin_arrives: 'Cliente espera entre {from} e {to}',
};

export type DeliveryDatesKey = keyof typeof ptBR;

export const deliveryDatesMessages = defineMessages({
  'pt-BR': ptBR,
  'pt-PT': {
    ...ptBR,
    lead_range: 'Produção em {min} a {max} dias úteis',
    ships_by: 'Encomende hoje e enviamos até {date}',
    ships_by_cutoff: 'Encomendas até às {hour}h contam no mesmo dia.',
    pickup_ready: 'Pronto para levantar a partir de {date}',
  },
  en: {
    lead_range: 'Made in {min} to {max} business days',
    lead_one: 'Made in {n} business day',
    lead_same: 'Made in {n} business days',
    lead_zero: 'Ready to ship',
    ships_by: 'Order today and we ship by {date}',
    ships_by_cutoff: 'Orders placed by {hour}:00 count the same day.',
    arrives: 'Arrives between {from} and {to}',
    arrives_same: 'Arrives on {date}',
    ships_by_short: 'Ships by {date}',
    pickup_ready: 'Ready for pickup from {date}',
    summary: 'Estimated delivery',
    order_title: 'Estimate',
    order_ships_by: 'Ships by {date}',
    admin_ship_by: 'Ship by {date}',
    admin_late: 'Late: it should have shipped by {date}',
    admin_today: 'Ships today',
    admin_arrives: 'Customer expects it between {from} and {to}',
  },
  es: {
    lead_range: 'Producción en {min} a {max} días hábiles',
    lead_one: 'Producción en {n} día hábil',
    lead_same: 'Producción en {n} días hábiles',
    lead_zero: 'Listo para enviar',
    ships_by: 'Pide hoy y lo enviamos antes del {date}',
    ships_by_cutoff: 'Los pedidos hasta las {hour} h cuentan el mismo día.',
    arrives: 'Llega entre el {from} y el {to}',
    arrives_same: 'Llega el {date}',
    ships_by_short: 'Enviamos antes del {date}',
    pickup_ready: 'Listo para recoger desde el {date}',
    summary: 'Entrega estimada',
    order_title: 'Previsión',
    order_ships_by: 'Envío antes del {date}',
    admin_ship_by: 'Enviar antes del {date}',
    admin_late: 'Retrasado: debía salir antes del {date}',
    admin_today: 'Sale hoy',
    admin_arrives: 'El cliente lo espera entre el {from} y el {to}',
  },
});

/** Prazo do produto em texto. */
export function leadText(t: (k: DeliveryDatesKey, v?: Record<string, string | number>) => string, lead: { min: number; max: number }): string {
  if (lead.max <= 0) return t('lead_zero');
  if (lead.min === lead.max) return t(lead.max === 1 ? 'lead_one' : 'lead_same', { n: lead.max });
  return t('lead_range', { min: lead.min, max: lead.max });
}
