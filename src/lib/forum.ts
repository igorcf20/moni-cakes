// =============================================================================================
// Fórum (recurso forum; páginas /forum, /forum/<seção> e /forum/topico/<id>, Admin > Fórum). Regras no banco
// (migration 20261007190000_forum.sql): o site lê e escreve só pelas RPCs (forum_categories_public, forum_topics_list,
// forum_topic, forum_create_topic, forum_reply, forum_edit, forum_report), em texto simples, com limite por hora,
// tópico fechado e aprovação conforme as regras (store_settings.forum). Aqui: tipos, regras, erros estáveis, o que
// falta num formulário e pequenas contas da tela. Sem imports.
// Teste: node --experimental-strip-types scripts/test-forum.mjs
// =============================================================================================

export type ForumLocale = 'pt-BR' | 'pt-PT' | 'en' | 'es';
export type ForumStatus = 'pending' | 'visible' | 'hidden';

export const FORUM_PATH = '/forum';
export const FORUM_PAGE_SIZE = 20;
export const FORUM_LOCALES: ForumLocale[] = ['pt-BR', 'pt-PT', 'en', 'es'];
export const TITLE_MIN = 3;
export const TITLE_MAX = 160;
export const BODY_MIN = 2;
export const BODY_MAX = 10000;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const topicPath = (id: string) => `${FORUM_PATH}/topico/${id}`;
export const categoryPath = (slug: string) => `${FORUM_PATH}/${slug}`;

/* ---------- Site ---------- */

export type ForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  topics: number;
  posts: number;
  last_post_at: string | null;
};

export type ForumTopicRow = {
  id: string;
  title: string;
  excerpt: string;
  category_slug: string;
  category_name: string;
  author_name: string | null;
  is_staff: boolean;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  views: number;
  created_at: string;
  last_post_at: string;
  last_post_name: string | null;
  last_post_staff: boolean;
  pending: boolean;
  mine: boolean;
};

export type ForumPost = {
  id: string;
  author_name: string | null;
  is_staff: boolean;
  body: string;
  created_at: string;
  edited_at: string | null;
  pending: boolean;
  mine: boolean;
  can_edit: boolean;
};

export type ForumTopic = Omit<ForumTopicRow, 'excerpt' | 'last_post_at' | 'last_post_name' | 'last_post_staff'> & {
  body: string;
  edited_at: string | null;
  can_edit: boolean;
  edit_minutes: number;
  posts: ForumPost[];
};

/* ---------- Admin ---------- */

export type AdminForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  locale: ForumLocale | null;
  sort_order: number;
  is_active: boolean;
};
export type CategoryDraft = Omit<AdminForumCategory, 'id'>;
export const EMPTY_CATEGORY: CategoryDraft = { slug: '', name: '', description: null, locale: null, sort_order: 0, is_active: true };

export type AdminForumTopic = {
  id: string;
  category_id: string;
  user_id: string | null;
  author_name: string | null;
  is_staff: boolean;
  title: string;
  body: string;
  status: ForumStatus;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  views: number;
  last_post_at: string;
  created_at: string;
  edited_at: string | null;
};

export type AdminForumPost = {
  id: string;
  topic_id: string;
  user_id: string | null;
  author_name: string | null;
  is_staff: boolean;
  body: string;
  status: ForumStatus;
  created_at: string;
  edited_at: string | null;
};

export type ForumReport = {
  id: string;
  topic_id: string;
  post_id: string | null;
  user_id: string | null;
  reason: string;
  created_at: string;
  resolved_at: string | null;
};

export type ForumStats = {
  topics: number; posts: number; pending_topics: number; pending_posts: number; open_reports: number;
  members: number; topics_30d: number; unanswered: number;
};
export const EMPTY_FORUM_STATS: ForumStats = {
  topics: 0, posts: 0, pending_topics: 0, pending_posts: 0, open_reports: 0, members: 0, topics_30d: 0, unanswered: 0,
};

/* ---------- Regras ---------- */

