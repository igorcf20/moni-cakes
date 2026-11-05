// Avaliar produto (/avaliar/:orderId/:productId): confirma que o pedido é do cliente, foi entregue e tem o produto,
// e envia a avaliação pela Edge Function submit-product-review (fica pendente até a loja aprovar no Admin).
import { STORE_DEFAULTS } from "@/config/store";
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageShell, PageIntro, StatusCard, StarRatingInput, FieldLabel } from '@/components/institutional/ui';
import { btnPrimary, btnSecondary, card, field, textarea, appear } from '@/components/institutional/styles';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { reviewMessages } from '@/i18n/pages';
import { cn } from '@/lib/utils';

type RK = keyof typeof reviewMessages['pt-BR'];
type ErrKey = 'errNotFound' | 'errNotYours' | 'errNotDelivered' | 'errNotInOrder';

interface OrderCheck {
  ok: boolean;
  status?: string;
  productName?: string | null;
  reason?: ErrKey;
}

const MIN_TITLE = 3;
const MAX_TITLE = 120;
const MAX_COMMENT = 1000;

/** Códigos de erro da Edge Function submit-product-review para textos traduzidos. */
const SERVER_ERRORS: Record<string, RK> = {
  unauthorized: 'errSignIn',
  order_not_found: 'errNotFound',
  forbidden: 'errNotYours',
  order_not_delivered: 'errNotDelivered',
  product_not_in_order: 'errNotInOrder',
  already_reviewed: 'errAlready',
};

/** Código de erro da resposta: no corpo (2xx) ou no corpo da resposta de erro (FunctionsHttpError.context). */
async function serverErrorCode(data: any, error: any): Promise<string | null> {
  if (data?.error) return String(data.error);
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
  } catch { /* corpo sem JSON */ }
  return null;
}

