// Página pública de avaliações (/avaliacoes, recurso store_reviews): recurso, rota, rodapé, textos e função segura.
// node --experimental-strip-types scripts/test-store-reviews.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURES, FEATURE_PATHS, featureOn } from '../src/lib/features.ts';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('recurso ligado por padrão e dono da página', () => {
  assert.ok(FEATURES.some((f) => f.id === 'store_reviews' && f.category === 'content'));
  assert.equal(FEATURE_PATHS['/avaliacoes'], 'store_reviews');
  assert.equal(featureOn({}, 'store_reviews'), true);
  assert.equal(featureOn({ store_reviews: false }, 'store_reviews'), false);
});

test('rota protegida pelo recurso e link no rodapé', () => {
  assert.match(read('src/App.tsx'), /path="\/avaliacoes" element=\{<FeatureRoute feature="store_reviews">/);
  assert.match(read('src/components/Footer.tsx'), /"\/avaliacoes"/);
});

test('textos nos 4 idiomas, sem travessões', () => {
  const i18n = read('src/i18n/storeReviews.ts');
  for (const k of ['title', 'tab_store', 'tab_products', 'write_store', 'verified', 'empty_store']) {
    assert.ok((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length >= 3, k);
  }
  assert.doesNotMatch(i18n, /[\u2013\u2014]/);
  const feats = read('src/i18n/adminFeatures.ts');
  assert.equal((feats.match(/\bf_store_reviews_d:/g) || []).length, 4);
});

test('função pública só com colunas seguras e respeita o recurso', () => {
  const sql = read('supabase/migrations/20261008000000_store_reviews_page.sql');
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /feature_enabled\('store_reviews', true\)/);
  assert.match(sql, /status = 'approved' AND h\.is_active/);
  assert.doesNotMatch(sql, /submitter_email|user_id AS|email AS/);
});

console.log(`\n${n} testes ok`);
