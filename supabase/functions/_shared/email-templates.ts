// Shared HTML email templates rendered server-side for transactional sends.
// Modelos HTML antigos (sem uso hoje). Nome e endereço da loja vêm de vars (Admin); sem eles, o segredo STORE_NAME e o SITE_URL.

export interface EmailTemplateVars {
  store_name?: string;
  store_url?: string;
  customer_name?: string;
  order_id?: string;
  order_total?: string;
  tracking_code?: string;
  tracking_url?: string;
  confirmation_url?: string;
  payment_method?: string;
  intro?: string;
  subject?: string;
}

const ACCENT = "#1d4ed8"; // electric blue 700
const TEXT = "#0f172a";
const MUTED = "#64748b";

function wrap(content: string, vars: EmailTemplateVars): string {
  const storeName = vars.store_name || Deno.env.get("STORE_NAME") || "Loja";
  const storeUrl = vars.store_url || (Deno.env.get("SITE_URL") ?? "");
  return `<!doctype html>
<html lang="pt-PT">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
          <a href="${storeUrl}" style="text-decoration:none;color:${TEXT};font-weight:800;font-size:18px;letter-spacing:.04em;">${storeName}</a>
        </td></tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr><td style="padding:16px 32px 32px;border-top:1px solid #e2e8f0;color:${MUTED};font-size:12px;line-height:1.6;">
          ${storeName}<br/>
          Você recebe este e-mail porque interagiu com a nossa loja.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${ACCENT};border-radius:10px;">
    <a href="${href}" style="display:inline-block;padding:12px 20px;color:#fff;font-weight:600;text-decoration:none;font-size:14px;">${label}</a>
  </td></tr></table>`;
}

function greet(vars: EmailTemplateVars): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;">Olá ${vars.customer_name || "cliente"} 👋</h1>`;
}

export const TEMPLATE_RENDERERS: Record<string, (v: EmailTemplateVars) => string> = {
  order_new: (v) => wrap(`
    ${greet(v)}
    <p style="color:${MUTED};margin:0 0 16px;">${v.intro || "Recebemos a tua encomenda e vamos começar a preparar tudo."}</p>
    <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:${MUTED};">Número da encomenda</p>
      <p style="margin:4px 0 0;font-weight:700;font-size:18px;">#${v.order_id?.slice(0, 8) || ""}</p>
      ${v.order_total ? `<p style="margin:12px 0 0;font-size:13px;color:${MUTED};">Total</p><p style="margin:4px 0 0;font-weight:600;">${v.order_total}</p>` : ""}
    </div>
    ${button("Ver encomenda", `${v.store_url}/pedido/${v.order_id}/sucesso`)}
  `, v),

  payment_pending: (v) => wrap(`
    ${greet(v)}
    <p style="color:${MUTED};margin:0 0 16px;">${v.intro || "Estamos a aguardar a confirmação do pagamento."}</p>
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:16px;margin:16px 0;color:#92400e;">
      <strong>Encomenda #${v.order_id?.slice(0, 8) || ""}</strong> — ${v.payment_method || "Pagamento"} pendente.
    </div>
    ${button("Concluir pagamento", `${v.store_url}/pedido/${v.order_id}/sucesso`)}
  `, v),

  payment_confirmed: (v) => wrap(`
    ${greet(v)}
    <p style="color:${MUTED};margin:0 0 16px;">${v.intro || "Recebemos o teu pagamento! Vamos começar a produção."}</p>
    <div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:16px 0;color:#166534;">
      <strong>Pagamento confirmado</strong> — Encomenda #${v.order_id?.slice(0, 8) || ""}
    </div>
    ${button("Ver detalhes", `${v.store_url}/pedido/${v.order_id}/sucesso`)}
  `, v),

  order_shipped: (v) => wrap(`
    ${greet(v)}
    <p style="color:${MUTED};margin:0 0 16px;">${v.intro || "A tua encomenda foi expedida."}</p>
    ${v.tracking_code ? `<div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0;"><p style="margin:0;font-size:13px;color:${MUTED};">Código de rastreio</p><p style="margin:4px 0 0;font-family:monospace;font-weight:700;font-size:16px;">${v.tracking_code}</p></div>` : ""}
    ${v.tracking_url ? button("Acompanhar entrega", v.tracking_url) : ""}
  `, v),

  account_created: (v) => wrap(`
    ${greet(v)}
    <p style="color:${MUTED};margin:0 0 16px;">${v.intro || "A tua conta foi criada com sucesso."}</p>
    ${button("Aceder ao painel", `${v.store_url}/dashboard`)}
  `, v),

  account_confirmation: (v) => wrap(`
    ${greet(v)}
    <p style="color:${MUTED};margin:0 0 24px;">${v.intro || "Clica no botão abaixo para confirmar o teu email e ativar a tua conta."}</p>
    ${v.confirmation_url ? button("Confirmar email", v.confirmation_url) : ""}
    <p style="color:${MUTED};font-size:12px;margin:24px 0 0;">Se não solicitaste esta conta, ignora este email.</p>
  `, v),
};

export function renderEmail(key: string, vars: EmailTemplateVars): string {
  const fn = TEMPLATE_RENDERERS[key];
  if (!fn) throw new Error(`Unknown template: ${key}`);
  return fn(vars);
}