// Recursos da loja ligados ou desligados (store_settings.features, catálogo em src/lib/features.ts).
//   useFeature('returns')  true/false no site e no Admin (enquanto carrega, vale o padrão do catálogo)
//   useHrefOn()            (href) => o link aparece? (/favoritos, /orcamento-3d, /personalizar seguem o recurso)
//   useFeatures()          todos os valores gravados; useSaveFeatures() grava (Admin > Recursos da loja)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { featureOn, hrefOn, normalizeFlags, type FeatureFlags } from '@/lib/features';

export const FEATURES_KEY = ['store-features'] as const;

export function useFeatures() {
  return useQuery({
    queryKey: FEATURES_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FeatureFlags> => {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'features').maybeSingle();
      if (error) throw error;
      return normalizeFlags(data?.value);
    },
  });
}

export function useFeature(id: string): boolean {
  const { data } = useFeatures();
  return featureOn(data, id);
}

/** (href) => o link pode aparecer? Para listas de links (menus, rodapé) que incluem páginas de recursos. */
export function useHrefOn(): (href: string) => boolean {
  const { data } = useFeatures();
  return (href: string) => hrefOn(data, href);
}

export function useSaveFeatures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (flags: FeatureFlags) => {
      const { error } = await supabase.from('store_settings')
        .upsert({ key: 'features', value: normalizeFlags(flags) as any }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FEATURES_KEY }),
  });
}
