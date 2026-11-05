// =====================================================================================
// Categorias da loja para o site:
//   useDbCategories()  linhas ativas da tabela categories (uma consulta partilhada, 5 min de cache)
//   useCatalogMenu()   o menu já montado no idioma atual (banco ou catálogo padrão; ver src/lib/catalogMenu.ts),
//                      sem os links para páginas de recursos desligados (Admin > Recursos da loja)
// O Admin > Categorias invalida CATEGORIES_QUERY_KEY depois de gravar.
// =====================================================================================
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/i18n';
import { buildMenu, type DbCategory } from '@/lib/catalogMenu';
import { useFeatures } from '@/hooks/useFeatures';
import { hrefOn } from '@/lib/features';

export const CATEGORIES_QUERY_KEY = ['catalog-categories'] as const;
const EMPTY: DbCategory[] = [];
const COLUMNS = 'id,slug,name,parent_id,description,seo_title,seo_description,image_url,icon,name_i18n,link_url,show_in_menu,display_order';

export function useDbCategories() {
  return useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DbCategory[]> => {
      // Colunas novas (migration 20261005120000) podem faltar num banco antigo: tenta de novo só com as básicas.
      const first = await (supabase as any).from('categories').select(COLUMNS).eq('is_active', true);
      if (!first.error) return (first.data ?? []) as DbCategory[];
      const basic = await (supabase as any).from('categories').select('id,slug,name,parent_id,description,seo_title,seo_description,image_url,display_order').eq('is_active', true);
      return basic.error ? [] : ((basic.data ?? []) as DbCategory[]);
    },
  });
}

export function useCatalogMenu() {
  const locale = useLocale((s) => s.locale);
  const { data } = useDbCategories();
  const rows = data ?? EMPTY;
  // Subcategorias que levam a páginas de recursos desligados (ex.: /personalizar) saem do menu.
  const { data: flags } = useFeatures();
  return useMemo(
    () => buildMenu(rows, locale).map((c) => ({ ...c, subs: c.subs.filter((s) => !s.href || hrefOn(flags, s.href)) })),
    [rows, locale, flags],
  );
}
