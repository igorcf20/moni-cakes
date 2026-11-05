// Teste do blog (src/lib/blog.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-blog.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOG_ERRORS, blogDraftErrors, blogErrorOf, blogExcerpt, blogForLocale, blogSlug, blogState, filterPosts, htmlText, neighbours,
  normalizeBlogSettings, parseTags, readingMinutes, tagCounts,
} from '../src/lib/blog.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const MIG = read('supabase/migrations/20261007160000_blog.sql');
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

test('endereço, estado e idioma', () => {
  assert.equal(blogSlug('  Como cuidar do seu Vaso: 5 dicas!  '), 'como-cuidar-do-seu-vaso-5-dicas');
  assert.equal(blogSlug('Ação & Decoração'), 'acao-decoracao');
  const now = new Date('2026-10-06T12:00:00Z');
  assert.equal(blogState({ status: 'draft', published_at: '2026-10-01T00:00:00Z' }, now), 'draft');
  assert.equal(blogState({ status: 'published', published_at: '2026-10-07T00:00:00Z' }, now), 'scheduled');
  assert.equal(blogState({ status: 'published', published_at: '2026-10-06T11:00:00Z' }, now), 'published');
  assert.equal(blogForLocale({ locale: null }, 'en'), true);
  assert.equal(blogForLocale({ locale: 'pt-BR' }, 'en'), false);
});

test('texto, resumo e leitura', () => {
  assert.equal(htmlText('<h2>Olá</h2><p>mundo &amp; <b>casa</b></p><script>x()</script>'), 'Olá mundo & casa');
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes(`<p>${'palavra '.repeat(1000)}</p>`), 5);
  assert.equal(blogExcerpt({ excerpt: ' Resumo curto ', body: '<p>x</p>' }), 'Resumo curto');
  const long = blogExcerpt({ excerpt: null, body: `<p>${'abcde '.repeat(60)}</p>` }, 40);
  assert.ok(long.endsWith('...') && long.length <= 43, long);
  assert.deepEqual(parseTags(' Casa, decoração ,casa,, Dicas'), ['casa', 'decoração', 'dicas']);
});

test('lista, assuntos e vizinhos', () => {
  const posts = [
    { id: 'a', title: 'Vasos', excerpt: null, body: '<p>plantas</p>', tags: ['casa'], featured: false, published_at: '2026-10-01' },
    { id: 'b', title: 'Luminárias', excerpt: 'luz', body: '', tags: ['casa', 'luz'], featured: true, published_at: '2026-09-01' },
    { id: 'c', title: 'Presentes', excerpt: null, body: '', tags: ['presentes'], featured: false, published_at: '2026-10-05' },
  ];
  assert.deepEqual(filterPosts(posts).map((p) => p.id), ['b', 'c', 'a']);
  assert.deepEqual(filterPosts(posts, { tag: 'casa' }).map((p) => p.id), ['b', 'a']);
  assert.deepEqual(filterPosts(posts, { q: 'PLANTAS' }).map((p) => p.id), ['a']);
  assert.deepEqual(tagCounts(posts), [{ tag: 'casa', count: 2 }, { tag: 'luz', count: 1 }, { tag: 'presentes', count: 1 }]);
  assert.deepEqual(neighbours(posts, 'a'), { prev: posts[1], next: posts[2] });
  assert.deepEqual(neighbours(posts, 'z'), { prev: null, next: null });
});

test('regras e formulário do Admin', () => {
  assert.deepEqual(normalizeBlogSettings(null), { posts_per_page: 9, comments: true, moderate_comments: true });
  assert.deepEqual(normalizeBlogSettings({ posts_per_page: 100, comments: false, moderate_comments: false }), { posts_per_page: 48, comments: false, moderate_comments: false });
  const others = [{ id: 'x', slug: 'vasos' }];
  assert.deepEqual(blogDraftErrors({ title: ' ', slug: 'Vasos!', body: '' }, others, null, true), ['title', 'slug', 'body']);
  assert.deepEqual(blogDraftErrors({ title: 'A', slug: 'vasos', body: '' }, others, null, false), ['slug_taken']);
  assert.deepEqual(blogDraftErrors({ title: 'A', slug: 'vasos', body: '<p>oi</p>' }, others, 'x', true), []);
});

