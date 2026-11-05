// Teste de privacidade e cookies (src/lib/privacy.ts e src/lib/consent.ts): configuração da loja,
// categorias mostradas no aviso, lista do que é guardado e quando a escolha tem de ser refeita.
//   node --experimental-strip-types scripts/test-privacy.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COOKIE_REGISTRY, DEFAULT_PRIVACY, activeTools, offeredCategories, parsePrivacySettings, storageFor } from '../src/lib/privacy.ts';
import { needsConsent } from '../src/lib/consent.ts';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`ok ${name}`); };

ok('valor vazio ou estranho = padrão', () => {
  for (const v of [null, undefined, 'x', 3, [], {}]) assert.deepEqual(parsePrivacySettings(v), DEFAULT_PRIVACY);
});

ok('IDs inválidos ficam vazios; GA4 em maiúsculas', () => {
  assert.deepEqual(parsePrivacySettings({ ga4Id: ' g-abc123 ', metaPixelId: '12345678', consentMonths: 6 }), { ga4Id: 'G-ABC123', metaPixelId: '12345678', consentMonths: 6 });
  assert.deepEqual(parsePrivacySettings({ ga4Id: 'UA-1234', metaPixelId: '12ab', consentMonths: 24 }), DEFAULT_PRIVACY);
  assert.equal(parsePrivacySettings({ ga4Id: 'G-1"><script>' }).ga4Id, '');
});

ok('sem ferramentas o aviso só oferece Preferências', () => {
  assert.deepEqual(activeTools(DEFAULT_PRIVACY), []);
  assert.deepEqual(offeredCategories(DEFAULT_PRIVACY), ['preferences']);
  assert.deepEqual(storageFor('analytics', DEFAULT_PRIVACY), []);
});

ok('cada ferramenta liga a sua categoria e os seus cookies', () => {
  const s = parsePrivacySettings({ ga4Id: 'G-TEST1234' });
  assert.deepEqual(offeredCategories(s), ['preferences', 'analytics']);
  assert.deepEqual(storageFor('analytics', s).map((i) => i.name), ['_ga, _ga_*']);
  const both = parsePrivacySettings({ ga4Id: 'G-TEST1234', metaPixelId: '1234567' });
  assert.deepEqual(offeredCategories(both), ['preferences', 'analytics', 'marketing']);
});

ok('escolha refeita quando falta, ou quando aparece categoria nova', () => {
  const base = { essential: true, analytics: false, marketing: false, preferences: true, timestamp: '2026-01-01T00:00:00Z', version: 1 };
  assert.equal(needsConsent(null, ['preferences']), true);
  assert.equal(needsConsent({ ...base, offered: ['preferences'] }, ['preferences']), false);
  assert.equal(needsConsent({ ...base, offered: ['preferences'] }, ['preferences', 'analytics']), true);
  // escolhas antigas (sem `offered`) viram as três categorias
  assert.equal(needsConsent(base, ['preferences', 'analytics', 'marketing']), false);
});

ok('cada finalidade e duração tem texto nos 4 idiomas', () => {
  const src = readFileSync(new URL('../src/i18n/legal.ts', import.meta.url), 'utf8');
  const keys = new Set(Object.values(COOKIE_REGISTRY).flat().flatMap((i) => [i.purpose, i.duration]));
  for (const k of keys) assert.equal((src.match(new RegExp(`\\b${k}: '`, 'g')) || []).length, 4, k);
});

console.log(`\n${n} testes de privacidade passaram.`);
