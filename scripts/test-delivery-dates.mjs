// Teste do prazo de produção e da data de entrega (src/lib/deliveryDates.ts, cópia do servidor, migration e create-order).
// Uso: node --experimental-strip-types scripts/test-delivery-dates.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addBusinessDays, cartLeadTime, estimateDelivery, formatDay, isBusinessDay, isLate, leadTimeFor, localNow, nextBusinessDay,
  normalizeDeliverySettings, timezoneFor,
} from '../src/lib/deliveryDates.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const s = normalizeDeliverySettings({ timezone: 'America/Sao_Paulo', holidays: ['2026-10-12', 'lixo'] });

test('ficheiro igual ao do servidor', () => {
  assert.equal(readFileSync('src/lib/deliveryDates.ts', 'utf8'), readFileSync('supabase/functions/_shared/deliveryDates.ts', 'utf8'));
});

test('normalizar regras', () => {
  const d = normalizeDeliverySettings(null);
  assert.deepEqual([d.default_min, d.default_max, d.cutoff_hour, d.work_days.join()], [1, 3, 14, '1,2,3,4,5']);
  assert.deepEqual(s.holidays, ['2026-10-12']);
  const x = normalizeDeliverySettings({ default_min: 9, default_max: 2, work_days: [9, -1], cutoff_hour: 99, timezone: 'x; drop', show_on_product: false });
  assert.equal(x.default_max, 9, 'máximo nunca abaixo do mínimo');
  assert.deepEqual(x.work_days, [1, 2, 3, 4, 5], 'sem dias válidos volta ao padrão');
  assert.equal(x.cutoff_hour, 24);
  assert.equal(x.timezone, '');
  assert.equal(x.show_on_product, false);
  assert.equal(x.show_in_checkout, true);
});

test('dias úteis com fim de semana e feriado', () => {
  assert.equal(isBusinessDay('2026-10-10', s), false, 'sábado');
  assert.equal(isBusinessDay('2026-10-12', s), false, 'feriado');
  assert.equal(nextBusinessDay('2026-10-10', s), '2026-10-13');
  assert.equal(addBusinessDays('2026-10-08', 2, s), '2026-10-13', 'qui + 2: sex, depois sáb, dom e feriado, ter');
  assert.equal(addBusinessDays('2026-10-06', 0, s), '2026-10-06');
});

test('prazo do produto: próprio, ficha antiga, padrão; carrinho = o maior', () => {
  assert.deepEqual(leadTimeFor({ lead_time_min_days: 2, lead_time_max_days: 5 }, s), { min: 2, max: 5 });
  assert.deepEqual(leadTimeFor({ lead_time_min_days: null, lead_time_max_days: 4 }, s), { min: 4, max: 4 });
  assert.deepEqual(leadTimeFor({ technical_specs: { production_days: '6' } }, s), { min: 6, max: 6 });
  assert.deepEqual(leadTimeFor({ specifications: { production_days: 3 } }, s), { min: 3, max: 3 });
  assert.deepEqual(leadTimeFor({}, s), { min: 1, max: 3 });
  assert.deepEqual(leadTimeFor({ lead_time_min_days: 0, lead_time_max_days: 0 }, s), { min: 0, max: 0 });
  assert.deepEqual(cartLeadTime([{ lead_time_min_days: 2, lead_time_max_days: 2 }, { lead_time_min_days: 1, lead_time_max_days: 7 }], s), { min: 2, max: 7 });
  assert.deepEqual(cartLeadTime([], s), { min: 1, max: 3 });
});

test('fuso e hora de corte', () => {
  assert.equal(timezoneFor(normalizeDeliverySettings({}), 'pt'), 'Europe/Lisbon');
  assert.equal(timezoneFor(normalizeDeliverySettings({}), 'ZZ'), 'UTC');
  assert.equal(timezoneFor(s, 'PT'), 'America/Sao_Paulo');
  // 2026-10-07 02:00Z = 06/10 23h em São Paulo
  assert.deepEqual(localNow(new Date('2026-10-07T02:00:00Z'), 'America/Sao_Paulo'), { date: '2026-10-06', hour: 23 });
  const lead = { min: 1, max: 3 };
  const before = estimateDelivery(new Date('2026-10-06T15:00:00Z'), lead, null, s); // 12h SP, terça
  assert.equal(before.start, '2026-10-06');
  assert.equal(before.ship_by, '2026-10-09');
  assert.equal(before.deliver_from, null);
  const after = estimateDelivery(new Date('2026-10-06T19:00:00Z'), lead, null, s); // 16h SP
  assert.equal(after.start, '2026-10-07');
  assert.equal(after.ship_by, '2026-10-13', 'sex, fim de semana e feriado de 12/10');
});

test('data de chegada com o transporte', () => {
  const e = estimateDelivery(new Date('2026-10-06T15:00:00Z'), { min: 1, max: 3 }, { min: 2, max: 5 }, s);
  assert.equal(e.ship_from, '2026-10-07');
  assert.equal(e.deliver_from, '2026-10-09');
  assert.equal(e.deliver_to, '2026-10-19');
  const one = estimateDelivery(new Date('2026-10-06T15:00:00Z'), { min: 0, max: 0 }, { min: null, max: 1 }, s);
  assert.equal(one.deliver_from, '2026-10-07');
  assert.equal(one.deliver_to, '2026-10-07');
});

test('atraso e formato', () => {
  assert.equal(isLate('2026-10-05', 'processing', '2026-10-06'), true);
  assert.equal(isLate('2026-10-06', 'processing', '2026-10-06'), false);
  assert.equal(isLate('2026-10-05', 'shipped', '2026-10-06'), false);
  assert.equal(isLate(null, 'pending', '2026-10-06'), false);
  assert.match(formatDay('2026-10-13', 'pt-BR'), /13/);
  assert.match(formatDay('2026-10-13', 'en', false), /Oct/);
});

test('servidor: create-order grava as datas; colunas protegidas; recurso e Admin', () => {
  const fn = readFileSync('supabase/functions/create-order/index.ts', 'utf8');
  assert.ok(fn.includes('sb.rpc("feature_enabled", { _key: "delivery_dates", _default: false })'));
  assert.ok(fn.includes('estimated_ship_by: estimate.ship_by, estimated_delivery_from: estimate.deliver_from, estimated_delivery_to: estimate.deliver_to'));
  const sql = readFileSync('supabase/migrations/20261007070000_delivery_dates.sql', 'utf8');
  for (const c of ['estimated_ship_by', 'estimated_delivery_from', 'estimated_delivery_to', 'extras_amount', 'payment_discount']) {
    assert.ok(new RegExp(`NEW\\.${c}\\s+:= OLD\\.${c};`).test(sql), c);
  }
  assert.ok(sql.includes('products_lead_time_range'));
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/.test(sql));
  assert.ok(readFileSync('src/lib/features.ts', 'utf8').includes("{ id: 'delivery_dates', category: 'orders', defaultOn: false"));
  assert.ok(readFileSync('src/pages/Admin.tsx', 'utf8').includes('"delivery-dates": <AdminDeliveryDates />'));
  for (const f of ['src/i18n/deliveryDates.ts', 'src/i18n/adminDeliveryDates.ts']) assert.ok(!/—/.test(readFileSync(f, 'utf8')), f);
});

console.log(`\n${n} testes ok`);