test('erros estáveis e textos', () => {
  assert.equal(blogErrorOf('ERROR: comments_off'), 'comments_off');
  assert.equal(blogErrorOf('boom'), 'unknown');
  const site = sameKeys('src/i18n/blog.ts');
  for (const c of BLOG_ERRORS) assert.ok(site.has(`err_${c}`), `err_${c}`);
  assert.ok(site.has('err_unknown'));
  const admin = sameKeys('src/i18n/adminBlog.ts');
  for (const s of ['published', 'scheduled', 'draft']) assert.ok(admin.has(`state_${s}`), s);
});

test('migration: regras no banco', () => {
  assert.doesNotMatch(MIG, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  for (const t of ['blog_posts', 'blog_comments']) assert.match(MIG, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY;`), t);
  // Só publicados com a data passada e o recurso ligado.
  assert.match(MIG, /USING \(status = 'published' AND published_at <= now\(\) AND public\.feature_enabled\('blog', false\)\)/);
  // Cliente não escreve comentários direto; só pela RPC.
  assert.match(MIG, /GRANT SELECT, UPDATE, DELETE ON public\.blog_comments TO authenticated;/);
  assert.doesNotMatch(MIG, /GRANT INSERT[^;]*blog_comments/);
  assert.match(MIG, /REVOKE ALL ON FUNCTION public\.add_blog_comment\(uuid, text\) FROM PUBLIC, anon;/);
  assert.match(MIG, /interval '1 hour'\) >= 5/);
  for (const code of BLOG_ERRORS) assert.match(MIG, new RegExp(`RAISE EXCEPTION '${code}'`), code);
  assert.match(MIG, /IF TG_OP = 'UPDATE' THEN NEW\.views := OLD\.views;/);
});

test('recurso, rotas, menu, rodapé, mapa do site e textos', () => {
  assert.match(read('src/lib/features.ts'), /id: 'blog', category: 'content', defaultOn: false, sections: \['blog'\]/);
  assert.match(read('src/lib/features.ts'), /'\/blog': 'blog'/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "blog", icon: Newspaper, badge: \(a\) => a\.blogComments/);
  assert.match(read('src/pages/Admin.tsx'), /blog: <AdminBlog \/>/);
  const app = read('src/App.tsx');
  assert.match(app, /path="\/blog" element=\{<FeatureRoute feature="blog">/);
  assert.match(app, /path="\/blog\/:slug" element=\{<FeatureRoute feature="blog">/);
  assert.match(read('src/components/Footer.tsx'), /\[t\("link_blog"\), "\/blog"\]/);
  assert.match(read('supabase/functions/sitemap/index.ts'), /from\("blog_posts"\)/);
  assert.match(read('src/pages/BlogPost.tsx'), /<SiteHtml /);
  assert.match(read('src/lib/activityLog.ts'), /'blog_posts', 'blog_comments'/);
  for (const [f, ks] of [['src/i18n/adminFeatures.ts', ['f_blog', 'f_blog_d']], ['src/i18n/admin.ts', ['s_blog', 'd_blog']], ['src/i18n/adminActivity.ts', ['e_blog_posts', 'e_blog_comments']], ['src/i18n/layout.ts', ['link_blog']]]) {
    for (const k of ks) assert.ok(read(f).split(`${k}:`).length >= 4, `${f} ${k} em pt-BR, en e es`);
  }
  assert.doesNotMatch(read('src/components/admin/AdminBlog.tsx'), /Dialog|confirm\(/, 'sem janelas no Admin');
});

console.log(`test-blog: ${n} testes ok`);
