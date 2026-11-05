// Pré-venda (recurso preorders): regras de exibição e do formulário do Admin, migration e ligações no site.
// node --experimental-strip-types scripts/test-preorders.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeProductPreorder, normalizePublicPreorder, orderLinePreorder, preorderErrors, preorderNote, formatReleaseDate,
} from '../src/lib/preorders.ts';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('normalizeProductPreorder limpa data, limite e mensagens', () => {
  const p = normalizeProductPreorder({ product_id: 'x', is_active: true, release_date: '2026-13-40', max_units: '-3', note_i18n: { 'pt-BR': '  Olá  ', xx_bad: 'n', en: 5 } });
  assert.equal(p.release_date, null);
  assert.equal(p.max_units, null);
  assert.deepEqual(p.note_i18n, { 'pt-BR': 'Olá' });
  assert.equal(normalizeProductPreorder({ product_id: 'x', max_units: '12.7', release_date: '2026-11-06' }).max_units, 12);
  assert.equal(normalizeProductPreorder({ product_id: 'x' }).is_active, true);
});

test('normalizePublicPreorder: restante nulo = sem limite, nunca negativo', () => {
  assert.equal(normalizePublicPreorder({ product_id: 'a', remaining: null }).remaining, null);
  assert.equal(normalizePublicPreorder({ product_id: 'a', remaining: -2 }).remaining, 0);
  assert.equal(normalizePublicPreorder({}), null);
});

test('data de lançamento tem de ser depois de hoje', () => {
  const base = { product_id: 'x', is_active: true, max_units: null, note_i18n: {} };
  assert.deepEqual(preorderErrors({ ...base, release_date: '2026-10-07' }, '2026-10-07'), ['release_past']);
  assert.deepEqual(preorderErrors({ ...base, release_date: '2026-10-08' }, '2026-10-07'), []);
  assert.deepEqual(preorderErrors({ ...base, release_date: null }, '2026-10-07'), []);
  assert.deepEqual(preorderErrors({ ...base, is_active: false, release_date: '2020-01-01' }, '2026-10-07'), []);
});

test('mensagem no idioma, com recurso ao pt-BR', () => {
  assert.equal(preorderNote({ 'pt-BR': 'A', en: 'B' }, 'en'), 'B');
  assert.equal(preorderNote({ 'pt-BR': 'A' }, 'es'), 'A');
  assert.equal(preorderNote({}, 'es'), '');
});

test('data por extenso sem mudar de dia com o fuso', () => {
  assert.match(formatReleaseDate('2026-11-06', 'pt-BR'), /6 de novembro de 2026/);
});

test('linha do pedido marcada pelo servidor', () => {
  assert.deepEqual(orderLinePreorder({ preorder: { release_date: '2026-11-06' } }), { release_date: '2026-11-06' });
  assert.deepEqual(orderLinePreorder({ preorder: { release_date: null } }), { release_date: null });
  assert.equal(orderLinePreorder({ name: 'x' }), undefined);
  assert.equal(orderLinePreorder(null), undefined);
});

test('migration: tabela do Admin, marca pelo servidor, sem estoque, limite estrito', () => {
  const sql = read('supabase/migrations/20261007230000_preorders.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.product_preorders/);
  assert.match(sql, /REVOKE ALL ON public\.product_preorders FROM PUBLIC, anon/);
  assert.match(sql, /feature_enabled\('preorders', true\)/);
  assert.match(sql, /release_date <= current_date THEN RETURN/);
  // a marca do navegador é descartada na compra do cliente
  assert.match(sql, /design := design - 'preorder'/);
  assert.match(sql, /BEFORE INSERT ON public\.order_items\s+FOR EACH ROW EXECUTE FUNCTION public\.order_items_preorder_mark/);
  // linhas de pré-venda não mexem no estoque
  assert.match(sql, /_design \? 'preorder' THEN RETURN; END IF;/);
  // limite com lock e reservas dos outros
  assert.match(sql, /hashtext\('loja3d\.reserve:' \|\| s\)/);
  assert.match(sql, /r\.max_units - r\.sold - held < 0/);
  assert.match(sql, /status NOT IN \('cancelled', 'refunded'\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.preorders_public\(\) TO anon/);
  assert.match(sql, /has_role\(auth\.uid\(\), 'admin'::app_role\) THEN RAISE EXCEPTION 'forbidden'/);
});

test('site e Admin ligados ao recurso', () => {
  assert.match(read('src/lib/features.ts'), /id: 'preorders', category: 'sales', defaultOn: true, sections: \['preorders'\]/);
  assert.match(read('src/pages/ProductDetail.tsx'), /!\(digital && !digital\.ships\) && !preorder/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "preorders"/);
  assert.match(read('src/pages/Admin.tsx'), /preorders: <AdminPreorders \/>/);
  assert.match(read('src/pages/AdminProductEdit.tsx'), /value="preorder"/);
  for (const loc of ['adminFeatures', 'admin']) {
    const s = read(`src/i18n/${loc}.ts`);
    const key = loc === 'admin' ? 's_preorders' : 'f_preorders';
    assert.equal((s.match(new RegExp(`${key}:`, 'g')) || []).length, 4, `${key} nos 4 idiomas`);
  }
});

console.log(`\n${n} testes ok`);
