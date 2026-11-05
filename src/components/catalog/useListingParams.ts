// Estado das listagens na URL (parseParams e writeParams em ./listing) e a posição da página ao trocar filtros.
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { parseParams, writeParams, type ListingParams } from './listing';

/** Âncora no início dos resultados (em CatalogLayout), usada para mostrar a lista nova a partir do topo. */
export const RESULTS_TOP_ID = 'listing-results-top';

const GAP = 12;

/** Fundo do cabeçalho fixo da loja (o primeiro <header> com position sticky ou fixed). */
function headerBottom(): number {
  for (const h of Array.from(document.querySelectorAll('header'))) {
    const pos = window.getComputedStyle(h).position;
    if (pos === 'sticky' || pos === 'fixed') return Math.max(0, h.getBoundingClientRect().bottom);
  }
  return 0;
}

/**
 * Leva a página ao início dos resultados quando ele ficou escondido atrás ou acima do cabeçalho fixo.
 * Se o início já está visível, não mexe na página.
 */
export function revealResults(behavior: ScrollBehavior = 'instant' as ScrollBehavior) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(RESULTS_TOP_ID);
  if (!el) return;
  const offset = el.getBoundingClientRect().top - headerBottom();
  if (offset < 0) window.scrollTo({ top: Math.max(0, window.scrollY + offset - GAP), left: 0, behavior });
}

/**
 * Parâmetros da listagem com escrita na URL. Ao trocar filtros mantém a posição da página
 * (o ScrollToTop do App sobe ao topo em cada mudança de endereço), mas como a grade volta à página 1,
 * se o início dos resultados tiver ficado acima do cabeçalho a página vai até ele.
 */
export function useListingParams() {
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const keep = useRef<number | null>(null);
  const params = useMemo(() => parseParams(sp), [sp]);

  useLayoutEffect(() => {
    if (keep.current === null) return;
    const top = keep.current;
    keep.current = null;
    window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
    revealResults('instant' as ScrollBehavior);
  }, [location.key]);

  const keepScroll = useCallback(() => { keep.current = window.scrollY; }, []);

  const update = useCallback((patch: Partial<ListingParams>, opts: { replace?: boolean } = {}) => {
    keepScroll();
    setSp((current) => writeParams(current, { ...parseParams(current), ...patch }), { replace: opts.replace });
  }, [setSp, keepScroll]);

  /** search (com "?") para um link que muda só alguns parâmetros */
  const hrefWith = useCallback((patch: Partial<ListingParams>) => {
    const s = writeParams(sp, { ...params, ...patch }).toString();
    return s ? `?${s}` : '';
  }, [sp, params]);

  return { params, update, hrefWith, keepScroll };
}
