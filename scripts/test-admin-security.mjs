// Teste da segurança da conta do Admin (src/lib/adminSecurity.ts + migration). Uso: node --experimental-strip-types scripts/test-admin-security.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accessState, canOpenAdmin, cleanTotpCode, formatTotpSecret, normalizeSecuritySettings, oauthCallbackUrl, securityErrorCode,
  socialProvidersOn, totpCodeReady,
} from '../src/lib/adminSecurity.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const sql = readFileSync('supabase/migrations/20261007050000_admin_2fa.sql', 'utf8');

test('estado de acesso', () => {
  assert.equal(accessState('mfa_required'), 'mfa_required');
  assert.equal(accessState('x'), 'not_admin');
  assert.equal(accessState(null), 'not_admin');
  assert.ok(canOpenAdmin('mfa_setup_required'));
  assert.ok(!canOpenAdmin('not_admin'));
});

test('código e chave', () => {
  assert.equal(cleanTotpCode('123 456'), '123456');
  assert.equal(cleanTotpCode('12-34-56-78'), '123456');
  assert.ok(totpCodeReady('012345'));
  assert.ok(!totpCodeReady('12345'));
  assert.equal(formatTotpSecret('ABCDEFGHIJKLMNOP'), 'ABCD EFGH IJKL MNOP');
});

test('regras e provedores', () => {
  assert.deepEqual(normalizeSecuritySettings({ require_admin_2fa: 'true' }), { require_admin_2fa: false });
  assert.deepEqual(normalizeSecuritySettings({ require_admin_2fa: true }), { require_admin_2fa: true });
  assert.deepEqual(socialProvidersOn({ google: true, facebook: false, github: true }, true), ['google']);
  assert.deepEqual(socialProvidersOn({ google: true }, false), []);
  assert.equal(oauthCallbackUrl('https://loja.exemplo.com/'), 'https://loja.exemplo.com/auth/v1/callback');
  assert.equal(securityErrorCode('mfa_needed_first'), 'mfa_needed_first');
  assert.equal(securityErrorCode('Invalid TOTP code entered'), 'invalid_code');
});

test('migration: has_role exige aal2 só na própria sessão de admin, recurso e regra protegida', () => {
  assert.ok(sql.includes("_role <> 'admin'::app_role OR _user_id IS DISTINCT FROM auth.uid() OR public._admin_mfa_ok(_user_id)"));
  assert.ok(sql.includes("COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'"));
  assert.ok(sql.includes("NOT public.feature_enabled('admin_2fa', true)"));
  assert.ok(sql.includes("RAISE EXCEPTION 'mfa_needed_first'"));
  assert.ok(sql.includes("RAISE EXCEPTION 'not_self'"));
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/.test(sql));
});

test('funções do servidor conferem o admin com o token dele (respeita o 2FA)', () => {
  assert.ok(readFileSync('supabase/functions/_shared/admin.ts', 'utf8').includes('await asUser.rpc("has_role"'));
  for (const f of ['admin-create-user', 'admin-update-user', 'admin-delete-user', 'delete-order', 'delete-order-design', 'storage-usage']) {
    const src = readFileSync(`supabase/functions/${f}/index.ts`, 'utf8');
    assert.ok(src.includes('await userClient.rpc("has_role"'), f);
    assert.ok(!/from\("user_roles"\)\s*\.select\("role"\)/.test(src), `${f} sem consulta direta ao papel`);
  }
});

test('Google e Facebook no serviço de contas, chaves só no env', () => {
  const compose = readFileSync('deploy/compose.yaml', 'utf8');
  for (const k of ['GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${GOOGLE_LOGIN_ENABLED:-false}', 'GOTRUE_EXTERNAL_FACEBOOK_SECRET: ${FACEBOOK_APP_SECRET:-}', 'GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true"']) {
    assert.ok(compose.includes(k), k);
  }
  const ex = readFileSync('deploy/env.example', 'utf8');
  assert.ok(/^GOOGLE_CLIENT_SECRET=$/m.test(ex) && /^FACEBOOK_APP_SECRET=$/m.test(ex));
});

test('recursos, seção e textos', () => {
  const f = readFileSync('src/lib/features.ts', 'utf8');
  assert.ok(f.includes("{ id: 'admin_2fa', category: 'security', defaultOn: true"));
  assert.ok(f.includes("{ id: 'social_login', category: 'customers', defaultOn: false"));
  assert.ok(readFileSync('src/pages/Admin.tsx', 'utf8').includes('"account-security": <AdminAccountSecurity />'));
  assert.ok(readFileSync('src/components/admin/shell/AdminShell.tsx', 'utf8').includes('<AdminMfaGate state={access} />'));
  const texts = readFileSync('src/i18n/adminSecurity.ts', 'utf8');
  assert.ok(!/—/.test(texts));
});

console.log(`\n${n} testes ok`);
