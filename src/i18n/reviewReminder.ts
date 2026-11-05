// Lembrete de avaliação na conta do cliente (ReviewReminder). Sem emojis nem travessões.
import { defineMessages } from './index';

const ptBR = {
  title_one: 'Você tem 1 pedido entregue para avaliar',
  title_other: 'Você tem {count} pedidos entregues para avaliar',
  lead: 'Sua opinião ajuda outros clientes a escolher e leva poucos segundos.',
  order: 'Pedido {code}',
  delivered: 'Entregue em {date}',
  pending_one: '1 produto sem avaliação',
  pending_other: '{count} produtos sem avaliação',
  rate: 'Avaliar',
  more: 'E mais {count} na aba Pedidos.',
};

export const reviewReminderMessages = defineMessages({
  'pt-BR': ptBR,
  'pt-PT': {
    ...ptBR,
    title_one: 'Tem 1 encomenda entregue para avaliar',
    title_other: 'Tem {count} encomendas entregues para avaliar',
    lead: 'A sua opinião ajuda outros clientes a escolher e demora poucos segundos.',
    order: 'Encomenda {code}',
    pending_one: '1 artigo sem avaliação',
    pending_other: '{count} artigos sem avaliação',
    more: 'E mais {count} no separador Encomendas.',
  },
  en: {
    title_one: 'You have 1 delivered order to review',
    title_other: 'You have {count} delivered orders to review',
    lead: 'Your opinion helps other customers choose and takes a few seconds.',
    order: 'Order {code}',
    delivered: 'Delivered on {date}',
    pending_one: '1 product not reviewed',
    pending_other: '{count} products not reviewed',
    rate: 'Review',
    more: 'And {count} more in the Orders tab.',
  },
  es: {
    title_one: 'Tienes 1 pedido entregado para valorar',
    title_other: 'Tienes {count} pedidos entregados para valorar',
    lead: 'Tu opinión ayuda a otros clientes a elegir y lleva pocos segundos.',
    order: 'Pedido {code}',
    delivered: 'Entregado el {date}',
    pending_one: '1 producto sin opinión',
    pending_other: '{count} productos sin opinión',
    rate: 'Valorar',
    more: 'Y {count} más en la pestaña Pedidos.',
  },
});
