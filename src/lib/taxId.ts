// Documento fiscal por país: validação e formatação. CÓPIA de supabase/functions/_shared/taxId.ts
// (as Edge Functions em Deno não importam de src). Mudou um, mude o outro. Teste: scripts/test-tax-id.mjs
export type TaxIdKind = 'br_cpf_cnpj' | 'pt_nif' | 'es_nif' | 'none';

/** Só letras e dígitos, em maiúsculas. */
export const cleanTaxId = (v: string) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

function validCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    return ((s * 10) % 11) % 10;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

// CNPJ numérico ou alfanumérico (Receita Federal, a partir de julho de 2026): 12 caracteres [0-9A-Z] + 2 dígitos.
// Valor de cada caractere = código ASCII menos 48 (dígitos ficam iguais, A=17, B=18...).
function validCnpj(c: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let s = 0;
    for (let i = 0; i < len; i++) s += (c.charCodeAt(i) - 48) * w[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

function validPtNif(d: string): boolean {
  if (!/^[1-9]\d{8}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 8; i++) s += Number(d[i]) * (9 - i);
  const m = s % 11;
  return (m < 2 ? 0 : 11 - m) === Number(d[8]);
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
function validEsNif(c: string): boolean {
  // DNI (12345678Z) e NIE (X1234567L)
  const nie = /^[XYZ]\d{7}[A-Z]$/.test(c);
  if (/^\d{8}[A-Z]$/.test(c) || nie) {
    const n = Number((nie ? String('XYZ'.indexOf(c[0])) : '') + c.slice(nie ? 1 : 0, -1));
    return DNI_LETTERS[n % 23] === c[c.length - 1];
  }
  // CIF de empresas (B12345674)
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(c)) {
    let s = 0;
    for (let i = 1; i <= 7; i++) {
      const n = Number(c[i]);
      s += i % 2 === 1 ? Math.floor((n * 2) / 10) + ((n * 2) % 10) : n;
    }
    const ctrl = (10 - (s % 10)) % 10;
    const last = c[8];
    return last === String(ctrl) || last === 'JABCDEFGHI'[ctrl];
  }
  return false;
}

/** true quando o documento é válido para o tipo do país ('none' aceita vazio). */
export function isValidTaxId(kind: TaxIdKind, value: string): boolean {
  const c = cleanTaxId(value);
  switch (kind) {
    case 'br_cpf_cnpj': return c.length === 11 ? validCpf(c) : validCnpj(c);
    case 'pt_nif': return validPtNif(c);
    case 'es_nif': return validEsNif(c);
    default: return true;
  }
}

/** Tipo concreto do documento (para guardar e mostrar): cpf, cnpj, nif. */
export function taxIdType(kind: TaxIdKind, value: string): 'cpf' | 'cnpj' | 'nif' | null {
  const c = cleanTaxId(value);
  if (kind === 'br_cpf_cnpj') return c.length <= 11 && /^\d*$/.test(c) ? 'cpf' : 'cnpj';
  if (kind === 'pt_nif' || kind === 'es_nif') return 'nif';
  return null;
}

/** Máscara enquanto a pessoa escreve: 000.000.000-00, 00.000.000/0000-00, 000 000 000. */
export function formatTaxId(kind: TaxIdKind, value: string): string {
  const c = cleanTaxId(value);
  if (kind === 'br_cpf_cnpj') {
    if (c.length <= 11 && /^\d*$/.test(c)) {
      return c.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    }
    const x = c.slice(0, 14);
    return [x.slice(0, 2), x.slice(2, 5), x.slice(5, 8)].filter(Boolean).join('.') + (x.length > 8 ? `/${x.slice(8, 12)}` : '') + (x.length > 12 ? `-${x.slice(12)}` : '');
  }
  if (kind === 'pt_nif') return c.replace(/\D/g, '').slice(0, 9).replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  if (kind === 'es_nif') return c.slice(0, 9);
  return value;
}
