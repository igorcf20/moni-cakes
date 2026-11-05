// =============================================================================================
// Blog da loja (recurso blog; Admin > Aparência e conteúdo > Blog, páginas /blog e /blog/<slug>). Regras no banco
// (migration 20261007160000_blog.sql): o site lê só artigos publicados com a data passada; comentários pela RPC
// add_blog_comment e leitura por blog_post_comments. Aqui: tipos, regras da loja (store_settings.blog) e contas
// que o site e o Admin só mostram. Sem imports.
// Teste: node --experimental-strip-types scripts/test-blog.mjs
// =============================================================================================

export type BlogLocale = 'pt-BR' | 'pt-PT' | 'en' | 'es';
export type BlogStatus = 'draft' | 'published';
/** Estado mostrado no Admin: agendado = publicado com a data no futuro. */
export type BlogState = 'draft' | 'scheduled' | 'published';

export type BlogPost = {
  id: string;
  slug: string;
  locale: BlogLocale | null;
  title: string;
  excerpt: string | null;
  body: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  author_name: string | null;
  tags: string[];
  product_ids: string[];
  status: BlogStatus;
  published_at: string | null;
  featured: boolean;
  allow_comments: boolean;
  seo_title: string | null;
  seo_description: string | null;
  views: number;
  created_at: string;
  updated_at: string;
};

export type BlogComment = {
  id: string;
  author_name: string | null;
  body: string;
  admin_reply: string | null;
  created_at: string;
  pending: boolean;
  mine: boolean;
};

export type BlogSettings = {
  /** Artigos por página na lista /blog. */
  posts_per_page: number;
  /** Clientes com conta podem comentar (cada artigo também pode fechar os seus). */
  comments: boolean;
  /** Comentário só aparece depois de aprovado no Admin. */
  moderate_comments: boolean;
};

export const BLOG_DEFAULTS: BlogSettings = { posts_per_page: 9, comments: true, moderate_comments: true };
export const BLOG_PATH = '/blog';
export const BLOG_LOCALES: BlogLocale[] = ['pt-BR', 'pt-PT', 'en', 'es'];
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const BLOG_ERRORS = ['feature_off', 'auth_required', 'not_found', 'comments_off', 'invalid', 'too_many'] as const;
export type BlogError = (typeof BLOG_ERRORS)[number] | 'unknown';
export const blogErrorOf = (message: unknown): BlogError => {
  const m = String(message ?? '');
  return [...BLOG_ERRORS].sort((a, b) => b.length - a.length).find((c) => m.includes(c)) ?? 'unknown';
};

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export function normalizeBlogSettings(raw: unknown): BlogSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    posts_per_page: Math.min(48, Math.max(3, Math.round(num(o.posts_per_page, BLOG_DEFAULTS.posts_per_page)))),
    comments: o.comments !== false,
    moderate_comments: o.moderate_comments !== false,
  };
}

/** Endereço curto a partir do título (sem acentos, só letras, números e hífens). */
export function blogSlug(title: string): string {
  return String(title ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/, '');
}

export function blogState(p: Pick<BlogPost, 'status' | 'published_at'>, now = new Date()): BlogState {
  if (p.status !== 'published') return 'draft';
  return p.published_at && new Date(p.published_at).getTime() > now.getTime() ? 'scheduled' : 'published';
}

/** Artigo aparece para o idioma do visitante (sem idioma = todos). */
export const blogForLocale = (p: Pick<BlogPost, 'locale'>, locale: string) => !p.locale || p.locale === locale;

/** Texto simples do HTML (resumo, SEO, tempo de leitura). */
export function htmlText(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** Minutos de leitura (cerca de 200 palavras por minuto, no mínimo 1). */
export function readingMinutes(html: string | null | undefined): number {
  const words = htmlText(html).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Resumo: o escrito no Admin ou o começo do texto, cortado numa palavra. */
export function blogExcerpt(p: Pick<BlogPost, 'excerpt' | 'body'>, max = 180): string {
  const src = p.excerpt?.trim() || htmlText(p.body);
  if (src.length <= max) return src;
  const cut = src.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trimEnd()}...`;
}

/** Etiquetas escritas separadas por vírgula. */
export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const t of String(raw ?? '').split(',')) {
    const v = t.trim().toLowerCase();
    if (v && v.length <= 40 && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 20);
}

/** Etiquetas usadas, da mais frequente para a menos (desempate por nome). */
export function tagCounts(posts: Pick<BlogPost, 'tags'>[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const p of posts) for (const t of p.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Lista do site: filtra por etiqueta e busca, destaque primeiro e depois o mais recente. */
export function filterPosts<P extends Pick<BlogPost, 'tags' | 'title' | 'excerpt' | 'body' | 'featured' | 'published_at'>>(posts: P[], opts: { tag?: string | null; q?: string | null } = {}): P[] {
  const q = (opts.q ?? '').trim().toLowerCase();
  return posts
    .filter((p) => !opts.tag || (p.tags ?? []).includes(opts.tag))
    .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.excerpt ?? '').toLowerCase().includes(q) || htmlText(p.body).toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.includes(q)))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || String(b.published_at ?? '').localeCompare(String(a.published_at ?? '')));
}

/** Artigo anterior e seguinte (por data) na lista já filtrada pelo idioma. */
export function neighbours<P extends Pick<BlogPost, 'id' | 'published_at'>>(posts: P[], id: string): { prev: P | null; next: P | null } {
  const sorted = [...posts].sort((a, b) => String(a.published_at ?? '').localeCompare(String(b.published_at ?? '')));
  const i = sorted.findIndex((p) => p.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: sorted[i - 1] ?? null, next: sorted[i + 1] ?? null };
}

export type BlogDraft = Omit<BlogPost, 'id' | 'views' | 'created_at' | 'updated_at'>;

export const EMPTY_BLOG_DRAFT: BlogDraft = {
  slug: '', locale: null, title: '', excerpt: null, body: '', cover_url: null, cover_alt: null, author_name: null,
  tags: [], product_ids: [], status: 'draft', published_at: null, featured: false, allow_comments: true,
  seo_title: null, seo_description: null,
};

/** O que falta no artigo (chaves de texto do Admin). */
export function blogDraftErrors(d: Pick<BlogDraft, 'title' | 'slug' | 'body'>, others: Pick<BlogPost, 'id' | 'slug'>[], selfId: string | null, publishing: boolean) {
  const errs: ('title' | 'slug' | 'slug_taken' | 'body')[] = [];
  if (!d.title.trim()) errs.push('title');
  if (!SLUG_RE.test(d.slug) || d.slug.length > 120) errs.push('slug');
  else if (others.some((o) => o.slug === d.slug && o.id !== selfId)) errs.push('slug_taken');
  if (publishing && !htmlText(d.body)) errs.push('body');
  return errs;
}
