// Perguntas e respostas na página do produto (recurso product_questions, regras em src/lib/productQuestions.ts).
// Lista as publicadas (e as do próprio cliente à espera) e um campo para perguntar, só com conta.
// Estilo completo (seção aberta) ou discreto (uma linha que abre a seção), escolhido em Admin > Perguntas dos clientes.
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Clock, Loader2, MessageCircleQuestion, Store } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useFeature } from '@/hooks/useFeatures';
import { useProductQuestionsSettings } from '@/hooks/useOfferSettings';
import { useAskQuestion, useProductQuestions } from '@/hooks/useProductQuestions';
import { useMessages } from '@/i18n';
import { productQuestionsMessages, type ProductQuestionsKey } from '@/i18n/productQuestions';
import { QUESTION_MAX, QUESTION_MIN, type QuestionError } from '@/lib/productQuestions';
import { cn } from '@/lib/utils';

export function ProductQuestions({ productId, returnPath }: { productId: string; returnPath: string }) {
  const on = useFeature('product_questions');
  const { data: settings } = useProductQuestionsSettings();
  const enabled = on && !!settings;
  const q = useProductQuestions(productId, settings?.perPage ?? 5, enabled);
  const { t } = useMessages(productQuestionsMessages);
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!enabled || !settings) return null;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  // Sem perguntas e sem poder perguntar: nada a mostrar.
  if (!q.isLoading && !items.length && !settings.ask) return null;

  const body = (
    <div id={bodyId} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
      <div>
        {q.isLoading ? (
          <div className="space-y-3" aria-hidden="true">{[0, 1].map((i) => <div key={i} className="skeleton h-24 rounded-[18px]" />)}</div>
        ) : items.length ? (
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className="rounded-[18px] border border-brand-card-border bg-white p-5">
                <p className="flex items-start gap-2.5 text-[16px] font-semibold leading-snug">
                  <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                  <span className="min-w-0 whitespace-pre-line break-words">{it.question}</span>
                </p>
                <p className="mt-1 pl-[30px] text-[13px] text-muted-foreground">{it.mine ? t('yours') : it.author_name || t('someone')}</p>
                {it.answer ? (
                  <div className="mt-3 rounded-[14px] bg-brand-alt p-4">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-orange-text"><Store className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t('answer_by')}</p>
                    <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-brand-ink-soft">{it.answer}</p>
                  </div>
                ) : it.pending ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-brand-orange-text">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t('pending')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[18px] border border-dashed border-brand-card-border bg-white p-6 text-[15px] text-muted-foreground">{t('empty')}</p>
        )}
        {q.hasNextPage && (
          <button type="button" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold transition-colors duration-150 hover:border-primary hover:text-brand-orange-text">
            {q.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('more')}
          </button>
        )}
      </div>
      {settings.ask && <AskForm productId={productId} returnPath={returnPath} />}
    </div>
  );

  return (
    <section id="perguntas" className="mt-14 scroll-mt-28 md:mt-16" aria-labelledby="pdp-qa-title">
      {settings.style === 'full' ? (
        <>
          <h2 id="pdp-qa-title" className="text-[26px] leading-tight md:text-[30px]">{t('title')}</h2>
          <p className="mt-2 max-w-2xl text-[16px] text-brand-ink-soft">{t('subtitle')}</p>
          {body}
        </>
      ) : (
        <>
          <h2 id="pdp-qa-title" className="sr-only">{t('title')}</h2>
          <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}
            className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[18px] border border-brand-card-border bg-white px-5 text-left text-[16px] font-semibold transition-colors duration-150 hover:text-brand-orange-text">
            <span className="flex items-center gap-2.5"><MessageCircleQuestion className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />{total ? t('open', { count: total }) : t('open_empty')}</span>
            <ChevronDown className={cn('h-5 w-5 transition-transform duration-200', open && 'rotate-180')} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                {body}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  );
}

function AskForm({ productId, returnPath }: { productId: string; returnPath: string }) {
  const { t, locale } = useMessages(productQuestionsMessages);
  const { user } = useAuth();
  const ask = useAskQuestion(productId);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<QuestionError | null>(null);
  const id = useId();
  const len = text.trim().length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (len < QUESTION_MIN || len > QUESTION_MAX) { setErr('invalid'); return; }
    setErr(null);
    try {
      await ask.mutateAsync({ question: text.trim(), locale });
      setText(''); setSent(true);
    } catch (e2) {
      setErr(((e2 as Error).message as QuestionError) || 'unknown');
    }
  };

  return (
    <div className="h-fit rounded-[20px] border border-brand-card-border bg-white p-5 lg:sticky lg:top-28">
      {!user ? (
        <div>
          <p className="text-[15px] text-brand-ink-soft">{t('ask_login')}</p>
          <Link to={`/auth?redirect=${encodeURIComponent(`${returnPath}#perguntas`)}`}
            className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold transition-colors duration-150 hover:border-primary hover:text-brand-orange-text">
            {t('ask_login_cta')}
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate>
          <label htmlFor={id} className="block text-[15px] font-semibold">{t('ask_label')}</label>
          <textarea id={id} value={text} rows={4} maxLength={QUESTION_MAX} placeholder={t('ask_placeholder')}
            onChange={(e) => { setText(e.target.value); setErr(null); setSent(false); }}
            aria-invalid={!!err} aria-describedby={`${id}-help`}
            className="mt-2 w-full resize-y rounded-[14px] border border-input bg-white p-3 text-[15px] outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring" />
          <p id={`${id}-help`} className="mt-1 flex justify-between gap-3 text-[12px] text-muted-foreground" aria-live="polite">
            <span className={cn(err && 'text-destructive', sent && 'text-emerald-700')}>{err ? t(`err_${err}` as ProductQuestionsKey) : sent ? t('ask_sent') : ''}</span>
            <span className="tabular-nums">{t('ask_count', { n: len, max: QUESTION_MAX })}</span>
          </p>
          <button type="submit" disabled={ask.isPending || len < QUESTION_MIN}
            className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60">
            {ask.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{ask.isPending ? t('ask_sending') : t('ask_send')}
          </button>
        </form>
      )}
    </div>
  );
}
