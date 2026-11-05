// Contato (/contatos): formulário (grava em contact_messages e avisa a loja por e-mail), canais reais da loja
// (e-mail e telefone de useStoreInfo, WhatsApp só se configurado no Admin), tempo de resposta e atalhos.
// Sem mapa nem morada: nada de contato inventado. Título, abertura e um texto extra (horários, morada da loja física...)
// podem vir do Admin > Páginas da loja (site_pages), por idioma.
import { STORE_DEFAULTS } from "@/config/store";
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowUpRight, CheckCircle2, Clock, HelpCircle, Loader2, Mail, MessageCircle, PackageSearch, Phone, Send, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageShell, PageIntro, FieldLabel } from '@/components/institutional/ui';
import { btnPrimary, btnSecondary, card, field, h3, linkInline, reveal, textarea } from '@/components/institutional/styles';
import { supabase } from '@/integrations/supabase/client';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useSitePage } from '@/hooks/useSitePages';
import SiteHtml from '@/components/SiteHtml';
import { hasHtmlText } from '@/lib/sitePages';
import { useVisualSettings } from '@/hooks/useVisualSettings';
import { useMessages } from '@/i18n';
import { contactMessages } from '@/i18n/pages';
import { cn } from '@/lib/utils';

const MAX = { name: 100, email: 255, subject: 150, message: 2000 } as const;
type FormKey = keyof typeof MAX;
const EMPTY: Record<FormKey, string> = { name: '', email: '', subject: '', message: '' };

type Channel = { key: string; href: string; Icon: LucideIcon; title: string; value: string; note: string; external?: boolean };

