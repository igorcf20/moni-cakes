// Cancelar e-mails promocionais (/unsubscribe?token=...): valida o link na Edge Function handle-email-unsubscribe
// e, depois da confirmação, cancela a inscrição. Os e-mails essenciais dos pedidos continuam.
import { STORE_DEFAULTS } from "@/config/store";
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { AlertTriangle, Loader2, MailCheck, MailX } from 'lucide-react';
import { PageShell, StatusCard } from '@/components/institutional/ui';
import { btnPrimary, btnSecondary, linkInline } from '@/components/institutional/styles';
import { useStoreInfo } from '@/hooks/useStoreInfo';
import { useMessages } from '@/i18n';
import { unsubscribeMessages } from '@/i18n/pages';
import { cn } from '@/lib/utils';

type State = 'loading' | 'confirm' | 'already' | 'invalid' | 'processing' | 'success' | 'error';

// Mesmas regras do cliente (src/integrations/supabase/client.ts): o backend responde na origem do site se
// VITE_SUPABASE_URL faltar, e as chaves opacas (sb_publishable_...) não vão no Authorization.
const apiBase = ((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
const fnBase = `${apiBase}/functions/v1/handle-email-unsubscribe`;
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || '';
const authHeaders: Record<string, string> = anonKey
  ? { apikey: anonKey, ...(/^sb_(publishable|secret)_/.test(anonKey) ? {} : { Authorization: `Bearer ${anonKey}` }) }
  : {};

const Unsubscribe = () => {
  const { t } = useMessages(unsubscribeMessages);
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<State>('loading');

  const { data: info } = useStoreInfo();
  const name = info?.name || STORE_DEFAULTS.name;
  const supportEmail = (info?.email || '').trim();

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${fnBase}?token=${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: authHeaders,
        });
        const data = await res.json().catch(() => ({}));
        if (data?.valid === true) setState('confirm');
        else if (data?.reason === 'already_unsubscribed') setState('already');
        else setState('invalid');
      } catch {
        setState('invalid');
      }
    })();
  }, [token]);

  const confirm = async () => {
    setState('processing');
    try {
      const res = await fetch(fnBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) setState('success');
      else if (data?.reason === 'already_unsubscribed') setState('already');
      else setState('error');
    } catch {
      setState('error');
    }
  };

  const mail = supportEmail && <a href={`mailto:${supportEmail}`} className={cn(linkInline, 'break-all')}>{supportEmail}</a>;
  const home = <Link to="/" className={btnSecondary}>{t('backHome')}</Link>;

  let card: React.ReactNode;
  switch (state) {
    case 'loading':
    case 'processing':
      card = <StatusCard Icon={Loader2} tone="muted" busy title={state === 'loading' ? t('loading') : t('processing')} headingLevel={2} />;
      break;
    case 'confirm':
      card = (
        <StatusCard Icon={MailX} title={t('confirmTitle')} text={t('confirmText', { name })}>
          <button type="button" onClick={confirm} className={btnPrimary}>{t('confirmBtn')}</button>
          <Link to="/" className={btnSecondary}>{t('keepBtn')}</Link>
        </StatusCard>
      );
      break;
    case 'success':
      card = (
        <StatusCard
          Icon={MailCheck} tone="success" title={t('successTitle')}
          text={<>{t('successText', { name })}{mail && <> {t('contactLine')} {mail}.</>}</>}
        >
          <Link to="/" className={btnPrimary}>{t('backHome')}</Link>
        </StatusCard>
      );
      break;
    case 'already':
      card = <StatusCard Icon={MailCheck} tone="muted" title={t('alreadyTitle')} text={t('alreadyText', { name })}>{home}</StatusCard>;
      break;
    case 'error':
      card = (
        <StatusCard Icon={AlertTriangle} tone="error" title={t('errorTitle')} text={t('errorText')}>
          <button type="button" onClick={confirm} className={btnPrimary}>{t('retry')}</button>
          {home}
        </StatusCard>
      );
      break;
    default:
      card = (
        <StatusCard
          Icon={AlertTriangle} tone="warning" title={t('invalidTitle')}
          text={<>{t('invalidText')}{mail && <> {t('invalidContact')} {mail}.</>}</>}
        >
          {home}
        </StatusCard>
      );
  }

  return (
    <PageShell>
      <Helmet>
        <title>{`${t('seoTitle')} | ${name}`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="shell flex min-h-[55vh] items-center justify-center py-10 md:py-16">{card}</div>
    </PageShell>
  );
};

export default Unsubscribe;
