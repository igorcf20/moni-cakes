// Formato de morada/endereço por país, a partir do postalCodeKind da tabela countries.
// Os campos gravados são os mesmos em todos os países (user_addresses e shipping_address da encomenda):
//   street, number, complement, parish (bairro / freguesia), city, district (estado / distrito / provincia),
//   postal_code e country (código ISO, ex. "BR"). O servidor lê district (ou state) para o frete.
// Os rótulos de cada campo estão em src/i18n/address.ts (chaves label*).
import type { PostalCodeKind } from '@/lib/countries';
import { PT_DISTRICTS } from '@/utils/countries';

export type Region = { code: string; name: string };

export type AddressFormat = {
  kind: PostalCodeKind;
  /** Exemplo mostrado no campo do código postal. */
  postalPlaceholder: string;
  /** Validação do código postal já formatado. */
  postalPattern: RegExp;
  /** Máscara aplicada enquanto a pessoa escreve. */
  formatPostal: (raw: string) => string;
  /** Lista fechada de estados, distritos ou províncias; vazia = campo de texto livre. */
  regions: Region[];
  /** Grava o nome (PT, ES) ou a sigla (BR, US) da região em district. */
  regionValue: 'name' | 'code';
  /** Mostra o campo bairro / freguesia. */
  hasParish: boolean;
  /** O bairro é obrigatório (BR). */
  parishRequired: boolean;
  /** Preenchimento automático pelo código postal (ViaCEP no Brasil). */
  lookup: boolean;
};

const digits = (s: string) => s.replace(/\D/g, '');

export const BR_STATES: Region[] = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'],
  ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'],
  ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
  ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'],
  ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
].map(([code, name]) => ({ code, name }));

export const ES_PROVINCES: Region[] = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona', 'Burgos',
  'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona', 'Granada',
  'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca', 'Illes Balears', 'Jaén', 'La Rioja', 'Las Palmas', 'León', 'Lleida',
  'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca',
  'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid',
  'Bizkaia', 'Zamora', 'Zaragoza',
].map((name) => ({ code: name, name }));

export const US_STATES: Region[] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
  ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([code, name]) => ({ code, name }));

const FORMATS: Record<PostalCodeKind, AddressFormat> = {
  br_cep: {
    kind: 'br_cep', postalPlaceholder: '01310-100', postalPattern: /^\d{5}-\d{3}$/,
    formatPostal: (raw) => { const d = digits(raw).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; },
    regions: BR_STATES, regionValue: 'code', hasParish: true, parishRequired: true, lookup: true,
  },
  pt_cp: {
    kind: 'pt_cp', postalPlaceholder: '1000-100', postalPattern: /^\d{4}-\d{3}$/,
    formatPostal: (raw) => { const d = digits(raw).slice(0, 7); return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; },
    regions: PT_DISTRICTS, regionValue: 'name', hasParish: true, parishRequired: false, lookup: false,
  },
  es_cp: {
    kind: 'es_cp', postalPlaceholder: '28001', postalPattern: /^\d{5}$/,
    formatPostal: (raw) => digits(raw).slice(0, 5),
    regions: ES_PROVINCES, regionValue: 'name', hasParish: false, parishRequired: false, lookup: false,
  },
  us_zip: {
    kind: 'us_zip', postalPlaceholder: '10001', postalPattern: /^\d{5}(-\d{4})?$/,
    formatPostal: (raw) => { const d = digits(raw).slice(0, 9); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; },
    regions: US_STATES, regionValue: 'code', hasParish: false, parishRequired: false, lookup: false,
  },
  generic: {
    kind: 'generic', postalPlaceholder: '', postalPattern: /^[A-Za-z0-9][A-Za-z0-9 -]{1,10}$/,
    formatPostal: (raw) => raw.toUpperCase().slice(0, 12),
    regions: [], regionValue: 'name', hasParish: false, parishRequired: false, lookup: false,
  },
};

export function addressFormat(kind: PostalCodeKind | null | undefined): AddressFormat {
  return FORMATS[kind ?? 'generic'] ?? FORMATS.generic;
}

export const isValidPostal = (fmt: AddressFormat, value: string) => fmt.postalPattern.test(value.trim());

/** Valor a gravar em district para a região escolhida. */
export const regionToValue = (fmt: AddressFormat, r: Region) => (fmt.regionValue === 'code' ? r.code : r.name);

/** Região da lista que corresponde ao valor gravado (sigla ou nome, sem distinguir maiúsculas). */
export function findRegion(fmt: AddressFormat, value: string | null | undefined): Region | null {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return null;
  return fmt.regions.find((r) => r.code.toLowerCase() === v || r.name.toLowerCase() === v) ?? null;
}

/** Nomes antigos gravados em country ("Portugal", "Brasil"...) para o código ISO. */
const LEGACY_COUNTRY: Record<string, string> = {
  portugal: 'PT', brasil: 'BR', brazil: 'BR', espanha: 'ES', españa: 'ES', spain: 'ES',
  'estados unidos': 'US', 'united states': 'US', usa: 'US',
};

/** Código ISO do país de uma morada (aceita o código ou o nome antigo). */
export function addressCountryCode(country: string | null | undefined, fallback: string): string {
  const c = (country ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  return LEGACY_COUNTRY[c.toLowerCase()] ?? fallback;
}

export type PostalLookup = { street: string; parish: string; city: string; region: string };

/**
 * Preenche a morada pelo código postal (só Brasil, via ViaCEP: serviço público e gratuito, sem chave).
 * Devolve null se o código não existir ou o serviço falhar; o formulário continua a funcionar à mão.
 */
export async function lookupPostal(fmt: AddressFormat, postal: string, signal?: AbortSignal): Promise<PostalLookup | null> {
  if (!fmt.lookup || fmt.kind !== 'br_cep') return null;
  const cep = digits(postal);
  if (cep.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || j.erro) return null;
    return { street: String(j.logradouro ?? ''), parish: String(j.bairro ?? ''), city: String(j.localidade ?? ''), region: String(j.uf ?? '') };
  } catch {
    return null;
  }
}
