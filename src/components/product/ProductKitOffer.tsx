// Página do produto: "Este produto faz parte de um kit" (recurso kits). Mostra até 2 kits com as outras peças,
// o desconto e o link para a página do kit. Some sem kits, com o recurso desligado ou com "Página do produto"
// desligado em Admin > Kits > Onde oferecer (store_settings.kits, que também diz quantos kits mostrar).
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Box, Gift } from 'lucide-react';
import { useKitsWithProducts } from '@/hooks/useKits';
import { useKitSettings } from '@/hooks/useOfferSettings';
import { useMessages } from '@/i18n';
import { kitPageMessages } from '@/i18n/kits';
import { DEFAULT_KIT_SETTINGS, kitHref, kitPrices, kitText, pieceSoldOut } from '@/lib/kits';
import { getEffectiveBasePrice } from '@/utils/promo';

export function ProductKitOffer({ productId }: { productId: string }) {
  const { t, locale } = useMessages(kitPageMessages);
  const { data: settings = DEFAULT_KIT_SETTINGS } = useKitSettings();
  const { data } = useKitsWithProducts(settings.productPage ? [productId] : []);
  const kits = (data?.kits ?? []).filter((k) => k.pieces.reduce((n, p) => n + p.quantity, 0) > 1 && !k.pieces.some((p) => pieceSoldOut(p.product))).slice(0, settings.productPageLimit);
  if (!settings.productPage || !kits.length) return null;
  const pct = (v: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v);

  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      aria-labelledby="pdp-kits" className="mt-5 rounded-[20px] border border-primary/25 bg-accent/60 p-4 sm:p-5">
      <h2 id="pdp-kits" className="flex items-center gap-2 text-[15px] font-bold">
        <Gift className="h-[18px] w-[18px] text-primary" strokeWidth={1.9} aria-hidden="true" />
        {kits.length === 1 ? t('in_kit_title') : t('in_kit_title_other', { count: kits.length })}
      </h2>
      <ul className="mt-3 space-y-2.5">
        {kits.map((k) => {
          const others = k.pieces.filter((p) => String(p.product_id) !== String(productId));
          const shown = others.length ? others : k.pieces;
          const prices = kitPrices(k, k.pieces.map((p) => ({ list: Number(p.product?.price) || 0, unit: getEffectiveBasePrice(p.product as never) || Number(p.product?.price) || 0, quantity: p.quantity })));
          return (
            <li key={k.id}>
              <Link to={kitHref(k)} className="group flex items-center gap-3 rounded-[16px] bg-white p-3 transition-shadow duration-200 hover:shadow-[var(--shadow-hover)]">
                <span className="flex shrink-0 -space-x-3">
                  {shown.slice(0, 3).map((p, i) => (
                    <span key={i} className="relative h-12 w-12 overflow-hidden rounded-[12px] border-2 border-white bg-brand-alt">
                      {p.product?.image ? <img src={p.product.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Box className="m-3 h-6 w-6 text-primary" aria-hidden="true" />}
                    </span>
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{kitText(k, 'name', locale)}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {others.length
                      ? t('in_kit_with', { names: others.map((p) => p.product?.name).filter(Boolean).join(', ') })
                      : t('units_other', { count: k.pieces.reduce((n, p) => n + p.quantity, 0) })}
                  </span>
                  {prices.pct > 0 && <span className="text-[13px] font-semibold text-brand-orange-text">{t('in_kit_save', { pct: pct(prices.pct) })}</span>}
                </span>
                <span className="hidden items-center gap-1 text-[13px] font-semibold text-brand-orange-text sm:inline-flex">
                  {t('in_kit_cta')}<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
