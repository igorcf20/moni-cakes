// =============================================================================================
// Campanhas de newsletter (recurso newsletter_campaigns; Admin > Marketing > Newsletter, página de cancelamento
// /newsletter/cancelar?t=<chave>). Regras no banco (migration 20261007180000_newsletter_campaigns.sql): público
// calculado e congelado no servidor (newsletter_queue), conteúdo fechado fora do rascunho, cancelamento pela chave
// de cada inscrição. Aqui: tipos, estados, regras da loja (store_settings.newsletter), o que falta numa campanha e
// o HTML do e-mail (mesma montagem para a prévia do Admin e, quando houver remetente, para o envio). Sem imports.
// Teste: node --experimental-strip-types scripts/test-newsletter.mjs
// =============================================================================================

export type NewsletterLocale = 'pt-BR' | 'pt-PT' | 'en' | 'es';
export type CampaignStatus = 'draft' | 'queued' | 'sending' | 'sent' | 'cancelled';
/** Estado mostrado no Admin: agendada = na fila com data no futuro. */
export type CampaignState = 'draft' | 'scheduled' | 'queued' | 'sending' | 'sent' | 'cancelled';
export type Segment = 'all' | 'accounts' | 'no_account' | 'customers' | 'no_orders';

export const SEGMENTS: Segment[] = ['all', 'customers', 'no_orders', 'accounts', 'no_account'];
export const NEWSLETTER_LOCALES: NewsletterLocale[] = ['pt-BR', 'pt-PT', 'en', 'es'];
export const UNSUBSCRIBE_PATH = '/newsletter/cancelar';
export const MAX_CAMPAIGN_PRODUCTS = 6;

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  body: string | null;
  product_ids: string[];
  segment: Segment;
  locale: NewsletterLocale | null;
  status: CampaignStatus;
  send_at: string | null;
  queued_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  recipients: number;
  created_at: string;
  updated_at: string;
};

export type CampaignDraft = Pick<Campaign, 'name' | 'subject' | 'preheader' | 'body' | 'product_ids' | 'segment' | 'locale'>;
export const EMPTY_CAMPAIGN: CampaignDraft = { name: '', subject: '', preheader: null, body: '', product_ids: [], segment: 'all', locale: null };

export type DeliveryStats = { queued: number; sent: number; failed: number; skipped: number };
export const EMPTY_DELIVERY_STATS: DeliveryStats = { queued: 0, sent: 0, failed: 0, skipped: 0 };

export type Subscriber = {
  id: string;
  email: string;
  name: string | null;
  status: 'subscribed' | 'unsubscribed';
  source: string | null;
  locale: NewsletterLocale | null;
  created_at: string;
  unsubscribed_at: string | null;
};

export type NewsletterSettings = {
  /** Nome do remetente (vazio = nome da loja). */
  from_name: string;
  /** E-mail que recebe as respostas (vazio = sem resposta). */
  reply_to: string;
  /** Rodapé do e-mail: nome da empresa e endereço (exigido pelas regras de e-mail de marketing). */
  footer_text: string;
};
export const NEWSLETTER_DEFAULTS: NewsletterSettings = { from_name: '', reply_to: '', footer_text: '' };

export const NEWSLETTER_ERRORS = ['feature_off', 'not_found', 'not_draft', 'not_queued', 'empty', 'no_recipients', 'locked'] as const;
export type NewsletterError = (typeof NEWSLETTER_ERRORS)[number] | 'unknown';
export const newsletterErrorOf = (message: unknown): NewsletterError => {
  const m = String(message ?? '');
  return [...NEWSLETTER_ERRORS].sort((a, b) => b.length - a.length).find((c) => m.includes(c)) ?? 'unknown';
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normalizeNewsletterSettings(raw: unknown): NewsletterSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const reply = str(o.reply_to, 200);
  return { from_name: str(o.from_name, 100), reply_to: EMAIL_RE.test(reply) ? reply : '', footer_text: str(o.footer_text, 600) };
}

export function campaignState(c: Pick<Campaign, 'status' | 'send_at'>, now = new Date()): CampaignState {
  if (c.status === 'queued' && c.send_at && new Date(c.send_at).getTime() > now.getTime()) return 'scheduled';
  return c.status;
}

