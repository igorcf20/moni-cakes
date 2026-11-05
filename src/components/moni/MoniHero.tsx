// Hero cinematográfico da Moni Cakes: título monumental, composição de bolos em camadas, texto editorial à
// esquerda, destaques do catálogo à direita e seletor flutuante de bolos.
// Movimento (entrada, troca de bolo, parallax, rolagem): src/components/moni/useMoniMotion.ts e a troca abaixo.
// Sem JavaScript de animação, tudo fica visível e o seletor continua a funcionar (troca imediata).
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import gsap from 'gsap';
import { useMessages } from '@/i18n';
import { moniHomeMessages } from '@/i18n/moniHome';
import { HERO_CAKES, HIGHLIGHTS, PETALS, type HeroCake, type Layer } from '@/lib/moniHome';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function CakeLayer({ layer, eager }: { layer: Layer; eager: boolean }) {
  const [w, h] = layer.size;
  return (
    <div
      className={`mc-layer${layer.desktopOnly ? ' hidden lg:block' : ''}`}
      data-mc-layer={layer.main ? 'main' : 'deco'}
      data-depth={layer.depth}
      style={{ left: `${layer.x - layer.w / 2}%`, bottom: `${layer.bottom}%`, width: `${layer.w}%`, zIndex: layer.z }}
    >
      <div data-mc-parallax>
        <img src={layer.src} alt="" width={w} height={h} loading={eager ? 'eager' : 'lazy'} decoding="async"
          {...{ fetchpriority: eager && layer.main ? 'high' : 'auto' }} draggable={false}
          style={layer.flip ? { transform: 'scaleX(-1)' } : undefined} />
      </div>
    </div>
  );
}

function Scene({ cake, active, eager }: { cake: HeroCake; active: boolean; eager: boolean }) {
  return (
    <div className="mc-scene" data-mc-scene={cake.id} data-active={active} aria-hidden={!active}>
      <div className="mc-shadow" />
      {cake.layers.map((l, i) => <CakeLayer key={i} layer={l} eager={eager} />)}
    </div>
  );
}

