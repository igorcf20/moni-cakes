// Teste do fórum (src/lib/forum.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-forum.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  categoryErrors, editMinutesLeft, FORUM_ERRORS, forumErrorOf, forumSlug, initials, normalizeForumRules, pageCount, relativeTime, topicErrors,
  topicPath, categoryPath,
} from '../src/lib/forum.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007190000_forum.sql');
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

test('regras da loja', () => {
  assert.deepEqual(normalizeForumRules(null), { guests_read: true, moderate_topics: false, moderate_posts: false, edit_minutes: 30 });
  assert.equal(normalizeForumRules({ guests_read: false }).guests_read, false);
  assert.equal(normalizeForumRules({ edit_minutes: 99999 }).edit_minutes, 1440);
  assert.equal(normalizeForumRules({ edit_minutes: -5 }).edit_minutes, 0);
  assert.equal(normalizeForumRules({ moderate_posts: 'sim' }).moderate_posts, false);
});

test('formulários', () => {
  assert.deepEqual(topicErrors({ category_id: 'c', title: 'Olá a todos', body: 'Oi' }), []);
  assert.deepEqual(topicErrors({ category_id: '', title: 'Oi', body: ' ' }), ['category', 'title', 'body']);
  assert.deepEqual(topicErrors({ title: 'x'.repeat(161), body: 'ok' }, false), ['title']);
  const others = [{ id: '1', slug: 'duvidas' }];
  assert.deepEqual(categoryErrors({ name: 'Dúvidas', slug: 'duvidas' }, others, '1'), []);
  assert.deepEqual(categoryErrors({ name: 'Outra', slug: 'duvidas' }, others, null), ['slug_taken']);
  assert.deepEqual(categoryErrors({ name: 'Tópico', slug: 'topico' }, [], null), ['slug_taken'], 'endereço reservado');
  assert.deepEqual(categoryErrors({ name: ' ', slug: 'Com Espaço' }, [], null), ['name', 'slug']);
  assert.equal(forumSlug('  Dúvidas sobre Produtos! '), 'duvidas-sobre-produtos');
});

test('pequenas contas da tela', () => {
  assert.equal(initials('ana souza'), 'AS');
  assert.equal(initials('Bruno'), 'B');
  assert.equal(initials(''), '?');
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(editMinutesLeft('2026-10-10T11:50:00Z', 30, now), 20);
  assert.equal(editMinutesLeft('2026-10-10T11:00:00Z', 30, now), 0);
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(41), 3);
  assert.equal(relativeTime('2026-10-10T11:55:00Z', 'en', now), '5 minutes ago');
  assert.equal(relativeTime('2026-10-09T12:00:00Z', 'en', now), 'yesterday');
  assert.equal(topicPath('abc'), '/forum/topico/abc');
  assert.equal(categoryPath('geral'), '/forum/geral');
});

