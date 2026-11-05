// Códigos do produto na loja (SKU, interno, da marca, GTIN), conforme Admin > Catálogo > Códigos do produto
// (store_settings.product_codes, src/lib/productCodes.ts): linha discreta abaixo dos botões e linhas na aba Especificações.
import { useMemo } from 'react';
import { useProductCodesSettings } from '@/hooks/useOfferSettings';
import { useMessages } from '@/i18n';
import { productMessages } from '@/i18n/product';
import { codesFor, DEFAULT_PRODUCT_CODES, type ProductCodeKind } from '@/lib/productCodes';
import { cn } from '@/lib/utils';

type CodeSource = { sku?: string | null; gtin?: string | null; internal_code?: string | null; mpn?: string | null };

const LABEL = { sku: 'specSku', internal: 'specInternal', mpn: 'specMpn', gtin: 'specGtin' } as const satisfies Record<ProductCodeKind, string>;

/** Códigos a mostrar num lugar, já com o rótulo no idioma do cliente. sku/gtin da variante escolhida quando houver. */
export function useProductCodes(product: CodeSource, where: 'top' | 'specs', sku?: string | null, gtin?: string | null) {
  const { data: settings = DEFAULT_PRODUCT_CODES } = useProductCodesSettings();
  const { t } = useMessages(productMessages);
  const s = sku ?? product.sku, g = gtin ?? product.gtin, i = product.internal_code, m = product.mpn;
  return useMemo(
    () => codesFor({ sku: s, gtin: g, internal: i, mpn: m }, settings, where).map((c) => ({ kind: c.kind, label: t(LABEL[c.kind]), value: c.value })),
    [s, g, i, m, settings, where, t],
  );
}

/** Linha pequena abaixo dos botões de compra: "SKU: ABC-1 · Código da marca: X200". */
export function ProductCodesLine({ product, sku, gtin, className }: { product: CodeSource; sku?: string | null; gtin?: string | null; className?: string }) {
  const { t } = useMessages(productMessages);
  const codes = useProductCodes(product, 'top', sku, gtin);
  if (!codes.length) return null;
  return (
    <p className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-brand-ink-soft', className)} aria-label={t('codesLabel')}>
      {codes.map((c) => (
        <span key={c.kind}>{c.label}: <span className="font-mono">{c.value}</span></span>
      ))}
    </p>
  );
}
