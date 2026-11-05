// =====================================================================================
// Páginas da loja editáveis (site_pages, regras em src/lib/sitePages.ts).
//   Site   useSitePage(page): versão publicada para o idioma atual, ou null (o site mostra o texto padrão)
//   Admin  useAdminSitePages (todas, com rascunhos), useSaveSitePage, useDeleteSitePage
// =====================================================================================
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/i18n';
import { useFeature } from '@/hooks/useFeatures';
import { pickSitePage, type SitePage, type SitePageKind, type SitePageLocale } from '@/lib/sitePages';

const sb = supabase as any;
const COLUMNS = 'id,page,locale,title,intro,body,seo_description,published,updated_at';

export function useSitePage(page: SitePageKind) {
  const locale = useLocale((s) => s.locale);
  // Recurso desligado em Admin > Recursos da loja: o site fica com o texto padrão.
  const enabled = useFeature('site_pages');
  const q = useQuery({
    queryKey: ['site-page', page],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SitePage[]> => {
      const { data, error } = await sb.from('site_pages').select(COLUMNS).eq('page', page).eq('published', true);
      if (error) throw error;
      return (data ?? []) as SitePage[];
    },
  });
  return { page: enabled && q.data ? pickSitePage(q.data, locale) : null, isLoading: enabled && q.isLoading };
}

export function useAdminSitePages() {
  return useQuery({
    queryKey: ['admin-site-pages'],
    queryFn: async (): Promise<SitePage[]> => {
      const { data, error } = await sb.from('site_pages').select(COLUMNS).order('page');
      if (error) throw error;
      return (data ?? []) as SitePage[];
    },
  });
}

export type SitePageDraft = {
  page: SitePageKind; locale: SitePageLocale; title: string; intro: string; body: string; seo_description: string; published: boolean;
};

export function useSaveSitePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: SitePageDraft) => {
      const clean = (s: string) => s.trim() || null;
      const { error } = await sb.from('site_pages').upsert({
        page: d.page, locale: d.locale, title: clean(d.title), intro: clean(d.intro), body: clean(d.body),
        seo_description: clean(d.seo_description), published: d.published,
      }, { onConflict: 'page,locale' });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['admin-site-pages'] });
      void qc.invalidateQueries({ queryKey: ['site-page', v.page] });
    },
  });
}

export function useDeleteSitePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { page: SitePageKind; locale: SitePageLocale }) => {
      const { error } = await sb.from('site_pages').delete().eq('page', v.page).eq('locale', v.locale);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['admin-site-pages'] });
      void qc.invalidateQueries({ queryKey: ['site-page', v.page] });
    },
  });
}
