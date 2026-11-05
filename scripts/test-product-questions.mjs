// Teste das Perguntas e respostas no produto (src/lib/productQuestions.ts e migration 20261008120000_product_questions.sql):
// regras, códigos de erro, leitura pública, segurança da tabela (sem INSERT do cliente, só admin pela RLS), textos e recurso.
// Uso: node --experimental-strip-types scripts/test-product-questions.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PRODUCT_QUESTIONS, QUESTION_ERRORS, normalizeProductQuestions, parsePublicQuestions, questionError } from '../src/lib/productQuestions.ts';
import { FEATURES } from '../src/lib/features.ts';
import { ENTITY_GROUPS } from '../src/lib/activityLog.ts';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('regras', () => {
  assert.deepEqual(normalizeProductQuestions(undefined), DEFAULT_PRODUCT_QUESTIONS);
  assert.deepEqual(normalizeProductQuestions({ ask: false, perPage: 99, style: 'discreet' }), { ask: false, perPage: 20, style: 'discreet' });
  assert.equal(normalizeProductQuestions({ style: 'x', perPage: 0 }).style, 'full');
  assert.equal(normalizeProductQuestions({ perPage: 0 }).perPage, 1);
});

test('códigos de erro iguais aos da RPC e traduzidos', () => {
  const sql = read('supabase/migrations/20261008120000_product_questions.sql');
  const i18n = read('src/i18n/productQuestions.ts');
  for (const c of QUESTION_ERRORS) {
    assert.ok(sql.includes(`RAISE EXCEPTION '${c}'`), `RPC ${c}`);
    assert.ok(i18n.includes(`err_${c}:`), `texto ${c}`);
  }
  assert.equal(questionError('ERROR: too_many'), 'too_many');
  assert.equal(questionError('qualquer'), 'unknown');
});

test('leitura pública ignora lixo', () => {
  const r = parsePublicQuestions({ total: '2', items: [{ id: 'a', question: 'Serve?' }, { id: 3 }, null] });
  assert.equal(r.total, 2);
  assert.equal(r.items.length, 1);
  assert.deepEqual(parsePublicQuestions(null), { total: 0, items: [] });
});

test('segurança: cliente só pela RPC, admin pela RLS, nada de e-mail no site', () => {
  const sql = read('supabase/migrations/20261008120000_product_questions.sql');
  assert.match(sql, /REVOKE ALL ON public\.product_questions FROM anon, authenticated/);
  assert.match(sql, /GRANT SELECT, UPDATE, DELETE ON public\.product_questions TO authenticated/);
  assert.ok(!/GRANT[^;]*INSERT[^;]*product_questions TO authenticated/.test(sql), 'sem INSERT direto');
  assert.match(sql, /has_role\(auth\.uid\(\), 'admin'::app_role\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.ask_product_question\(text, text, text\) FROM PUBLIC, anon/);
  assert.match(sql, /status = 'published'/);
  assert.ok(!/email/i.test(sql.split('product_questions_public')[1] || ''), 'leitura pública sem e-mail');
  assert.match(sql, /zz_admin_activity/);
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/i.test(sql));
});

test('recurso, seção do Admin, registo de atividade e textos', () => {
  const f = FEATURES.find((x) => x.id === 'product_questions');
  assert.ok(f && f.defaultOn && f.sections.includes('product-questions'));
  assert.ok(Object.values(ENTITY_GROUPS).flat().includes('product_questions'));
  assert.equal(read('src/i18n/adminActivity.ts').split('e_product_questions:').length - 1, 3);
  assert.ok(read('src/pages/Admin.tsx').includes('"product-questions": <AdminProductQuestions />'));
  const admin = read('src/i18n/admin.ts');
  assert.ok(admin.split('s_product_questions:').length - 1 >= 3);
  assert.equal(admin.split('d_product_questions:').length - 1, 4);
  const src = read('src/i18n/productQuestions.ts');
  for (const l of ["'pt-BR'", "'pt-PT'", 'en:', 'es:']) assert.ok(src.includes(l), l);
  assert.ok(!src.includes('—'));
});

console.log(`\n${n} testes ok`);
