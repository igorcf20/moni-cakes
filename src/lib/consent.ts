// =====================================================================================
// Consentimento de cookies (LGPD no Brasil, RGPD no EEE): a escolha do visitante, guardada no aparelho.
//
//   Categorias   essential (sempre), preferences, analytics, marketing (textos em src/i18n/legal.ts)
//   Validade     a escolha expira (`expires`, 6 ou 12 meses pelo Admin > Privacidade e cookies); depois o aviso volta
//   Prova        cada escolha tem um código (`id`) e é registada no servidor (tabela consent_records, sem IP),
//                para a loja demonstrar o consentimento; o código aparece ao visitante nas preferências
//   Revogação    retirar Preferências apaga o que essa categoria guardou; retirar Estatística ou Marketing
//                apaga os cookies das ferramentas (src/components/privacy/ConsentScripts.tsx)
//   GPC          com o sinal Global Privacy Control do navegador, Estatística e Marketing começam desligadas
// =====================================================================================
export type ConsentCategory = "essential" | "analytics" | "marketing" | "preferences";
export type ConsentAction = "accept_all" | "reject_all" | "custom";

export type ConsentState = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  timestamp: string;
  version: number;
  /** código da escolha (o mesmo no registo do servidor) */
  id?: string;
  /** fim da validade (ISO); sem valor = 12 meses depois de `timestamp` */
  expires?: string;
  /** categorias opcionais mostradas quando a escolha foi feita (sem valor = as três) */
  offered?: ConsentCategory[];
};

const STORAGE_KEY = "cookie-consent-v2";
const CURRENT_VERSION = 1;
const EVENT = "consent-changed";
const DEFAULT_MONTHS = 12;

/** Versão dos textos do aviso e da política: subir quando mudarem de forma relevante (registada com cada escolha). */
export const CONSENT_POLICY_VERSION = 2;

/** Categorias opcionais, pela ordem em que aparecem nas preferências (os textos estão em src/i18n/legal.ts). */
export const OPTIONAL_CONSENT_CATEGORIES = ["preferences", "analytics", "marketing"] as const satisfies readonly ConsentCategory[];

/** O que cada categoria opcional guarda no próprio site (localStorage); apagado quando o consentimento sai. */
const OWN_STORAGE: Partial<Record<ConsentCategory, string[]>> = {
  preferences: ["print3d-recent-searches", "loja3d-compare", "loja3d-popups"],
};

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

/** Escolha válida do visitante, ou null (nunca escolheu, versão antiga ou expirada). */
export function getConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (!parsed || parsed.version !== CURRENT_VERSION) return null;
    const expires = parsed.expires ? new Date(parsed.expires) : addMonths(new Date(parsed.timestamp), DEFAULT_MONTHS);
    if (!(expires.getTime() > Date.now())) return null;
    return { ...parsed, essential: true };
  } catch {
    return null;
  }
}

/** O navegador pede para não vender nem partilhar dados (Global Privacy Control). */
export function hasGpcSignal(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

type SaveOptions = {
  months?: number;
  action?: ConsentAction;
  locale?: string;
  country?: string;
  /** categorias opcionais mostradas ao visitante nesta escolha */
  offered?: ConsentCategory[];
};

/**
 * A escolha precisa de ser refeita: não existe, expirou, ou a loja passou a usar uma categoria que o
 * visitante nunca viu (por exemplo, ligou o Google Analytics depois da escolha).
 */
export function needsConsent(state: ConsentState | null, offered: readonly ConsentCategory[]): boolean {
  if (!state) return true;
  const seen: readonly ConsentCategory[] = state.offered ?? OPTIONAL_CONSENT_CATEGORIES;
  return offered.some((c) => !seen.includes(c));
}

export function setConsent(
  partial: Partial<Pick<ConsentState, "analytics" | "marketing" | "preferences">>,
  opts: SaveOptions = {},
) {
  const previous = getConsent();
  const now = new Date();
  const next: ConsentState = {
    essential: true,
    analytics: !!partial.analytics,
    marketing: !!partial.marketing,
    preferences: !!partial.preferences,
    timestamp: now.toISOString(),
    version: CURRENT_VERSION,
    id: previous?.id ?? newId(),
    expires: addMonths(now, opts.months === 6 ? 6 : DEFAULT_MONTHS).toISOString(),
    offered: opts.offered ? [...opts.offered] : [...OPTIONAL_CONSENT_CATEGORIES],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Revogação: o que a categoria guardou sai do aparelho.
  for (const cat of OPTIONAL_CONSENT_CATEGORIES) {
    if (!next[cat]) for (const key of OWN_STORAGE[cat] ?? []) localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  void recordConsent(next, opts);
  return next;
}

/** Regista a escolha no servidor (sem IP). Falhar não impede o site de funcionar. */
async function recordConsent(state: ConsentState, opts: SaveOptions) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    await supabase.from("consent_records").insert({
      consent_id: state.id,
      user_id: data.session?.user.id ?? null,
      choices: { preferences: state.preferences, analytics: state.analytics, marketing: state.marketing },
      policy_version: CONSENT_POLICY_VERSION,
      action: opts.action ?? "custom",
      gpc: hasGpcSignal(),
      locale: opts.locale ?? null,
      country: opts.country ?? null,
    });
  } catch {
    // sem rede ou backend em baixo: a escolha continua guardada no aparelho
  }
}

/** Aceita as categorias mostradas (as que a loja não usa ficam desligadas). */
export function acceptAll(opts: Omit<SaveOptions, "action"> = {}) {
  const on = (c: ConsentCategory) => !opts.offered || opts.offered.includes(c);
  return setConsent({ analytics: on("analytics"), marketing: on("marketing"), preferences: on("preferences") }, { ...opts, action: "accept_all" });
}

export function rejectAll(opts: Omit<SaveOptions, "action"> = {}) {
  return setConsent({ analytics: false, marketing: false, preferences: false }, { ...opts, action: "reject_all" });
}

export function clearConsent() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
}

export function hasConsent(category: ConsentCategory): boolean {
  const c = getConsent();
  if (!c) return category === "essential";
  return !!c[category];
}

export function openConsentPreferences() {
  window.dispatchEvent(new CustomEvent("open-consent-preferences"));
}

export function onConsentChange(handler: (state: ConsentState | null) => void) {
  const listener = (e: Event) => handler((e as CustomEvent).detail ?? null);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export const CONSENT_EVENT = EVENT;