/** Texto simples do HTML (prévia, campanha vazia). */
export function htmlText(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** O que falta (chaves de texto do Admin). Pôr na fila pede assunto e texto. */
export function campaignDraftErrors(d: Pick<CampaignDraft, 'name' | 'subject' | 'body'>, sending: boolean) {
  const errs: ('name' | 'subject' | 'body')[] = [];
  if (!d.name.trim()) errs.push('name');
  if (sending && !d.subject.trim()) errs.push('subject');
  if (sending && !htmlText(d.body)) errs.push('body');
  return errs;
}

/** Cópia de uma campanha como rascunho novo. */
export const duplicateCampaign = (c: CampaignDraft, suffix: string): CampaignDraft => ({
  ...c, name: `${c.name} ${suffix}`.slice(0, 200), product_ids: [...c.product_ids],
});

/** Endereço absoluto (as imagens do e-mail não podem ser relativas). */
export function absoluteUrl(base: string, path: string | null | undefined): string {
  const p = String(path ?? '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return `${base.replace(/\/+$/, '')}/${p.replace(/^\/+/, '')}`;
}

export const escapeHtml = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export type EmailProduct = { name: string; price: string; oldPrice?: string | null; image: string | null; url: string };
export type EmailInput = {
  subject: string;
  preheader: string | null;
  /** HTML do editor do Admin (já limpo por quem chama). */
  body: string;
  products: EmailProduct[];
  brand: { name: string; logo: string; primary: string; text: string; muted: string; background: string; surface: string; border: string };
  footerText: string;
  siteUrl: string;
  unsubscribeUrl: string;
  labels: { viewProduct: string; products: string; unsubscribe: string; why: string; visit: string };
  lang: string;
};

/**
 * HTML do e-mail: tabelas e estilos em linha (o que os programas de e-mail aceitam), largura de 600px, logo ou
 * nome da loja, texto, até 6 produtos em duas colunas e o rodapé com o endereço e o link para cancelar.
 */
export function renderNewsletterEmail(i: EmailInput): string {
  const b = i.brand;
  const e = escapeHtml;
  const head = b.logo
    ? `<img src="${e(b.logo)}" alt="${e(b.name)}" height="40" style="display:block;height:40px;width:auto;border:0;">`
    : `<span style="font-size:22px;font-weight:800;color:${e(b.text)};letter-spacing:-0.02em;">${e(b.name)}</span>`;
  const cards = i.products.slice(0, MAX_CAMPAIGN_PRODUCTS).map((p) => `
          <td width="50%" valign="top" style="padding:8px;">
            <a href="${e(p.url)}" style="text-decoration:none;color:${e(b.text)};display:block;border:1px solid ${e(b.border)};border-radius:16px;overflow:hidden;background:${e(b.surface)};">
              ${p.image ? `<img src="${e(p.image)}" alt="" width="268" style="display:block;width:100%;height:auto;border:0;background:${e(b.background)};">` : ''}
              <span style="display:block;padding:12px 14px 4px;font-size:15px;font-weight:600;line-height:1.35;">${e(p.name)}</span>
              <span style="display:block;padding:0 14px 14px;font-size:15px;font-weight:700;">${p.oldPrice ? `<s style="color:${e(b.muted)};font-weight:400;margin-right:6px;">${e(p.oldPrice)}</s>` : ''}${e(p.price)}</span>
            </a>
          </td>`);
  const rows: string[] = [];
  for (let k = 0; k < cards.length; k += 2) rows.push(`<tr>${cards[k]}${cards[k + 1] ?? '<td width="50%"></td>'}</tr>`);
  const products = rows.length ? `
      <tr><td style="padding:8px 24px 0;font-size:18px;font-weight:700;color:${e(b.text)};">${e(i.labels.products)}</td></tr>
      <tr><td style="padding:4px 16px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table></td></tr>` : '';
  return `<!doctype html>
<html lang="${e(i.lang)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(i.subject)}</title></head>
<body style="margin:0;padding:0;background:${e(b.background)};font-family:Inter,Arial,Helvetica,sans-serif;color:${e(b.text)};">
  <span style="display:none!important;opacity:0;max-height:0;overflow:hidden;">${e(i.preheader ?? '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${e(b.background)};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${e(b.surface)};border-radius:20px;border:1px solid ${e(b.border)};">
        <tr><td style="padding:24px 24px 8px;"><a href="${e(i.siteUrl)}" style="text-decoration:none;">${head}</a></td></tr>
        <tr><td style="padding:8px 24px 16px;font-size:16px;line-height:1.6;color:${e(b.text)};">${i.body}</td></tr>
        ${products}
        <tr><td style="padding:8px 24px 24px;"><a href="${e(i.siteUrl)}" style="display:inline-block;background:${e(b.primary)};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">${e(i.labels.visit)}</a></td></tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:16px 24px;font-size:12px;line-height:1.6;color:${e(b.muted)};text-align:center;">
          ${i.footerText ? `${e(i.footerText).replace(/\n/g, '<br>')}<br>` : ''}${e(i.labels.why)}<br>
          <a href="${e(i.unsubscribeUrl)}" style="color:${e(b.muted)};text-decoration:underline;">${e(i.labels.unsubscribe)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
