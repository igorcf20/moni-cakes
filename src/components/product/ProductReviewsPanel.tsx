// Avaliações reais (product_reviews_public, só aprovadas): resumo com distribuição, lista e formulário
// para clientes com sessão (useReviews.addReview grava com approved:false, a loja aprova no Admin).
// Filtros: clicar numa linha de estrelas mostra só essa nota; o botão Com fotos mostra só as que têm foto.
// Foto no formulário só quando a loja permite (Admin > Avaliações, useReviewSettings).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, BadgeCheck, Camera, CheckCircle2, ImagePlus, MessageSquarePlus, RefreshCw, Star, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useReviews } from '@/hooks/useReviews';
import { REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_TYPES, uploadReviewPhoto, useReviewSettings } from '@/hooks/useReviewSettings';
import { useMessages } from '@/i18n';
import { productMessages, type ProductMessages } from '@/i18n/product';
import { cn } from '@/lib/utils';
import { RatingStars } from './RatingStars';

const PAGE = 6;
const field = 'w-full rounded-[14px] border border-border bg-white px-4 text-[16px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[var(--shadow-ring-royal)]';

export function ProductReviewsPanel({ productId, returnPath }: { productId: string; returnPath: string }) {
  const { t, locale } = useMessages(productMessages);
  const { user } = useAuth();
  const { reviews, isLoading, averageRating, totalReviews, addReview, isAdding } = useReviews(productId);
  // useReviews não expõe o erro: lê o estado da mesma consulta (['reviews', id]) na cache, sem outro observador
  // (um segundo useQuery trocaria as opções da consulta, incluindo a função de busca).
  const queryClient = useQueryClient();
  const subscribe = useCallback((cb: () => void) => queryClient.getQueryCache().subscribe(cb), [queryClient]);
  const failed = useSyncExternalStore(subscribe, () => queryClient.getQueryState(['reviews', productId])?.status === 'error');
  const loadFailed = failed && !reviews.length;
  const [shown, setShown] = useState(PAGE);
  const [formOpen, setFormOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [photosOnly, setPhotosOnly] = useState(false);
  const { data: reviewSettings } = useReviewSettings();

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }), [locale]);
  const avgFmt = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale]);
  const dist = useMemo(() => [5, 4, 3, 2, 1].map((n) => {
    const count = reviews.filter((r) => Math.round(Number(r.rating)) === n).length;
    return { n, count, pct: totalReviews ? Math.round((count / totalReviews) * 100) : 0 };
  }), [reviews, totalReviews]);
  const photoCount = useMemo(() => reviews.filter((r) => !!r.image_url).length, [reviews]);
  const filtered = useMemo(() => reviews.filter((r) =>
    (stars === null || Math.round(Number(r.rating)) === stars) && (!photosOnly || !!r.image_url),
  ), [reviews, stars, photosOnly]);
  const filtering = stars !== null || photosOnly;
  useEffect(() => { setShown(PAGE); }, [stars, photosOnly]);

  const writeAction = user ? (
    !formOpen && !sent && (
      <button type="button" onClick={() => setFormOpen(true)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:border-primary hover:text-brand-orange-text">
        <MessageSquarePlus className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('writeReview')}
      </button>
    )
  ) : (
    <Link to={`/auth?redirect=${encodeURIComponent(`${returnPath}#avaliacoes`)}`} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-border bg-white px-5 text-[15px] font-semibold text-foreground transition-colors duration-150 hover:border-primary hover:text-brand-orange-text">
      <MessageSquarePlus className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('signInToReview')}
    </Link>
  );

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]" role="status" aria-label={t('reviewsLoading')}>
        <div className="skeleton h-40 rounded-[18px]" />
        <div className="space-y-3"><div className="skeleton h-24 rounded-[18px]" /><div className="skeleton h-24 rounded-[18px]" /></div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10">
      {/* Resumo */}
      <div className="space-y-5">
        {loadFailed ? (
          <div role="alert">
            <p className="flex items-start gap-2 text-[16px] font-semibold text-foreground">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={1.8} aria-hidden="true" />{t('reviewsError')}
            </p>
            <button
              type="button"
              onClick={() => void queryClient.refetchQueries({ queryKey: ['reviews', productId], exact: true })}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t('retry')}
            </button>
          </div>
        ) : totalReviews > 0 ? (
          <>
            <div>
              <p className="text-[44px] font-[780] leading-none tracking-[-0.03em] tabular-nums">{avgFmt.format(averageRating)}</p>
              <RatingStars value={averageRating} size="lg" className="mt-2" />
              <p className="mt-2 text-sm text-muted-foreground">{totalReviews === 1 ? t('basedOn_one') : t('basedOn_other', { count: totalReviews })}</p>
              <span className="sr-only">{t('ratingLabel', { value: avgFmt.format(averageRating) })}</span>
            </div>
            <ul className="space-y-0.5">
              {dist.map((d) => {
                const active = stars === d.n;
                return (
                  <li key={d.n}>
                    <button
                      type="button"
                      disabled={d.count === 0}
                      aria-pressed={active}
                      onClick={() => setStars(active ? null : d.n)}
                      className={cn(
                        'flex w-full min-h-[32px] items-center gap-2.5 rounded-lg px-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60',
                        active ? 'bg-accent' : 'enabled:hover:bg-brand-alt',
                      )}
                    >
                      <span className="sr-only">{t('starsFilter', { count: d.n, pct: d.pct })}</span>
                      <span className={cn('flex w-7 items-center gap-0.5 tabular-nums', active ? 'font-semibold text-foreground' : 'text-brand-ink-soft')} aria-hidden="true">{d.n}<Star className="h-3 w-3 fill-primary text-primary" strokeWidth={1.7} /></span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-alt" aria-hidden="true">
                        <span className="block h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${d.pct}%` }} />
                      </span>
                      <span className="w-9 text-right tabular-nums text-muted-foreground" aria-hidden="true">{d.pct}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {photoCount > 0 && (
              <button
                type="button"
                aria-pressed={photosOnly}
                onClick={() => setPhotosOnly((v) => !v)}
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border px-4 text-[14px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  photosOnly ? 'border-primary bg-accent text-brand-orange-text' : 'border-border bg-white text-foreground hover:border-primary',
                )}
              >
                <Camera className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden="true" />{t('withPhotos', { count: photoCount })}
              </button>
            )}
          </>
        ) : (
          <div>
            <p className="text-[17px] font-semibold">{t('reviewsEmpty')}</p>
            <p className="mt-1.5 text-[15px] text-brand-ink-soft">{t('reviewsEmptyHint')}</p>
          </div>
        )}
        {writeAction}
      </div>

      {/* Formulário e lista */}
      <div className="min-w-0 space-y-4">
        <AnimatePresence initial={false}>
          {sent && (
            <motion.p key="thanks" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="flex items-start gap-2.5 rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-[15px] text-emerald-900" role="status">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={1.8} aria-hidden="true" />{t('formThanks')}
            </motion.p>
          )}
          {formOpen && user && (
            <motion.div key="form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
              <ReviewForm
                userId={user.id}
                allowPhoto={!!reviewSettings?.customer_photos}
                busy={isAdding}
                onCancel={() => setFormOpen(false)}
                onSubmit={(v) => addReview({ ...v, user_id: user.id }, { onSuccess: () => { setFormOpen(false); setSent(true); } })}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {filtering && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-brand-alt px-4 py-2.5 text-[14px]" role="status">
            <span className="text-brand-ink-soft">
              {stars !== null && photosOnly ? t('filterStarsPhotos', { stars, count: filtered.length })
                : stars !== null ? t('filterStars', { stars, count: filtered.length })
                : t('filterPhotos', { count: filtered.length })}
            </span>
            <button type="button" onClick={() => { setStars(null); setPhotosOnly(false); }} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent">
              <X className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t('filterClear')}
            </button>
          </div>
        )}
        {filtering && filtered.length === 0 && <p className="text-[15px] text-brand-ink-soft">{t('filterEmpty')}</p>}
        {filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.slice(0, shown).map((r) => {
              const name = r.user_profiles?.display_name || r.customer_name || t('anonymous');
              const rating = Number(r.rating) || 0;
              return (
                <li key={r.id}>
                  <article className="rounded-[18px] border border-brand-card-border bg-background p-4 md:p-5">
                    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span className="flex items-center gap-2">
                        <RatingStars value={rating} size="sm" />
                        <span className="sr-only">{t('ratingLabel', { value: rating })}</span>
                      </span>
                      <time dateTime={r.created_at} className="text-[13px] text-muted-foreground">{safeDate(dateFmt, r.created_at)}</time>
                    </header>
                    {r.title && <h3 className="mt-2 text-[16px] font-semibold tracking-[-0.01em]">{r.title}</h3>}
                    {r.comment && <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-brand-ink-soft">{r.comment}</p>}
                    {r.image_url && (
                      <a href={r.image_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block overflow-hidden rounded-xl border border-brand-card-border">
                        <img src={r.image_url} alt={t('reviewPhoto', { name })} loading="lazy" className="h-24 w-24 object-cover" />
                      </a>
                    )}
                    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span className="font-medium text-foreground">{name}</span>
                      {r.verified && (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t('verifiedPurchase')}
                        </span>
                      )}
                      {r.source && r.source !== 'site' && (
                        <span className="text-muted-foreground">{t('receivedVia', { source: t(`rsrc_${r.source}` as keyof ProductMessages) })}</span>
                      )}
                    </p>
                    {r.admin_reply && (
                      <div className="mt-3 rounded-[14px] bg-muted/60 px-3.5 py-3">
                        <p className="text-[13px] font-semibold text-foreground">{t('storeReply')}</p>
                        <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-brand-ink-soft">{r.admin_reply}</p>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-semibold text-brand-orange-text transition-colors duration-150 hover:bg-accent">
            {t('moreReviews')}
          </button>
        )}
      </div>
    </div>
  );
}

const safeDate = (fmt: Intl.DateTimeFormat, iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : fmt.format(d);
};

function ReviewForm({ userId, allowPhoto, busy, onSubmit, onCancel }: {
  userId: string;
  allowPhoto: boolean;
  busy: boolean;
  onSubmit: (v: { rating: number; title: string; comment?: string; image_url?: string | null }) => void;
  onCancel: () => void;
}) {
  const { t } = useMessages(productMessages);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const shownRating = hover || rating;

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!REVIEW_PHOTO_TYPES.includes(file.type)) return setError(t('formPhotoType'));
    if (file.size > REVIEW_PHOTO_MAX_BYTES) return setError(t('formPhotoTooBig'));
    setError(null);
    setPhoto(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) return setError(t('formNeedRating'));
    if (title.trim().length < 3) return setError(t('formNeedTitle'));
    setError(null);
    let image_url: string | null = null;
    if (allowPhoto && photo) {
      setUploading(true);
      try {
        image_url = await uploadReviewPhoto(userId, photo);
      } catch {
        setUploading(false);
        return setError(t('formPhotoError'));
      }
      setUploading(false);
    }
    onSubmit({ rating, title: title.trim().slice(0, 120), comment: comment.trim().slice(0, 2000) || undefined, image_url });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[18px] border border-brand-card-border bg-background p-4 md:p-5" noValidate>
      <fieldset>
        <legend className="mb-2 text-[15px] font-semibold">{t('formRating')}</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n} type="button" onClick={() => { setRating(n); setError(null); }} onMouseEnter={() => setHover(n)} aria-pressed={rating === n}
              aria-label={n === 1 ? t('formRateN_one') : t('formRateN_other', { count: n })}
              className="grid h-11 w-11 place-items-center rounded-xl transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star className={cn('h-7 w-7 transition-colors duration-150', shownRating >= n ? 'fill-primary text-primary' : 'text-border')} strokeWidth={1.7} />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold">{t('formTitle')}</span>
        <input value={title} onChange={(e) => { setTitle(e.target.value); setError(null); }} maxLength={120} placeholder={t('formTitlePlaceholder')} className={cn(field, 'h-12')} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[15px] font-semibold">{t('formComment')}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={4} placeholder={t('formCommentPlaceholder')} className={cn(field, 'resize-y py-3')} />
      </label>
      {allowPhoto && (
        <div>
          <span className="mb-1.5 block text-[15px] font-semibold">{t('formPhoto')}</span>
          {preview ? (
            <div className="flex items-center gap-3">
              <img src={preview} alt="" className="h-20 w-20 rounded-xl border border-brand-card-border object-cover" />
              <button type="button" onClick={() => setPhoto(null)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-brand-ink-soft transition-colors duration-150 hover:bg-brand-alt">
                <X className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />{t('formPhotoRemove')}
              </button>
            </div>
          ) : (
            <label className="inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-[14px] border border-dashed border-border bg-white px-4 text-[15px] font-medium text-foreground transition-colors duration-150 hover:border-primary focus-within:ring-2 focus-within:ring-ring">
              <ImagePlus className="h-[18px] w-[18px] text-primary" strokeWidth={1.8} aria-hidden="true" />{t('formPhotoAdd')}
              <input type="file" accept={REVIEW_PHOTO_TYPES.join(',')} onChange={pickPhoto} className="sr-only" />
            </label>
          )}
          <p className="mt-1.5 text-[13px] text-muted-foreground">{t('formPhotoHint')}</p>
        </div>
      )}
      {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <button type="submit" disabled={busy || uploading} className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60">
          {busy || uploading ? t('formSending') : t('formSubmit')}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] px-5 text-[15px] font-semibold text-brand-ink-soft transition-colors duration-150 hover:bg-brand-alt">
          {t('formCancel')}
        </button>
      </div>
      <p className="text-[13px] text-muted-foreground">{t('formModeration')}</p>
    </form>
  );
}
