// Avaliar pedido (/avaliar/pedido/:orderId): lista os produtos de um pedido entregue do cliente, com o estado
// "avaliado" de cada um, e leva a /avaliar/:orderId/:productId. Precisa de sessão.
import { STORE_DEFAULTS } from "@/config/store";
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Package, Star } from 'lucide-react';
import { LayerArt } from '@/components/MediaImage';
import { PageShell, PageIntro, StatusCard } from '@/components/institutional/ui';
import { btnPrimary, card, reveal } from '@/components/institutional/styles';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { reviewMessages } from '@/i18n/pages';
import { cn } from '@/lib/utils';

interface Item {
  product_id: string;
  name: string | null;
  image?: string | null;
  reviewed: boolean;
}

type ErrKey = 'errNotFound' | 'errNotYours' | 'errNotDelivered';
const ALLOWED = new Set(['delivered', 'completed']);

function Thumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[14px] bg-brand-alt">
      {src && !failed ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" /> : <LayerArt Icon={Package} size="sm" />}
    </div>
  );
}

const ReviewOrder = () => {
  const { t } = useMessages(reviewMessages);
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: info } = useStoreInfo();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrKey | null>(null);
  const [orderShort, setOrderShort] = useState('');
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/auth?redirect=/avaliar/pedido/${orderId}`);
      return;
    }
    (async () => {
      setLoading(true);
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('id, status, user_id')
        .eq('id', orderId)
        .maybeSingle();
      if (orderErr || !order) {
        setError('errNotFound');
        setLoading(false);
        return;
      }
      if ((order as any).user_id !== user.id) {
        setError('errNotYours');
        setLoading(false);
        return;
      }
      if (!ALLOWED.has(String((order as any).status))) {
        setError('errNotDelivered');
        setLoading(false);
        return;
      }
      setOrderShort(orderId.slice(0, 8).toUpperCase());

      const { data: rows } = await supabase
        .from('order_items')
        .select('product_id, products:product_id(name, image)')
        .eq('order_id', orderId);

      const uniq = new Map<string, Item>();
      (rows || []).forEach((r: any) => {
        if (!r.product_id || uniq.has(r.product_id)) return;
        uniq.set(r.product_id, {
          product_id: r.product_id,
          name: r?.products?.name || null,
          image: r?.products?.image || null,
          reviewed: false,
        });
      });
      const productIds = Array.from(uniq.keys());

      if (productIds.length > 0) {
        const { data: reviews } = await supabase
          .from('product_reviews')
          .select('product_id')
          .eq('user_id', user.id)
          .in('product_id', productIds);
        (reviews || []).forEach((rv: any) => {
          const it = uniq.get(rv.product_id);
          if (it) it.reviewed = true;
        });
      }

      setItems(Array.from(uniq.values()));
      setLoading(false);
    })();
  }, [authLoading, user, orderId, navigate]);

  const pending = items.filter((i) => !i.reviewed);
  const allDone = items.length > 0 && pending.length === 0;
  const name = info?.name || STORE_DEFAULTS.name;

  const backLink = (
    <Link to="/dashboard?tab=pedidos" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[14px] font-medium text-muted-foreground transition-colors duration-150 hover:text-brand-orange-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('backOrders')}
    </Link>
  );

  let body: React.ReactNode;
  if (authLoading || loading) {
    body = <div className="pt-10 md:pt-16"><StatusCard Icon={Loader2} tone="muted" busy title={t('checking')} headingLevel={2} /></div>;
  } else if (error) {
    body = (
      <div className="pt-10 md:pt-16">
        <StatusCard Icon={AlertTriangle} tone="warning" title={t('errTitle')} text={t(error)}>
          <Link to="/dashboard?tab=pedidos" className={btnPrimary}>{t('backOrders')}</Link>
        </StatusCard>
      </div>
    );
  } else if (allDone || items.length === 0) {
    body = (
      <div className="pt-10 md:pt-16">
        <StatusCard Icon={CheckCircle2} tone={allDone ? 'success' : 'muted'} title={allDone ? t('roDoneTitle') : t('roEmpty')} text={allDone ? t('roDoneText') : undefined}>
          <Link to="/dashboard?tab=pedidos" className={btnPrimary}>{t('backOrders')}</Link>
        </StatusCard>
      </div>
    );
  } else {
    body = (
      <>
        <PageIntro crumbs={[{ label: t('home'), href: '/' }, { label: t('myOrders'), href: '/dashboard?tab=pedidos' }, { label: t('roSeoTitle') }]} title={t('roTitle', { code: orderShort })} lead={t('roLead')} />
        <ul className={cn(card, 'mt-8 divide-y divide-border overflow-hidden')}>
          {items.map((it, i) => {
            const label = it.name || t('productFallback');
            return (
              <motion.li key={it.product_id} {...reveal(i)} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <Thumb src={it.image} alt={label} />
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold">{label}</p>
                    {it.reviewed && (
                      <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-0.5 text-[13px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{t('reviewed')}
                      </p>
                    )}
                  </div>
                </div>
                {!it.reviewed && (
                  <Link to={`/avaliar/${orderId}/${it.product_id}`} className={cn(btnPrimary, 'sm:shrink-0')} aria-label={t('rateProduct', { name: label })}>
                    <Star className="h-[18px] w-[18px]" aria-hidden="true" />{t('rate')}
                  </Link>
                )}
              </motion.li>
            );
          })}
        </ul>
        <div className="mt-6">{backLink}</div>
      </>
    );
  }

  return (
    <PageShell>
      <Helmet>
        <title>{`${t('roSeoTitle')} | ${name}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="shell max-w-3xl">{body}</div>
    </PageShell>
  );
};

export default ReviewOrder;
