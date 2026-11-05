// Página inicial: kits com desconto marcados para a página inicial (Admin > Kits, recurso kits).
// Até 3 kits disponíveis (nenhuma peça esgotada); sem kits, a seção não aparece. Título e texto editáveis em
// Admin > Conteúdo da página inicial. O primeiro kit ocupa o cartão grande (capa, peças, preço e botão); os outros
// ficam em cartões menores ao lado. Capa = foto do kit ou montagem das peças (KitCover).
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Box, Gift } from 'lucide-react';
import { KitCover } from '@/components/kits/KitCover';
import { useCurrency } from '@/hooks/use-currency';
import { useKits, type KitWithPieces } from '@/hooks/useKits';
import { useMessages } from '@/i18n';
import { kitPageMessages } from '@/i18n/kits';
import { useCountry } from '@/lib/countries';
import { kitHref, kitPrices, kitText, pieceSoldOut } from '@/lib/kits';
import { formatPrice } from '@/utils/currency';
import { withVat } from '@/utils/pricing';
import { getEffectiveBasePrice } from '@/utils/promo';
import { cn } from '@/lib/utils';

export function HomeKits({ title, sub }: { title: string; sub: string }) {
  const { t: tk, locale } = useMessages(kitPageMessages);
  const t = tk as unknown as T;
  const { data = [] } = useKits({ onlyHome: true });
  const { currentCurrency, convert } = useCurrency();
  useCountry();
  const kits = data.filter((k) => k.pieces.length > 0 && !k.pieces.some((p) => pieceSoldOut(p.product))).slice(0, 3);
  if (!kits.length) return null;
  const money = (net: number) => formatPrice(convert(withVat(net)), currentCurrency);
  const pct = (v: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v);
  const pricesOf = (k: KitWithPieces) => kitPrices(k, k.pieces.map((p) => ({ list: Number(p.product?.price) || 0, unit: getEffectiveBasePrice(p.product as never) || Number(p.product?.price) || 0, quantity: p.quantity })));
  const [first, ...rest] = kits;

  return (
    <section className="bg-brand-alt" aria-labelledby="home-kits">
      <div className="shell py-14 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] text-brand-orange-text">
              <Gift className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t('kits')}
            </p>
            <h2 id="home-kits" className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.03em] md:text-[38px]">{title}</h2>
            <p className="mt-2 text-[16px] text-brand-ink-soft md:text-[17px]">{sub}</p>
          </div>
          <Link to="/kits" className="group inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-brand-orange-text">
            {t('home_all')}<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        <div className={rest.length ? 'mt-8 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : 'mt-8'}>
          <FeaturedKit kit={first} prices={pricesOf(first)} money={money} pct={pct} t={t} locale={locale} />
          {rest.length > 0 && (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)]">
              {rest.map((k, i) => (
                <SmallKit key={k.id} alone={rest.length === 1} kit={k} prices={pricesOf(k)} money={money} pct={pct} t={t} locale={locale} delay={(i + 1) * 0.06} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

type Prices = ReturnType<typeof kitPrices>;
type T = (k: string, v?: Record<string, string | number>) => string;
type CardProps = { kit: KitWithPieces; prices: Prices; money: (n: number) => string; pct: (n: number) => string; t: T; locale: string };

function OffBadge({ prices, pct, t }: Pick<CardProps, 'prices' | 'pct' | 't'>) {
  if (prices.pct <= 0) return null;
  return <span className="absolute left-3 top-3 z-10 rounded-[10px] bg-primary px-2.5 py-1 text-[13px] font-bold text-primary-foreground shadow-[var(--shadow-soft)]">{t('off', { value: pct(prices.pct) })}</span>;
}

function PriceLine({ prices, money, big }: Pick<CardProps, 'prices' | 'money'> & { big?: boolean }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className={big ? 'text-[28px] font-extrabold tabular-nums tracking-[-0.03em]' : 'text-[20px] font-extrabold tabular-nums tracking-[-0.03em]'}>{money(prices.final)}</span>
      {prices.discount > 0 && <span className="text-[14px] tabular-nums text-muted-foreground line-through">{money(prices.original)}</span>}
    </span>
  );
}

function FeaturedKit({ kit, prices, money, pct, t, locale }: CardProps) {
  const tt = t;
  const desc = kitText(kit, 'description', locale);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.25 }}>
      <Link to={kitHref(kit)} className="group grid h-full grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[24px] border border-brand-card-border bg-white transition-shadow duration-200 hover:shadow-[var(--shadow-hover)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="relative">
          <OffBadge prices={prices} pct={pct} t={t} />
          <KitCover kit={kit} pieces={kit.pieces} className="aspect-[4/3] h-full w-full md:aspect-auto md:min-h-[340px]" />
        </div>
        <div className="flex flex-col p-6 md:p-7">
          <span className="w-fit rounded-lg bg-accent px-2 py-0.5 text-[12px] font-semibold text-brand-orange-text">{tt('home_badge')}</span>
          <h3 className="mt-3 text-[24px] font-bold leading-tight tracking-[-0.025em]">{kitText(kit, 'name', locale)}</h3>
          {desc && <p className="mt-1.5 line-clamp-2 text-[15px] text-brand-ink-soft">{desc}</p>}
          <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{tt('home_includes')}</p>
          <ul className="mt-2 space-y-2">
            {kit.pieces.slice(0, 4).map((p) => (
              <li key={p.product_id} className="flex items-center gap-3">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-brand-alt">
                  {p.product?.image ? <img src={p.product.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Box className="m-2.5 h-5 w-5 text-primary" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{p.product?.name}</span>
                {p.quantity > 1 && <span className="text-[14px] font-semibold tabular-nums text-muted-foreground">{p.quantity}x</span>}
              </li>
            ))}
            {kit.pieces.length > 4 && <li className="text-[14px] text-muted-foreground">{tt('home_more', { count: kit.pieces.length - 4 })}</li>}
          </ul>
          <div className="mt-auto pt-6">
            <PriceLine prices={prices} money={money} big />
            {prices.discount > 0 && <p className="mt-0.5 text-[14px] font-semibold text-brand-orange-text">{tt('save', { value: money(prices.discount) })}</p>}
            <span className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-colors duration-150 group-hover:bg-primary-hover sm:w-auto">
              {tt('in_kit_cta')}<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function SmallKit({ kit, prices, money, pct, t, locale, delay, alone }: CardProps & { delay: number; alone: boolean }) {
  const tt = t;
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.25, delay }}>
      {/* Sozinho na coluna: cartão em pé (capa em cima); com outro kit: deitado (capa à esquerda). */}
      <Link to={kitHref(kit)} className={cn('group flex h-full gap-4 overflow-hidden rounded-[20px] border border-brand-card-border bg-white p-3 transition-shadow duration-200 hover:shadow-[var(--shadow-hover)]', alone && 'lg:flex-col')}>
        <div className={cn('relative w-[42%] shrink-0 overflow-hidden rounded-[14px]', alone && 'lg:min-h-[200px] lg:w-full lg:flex-1')}>
          <KitCover kit={kit} pieces={kit.pieces} className={cn('aspect-square h-full w-full', alone && 'lg:absolute lg:inset-0 lg:aspect-auto')} />
        </div>
        <div className={cn('flex min-w-0 flex-1 flex-col py-1 pr-1', alone && 'lg:px-2 lg:pb-2')}>
          {prices.pct > 0 && <span className="w-fit rounded-lg bg-primary px-2 py-0.5 text-[12px] font-bold text-primary-foreground">{tt('off', { value: pct(prices.pct) })}</span>}
          <h3 className="mt-2 text-[17px] font-bold leading-snug tracking-[-0.02em]">{kitText(kit, 'name', locale)}</h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
            {kit.pieces.map((p) => (p.quantity > 1 ? `${p.quantity}x ${p.product?.name ?? ''}` : p.product?.name)).filter(Boolean).join(', ')}
          </p>
          <div className="mt-auto pt-3">
            <PriceLine prices={prices} money={money} />
            <span className="mt-1 inline-flex items-center gap-1 text-[14px] font-semibold text-brand-orange-text">
              {tt('in_kit_cta')}<ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}