export type ForumRules = {
  /** Visitantes sem conta leem o fórum (escrever pede sempre conta). */
  guests_read: boolean;
  /** Tópicos novos só aparecem depois de aprovados no Admin. */
  moderate_topics: boolean;
  /** Respostas novas só aparecem depois de aprovadas no Admin. */
  moderate_posts: boolean;
  /** Minutos em que o autor ainda pode corrigir o que escreveu (0 = nunca). */
  edit_minutes: number;
};
export const FORUM_DEFAULTS: ForumRules = { guests_read: true, moderate_topics: false, moderate_posts: false, edit_minutes: 30 };
export const EDIT_MINUTE_OPTIONS = [0, 15, 30, 60, 1440] as const;

export function normalizeForumRules(raw: unknown): ForumRules {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const bool = (k: keyof ForumRules) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (FORUM_DEFAULTS[k] as boolean));
  const mins = Number(o.edit_minutes);
  return {
    guests_read: bool('guests_read'),
    moderate_topics: bool('moderate_topics'),
    moderate_posts: bool('moderate_posts'),
    edit_minutes: Number.isFinite(mins) ? Math.min(Math.max(Math.round(mins), 0), 1440) : FORUM_DEFAULTS.edit_minutes,
  };
}

/* ---------- Erros e formulários ---------- */

export const FORUM_ERRORS = ['feature_off', 'auth_required', 'not_found', 'locked', 'invalid', 'too_many', 'edit_closed', 'already_reported'] as const;
export type ForumError = (typeof FORUM_ERRORS)[number] | 'unknown';
export const forumErrorOf = (message: unknown): ForumError => {
  const m = String(message ?? '');
  return [...FORUM_ERRORS].sort((a, b) => b.length - a.length).find((c) => m.includes(c)) ?? 'unknown';
};

/** O que falta num tópico novo (ou na edição). Sem categoria só quando for tópico novo. */
export function topicErrors(d: { category_id?: string | null; title: string; body: string }, needsCategory = true) {
  const errs: ('category' | 'title' | 'body')[] = [];
  if (needsCategory && !d.category_id) errs.push('category');
  const title = d.title.trim().length;
  if (title < TITLE_MIN || title > TITLE_MAX) errs.push('title');
  const body = d.body.trim().length;
  if (body < BODY_MIN || body > BODY_MAX) errs.push('body');
  return errs;
}

/** Endereços que já são páginas do fórum. */
export const RESERVED_SLUGS = ['topico'];

/** O que falta numa seção do Admin: nome, endereço válido e sem repetir. */
export function categoryErrors(d: Pick<CategoryDraft, 'name' | 'slug'>, others: Pick<AdminForumCategory, 'id' | 'slug'>[], selfId: string | null) {
  const errs: ('name' | 'slug' | 'slug_taken')[] = [];
  if (!d.name.trim()) errs.push('name');
  const slug = d.slug.trim();
  if (!SLUG_RE.test(slug) || slug.length > 80) errs.push('slug');
  else if (RESERVED_SLUGS.includes(slug) || others.some((o) => o.slug === slug && o.id !== selfId)) errs.push('slug_taken');
  return errs;
}

/** Endereço curto a partir do nome (sem acentos, só letras, números e hífens). */
export function forumSlug(name: string): string {
  return String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

/** Iniciais para o avatar (uma ou duas letras). */
export function initials(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = [...parts[0]][0] ?? '';
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] ?? '' : '';
  return (first + last).toLocaleUpperCase();
}

/** Minutos que ainda restam para editar (0 quando o prazo acabou). */
export function editMinutesLeft(createdAt: string, editMinutes: number, now = new Date()): number {
  const left = new Date(createdAt).getTime() + editMinutes * 60_000 - now.getTime();
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

export const pageCount = (total: number, size = FORUM_PAGE_SIZE) => Math.max(1, Math.ceil(Math.max(total, 0) / size));

/** "há 5 minutos", "ontem", "em 3 dias" na língua do visitante (Intl). Mais de 30 dias: a data. */
export function relativeTime(iso: string, locale: string, now = new Date()): string {
  const diff = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 30 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
