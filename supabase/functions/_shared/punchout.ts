// =============================================================================================
// PunchOut (recurso punchout): regras puras usadas pela Edge Function punchout e pelo teste
// scripts/test-punchout.mjs. Sem acesso ao banco.
//   XML        parseXml (leitor pequeno e seguro: sem DTD interna nem entidades externas), child, children, textOf
//   cXML       readEnvelope, readSetupRequest, readOrderRequest, cxmlResponse, orderMessage
//   OCI        ociLogin (USERNAME, PASSWORD, HOOK_URL e campos ~ de volta), ociFields (NEW_ITEM-...)
//   Regras     returnUrlAllowed (https e lista de endereços da empresa), auxId / parseAuxId (linha do carrinho)
// Protocolos: cXML 1.2 (PunchOutSetupRequest, PunchOutOrderMessage, OrderRequest) e SAP OCI 4.0/5.0.
// =============================================================================================

/* ---------- XML ---------- */

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

export const XML_MAX_BYTES = 1_000_000;
const MAX_DEPTH = 64;
const MAX_NODES = 20_000;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Só as 5 entidades padrão e as numéricas; nenhuma entidade declarada no documento é lida. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const localName = (n: string) => (n.includes(':') ? n.slice(n.indexOf(':') + 1) : n);

/**
 * Lê um documento XML. Recusa DTD com declarações internas ([...]), documentos grandes e profundos.
 * Comentários e instruções de processamento são ignorados. Erro: Error('xml').
 */
export function parseXml(src: string): XmlNode {
  if (typeof src !== 'string' || src.length > XML_MAX_BYTES) throw new Error('xml');
  const s = src.replace(/^\uFEFF/, '');
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  let nodes = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) {
      if (s.slice(i).trim() && stack.length > 1) throw new Error('xml');
      break;
    }
    if (lt > i && stack.length > 1) stack[stack.length - 1].text += decodeEntities(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('xml');
      i = end + 3;
    } else if (s.startsWith('<![CDATA[', lt)) {
      const end = s.indexOf(']]>', lt + 9);
      if (end < 0 || stack.length < 2) throw new Error('xml');
      stack[stack.length - 1].text += s.slice(lt + 9, end);
      i = end + 3;
    } else if (s.startsWith('<?', lt)) {
      const end = s.indexOf('?>', lt + 2);
      if (end < 0) throw new Error('xml');
      i = end + 2;
    } else if (s.startsWith('<!DOCTYPE', lt) || s.startsWith('<!doctype', lt)) {
      const end = s.indexOf('>', lt);
      if (end < 0) throw new Error('xml');
      // DTD interna (entidades, XXE): recusada.
      if (s.slice(lt, end).includes('[')) throw new Error('xml');
      i = end + 1;
    } else if (s[lt + 1] === '/') {
      const end = s.indexOf('>', lt);
      if (end < 0) throw new Error('xml');
      const name = s.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (!top || stack.length < 1 || top.name !== localName(name)) throw new Error('xml');
      i = end + 1;
    } else {
      // Etiqueta de abertura: nome e atributos (aspas simples ou duplas).
      const m = /^<([A-Za-z_][\w.:-]*)/.exec(s.slice(lt, lt + 200));
      if (!m) throw new Error('xml');
      let j = lt + m[0].length;
      const attrs: Record<string, string> = {};
      const attrRe = /\s*([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
      for (;;) {
        attrRe.lastIndex = j;
        const a = attrRe.exec(s);
        if (!a) break;
        attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? '');
        if (a[1].includes(':') && !a[1].startsWith('xmlns')) attrs[localName(a[1])] = attrs[a[1]];
        j = attrRe.lastIndex;
      }
      while (j < s.length && /\s/.test(s[j])) j++;
      const selfClose = s[j] === '/';
      if (selfClose) j++;
      if (s[j] !== '>') throw new Error('xml');
      const node: XmlNode = { name: localName(m[1]), attrs, children: [], text: '' };
      if (++nodes > MAX_NODES) throw new Error('xml');
      if (stack.length === 1 && root.children.length) throw new Error('xml');
      stack[stack.length - 1].children.push(node);
      if (!selfClose) {
        stack.push(node);
        if (stack.length > MAX_DEPTH) throw new Error('xml');
      }
      i = j + 1;
    }
  }
  if (stack.length !== 1 || root.children.length !== 1) throw new Error('xml');
  return root.children[0];
}

