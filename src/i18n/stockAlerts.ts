// Textos do Avise-me quando chegar na página do produto (src/components/product/StockAlertForm.tsx).
// r_<código> = resposta de public.request_stock_alert (src/lib/stockAlerts.ts). Sem emojis nem travessões.
import { defineMessages } from './index';

const ptBR = {
  title: 'Avise-me quando chegar',
  text: 'Deixe seu e-mail e a loja avisa quando este produto voltar ao estoque.',
  email: 'Seu e-mail',
  placeholder: 'seu@email.com',
  submit: 'Avisar-me',
  privacy: 'Usamos seu e-mail só para este aviso.',
  r_ok: 'Pronto! Vamos avisar {email} quando o produto voltar.',
  r_already: 'Você já está na lista: vamos avisar {email} quando o produto voltar.',
  r_invalid_email: 'Confira o e-mail.',
  r_disabled: 'Esta loja não está recebendo pedidos de aviso agora.',
  r_product_not_found: 'Este produto não está mais disponível.',
  r_too_many: 'Muitos pedidos agora. Tente de novo mais tarde.',
  r_error: 'Não foi possível guardar o pedido. Tente novamente.',
};

export const stockAlertsMessages = defineMessages({
  'pt-BR': ptBR,
  'pt-PT': {
    ...ptBR,
    text: 'Deixe o seu e-mail e a loja avisa quando este produto voltar ao stock.',
    email: 'O seu e-mail',
    placeholder: 'o.seu@email.com',
    privacy: 'Usamos o seu e-mail só para este aviso.',
    r_ok: 'Pronto! Vamos avisar {email} quando o produto voltar.',
    r_already: 'Já está na lista: vamos avisar {email} quando o produto voltar.',
    r_disabled: 'Esta loja não está a receber pedidos de aviso agora.',
    r_too_many: 'Muitos pedidos agora. Tente novamente mais tarde.',
  },
  en: {
    title: 'Notify me when back',
    text: 'Leave your email and the store will tell you when this product is back in stock.',
    email: 'Your email',
    placeholder: 'you@email.com',
    submit: 'Notify me',
    privacy: 'We only use your email for this notice.',
    r_ok: 'Done! We will tell {email} when the product is back.',
    r_already: 'You are already on the list: we will tell {email} when the product is back.',
    r_invalid_email: 'Please check the email.',
    r_disabled: 'This store is not taking notice requests right now.',
    r_product_not_found: 'This product is no longer available.',
    r_too_many: 'Too many requests right now. Please try again later.',
    r_error: 'Could not save the request. Please try again.',
  },
  es: {
    title: 'Avísame cuando llegue',
    text: 'Deje su correo y la tienda le avisará cuando este producto vuelva a tener stock.',
    email: 'Su correo',
    placeholder: 'su@correo.com',
    submit: 'Avisarme',
    privacy: 'Solo usamos su correo para este aviso.',
    r_ok: '¡Listo! Avisaremos a {email} cuando el producto vuelva.',
    r_already: 'Ya está en la lista: avisaremos a {email} cuando el producto vuelva.',
    r_invalid_email: 'Revise el correo.',
    r_disabled: 'Esta tienda no está recibiendo solicitudes de aviso ahora.',
    r_product_not_found: 'Este producto ya no está disponible.',
    r_too_many: 'Demasiadas solicitudes ahora. Inténtelo más tarde.',
    r_error: 'No se pudo guardar la solicitud. Inténtelo de nuevo.',
  },
});
