// =====================================================================================
// PunchOut (recurso punchout): regras do navegador. O servidor (Edge Function punchout, _shared/punchout.ts) fala
// com o sistema de compras e calcula os preços; aqui ficam:
//   Sessão      readPunchout / savePunchout / clearPunchout (sessionStorage "loja3d-punchout", só nesta aba)
//   Retorno     submitToProcurement (formulário POST para o sistema de compras, como pedem cXML e OCI)
//   Erros       PUNCHOUT_ERRORS, punchoutErrorOf (códigos estáveis da função e do banco)
//   Admin       BuyerDraft, EMPTY_BUYER, buyerErrors, parseHosts, generateSecret, endpointUrl, ociStartUrl, sampleSetupRequest
// Sem imports com @/ para o teste em node (scripts/test-punchout.mjs).
// =====================================================================================

/* ---------- Sessão no navegador ---------- */

export const PUNCHOUT_KEY = 'loja3d-punchout';
export const PUNCHOUT_EVENT = 'punchout-changed';

export type PunchoutProtocol = 'cxml' | 'oci';
export type PunchoutOperation = 'create' | 'edit' | 'inspect';

export type PunchoutSession = {
  token: string;
  buyer: string;
  protocol: PunchoutProtocol;
  operation: PunchoutOperation;
  test: boolean;
  expiresAt: string;
  contact: string | null;
};

export function normalizeSession(v: unknown): PunchoutSession | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!o || typeof o.token !== 'string' || !/^[0-9a-f]{48}$/.test(o.token)) return null;
  const expiresAt = String(o.expiresAt ?? '');
  if (!Number.isFinite(Date.parse(expiresAt))) return null;
  return {
    token: o.token,
    buyer: String(o.buyer ?? '').slice(0, 120),
    protocol: o.protocol === 'oci' ? 'oci' : 'cxml',
    operation: o.operation === 'edit' || o.operation === 'inspect' ? o.operation : 'create',
    test: o.test === true,
    expiresAt,
    contact: typeof o.contact === 'string' && o.contact ? o.contact.slice(0, 200) : null,
  };
}

export const sessionExpired = (s: PunchoutSession, now = Date.now()) => Date.parse(s.expiresAt) <= now;

/** Sessão desta aba (null sem PunchOut, expirada ou sem acesso ao armazenamento). */
export function readPunchout(): PunchoutSession | null {
  try {
    const s = normalizeSession(JSON.parse(sessionStorage.getItem(PUNCHOUT_KEY) ?? 'null'));
    return s && !sessionExpired(s) ? s : null;
  } catch {
    return null;
  }
}

export function savePunchout(s: PunchoutSession) {
  try { sessionStorage.setItem(PUNCHOUT_KEY, JSON.stringify(s)); } catch { /* sem armazenamento: só a página atual sabe */ }
  window.dispatchEvent(new Event(PUNCHOUT_EVENT));
}

export function clearPunchout() {
  try { sessionStorage.removeItem(PUNCHOUT_KEY); } catch { /* ignora */ }
  window.dispatchEvent(new Event(PUNCHOUT_EVENT));
}

/** Envia o carrinho ao sistema de compras: formulário POST na janela inteira (o sistema pode estar numa moldura). */
export function submitToProcurement(url: string, fields: Record<string, string>) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  form.target = '_top';
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/* ---------- Erros ---------- */

export const PUNCHOUT_ERRORS = [
  'invalid', 'used', 'expired', 'inactive', 'return_url', 'inspect', 'empty', 'unavailable', 'feature_off', 'server',
] as const;
export type PunchoutError = (typeof PUNCHOUT_ERRORS)[number];

export function punchoutErrorOf(v: unknown): PunchoutError {
  const s = String(v ?? '');
  return (PUNCHOUT_ERRORS as readonly string[]).find((c) => s === c) as PunchoutError | undefined ?? 'server';
}

/* ---------- Admin: empresas ---------- */

