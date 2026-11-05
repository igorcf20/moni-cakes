// Teste das enquetes (src/lib/polls.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-polls.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMPTY_POLL_DRAFT, POLL_ERRORS, pollDraftErrors, pollErrorOf, pollForLocale, pollLeaders, pollPercents, pollState, togglePollChoice,
} from '../src/lib/polls.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007170000_polls.sql');
const keys = (s) => new Set([...s.matchAll(/^\s+([a-z0-9_]+): '/gm)].map((m) => m[1]));
const sameKeys = (file) => {
  const src = read(file);
  const block = (start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end) : undefined);
  const br = keys(block('const ptBR', 'export type'));
  for (const [name, s] of [['en', block('  en: {', '  es: {')], ['es', block('  es: {')]]) {
    const k = keys(s);
    assert.deepEqual([...br].filter((x) => !k.has(x)), [], `${file} ${name} sem chaves em falta`);
  }
  assert.match(block("  'pt-PT': {", '  en: {'), /\.\.\.ptBR/);
  assert.doesNotMatch(src, /—/, 'sem travessão');
  return br;
};

test('estado mostrado no Admin', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(pollState({ status: 'draft', starts_at: null, ends_at: null }, now), 'draft');
  assert.equal(pollState({ status: 'open', starts_at: null, ends_at: null }, now), 'open');
  assert.equal(pollState({ status: 'open', starts_at: '2026-10-11T00:00:00Z', ends_at: null }, now), 'scheduled');
  assert.equal(pollState({ status: 'open', starts_at: null, ends_at: '2026-10-10T11:59:00Z' }, now), 'ended');
  assert.equal(pollState({ status: 'closed', starts_at: null, ends_at: '2026-12-01T00:00:00Z' }, now), 'closed');
  assert.equal(pollForLocale({ locale: null }, 'en'), true);
  assert.equal(pollForLocale({ locale: 'es' }, 'en'), false);
});

test('percentagens e resposta na frente', () => {
  // Uma resposta por pessoa: fecha em 100.
  const p = pollPercents({ a: 1, b: 1, c: 1 }, ['a', 'b', 'c'], 3, true);
  assert.equal(p.a + p.b + p.c, 100);
  assert.deepEqual(pollPercents({ a: 2, b: 1 }, ['a', 'b'], 3, true), { a: 67, b: 33 });
  assert.deepEqual(pollPercents({}, ['a', 'b'], 0, true), { a: 0, b: 0 });
  // Várias respostas: parte das pessoas que marcou cada uma (soma pode passar de 100).
  assert.deepEqual(pollPercents({ a: 3, b: 2 }, ['a', 'b'], 4, false), { a: 75, b: 50 });
  assert.deepEqual(pollLeaders({ a: 3, b: 3, c: 1 }, ['a', 'b', 'c']), ['a', 'b']);
  assert.deepEqual(pollLeaders({}, ['a']), []);
});

test('escolher respostas', () => {
  assert.deepEqual(togglePollChoice(['a'], 'b', 1), ['b']);
  assert.deepEqual(togglePollChoice(['a'], 'b', 2), ['a', 'b']);
  assert.deepEqual(togglePollChoice(['a', 'b'], 'c', 2), ['a', 'b']);
  assert.deepEqual(togglePollChoice(['a', 'b'], 'a', 2), ['b']);
});

test('formulário do Admin', () => {
  const d = (x) => ({ ...EMPTY_POLL_DRAFT, ...x });
  assert.deepEqual(pollDraftErrors(d({ title: 'Cor?' })), []);
  assert.ok(pollDraftErrors(d({ title: ' ' })).includes('title'));
  assert.ok(pollDraftErrors(d({ title: 'Cor?', status: 'open', options: [{ id: null, label: 'Azul' }] })).includes('options'));
  assert.deepEqual(pollDraftErrors(d({ title: 'Cor?', status: 'open', options: [{ id: null, label: 'Azul' }, { id: null, label: 'Preto' }] })), []);
  assert.ok(pollDraftErrors(d({ title: 'Cor?', options: [{ id: null, label: 'Azul' }, { id: null, label: ' azul ' }] })).includes('dupe'));
  assert.ok(pollDraftErrors(d({ title: 'Cor?', starts_at: '2026-10-10T00:00:00Z', ends_at: '2026-10-09T00:00:00Z' })).includes('dates'));
  assert.ok(pollDraftErrors(d({ title: 'Cor?', max_choices: 3, options: [{ id: null, label: 'A' }, { id: null, label: 'B' }] })).includes('choices'));
});

test('erros estáveis e textos', () => {
  assert.equal(pollErrorOf('ERROR: already_voted'), 'already_voted');
  assert.equal(pollErrorOf('boom'), 'unknown');
  const site = sameKeys('src/i18n/polls.ts');
  for (const code of [...POLL_ERRORS, 'unknown']) assert.ok(site.has(`err_${code}`), code);
  const admin = sameKeys('src/i18n/adminPolls.ts');
  for (const s of ['draft', 'scheduled', 'open', 'ended', 'closed']) assert.ok(admin.has(`state_${s}`), s);
  for (const r of ['after_vote', 'always', 'after_close', 'hidden']) assert.ok(admin.has(`results_${r}`) && admin.has(`results_${r}_d`), r);
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['polls', 'poll_options', 'poll_ballots']) assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  // As tabelas são só do Admin; o sal e o resumo do visitante nunca saem do banco.
  assert.match(MIG, /REVOKE ALL ON public\.polls, public\.poll_options, public\.poll_ballots FROM anon, authenticated;/);
  assert.doesNotMatch(MIG.match(/GRANT SELECT \([^)]*\) ON public\.polls/)[0], /guest_salt/);
  assert.doesNotMatch(MIG.match(/GRANT SELECT \([^)]*\)[^;]*poll_ballots/)[0], /voter_hash|user_id/);
  assert.match(MIG, /CREATE UNIQUE INDEX IF NOT EXISTS poll_ballots_user_key ON public\.poll_ballots \(poll_id, user_id\)/);
  assert.match(MIG, /CREATE UNIQUE INDEX IF NOT EXISTS poll_ballots_guest_key ON public\.poll_ballots \(poll_id, voter_hash\)/);
  for (const code of POLL_ERRORS) assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  assert.match(MIG, /IF uid IS NULL AND NOT p\.guests THEN RAISE EXCEPTION 'auth_required'/);
  assert.match(MIG, /cardinality\(picked\) > p\.max_choices/);
  assert.match(MIG, /GRANT EXECUTE ON FUNCTION public\.site_polls\(text\) TO anon, authenticated;/);
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\._poll_guest_hash\(uuid\) FROM PUBLIC, anon, authenticated;/);
  assert.match(MIG, /IF NOT public\.has_role\(auth\.uid\(\), 'admin'::app_role\) THEN RAISE EXCEPTION 'forbidden'/);
});

