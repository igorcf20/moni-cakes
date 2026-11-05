// =============================================================================================
// Segurança da conta (Admin > Configurações > Segurança da conta): verificação em dois passos do Admin (recurso
// admin_2fa) e entrar com Google ou Facebook (recurso social_login). Regras puras para as telas; o servidor decide:
//   has_role exige o segundo passo (aal2) a quem tem 2FA ou quando a loja exige de todos; admin_access_state diz
//   ao site que passo mostrar (migration 20261007050000_admin_2fa.sql). O código de 6 dígitos é do serviço de contas.
// Sem imports. Teste: node --experimental-strip-types scripts/test-admin-security.mjs
// =============================================================================================

export type AdminAccessState = 'ok' | 'mfa_required' | 'mfa_setup_required' | 'not_admin';
export const ACCESS_STATES: AdminAccessState[] = ['ok', 'mfa_required', 'mfa_setup_required', 'not_admin'];

/** Resposta do servidor normalizada (desconhecido = sem acesso). */
export const accessState = (v: unknown): AdminAccessState =>
  ACCESS_STATES.includes(v as AdminAccessState) ? (v as AdminAccessState) : 'not_admin';

/** Abre o Admin (o painel mostra o passo que falta) em vez de negar o acesso. */
export const canOpenAdmin = (s: AdminAccessState) => s !== 'not_admin';

export type SecuritySettings = { require_admin_2fa: boolean };
export function normalizeSecuritySettings(raw: unknown): SecuritySettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { require_admin_2fa: o.require_admin_2fa === true };
}

/** Código do app autenticador: só 6 dígitos (espaços e traços colados são tirados). */
export function cleanTotpCode(v: string): string {
  return v.replace(/\D/g, '').slice(0, 6);
}
export const totpCodeReady = (v: string) => /^\d{6}$/.test(v);

/** Chave para escrever à mão no app, em grupos de 4. */
export function formatTotpSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** Entrar com redes sociais: provedores que a loja oferece. */
export const SOCIAL_PROVIDERS = ['google', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** Provedores ligados no serviço de contas (GET /auth/v1/settings: external.<provedor>) e com o recurso ligado. */
export function socialProvidersOn(external: unknown, featureOn: boolean): SocialProvider[] {
  if (!featureOn || !external || typeof external !== 'object') return [];
  return SOCIAL_PROVIDERS.filter((p) => (external as Record<string, unknown>)[p] === true);
}

/** Endereço de retorno a registar no Google e na Meta. */
export const oauthCallbackUrl = (siteUrl: string) => `${siteUrl.replace(/\/+$/, '')}/auth/v1/callback`;

/** Erros estáveis do servidor. */
export function securityErrorCode(message: string | null | undefined): 'mfa_needed_first' | 'not_self' | 'forbidden' | 'invalid_code' | 'unknown' {
  const m = String(message ?? '').toLowerCase();
  if (m.includes('mfa_needed_first')) return 'mfa_needed_first';
  if (m.includes('not_self')) return 'not_self';
  if (m.includes('forbidden') || m.includes('aal2')) return 'forbidden';
  if (m.includes('invalid') && (m.includes('code') || m.includes('totp'))) return 'invalid_code';
  return 'unknown';
}
