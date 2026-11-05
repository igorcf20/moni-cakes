// =====================================================================================
// Comparar produtos (recurso compare): até COMPARE_LIMIT produtos escolhidos pelo cliente, lado a lado em /comparar.
//   Lista       useCompare (zustand): ids pela ordem em que foram escolhidos; funções puras abaixo (teste em
//               scripts/test-compare.mjs)
//   Aparelho    sempre na memória da página; em localStorage "loja3d-compare" só com consentimento de
//               Preferências (item em COOKIE_REGISTRY, src/lib/privacy.ts). Retirar o consentimento apaga
//               (OWN_STORAGE em src/lib/consent.ts); dar o consentimento grava a lista desta visita.
//   Site        CompareToggle (cartão e página do produto), CompareBar (barra fixa) e a página src/pages/Compare.tsx
// =====================================================================================
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { hasConsent, onConsentChange } from './consent.ts';

export const COMPARE_LIMIT = 4;
export const COMPARE_STORAGE_KEY = 'loja3d-compare';

export type CompareResult = 'added' | 'removed' | 'full' | 'unchanged';

/** Lista limpa: só textos não vazios, sem repetidos, no máximo COMPARE_LIMIT (o que vem do aparelho pode ter lixo). */
export function cleanCompareIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= COMPARE_LIMIT) break;
  }
  return out;
}

/** Junta um produto ao fim da lista; cheia = não muda ('full'); já estava = 'unchanged'. */
export function addCompareId(ids: string[], id: string): { ids: string[]; result: CompareResult } {
  const list = cleanCompareIds(ids);
  const key = id.trim();
  if (!key || list.includes(key)) return { ids: list, result: 'unchanged' };
  if (list.length >= COMPARE_LIMIT) return { ids: list, result: 'full' };
  return { ids: [...list, key], result: 'added' };
}

export function removeCompareId(ids: string[], id: string): { ids: string[]; result: CompareResult } {
  const list = cleanCompareIds(ids);
  const next = list.filter((x) => x !== id.trim());
  return { ids: next, result: next.length === list.length ? 'unchanged' : 'removed' };
}

/** Liga ou desliga um produto (o botão Comparar). */
export function toggleCompareId(ids: string[], id: string): { ids: string[]; result: CompareResult } {
  return cleanCompareIds(ids).includes(id.trim()) ? removeCompareId(ids, id) : addCompareId(ids, id);
}

/** Valores de uma linha da tabela: todos iguais? (para "Mostrar só diferenças"; vazio conta como valor) */
export function allEqual(values: string[]): boolean {
  const norm = values.map((v) => v.trim().toLowerCase());
  return norm.every((v) => v === norm[0]);
}

/* ---------- Estado no navegador ---------- */

const consentStorage: StateStorage = {
  getItem: (name) => {
    if (!hasConsent('preferences')) return null;
    try { return localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name, value) => {
    if (!hasConsent('preferences')) return;
    try { localStorage.setItem(name, value); } catch { /* aparelho sem espaço ou bloqueado */ }
  },
  removeItem: (name) => {
    try { localStorage.removeItem(name); } catch { /* sem acesso */ }
  },
};

type CompareState = {
  ids: string[];
  /** Liga ou desliga; devolve o que aconteceu (para o aviso de lista cheia). */
  toggle: (id: string) => CompareResult;
  remove: (id: string) => void;
  clear: () => void;
};

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => {
        const { ids, result } = toggleCompareId(get().ids, id);
        if (result === 'added' || result === 'removed') set({ ids });
        return result;
      },
      remove: (id) => set({ ids: removeCompareId(get().ids, id).ids }),
      clear: () => set({ ids: [] }),
    }),
    {
      name: COMPARE_STORAGE_KEY,
      storage: createJSONStorage(() => consentStorage),
      partialize: (s) => ({ ids: s.ids }),
      merge: (persisted, current) => ({ ...current, ids: cleanCompareIds((persisted as { ids?: unknown } | undefined)?.ids) }),
    },
  ),
);

// Consentimento dado depois de escolher: grava a lista desta visita (a revogação apaga pelo OWN_STORAGE do consent.ts).
if (typeof window !== 'undefined') {
  onConsentChange(() => {
    if (hasConsent('preferences')) useCompare.setState((s) => ({ ids: [...s.ids] }));
  });
}

/* ---------- Regras da loja (store_settings.compare, Admin > Catálogo > Comparar produtos) ---------- */

/** Botão no cartão: ícone redondo abaixo do coração, ícone pequeno ao lado do coração, texto simples abaixo do preço, ou nada. */
export type CompareCardButton = 'icon' | 'heart' | 'text' | 'off';
/** Botão na página do produto: botão inteiro, link simples, ou nada. */
export type CompareProductButton = 'button' | 'text' | 'off';
/** Barra fixa dos escolhidos: completa (miniaturas) ou compacta (só "Comparar (N)"). */
export type CompareBarStyle = 'full' | 'compact';

export type CompareSettings = { card: CompareCardButton; product: CompareProductButton; bar: CompareBarStyle };

export const DEFAULT_COMPARE_SETTINGS: CompareSettings = { card: 'icon', product: 'button', bar: 'full' };
/** "Modo discreto" do Admin: ao lado do coração, link simples e barra compacta. */
export const DISCREET_COMPARE_SETTINGS: CompareSettings = { card: 'heart', product: 'text', bar: 'compact' };

const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);

export function normalizeCompareSettings(raw: unknown): CompareSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    card: pick(r.card, ['icon', 'heart', 'text', 'off'] as const, DEFAULT_COMPARE_SETTINGS.card),
    product: pick(r.product, ['button', 'text', 'off'] as const, DEFAULT_COMPARE_SETTINGS.product),
    bar: pick(r.bar, ['full', 'compact'] as const, DEFAULT_COMPARE_SETTINGS.bar),
  };
}

/** Regras iguais às do modo discreto? (o Admin marca o atalho como escolhido) */
export const isDiscreetCompare = (s: CompareSettings) =>
  s.card === DISCREET_COMPARE_SETTINGS.card && s.product === DISCREET_COMPARE_SETTINGS.product && s.bar === DISCREET_COMPARE_SETTINGS.bar;
