// Cenas da página inicial Moni Cakes depois do hero: Nossos Bolos (catálogo real ou cartões de exemplo sem
// preço), O Sabor em Cada Detalhe (fatia em primeiro plano), Bolos para Celebrar (painel com máscara) e
// Encomende Seu Favorito (convite final). As animações de rolagem estão em useMoniMotion.ts.
import { Link } from 'react-router-dom';
import { ArrowRight, Star } from 'lucide-react';
import { useMessages } from '@/i18n';
import { moniHomeMessages } from '@/i18n/moniHome';
import type { CardProduct } from '@/components/product/ProductCard3D';
import { MONI_IMG, SAMPLE_CARDS } from '@/lib/moniHome';

type Order = { href: string; external: boolean };

function OrderLink({ order, className, children }: { order: Order; className: string; children: React.ReactNode }) {
  return order.external
    ? <a href={order.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <Link to={order.href} className={className}>{children}</Link>;
}

/** Título com revelação por máscara (cada linha sobe de dentro de uma caixa com overflow escondido). */
function RevealTitle({ text, className, id }: { text: string; className?: string; id?: string }) {
  return (
    <h2 id={id} className={`mc-display ${className ?? ''}`} data-mc-reveal-title>
      <span className="inline-block overflow-hidden pb-[0.08em] align-top"><span className="inline-block" data-mc-reveal-line>{text}</span></span>
    </h2>
  );
}

export function OurCakes({ products, loading, order }: { products: CardProduct[]; loading: boolean; order: Order }) {
  const { t } = useMessages(moniHomeMessages);
  const real = products.slice(0, 4);
  return (
    <section id="nossos-bolos" className="mc-cream-tex relative scroll-mt-6 pb-24 pt-14 lg:pb-32 lg:pt-20" aria-labelledby="mc-cakes-title" data-mc-cakes>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-12">
        <div className="text-center">
          <p className="mc-eyebrow" data-mc-fade>{t('cakesEyebrow')}</p>
          <RevealTitle id="mc-cakes-title" text={t('cakesTitle')} className="mt-3 text-[52px] text-primary sm:text-[64px] lg:text-[84px]" />
          <p className="mc-serif mt-2 text-[20px] text-[hsl(var(--brand-ink-soft))] lg:text-[24px]" data-mc-fade>{t('cakesLead')}</p>
        </div>

        {loading ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className={`aspect-[4/5] animate-pulse rounded-3xl bg-white/70${i > 1 ? ' hidden sm:block' : ''}`} />)}
          </div>
        ) : real.length > 0 ? (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-mc-cards>
            {real.map((p) => (
              <li key={p.id} data-mc-card>
                <article className="mc-card h-full">
                  <Link to={`/produto/${p.id}`} className="mc-card__photo" tabIndex={-1} aria-hidden="true">
                    {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  </Link>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="mc-serif text-[24px] leading-tight text-[hsl(var(--brand-ink-soft))]">
                      <Link to={`/produto/${p.id}`} className="hover:text-primary">{p.name}</Link>
                    </h3>
                    {(p.reviews ?? 0) > 0 && (
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <Star className="h-4 w-4 fill-[#b98242] text-[#b98242]" aria-hidden="true" />{(p.rating ?? 0).toFixed(1)} ({p.reviews})
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                      <span className="text-lg font-semibold text-primary">{p.price}</span>
                      <Link to={`/produto/${p.id}`} className="mc-btn mc-btn--rose !min-h-[42px] !px-4 text-sm">{t('cakesOrder')}</Link>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="mt-12 grid gap-6 md:grid-cols-3" data-mc-cards>
              {SAMPLE_CARDS.map((c) => (
                <li key={c.title} data-mc-card>
                  <article className="mc-card h-full">
                    <div className="mc-card__photo">
                      <img src={c.img} alt="" className="h-[78%] w-auto object-contain drop-shadow-[0_18px_18px_rgba(90,30,40,0.25)]" loading="lazy" />
                      <span className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--brand-ink-soft))]">{t('cakesSoon')}</span>
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="mc-serif text-[26px] leading-tight text-[hsl(var(--brand-ink-soft))]">{t(c.title)}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{t(c.text)}</p>
                      <div className="mt-auto pt-6">
                        <OrderLink order={order} className="mc-btn mc-btn--rose !min-h-[44px] text-sm">{t('cakesAsk')} <ArrowRight className="mc-btn__arrow h-4 w-4" aria-hidden="true" /></OrderLink>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-8 max-w-xl text-center text-[15px] text-muted-foreground" data-mc-fade>{t('cakesSoonText')}</p>
          </>
        )}

        <div className="mt-12 text-center" data-mc-fade>
          <Link to="/produtos" className="mc-btn mc-btn--ghost text-primary">{t('cakesAll')} <ArrowRight className="mc-btn__arrow h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}

export function FlavorDetail() {
  const { t } = useMessages(moniHomeMessages);
  const steps = [
    { n: '01', title: t('detailStep1Title'), text: t('detailStep1Text') },
    { n: '02', title: t('detailStep2Title'), text: t('detailStep2Text') },
    { n: '03', title: t('detailStep3Title'), text: t('detailStep3Text') },
  ];
  return (
    <section className="mc-detail relative overflow-hidden" aria-labelledby="mc-detail-title" data-mc-detail>
      <div className="mx-auto grid min-h-[100svh] max-w-[1320px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12">
        <div className="mc-detail__frame aspect-[4/3.6] lg:aspect-[4/4.2]" data-mc-detail-frame>
          <div className="absolute inset-0 grid place-items-center" data-mc-detail-zoom>
            <img src={MONI_IMG.slice} alt={t('cakeStrawberryName')} width={323} height={387} className="h-[74%] w-auto drop-shadow-[0_26px_26px_rgba(90,30,40,0.3)]" loading="lazy" />
          </div>
          {/* Marcas finas que apontam para as camadas (aparecem com a rolagem) */}
          <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
            {[34, 50, 64].map((top, i) => (
              <span key={top} className="absolute right-[6%] flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b98242]" style={{ top: `${top}%` }} data-mc-detail-mark>
                <span className="h-px w-16 origin-right bg-[#b98242]/70" data-mc-detail-line />{steps[i].n}
              </span>
            ))}
          </div>
          <p className="absolute left-5 top-4 z-[1] text-[11px] lg:bottom-4 lg:top-auto uppercase tracking-[0.2em] text-[hsl(var(--brand-ink-soft))]/60">{t('sampleNote')}</p>
        </div>
        <div>
          <p className="mc-eyebrow mc-eyebrow--left" data-mc-fade>{t('detailEyebrow')}</p>
          <RevealTitle id="mc-detail-title" text={t('detailTitle')} className="mt-4 text-[44px] text-[hsl(var(--brand-ink-soft))] sm:text-[56px] lg:text-[68px]" />
          <ol className="mt-10 space-y-8">
            {steps.map((s) => (
              <li key={s.n} className="mc-step grid grid-cols-[48px_1fr] gap-4 border-t border-[#b98242]/25 pt-6" data-mc-step>
                <span className="mc-serif text-[26px] text-[#b98242]">{s.n}</span>
                <div>
                  <h3 className="mc-serif text-[28px] leading-tight text-primary">{s.title}</h3>
                  <p className="mt-2 max-w-md text-[16px] leading-relaxed text-[hsl(var(--brand-ink-soft))]/85">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function Celebrate({ order }: { order: Order }) {
  const { t } = useMessages(moniHomeMessages);
  return (
    <section className="bg-[#fbe6dc] px-3 py-16 sm:px-6 lg:px-12 lg:py-24" aria-labelledby="mc-celebrate-title" data-mc-celebrate>
      <div className="mc-celebrate__panel mx-auto max-w-[1400px]" data-mc-celebrate-panel>
        <div className="absolute inset-0" data-mc-celebrate-camera>
          <div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_68%_55%,rgba(255,226,214,0.55),transparent_70%)]" />
          <img src={MONI_IMG.floral} alt="" width={618} height={622} loading="lazy"
            className="absolute bottom-[4%] right-[4%] w-[62%] max-w-[620px] drop-shadow-[0_30px_30px_rgba(60,15,25,0.35)] sm:w-[48%] lg:right-[8%] lg:w-[40%]" />
          <img src={MONI_IMG.chocolate} alt="" width={364} height={390} loading="lazy"
            className="absolute bottom-[8%] right-[40%] hidden w-[20%] max-w-[300px] drop-shadow-[0_24px_24px_rgba(60,15,25,0.3)] lg:block" style={{ zIndex: -1 }} />
        </div>
        <img src={MONI_IMG.rose1} alt="" aria-hidden="true" width={169} height={151} loading="lazy" className="absolute bottom-[6%] right-[2%] w-[16%] max-w-[180px]" data-mc-depth="1.2" />
        <img src={MONI_IMG.petals[2]} alt="" aria-hidden="true" width={61} height={52} loading="lazy" className="absolute right-[46%] top-[64%] w-[44px] lg:right-[42%] lg:top-[14%]" data-mc-depth="2" />
        <img src={MONI_IMG.petals[0]} alt="" aria-hidden="true" width={66} height={64} loading="lazy" className="absolute right-[6%] top-[56%] w-[52px] lg:right-[12%] lg:top-[22%]" data-mc-depth="1.6" />
        <div className="relative z-[2] flex min-h-[inherit] max-w-[560px] flex-col justify-center p-7 pb-[62%] sm:p-12 sm:pb-[52%] lg:p-20 lg:pb-20">
          <p className="mc-eyebrow mc-eyebrow--left !text-[#f6d3a6]" data-mc-celebrate-text>{t('celebrateEyebrow')}</p>
          <h2 id="mc-celebrate-title" className="mc-display mt-4 text-[48px] text-[#fff5e9] sm:text-[64px] lg:text-[84px]" data-mc-celebrate-text>{t('celebrateTitle')}</h2>
          <p className="mt-6 text-[17px] leading-relaxed text-[#fff5e9]/90" data-mc-celebrate-text>{t('celebrateText')}</p>
          <div className="mt-9" data-mc-celebrate-text>
            <OrderLink order={order} className="mc-btn mc-btn--coral">{t('celebrateCta')} <ArrowRight className="mc-btn__arrow h-4 w-4" aria-hidden="true" /></OrderLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalOrder({ order }: { order: Order }) {
  const { t } = useMessages(moniHomeMessages);
  return (
    <section id="encomendar" className="mc-final scroll-mt-6" aria-labelledby="mc-final-title" data-mc-final>
      <img src={MONI_IMG.rose2} alt="" aria-hidden="true" width={191} height={157} loading="lazy" className="absolute -left-6 top-10 w-[120px] opacity-90 lg:w-[170px]" data-mc-depth="1.4" />
      <img src={MONI_IMG.petals[1]} alt="" aria-hidden="true" width={51} height={50} loading="lazy" className="absolute left-[38%] top-[12%] w-[38px]" data-mc-depth="2" />
      <img src={MONI_IMG.rose1} alt="" aria-hidden="true" width={169} height={151} loading="lazy" className="absolute -right-4 bottom-8 hidden w-[150px] opacity-90 lg:block" data-mc-depth="1.2" />
      <div className="relative mx-auto grid max-w-[1320px] items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-12 lg:py-28">
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <p className="mc-eyebrow" data-mc-fade>{t("finalEyebrow")}</p>
          <RevealTitle id="mc-final-title" text={t('finalTitle')} className="mt-4 text-[46px] text-primary sm:text-[60px] lg:text-[76px]" />
          <p className="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-[hsl(var(--brand-ink-soft))] lg:mx-0" data-mc-fade>{t('finalText')}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3 lg:justify-start" data-mc-fade>
            <OrderLink order={order} className="mc-btn mc-btn--rose min-h-[56px] px-8 text-[16px]">{t('finalCta')} <ArrowRight className="mc-btn__arrow h-5 w-5" aria-hidden="true" /></OrderLink>
            <Link to="/produtos" className="mc-btn mc-btn--ghost min-h-[56px] text-primary">{t('finalSecondary')}</Link>
          </div>
        </div>
        <div className="relative order-1 flex justify-center lg:order-2" data-mc-final-cake>
          <div className="absolute bottom-[4%] h-[10%] w-[70%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(120,40,55,0.3),transparent)] blur-md" />
          <img src={MONI_IMG.floral} alt="" width={618} height={622} loading="lazy" className="relative w-[78%] max-w-[520px] drop-shadow-[0_24px_24px_rgba(90,30,40,0.25)]" />
        </div>
      </div>
    </section>
  );
}
