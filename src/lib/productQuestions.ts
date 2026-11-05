// =====================================================================================
// Perguntas e respostas no produto (recurso product_questions, migration 20261008120000_product_questions.sql).
//   Cliente com conta pergunta pela RPC ask_product_question; lê pela RPC product_questions_public (publicadas e as
//   próprias à espera). A loja responde em Admin > Clientes > Perguntas dos clientes (AdminProductQuestions).
//   Regras em store_settings.product_questions (ask, perPage, style). Códigos de erro estáveis abaixo.
// Sem imports com @/ para o teste em node (scripts/test-product-questions.mjs).
// =====================================================================================

/** full = seção aberta com a lista e o campo; discreet = uma linha "Perguntas e respostas (N)" que abre a seção. */
export type QuestionsStyle = 'full' | 'discreet';

export type ProductQuestionsSettings = { ask: boolean; perPage: number; style: QuestionsStyle };

export const DEFAULT_PRODUCT_QUESTIONS: ProductQuestionsSettings = { ask: true, perPage: 5, style: 'full' };

export function normalizeProductQuestions(raw: unknown): ProductQuestionsSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const n = Number(r.perPage);
  return {
    ask: typeof r.ask === 'boolean' ? r.ask : DEFAULT_PRODUCT_QUESTIONS.ask,
    perPage: Number.isFinite(n) ? Math.min(20, Math.max(1, Math.round(n))) : DEFAULT_PRODUCT_QUESTIONS.perPage,
    style: r.style === 'discreet' ? 'discreet' : 'full',
  };
}

export const QUESTION_MIN = 5;
export const QUESTION_MAX = 1000;
export const ANSWER_MAX = 3000;

export const QUESTION_ERRORS = ['feature_off', 'auth_required', 'asking_off', 'not_found', 'invalid', 'too_many'] as const;
export type QuestionError = (typeof QUESTION_ERRORS)[number] | 'unknown';

/** Código estável a partir da mensagem de erro da RPC. */
export function questionError(message: string | null | undefined): QuestionError {
  const m = String(message ?? '');
  return QUESTION_ERRORS.find((c) => m.includes(c)) ?? 'unknown';
}

export type PublicQuestion = {
  id: string; author_name: string | null; question: string; answer: string | null;
  answered_at: string | null; created_at: string; pending: boolean; mine: boolean;
};

export function parsePublicQuestions(raw: unknown): { total: number; items: PublicQuestion[] } {
  const r = raw && typeof raw === 'object' ? (raw as { total?: unknown; items?: unknown }) : {};
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    total: Number(r.total) || 0,
    items: items.filter((x): x is PublicQuestion => !!x && typeof x === 'object' && typeof (x as PublicQuestion).id === 'string' && typeof (x as PublicQuestion).question === 'string'),
  };
}
