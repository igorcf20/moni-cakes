// =====================================================================================
// Ferramentas de terceiros que dependem do consentimento (montado uma vez em src/App.tsx).
//
//   Google Analytics 4   só com consentimento de Estatística (ID no Admin > Privacidade e cookies)
//   Meta Pixel           só com consentimento de Marketing
//
// Nada é carregado antes da escolha do visitante. Se ele retirar o consentimento, os cookies da ferramenta
// são apagados e a página recarrega (um script já carregado não se consegue descarregar).
// Ferramenta nova = um ramo aqui + uma entrada em activeTools() e COOKIE_REGISTRY (src/lib/privacy.ts).
// =====================================================================================
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePrivacySettings } from '@/hooks/usePrivacySettings';
import { getConsent, onConsentChange, type ConsentState } from '@/lib/consent';

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
type W = Window & { dataLayer?: unknown[]; gtag?: Gtag; fbq?: Fbq; _fbq?: Fbq };

function addScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadGa4(id: string) {
  const w = window as W;
  if (w.gtag) return;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.gtag = function gtag() { w.dataLayer!.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', id, { anonymize_ip: true });
  addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, 'consent-ga4');
}

function loadMetaPixel(id: string) {
  const w = window as W;
  if (w.fbq) return;
  const fbq: Fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  w.fbq = fbq;
  w._fbq = fbq;
  addScript('https://connect.facebook.net/en_US/fbevents.js', 'consent-meta');
  fbq('init', id);
  fbq('track', 'PageView');
}

/** Apaga cookies pelo prefixo no domínio atual e nos domínios pai (onde o Google e a Meta os gravam). */
function deleteCookies(prefixes: string[]) {
  const parts = window.location.hostname.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join('.')}`);
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim();
    if (!prefixes.some((p) => name === p || name.startsWith(`${p}_`))) continue;
    for (const d of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
  }
}

export default function ConsentScripts() {
  const privacy = usePrivacySettings();
  const [consent, setConsentState] = useState<ConsentState | null>(() => getConsent());
  const loaded = useRef({ analytics: false, marketing: false });
  const { pathname } = useLocation();

  useEffect(() => onConsentChange(setConsentState), []);

  useEffect(() => {
    const analytics = !!consent?.analytics && !!privacy.ga4Id;
    const marketing = !!consent?.marketing && !!privacy.metaPixelId;
    // Consentimento retirado depois de a ferramenta carregar: limpar e recarregar.
    if ((loaded.current.analytics && !analytics) || (loaded.current.marketing && !marketing)) {
      deleteCookies([...(loaded.current.analytics && !analytics ? ['_ga', '_gid'] : []), ...(loaded.current.marketing && !marketing ? ['_fbp', '_fbc'] : [])]);
      window.location.reload();
      return;
    }
    // Sem consentimento: garantir que não ficaram cookies de visitas anteriores.
    if (!analytics) deleteCookies(['_ga', '_gid']);
    if (!marketing) deleteCookies(['_fbp', '_fbc']);
    if (analytics) { loadGa4(privacy.ga4Id); loaded.current.analytics = true; }
    if (marketing) { loadMetaPixel(privacy.metaPixelId); loaded.current.marketing = true; }
  }, [consent, privacy.ga4Id, privacy.metaPixelId]);

  // Navegação dentro do site: o GA4 conta sozinho (histórico do navegador); o Pixel precisa do aviso.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (loaded.current.marketing) (window as W).fbq?.('track', 'PageView');
  }, [pathname]);

  return null;
}