const Contact = () => {
  const { t } = useMessages(contactMessages);
  const { data: info } = useStoreInfo();
  const { data: visual } = useVisualSettings();
  const { page: custom } = useSitePage('contact');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const name = info?.name || STORE_DEFAULTS.name;
  const email = (info?.email || '').trim();
  const phone = (info?.phone || '').trim();
  const phoneDigits = phone.replace(/\D/g, '');
  // Mesma regra do botão flutuante (WhatsAppButton): só com número configurado no Admin e não desligado.
  const wa = visual?.plugins?.whatsapp;
  const waDigits = (wa?.phone || '').replace(/\D/g, '');
  const waUrl = wa?.enabled !== false && waDigits.length >= 8 ? `https://wa.me/${waDigits}` : null;

  const schema = useMemo(() => z.object({
    name: z.string().trim().min(1, t('errName')).max(MAX.name, t('errMax', { max: MAX.name })),
    email: z.string().trim().email(t('errEmail')).max(MAX.email, t('errMax', { max: MAX.email })),
    subject: z.string().trim().min(1, t('errSubject')).max(MAX.subject, t('errMax', { max: MAX.subject })),
    message: z.string().trim().min(1, t('errMessage')).max(MAX.message, t('errMax', { max: MAX.message })),
  }), [t]);

  const onChange = (k: FormKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<FormKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as FormKey;
        if (!errs[k]) errs[k] = issue.message;
      }
      setErrors(errs);
      const first = (Object.keys(MAX) as FormKey[]).find((k) => errs[k]);
      if (first) document.getElementById(`c-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('contact_messages' as any).insert(parsed.data);
    if (error) {
      setSubmitting(false);
      toast.error(t('toastError'));
      return;
    }
    // Aviso à loja por e-mail (store_settings.admin_notification_email; senão o e-mail da loja). Sem endereço, só fica gravado.
    try {
      let adminEmail = email;
      const { data: kv } = await supabase.from('store_settings' as any).select('value').eq('key', 'admin_notification_email').maybeSingle();
      const v = (kv as any)?.value;
      if (typeof v === 'string' && v.includes('@')) adminEmail = v;
      else if (v && typeof v === 'object' && typeof v.email === 'string') adminEmail = v.email;
      if (adminEmail.includes('@')) {
        await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'admin-contact-message',
            recipientEmail: adminEmail,
            templateData: parsed.data,
            idempotencyKey: `contact:${Date.now()}:${parsed.data.email.toLowerCase()}`,
          },
        });
      }
    } catch { /* o aviso por e-mail é opcional: a mensagem já está gravada */ }
    setSubmitting(false);
    toast.success(t('toastSent'));
    setForm(EMPTY);
    setSent(true);
  };

  const channels = [
    waUrl && { key: 'wa', href: waUrl, Icon: MessageCircle, title: t('chWhatsapp'), value: wa?.phone || phone, note: t('chWhatsappNote'), external: true },
    email && { key: 'email', href: `mailto:${email}`, Icon: Mail, title: t('chEmail'), value: email, note: t('chEmailNote') },
    phoneDigits.length >= 6 && { key: 'phone', href: `tel:${phone.replace(/[^\d+]/g, '')}`, Icon: Phone, title: t('chPhone'), value: phone, note: t('chPhoneNote') },
  ].filter(Boolean) as Channel[];

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const title = `${custom?.title || t('seoTitle')} | ${name}`;
  const seoDescription = custom?.seo_description || custom?.intro || t('seoDescription', { name });

  const errorFor = (k: FormKey) => errors[k] && <p id={`c-${k}-err`} role="alert" className="mt-1.5 text-[13px] text-destructive">{errors[k]}</p>;
  const describedBy = (k: FormKey) => (errors[k] ? `c-${k}-err` : undefined);

  return (
    <PageShell>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={`${origin}/contatos`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={seoDescription} />
      </Helmet>

      <div className="shell">
        <PageIntro crumbs={[{ label: t('home'), href: '/' }, { label: t('breadcrumb') }]} kicker={t('eyebrow')} title={custom?.title || t('title')} lead={custom?.intro || t('lead')} />

        {custom && hasHtmlText(custom.body) && (
          <div className={cn(card, 'mt-8 max-w-[860px] p-6 sm:p-8')}><SiteHtml html={custom.body!} /></div>
        )}

        {channels.length > 0 && (
          <ul aria-label={t('channels')} className={cn('mt-8 grid gap-3 sm:grid-cols-2', channels.length > 2 && 'lg:grid-cols-3')}>
            {channels.map(({ key, href, Icon, title: chTitle, value, note, external }, i) => (
              <motion.li key={key} {...reveal(i)}>
                <a
                  href={href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className={cn(card, 'group flex h-full items-start gap-4 p-5 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2')}
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-accent text-primary"><Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-[15px] font-semibold">
                      {chTitle}
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                    </span>
                    <span className="mt-1 block break-all text-[15px] text-foreground">{value}</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">{note}</span>
                    {external && <span className="sr-only">({t('newWindow')})</span>}
                  </span>
                </a>
              </motion.li>
            ))}
          </ul>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
          <motion.section {...reveal()} aria-labelledby="contact-form-title" className={cn(card, 'p-6 sm:p-8')}>
            {sent ? (
              <div className="py-10 text-center" role="status">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-8 w-8" strokeWidth={1.8} aria-hidden="true" /></span>
                <h2 id="contact-form-title" className="mt-6 text-[24px] font-bold tracking-[-0.03em] sm:text-[28px]">{t('sentTitle')}</h2>
                <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-muted-foreground">{t('sentText')}</p>
                <button type="button" className={cn(btnSecondary, 'mt-8')} onClick={() => setSent(false)}>{t('sendAnother')}</button>
              </div>
            ) : (
              <>
                <h2 id="contact-form-title" className="text-[24px] font-bold tracking-[-0.03em] sm:text-[28px]">{t('formTitle')}</h2>
                <p className="mt-1 text-[14px] text-muted-foreground">{t('formHint')}</p>
                <form className="mt-7 space-y-5" onSubmit={onSubmit} noValidate>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="c-name">{t('name')}</FieldLabel>
                      <Input id="c-name" autoComplete="name" className={field} value={form.name} onChange={onChange('name')} placeholder={t('namePh')} maxLength={MAX.name} required aria-invalid={!!errors.name} aria-describedby={describedBy('name')} />
                      {errorFor('name')}
                    </div>
                    <div>
                      <FieldLabel htmlFor="c-email">{t('email')}</FieldLabel>
                      <Input id="c-email" type="email" inputMode="email" autoComplete="email" className={field} value={form.email} onChange={onChange('email')} placeholder={t('emailPh')} maxLength={MAX.email} required aria-invalid={!!errors.email} aria-describedby={describedBy('email')} />
                      {errorFor('email')}
                    </div>
                  </div>
                  <div>
                    <FieldLabel htmlFor="c-subject">{t('subject')}</FieldLabel>
                    <Input id="c-subject" className={field} value={form.subject} onChange={onChange('subject')} placeholder={t('subjectPh')} maxLength={MAX.subject} required aria-invalid={!!errors.subject} aria-describedby={describedBy('subject')} />
                    {errorFor('subject')}
                  </div>
                  <div>
                    <FieldLabel htmlFor="c-message">{t('message')}</FieldLabel>
                    <Textarea id="c-message" className={textarea} value={form.message} onChange={onChange('message')} placeholder={t('messagePh')} rows={6} maxLength={MAX.message} required aria-invalid={!!errors.message} aria-describedby={[describedBy('message'), 'c-message-count'].filter(Boolean).join(' ')} />
                    <div className="mt-1.5 flex justify-between gap-3 text-[13px] text-muted-foreground">
                      {errors.message ? <span id="c-message-err" role="alert" className="text-destructive">{errors.message}</span> : <span />}
                      <span id="c-message-count" className="tabular-nums">{t('charCount', { count: form.message.length, max: MAX.message })}</span>
                    </div>
                  </div>
                  <button type="submit" disabled={submitting} className={cn(btnPrimary, 'w-full disabled:pointer-events-none disabled:opacity-70 sm:w-auto')}>
                    {submitting ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Send className="h-[18px] w-[18px]" aria-hidden="true" />}
                    {submitting ? t('sending') : t('send')}
                  </button>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {t('privacy')} <Link to="/politica-privacidade" className={linkInline}>{t('privacyLink')}</Link>
                  </p>
                </form>
              </>
            )}
          </motion.section>

          <aside className="space-y-4">
            <motion.div {...reveal(1)} className={cn(card, 'flex gap-4 p-6')}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-alt text-brand-ink-soft"><Clock className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h3 className={h3}>{t('responseTitle')}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{t('responseText')}</p>
              </div>
            </motion.div>
            <motion.div {...reveal(2)} className={cn(card, 'p-6')}>
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-accent text-primary"><HelpCircle className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
                <div>
                  <h3 className={h3}>{t('faqTitle')}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{t('faqText')}</p>
                </div>
              </div>
              <Link to="/faq" className={cn(btnSecondary, 'mt-5 w-full')}>{t('faqCta')}</Link>
            </motion.div>
            <motion.div {...reveal(3)} className={cn(card, 'p-6')}>
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-accent text-primary"><PackageSearch className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" /></span>
                <div>
                  <h3 className={h3}>{t('trackTitle')}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{t('trackText')}</p>
                </div>
              </div>
              <Link to="/rastrear" className={cn(btnSecondary, 'mt-5 w-full')}>{t('trackCta')}</Link>
            </motion.div>
          </aside>
        </div>
      </div>
    </PageShell>
  );
};

export default Contact;
