// =====================================================================================
// Impressão de pedidos (recurso order_printing, Admin > Pedidos > Impressão de pedidos): o que a loja imprime quando
// chega um pedido, montado no navegador e impresso pela impressora do computador (sem integração com transportadora).
//   sheet        folha do pedido (separação e conferência): código e código de barras, cliente, entrega, itens, totais
//   label        etiqueta de envio no estilo dos Correios: destinatário em destaque, CEP em código de barras, serviço,
//                código do pedido e do rastreio, remetente
//   declaration  declaração de conteúdo (remetente, destinatário, itens e valores, texto da loja, assinatura)
// Regras em store_settings.order_print (normalizeOrderPrint). A fila "para imprimir" é calculada no servidor
// (public.admin_print_queue, com os mesmos padrões daqui) a partir de public.order_prints.
// renderPrintDocument devolve uma página HTML completa (escapada) que o Admin mostra num iframe e manda imprimir.
// Sem imports com @/ para o teste em node (scripts/test-order-print.mjs).
// =====================================================================================
import { barcodeModules, barcodeSvg } from './barcode.ts';

export const PRINT_DOCS = ['sheet', 'label', 'declaration'] as const;
export type PrintDoc = (typeof PRINT_DOCS)[number];

export const SHEET_PAPERS = ['a4', 'a5', 'receipt80'] as const;
export type SheetPaper = (typeof SHEET_PAPERS)[number];
export const LABEL_SIZES = ['100x150', '100x100', 'a4_4'] as const;
export type LabelSize = (typeof LABEL_SIZES)[number];

/** Estados do pedido que podem entrar na fila de impressão. */
export const QUEUE_STATUSES = ['pending', 'awaiting_payment', 'paid', 'preparing'] as const;

export const SHEET_FIELDS = [
  'logo', 'order_barcode', 'customer', 'contact', 'tax_id', 'shipping_address', 'billing_address', 'shipping_method',
  'payment', 'item_images', 'item_options', 'item_sku', 'prices', 'checkout_fields', 'notes', 'check_boxes', 'signature', 'footer',
] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];

export const LABEL_FIELDS = [
  'logo', 'service', 'order_barcode', 'tracking_barcode', 'postal_barcode', 'recipient_phone', 'recipient_tax_id',
  'sender', 'weight', 'items', 'declared_value', 'notes',
] as const;
export type LabelField = (typeof LABEL_FIELDS)[number];

export const DECLARATION_FIELDS = ['values', 'weight', 'tax_ids', 'signature'] as const;
export type DeclarationField = (typeof DECLARATION_FIELDS)[number];

export const SENDER_KEYS = ['name', 'tax_id', 'street', 'number', 'complement', 'parish', 'city', 'region', 'postal_code', 'country', 'phone', 'email'] as const;
export type SenderKey = (typeof SENDER_KEYS)[number];
export type PrintSender = Record<SenderKey, string>;

export type OrderPrintSettings = {
  queue: {
    /** Estados que entram na fila "para imprimir". */
    statuses: string[];
    /** Documentos que cada pedido da fila precisa ter impressos para sair dela. */
    docs: PrintDoc[];
    /** Marcar como impresso ao mandar imprimir (senão, só pelo botão). */
    mark_on_print: boolean;
    /** Ao imprimir a folha de um pedido pago, passar o pedido para Em preparação. */
    advance_to_preparing: boolean;
    /** Com a fila aberta no Admin, abrir a impressão sozinho quando chega um pedido novo. */
    auto_print: boolean;
  };
  sheet: { paper: SheetPaper; copies: number; fields: Record<SheetField, boolean>; footer_text: string };
  label: { size: LabelSize; fields: Record<LabelField, boolean> };
  declaration: { fields: Record<DeclarationField, boolean>; text: string };
  /** Remetente da etiqueta e da declaração; campo vazio = dados da loja (Configurações > Empresa). */
  sender: PrintSender;
};

const on = <K extends string>(keys: readonly K[], offs: K[] = []) =>
  Object.fromEntries(keys.map((k) => [k, !offs.includes(k)])) as Record<K, boolean>;

