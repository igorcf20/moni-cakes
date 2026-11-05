// =====================================================================================
// Banners de campanha da página inicial (tabela banners, editada no Admin > Banners).
// A política de leitura do banco já só devolve os ativos dentro das datas de início e fim.
// O Admin invalida CAMPAIGN_BANNERS_QUERY_KEY depois de gravar.
// Textos por idioma: title/subtitle/cta_text são os do idioma principal; texts_i18n guarda as traduções
// ({"en": {"title": "...", "subtitle": "...", "cta_text": "..."}}); campo vazio = texto principal.
// =====================================================================================
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Locale } from '@/i18n';

export const CAMPAIGN_BANNERS_QUERY_KEY = ['campaign-banners'] as const;

export type CampaignBanner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  cta_text: string | null;
  cta_url: string | null;
  texts_i18n?: BannerTranslations | null;
};

export const BANNER_TEXT_FIELDS = ['title', 'subtitle', 'cta_text'] as const;
export type BannerTextField = (typeof BANNER_TEXT_FIELDS)[number];
export type BannerTranslations = Partial<Record<Locale, Partial<Record<BannerTextField, string>>>>;

/** Lê texts_i18n do banco: só idiomas e campos conhecidos, sem textos vazios. */
export function parseBannerTranslations(value: unknown, locales: readonly Locale[]): BannerTranslations {
  const out: BannerTranslations = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const locale of locales) {
    const entry = (value as Record<string, unknown>)[locale];
    if (!entry || typeof entry !== 'object') continue;
    const clean: Partial<Record<BannerTextField, string>> = {};
    for (const f of BANNER_TEXT_FIELDS) {
      const v = (entry as Record<string, unknown>)[f];
      if (typeof v === 'string' && v.trim()) clean[f] = v.trim();
    }
    if (Object.keys(clean).length) out[locale] = clean;
  }
  return out;
}

/** Banner com os textos do idioma pedido (o que faltar fica no texto principal). */
export function bannerInLocale(b: CampaignBanner, locale: Locale): CampaignBanner {
  const tr = parseBannerTranslations(b.texts_i18n, [locale])[locale];
  if (!tr) return b;
  return { ...b, title: tr.title ?? b.title, subtitle: tr.subtitle ?? b.subtitle, cta_text: tr.cta_text ?? b.cta_text };
}

/** Link de banner aceite: caminho da loja ("/produtos") ou endereço https. */
export const isBannerLink = (v: string) => /^\/(?!\/)\S*$/.test(v) || /^https:\/\/[^\s/]+\.[^\s]+$/.test(v);

export function useCampaignBanners() {
  return useQuery({
    queryKey: CAMPAIGN_BANNERS_QUERY_KEY,
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CampaignBanner[]> => {
      const read = (cols: string) => (supabase as any).from('banners')
        .select(cols).eq('is_active', true).order('display_order', { ascending: true }).limit(6);
      let { data, error } = await read('id,title,subtitle,image_url,cta_text,cta_url,texts_i18n');
      // banco ainda sem a coluna das traduções: lê só os textos principais
      if (error) ({ data, error } = await read('id,title,subtitle,image_url,cta_text,cta_url'));
      if (error) return [];
      return (data ?? []).filter((b: CampaignBanner) => b.image_url);
    },
  });
}
