// Teste do programa de pontos (src/lib/rewardPoints.ts e a cópia das funções). Uso:
// node --experimental-strip-types scripts/test-reward-points.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_REWARD_SETTINGS, maxRedeemable, normalizeRewardSettings, pointsEarned, pointsValue, redeemPoints,
} from '../src/lib/rewardPoints.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const S = DEFAULT_REWARD_SETTINGS;

test('site e funções usam o mesmo ficheiro', () => {
  assert.equal(readFileSync('src/lib/rewardPoints.ts', 'utf8'), readFileSync('supabase/functions/_shared/rewardPoints.ts', 'utf8'));
});

test('padrões iguais aos da migration', () => {
  const sql = readFileSync('supabase/migrations/20261006200000_reward_points.sql', 'utf8');
  for (const [k, v] of Object.entries(S)) {
    if (k === 'award_on') continue;
    assert.ok(sql.includes(`'${k}', greatest(coalesce((v->>'${k}')`) || sql.includes(`'${k}', least(greatest(coalesce((v->>'${k}')`), k);
    assert.ok(new RegExp(`v->>'${k}'\\)::\\w+, ${String(v).replace('.', '\\.')}\\)`).test(sql), `${k} = ${v}`);
  }
});

test('regras normalizadas', () => {
  assert.deepEqual(normalizeRewardSettings(null), S);
  const s = normalizeRewardSettings({ earn_per_unit: '2', point_value: -1, min_redeem: 0, max_percent: 250, award_on: 'x', expire_months: 3.7 });
  assert.equal(s.earn_per_unit, 2);
  assert.equal(s.point_value, 0);
  assert.equal(s.min_redeem, 1);
  assert.equal(s.max_percent, 100);
  assert.equal(s.award_on, 'paid');
  assert.equal(s.expire_months, 3);
});

test('pontos ganhos e valor', () => {
  assert.equal(pointsEarned(99.99, S), 99);
  assert.equal(pointsEarned(-10, S), 0);
  assert.equal(pointsEarned(10.5, { ...S, earn_per_unit: 2 }), 21);
  assert.equal(pointsValue(100, S), 5);
  assert.equal(pointsValue(333, S), 16.65);
});

test('máximo para usar respeita saldo, mínimo e parte do pedido', () => {
  assert.equal(maxRedeemable(50, 1000, 1000, S), 0);          // abaixo do mínimo
  assert.equal(maxRedeemable(500, 1000, 1000, S), 500);       // saldo todo
  assert.equal(maxRedeemable(5000, 100, 120, S), 1000);       // 50% de 100 = 50 = 1000 pontos
  assert.equal(maxRedeemable(5000, 100, 30, S), 600);         // nunca acima do total do pedido
  assert.equal(maxRedeemable(5000, 3, 3, S), 0);              // o teto não chega ao mínimo
  assert.equal(maxRedeemable(5000, 100, 100, { ...S, point_value: 0 }), 0);
});

test('pedido de pontos no servidor', () => {
  assert.deepEqual(redeemPoints(0, 100, 100, 100, S), { ok: true, points: 0, amount: 0 });
  assert.deepEqual(redeemPoints(300, 200, 100, 100, S), { ok: false, reason: 'not_enough' });
  assert.deepEqual(redeemPoints(5000, 5000, 100, 120, S), { ok: true, points: 1000, amount: 50 });
  assert.deepEqual(redeemPoints(150, 500, 100, 120, S), { ok: true, points: 150, amount: 7.5 });
  assert.deepEqual(redeemPoints(150, 500, 2, 2, S), { ok: false, reason: 'below_min' });
});

console.log(`test-reward-points: ${n} testes passaram`);
