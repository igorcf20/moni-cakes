// =====================================================================================
// Programa de pontos: regras e contas. Este ficheiro é igual a supabase/functions/_shared/rewardPoints.ts
// (o teste scripts/test-reward-points.mjs confere): o site mostra, o create-order desconta.
//   Regras    store_settings.reward_points (Admin > Pontos), padrões iguais a public.reward_points_settings()
//   Ganhar    pontos = valor dos produtos pago (sem frete, já com cupom e descontos) x pontos por unidade de moeda
//   Usar      no mínimo min_redeem pontos, até max_percent do valor dos produtos e nunca mais do que o saldo
// =====================================================================================

export type RewardAwardOn = 'paid' | 'delivered';

export type RewardSettings = {
  /** Pontos ganhos por cada 1 da moeda da loja gasto em produtos. */
  earn_per_unit: number;
  /** Quanto vale 1 ponto na moeda da loja ao usar. */
  point_value: number;
  /** Pontos mínimos para usar numa compra. */
  min_redeem: number;
  /** Parte máxima do valor dos produtos que se paga com pontos (0 a 100). */
  max_percent: number;
  /** Quando os pontos entram: pedido pago ou pedido entregue. */
  award_on: RewardAwardOn;
  /** Meses até os pontos vencerem (0 = não vencem). */
  expire_months: number;
  /** Pontos de boas-vindas ao criar conta (0 = sem bónus). */
  signup_bonus: number;
};

export const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  earn_per_unit: 1,
  point_value: 0.05,
  min_redeem: 100,
  max_percent: 50,
  award_on: 'paid',
  expire_months: 12,
  signup_bonus: 0,
};

const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeRewardSettings(v: unknown): RewardSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_REWARD_SETTINGS;
  return {
    earn_per_unit: Math.max(0, num(o.earn_per_unit, d.earn_per_unit)),
    point_value: Math.max(0, num(o.point_value, d.point_value)),
    min_redeem: Math.max(1, Math.floor(num(o.min_redeem, d.min_redeem))),
    max_percent: Math.min(100, Math.max(0, Math.floor(num(o.max_percent, d.max_percent)))),
    award_on: o.award_on === 'delivered' ? 'delivered' : 'paid',
    expire_months: Math.max(0, Math.floor(num(o.expire_months, d.expire_months))),
    signup_bonus: Math.max(0, Math.floor(num(o.signup_bonus, d.signup_bonus))),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pontos ganhos com uma compra (base = valor dos produtos pago pelo cliente). */
export function pointsEarned(base: number, s: RewardSettings): number {
  return Math.max(0, Math.floor(Math.max(0, base) * s.earn_per_unit + 1e-9));
}

/** Valor em dinheiro de uma quantidade de pontos. */
export function pointsValue(points: number, s: RewardSettings): number {
  return round2(Math.max(0, points) * s.point_value);
}

/**
 * Quantos pontos dá para usar num pedido.
 * productsValue = produtos já com cupom e desconto do pagamento; orderTotal = total antes dos pontos (com frete).
 */
export function maxRedeemable(balance: number, productsValue: number, orderTotal: number, s: RewardSettings): number {
  if (s.point_value <= 0 || balance < s.min_redeem) return 0;
  const cap = Math.min(Math.max(0, productsValue) * s.max_percent / 100, Math.max(0, orderTotal));
  const byValue = Math.floor(cap / s.point_value + 1e-9);
  const n = Math.min(Math.floor(balance), byValue);
  return n >= s.min_redeem ? n : 0;
}

export type RedeemResult = { ok: true; points: number; amount: number } | { ok: false; reason: 'below_min' | 'not_enough' };

/** Pontos pedidos pelo cliente -> pontos usados e desconto (o que o servidor grava). */
export function redeemPoints(requested: number, balance: number, productsValue: number, orderTotal: number, s: RewardSettings): RedeemResult {
  const want = Math.floor(Math.max(0, requested));
  if (!want) return { ok: true, points: 0, amount: 0 };
  if (want > balance) return { ok: false, reason: 'not_enough' };
  const max = maxRedeemable(balance, productsValue, orderTotal, s);
  const points = Math.min(want, max);
  if (points < s.min_redeem) return { ok: false, reason: 'below_min' };
  return { ok: true, points, amount: pointsValue(points, s) };
}