export const child = (n: XmlNode | null | undefined, name: string): XmlNode | null => n?.children.find((c) => c.name === name) ?? null;
export const children = (n: XmlNode | null | undefined, name: string): XmlNode[] => n?.children.filter((c) => c.name === name) ?? [];
/** Caminho de filhos separados por "/" (ex.: "Header/From/Credential"). */
export function pathOf(n: XmlNode | null | undefined, path: string): XmlNode | null {
  let cur: XmlNode | null = n ?? null;
  for (const part of path.split('/')) cur = child(cur, part);
  return cur;
}
/** Texto do elemento e dos filhos, espaços juntados. */
export function textOf(n: XmlNode | null | undefined): string {
  if (!n) return '';
  const all = (x: XmlNode): string => x.text + x.children.map(all).join(' ');
  return all(n).replace(/\s+/g, ' ').trim();
}

export function escapeXml(v: unknown): string {
  return String(v ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!))
    // caracteres de controlo não são válidos em XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/* ---------- cXML: pedidos recebidos ---------- */

export type Credential = { domain: string; identity: string; secret: string | null };
export type Envelope = {
  payloadId: string;
  from: Credential[];
  to: Credential[];
  sender: Credential | null;
  /** primeiro filho de Request (PunchOutSetupRequest, OrderRequest...) */
  request: XmlNode | null;
  requestType: string | null;
  deploymentMode: 'production' | 'test';
};

function credentials(n: XmlNode | null): Credential[] {
  return children(n, 'Credential').map((c) => ({
    domain: (c.attrs.domain ?? '').trim(),
    identity: textOf(child(c, 'Identity')),
    secret: child(c, 'SharedSecret') ? textOf(child(c, 'SharedSecret')) : null,
  }));
}

export function readEnvelope(root: XmlNode): Envelope {
  if (root.name !== 'cXML') throw new Error('xml');
  const header = child(root, 'Header');
  const request = child(root, 'Request');
  const first = request?.children[0] ?? null;
  return {
    payloadId: (root.attrs.payloadID ?? '').slice(0, 200),
    from: credentials(child(header, 'From')),
    to: credentials(child(header, 'To')),
    sender: credentials(child(header, 'Sender'))[0] ?? null,
    request: first,
    requestType: first?.name ?? null,
    deploymentMode: request?.attrs.deploymentMode === 'test' ? 'test' : 'production',
  };
}

/** Credencial que identifica a empresa: a primeira de From com identidade; a senha vem de Sender (cXML). */
export function buyerLogin(env: Envelope): { domain: string; identity: string; secret: string } | null {
  const from = env.from.find((c) => c.identity);
  const secret = env.sender?.secret ?? env.from.find((c) => c.secret)?.secret ?? null;
  if (!from || !secret) return null;
  return { domain: from.domain, identity: from.identity, secret };
}

export type PartRef = { supplierPartId: string; auxId: string; quantity: number };

function partRefs(items: XmlNode[]): PartRef[] {
  return items.slice(0, 200).map((it) => ({
    supplierPartId: textOf(pathOf(it, 'ItemID/SupplierPartID')).slice(0, 120),
    auxId: textOf(pathOf(it, 'ItemID/SupplierPartAuxiliaryID')).slice(0, 200),
    quantity: Number(it.attrs.quantity),
  })).filter((p) => (p.supplierPartId || p.auxId) && Number.isFinite(p.quantity) && p.quantity > 0);
}

export type SetupRequest = {
  operation: 'create' | 'edit' | 'inspect';
  buyerCookie: string;
  browserFormPost: string | null;
  contactName: string;
  contactEmail: string;
  items: PartRef[];
};

