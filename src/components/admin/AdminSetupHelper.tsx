// =====================================================================================
// Primeiros passos do Admin: cartão pequeno no canto inferior direito (não é uma seção nem tapa a página),
// para ajudar o dono novo a deixar a loja com a sua cara. Aparece em todas as páginas do painel enquanto
// faltar algum passo; some sozinho quando tudo está feito.
//   Aberto       lista dos passos; cada um abre a seção do painel certa e minimiza o cartão para não tapar a seção
//   Minimizado   só uma pílula "Primeiros passos 3 de 7"
//   Escondido    "Não mostrar mais"; volta pelo botão nas Estatísticas (reopenSetupHelper)
// Estado só neste navegador (localStorage "admin-setup-helper"), como a vista da lista de produtos.
// Cada passo confere o banco (só leitura). Passo novo = uma entrada em STEPS (id da seção do Admin +
// verificação) e os textos step_<id> / step_<id>_hint em src/i18n/admin.ts.
// =====================================================================================
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, CheckCircle2, Circle, Rocket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { adminHref } from '@/components/admin/shell/adminSections';
import { useMessages } from '@/i18n';
import { adminMessages, type AdminKey } from '@/i18n/admin';

type Status = Record<string, boolean>;

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

export async function fetchSetupStatus(): Promise<Status> {
  const count = async (table: 'products' | 'categories' | 'delivery_methods' | 'payment_config' | 'shipping_services') => {
    const { count: n, error } = await (supabase as any).from(table).select('id', { count: 'exact', head: true }).eq('is_active', true);
    if (error) throw error;
    return (n ?? 0) > 0;
  };
  const { data: rows, error } = await supabase.from('store_settings').select('key, value').in('key', ['store_info', 'store_brand', 'social_links']);
  if (error) throw error;
  const get = (k: string) => (rows ?? []).find((r) => r.key === k)?.value as Record<string, unknown> | undefined;
  const info = get('store_info') ?? {};
  const social = get('social_links') ?? {};
  const [products, categories, legacyDelivery, shipping, payment] = await Promise.all([count('products'), count('categories'), count('delivery_methods'), count('shipping_services'), count('payment_config')]);
  const delivery = legacyDelivery || shipping;
  return {
    info: filled(info.name) && filled(info.email) && filled(info.phone),
    brand: !!get('store_brand'),
    categories,
    products,
    delivery,
    payment,
    social: Object.values(social).some(filled),
  };
}

/** Passo -> seção do Admin que resolve. Pela ordem em que faz sentido montar a loja. */
const STEPS: { id: string; tab: string }[] = [
  { id: 'info', tab: 'settings' },
  { id: 'brand', tab: 'brand' },
  { id: 'categories', tab: 'categories' },
  { id: 'products', tab: 'products' },
  { id: 'delivery', tab: 'delivery' },
  { id: 'payment', tab: 'payment' },
  { id: 'social', tab: 'settings' },
];

export const SETUP_STATUS_KEY = ['admin-start-status'] as const;

/** Passos feitos e o total (para o cartão e para o botão das Estatísticas). */
export function useSetupProgress(enabled = true) {
  const { data: status } = useQuery({ queryKey: SETUP_STATUS_KEY, queryFn: fetchSetupStatus, enabled, staleTime: 60_000 });
  const done = status ? STEPS.filter((s) => status[s.id]).length : 0;
  return { status, done, total: STEPS.length, complete: !!status && done === STEPS.length };
}

type Mode = 'open' | 'min' | 'hidden';
const STORE_KEY = 'admin-setup-helper';
const EVENT = 'admin-setup-helper';
const readMode = (openByDefault: boolean): Mode => {
  // Sem escolha guardada: aberto só na página inicial (Estatísticas) e no computador; nas outras páginas e no
  // celular começa minimizado (pílula), para não tapar a página.
  const first: Mode = openByDefault && typeof window !== 'undefined' && window.innerWidth >= 640 ? 'open' : 'min';
  try { const v = localStorage.getItem(STORE_KEY); return v === 'min' || v === 'hidden' || v === 'open' ? v : first; } catch { return first; }
};
const writeMode = (m: Mode) => {
  try { localStorage.setItem(STORE_KEY, m); } catch { /* sem armazenamento: fica só nesta visita */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: m }));
};

/** Volta a mostrar o cartão aberto (botão nas Estatísticas). */
export const reopenSetupHelper = () => writeMode('open');

export function useSetupHelperMode(openByDefault = false) {
  const [mode, setMode] = useState<Mode>(() => readMode(openByDefault));
  useEffect(() => {
    const on = (e: Event) => setMode((e as CustomEvent<Mode>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return mode;
}

export default function AdminSetupHelper({ openByDefault = false }: { openByDefault?: boolean }) {
  const { t } = useMessages(adminMessages);
  const navigate = useNavigate();
  const mode = useSetupHelperMode(openByDefault);
  const { status, done, total, complete } = useSetupProgress();

  if (!status || complete || mode === 'hidden') return null;
  const next = STEPS.find((s) => !status[s.id]);

  // Em portal no <body>: dentro da moldura há animações com transform, que prenderiam o "fixed" à página.
  // Espaço no fim da página para o cartão não tapar os últimos botões.
  const spacer = <div aria-hidden="true" className={mode === 'min' ? 'h-16' : 'h-16 sm:h-24'} />;
  if (mode === 'min') {
    return <>{spacer}{createPortal(
      <button
        type="button"
        onClick={() => writeMode('open')}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-semibold shadow-lg transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <Rocket className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('setup_pill', { done, total })}
      </button>,
      document.body,
    )}</>;
  }

  return <>{spacer}{createPortal(
    <section
      aria-labelledby="setup-helper-title"
      className="fixed bottom-4 right-4 left-4 z-40 max-h-[70vh] overflow-y-auto rounded-[20px] border bg-card p-4 shadow-xl sm:left-auto sm:w-[340px] animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10"><Rocket className="h-4 w-4 text-primary" aria-hidden="true" /></span>
          <h2 id="setup-helper-title" className="text-sm font-bold leading-tight">{t('setup_title')}</h2>
        </div>
        <button type="button" onClick={() => writeMode('min')} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('setup_minimize')} title={t('setup_minimize')}>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t('start_progress', { done, total })}</p>
        <Progress value={(done / total) * 100} className="h-1.5" />
      </div>
      <ol className="mt-3 space-y-0.5">
        {STEPS.map((s) => {
          const ok = status[s.id];
          const isNext = next?.id === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => { writeMode('min'); navigate(adminHref.section(s.tab)); }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isNext ? 'bg-primary/5' : ''}`}
              >
                {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <Circle className={`mt-0.5 h-4 w-4 shrink-0 ${isNext ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />}
                <span className="min-w-0">
                  <span className={`block font-medium ${ok ? 'text-muted-foreground line-through decoration-1' : ''}`}>{t(`step_${s.id}` as AdminKey)}</span>
                  {isNext && <span className="block text-xs text-muted-foreground">{t(`step_${s.id}_hint` as AdminKey)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 border-t pt-2">
        <button type="button" onClick={() => writeMode('hidden')} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" title={t('setup_dismiss_hint')}>
          {t('setup_dismiss')}
        </button>
      </div>
    </section>,
    document.body,
  )}</>;
}
