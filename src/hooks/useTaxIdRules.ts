import { useCallback } from 'react';
import { useCountry } from '@/lib/countries';
import { cleanTaxId, formatTaxId, isValidTaxId } from '@/lib/taxId';
import { useMessages } from '@/i18n';
import { taxIdMessages } from '@/i18n/taxId';

/** Regras do documento fiscal do país atual: rótulo, máscara, validação e mensagens de erro já traduzidas. */
export function useTaxIdRules() {
  const country = useCountry();
  const { t } = useMessages(taxIdMessages);
  const kind = country.taxIdKind;
  const label = t(`label_${kind}`);
  const validate = useCallback((value: string): string => {
    const c = cleanTaxId(value);
    if (!c) return country.taxIdRequired ? t('required', { label }) : '';
    return isValidTaxId(kind, c) ? '' : t('invalid', { label });
  }, [kind, country.taxIdRequired, label, t]);
  return {
    kind, label, country: country.code, required: country.taxIdRequired, enabled: kind !== 'none',
    placeholder: t(`placeholder_${kind}`),
    maxLength: kind === 'br_cpf_cnpj' ? 18 : kind === 'pt_nif' ? 11 : 9,
    inputMode: (kind === 'pt_nif' ? 'numeric' : 'text') as 'numeric' | 'text',
    format: (v: string) => formatTaxId(kind, v),
    clean: cleanTaxId,
    isValid: (v: string) => !!cleanTaxId(v) && isValidTaxId(kind, v),
    validate, t,
  };
}
