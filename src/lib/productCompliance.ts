// =====================================================================================
// Regras de preço e segurança dos produtos (store_settings.product_compliance, Admin > Preços e segurança):
//   lowest_price_30d  onde mostrar "Menor preço nos últimos 30 dias" nas promoções (Diretiva Omnibus):
//                     'eu' (países do Espaço Económico Europeu, padrão), 'always' ou 'never'
//   safety_show       onde mostrar a aba Segurança do produto (GPSR): 'eu', 'always' (padrão) ou 'never'
//   manufacturer      fabricante padrão da loja { name, address, contact }
//   responsible       pessoa responsável na UE padrão { name, address, contact }
//   warnings          avisos de segurança padrão
// Cada produto pode ter dados próprios em products.safety_info (vazio = padrões da loja). Funções puras: o teste
// scripts/test-product-compliance.mjs confere as regras sem navegador.
// =====================================================================================
import { isEU } from '../legal/shared.ts';

export type ShowMode = 'eu' | 'always' | 'never';
export type SafetyParty = { name: string; address: string; contact: string };

export type ProductCompliance = {
  lowest_price_30d: ShowMode;
  safety_show: ShowMode;
  manufacturer: SafetyParty;
  responsible: SafetyParty;
  warnings: string;
};

/** Dados próprios do produto (products.safety_info). */
export type ProductSafetyInfo = {
  manufacturer?: Partial<SafetyParty>;
  responsible?: Partial<SafetyParty>;
  warnings?: string;
  model?: string;
};

export const EMPTY_PARTY: SafetyParty = { name: '', address: '', contact: '' };

export const DEFAULT_COMPLIANCE: ProductCompliance = {
  lowest_price_30d: 'eu',
  safety_show: 'always',
  manufacturer: EMPTY_PARTY,
  responsible: EMPTY_PARTY,
  warnings: '',
};

const MODES: ShowMode[] = ['eu', 'always', 'never'];
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const mode = (v: unknown, d: ShowMode): ShowMode => (MODES.includes(v as ShowMode) ? (v as ShowMode) : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function normalizeParty(v: unknown): SafetyParty {
  const o = obj(v);
  return { name: str(o.name, 200).trim(), address: str(o.address, 500).trim(), contact: str(o.contact, 300).trim() };
}

/** Valor gravado (ou nada) para as regras completas, com os padrões no que faltar. */
export function normalizeCompliance(v: unknown): ProductCompliance {
  const o = obj(v);
  return {
    lowest_price_30d: mode(o.lowest_price_30d, DEFAULT_COMPLIANCE.lowest_price_30d),
    safety_show: mode(o.safety_show, DEFAULT_COMPLIANCE.safety_show),
    manufacturer: normalizeParty(o.manufacturer),
    responsible: normalizeParty(o.responsible),
    warnings: str(o.warnings, 4000),
  };
}

export function normalizeSafetyInfo(v: unknown): ProductSafetyInfo {
  const o = obj(v);
  const out: ProductSafetyInfo = {};
  const m = normalizeParty(o.manufacturer);
  const r = normalizeParty(o.responsible);
  if (m.name || m.address || m.contact) out.manufacturer = m;
  if (r.name || r.address || r.contact) out.responsible = r;
  const w = str(o.warnings, 4000).trim();
  if (w) out.warnings = w;
  const model = str(o.model, 200).trim();
  if (model) out.model = model;
  return out;
}

/** A regra vale para o país do visitante? */
export function appliesTo(m: ShowMode, countryCode: string): boolean {
  if (m === 'always') return true;
  if (m === 'never') return false;
  return isEU(countryCode);
}

const filled = (p: Partial<SafetyParty> | undefined): p is SafetyParty => !!p && !!(p.name?.trim() || p.address?.trim() || p.contact?.trim());

export type ResolvedSafety = {
  manufacturer: SafetyParty | null;
  responsible: SafetyParty | null;
  warnings: string;
  model: string;
  /** Há alguma coisa para mostrar. */
  any: boolean;
};

/** Junta os dados do produto com os padrões da loja: o que o produto tiver ganha, o resto vem da loja. */
export function resolveSafety(info: unknown, store: ProductCompliance, sku?: string | null): ResolvedSafety {
  const p = normalizeSafetyInfo(info);
  const manufacturer = filled(p.manufacturer) ? normalizeParty(p.manufacturer) : filled(store.manufacturer) ? store.manufacturer : null;
  const responsible = filled(p.responsible) ? normalizeParty(p.responsible) : filled(store.responsible) ? store.responsible : null;
  const warnings = (p.warnings || store.warnings || '').trim();
  const model = (p.model || sku || '').trim();
  return { manufacturer, responsible, warnings, model, any: !!(manufacturer || responsible || warnings) };
}
