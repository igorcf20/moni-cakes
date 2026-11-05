// Teste dos produtos digitais (src/lib/digitalProducts.ts, migration, frete no servidor e telas).
// Uso: node --experimental-strip-types scripts/test-digital-products.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canDownload, daysLeft, digitalErrorOf, digitalStoragePath, downloadsLeft, formatBytes, grantState, normalizeProductDigital, parseLicenseKeys,
} from '../src/lib/digitalProducts.ts';
import { digitalOnlyIds } from '../supabase/functions/_shared/digitalProducts.ts';

let n = 0;
const test = async (name, fn) => { await fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007110000_digital_products.sql');

await test('normalizar o produto digital', () => {
  const d = normalizeProductDigital({ product_id: 'x', download_limit: '0', access_days: '99999', license_keys: 'sim', instructions_i18n: { 'pt-BR': ' Abra o PDF ', en: '', es: 3 } });
  assert.deepEqual([d.download_limit, d.access_days, d.license_keys, d.ships, d.is_active], [1, 3650, false, false, true]);
  assert.deepEqual(d.instructions_i18n, { 'pt-BR': ' Abra o PDF ' });
  assert.equal(normalizeProductDigital({ download_limit: '' }).download_limit, null);
  assert.equal(normalizeProductDigital({ access_days: null }).access_days, null);
});

await test('estado, prazo e downloads restantes', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  assert.equal(grantState({ status: 'active', expires_at: null }, now), 'active');
  assert.equal(grantState({ status: 'active', expires_at: '2026-10-07T11:00:00Z' }, now), 'expired');
  assert.equal(grantState({ status: 'revoked', expires_at: null }, now), 'revoked');
  assert.equal(downloadsLeft(null, 50), null);
  assert.equal(downloadsLeft(3, 1), 2);
  assert.equal(downloadsLeft(3, 9), 0);
  assert.equal(canDownload({ status: 'active', expires_at: null, download_limit: 2 }, { used: 1 }, now), true);
  assert.equal(canDownload({ status: 'active', expires_at: null, download_limit: 2 }, { used: 2 }, now), false);
  assert.equal(canDownload({ status: 'revoked', expires_at: null, download_limit: null }, { used: 0 }, now), false);
  assert.equal(daysLeft(null, now), null);
  assert.equal(daysLeft('2026-10-17T12:00:00Z', now), 10);
  assert.equal(daysLeft('2026-10-01T12:00:00Z', now), 0);
});

await test('códigos de erro, tamanho, chaves e caminho', () => {
  assert.equal(digitalErrorOf('ERROR: limit_reached'), 'limit_reached');
  assert.equal(digitalErrorOf('outra coisa'), 'unknown');
  assert.equal(formatBytes(2_516_582, 'pt-BR'), '2,4 MB');
  assert.equal(formatBytes(0, 'pt-BR'), '');
  assert.deepEqual(parseLicenseKeys(' A-1 \n\nB-2\r\nA-1\n'), ['A-1', 'B-2']);
  assert.equal(digitalStoragePath('ebook', '../Guia de Impressão (v2).pdf', 'ab12'), 'ebook/ab12-Guia-de-Impressao-v2.pdf');
  assert.ok(!digitalStoragePath('p', '../../etc/passwd', 'x').includes('..'));
});

await test('servidor: só produtos digitais sem entrega e com o recurso ligado', async () => {
  const db = (on, rows) => ({
    rpc: async () => ({ data: on, error: null }),
    from: () => {
      let r = rows;
      const b = { select: () => b, in: (c, v) => { r = r.filter((x) => v.includes(x[c])); return b; }, eq: (c, v) => { r = r.filter((x) => x[c] === v); return b; }, then: (res) => Promise.resolve({ data: r, error: null }).then(res) };
      return b;
    },
  });
  const rows = [{ product_id: 'ebook', is_active: true, ships: false }, { product_id: 'livro', is_active: true, ships: true }, { product_id: 'velho', is_active: false, ships: false }];
  assert.deepEqual([...await digitalOnlyIds(db(true, rows), ['ebook', 'livro', 'velho', 'vaso'])], ['ebook']);
  assert.equal((await digitalOnlyIds(db(false, rows), ['ebook'])).size, 0);
  assert.equal((await digitalOnlyIds(db(true, rows), [])).size, 0);
  const co = read('supabase/functions/create-order/index.ts');
  assert.match(co, /digitalOnlyIds\(sb/);
  assert.match(co, /if \(digitalOnly\) \{\s*shippingNet = 0;/);
  assert.match(read('supabase/functions/_shared/shipping/quote.ts'), /digitalOnlyIds\(sb/);
});

await test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  // Leitura pública sem has_role (o anon não executa has_role).
  assert.match(MIG, /"Public reads active digital products" ON public\.product_digital FOR SELECT USING \(is_active\);/);
  for (const t of ['digital_files', 'digital_license_keys', 'digital_grants', 'digital_download_log']) {
    assert.match(MIG, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon;`), t);
  }
  assert.match(MIG, /'digital-files', 'digital-files', false/);
  assert.match(MIG, /digital_file_readable\(name\)/);
  assert.match(MIG, /interval '10 minutes'/);
  assert.match(MIG, /o\.payment_status IS DISTINCT FROM 'paid'/);
  assert.match(MIG, /UPDATE public\.digital_grants SET status = 'revoked'/);
  for (const code of ['feature_off', 'not_found', 'revoked', 'expired', 'limit_reached']) assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`));
  assert.match(MIG, /FOR UPDATE SKIP LOCKED/);
  assert.match(MIG, /AND is_active AND NOT ships\) THEN RETURN; END IF;/);
  // As chaves de licença ficam fora do registo de atividade (segredo do cliente).
  assert.doesNotMatch(MIG, /zz_admin_activity ON public\.digital_license_keys/);
});

await test('recurso, menu, abas e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'digital_products', category: 'sales', defaultOn: false, sections: \['downloads'\]/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "downloads", icon: Download/);
  assert.match(read('src/pages/Admin.tsx'), /downloads: <AdminDigital \/>/);
  assert.match(read('src/pages/AdminProductEdit.tsx'), /digitalOn \? \[\{ value: "digital"/);
  assert.match(read('src/pages/Dashboard.tsx'), /s\.id !== "downloads" \|\| downloadsOn/);
  assert.match(read('src/pages/Checkout.tsx'), /digitalOnly \? \(/);
  assert.match(read('src/pages/ProductDetail.tsx'), /stockControlled = !product\.customizable && !\(digital && !digital\.ships\)/);
  for (const f of ['src/i18n/digitalProducts.ts', 'src/i18n/adminDigital.ts']) assert.doesNotMatch(read(f), /—/, `${f} sem travessão`);
  const admin = read('src/components/admin/AdminDigital.tsx') + read('src/components/admin/ProductDigitalEditor.tsx');
  assert.doesNotMatch(admin, /Dialog|confirm\(/, 'sem janelas no Admin');
});

console.log(`test-digital-products: ${n} testes ok`);
