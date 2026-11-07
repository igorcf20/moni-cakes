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
import { useBrand } from '@/hooks/useBrand';
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
  const brand = useBrand();
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

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <section ref={section} className="mc-hero" data-mc-hero aria-labelledby="mc-hero-title">
      <div className="mc-hero__bg" data-mc-bg />
      <div className="mc-hero__light" data-mc-light />
      <div className="mc-hero__floor" aria-hidden="true" />
      {/* Abertura de cena: faixa de luz que atravessa o título e faixas de cinema que se afastam do centro.
          Sem JavaScript (ou com "reduzir movimento") ficam fora de vista. */}
      <div className="mc-hero__sheen" data-mc-sheen aria-hidden="true" />
      <div className="mc-letterbox mc-letterbox--top" data-mc-letterbox aria-hidden="true" />
      <div className="mc-letterbox mc-letterbox--bottom" data-mc-letterbox aria-hidden="true" />
      {/* Maré creme: sobe com a rolagem (cena 2) e liga o hero ao catálogo sem corte. */}
      <div className="mc-hero__tide" data-mc-cream aria-hidden="true">
        <svg viewBox="0 0 1440 110" preserveAspectRatio="none"><path fill="currentColor" d="M0,62 C180,20 360,96 560,70 C760,44 900,6 1100,30 C1260,50 1360,84 1440,70 L1440,110 L0,110 Z" /></svg>
        <div />
      </div>

      {PETALS.map((p, i) => (
        <img key={i} src={p.src} alt="" aria-hidden="true" className={`mc-petal${i > 2 ? ' hidden lg:block' : ''}`} data-mc-petal data-delay={p.delay}
          width={p.size} height={p.size} style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, transform: `rotate(${p.rot}deg)` }} />
      ))}

      <div className="mc-hero__frame">
        {/* Título monumental atrás dos bolos: o topo da composição cobre a base das letras (sobreposição controlada). */}
        <h1 ref={title} id="mc-hero-title" className="mc-title mc-display" data-mc-title>
          <span className="mc-line"><span data-mc-word>{t('heroTitleA')}</span></span>{' '}
          <span className="mc-line"><span data-mc-word>{t('heroTitleB')}</span></span>
        </h1>

        {/* Centro: composição dos bolos sobre a superfície do estúdio */}
        <div className="mc-hero__stagewrap" data-mc-stage-wrap>
          <div ref={stage} className="mc-stage" data-mc-stage>
            {HERO_CAKES.map((c, i) => <Scene key={c.id} cake={c} active={i === active} eager={i === 0} />)}
            <svg className="mc-badge" viewBox="0 0 120 120" aria-hidden="true" data-mc-badge>
              <defs><path id="mc-badge-path" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" /></defs>
              <circle cx="60" cy="60" r="58" className="mc-badge__disc" />
              <text><textPath href="#mc-badge-path" startOffset="0" textLength="286" lengthAdjust="spacing">{t('heroBadge', { store: brand.name })}</textPath></text>
              <path d="M60 47l3 10 10 3-10 3-3 10-3-10-10-3 10-3z" className="mc-badge__icon" />
            </svg>
          </div>
        </div>

        {/* Esquerda: texto editorial (no celular, versão curta depois do seletor) */}
        <div className="mc-hero__left" data-mc-side="left">
          <p className="mc-hero__lead mc-serif" data-mc-side-item>
            <span className="hidden lg:inline">{t('heroLead')}</span>
            <span className="lg:hidden">{t('heroLeadShort')}</span>
          </p>
          <a href="#nossos-bolos" className="mc-side-link mt-5" data-mc-side-item>
            {t('heroLink')} <ArrowRight className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          </a>
        </div>

        {/* Direita: destaques do catálogo */}
        <ul className="mc-hero__right" aria-label={t('highlightsAria')} data-mc-side="right">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title} data-mc-side-item>
              <Link to={h.href} className="mc-hl" aria-label={t('hlDetails', { name: t(h.title) })}>
                <span className="mc-hl__img"><img src={h.img} alt="" width={96} height={96} loading="lazy" /></span>
                <span className="min-w-0">
                  <span className="mc-serif block text-[19px] leading-tight text-[#fff5e9] lg:text-[21px]">{t(h.title)}</span>
                  <span className="mt-1 hidden max-w-[200px] text-[13.5px] leading-snug text-[#fff5e9]/75 lg:block">{t(h.text)}</span>
                </span>
                <ArrowRight className="h-5 w-5 text-[#fbd9c0]" strokeWidth={1.6} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        {/* Barra flutuante: nome e descrição do bolo em destaque + miniaturas */}
        <div className="mc-hero__dockwrap" data-mc-picker>
          <div className="mc-dock">
            <div className="mc-dock__caption" data-mc-caption aria-live="polite">
              <span className="mc-dock__index mc-serif" aria-hidden="true">{pad(active + 1)}<small>/{pad(HERO_CAKES.length)}</small></span>
              <span className="min-w-0">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.24em] text-[#f6d3a6]">{t('sampleNote')}</span>
                <span className="mc-serif mt-0.5 block text-[21px] leading-tight text-[#fff5e9]">{t(cake.name)}</span>
                <span className="mc-dock__text mt-0.5 block text-[13px] leading-snug text-[#fff5e9]/75">{t(cake.text)}</span>
                <Link to={cake.href} className="mc-dock__more">{t('cakeDetails')} <ArrowRight className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /></Link>
              </span>
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
          </div>
          <div className="mt-4 lg:hidden"><OrderLink className="mc-btn mc-btn--coral">{t('orderCta')}</OrderLink></div>
        </div>

        <a href="#nossos-bolos" className="mc-hero__scroll" data-mc-side-item>
          <span className="mc-hero__scroll-line" aria-hidden="true" />{t('scrollHint')}
        </a>
      </div>

      <svg className="mc-hero__wave" viewBox="0 0 1440 110" preserveAspectRatio="none" aria-hidden="true">
        <path fill="currentColor" d="M0,62 C180,20 360,96 560,70 C760,44 900,6 1100,30 C1260,50 1360,84 1440,70 L1440,110 L0,110 Z" />
      </svg>
    </section>
  );
}