export const DEFAULT_ORDER_PRINT: OrderPrintSettings = {
  queue: { statuses: ['paid', 'preparing'], docs: ['sheet', 'label'], mark_on_print: true, advance_to_preparing: false, auto_print: false },
  sheet: { paper: 'a4', copies: 1, fields: on(SHEET_FIELDS, ['billing_address', 'signature']), footer_text: '' },
  label: { size: '100x150', fields: on(LABEL_FIELDS, ['recipient_tax_id', 'items', 'declared_value', 'notes']) },
  declaration: { fields: on(DECLARATION_FIELDS), text: '' },
  sender: Object.fromEntries(SENDER_KEYS.map((k) => [k, ''])) as PrintSender,
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const flags = <K extends string>(raw: unknown, keys: readonly K[], base: Record<K, boolean>) => {
  const r = obj(raw);
  return Object.fromEntries(keys.map((k) => [k, typeof r[k] === 'boolean' ? (r[k] as boolean) : base[k]])) as Record<K, boolean>;
};
const subset = <T extends string>(raw: unknown, list: readonly T[], fallback: T[]): T[] =>
  Array.isArray(raw) ? list.filter((x) => raw.includes(x)) : [...fallback];

export function normalizeOrderPrint(raw: unknown): OrderPrintSettings {
  const r = obj(raw);
  const d = DEFAULT_ORDER_PRINT;
  const q = obj(r.queue);
  const sh = obj(r.sheet);
  const lb = obj(r.label);
  const dc = obj(r.declaration);
  const sd = obj(r.sender);
  const copies = Math.round(Number(sh.copies));
  return {
    queue: {
      statuses: subset(q.statuses, QUEUE_STATUSES, d.queue.statuses as (typeof QUEUE_STATUSES)[number][]),
      docs: subset(q.docs, PRINT_DOCS, d.queue.docs),
      mark_on_print: typeof q.mark_on_print === 'boolean' ? q.mark_on_print : d.queue.mark_on_print,
      advance_to_preparing: typeof q.advance_to_preparing === 'boolean' ? q.advance_to_preparing : d.queue.advance_to_preparing,
      auto_print: typeof q.auto_print === 'boolean' ? q.auto_print : d.queue.auto_print,
    },
    sheet: {
      paper: pick(sh.paper, SHEET_PAPERS, d.sheet.paper),
      copies: Number.isFinite(copies) ? Math.min(5, Math.max(1, copies)) : 1,
      fields: flags(sh.fields, SHEET_FIELDS, d.sheet.fields),
      footer_text: str(sh.footer_text, 400),
    },
    label: { size: pick(lb.size, LABEL_SIZES, d.label.size), fields: flags(lb.fields, LABEL_FIELDS, d.label.fields) },
    declaration: { fields: flags(dc.fields, DECLARATION_FIELDS, d.declaration.fields), text: str(dc.text, 1200) },
    sender: Object.fromEntries(SENDER_KEYS.map((k) => [k, str(sd[k], k === 'street' ? 160 : 120)])) as PrintSender,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Pedido pronto para imprimir (montado no Admin a partir do pedido, do perfil e dos dados da loja)
// ---------------------------------------------------------------------------------------------------------------

export type PrintAddress = {
  name: string; street: string; number: string; complement: string; parish: string;
  city: string; region: string; postal_code: string; country: string;
};

export type PrintItem = { name: string; options: string; sku: string; quantity: number; unitPrice: number; image: string };

export type PrintOrder = {
  id: string;
  /** Código curto do pedido (o que aparece no Admin e para o cliente). */
  code: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  customer: { name: string; email: string; phone: string; taxId: string };
  shipping: PrintAddress | null;
  billing: PrintAddress | null;
  pickup: boolean;
  /** Forma de envio (serviço da transportadora), ex. "PAC" ou "Correios SEDEX". */
  service: string;
  tracking: string;
  weightKg: number | null;
  shipBy: string | null;
  items: PrintItem[];
  totals: { subtotal: number; shipping: number; discount: number; extras: number; other: number; taxes: number; total: number };
  checkoutFields: { label: string; value: string }[];
  notes: string;
};

export const orderCode = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase();

const s = (v: unknown) => (v == null ? '' : String(v).trim());

/** Endereço gravado no pedido (mesmos campos em todos os países, ver src/lib/addressFormats.ts). */
export function printAddress(raw: unknown, fallbackName = ''): PrintAddress | null {
  const a = obj(raw);
  if (!Object.keys(a).length) return null;
  const out: PrintAddress = {
    name: s(a.recipient_name) || s(a.name) || fallbackName,
    street: s(a.street) || s(a.address_line1) || s(a.address),
    number: s(a.number),
    complement: s(a.complement) || s(a.address_line2),
    parish: s(a.parish) || s(a.neighborhood),
    city: s(a.city),
    region: s(a.district) || s(a.state),
    postal_code: s(a.postal_code) || s(a.zip_code),
    country: s(a.country_code) || s(a.country),
  };
  return out.street || out.city || out.postal_code ? out : null;
}

/** Remetente: o que a loja escreveu em Impressão de pedidos, campo a campo, senão os dados da loja. */
export function resolveSender(sender: PrintSender, store: { name?: string; address?: string; phone?: string; email?: string; nif?: string }) {
  const structured = !!(sender.street || sender.city || sender.postal_code);
  return {
    name: sender.name || s(store.name),
    taxId: sender.tax_id || s(store.nif),
    phone: sender.phone || s(store.phone),
    email: sender.email || s(store.email),
    /** Endereço em campos (preferido) ou o endereço livre da loja. */
    address: structured ? ({
      name: '', street: sender.street, number: sender.number, complement: sender.complement, parish: sender.parish,
      city: sender.city, region: sender.region, postal_code: sender.postal_code, country: sender.country,
    } as PrintAddress) : null,
    freeAddress: structured ? '' : s(store.address),
  };
}
export type ResolvedSender = ReturnType<typeof resolveSender>;

/** Só os dígitos e letras do código postal, para o código de barras (CEP 01310-100 -> 01310100). */
export const postalBarcodeText = (postal: string) => postal.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

// ---------------------------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------------------------

export type PrintContext = {
  /** Textos do documento no idioma do Admin (chaves doc_* de src/i18n/orderPrint.ts). */
  t: (key: string, vars?: Record<string, string | number>) => string;
  money: (v: number) => string;
  dateTime: (iso: string) => string;
  date: (iso: string) => string;
  countryName: (code: string) => string;
  store: { name: string; logoUrl: string; footer?: string; nif?: string; address?: string; phone?: string; email?: string };
  sender: ResolvedSender;
  /** Rótulos do estado do pagamento e do meio, já traduzidos. */
  paymentLabel: (o: PrintOrder) => string;
  now?: Date;
};

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Só imagens http(s), caminho do próprio site ou data:image (nunca javascript: e afins). */
export const safeImageUrl = (u: string) => (/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpe?g|webp|gif|svg\+xml);)/i.test(u) ? u : '');

const lines = (...xs: string[]) => xs.filter(Boolean).map((x) => `<div>${escapeHtml(x)}</div>`).join('');

/** Endereço em linhas, no formato de etiqueta: rua e número, complemento, bairro, cidade e estado, CEP, país. */
export function addressLines(a: PrintAddress, ctx: PrintContext, opts: { country?: boolean; postalInline?: boolean } = {}): string[] {
  const streetLine = [a.street, a.number].filter(Boolean).join(', ');
  const cityLine = [a.city, a.region].filter(Boolean).join(' / ');
  const out = [streetLine, a.complement, a.parish];
  if (opts.postalInline) out.push([a.postal_code, cityLine].filter(Boolean).join('  '));
  else out.push(cityLine, a.postal_code);
  if (opts.country && a.country) out.push(ctx.countryName(a.country) || a.country);
  return out.filter(Boolean);
}

/** Código de barras impresso: cada módulo (a barra mais fina) mede `module` mm, nunca mais largo que o espaço. */
function barcodeBlock(text: string, caption: string, height = '12mm', module = 0.33) {
  const b = text ? barcodeModules(text) : null;
  if (!b || b.text.includes('?')) return '';
  const width = ((b.modules.length + 20) * module).toFixed(1);
  const svg = barcodeSvg(text, { showText: false }).replace('<svg ', `<svg style="width:${width}mm;max-width:100%;height:${height};display:block" aria-roledescription="${escapeHtml(caption)}" `);
  return `<div class="bc">${svg}<div class="bc-text">${escapeHtml(b.text)}</div></div>`;
}

function logoBlock(ctx: PrintContext, show: boolean, cls = 'logo') {
  const url = safeImageUrl(ctx.store.logoUrl);
  if (show && url) return `<img class="${cls}" src="${escapeHtml(url)}" alt="${escapeHtml(ctx.store.name)}"/>`;
  return `<div class="${cls}-text">${escapeHtml(ctx.store.name)}</div>`;
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#111;font-family:Inter,"Helvetica Neue",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{page-break-after:always;break-after:page;overflow:hidden}
.page:last-child{page-break-after:auto;break-after:auto}
.bc{display:flex;flex-direction:column;align-items:center}
.bc-text{font-family:"Courier New",monospace;font-weight:700;letter-spacing:.12em;margin-top:1mm}
.muted{color:#555}
.mono{font-family:"Courier New",monospace}
@media screen{body{background:#e9e6e1;padding:12px}.page{background:#fff;margin:0 auto 12px;box-shadow:0 1px 4px rgba(0,0,0,.18)}}
`;

function doc(title: string, pageCss: string, css: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>`
    + `<style>${BASE_CSS}${pageCss}${css}</style></head><body>${body}</body></html>`;
}

// ---- Folha do pedido ----

const SHEET_CSS = `
.sheet{padding:12mm 12mm 10mm;font-size:10pt;line-height:1.4}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;border-bottom:2px solid #111;padding-bottom:4mm;margin-bottom:4mm}
.logo{max-height:16mm;max-width:55mm;object-fit:contain;display:block;margin-bottom:2mm}
.logo-text{font-size:15pt;font-weight:800;letter-spacing:-.01em;margin-bottom:1mm}
h1{font-size:17pt;font-weight:800;letter-spacing:-.01em}
.head .bc{min-width:48mm}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-bottom:4mm}
.box{border:1px solid #bbb;border-radius:2mm;padding:3mm}
.box h2,.sect{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#555;margin-bottom:1.5mm}
.box .strong{font-weight:700}
table{width:100%;border-collapse:collapse;margin-bottom:3mm}
th{font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#555;text-align:left;border-bottom:1.5px solid #111;padding:1.5mm 1.5mm}
td{border-bottom:1px solid #ddd;padding:2mm 1.5mm;vertical-align:top}
td.num,th.num{text-align:right;white-space:nowrap}
td.qty{font-size:12pt;font-weight:800;text-align:center;white-space:nowrap}
th.qty{text-align:center}
td.chk{width:9mm;text-align:center}
.tick{display:inline-block;width:5mm;height:5mm;border:1.5px solid #111;border-radius:1mm}
.thumb{width:12mm;height:12mm;object-fit:cover;border:1px solid #ddd;border-radius:1.5mm;display:block}
.iname{font-weight:600}
.small{font-size:8.5pt}
.totals{margin-left:auto;width:70mm;margin-bottom:4mm}
.totals div{display:flex;justify-content:space-between;gap:4mm;padding:.6mm 0}
.totals .grand{border-top:1.5px solid #111;margin-top:1mm;padding-top:1.5mm;font-weight:800;font-size:12pt}
.note{border:1px dashed #999;border-radius:2mm;padding:3mm;margin-bottom:4mm;white-space:pre-wrap}
.checks{display:flex;flex-wrap:wrap;gap:6mm;margin:2mm 0 4mm;font-weight:600}
.checks span{display:inline-flex;align-items:center;gap:2mm}
.sign{display:flex;gap:8mm;margin-top:8mm}
.sign div{flex:1;border-top:1px solid #111;padding-top:1mm;font-size:8pt;color:#555;text-align:center}
.foot{border-top:1px solid #ccc;margin-top:4mm;padding-top:2mm;font-size:8pt;color:#555;text-align:center;white-space:pre-wrap}
.receipt .sheet{padding:3mm 2mm;font-size:9pt}
.receipt .head{flex-direction:column;align-items:stretch;gap:2mm}
.receipt .head .bc{min-width:0}
.receipt .grid{grid-template-columns:1fr;gap:2mm}
.receipt .totals{width:100%}
.receipt h1{font-size:13pt}
.a5 .sheet{padding:8mm;font-size:9pt}
.a5 .grid{grid-template-columns:1fr 1fr}
`;

const SHEET_PAGE: Record<SheetPaper, string> = {
  a4: '@page{size:A4;margin:0}.page{width:210mm;min-height:297mm}',
  a5: '@page{size:A5;margin:0}.page{width:148mm;min-height:210mm}',
  receipt80: '@page{size:80mm auto;margin:0}.page{width:80mm}',
};

function sheetHtml(o: PrintOrder, st: OrderPrintSettings, ctx: PrintContext): string {
  const f = st.sheet.fields;
  const t = ctx.t;
  const receipt = st.sheet.paper === 'receipt80';
  const showImages = f.item_images && !receipt;
  const showPrices = f.prices;

  const customer = f.customer ? `<div class="box"><h2>${t('doc_customer')}</h2>`
    + `<div class="strong">${escapeHtml(o.customer.name || o.shipping?.name || '')}</div>`
    + (f.contact ? lines(o.customer.email, o.customer.phone) : '')
    + (f.tax_id && o.customer.taxId ? `<div>${escapeHtml(t('doc_tax_id'))}: ${escapeHtml(o.customer.taxId)}</div>` : '')
    + `</div>` : '';

  const delivery = (f.shipping_address || f.shipping_method) ? `<div class="box"><h2>${t('doc_delivery')}</h2>`
    + (o.pickup ? `<div class="strong">${t('doc_pickup')}</div>`
      : f.shipping_address && o.shipping ? `<div class="strong">${escapeHtml(o.shipping.name)}</div>${lines(...addressLines(o.shipping, ctx, { country: true }))}` : '')
    + (f.shipping_method && o.service ? `<div class="small" style="margin-top:1mm"><b>${t('doc_service')}:</b> ${escapeHtml(o.service)}</div>` : '')
    + (o.shipBy ? `<div class="small"><b>${t('doc_ship_by')}:</b> ${escapeHtml(ctx.date(o.shipBy))}</div>` : '')
    + (o.tracking ? `<div class="small"><b>${t('doc_tracking')}:</b> <span class="mono">${escapeHtml(o.tracking)}</span></div>` : '')
    + `</div>` : '';

  const payment = f.payment ? `<div class="box"><h2>${t('doc_payment')}</h2><div>${escapeHtml(ctx.paymentLabel(o))}</div>`
    + (showPrices ? `<div class="strong" style="margin-top:1mm">${escapeHtml(ctx.money(o.totals.total))}</div>` : '')
    + `</div>` : '';

  const billing = f.billing_address && o.billing ? `<div class="box"><h2>${t('doc_billing')}</h2>`
    + `<div class="strong">${escapeHtml(o.billing.name)}</div>${lines(...addressLines(o.billing, ctx, { country: true }))}</div>` : '';

  const rows = o.items.map((it) => {
    const img = safeImageUrl(it.image);
    const extra = [f.item_options ? it.options : '', f.item_sku && it.sku ? `${t('doc_sku')}: ${it.sku}` : ''].filter(Boolean);
    return `<tr>`
      + (f.check_boxes ? `<td class="chk"><span class="tick"></span></td>` : '')
      + `<td class="qty">${it.quantity}</td>`
      + (showImages ? `<td style="width:14mm">${img ? `<img class="thumb" src="${escapeHtml(img)}" alt=""/>` : ''}</td>` : '')
      + `<td><div class="iname">${escapeHtml(it.name)}</div>${extra.length ? `<div class="small muted">${escapeHtml(extra.join(' · '))}</div>` : ''}</td>`
      + (showPrices && !receipt ? `<td class="num">${escapeHtml(ctx.money(it.unitPrice))}</td>` : '')
      + (showPrices ? `<td class="num">${escapeHtml(ctx.money(it.unitPrice * it.quantity))}</td>` : '')
      + `</tr>`;
  }).join('');
  const units = o.items.reduce((a, it) => a + it.quantity, 0);
  const table = `<table><thead><tr>`
    + (f.check_boxes ? `<th class="chk" title="${t('doc_picked')}"></th>` : '')
    + `<th class="qty">${t('doc_qty')}</th>`
    + (showImages ? '<th></th>' : '')
    + `<th>${t('doc_items', { n: o.items.length, units })}</th>`
    + (showPrices && !receipt ? `<th class="num">${t('doc_unit')}</th>` : '')
    + (showPrices ? `<th class="num">${t('doc_line_total')}</th>` : '')
    + `</tr></thead><tbody>${rows}</tbody></table>`;

  const tl = o.totals;
  const totals = showPrices ? `<div class="totals">`
    + `<div><span>${t('doc_subtotal')}</span><span>${escapeHtml(ctx.money(tl.subtotal))}</span></div>`
    + `<div><span>${t('doc_shipping')}</span><span>${tl.shipping ? escapeHtml(ctx.money(tl.shipping)) : t('doc_free')}</span></div>`
    + (tl.extras ? `<div><span>${t('doc_extras')}</span><span>${escapeHtml(ctx.money(tl.extras))}</span></div>` : '')
    + (tl.discount ? `<div><span>${t('doc_discount')}</span><span>-${escapeHtml(ctx.money(tl.discount))}</span></div>` : '')
    + (tl.other ? `<div><span>${t('doc_other_discounts')}</span><span>-${escapeHtml(ctx.money(tl.other))}</span></div>` : '')
    + (tl.taxes ? `<div class="muted"><span>${t('doc_taxes')}</span><span>${escapeHtml(ctx.money(tl.taxes))}</span></div>` : '')
    + `<div class="grand"><span>${t('doc_total')}</span><span>${escapeHtml(ctx.money(tl.total))}</span></div></div>` : '';

  const fields = f.checkout_fields && o.checkoutFields.length
    ? `<div class="note"><div class="sect">${t('doc_checkout_fields')}</div>${o.checkoutFields.map((x) => `<div><b>${escapeHtml(x.label)}:</b> ${escapeHtml(x.value)}</div>`).join('')}</div>` : '';
  const notes = f.notes && o.notes ? `<div class="note"><div class="sect">${t('doc_notes')}</div>${escapeHtml(o.notes)}</div>` : '';
  const checks = f.check_boxes
    ? `<div class="checks">${['doc_check_picked', 'doc_check_checked', 'doc_check_packed'].map((k) => `<span><span class="tick"></span>${t(k)}</span>`).join('')}</div>` : '';
  const sign = f.signature ? `<div class="sign"><div>${t('doc_sign_picked')}</div><div>${t('doc_sign_checked')}</div></div>` : '';
  const footer = f.footer && (st.sheet.footer_text || ctx.store.footer)
    ? `<div class="foot">${escapeHtml(st.sheet.footer_text || ctx.store.footer || '')}</div>` : '';

  return `<section class="page"><div class="sheet">`
    + `<div class="head"><div>${f.logo ? logoBlock(ctx, true) : ''}<h1>${t('doc_order', { code: o.code })}</h1>`
    + `<div class="muted small">${escapeHtml(ctx.dateTime(o.createdAt))}</div></div>`
    + (f.order_barcode ? barcodeBlock(o.code, t('doc_order_code'), receipt ? '10mm' : '13mm') : '')
    + `</div>`
    + `<div class="grid">${customer}${delivery}${payment}${billing}</div>`
    + table + totals + fields + notes + checks + sign + footer
    + `</div></section>`;
}

// ---- Etiqueta de envio ----

const LABEL_CSS = `
.label{display:flex;flex-direction:column;padding:4mm;font-size:9pt;line-height:1.3;border:0}
.lb-top{display:flex;justify-content:space-between;align-items:center;gap:3mm;border-bottom:1.5px solid #000;padding-bottom:2mm;margin-bottom:2mm}
.lb-top .logo{max-height:12mm;max-width:40mm;object-fit:contain;display:block}
.lb-top .logo-text{font-size:12pt;font-weight:800}
.svc{border:2px solid #000;border-radius:1.5mm;padding:1mm 2.5mm;font-weight:800;font-size:11pt;text-transform:uppercase;text-align:center;max-width:48mm}
.lb-codes{display:flex;flex-direction:column;align-items:center;gap:1.5mm;margin-bottom:2mm}
.lb-codes .cap{font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:#333}
.lb-meta{display:flex;justify-content:space-between;gap:2mm;font-size:8pt;margin-bottom:2mm}
.dest{border:2px solid #000;border-radius:1.5mm;padding:2.5mm 3mm;margin-bottom:2mm;flex:1}
.dest .tag,.from .tag{display:inline-block;background:#000;color:#fff;font-size:7pt;font-weight:800;letter-spacing:.1em;padding:.6mm 2mm;margin-bottom:1.5mm;text-transform:uppercase}
.dest .nm{font-size:13pt;font-weight:800;line-height:1.15;margin-bottom:1mm}
.dest .ad{font-size:10.5pt}
.dest .cep{font-size:15pt;font-weight:800;letter-spacing:.04em;margin-top:1mm}
.dest .bc{margin-top:1.5mm;align-items:flex-start}
.dest .bc-text{display:none}
.pickup{border:2px solid #000;background:#000;color:#fff;text-align:center;font-size:14pt;font-weight:800;padding:4mm;margin-bottom:2mm}
.from{border-top:1px dashed #000;padding-top:1.5mm;font-size:8pt}
.from .nm{font-weight:700}
.lb-items{font-size:7.5pt;border-top:1px solid #000;padding-top:1mm;margin-bottom:1.5mm}
.lb-note{font-size:7.5pt;border:1px dashed #000;padding:1mm 1.5mm;margin-bottom:1.5mm;white-space:pre-wrap}
`;

const LABEL_PAGE: Record<LabelSize, string> = {
  '100x150': '@page{size:100mm 150mm;margin:0}.page{width:100mm;height:150mm}.label{height:150mm}',
  '100x100': '@page{size:100mm 100mm;margin:0}.page{width:100mm;height:100mm}.label{height:100mm;font-size:8pt}.dest .nm{font-size:11pt}.dest .cep{font-size:12pt}',
  a4_4: '@page{size:A4;margin:0}.page{width:210mm;height:297mm;display:grid;grid-template-columns:105mm 105mm;grid-template-rows:148.5mm 148.5mm}'
    + '.label{height:148.5mm;border:1px dashed #999}',
};

function labelHtml(o: PrintOrder, st: OrderPrintSettings, ctx: PrintContext): string {
  const f = st.label.fields;
  const t = ctx.t;
  const small = st.label.size === '100x100';
  const sender = ctx.sender;
  const top = `<div class="lb-top">${logoBlock(ctx, f.logo)}`
    + (f.service ? `<div class="svc">${escapeHtml(o.pickup ? t('doc_pickup_short') : o.service || t('doc_parcel'))}</div>` : '')
    + `</div>`;
  const codes = (f.order_barcode || (f.tracking_barcode && o.tracking)) ? `<div class="lb-codes">`
    + (f.tracking_barcode && o.tracking ? `<div class="cap">${t('doc_tracking')}</div>${barcodeBlock(o.tracking, t('doc_tracking'), small ? '9mm' : '13mm')}` : '')
    + (f.order_barcode ? `<div class="cap">${t('doc_order_code')}</div>${barcodeBlock(o.code, t('doc_order_code'), small ? '7mm' : '9mm', 0.3)}` : '')
    + `</div>` : '';
  const units = o.items.reduce((a, it) => a + it.quantity, 0);
  const meta = [
    !f.order_barcode ? `${t('doc_order', { code: o.code })}` : '',
    f.weight && o.weightKg ? `${t('doc_weight')}: ${o.weightKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg` : '',
    f.declared_value ? `${t('doc_declared_value')}: ${ctx.money(o.totals.subtotal)}` : '',
    `${t('doc_volumes', { n: units })}`,
  ].filter(Boolean);
  const metaHtml = `<div class="lb-meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div>`;

  const a = o.shipping;
  const sameCountry = !a?.country || !sender.address?.country || a.country.toUpperCase() === sender.address.country.toUpperCase();
  const pcode = a ? postalBarcodeText(a.postal_code) : '';
  const dest = o.pickup
    ? `<div class="pickup">${t('doc_pickup')}</div><div class="dest"><span class="tag">${t('doc_recipient')}</span><div class="nm">${escapeHtml(o.customer.name)}</div>`
      + (f.recipient_phone ? lines(o.customer.phone) : '') + `</div>`
    : a ? `<div class="dest"><span class="tag">${t('doc_recipient')}</span>`
      + `<div class="nm">${escapeHtml(a.name || o.customer.name)}</div>`
      + `<div class="ad">${lines(...[[a.street, a.number].filter(Boolean).join(', '), a.complement, a.parish, [a.city, a.region].filter(Boolean).join(' / ')])}</div>`
      + (a.postal_code ? `<div class="cep">${escapeHtml(a.postal_code)}</div>` : '')
      + (!sameCountry && a.country ? `<div class="strong" style="font-weight:800">${escapeHtml((ctx.countryName(a.country) || a.country).toUpperCase())}</div>` : '')
      + (f.recipient_phone && o.customer.phone ? `<div>${escapeHtml(t('doc_phone'))}: ${escapeHtml(o.customer.phone)}</div>` : '')
      + (f.recipient_tax_id && o.customer.taxId ? `<div>${escapeHtml(t('doc_tax_id'))}: ${escapeHtml(o.customer.taxId)}</div>` : '')
      + (f.postal_barcode && pcode ? barcodeBlock(pcode, t('doc_postal'), small ? '7mm' : '9mm', 0.36) : '')
      + `</div>`
    : `<div class="dest"><span class="tag">${t('doc_recipient')}</span><div class="nm">${escapeHtml(o.customer.name)}</div><div class="muted">${t('doc_no_address')}</div></div>`;

  const items = f.items && o.items.length
    ? `<div class="lb-items">${escapeHtml(o.items.map((it) => `${it.quantity}x ${it.name}${it.options ? ` (${it.options})` : ''}`).join('; '))}</div>` : '';
  const notes = f.notes && o.notes ? `<div class="lb-note">${escapeHtml(o.notes.slice(0, 240))}</div>` : '';
  const from = f.sender ? `<div class="from"><span class="tag">${t('doc_sender')}</span>`
    + `<div class="nm">${escapeHtml(sender.name)}${sender.taxId ? ` · ${escapeHtml(sender.taxId)}` : ''}</div>`
    + (sender.address ? lines(...addressLines(sender.address, ctx, { postalInline: true, country: !sameCountry })) : lines(sender.freeAddress))
    + (sender.phone ? lines(sender.phone) : '')
    + `</div>` : '';

  return `<div class="label">${top}${codes}${metaHtml}${dest}${items}${notes}${from}</div>`;
}

// ---- Declaração de conteúdo ----

const DECL_CSS = `
.decl{padding:12mm;font-size:10pt;line-height:1.4}
.decl h1{font-size:15pt;font-weight:800;text-align:center;margin-bottom:1mm}
.decl .sub{text-align:center;color:#555;margin-bottom:5mm}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:4mm}
.pair .box{border:1.5px solid #111;padding:3mm}
.pair h2,.decl .sect{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#555;margin-bottom:1.5mm}
.decl table{width:100%;border-collapse:collapse;margin-bottom:4mm}
.decl th,.decl td{border:1px solid #111;padding:1.5mm 2mm;text-align:left}
.decl th{font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;background:#f1f1f1}
.decl td.num,.decl th.num{text-align:right;white-space:nowrap}
.decl .text{border:1.5px solid #111;padding:3mm;margin-bottom:6mm;white-space:pre-wrap}
.decl .sign{display:flex;gap:10mm;margin-top:14mm}
.decl .sign div{flex:1;border-top:1px solid #111;padding-top:1mm;text-align:center;font-size:8.5pt;color:#555}
`;

function partyBox(title: string, name: string, taxId: string, addr: string[], ctx: PrintContext, showTax: boolean) {
  return `<div class="box"><h2>${title}</h2><div style="font-weight:700">${escapeHtml(name)}</div>`
    + (showTax && taxId ? `<div>${escapeHtml(ctx.t('doc_tax_id'))}: ${escapeHtml(taxId)}</div>` : '')
    + lines(...addr) + `</div>`;
}

function declarationHtml(o: PrintOrder, st: OrderPrintSettings, ctx: PrintContext): string {
  const f = st.declaration.fields;
  const t = ctx.t;
  const sender = ctx.sender;
  const units = o.items.reduce((a, it) => a + it.quantity, 0);
  const goods = o.items.reduce((a, it) => a + it.unitPrice * it.quantity, 0);
  const rows = o.items.map((it, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(it.name)}${it.options ? ` <span class="muted">(${escapeHtml(it.options)})</span>` : ''}</td>`
    + `<td class="num">${it.quantity}</td>${f.values ? `<td class="num">${escapeHtml(ctx.money(it.unitPrice * it.quantity))}</td>` : ''}</tr>`).join('');
  const text = st.declaration.text || t('doc_decl_default_text');
  const today = ctx.date((ctx.now ?? new Date()).toISOString());
  const place = sender.address?.city || '';
  return `<section class="page"><div class="decl">`
    + `<h1>${t('doc_decl_title')}</h1><div class="sub">${t('doc_order', { code: o.code })} · ${escapeHtml(ctx.date(o.createdAt))}</div>`
    + `<div class="pair">`
    + partyBox(t('doc_sender'), sender.name, sender.taxId, sender.address ? addressLines(sender.address, ctx, { country: true }) : [sender.freeAddress], ctx, f.tax_ids)
    + (o.pickup || !o.shipping
      ? partyBox(t('doc_recipient'), o.customer.name, o.customer.taxId, [t('doc_pickup')], ctx, f.tax_ids)
      : partyBox(t('doc_recipient'), o.shipping.name || o.customer.name, o.customer.taxId, addressLines(o.shipping, ctx, { country: true }), ctx, f.tax_ids))
    + `</div>`
    + `<div class="sect">${t('doc_decl_goods')}</div>`
    + `<table><thead><tr><th style="width:9mm">#</th><th>${t('doc_decl_content')}</th><th class="num">${t('doc_qty')}</th>${f.values ? `<th class="num">${t('doc_decl_value')}</th>` : ''}</tr></thead>`
    + `<tbody>${rows}<tr><td></td><td style="font-weight:700">${t('doc_total')}</td><td class="num" style="font-weight:700">${units}</td>`
    + (f.values ? `<td class="num" style="font-weight:700">${escapeHtml(ctx.money(goods))}</td>` : '') + `</tr></tbody></table>`
    + (f.weight ? `<div style="margin-bottom:4mm"><b>${t('doc_weight')}:</b> ${o.weightKg ? `${o.weightKg.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg` : '____________ kg'}</div>` : '')
    + `<div class="text">${escapeHtml(text)}</div>`
    + `<div>${escapeHtml(t('doc_decl_place_date', { place: place || '________________', date: today }))}</div>`
    + (f.signature ? `<div class="sign"><div>${t('doc_decl_signature')}</div></div>` : '')
    + `</div></section>`;
}

const DECL_PAGE = '@page{size:A4;margin:0}.page{width:210mm;min-height:297mm}';

/** Página HTML completa com um documento por pedido (a etiqueta A4 junta quatro por folha). */
export function renderPrintDocument(kind: PrintDoc, orders: PrintOrder[], st: OrderPrintSettings, ctx: PrintContext): string {
  const title = orders.length === 1 ? `${ctx.t(`doc_title_${kind}`)} ${orders[0].code}` : ctx.t(`doc_title_${kind}`);
  if (kind === 'sheet') {
    const copies = Math.max(1, st.sheet.copies);
    const body = orders.flatMap((o) => Array.from({ length: copies }, () => sheetHtml(o, st, ctx))).join('');
    const cls = st.sheet.paper === 'receipt80' ? 'receipt' : st.sheet.paper === 'a5' ? 'a5' : '';
    return doc(title, SHEET_PAGE[st.sheet.paper], SHEET_CSS, `<div class="${cls}">${body}</div>`);
  }
  if (kind === 'label') {
    const labels = orders.map((o) => labelHtml(o, st, ctx));
    const perPage = st.label.size === 'a4_4' ? 4 : 1;
    const pages: string[] = [];
    for (let i = 0; i < labels.length; i += perPage) pages.push(`<section class="page">${labels.slice(i, i + perPage).join('')}</section>`);
    return doc(title, LABEL_PAGE[st.label.size], LABEL_CSS, pages.join(''));
  }
  return doc(title, DECL_PAGE, DECL_CSS, orders.map((o) => declarationHtml(o, st, ctx)).join(''));
}