export function MoniHero({ active, onSelect, order }: {
  active: number;
  onSelect: (i: number) => void;
  order: { href: string; external: boolean };
}) {
  const { t } = useMessages(moniHomeMessages);
  const stage = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const prev = useRef(active);
  const cake = HERO_CAKES[active];
  const go = (d: number) => onSelect((active + d + HERO_CAKES.length) % HERO_CAKES.length);

  // Troca de bolo: o atual sai (desce, encolhe e some), o novo entra com escala e deslocamento, as camadas
  // decorativas acompanham com pequeno atraso e o nome e a descrição atualizam. ~650 ms no total.
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = active;
    if (from === active || !stage.current || reduceMotion()) return;
    const root = stage.current;
    const out = root.querySelector<HTMLElement>(`[data-mc-scene="${HERO_CAKES[from].id}"]`);
    const inn = root.querySelector<HTMLElement>(`[data-mc-scene="${HERO_CAKES[active].id}"]`);
    if (!out || !inn) return;
    const ctx = gsap.context(() => {
      const outLayers = out.querySelectorAll('[data-mc-layer]');
      const inMain = inn.querySelectorAll('[data-mc-layer="main"]');
      const inDeco = inn.querySelectorAll('[data-mc-layer="deco"]');
      gsap.set([out, inn], { autoAlpha: 1 });
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => { gsap.set(out, { autoAlpha: 0 }); } });
      tl.to(outLayers, { autoAlpha: 0, y: 24, scale: 0.94, duration: 0.32, ease: 'power2.in', stagger: 0.02 }, 0)
        .fromTo(inMain, { autoAlpha: 0, y: 36, scale: 1.08 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6 }, 0.18)
        .fromTo(inDeco, { autoAlpha: 0, y: 20, scale: 0.9 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.04 }, 0.26);
      const captions = section.current?.querySelectorAll('[data-mc-caption]') ?? [];
      if (captions.length) tl.fromTo(captions, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 0.3);
      tl.add(() => { gsap.set(outLayers, { autoAlpha: 1, y: 0, scale: 1 }); });
    }, root);
    return () => ctx.revert();
  }, [active]);

  // Título monumental: ocupa quase toda a largura, mas nunca transborda (cada idioma tem um comprimento).
  const { locale } = useMessages(moniHomeMessages);
  useEffect(() => {
    const el = title.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      const lines = Array.from(el.querySelectorAll<HTMLElement>('.mc-line'));
      const avail = el.clientWidth;
      const widest = Math.max(el.scrollWidth, ...lines.map((l) => l.getBoundingClientRect().width));
      if (widest > avail) el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * avail * 0.97) / widest}px`;
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => undefined);
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [locale]);

  const OrderLink = ({ className, children }: { className: string; children: React.ReactNode }) => order.external
    ? <a href={order.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <Link to={order.href} className={className}>{children}</Link>;

  return (
    <section ref={section} className="mc-hero" data-mc-hero aria-labelledby="mc-hero-title">
      <div className="mc-hero__bg" data-mc-bg />
      <div className="mc-hero__light" data-mc-light />
      <div className="mc-hero__floor" />
      {/* Maré creme: sobe com a rolagem (cena 2) e liga o hero ao catálogo sem corte. */}
      <div className="mc-hero__tide" data-mc-cream aria-hidden="true">
        <svg viewBox="0 0 1440 110" preserveAspectRatio="none"><path fill="currentColor" d="M0,62 C180,20 360,96 560,70 C760,44 900,6 1100,30 C1260,50 1360,84 1440,70 L1440,110 L0,110 Z" /></svg>
        <div />
      </div>

      {PETALS.map((p, i) => (
        <img key={i} src={p.src} alt="" aria-hidden="true" className={`mc-petal${i > 2 ? ' hidden lg:block' : ''}`} data-mc-petal data-delay={p.delay}
          width={p.size} height={p.size} style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, transform: `rotate(${p.rot}deg)` }} />
      ))}

      <div className="relative z-[4] mx-auto flex min-h-[100svh] max-w-[1440px] flex-col px-4 pb-16 pt-[88px] sm:px-6 lg:px-12 lg:pb-[110px] lg:pt-[110px]">
        <h1 ref={title} id="mc-hero-title" className="mc-title mc-display" data-mc-title>
          <span className="mc-line"><span data-mc-word>{t('heroTitleA')}</span></span>{' '}
          <span className="mc-line"><span data-mc-word>{t('heroTitleB')}</span></span>
        </h1>

        <div className="relative mt-2 grid flex-1 items-end gap-6 lg:-mt-[3vw] lg:grid-cols-[minmax(240px,1fr)_auto_minmax(280px,1fr)] lg:items-center lg:gap-4">
          {/* Coluna esquerda (no celular vai para baixo do bolo) */}
          <div className="order-3 max-w-[360px] lg:order-1 lg:self-start lg:pt-[6vh]" data-mc-side="left">
            <p className="hidden border-l border-[#fff5e9]/50 pl-6 text-[19px] leading-[1.55] text-[#fff5e9]/95 lg:block mc-serif" data-mc-side-item>
              {t('heroLead')}
            </p>
            <p className="text-[17px] leading-snug text-[#fff5e9]/95 lg:hidden" data-mc-side-item>{t('heroLeadShort')}</p>
            <a href="#nossos-bolos" className="mc-side-link mt-6 lg:ml-6" data-mc-side-item>
              {t('heroLink')} <ArrowRight className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
            </a>
            <div className="mt-10 hidden pl-6 lg:block" data-mc-side-item>
              <div data-mc-caption aria-live="polite">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f6d3a6]">{t('sampleNote')}</p>
                <p className="mc-serif mt-2 text-[24px] leading-tight text-[#fff5e9]">{t(cake.name)}</p>
                <p className="mt-1 max-w-[250px] text-[14px] leading-snug text-[#fff5e9]/80">{t(cake.text)}</p>
              </div>
            </div>
          </div>

          {/* Centro: composição dos bolos */}
          <div className="order-1 flex justify-center lg:order-2" data-mc-stage-wrap>
            <div ref={stage} className="mc-stage" data-mc-stage>
              {HERO_CAKES.map((c, i) => <Scene key={c.id} cake={c} active={i === active} eager={i === 0} />)}
            </div>
          </div>

          {/* Coluna direita: destaques do catálogo */}
          <ul className="order-4 hidden flex-col gap-5 lg:order-3 lg:flex lg:justify-self-end" aria-label={t('highlightsAria')} data-mc-side="right">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} data-mc-side-item>
                <Link to={h.href} className="mc-hl" aria-label={t('hlDetails', { name: t(h.title) })}>
                  <span className="mc-hl__img"><img src={h.img} alt="" width={96} height={96} loading="lazy" /></span>
                  <span>
                    <span className="mc-serif block text-[22px] leading-tight text-[#fff5e9]">{t(h.title)}</span>
                    <span className="mt-1 block max-w-[210px] text-[14px] leading-snug text-[#fff5e9]/80">{t(h.text)}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 text-[#fbd9c0]" strokeWidth={1.6} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Seletor + nome e descrição do bolo em destaque */}
          <div className="order-2 flex flex-col items-center gap-3 lg:order-4 lg:col-span-3 lg:-mt-4" data-mc-picker>
            <div className="text-center lg:hidden" data-mc-caption>
              <p className="mc-serif text-[22px] leading-tight text-[#fff5e9] lg:text-[24px]">{t(cake.name)}</p>
              <p className="mx-auto mt-1 max-w-[340px] text-[14px] leading-snug text-[#fff5e9]/80">{t(cake.text)}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#fff5e9]/55">{t('sampleNote')}</p>
            </div>
            <div className="mc-picker" role="group" aria-label={t('pickerAria')}>
              <button type="button" className="mc-picker__arrow hidden sm:grid" onClick={() => go(-1)} aria-label={t('pickerPrev')}>
                <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
              </button>
              {HERO_CAKES.map((c, i) => (
                <button key={c.id} type="button" className="mc-picker__btn" aria-pressed={i === active}
                  aria-label={t('pickerItem', { name: t(c.name) })} onClick={() => onSelect(i)}>
                  <img src={c.thumb} alt="" width={120} height={100} loading="lazy" />
                </button>
              ))}
              <button type="button" className="mc-picker__arrow hidden sm:grid" onClick={() => go(1)} aria-label={t('pickerNext')}>
                <ChevronRight className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>
            <OrderLink className="mc-btn mc-btn--coral mt-2 lg:hidden">{t('orderCta')}</OrderLink>
          </div>

          {/* Destaques no celular e tablet: lista simples abaixo do texto */}
          <ul className="order-5 grid gap-2 sm:grid-cols-3 lg:hidden" aria-label={t('highlightsAria')}>
            {HIGHLIGHTS.map((h) => (
              <li key={h.title}>
                <Link to={h.href} className="flex items-center gap-3 rounded-2xl bg-[#fff5e9]/10 p-2 pr-3 ring-1 ring-[#fff5e9]/20">
                  <span className="mc-hl__img !h-14 !w-14"><img src={h.img} alt="" width={96} height={96} loading="lazy" /></span>
                  <span className="mc-serif text-[18px] leading-tight text-[#fff5e9]">{t(h.title)}</span>
                  <ArrowRight className="ml-auto h-4 w-4 text-[#fbd9c0]" strokeWidth={1.6} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <svg className="mc-hero__wave" viewBox="0 0 1440 110" preserveAspectRatio="none" aria-hidden="true">
        <path fill="currentColor" d="M0,62 C180,20 360,96 560,70 C760,44 900,6 1100,30 C1260,50 1360,84 1440,70 L1440,110 L0,110 Z" />
      </svg>
    </section>
  );
}
