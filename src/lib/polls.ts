// =============================================================================================
// Enquetes (recurso polls; Admin > Aparência e conteúdo > Enquetes, página /enquetes e bloco na página inicial).
// Regras no banco (migration 20261007170000_polls.sql): o site lê por site_polls e vota por vote_poll; o servidor
// confere quem vota, quantas respostas e se a enquete está aberta, e só manda o resultado quando a regra deixa.
// Aqui: tipos, estados mostrados no Admin, percentagens e o que falta numa enquete. Sem imports.
// Teste: node --experimental-strip-types scripts/test-polls.mjs
// =============================================================================================

export type PollLocale = 'pt-BR' | 'pt-PT' | 'en' | 'es';
export type PollStatus = 'draft' | 'open' | 'closed';
/** Quando o resultado aparece no site. */
export type PollResults = 'after_vote' | 'always' | 'after_close' | 'hidden';
/** Estado mostrado no Admin: agendada = aberta com início no futuro; terminada = aberta com o fim já passado. */
export type PollState = 'draft' | 'scheduled' | 'open' | 'ended' | 'closed';

export const POLL_PATH = '/enquetes';
export const POLL_LOCALES: PollLocale[] = ['pt-BR', 'pt-PT', 'en', 'es'];
export const POLL_RESULTS: PollResults[] = ['after_vote', 'always', 'after_close', 'hidden'];
export const MAX_POLL_OPTIONS = 20;

/** Enquete como o site a recebe de site_polls / vote_poll (total e counts nulos = resultado ainda escondido). */
export type SitePoll = {
  id: string;
  title: string;
  description: string | null;
  locale: PollLocale | null;
  max_choices: number;
  guests: boolean;
  results: PollResults;
  show_on_home: boolean;
  ends_at: string | null;
  open: boolean;
  options: { id: string; label: string }[];
  voted: boolean;
  mine: string[];
  total: number | null;
  counts: Record<string, number> | null;
};

export type PollOption = { id: string; poll_id: string; label: string; position: number };

export type Poll = {
  id: string;
  title: string;
  description: string | null;
  locale: PollLocale | null;
  status: PollStatus;
  starts_at: string | null;
  ends_at: string | null;
  max_choices: number;
  guests: boolean;
  results: PollResults;
  show_on_home: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  options: PollOption[];
};

export type PollStats = { total: number; accounts: number; guests: number; last: string | null; counts: Record<string, number> };
export const EMPTY_POLL_STATS: PollStats = { total: 0, accounts: 0, guests: 0, last: null, counts: {} };

export const POLL_ERRORS = ['feature_off', 'not_found', 'closed', 'auth_required', 'invalid', 'already_voted'] as const;
export type PollError = (typeof POLL_ERRORS)[number] | 'unknown';
export const pollErrorOf = (message: unknown): PollError => {
  const m = String(message ?? '');
  return [...POLL_ERRORS].sort((a, b) => b.length - a.length).find((c) => m.includes(c)) ?? 'unknown';
};

export function pollState(p: Pick<Poll, 'status' | 'starts_at' | 'ends_at'>, now = new Date()): PollState {
  if (p.status === 'draft') return 'draft';
  if (p.status === 'closed') return 'closed';
  const t = now.getTime();
  if (p.starts_at && new Date(p.starts_at).getTime() > t) return 'scheduled';
  if (p.ends_at && new Date(p.ends_at).getTime() <= t) return 'ended';
  return 'open';
}

/** Enquete aparece para o idioma do visitante (sem idioma = todos). */
export const pollForLocale = (p: Pick<SitePoll, 'locale'>, locale: string) => !p.locale || p.locale === locale;

/**
 * Percentagem de cada resposta sobre o número de votos, arredondada a inteiros. Com uma resposta por pessoa a
 * soma fecha em 100 (maiores restos); com várias, cada barra é a parte de pessoas que marcou aquela resposta.
 */
export function pollPercents(counts: Record<string, number>, ids: string[], total: number, single: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (total <= 0) {
    for (const id of ids) out[id] = 0;
    return out;
  }
  const raw = ids.map((id) => ({ id, v: ((counts[id] ?? 0) / total) * 100 }));
  for (const r of raw) out[r.id] = Math.floor(r.v);
  if (single) {
    const sum = ids.reduce((s, id) => s + (counts[id] ?? 0), 0);
    if (sum === total) {
      let left = 100 - raw.reduce((s, r) => s + Math.floor(r.v), 0);
      for (const r of [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || b.v - a.v)) {
        if (left <= 0) break;
        if (r.v - Math.floor(r.v) > 0) { out[r.id] += 1; left -= 1; }
      }
    }
  } else {
    for (const r of raw) out[r.id] = Math.round(r.v);
  }
  return out;
}

/** Resposta (ou respostas) com mais votos; vazio sem votos. */
export function pollLeaders(counts: Record<string, number>, ids: string[]): string[] {
  const max = Math.max(0, ...ids.map((id) => counts[id] ?? 0));
  return max > 0 ? ids.filter((id) => (counts[id] ?? 0) === max) : [];
}

/** Pode marcar mais uma resposta? (rádio quando max_choices = 1). */
export function togglePollChoice(picked: string[], id: string, max: number): string[] {
  if (max <= 1) return [id];
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  return picked.length >= max ? picked : [...picked, id];
}

export type PollDraft = Omit<Poll, 'id' | 'created_at' | 'updated_at' | 'options'> & {
  /** Respostas do formulário: id existente ou null (nova). */
  options: { id: string | null; label: string }[];
};

export const EMPTY_POLL_DRAFT: PollDraft = {
  title: '', description: null, locale: null, status: 'draft', starts_at: null, ends_at: null, max_choices: 1,
  guests: false, results: 'after_vote', show_on_home: true, position: 0,
  options: [{ id: null, label: '' }, { id: null, label: '' }],
};

/** O que falta na enquete (chaves de texto do Admin). Abrir pede pelo menos duas respostas. */
export function pollDraftErrors(d: Pick<PollDraft, 'title' | 'options' | 'starts_at' | 'ends_at' | 'max_choices' | 'status'>) {
  const errs: ('title' | 'options' | 'dupe' | 'dates' | 'choices')[] = [];
  if (!d.title.trim()) errs.push('title');
  const labels = d.options.map((o) => o.label.trim().toLowerCase()).filter(Boolean);
  if ((d.status !== 'draft' && labels.length < 2) || labels.length > MAX_POLL_OPTIONS) errs.push('options');
  if (new Set(labels).size !== labels.length) errs.push('dupe');
  if (d.starts_at && d.ends_at && new Date(d.ends_at).getTime() <= new Date(d.starts_at).getTime()) errs.push('dates');
  if (d.max_choices < 1 || d.max_choices > Math.max(1, labels.length)) errs.push('choices');
  return errs;
}
