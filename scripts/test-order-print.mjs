// Teste da impressão de pedidos (src/lib/orderPrint.ts): regras normalizadas, padrões iguais aos da fila no servidor
// (migration 20261008143700_order_prints.sql), documentos escapados, campos ligados e desligados, códigos de barras,
// retirada na loja, quatro etiquetas por A4 e remetente da loja.
// Uso: node --experimental-strip-types scripts/test-order-print.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ORDER_PRINT, LABEL_FIELDS, SHEET_FIELDS, normalizeOrderPrint, orderCode, postalBarcodeText, printAddress,
  renderPrintDocument, resolveSender, safeImageUrl,
} from '../src/lib/orderPrint.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

const t = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(',')})` : k);
const ctx = (over = {}) => ({
  t,
  money: (v) => `R$ ${v.toFixed(2)}`,
  dateTime: (iso) => iso.slice(0, 16),
  date: (iso) => iso.slice(0, 10),
  countryName: (c) => ({ BR: 'Brasil', PT: 'Portugal' }[c] ?? c),
  store: { name: 'Loja <Teste>', logoUrl: 'https://cdn.exemplo.com/logo.png', footer: 'Obrigado' },
  sender: resolveSender(DEFAULT_ORDER_PRINT.sender, { name: 'Loja <Teste>', address: 'Rua A, 1, Campinas', phone: '1999', nif: '12.345.678/0001-90' }),
  paymentLabel: () => 'Pix · Pago',
  now: new Date('2026-10-08T12:00:00Z'),
  ...over,
});
const order = (over = {}) => ({
  id: '3f9c2a7e-1111-4222-8333-444455556666',
  code: orderCode('3f9c2a7e-1111-4222-8333-444455556666'),
  createdAt: '2026-10-08T10:00:00Z',
  status: 'paid', paymentStatus: 'paid', paymentMethod: 'pix',
  customer: { name: 'Ana <script>alert(1)</script>', email: 'ana@x.com', phone: '11999', taxId: '123.456.789-09' },
  shipping: printAddress({ recipient_name: 'Ana', street: 'Av. Paulista', number: '1578', complement: 'Apto 4', parish: 'Bela Vista', city: 'São Paulo', district: 'SP', postal_code: '01310-200', country_code: 'BR' }),
  billing: null, pickup: false, service: 'Correios PAC', tracking: 'AB123456789BR', weightKg: 0.85, shipBy: '2026-10-10',
  items: [
    { name: 'Vaso "facetado"', options: 'Terracota / M', sku: 'VASO-1', quantity: 2, unitPrice: 89.9, image: 'javascript:alert(1)' },
    { name: 'Porta-lápis', options: '', sku: '', quantity: 1, unitPrice: 49.9, image: 'https://cdn.exemplo.com/p.png' },
  ],
  totals: { subtotal: 229.7, shipping: 24.5, discount: 10, extras: 0, other: 0, taxes: 0, total: 244.2 },
  checkoutFields: [{ label: 'Presente', value: 'Sim' }],
  notes: 'Entregar à tarde',
  ...over,
});

test('normalizeOrderPrint: vazio = padrões; valores inválidos ignorados', () => {
  assert.deepEqual(normalizeOrderPrint(null), DEFAULT_ORDER_PRINT);
  const s = normalizeOrderPrint({
    queue: { statuses: ['paid', 'shipped', 'xx'], docs: ['label', 'nope'], mark_on_print: 'sim', auto_print: true },
    sheet: { paper: 'carta', copies: 9, fields: { prices: false, logo: 'x' } },
    label: { size: 'a4_4', fields: { items: true } },
    sender: { name: '  Loja  ', street: 'x'.repeat(500), hack: 'y' },
  });
  assert.deepEqual(s.queue.statuses, ['paid']);
  assert.deepEqual(s.queue.docs, ['label']);
  assert.equal(s.queue.mark_on_print, true);
  assert.equal(s.queue.auto_print, true);
  assert.equal(s.sheet.paper, 'a4');
  assert.equal(s.sheet.copies, 5);
  assert.equal(s.sheet.fields.prices, false);
  assert.equal(s.sheet.fields.logo, true);
  assert.equal(s.label.size, 'a4_4');
  assert.equal(s.label.fields.items, true);
  assert.equal(s.sender.name, 'Loja');
  assert.equal(s.sender.street.length, 160);
  assert.equal('hack' in s.sender, false);
  assert.deepEqual(normalizeOrderPrint({ queue: { statuses: [], docs: [] } }).queue.docs, []);
});

test('padrões da fila iguais aos do servidor (admin_print_queue)', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261008143700_order_prints.sql', import.meta.url), 'utf8');
  const arr = (xs) => `ARRAY[${xs.map((x) => `'${x}'`).join(', ')}]`;
  assert.ok(sql.includes(`st := ${arr(DEFAULT_ORDER_PRINT.queue.statuses)}`), 'estados padrão');
  assert.ok(sql.includes(`docs := ${arr(DEFAULT_ORDER_PRINT.queue.docs)}`), 'documentos padrão');
  assert.ok(sql.includes("feature_enabled('order_printing', true)"), 'recurso ligado por padrão');
  const features = readFileSync(new URL('../src/lib/features.ts', import.meta.url), 'utf8');
  assert.match(features, /id: 'order_printing', category: 'orders', defaultOn: true/);
});

test('folha do pedido: dados escapados, código de barras, campos ligados', () => {
  const html = renderPrintDocument('sheet', [order()], DEFAULT_ORDER_PRINT, ctx());
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(!html.includes('<script>alert'), 'nome do cliente escapado');
  assert.ok(html.includes('Ana &lt;script&gt;'));
  assert.ok(html.includes('Vaso &quot;facetado&quot;'));
  assert.ok(!html.includes('javascript:'), 'imagem perigosa descartada');
  assert.ok(html.includes('https://cdn.exemplo.com/p.png'));
  assert.ok(html.includes('aria-label="3F9C2A7E"'), 'código de barras do pedido');
  assert.ok(html.includes('doc_order(code=3F9C2A7E)'));
  assert.ok(html.includes('R$ 244.20'), 'total');
  assert.ok(html.includes('Entregar à tarde'));
  assert.ok(html.includes('Presente'));
  assert.ok(html.includes('size:A4'));
  assert.ok(html.includes('class="tick"'), 'caixas de conferência');
  assert.ok(html.includes('São Paulo / SP'));
  assert.ok(html.includes('Brasil'));
});

test('folha do pedido: campos desligados, cópias e bobina 80 mm', () => {
  const st = normalizeOrderPrint({
    sheet: { paper: 'receipt80', copies: 2, fields: { prices: false, order_barcode: false, notes: false, check_boxes: false, item_images: true } },
  });
  const html = renderPrintDocument('sheet', [order()], st, ctx());
  assert.ok(!html.includes('R$ '), 'sem preços');
  assert.ok(!html.includes('<svg'), 'sem código de barras');
  assert.ok(!html.includes('Entregar à tarde'));
  assert.ok(!html.includes('class="thumb"'), 'bobina sem fotos');
  assert.ok(html.includes('size:80mm auto'));
  assert.equal(html.split('<section class="page">').length - 1, 2, 'duas cópias');
  for (const f of SHEET_FIELDS) assert.equal(typeof st.sheet.fields[f], 'boolean');
});

test('etiqueta 10x15: destinatário, CEP em código de barras, rastreio, remetente da loja', () => {
  const html = renderPrintDocument('label', [order()], DEFAULT_ORDER_PRINT, ctx());
  assert.ok(html.includes('size:100mm 150mm'));
  assert.ok(html.includes('01310-200'));
  assert.ok(html.includes(`aria-label="${postalBarcodeText('01310-200')}"`), 'CEP em código de barras');
  assert.equal(postalBarcodeText('01310-200'), '01310200');
  assert.ok(html.includes('aria-label="AB123456789BR"'), 'rastreio em código de barras');
  assert.ok(html.includes('Correios PAC'));
  assert.ok(html.includes('Loja &lt;Teste&gt;'), 'remetente = loja');
  assert.ok(html.includes('Rua A, 1, Campinas'));
  assert.ok(!html.includes('123.456.789-09'), 'documento do destinatário desligado por padrão');
  assert.ok(html.includes('doc_volumes(n=3)'));
  for (const f of LABEL_FIELDS) assert.equal(typeof DEFAULT_ORDER_PRINT.label.fields[f], 'boolean');
});

test('etiqueta: retirada na loja, sem endereço, país diferente e 4 por A4', () => {
  const pick = renderPrintDocument('label', [order({ pickup: true, shipping: null })], DEFAULT_ORDER_PRINT, ctx());
  assert.ok(pick.includes('doc_pickup'));
  assert.ok(!pick.includes('01310-200'));
  const none = renderPrintDocument('label', [order({ shipping: null })], DEFAULT_ORDER_PRINT, ctx());
  assert.ok(none.includes('doc_no_address'));
  const sender = resolveSender({ ...DEFAULT_ORDER_PRINT.sender, street: 'Rua X', number: '9', city: 'Porto', postal_code: '4000-001', country: 'PT' }, { name: 'Loja' });
  const abroad = renderPrintDocument('label', [order()], DEFAULT_ORDER_PRINT, ctx({ sender }));
  assert.ok(abroad.includes('BRASIL'), 'país do destino em destaque');
  assert.ok(abroad.includes('Rua X, 9'), 'remetente em campos');
  const five = Array.from({ length: 5 }, () => order());
  const a4 = renderPrintDocument('label', five, normalizeOrderPrint({ label: { size: 'a4_4' } }), ctx());
  assert.equal(a4.split('<section class="page">').length - 1, 2, '5 etiquetas = 2 folhas');
  assert.equal(a4.split('<div class="label">').length - 1, 5);
});

test('declaração de conteúdo: itens, total, texto da loja e assinatura', () => {
  const st = normalizeOrderPrint({ declaration: { text: 'Texto <da> loja' } });
  const html = renderPrintDocument('declaration', [order()], st, ctx());
  assert.ok(html.includes('doc_decl_title'));
  assert.ok(html.includes('Texto &lt;da&gt; loja'));
  assert.ok(html.includes('R$ 229.70'), 'valor dos bens');
  assert.ok(html.includes('doc_decl_signature'));
  const def = renderPrintDocument('declaration', [order()], normalizeOrderPrint({ declaration: { fields: { values: false } } }), ctx());
  assert.ok(def.includes('doc_decl_default_text'));
  assert.ok(!def.includes('R$ 229.70'));
});

test('printAddress e safeImageUrl', () => {
  assert.equal(printAddress({}), null);
  assert.equal(printAddress({ name: 'X' }), null);
  const a = printAddress({ name: 'Levantamento', street: 'Rua', zip_code: '1000', state: 'RJ', neighborhood: 'Centro' }, 'Ana');
  assert.equal(a.postal_code, '1000');
  assert.equal(a.region, 'RJ');
  assert.equal(a.parish, 'Centro');
  assert.equal(safeImageUrl('/images/a.webp'), '/images/a.webp');
  assert.equal(safeImageUrl('//evil.com/a.png'), '');
  assert.equal(safeImageUrl('data:text/html;base64,xx'), '');
  assert.equal(orderCode('abcdef12-0000'), 'ABCDEF12');
});

console.log(`\n${n} testes ok`);
