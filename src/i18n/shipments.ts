// Textos das remessas (envios parciais) para o cliente: conta e acompanhamento. Sem emojis nem travessões.
import { defineMessages } from './index';

const ptBR = {
  title: 'Remessas',
  shipment: 'Remessa {n}',
  st_preparing: 'Em preparação',
  st_shipped: 'Enviada',
  st_delivered: 'Entregue',
  progress: '{shipped} de {total} itens já saíram',
  progress_done: 'Todos os itens já saíram',
  progress_delivered: 'Todos os itens foram entregues',
  track: 'Rastrear',
  code: 'Código {code}',
  shipped_on: 'Enviada em {date}',
  delivered_on: 'Entregue em {date}',
  item: '{qty} x {name}',
  product: 'Produto',
};

export type ShipmentsKey = keyof typeof ptBR;

export const shipmentsMessages = defineMessages({
  'pt-BR': ptBR,
  'pt-PT': { ...ptBR, product: 'Artigo' },
  en: {
    title: 'Shipments',
    shipment: 'Shipment {n}',
    st_preparing: 'Being prepared',
    st_shipped: 'Shipped',
    st_delivered: 'Delivered',
    progress: '{shipped} of {total} items have shipped',
    progress_done: 'All items have shipped',
    progress_delivered: 'All items were delivered',
    track: 'Track',
    code: 'Code {code}',
    shipped_on: 'Shipped on {date}',
    delivered_on: 'Delivered on {date}',
    item: '{qty} x {name}',
    product: 'Product',
  },
  es: {
    title: 'Envíos',
    shipment: 'Envío {n}',
    st_preparing: 'En preparación',
    st_shipped: 'Enviado',
    st_delivered: 'Entregado',
    progress: '{shipped} de {total} artículos ya salieron',
    progress_done: 'Todos los artículos ya salieron',
    progress_delivered: 'Todos los artículos fueron entregados',
    track: 'Seguir',
    code: 'Código {code}',
    shipped_on: 'Enviado el {date}',
    delivered_on: 'Entregado el {date}',
    item: '{qty} x {name}',
    product: 'Producto',
  },
});