export function readSetupRequest(req: XmlNode): SetupRequest {
  const op = req.attrs.operation;
  const contact = child(req, 'Contact');
  // Ariba manda nome e e-mail em Extrinsic quando não há Contact.
  const extrinsic = (name: string) => textOf(children(req, 'Extrinsic').find((e) => (e.attrs.name ?? '').toLowerCase() === name.toLowerCase()));
  return {
    operation: op === 'edit' || op === 'inspect' ? op : 'create',
    buyerCookie: textOf(child(req, 'BuyerCookie')).slice(0, 500),
    browserFormPost: textOf(pathOf(req, 'BrowserFormPost/URL')) || null,
    contactName: (textOf(child(contact, 'Name')) || extrinsic('UserFullName') || extrinsic('FirstName')).slice(0, 200),
    contactEmail: (textOf(child(contact, 'Email')) || extrinsic('UserEmail')).slice(0, 200),
    items: partRefs(children(req, 'ItemOut')),
  };
}

export type PoAddress = { name: string; deliverTo: string; street: string; city: string; state: string; postalCode: string; country: string; email: string; phone: string };
export type PoLine = PartRef & { lineNumber: number; unitPrice: number | null; currency: string; description: string };
export type OrderRequest = {
  orderId: string;
  type: string;
  orderDate: string;
  total: number | null;
  currency: string;
  shipTo: PoAddress | null;
  comments: string;
  lines: PoLine[];
};

function address(n: XmlNode | null): PoAddress | null {
  const a = child(n, 'Address');
  if (!a) return null;
  const pa = child(a, 'PostalAddress');
  const phone = child(a, 'Phone');
  const tel = child(phone, 'TelephoneNumber');
  return {
    name: textOf(child(a, 'Name')).slice(0, 200),
    deliverTo: children(pa, 'DeliverTo').map(textOf).filter(Boolean).join(', ').slice(0, 200),
    street: children(pa, 'Street').map(textOf).filter(Boolean).join(', ').slice(0, 300),
    city: textOf(child(pa, 'City')).slice(0, 120),
    state: textOf(child(pa, 'State')).slice(0, 120),
    postalCode: textOf(child(pa, 'PostalCode')).slice(0, 20),
    country: (child(pa, 'Country')?.attrs.isoCountryCode ?? '').toUpperCase().slice(0, 2),
    email: textOf(child(a, 'Email')).slice(0, 200),
    phone: (tel ? [textOf(child(tel, 'CountryCode')) ? `+${textOf(child(tel, 'CountryCode'))}` : '', textOf(child(tel, 'AreaOrCityCode')), textOf(child(tel, 'Number'))].filter(Boolean).join(' ') : '').slice(0, 40),
  };
}

const moneyOf = (n: XmlNode | null): { amount: number | null; currency: string } => {
  const m = child(n, 'Money');
  const v = Number(textOf(m));
  return { amount: m && Number.isFinite(v) ? v : null, currency: (m?.attrs.currency ?? '').toUpperCase() };
};

export function readOrderRequest(req: XmlNode): OrderRequest {
  const h = child(req, 'OrderRequestHeader');
  const total = moneyOf(child(h, 'Total'));
  const items = children(req, 'ItemOut');
  const lines: PoLine[] = items.slice(0, 200).map((it, idx) => {
    const price = moneyOf(pathOf(it, 'ItemDetail/UnitPrice'));
    return {
      supplierPartId: textOf(pathOf(it, 'ItemID/SupplierPartID')).slice(0, 120),
      auxId: textOf(pathOf(it, 'ItemID/SupplierPartAuxiliaryID')).slice(0, 200),
      quantity: Number(it.attrs.quantity),
      lineNumber: Number(it.attrs.lineNumber) || idx + 1,
      unitPrice: price.amount,
      currency: price.currency || total.currency,
      description: textOf(pathOf(it, 'ItemDetail/Description')).slice(0, 300),
    };
  });
  return {
    orderId: (h?.attrs.orderID ?? '').trim().slice(0, 120),
    type: (h?.attrs.type ?? 'new').toLowerCase(),
    orderDate: h?.attrs.orderDate ?? '',
    total: total.amount,
    currency: total.currency,
    shipTo: address(child(h, 'ShipTo')),
    comments: textOf(child(h, 'Comments')).slice(0, 1000),
    lines,
  };
}

/* ---------- cXML: respostas e carrinho ---------- */

export const CXML_DOCTYPE = '<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">';

