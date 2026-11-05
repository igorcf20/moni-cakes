// =====================================================================================
// Página inicial do Admin (store_settings.home_page; ver src/lib/homePage.ts).
//   useHomePageQuery()  o valor publicado (o Admin edita uma cópia)
//   useHomePage()       para o site: texto por chave (Admin ou i18n), seções visíveis e fotos
// O Admin > Conteúdo da página inicial invalida HOME_PAGE_QUERY_KEY depois de publicar.
// =====================================================================================
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { interpolate, useMessages } from '@/i18n';
import { layoutMessages } from '@/i18n/layout';
import { EMPTY_HOME, homeText, parseHomePage, type HomePage } from '@/lib/homePage';

export const HOME_PAGE_QUERY_KEY = ['home-page'] as const;

export function useHomePageQuery() {
  return useQuery({
    queryKey: HOME_PAGE_QUERY_KEY,
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HomePage> => {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'home_page').maybeSingle();
      if (error) throw error;
      return parseHomePage(data?.value);
    },
  });
}

export function useHomePage() {
  const { t: base, locale } = useMessages(layoutMessages);
  const { data } = useHomePageQuery();
  const page = data ?? EMPTY_HOME;
  // Mesmo formato do `t` do i18n, para os componentes da página inicial não mudarem.
  const t = useCallback(
    ((key, vars) => {
      const own = homeText(page, locale, key as string);
      return own ? interpolate(own, vars) : base(key, vars);
    }) as typeof base,
    [page, locale, base],
  );
  return useMemo(() => ({
    t,
    locale,
    page,
    isVisible: (id: string) => !page.hidden.includes(id),
  }), [t, locale, page]);
}
