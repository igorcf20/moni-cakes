// =====================================================================================
// Privacidade e cookies da loja (store_settings.privacy_settings; formato em src/lib/privacy.ts).
// Lido pelo aviso de cookies, pelo carregador das ferramentas (ConsentScripts) e pela política de privacidade.
// O Admin > Privacidade e cookies invalida PRIVACY_QUERY_KEY depois de guardar.
// =====================================================================================
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFeature } from '@/hooks/useFeatures';
import { DEFAULT_PRIVACY, parsePrivacySettings, type PrivacySettings } from '@/lib/privacy';

export const PRIVACY_QUERY_KEY = ['privacy-settings'] as const;

export function usePrivacySettingsQuery() {
  return useQuery({
    queryKey: PRIVACY_QUERY_KEY,
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PrivacySettings> => {
      const { data, error } = await supabase.from('store_settings').select('value').eq('key', 'privacy_settings').maybeSingle();
      if (error) throw error;
      return parsePrivacySettings(data?.value);
    },
  });
}

/** Configuração publicada (padrão enquanto carrega ou se falhar). `ready` = já se sabe a configuração real. */
export function usePrivacySettings(): PrivacySettings & { ready: boolean } {
  const { data, isFetched } = usePrivacySettingsQuery();
  // Afiliados ligados: o aviso de cookies oferece Marketing (o código do link só fica no aparelho com consentimento).
  const affiliates = useFeature('affiliates');
  const punchout = useFeature('punchout');
  return { ...(data ?? DEFAULT_PRIVACY), affiliates, punchout, ready: isFetched };
}
