// Teste do aluguel (src/lib/rentals.ts, cópia do servidor, migration, preço no servidor e telas).
// Uso: node --experimental-strip-types scripts/test-rentals.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addDays, freeUnits, normalizeRentalProduct, normalizeRentalSettings, rentalDays, rentalError, rentalPeriods, rentalUnitPrice, returnLate,
} from '../src/lib/rentals.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');

test('ficheiro igual ao do servidor', () => {
  assert.equal(read('src/lib/rentals.ts'), read('supabase/functions/_shared/rentals.ts'));
});

test('normalizar regras e produto', () => {
  assert.deepEqual(normalizeRentalSettings(null), { lead_days: 1, buffer_days: 0, max_days_ahead: 180 });
  assert.deepEqual(normalizeRentalSettings({ lead_days: -3, buffer_days: 99, max_days_ahead: 1 }), { lead_days: 0, buffer_days: 30, max_days_ahead: 7 });
  const p = normalizeRentalProduct({ product_id: 'x', unit: 'hora', min_periods: 3, max_periods: 2, units: 0, deposit: -5 });
  assert.deepEqual([p.unit, p.min_periods, p.max_periods, p.units, p.deposit, p.is_active], ['day', 3, 3, 1, 0, true]);
  assert.equal(normalizeRentalProduct({ max_periods: '' }).max_periods, null);
  assert.equal(normalizeRentalProduct({ deposit: '150.555' }).deposit, 150.56);
});

test('dias e períodos (primeiro e último dia incluídos)', () => {
  assert.equal(rentalDays('2026-11-10', '2026-11-10'), 1);
  assert.equal(rentalDays('2026-11-10', '2026-11-12'), 3);
  assert.equal(rentalDays('2026-11-12', '2026-11-10'), 0);
  assert.equal(rentalDays('lixo', '2026-11-10'), 0);
  assert.equal(rentalPeriods('2026-11-10', '2026-11-16', 'week'), 1);
  assert.equal(rentalPeriods('2026-11-10', '2026-11-17', 'week'), 2);
  assert.equal(rentalPeriods('2026-01-31', '2026-02-27', 'month'), 1);
  assert.equal(rentalPeriods('2026-01-31', '2026-02-28', 'month'), 2, 'o mês acaba no dia 28 de fevereiro');
  assert.equal(rentalPeriods('2026-11-10', '2027-01-09', 'month'), 2);
  assert.equal(rentalPeriods('2026-11-10', '2027-01-10', 'month'), 3);
});

test('regras de datas', () => {
  const p = normalizeRentalProduct({ product_id: 'x', unit: 'day', min_periods: 2, max_periods: 5 });
  const s = normalizeRentalSettings({ lead_days: 1, max_days_ahead: 30 });
  const today = '2026-11-01';
  assert.equal(rentalError('2026-11-01', '2026-11-03', p, s, today), 'too_soon');
  assert.equal(rentalError('2026-11-02', '2026-11-02', p, s, today), 'too_short');
  assert.equal(rentalError('2026-11-02', '2026-11-07', p, s, today), 'too_long');
  assert.equal(rentalError('2026-11-30', '2026-12-02', p, s, today), 'too_far');
  assert.equal(rentalError('2026-11-05', '2026-11-04', p, s, today), 'invalid_dates');
  assert.equal(rentalError('2026-11-02', '2026-11-04', p, s, today), null);
});

test('preço e unidades livres (com dias livres entre reservas)', () => {
  assert.equal(rentalUnitPrice(30, 3), 90);
  const bookings = [
    { start_date: '2026-11-10', end_date: '2026-11-12', quantity: 1, status: 'reserved' },
    { start_date: '2026-11-11', end_date: '2026-11-11', quantity: 1, status: 'out' },
    { start_date: '2026-11-11', end_date: '2026-11-11', quantity: 5, status: 'cancelled' },
    { start_date: '2026-11-01', end_date: '2026-11-20', quantity: 5, status: 'returned' },
  ];
  assert.equal(freeUnits(bookings, '2026-11-10', '2026-11-12', 2, 0), 0);
  assert.equal(freeUnits(bookings, '2026-11-12', '2026-11-12', 2, 0), 1);
  assert.equal(freeUnits(bookings, '2026-11-13', '2026-11-14', 2, 0), 2);
  assert.equal(freeUnits(bookings, '2026-11-13', '2026-11-14', 2, 1), 1, 'um dia livre depois da reserva');
  assert.equal(returnLate({ status: 'out', end_date: '2026-11-12' }, '2026-11-13'), true);
  assert.equal(returnLate({ status: 'reserved', end_date: '2026-11-12' }, '2026-11-13'), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('servidor: migration, preço e create-order', () => {
  const m = read('supabase/migrations/20261007100000_rentals.sql');
  for (const s of ['product_rentals', 'rental_bookings', 'rental_free_units', 'order_items_rental', 'orders_rental_cancel',
    'admin_rental_update', "feature_enabled('rentals', false)", 'pg_advisory_xact_lock', "_design ? 'rental' THEN RETURN"]) assert.ok(m.includes(s), s);
  assert.ok(!/^\s*(BEGIN|COMMIT)\s*;/im.test(m), 'sem BEGIN/COMMIT');
  assert.ok(!m.includes('is_active OR public.has_role'), 'leitura pública sem has_role (anon não executa has_role)');
  const p = read('supabase/functions/_shared/pricing.ts');
  assert.ok(p.includes('rentalPeriodsFor') && p.includes('unit *= rental.periods[lineIdx]'), 'períodos aplicados no servidor');
  assert.ok(read('supabase/functions/create-order/index.ts').includes('|Aluguel)/'), 'erro do aluguel chega ao cliente');
});

test('telas: recurso, Admin, produto, carrinho', () => {
  assert.ok(read('src/lib/features.ts').includes("id: 'rentals', category: 'sales', defaultOn: false"));
  assert.ok(read('src/components/admin/shell/adminSections.ts').includes('value: "rentals"'));
  assert.ok(read('src/pages/Admin.tsx').includes('rentals: <AdminRentals />'));
  assert.ok(read('src/pages/AdminProductEdit.tsx').includes('<ProductRentalEditor'));
  assert.ok(read('src/pages/ProductDetail.tsx').includes('<RentalPicker'));
  assert.ok(read('src/hooks/useCart.tsx').includes('rentalPeriodsOf(design)'));
  for (const f of ['src/components/admin/AdminRentals.tsx', 'src/components/admin/ProductRentalEditor.tsx', 'src/components/product/RentalPicker.tsx']) {
    assert.ok(!/<(Dialog|AlertDialog)\b|window\.confirm|\bconfirm\(/.test(read(f)), `sem janelas em ${f}`);
  }
});

console.log(`\n${n} testes de aluguel OK`);