export function cxmlTimestamp(d = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function newPayloadId(host: string, d = new Date()): string {
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${d.getTime()}.${rnd}@${host.replace(/[^A-Za-z0-9.-]/g, '') || 'loja'}`;
}

/** Resposta a um pedido cXML: estado e, no PunchOutSetupRequest aceite, o endereço de entrada na loja. */
export function cxmlResponse(o: { payloadId: string; timestamp: string; code: number; text: string; message?: string; startPageUrl?: string }): string {
  const status = o.message
    ? `<Status code="${o.code}" text="${escapeXml(o.text)}">${escapeXml(o.message)}</Status>`
    : `<Status code="${o.code}" text="${escapeXml(o.text)}"/>`;
  const setup = o.startPageUrl ? `<PunchOutSetupResponse><StartPage><URL>${escapeXml(o.startPageUrl)}</URL></StartPage></PunchOutSetupResponse>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n${CXML_DOCTYPE}\n<cXML payloadID="${escapeXml(o.payloadId)}" timestamp="${escapeXml(o.timestamp)}"><Response>${status}${setup}</Response></cXML>`;
}

export type MessageLine = {
  quantity: number;
  /** código do item (SKU, ou o id do produto sem código) */
  supplierPartId: string;
  /** liga a linha ao carrinho guardado na loja (edit e pedido de compra) */
  auxId: string;
  unitPrice: number;
  description: string;
  unit: string;
  unspsc?: string | null;
  brand?: string | null;
  leadTimeDays?: number | null;
  productId: string;
};

export const money2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Carrinho devolvido ao sistema de compras (PunchOutOrderMessage). */
export function orderMessage(o: {
  payloadId: string; timestamp: string; buyerCookie: string; locale: string; currency: string;
  buyer: { domain: string; identity: string }; store: { identity: string; name: string };
  lines: MessageLine[]; total: number; tax: number; taxLabel: string; operationAllowed: 'create' | 'edit' | 'inspect';
}): string {
  const lang = escapeXml(o.locale);
  const cur = escapeXml(o.currency);
  const items = o.lines.map((l) => [
    `<ItemIn quantity="${l.quantity}">`,
    `<ItemID><SupplierPartID>${escapeXml(l.supplierPartId)}</SupplierPartID><SupplierPartAuxiliaryID>${escapeXml(l.auxId)}</SupplierPartAuxiliaryID></ItemID>`,
    '<ItemDetail>',
    `<UnitPrice><Money currency="${cur}">${money2(l.unitPrice)}</Money></UnitPrice>`,
    `<Description xml:lang="${lang}">${escapeXml(l.description)}</Description>`,
    `<UnitOfMeasure>${escapeXml(l.unit)}</UnitOfMeasure>`,
    l.unspsc ? `<Classification domain="UNSPSC">${escapeXml(l.unspsc)}</Classification>` : '',
    l.brand ? `<ManufacturerName>${escapeXml(l.brand)}</ManufacturerName>` : '',
    l.leadTimeDays != null ? `<LeadTime>${Math.max(0, Math.round(l.leadTimeDays))}</LeadTime>` : '',
    '</ItemDetail>',
    '</ItemIn>',
  ].join('')).join('\n');
  const tax = o.tax > 0 ? `<Tax><Money currency="${cur}">${money2(o.tax)}</Money><Description xml:lang="${lang}">${escapeXml(o.taxLabel)}</Description></Tax>` : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    CXML_DOCTYPE,
    `<cXML payloadID="${escapeXml(o.payloadId)}" timestamp="${escapeXml(o.timestamp)}" xml:lang="${lang}">`,
    '<Header>',
    `<From><Credential domain="NetworkID"><Identity>${escapeXml(o.store.identity)}</Identity></Credential></From>`,
    `<To><Credential domain="${escapeXml(o.buyer.domain)}"><Identity>${escapeXml(o.buyer.identity)}</Identity></Credential></To>`,
    `<Sender><Credential domain="NetworkID"><Identity>${escapeXml(o.store.identity)}</Identity></Credential><UserAgent>${escapeXml(o.store.name)}</UserAgent></Sender>`,
    '</Header>',
    '<Message>',
    '<PunchOutOrderMessage>',
    `<BuyerCookie>${escapeXml(o.buyerCookie)}</BuyerCookie>`,
    `<PunchOutOrderMessageHeader operationAllowed="${o.operationAllowed}"><Total><Money currency="${cur}">${money2(o.total)}</Money></Total>${tax}</PunchOutOrderMessageHeader>`,
    items,
    '</PunchOutOrderMessage>',
    '</Message>',
    '</cXML>',
  ].join('\n');
}

/* ---------- OCI ---------- */

export type OciLogin = { username: string; password: string; hookUrl: string; extra: Record<string, string> };

/** Campos de entrada OCI (GET ou formulário). Os campos ~OkCode, ~TARGET e ~CALLER voltam no carrinho. */
export function ociLogin(params: Record<string, string>): OciLogin | null {
  const get = (k: string) => {
    const key = Object.keys(params).find((x) => x.toLowerCase() === k.toLowerCase());
    return key ? String(params[key] ?? '') : '';
  };
  const username = get('USERNAME').trim();
  const password = get('PASSWORD');
  const hookUrl = get('HOOK_URL').trim();
  if (!username || !password || !hookUrl) return null;
  const extra: Record<string, string> = {};
  for (const k of ['~OkCode', '~TARGET', '~CALLER']) {
    const v = get(k);
    if (v && v.length <= 200) extra[k] = v;
  }
  return { username: username.slice(0, 60), password: password.slice(0, 200), hookUrl: hookUrl.slice(0, 2000), extra };
}

/** Campos NEW_ITEM-... do carrinho OCI (o navegador envia por POST para o HOOK_URL). */
export function ociFields(lines: MessageLine[], currency: string, extra: Record<string, string>): Record<string, string> {
  const f: Record<string, string> = { ...extra };
  lines.forEach((l, idx) => {
    const n = idx + 1;
    f[`NEW_ITEM-DESCRIPTION[${n}]`] = l.description.slice(0, 40);
    f[`NEW_ITEM-QUANTITY[${n}]`] = String(l.quantity);
    f[`NEW_ITEM-UNIT[${n}]`] = l.unit;
    f[`NEW_ITEM-PRICE[${n}]`] = money2(l.unitPrice);
    f[`NEW_ITEM-PRICEUNIT[${n}]`] = '1';
    f[`NEW_ITEM-CURRENCY[${n}]`] = currency;
    f[`NEW_ITEM-VENDORMAT[${n}]`] = l.supplierPartId.slice(0, 40);
    f[`NEW_ITEM-EXT_PRODUCT_ID[${n}]`] = l.productId.slice(0, 40);
    if (l.unspsc) f[`NEW_ITEM-MATGROUP[${n}]`] = l.unspsc;
    if (l.brand) f[`NEW_ITEM-MANUFACTMAT[${n}]`] = l.brand.slice(0, 40);
    if (l.leadTimeDays != null) f[`NEW_ITEM-LEADTIME[${n}]`] = String(Math.max(0, Math.round(l.leadTimeDays)));
    if (l.description.length > 40) f[`NEW_ITEM-LONGTEXT_${n}:132[]`] = l.description.slice(0, 1000);
  });
  return f;
}

/* ---------- Regras ---------- */

/**
 * Endereço para onde o carrinho volta: https (http só em localhost) e, se a empresa tiver a lista preenchida,
 * um dos endereços dela ("compras.empresa.com" ou "*.empresa.com").
 */
export function returnUrlAllowed(url: string, hosts: string[]): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return false;
  if (u.username || u.password) return false;
  if (!hosts.length) return true;
  const host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
  return hosts.some((h) => {
    const x = h.toLowerCase();
    if (x.startsWith('*.')) return host.endsWith(x.slice(1)) && host.length > x.length - 1;
    return host === x;
  });
}

/** Referência de uma linha do carrinho devolvido: "<sessão>:<posição>". */
export const auxId = (sessionId: string, idx: number) => `${sessionId}:${idx}`;
export function parseAuxId(v: string): { sessionId: string; idx: number } | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{1,3})$/i.exec(v.trim());
  return m ? { sessionId: m[1].toLowerCase(), idx: Number(m[2]) } : null;
}

/** Descrição do item: nome do produto com cor e tamanho. */
export function lineDescription(name: string, design: Record<string, unknown> | null | undefined): string {
  const opts = [design?.variation, design?.size].map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  return (opts.length ? `${name} (${opts.join(', ')})` : name).slice(0, 300);
}

/** Total do pedido de compra difere do da loja (mais de 1 centavo). */
export const totalsDiffer = (a: number | null, b: number) => a != null && Math.abs(a - b) > 0.01;
