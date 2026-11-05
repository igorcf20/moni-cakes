// Textos legais por jurisdição. O país atual (useCountry().code) escolhe o pacote; sem texto próprio, vale o internacional.
import { BR_PACK } from './br';
import { ES_PACK } from './es';
import { INTL_PACK } from './intl';
import { PT_PACK } from './pt';
import { jurisdictionOf } from './shared';
import type { JurisdictionCode, LegalPack } from './types';

export const LEGAL_PACKS: Record<JurisdictionCode, LegalPack> = { BR: BR_PACK, PT: PT_PACK, ES: ES_PACK, INTL: INTL_PACK };

/** Pacote de textos legais para o código do país. */
export const legalPackFor = (countryCode: string) => LEGAL_PACKS[jurisdictionOf(countryCode)];
