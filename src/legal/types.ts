// Tipos do conteúdo legal (política de privacidade, termos e devoluções) por jurisdição.
// O conteúdo é escrito como dados em src/legal/<jurisdição>.ts e desenhado por LegalPage.tsx.
import type { Locale } from '@/i18n';
import type { Country } from '@/lib/countries';

export type LegalDocKind = 'privacy' | 'terms' | 'returns';
export type JurisdictionCode = 'BR' | 'PT' | 'ES' | 'INTL';

/**
 * Texto com marcação mínima (sem HTML): **negrito** e [rótulo](destino).
 * Destinos aceites: /rota interna, #ancora, https://..., mailto:... e tel:...
 */
export type RichText = string;

/** Itens que podem ficar de fora (dado da loja vazio): false, null, undefined ou '' são ignorados. */
export type Maybe<T> = T | false | null | undefined | '';

export type LegalBlock =
  | { kind: 'p'; text: RichText }
  | { kind: 'list'; items: Maybe<RichText>[]; ordered?: boolean }
  | { kind: 'note'; text: RichText }
  | { kind: 'facts'; items: Maybe<{ label: string; value: RichText }>[] }
  | { kind: 'entities'; items: Maybe<{ name: string; place?: string; text: RichText }>[] }
  | { kind: 'links'; items: Maybe<{ label: string; text?: string; href?: string }>[] }
  | { kind: 'template'; title: string; text: string }
  | { kind: 'cookieSettings' };

export type LegalSection = { id: string; title: string; blocks: Maybe<LegalBlock>[] };
export type LegalDoc = { intro: Maybe<RichText>[]; sections: Maybe<LegalSection>[] };

/** Dados da loja e do país usados no texto. A morada da empresa nunca entra aqui. */
export type LegalContext = {
  store: string;
  email: string;
  phone: string;
  taxId: string;
  country: Country;
  /** País do Espaço Económico Europeu (RGPD). */
  eu: boolean;
  /** Ferramentas de estatística e marketing ligadas no Admin > Privacidade e cookies (vazio = nenhuma). */
  tools: { name: string; provider: string; category: 'analytics' | 'marketing' }[];
  /** Validade da escolha de cookies, em meses. */
  consentMonths: number;
};

export type LegalPack = {
  /** Língua em que o texto está escrito. */
  lang: Locale;
  /** Data da última atualização (AAAA-MM-DD). */
  updated: string;
  docs: Record<LegalDocKind, (c: LegalContext) => LegalDoc>;
};
