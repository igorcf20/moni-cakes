// Teste do estoque das linhas do carrinho (src/lib/cartStock.ts, cópia do servidor) e da migration.
// Uso: node --experimental-strip-types scripts/test-cart-stock.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineStock, stockProblems } from '../src/lib/cartStock.ts';
import { normalizeCartReservations, DEFAULT_CART_RESERVATIONS, isGuestHolder } from '../src/lib/cartReservations.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('ficheiro igual ao do servidor', () => {
  assert.equal(readFileSync('src/lib/cartStock.ts', 'utf8'), readFileSync('supabase/functions/_shared/cartStock.ts', 'utf8'));
});

test('sem controle de estoque: sempre ok', () => {
  assert.deepEqual(lineStock([{ quantity: 99 }], [{ slot: null, available: null }]), [{ state: 'ok', max: null }]);
  assert.deepEqual(lineStock([{ quantity: 1 }], []), [{ state: 'ok', max: null }]);
});

test('esgotou depois de entrar no carrinho', () => {
  assert.deepEqual(lineStock([{ quantity: 1 }], [{ slot: 'p:a', available: 0 }]), [{ state: 'out', max: 0 }]);
  assert.deepEqual(lineStock([{ quantity: 1 }], [{ slot: 'p:a', available: -3 }]), [{ state: 'out', max: 0 }]);
});

test('menos unidades do que no carrinho', () => {
  assert.deepEqual(lineStock([{ quantity: 5 }], [{ slot: 's:1', available: 2 }]), [{ state: 'short', max: 2 }]);
  assert.deepEqual(lineStock([{ quantity: 2 }], [{ slot: 's:1', available: 2 }]), [{ state: 'ok', max: 2 }]);
});

test('linhas do mesmo estoque repartem pela ordem do carrinho', () => {
  const slots = [{ slot: 'v:x', available: 3 }, { slot: 'v:x', available: 3 }, { slot: 'v:x', available: 3 }];
  assert.deepEqual(lineStock([{ quantity: 2 }, { quantity: 2 }, { quantity: 1 }], slots),
    [{ state: 'ok', max: 3 }, { state: 'short', max: 1 }, { state: 'out', max: 0 }]);
  assert.deepEqual(stockProblems([{ quantity: 2 }, { quantity: 2 }, { quantity: 1 }], slots),
    [{ index: 1, state: 'short', available: 1 }, { index: 2, state: 'out', available: 0 }]);
});

test('migration: compra do cliente sempre estrita e verificação pública', () => {
  const sql = readFileSync('supabase/migrations/20261007210000_checkout_stock_check.sql', 'utf8');
  assert.match(sql, /set_config\('loja3d\.customer_checkout', '1', true\)/);
  assert.match(sql, /current_setting\('loja3d\.customer_checkout', true\), ''\) = '1' OR NOT public\._is_trusted_writer\(\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.cart_stock_check\(jsonb\) TO anon, authenticated, service_role/);
  const fn = readFileSync('supabase/functions/create-order/index.ts', 'utf8');
  assert.match(fn, /cart_stock_check_for/);
  assert.match(fn, /stock\.lines/);
  assert.match(fn, /code: "out_of_stock"/);
});

test('reserva: regras normalizadas como no servidor', () => {
  assert.deepEqual(normalizeCartReservations(null), DEFAULT_CART_RESERVATIONS);
  assert.deepEqual(normalizeCartReservations({ minutes: 0, notice: false }), { minutes: 1, notice: false, restart_on_change: true });
  assert.equal(normalizeCartReservations({ minutes: 9999 }).minutes, 240);
  assert.equal(normalizeCartReservations({ minutes: 7.9 }).minutes, 7);
  assert.equal(normalizeCartReservations({ minutes: '10' }).minutes, 5);
  assert.ok(isGuestHolder('g:abc'));
  assert.ok(!isGuestHolder('u:abc'));
});

test('reserva: migration (tabela fechada, reservas de outros na compra, limpeza, recurso)', () => {
  const sql = readFileSync('supabase/migrations/20261007220000_cart_reservations.sql', 'utf8');
  assert.match(sql, /REVOKE ALL ON public\.cart_reservations FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /LEAST\(240, GREATEST\(1, m\)\)/);
  assert.match(sql, /_reserved_by_others\(r\.slot, buyer\) < NEW\.quantity/);
  assert.match(sql, /DELETE FROM public\.cart_reservations WHERE holder = buyer AND slot = r\.slot/);
  assert.match(sql, /cron\.schedule\('cart-reservations-purge'/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.cart_stock_check_for\(jsonb, uuid\) TO service_role/);
  assert.doesNotMatch(sql, /cart_stock_check_for\(jsonb, uuid\) TO (anon|authenticated)/);
  const features = readFileSync('src/lib/features.ts', 'utf8');
  assert.match(features, /id: 'cart_reservations', category: 'catalog', defaultOn: true/);
  assert.match(sql, /feature_enabled\('cart_reservations', true\)/);
});

console.log(`\n${n} testes ok`);