export type PunchoutBuyer = {
  id: string;
  name: string;
  protocol: PunchoutProtocol;
  cxml_domain: string;
  cxml_identity: string | null;
  oci_username: string | null;
  has_secret: boolean;
  user_id: string | null;
  country_code: string;
  return_hosts: string[];
  unspsc: string | null;
  accept_orders: boolean;
  shipping_fee: number;
  session_minutes: number;
  is_active: boolean;
  notes: string | null;
  last_used_at: string | null;
  created_at: string;
};

export type BuyerDraft = {
  name: string;
  protocol: PunchoutProtocol;
  cxml_domain: string;
  cxml_identity: string;
  oci_username: string;
  user_id: string;
  country_code: string;
  hosts: string;
  unspsc: string;
  accept_orders: boolean;
  shipping_fee: string;
  session_minutes: number;
  is_active: boolean;
  notes: string;
};

export const EMPTY_BUYER: BuyerDraft = {
  name: '', protocol: 'cxml', cxml_domain: 'NetworkID', cxml_identity: '', oci_username: '', user_id: '', country_code: 'BR', hosts: '',
  unspsc: '', accept_orders: true, shipping_fee: '0', session_minutes: 120, is_active: true, notes: '',
};

export const SESSION_MINUTE_OPTIONS = [30, 60, 120, 240, 480, 1440] as const;
export const CXML_DOMAINS = ['NetworkID', 'DUNS', 'NetworkId', 'BuyerID', 'SystemID'] as const;
export const SECRET_MIN = 12;

export function draftOf(b: PunchoutBuyer): BuyerDraft {
  return {
    name: b.name, protocol: b.protocol, cxml_domain: b.cxml_domain || 'NetworkID', cxml_identity: b.cxml_identity ?? '', oci_username: b.oci_username ?? '',
    user_id: b.user_id ?? '', country_code: b.country_code, hosts: (b.return_hosts ?? []).join('\n'), unspsc: b.unspsc ?? '',
    accept_orders: b.accept_orders, shipping_fee: String(b.shipping_fee ?? 0), session_minutes: b.session_minutes, is_active: b.is_active, notes: b.notes ?? '',
  };
}

/** Lista de endereços (um por linha ou separados por vírgula); aceita URL inteira e guarda só o host. */
export function parseHosts(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[\n,;\s]+/)) {
    let v = raw.trim().toLowerCase();
    if (!v) continue;
    if (/^https?:\/\//.test(v)) {
      try { const u = new URL(v); v = u.port ? `${u.hostname}:${u.port}` : u.hostname; } catch { /* fica como está e falha na validação */ }
    }
    out.add(v.replace(/\/.*$/, ''));
  }
  return [...out];
}

const HOST_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/;

export const BUYER_ERRORS = ['name', 'login', 'login_taken', 'secret', 'country', 'hosts', 'unspsc', 'fee', 'minutes', 'account', 'not_found'] as const;
export type BuyerError = (typeof BUYER_ERRORS)[number];

/** Mesmas regras de admin_save_punchout_buyer. secret = senha nova digitada (vazia = manter). */
export function buyerErrors(d: BuyerDraft, isNew: boolean, secret: string): BuyerError[] {
  const e: BuyerError[] = [];
  const name = d.name.trim();
  if (name.length < 2 || name.length > 120) e.push('name');
  if (d.protocol === 'cxml' ? !d.cxml_identity.trim() || d.cxml_identity.trim().length > 120 || !d.cxml_domain.trim() || d.cxml_domain.trim().length > 60
    : !/^[A-Za-z0-9._@-]{3,60}$/.test(d.oci_username.trim())) e.push('login');
  if ((isNew && !secret) || (secret && (secret.length < SECRET_MIN || secret.length > 200))) e.push('secret');
  if (!/^[A-Z]{2}$/.test(d.country_code)) e.push('country');
  const hosts = parseHosts(d.hosts);
  if (hosts.length > 20 || hosts.some((h) => !HOST_RE.test(h))) e.push('hosts');
  if (d.unspsc.trim() && !/^[0-9]{2,8}$/.test(d.unspsc.trim())) e.push('unspsc');
  const fee = Number(String(d.shipping_fee).replace(',', '.'));
  if (!Number.isFinite(fee) || fee < 0 || fee > 100000) e.push('fee');
  if (!Number.isInteger(d.session_minutes) || d.session_minutes < 10 || d.session_minutes > 1440) e.push('minutes');
  return e;
}