test('recurso, rotas, menu, página inicial, rodapé e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'polls', category: 'content', defaultOn: false, sections: \['polls'\]/);
  assert.match(read('src/lib/features.ts'), /'\/enquetes': 'polls'/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "polls", icon: Vote/);
  assert.match(read('src/pages/Admin.tsx'), /polls: <AdminPolls \/>/);
  assert.match(read('src/App.tsx'), /path="\/enquetes" element=\{<FeatureRoute feature="polls">/);
  assert.match(read('src/pages/Index.tsx'), /<HomePolls \/>/);
  assert.match(read('src/components/Footer.tsx'), /\[t\("link_polls"\), "\/enquetes"\]/);
  assert.match(read('src/lib/activityLog.ts'), /'polls', 'poll_options'/);
  assert.doesNotMatch(read('src/hooks/usePolls.ts'), /from\("polls"\)\.select\("\*/, 'colunas explícitas (sal sem permissão)');
  for (const [f, ks] of [['src/i18n/adminFeatures.ts', ['f_polls', 'f_polls_d']], ['src/i18n/admin.ts', ['s_polls', 'd_polls']], ['src/i18n/adminActivity.ts', ['e_polls', 'e_poll_options']], ['src/i18n/layout.ts', ['link_polls']]]) {
    for (const k of ks) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  assert.doesNotMatch(read('src/components/admin/AdminPolls.tsx'), /Dialog|confirm\(/, 'sem janelas no Admin');
});

console.log(`test-polls: ${n} testes ok`);
