// Textos dos campos extra no checkout para o cliente (checkout, pedido na conta). Sem emojis nem travessões.
import { defineMessages } from './index';

const ptBR = {
  section_title: 'Detalhes do pedido',
  section_sub: 'Escolha os extras e deixe as informações que quiser.',
  required: 'Obrigatório',
  optional: 'Opcional',
  plus_price: 'mais {price}',
  free: 'Grátis',
  choose: 'Escolha uma opção',
  none: 'Nenhuma',
  chars_left: '{n} caracteres restantes',
  err_required: 'Preencha este campo.',
  err_too_long: 'Texto longo demais.',
  block: 'Preencha os campos obrigatórios em Detalhes do pedido.',
  summary: 'Extras do pedido',
  yes: 'Sim',
  order_title: 'Detalhes do pedido',
};

export type CheckoutFieldsKey = keyof typeof ptBR;

export const checkoutFieldsMessages = defineMessages({
  'pt-BR': ptBR,
  'pt-PT': {
    ...ptBR,
    section_title: 'Detalhes da encomenda',
    block: 'Preencha os campos obrigatórios em Detalhes da encomenda.',
    summary: 'Extras da encomenda',
    order_title: 'Detalhes da encomenda',
  },
  en: {
    section_title: 'Order details',
    section_sub: 'Choose extras and leave any information you want.',
    required: 'Required',
    optional: 'Optional',
    plus_price: 'plus {price}',
    free: 'Free',
    choose: 'Choose an option',
    none: 'None',
    chars_left: '{n} characters left',
    err_required: 'Please fill in this field.',
    err_too_long: 'Text is too long.',
    block: 'Fill in the required fields in Order details.',
    summary: 'Order extras',
    yes: 'Yes',
    order_title: 'Order details',
  },
  es: {
    section_title: 'Detalles del pedido',
    section_sub: 'Elija los extras y deje la información que quiera.',
    required: 'Obligatorio',
    optional: 'Opcional',
    plus_price: 'más {price}',
    free: 'Gratis',
    choose: 'Elija una opción',
    none: 'Ninguna',
    chars_left: 'Quedan {n} caracteres',
    err_required: 'Complete este campo.',
    err_too_long: 'Texto demasiado largo.',
    block: 'Complete los campos obligatorios en Detalles del pedido.',
    summary: 'Extras del pedido',
    yes: 'Sí',
    order_title: 'Detalles del pedido',
  },
});