export function buyerErrorOf(message: unknown): BuyerError | 'server' {
  const s = String(message ?? '');
  return (BUYER_ERRORS as readonly string[]).find((c) => s === c || s.endsWith(`: ${c}`)) as BuyerError | undefined ?? 'server';
}

/** Dados para admin_save_punchout_buyer. */
export function buyerPayload(d: BuyerDraft) {
  return {
    name: d.name.trim(), protocol: d.protocol, cxml_domain: d.cxml_domain.trim(), cxml_identity: d.cxml_identity.trim(), oci_username: d.oci_username.trim(),
    user_id: d.user_id || null, country_code: d.country_code, return_hosts: parseHosts(d.hosts), unspsc: d.unspsc.trim() || null,
    accept_orders: d.accept_orders, shipping_fee: Math.round(Number(String(d.shipping_fee).replace(',', '.')) * 100) / 100,
    session_minutes: d.session_minutes, is_active: d.is_active, notes: d.notes.trim(),
  };
}

const SECRET_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** Senha aleatória para entregar à empresa (24 caracteres, sem letras parecidas). */
export function generateSecret(length = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => SECRET_CHARS[b % SECRET_CHARS.length]).join('');
}

/** Endereço que a empresa cadastra no sistema de compras. */
export const endpointUrl = (site: string) => `${site.replace(/\/+$/, '')}/functions/v1/punchout`;

/** Exemplo do endereço de entrada OCI (o sistema troca a senha e o HOOK_URL). */
export function ociStartUrl(site: string, username: string): string {
  const q = new URLSearchParams({ USERNAME: username || 'utilizador', PASSWORD: '<senha>', HOOK_URL: 'https://sistema-de-compras/retorno' });
  return `${endpointUrl(site)}?${q.toString().replace('%3Csenha%3E', '<senha>')}`;
}

const xmlEscape = (v: string) => v.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));

/** Exemplo de PunchOutSetupRequest para a equipa de compras da empresa testar (sem a senha verdadeira). */
export function sampleSetupRequest(d: Pick<BuyerDraft, 'cxml_domain' | 'cxml_identity'>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">',
    '<cXML payloadID="123@sistema-de-compras" timestamp="2026-01-01T10:00:00+00:00">',
    '  <Header>',
    `    <From><Credential domain="${xmlEscape(d.cxml_domain || 'NetworkID')}"><Identity>${xmlEscape(d.cxml_identity || 'IDENTIDADE')}</Identity></Credential></From>`,
    '    <To><Credential domain="NetworkID"><Identity>loja</Identity></Credential></To>',
    '    <Sender><Credential domain="NetworkID"><Identity>sistema</Identity><SharedSecret>SENHA</SharedSecret></Credential><UserAgent>Sistema de compras</UserAgent></Sender>',
    '  </Header>',
    '  <Request>',
    '    <PunchOutSetupRequest operation="create">',
    '      <BuyerCookie>123</BuyerCookie>',
    '      <BrowserFormPost><URL>https://sistema-de-compras/retorno</URL></BrowserFormPost>',
    '    </PunchOutSetupRequest>',
    '  </Request>',
    '</cXML>',
  ].join('\n');
}

/* ---------- Admin: números ---------- */

export type PunchoutStats = {
  buyers: number; sessions_30d: number; returned_30d: number; carts_value_30d: number;
  orders_30d: number; orders_value_30d: number; rejected_30d: number; mismatch_30d: number;
};
export const EMPTY_PUNCHOUT_STATS: PunchoutStats = {
  buyers: 0, sessions_30d: 0, returned_30d: 0, carts_value_30d: 0, orders_30d: 0, orders_value_30d: 0, rejected_30d: 0, mismatch_30d: 0,
};

export type SessionStatus = 'open' | 'returned' | 'cancelled' | 'expired';
/** Situação mostrada: aberta depois do prazo conta como expirada. */
export function sessionStatus(s: { status: string; expires_at: string }, now = Date.now()): SessionStatus {
  if (s.status === 'returned' || s.status === 'cancelled') return s.status;
  return Date.parse(s.expires_at) <= now ? 'expired' : 'open';
}
