// Países onde a loja vende (tabela `countries`, migration 20261004100000_countries.sql).
// Enquanto a tabela não existir ou estiver vazia, vale a lista de reserva abaixo (a mesma da migration).
// O país escolhido pelo cliente fica guardado no navegador; moeda, impostos, documento fiscal e formato
// de código postal vêm dele. Nada de país fixo nos componentes: use useCountry() / getCountry().
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import { useLocale, type Locale } from '@/i18n';

export type TaxMode = 'inclusive' | 'vat';
import type { TaxIdKind } from '@/lib/taxId';
export type { TaxIdKind };
export type PostalCodeKind = 'br_cep' | 'pt_cp' | 'es_cp' | 'us_zip' | 'generic';
export type Print3dCosts = { filamentPerKg: number; machinePerHour: number; finishing: number; fee: number };

export type Country = {
  code: string;
  currency: string;
  locale: Locale;
  phonePrefix: string;
  taxMode: TaxMode;
  defaultTaxRate: number;
  shippingTaxRate: number;
  taxIdKind: TaxIdKind;
  taxIdRequired: boolean;
  postalCodeKind: PostalCodeKind;
  shippingProvider: string | null;
  paymentProviders: string[];
  invoiceProvider: string | null;
  freeShippingFromCents: number | null;
  print3d: Print3dCosts;
};

export const FALLBACK_COUNTRIES: Country[] = [
  { code: 'BR', currency: 'BRL', locale: 'pt-BR', phonePrefix: '+55', taxMode: 'inclusive', defaultTaxRate: 0, shippingTaxRate: 0, taxIdKind: 'br_cpf_cnpj', taxIdRequired: true, postalCodeKind: 'br_cep', shippingProvider: 'melhor_envio', paymentProviders: ['mercado_pago'], invoiceProvider: null, freeShippingFromCents: 29900, print3d: { filamentPerKg: 110, machinePerHour: 4, finishing: 8, fee: 4 } },
  { code: 'PT', currency: 'EUR', locale: 'pt-PT', phonePrefix: '+351', taxMode: 'vat', defaultTaxRate: 23, shippingTaxRate: 23, taxIdKind: 'pt_nif', taxIdRequired: true, postalCodeKind: 'pt_cp', shippingProvider: 'ctt', paymentProviders: ['viva'], invoiceProvider: 'fiz', freeShippingFromCents: 5000, print3d: { filamentPerKg: 20, machinePerHour: 0.8, finishing: 1.5, fee: 3 } },
];
export const DEFAULT_COUNTRY_CODE = 'BR';

const LOCALES: Locale[] = ['pt-BR', 'pt-PT', 'en', 'es'];
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function fromRow(r: any): Country {
  const p = r.print3d ?? {};
  return {
    code: r.code, currency: r.currency,
    locale: (LOCALES.includes(r.default_locale) ? r.default_locale : 'en') as Locale,
    phonePrefix: r.phone_prefix, taxMode: r.tax_mode === 'vat' ? 'vat' : 'inclusive',
    defaultTaxRate: num(r.default_tax_rate), shippingTaxRate: num(r.shipping_tax_rate),
    taxIdKind: r.tax_id_kind, taxIdRequired: !!r.tax_id_required, postalCodeKind: r.postal_code_kind,
    shippingProvider: r.shipping_provider ?? null, paymentProviders: r.payment_providers ?? [],
    invoiceProvider: r.invoice_provider ?? null,
    freeShippingFromCents: r.free_shipping_from_cents == null ? null : num(r.free_shipping_from_cents),
    print3d: { filamentPerKg: num(p.filamentPerKg, 20), machinePerHour: num(p.machinePerHour, 1), finishing: num(p.finishing, 1), fee: num(p.fee, 3) },
  };
}

/** Países ativos (do banco, ou a lista de reserva). O padrão vem primeiro. */
export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: async (): Promise<Country[]> => {
      const { data, error } = await (supabase as any).from('countries').select('*').eq('is_active', true)
        .order('is_default', { ascending: false }).order('display_order');
      if (error || !data?.length) return FALLBACK_COUNTRIES;
      return data.map(fromRow);
    },
    staleTime: 10 * 60_000,
    retry: 1,
    placeholderData: FALLBACK_COUNTRIES,
  });
}

type CountryState = { code: string | null; country: Country; setCode: (c: string) => void; resolve: (list: Country[]) => void };

/** Região do navegador (pt-BR → BR), para sugerir o país na primeira visita. */
function browserRegion(): string | null {
  if (typeof navigator === 'undefined') return null;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const m = /-([A-Za-z]{2})$/.exec(tag ?? '');
    if (m) return m[1].toUpperCase();
  }
  return null;
}

export const useCountryStore = create<CountryState>()(
  persist(
    (set, get) => ({
      code: null,
      country: FALLBACK_COUNTRIES[0],
      setCode: (code) => set({ code }),
      resolve: (list) => {
        const wanted = get().code ?? browserRegion();
        const country = list.find((c) => c.code === wanted) ?? list[0] ?? FALLBACK_COUNTRIES[0];
        if (country !== get().country) set({ country });
      },
    }),
    { name: 'loja3d-country', partialize: (s) => ({ code: s.code }) },
  ),
);

/** País atual do cliente. Monte <CountrySync /> uma vez no App. */
export const useCountry = () => useCountryStore((s) => s.country);
/** Versão síncrona para funções fora de componentes (formatação de preço, impostos). */
export const getCountry = () => useCountryStore.getState().country;

export function CountrySync() {
  const { data, isPlaceholderData } = useCountries();
  const code = useCountryStore((s) => s.code);
  const resolve = useCountryStore((s) => s.resolve);
  useEffect(() => { if (data) resolve(data); }, [data, code, resolve]);
  // ?pais=PT no endereço (links do feed de produtos, campanhas): escolhe o país e o idioma dele, uma vez por visita.
  useEffect(() => {
    if (!data || isPlaceholderData || typeof window === 'undefined') return;
    const wanted = new URLSearchParams(window.location.search).get('pais')?.trim().toUpperCase();
    const c = wanted ? data.find((x) => x.code === wanted) : null;
    if (!c || useCountryStore.getState().code === c.code) return;
    useCountryStore.getState().setCode(c.code);
    useLocale.getState().setLocale(c.locale);
  }, [data, isPlaceholderData]);
  return null;
}

/** Nome do país no idioma pedido (Intl, sem traduções próprias). */
export function countryName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
