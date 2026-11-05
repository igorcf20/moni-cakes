// Carrinho: "Complete o kit" (recurso kits). Kit marcado nas linhas mas incompleto = o que falta e um botão que
// adiciona as peças (ou leva à página do kit quando a peça tem cor ou tamanho a escolher). Produto solto que faz
// parte de um kit = sugestão de levar o kit. Até 2 avisos; o desconto continua decidido pelo servidor.
// Onde e quais avisos aparecem: Admin > Kits > Onde oferecer (store_settings.kits): place cart (página do carrinho),
// side (carrinho lateral, compacto) e checkout (resumo, compacto).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Gift, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { useFeature } from '@/hooks/useFeatures';
import { useKitSettings } from '@/hooks/useOfferSettings';
import { useKitPieceOptions, useKitsWithProducts } from '@/hooks/useKits';
import { useMessages } from '@/i18n';
import { kitPageMessages } from '@/i18n/kits';
import { kitPct, type KitTag } from '@/lib/kitPricing';
import { DEFAULT_KIT_SETTINGS, kitHref, kitMissing, kitsForLooseLines, kitText, pieceSoldOut } from '@/lib/kits';
import { cn } from '@/lib/utils';
import { getEffectiveBasePrice } from '@/utils/promo';

type Line = { product_id: string; quantity: number; design_data?: { kit?: KitTag | null } | null };

export function CartKitHints({ items, place = 'cart', onNavigate }: { items: Line[]; place?: 'cart' | 'side' | 'checkout'; onNavigate?: () => void }) {
  const feature = useFeature('kits');
  const { data: settings = DEFAULT_KIT_SETTINGS } = useKitSettings();
  const placeOn = place === 'cart' || (place === 'side' ? settings.sideCart : settings.checkout);
  const on = feature && placeOn && (settings.cartComplete || settings.cartLoose);
  const compact = place !== 'cart';
  const { t, locale } = useMessages(kitPageMessages);
  const { user } = useAuth();
  const { addItems } = useCart(user?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const lines = items.map((i) => ({ product_id: String(i.product_id), quantity: Number(i.quantity) || 0, kit: i.design_data?.kit ?? null }));
  const { data } = useKitsWithProducts(on ? lines.map((l) => l.product_id) : []);
  const kits = data?.kits ?? [];
  const { data: optionsMap = {} } = useKitPieceOptions(kits.flatMap((k) => k.pieces.map((p) => p.product_id)));
  if (!on || !kits.length) return null;
  const pct = (v: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v);
  const hasOptions = (id: string) => { const o = optionsMap[id]; return !!o && (o.variations.length > 0 || o.sizes.length > 0); };

  // Kits marcados no carrinho e incompletos
  const tags = new Map<string, KitTag>();
  for (const l of lines) if (l.kit?.id) tags.set(l.kit.id, l.kit);
  const incomplete = [...tags.values()].flatMap((tag) => {
    const kit = kits.find((k) => k.id === tag.id);
    const missing = kitMissing(lines, tag);
    if (!kit || !missing.length) return [];
    const pieces = missing.map((m) => ({ ...m, piece: kit.pieces.find((p) => String(p.product_id) === m.product_id) }));
    if (pieces.some((p) => !p.piece?.product || pieceSoldOut(p.piece.product))) return [];
    return [{ kit, tag, pieces, choose: pieces.some((p) => hasOptions(p.product_id)) }];
  });
  // Produtos soltos que fazem parte de um kit
  const loose = kitsForLooseLines(lines, data?.links ?? [])
    .map((id) => kits.find((k) => k.id === id))
    .filter((k): k is NonNullable<typeof k> => !!k && k.pieces.length > 1 && !k.pieces.some((p) => pieceSoldOut(p.product)));

  const hints = [
    ...(settings.cartComplete ? incomplete.map((x) => ({ type: 'complete' as const, ...x })) : []),
    ...(settings.cartLoose ? loose.filter((k) => !tags.has(k.id)).map((kit) => ({ type: 'loose' as const, kit })) : []),
  ].slice(0, compact ? 1 : 2);
  if (!hints.length) return null;

  const addMissing = (h: (typeof incomplete)[number]) => {
    setBusy(h.kit.id);
    addItems(h.pieces.map((p) => {
      const product = p.piece!.product!;
      const base = getEffectiveBasePrice(product as never) || Number(product.price) || 0;
      const raw = Number(product.price) || 0;
      return {
        productId: p.product_id,
        quantity: p.quantity,
        designData: {
          name: product.name,
          image: product.image || '',
          weight: Number((product as { weight?: number }).weight) || 0.5,
          price: base,
          selectionPricing: { version: 1, basePrice: base, modifier: 0, tierRatio: raw > 0 ? base / raw : 1 },
          kit: h.tag,
        },
      };
    }), { onSettled: () => setBusy(null) });
  };

  return (
    <div className={cn('space-y-3', place === 'side' && 'px-5 pb-4')}>
      {hints.map((h) => {
        const name = kitText(h.kit, 'name', locale);
        return (
          <motion.div key={`${h.type}-${h.kit.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className={cn('flex flex-col gap-3 rounded-[18px] border border-primary/25 bg-accent/60 p-4', !compact && 'sm:flex-row sm:items-center')}>
            {!compact && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-white text-primary"><Gift className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>}
            <div className="min-w-0 flex-1">
              {h.type === 'complete' ? (
                <>
                  <p className="flex items-center gap-2 text-[15px] font-semibold">{compact && <Gift className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />}{t('cart_complete_title', { name })}</p>
                  <p className="text-[14px] text-brand-ink-soft">{t('cart_complete_text', {
                    items: h.pieces.map((p) => (p.quantity > 1 ? `${p.quantity}x ${p.piece?.product?.name}` : p.piece?.product?.name)).join(', '),
                    pct: pct(Number(h.tag.pct) || 0),
                  })}</p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-[15px] font-semibold">{compact && <Gift className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.9} aria-hidden="true" />}{t('cart_loose_title', { name, pct: pct(kitPctOf(h.kit)) })}</p>
                  <p className="text-[14px] text-brand-ink-soft">{t('cart_loose_text')}</p>
                </>
              )}
            </div>
            {h.type === 'complete' && !h.choose ? (
              <button type="button" onClick={() => addMissing(h)} disabled={busy === h.kit.id}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60">
                {busy === h.kit.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                {t('cart_complete_add')}
              </button>
            ) : (
              <Link to={kitHref(h.kit)} onClick={onNavigate} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-brand-card-border bg-white px-4 text-[14px] font-semibold transition-colors duration-150 hover:border-foreground/30">
                {h.type === 'complete' ? t('cart_complete_choose') : t('cart_loose_cta')}<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Percentual do kit pelo preço de tabela (kitPct, a mesma regra do carrinho e do servidor). */
function kitPctOf(kit: { discount_type: string; discount_value: number; pieces: { quantity: number; product: { price: number | string } | null }[] }) {
  return kitPct(kit.discount_type, Number(kit.discount_value), kit.pieces.reduce((s, p) => s + (Number(p.product?.price) || 0) * p.quantity, 0));
}
