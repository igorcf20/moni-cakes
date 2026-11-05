// Teste dos vários armazéns (src/lib/warehouses.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-warehouses.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeWarehouse, parseCountryList, pickOrder, planTake, slotKey, slotLabel, sumPerWarehouse, warehouseDraftErrors, warehouseErrorOf, warehousePlace,
} from '../src/lib/warehouses.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007120000_warehouses.sql');

const W = (id, o = {}) => normalizeWarehouse({ id, name: id, priority: 100, is_active: true, serves_countries: [], ...o });

test('normalizar armazém e países', () => {
  const w = normalizeWarehouse({ id: 'a', name: '  Depósito  ', code: ' sp-01 ', country: 'br', serves_countries: ['pt', 'BR', 'xx1', 'br'], priority: '-5' });
  assert.deepEqual([w.name, w.code, w.country, w.serves_countries, w.priority, w.is_active, w.is_default], ['Depósito', 'SP-01', 'BR', ['BR', 'PT'], 0, true, false]);
  assert.equal(normalizeWarehouse({ priority: 'abc' }).priority, 100);
  assert.equal(normalizeWarehouse({ country: 'Brasil' }).country, null);
  assert.deepEqual(parseCountryList('br, pt;es  ES x 123'), ['BR', 'ES', 'PT']);
  assert.deepEqual(parseCountryList(''), []);
  assert.equal(warehousePlace({ city: 'Lisboa', country: 'PT' }), 'Lisboa, PT');
  assert.equal(warehousePlace({ city: null, country: null }), null);
});

test('formulário: nome, código repetido e prioridade', () => {
  const others = [{ id: 'x', code: 'SP' }];
  assert.deepEqual(warehouseDraftErrors({ name: ' ', code: 'sp', priority: 20000 }, others, null), ['name', 'code_taken', 'priority']);
  assert.deepEqual(warehouseDraftErrors({ name: 'A', code: 'SP', priority: 1 }, others, 'x'), []);
});

test('ordem de saída: ativos, país, prioridade, padrão, nome (igual ao servidor)', () => {
  const sp = W('São Paulo', { serves_countries: ['BR'], priority: 10, is_default: true });
  const lx = W('Lisboa', { serves_countries: ['PT', 'ES'], priority: 20 });
  const all = W('Central', { priority: 50 });
  const off = W('Pausado', { priority: 1, is_active: false });
  assert.deepEqual(pickOrder([off, all, lx, sp], 'PT').map((w) => w.id), ['Lisboa', 'Central', 'São Paulo', 'Pausado']);
  assert.deepEqual(pickOrder([off, all, lx, sp], 'br').map((w) => w.id), ['São Paulo', 'Central', 'Lisboa', 'Pausado']);
  assert.deepEqual(pickOrder([off, all, lx, sp], null).map((w) => w.id), ['Central', 'São Paulo', 'Lisboa', 'Pausado']);
  const a = W('B', { priority: 5 });
  const b = W('A', { priority: 5, is_default: true });
  assert.deepEqual(pickOrder([a, b]).map((w) => w.id), ['A', 'B']);
});