const ReviewProduct = () => {
  const { t } = useMessages(reviewMessages);
  const { orderId = '', productId = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: info } = useStoreInfo();
  const [check, setCheck] = useState<OrderCheck | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [titleInvalid, setTitleInvalid] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/auth?redirect=/avaliar/${orderId}/${productId}`);
      return;
    }
    (async () => {
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, status, user_id')
        .eq('id', orderId)
        .maybeSingle();
      if (error || !order) {
        setCheck({ ok: false, reason: 'errNotFound' });
        return;
      }
      if (order.user_id !== user.id) {
        setCheck({ ok: false, reason: 'errNotYours' });
        return;
      }
      if (!['delivered', 'completed'].includes(order.status)) {
        setCheck({ ok: false, status: order.status, reason: 'errNotDelivered' });
        return;
      }
      const { data: item } = await supabase
        .from('order_items')
        .select('id, product_id, products(name)')
        .eq('order_id', orderId)
        .eq('product_id', productId)
        .maybeSingle();
      if (!item) {
        setCheck({ ok: false, reason: 'errNotInOrder' });
        return;
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      setName(((profile as any)?.display_name || (profile as any)?.full_name || '').toString());
      setCheck({ ok: true, productName: (item as any)?.products?.name || null });
    })();
  }, [authLoading, user, orderId, productId, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < MIN_TITLE) {
      setTitleInvalid(true);
      toast.error(t('errTitleMin', { min: MIN_TITLE }));
      document.getElementById('rp-title')?.focus();
      return;
    }
    setSubmitting(true);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const { data, error } = await supabase.functions.invoke('submit-product-review', {
      body: {
        order_id: orderId,
        product_id: productId,
        rating,
        title: title.trim(),
        comment: comment.trim() || null,
        customer_name: name.trim() || null,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (error || (data as any)?.error) {
      const code = await serverErrorCode(data, error);
      setSubmitting(false);
      toast.error(t((code && SERVER_ERRORS[code]) || 'errGeneric'));
      return;
    }
    setSubmitting(false);
    setDone(true);
    toast.success(t('toastSent'));
  };

  const storeName = info?.name || STORE_DEFAULTS.name;
  const productName = check?.productName || t('productFallback');

  let body: React.ReactNode;
  if (done) {
    body = (
      <div className="pt-10 md:pt-16">
        <StatusCard Icon={CheckCircle2} tone="success" title={t('rpDoneTitle')} text={t('rpDoneText')}>
          <Link to={`/avaliar/pedido/${orderId}`} className={btnPrimary}>{t('roSeoTitle')}</Link>
          <Link to="/dashboard?tab=pedidos" className={btnSecondary}>{t('backOrders')}</Link>
        </StatusCard>
      </div>
    );
  } else if (!check) {
    body = <div className="pt-10 md:pt-16"><StatusCard Icon={Loader2} tone="muted" busy title={t('checking')} headingLevel={2} /></div>;
  } else if (!check.ok) {
    body = (
      <div className="pt-10 md:pt-16">
        <StatusCard Icon={AlertTriangle} tone="warning" title={t('errTitle')} text={check.reason ? t(check.reason) : undefined}>
          <Link to="/dashboard?tab=pedidos" className={btnPrimary}>{t('backOrders')}</Link>
        </StatusCard>
      </div>
    );
  } else {
    body = (
      <>
        <PageIntro
          crumbs={[{ label: t('home'), href: '/' }, { label: t('myOrders'), href: '/dashboard?tab=pedidos' }, { label: t('rpSeoTitle') }]}
          kicker={t('rpEyebrow')} title={productName} lead={t('rpLead')}
        />
        <motion.form {...appear(1)} onSubmit={submit} noValidate className={cn(card, 'mt-8 space-y-6 p-6 sm:p-8')}>
          <StarRatingInput value={rating} onChange={setRating} />
          <div>
            <FieldLabel htmlFor="rp-name" optional={t('optional')}>{t('fDisplayName')}</FieldLabel>
            <Input id="rp-name" autoComplete="name" maxLength={100} className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fDisplayNamePh')} />
          </div>
          <div>
            <FieldLabel htmlFor="rp-title">{t('fTitle')}</FieldLabel>
            <Input
              id="rp-title" required maxLength={MAX_TITLE} className={field} value={title} placeholder={t('fTitlePh')}
              onChange={(e) => { setTitle(e.target.value); if (titleInvalid) setTitleInvalid(false); }}
              aria-invalid={titleInvalid} aria-describedby={titleInvalid ? 'rp-title-err' : undefined}
            />
            {titleInvalid && <p id="rp-title-err" role="alert" className="mt-1.5 text-[13px] text-destructive">{t('errTitleMin', { min: MIN_TITLE })}</p>}
          </div>
          <div>
            <FieldLabel htmlFor="rp-comment" optional={t('optional')}>{t('fComment')}</FieldLabel>
            <Textarea id="rp-comment" rows={5} maxLength={MAX_COMMENT} className={textarea} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('fCommentPh')} aria-describedby="rp-comment-count" />
            <p id="rp-comment-count" className="mt-1.5 text-right text-[13px] tabular-nums text-muted-foreground">{t('charCount', { count: comment.length, max: MAX_COMMENT })}</p>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Link to={`/avaliar/pedido/${orderId}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[14px] font-medium text-muted-foreground transition-colors duration-150 hover:text-brand-orange-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('roSeoTitle')}
            </Link>
            <button type="submit" disabled={submitting} className={cn(btnPrimary, 'disabled:pointer-events-none disabled:opacity-70')}>
              {submitting ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <Send className="h-[18px] w-[18px]" aria-hidden="true" />}
              {submitting ? t('sending') : t('send')}
            </button>
          </div>
        </motion.form>
      </>
    );
  }

  return (
    <PageShell>
      <Helmet>
        <title>{`${check?.ok ? t('rateProduct', { name: productName }) : t('rpSeoTitle')} | ${storeName}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="shell max-w-3xl">{body}</div>
    </PageShell>
  );
};

export default ReviewProduct;
