// Deixar avaliação da loja (/deixar-avaliacao): grava em home_section_items como depoimento pendente
// (status "pending", inativo), que a loja aprova no Admin. Nota por estrelas acessível (grupo de rádio).
import { STORE_DEFAULTS } from "@/config/store";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageShell, PageIntro, StatusCard, StarRatingInput, FieldLabel } from '@/components/institutional/ui';
import { btnPrimary, btnSecondary, card, field, textarea, appear } from '@/components/institutional/styles';
import { supabase } from '@/integrations/supabase/client';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { reviewMessages } from '@/i18n/pages';
import { cn } from '@/lib/utils';

const MIN_BODY = 15;
// O formulário usa noValidate (mensagens próprias), por isso o formato do e-mail opcional é conferido aqui.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = { author_name: '', author_role: '', author_location: '', submitter_email: '', rating: 5, body: '' };

const LeaveReview = () => {
  const { t } = useMessages(reviewMessages);
  const { data: info } = useStoreInfo();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const name = info?.name || STORE_DEFAULTS.name;

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.submitter_email.trim();
    const badName = !form.author_name.trim();
    const badEmail = !!email && !EMAIL_RE.test(email);
    const badBody = form.body.trim().length < MIN_BODY;
    if (badName || badEmail || badBody) {
      setInvalid(true);
      toast.error(badEmail && !badName && !badBody ? t('errLeaveEmail') : t('errLeave', { min: MIN_BODY }));
      document.getElementById(badName ? 'lr-name' : badEmail ? 'lr-email' : 'lr-body')?.focus();
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).from('home_section_items').insert([{
      section_key: 'testimonials',
      kind: 'testimonial',
      status: 'pending',
      is_active: false,
      display_order: 999,
      author_name: form.author_name.trim(),
      author_role: form.author_role.trim() || null,
      author_location: form.author_location.trim() || null,
      submitter_email: email || null,
      rating: form.rating,
      body: form.body.trim(),
    }]);
    setSubmitting(false);
    if (error) { toast.error(t('toastError')); return; }
    setDone(true);
    toast.success(t('toastSent'));
  };

  const nameMissing = invalid && !form.author_name.trim();
  const emailBad = invalid && !!form.submitter_email.trim() && !EMAIL_RE.test(form.submitter_email.trim());
  const bodyShort = invalid && form.body.trim().length < MIN_BODY;

  return (
    <PageShell>
      <Helmet>
        <title>{`${t('lrSeoTitle')} | ${name}`}</title>
        <meta name="description" content={t('lrSeoDescription', { name })} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="shell max-w-3xl">
        {done ? (
          <div className="pt-10 md:pt-16">
            <StatusCard Icon={CheckCircle2} tone="success" title={t('lrDoneTitle')} text={t('lrDoneText')}>
              <Link to="/" className={btnPrimary}>{t('backHome')}</Link>
              <button type="button" className={btnSecondary} onClick={() => { setDone(false); setInvalid(false); setForm(EMPTY); }}>{t('sendAnother')}</button>
            </StatusCard>
          </div>
        ) : (
          <>
            <PageIntro crumbs={[{ label: t('home'), href: '/' }, { label: t('lrSeoTitle') }]} kicker={t('lrEyebrow')} title={t('lrTitle')} lead={t('lrLead')} />
            <motion.form {...appear(1)} onSubmit={submit} noValidate className={cn(card, 'mt-8 space-y-6 p-6 sm:p-8')}>
              <StarRatingInput value={form.rating} onChange={(n) => set('rating', n)} />

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="lr-name">{t('fName')}</FieldLabel>
                  <Input id="lr-name" autoComplete="name" required maxLength={100} className={field} value={form.author_name} onChange={(e) => set('author_name', e.target.value)} placeholder={t('fNamePh')} aria-invalid={nameMissing} aria-describedby={nameMissing ? 'lr-name-err' : undefined} />
                  {nameMissing && <p id="lr-name-err" role="alert" className="mt-1.5 text-[13px] text-destructive">{t('errLeaveName')}</p>}
                </div>
                <div>
                  <FieldLabel htmlFor="lr-email" optional={t('optional')}>{t('fEmail')}</FieldLabel>
                  <Input id="lr-email" type="email" inputMode="email" autoComplete="email" maxLength={255} className={field} value={form.submitter_email} onChange={(e) => set('submitter_email', e.target.value)} placeholder={t('fEmailPh')} aria-invalid={emailBad} aria-describedby={emailBad ? 'lr-email-err lr-email-hint' : 'lr-email-hint'} />
                  {emailBad && <p id="lr-email-err" role="alert" className="mt-1.5 text-[13px] text-destructive">{t('errLeaveEmail')}</p>}
                  <p id="lr-email-hint" className="mt-1.5 text-[13px] text-muted-foreground">{t('fEmailHint')}</p>
                </div>
                <div>
                  <FieldLabel htmlFor="lr-role" optional={t('optional')}>{t('fRole')}</FieldLabel>
                  <Input id="lr-role" maxLength={100} className={field} value={form.author_role} onChange={(e) => set('author_role', e.target.value)} placeholder={t('fRolePh')} />
                </div>
                <div>
                  <FieldLabel htmlFor="lr-loc" optional={t('optional')}>{t('fLocation')}</FieldLabel>
                  <Input id="lr-loc" autoComplete="address-level2" maxLength={100} className={field} value={form.author_location} onChange={(e) => set('author_location', e.target.value)} placeholder={t('fLocationPh')} />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="lr-body">{t('fBody')}</FieldLabel>
                <Textarea
                  id="lr-body" required rows={5} maxLength={2000} className={textarea} value={form.body}
                  onChange={(e) => set('body', e.target.value)} placeholder={t('fBodyPh')} aria-invalid={bodyShort} aria-describedby="lr-body-count"
                />
                <p id="lr-body-count" className={cn('mt-1.5 text-[13px] tabular-nums', bodyShort ? 'text-destructive' : 'text-muted-foreground')}>
                  {t('bodyCount', { count: form.body.trim().length, min: MIN_BODY })}
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <Link to="/" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[14px] font-medium text-muted-foreground transition-colors duration-150 hover:text-brand-orange-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('backHome')}
                </Link>
                <button type="submit" disabled={submitting} className={cn(btnPrimary, 'disabled:pointer-events-none disabled:opacity-70')}>
                  {submitting ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Send className="h-[18px] w-[18px]" aria-hidden="true" />}
                  {submitting ? t('sending') : t('send')}
                </button>
              </div>
            </motion.form>
          </>
        )}
      </div>
    </PageShell>
  );
};

export default LeaveReview;