test('simulação de saída e somas', () => {
  const sp = W('sp', { serves_countries: ['BR'], priority: 10 });
  const lx = W('lx', { serves_countries: ['PT'], priority: 20 });
  // Mesmo cenário do teste no banco: pedido para PT de 7 com SP 6 e LX 6 sai 6 de Lisboa e 1 de São Paulo.
  assert.deepEqual(planTake([sp, lx], { sp: 6, lx: 6 }, 7, 'PT'), { takes: [{ id: 'lx', quantity: 6 }, { id: 'sp', quantity: 1 }], missing: 0 });
  assert.deepEqual(planTake([sp, lx], { sp: 0, lx: 2 }, 5, 'BR'), { takes: [{ id: 'lx', quantity: 2 }], missing: 3 });
  assert.equal(sumPerWarehouse({ a: 3, b: 4 }), 7);
  assert.equal(sumPerWarehouse(null), 0);
  assert.equal(slotKey({ product_id: 'p', variation_id: null, size_id: 's' }), 'p||s');
  assert.equal(slotLabel({ variation_name: 'Azul', size_label: 'G' }), 'Azul / G');
  assert.equal(slotLabel({}), null);
  assert.equal(warehouseErrorOf('ERROR: insufficient'), 'insufficient');
  assert.equal(warehouseErrorOf('outra coisa'), 'unknown');
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['warehouses', 'warehouse_stock', 'warehouse_allocations', 'warehouse_moves']) {
    assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  }
  assert.match(MIG, /REVOKE ALL ON public\.warehouses, public\.warehouse_stock, public\.warehouse_allocations, public\.warehouse_moves FROM anon, authenticated;/);
  // Escrita do estoque por armazém só pelas funções (o authenticated só lê).
  assert.match(MIG, /GRANT SELECT ON public\.warehouse_stock, public\.warehouse_allocations, public\.warehouse_moves TO authenticated;/);
  assert.match(MIG, /CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default ON public\.warehouses \(\(true\)\) WHERE is_default;/);
  // Sincronização nas 4 tabelas de estoque, sem repetir quando a própria função grava o total.
  for (const t of ['products', 'product_sizes', 'product_variations', 'product_variation_size_availability']) {
    assert.match(MIG, new RegExp(`AFTER UPDATE OF stock_quantity ON public\\.${t}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.warehouse_stock_sync\\(\\);`), t);
  }
  assert.match(MIG, /IF COALESCE\(\(ctx ->> 'warehouse_sync'\)::boolean, false\) THEN RETURN NEW; END IF;/);
  assert.match(MIG, /'warehouse_sync', true/);
  assert.match(MIG, /v_country = ANY \(w\.serves_countries\)/);
  assert.match(MIG, /v_reason IN \('order_restock', 'order_edit'\)/);
  for (const code of ['forbidden', 'not_found', 'untracked', 'invalid_value', 'invalid_reason', 'same_warehouse', 'insufficient', 'warehouse_has_stock']) {
    assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  }
  for (const f of ['admin_warehouse_set', 'admin_warehouse_transfer', 'admin_warehouse_load', 'admin_warehouse_slots', 'admin_warehouse_moves', 'admin_warehouse_summary', 'admin_order_allocations']) {
    assert.match(MIG, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon;`), f);
  }
});

test('recurso, menu, página do pedido e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'warehouses', category: 'catalog', defaultOn: false, sections: \['warehouses'\]/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "warehouses", icon: Warehouse/);
  assert.match(read('src/pages/Admin.tsx'), /warehouses: <AdminWarehouses \/>/);
  assert.match(read('src/pages/admin/AdminOrderPage.tsx'), /<OrderWarehousesPanel orderId=\{order\.id\} \/>/);
  assert.match(read('src/components/admin/orders/OrderWarehousesPanel.tsx'), /useFeature\("warehouses"\)/);
  assert.match(read('src/lib/activityLog.ts'), /'warehouses'/);
  for (const [f, keys] of [['src/i18n/adminFeatures.ts', ['f_warehouses', 'f_warehouses_d']], ['src/i18n/admin.ts', ['s_warehouses', 'd_warehouses']], ['src/i18n/adminActivity.ts', ['e_warehouses']]]) {
    for (const k of keys) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  // Mesmas chaves em pt-BR, en e es; pt-PT herda de pt-BR.
  const src = read('src/i18n/adminWarehouses.ts');
  const block = (start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end) : undefined);
  const keys = (s) => new Set([...s.matchAll(/^\s+([a-z0-9_]+): '/gm)].map((m) => m[1]));
  const br = keys(block('const ptBR', "export type"));
  for (const [name, s] of [['en', block('  en: {', '  es: {')], ['es', block('  es: {')]]) {
    const k = keys(s);
    assert.deepEqual([...br].filter((x) => !k.has(x)), [], `${name} sem chaves em falta`);
  }
  assert.match(block("  'pt-PT': {", '  en: {'), /\.\.\.ptBR/);
  assert.doesNotMatch(src, /—/, 'sem travessão');
  const admin = read('src/components/admin/AdminWarehouses.tsx') + read('src/components/admin/orders/OrderWarehousesPanel.tsx');
  assert.doesNotMatch(admin, /Dialog|confirm\(/, 'sem janelas no Admin');
});

console.log(`test-warehouses: ${n} testes ok`);
