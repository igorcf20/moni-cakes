// =====================================================================================
// Código do afiliado no navegador (recurso affiliates). Quem chega por um link ?ref=<código>:
//   - sempre: o código fica na memória da página até ela ser recarregada (nada gravado no aparelho);
//   - com consentimento de Marketing: fica também em localStorage "loja3d-affiliate" pelos dias das regras
//     (store_settings.affiliates.cookie_days), item registado em COOKIE_REGISTRY (src/lib/privacy.ts).
// O checkout envia currentAffiliateCode() ao create-order, que confere o código no servidor.
// Captura e contagem da visita: src/components/AffiliateCapture.tsx.
// =====================================================================================
import { hasConsent, onConsentChange } from '@/lib/consent';
import { cleanAffiliateCode } from '@/lib/affiliates';

export const AFFILIATE_STORAGE_KEY = 'loja3d-affiliate';
type Stored = { code: string; until: number };

let memory: Stored | null = null;
let pendingDays = 30;

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(AFFILIATE_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Stored;
    const code = cleanAffiliateCode(v?.code);
    if (!code || !(Number(v.until) > Date.now())) {
      localStorage.removeItem(AFFILIATE_STORAGE_KEY);
      return null;
    }
    return { code, until: Number(v.until) };
  } catch {
    return null;
  }
}

function persist(s: Stored) {
  if (!hasConsent('marketing')) return;
  try { localStorage.setItem(AFFILIATE_STORAGE_KEY, JSON.stringify(s)); } catch { /* aparelho sem espaço ou bloqueado */ }
}

/** Guarda o código de um link (o último link visitado vale). */
export function rememberAffiliate(code: string, days: number) {
  const c = cleanAffiliateCode(code);
  if (!c) return;
  pendingDays = days;
  memory = { code: c, until: Date.now() + Math.max(1, days) * 86_400_000 };
  persist(memory);
}

/** Código a enviar com o pedido (memória desta visita, senão o guardado com consentimento). */
export function currentAffiliateCode(): string | null {
  if (memory && memory.until > Date.now()) return memory.code;
  return hasConsent('marketing') ? readStored()?.code ?? null : null;
}

// Consentimento dado depois da visita: grava o código desta visita. Retirado: apaga.
if (typeof window !== 'undefined') {
  onConsentChange(() => {
    if (hasConsent('marketing')) {
      if (memory) persist({ code: memory.code, until: Date.now() + pendingDays * 86_400_000 });
    } else {
      try { localStorage.removeItem(AFFILIATE_STORAGE_KEY); } catch { /* sem acesso */ }
    }
  });
}
