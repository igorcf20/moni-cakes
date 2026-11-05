// Teste do histórico de estoque (src/lib/stockHistory.ts + migration). Uso: node --experimental-strip-types scripts/test-stock-history.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADJUST_REASONS, REASON_GROUPS, STOCK_REASONS, adjustErrorCode, adjustResult, movementTarget, periodSince, reasonsOf, summaryTotals,
} from '../src/lib/stockHistory.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const sql = readFileSync('supabase/migrations/20261007030000_stock_history.sql', 'utf8');

test('motivos iguais ao CHECK da tabela', () => {
  const m = /CHECK \(reason IN \(([^)]+)\)\)/.exec(sql);
  assert.ok(m);
  assert.deepEqual(m[1].split(',').map((s) => s.trim().replace(/'/g, '')), [...STOCK_REASONS]);
  for (const r of ADJUST_REASONS) assert.ok(sql.includes(`_reason NOT IN ('receive', 'count', 'damage', 'other')`) && STOCK_REASONS.includes(r));
  const grouped = Object.values(REASON_GROUPS).flat();
  assert.deepEqual([...grouped].sort(), [...STOCK_REASONS].sort(), 'cada motivo está num grupo de filtro');
});

test('ajuste: somar, tirar, definir, nunca negativo', () => {
  assert.equal(adjustResult('add', 5, 10), 15);
  assert.equal(adjustResult('add', 5, -5), 0);
  assert.equal(adjustResult('add', 5, -6), null);
  assert.equal(adjustResult('add', null, 3), 3);
  assert.equal(adjustResult('set', 5, 0), 0);
  assert.equal(adjustResult('set', 5, -1), null);
  assert.equal(adjustResult('set', 5, 2.5), null);
});

test('período e filtros', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  assert.equal(periodSince('7d', now), '2026-09-30T12:00:00.000Z');
  assert.equal(periodSince('all', now), null);
  assert.equal(reasonsOf('all'), null);
  assert.deepEqual(reasonsOf('sales'), ['sale', 'order_edit']);
});

test('totais do período', () => {
  const t = summaryTotals([
    { reason: 'sale', units_in: 0, units_out: 7, movements: 4 },
    { reason: 'order_edit', units_in: 1, units_out: 2, movements: 2 },
    { reason: 'order_restock', units_in: 2, units_out: 0, movements: 1 },
    { reason: 'receive', units_in: 20, units_out: 0, movements: 1 },
    { reason: 'damage', units_in: 0, units_out: 1, movements: 1 },
  ]);
  assert.deepEqual(t, { unitsIn: 23, unitsOut: 10, sold: 8, restocked: 2, manual: 2, movements: 9 });
});

test('nome da parte e erros estáveis', () => {
  assert.equal(movementTarget({ variation_name: 'Azul', size_label: 'M' }), 'Azul / M');
  assert.equal(movementTarget({ variation_name: null, size_label: ' ' }), null);
  assert.equal(adjustErrorCode('invalid_value'), 'invalid_value');
  assert.equal(adjustErrorCode('permission denied'), 'unknown');
});

test('migration: triggers nas 4 tabelas, contexto nas funções de pedido, sem BEGIN/COMMIT', () => {
  for (const t of ['products', 'product_sizes', 'product_variations', 'product_variation_size_availability']) {
    assert.ok(sql.includes(`AFTER UPDATE OF stock_quantity ON public.${t}`), t);
  }
  assert.ok(sql.includes("jsonb_build_object('reason', 'sale', 'order_id', NEW.order_id)"));
  assert.ok(sql.includes("'order_restock'"));
  assert.ok(sql.includes("'order_edit'"));
  assert.ok(sql.includes('REVOKE ALL ON public.stock_movements FROM anon, authenticated'));
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/.test(sql));
});

test('recurso, seção e textos registados', () => {
  const f = readFileSync('src/lib/features.ts', 'utf8');
  assert.ok(f.includes("{ id: 'stock_history', category: 'catalog', defaultOn: true, sections: ['stock-history']"));
  assert.ok(readFileSync('src/components/admin/shell/adminSections.ts', 'utf8').includes('value: "stock-history"'));
  assert.ok(readFileSync('src/pages/Admin.tsx', 'utf8').includes('"stock-history": <AdminStockHistory />'));
  const texts = readFileSync('src/i18n/adminStockHistory.ts', 'utf8');
  for (const r of STOCK_REASONS) assert.ok(texts.includes(`r_${r}:`), r);
  assert.ok(!/—/.test(texts), 'sem travessões');
});

console.log(`\n${n} testes ok`);