test('erros estáveis e textos', () => {
  assert.equal(forumErrorOf('ERROR: already_reported'), 'already_reported');
  assert.equal(forumErrorOf('ERROR: locked'), 'locked');
  assert.equal(forumErrorOf('boom'), 'unknown');
  const site = sameKeys('src/i18n/forum.ts');
  const admin = sameKeys('src/i18n/adminForum.ts');
  for (const code of [...FORUM_ERRORS, 'unknown']) {
    assert.ok(site.has(`err_${code}`), `site ${code}`);
    assert.ok(admin.has(`err_${code}`), `admin ${code}`);
  }
  for (const s of ['visible', 'pending', 'hidden']) assert.ok(admin.has(`st_${s}`) && admin.has(`st_${s}_d`), s);
  for (const m of [0, 15, 30, 60, 1440]) assert.ok(admin.has(`r_edit_${m}`), m);
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['forum_categories', 'forum_topics', 'forum_posts', 'forum_reports']) {
    assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  }
  // Tabelas só do Admin; o site usa as RPCs.
  assert.match(MIG, /REVOKE ALL ON public\.forum_categories, public\.forum_topics, public\.forum_posts, public\.forum_reports FROM anon, authenticated;/);
  assert.doesNotMatch(MIG, /GRANT [A-Z, ]+ ON public\.forum_\w+[^;]* TO anon/);
  for (const code of FORUM_ERRORS) assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  // Limites, tópico fechado e aprovação no servidor.
  assert.match(MIG, /interval '1 hour'\) >= 5 THEN\s+RAISE EXCEPTION 'too_many'/);
  assert.match(MIG, /interval '1 hour'\) >= 20 THEN\s+RAISE EXCEPTION 'too_many'/);
  assert.match(MIG, /IF t\.locked AND NOT staff THEN RAISE EXCEPTION 'locked'/);
  assert.match(MIG, /moderate_topics/);
  assert.match(MIG, /moderate_posts/);
  assert.match(MIG, /IF _reading AND auth\.uid\(\) IS NULL AND \(r->>'guests_read'\)::boolean IS NOT TRUE THEN RAISE EXCEPTION 'auth_required'/);
  // Contadores só mudam pelo gatilho; uma denúncia por pessoa e mensagem.
  assert.match(MIG, /NEW\.reply_count := OLD\.reply_count;/);
  assert.match(MIG, /forum_reports_once ON public\.forum_reports \(user_id, topic_id, post_id\) NULLS NOT DISTINCT/);
  for (const f of ['forum_create_topic', 'forum_reply', 'forum_edit', 'forum_report']) {
    assert.match(MIG, new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon;`), f);
  }
  for (const f of ['forum_categories_public', 'forum_topics_list', 'forum_topic', 'forum_count_view']) {
    assert.match(MIG, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO anon, authenticated;`), f);
  }
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\._forum_rules\(boolean\) FROM PUBLIC, anon, authenticated;/);
});

test('recurso, rotas, menu, rodapé, mapa do site e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'forum', category: 'content', defaultOn: false, sections: \['forum'\]/);
  assert.match(read('src/lib/features.ts'), /'\/forum': 'forum'/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "forum", icon: MessagesSquare, badge: \(a\) => a\.forum/);
  assert.match(read('src/pages/Admin.tsx'), /forum: <AdminForum \/>/);
  const app = read('src/App.tsx');
  assert.match(app, /path="\/forum" element=\{<FeatureRoute feature="forum">/);
  assert.match(app, /path="\/forum\/topico\/:id" element=\{<FeatureRoute feature="forum">/);
  assert.match(app, /path="\/forum\/:slug" element=\{<FeatureRoute feature="forum">/);
  assert.match(read('src/components/Footer.tsx'), /\[t\("link_forum"\), "\/forum"\]/);
  assert.match(read('src/lib/activityLog.ts'), /'forum_categories', 'forum_topics', 'forum_posts'/);
  assert.match(read('supabase/functions/sitemap/index.ts'), /\/forum\/topico\//);
  assert.match(read('src/hooks/useAdminAttention.ts'), /forum_reports/);
  for (const [f, ks] of [['src/i18n/adminFeatures.ts', ['f_forum', 'f_forum_d']], ['src/i18n/admin.ts', ['s_forum', 'd_forum']], ['src/i18n/adminActivity.ts', ['e_forum_categories', 'e_forum_topics', 'e_forum_posts']], ['src/i18n/layout.ts', ['link_forum']]]) {
    for (const k of ks) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  assert.doesNotMatch(read('src/components/admin/AdminForum.tsx'), /Dialog|confirm\(/, 'sem janelas no Admin');
  // Mensagens em texto simples: nada de HTML vindo do cliente.
  for (const f of ['src/pages/ForumTopic.tsx', 'src/components/forum/ForumParts.tsx', 'src/pages/Forum.tsx']) {
    assert.doesNotMatch(read(f), /dangerouslySetInnerHTML|SiteHtml/, f);
  }
});

console.log(`test-forum: ${n} testes ok`);
