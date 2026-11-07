// Movimento da página inicial Moni Cakes com GSAP + ScrollTrigger (um só motor para timelines e rolagem).
//
// Curva de sensações (método scroll-craft; o pico é a cena 3):
//  - Abertura: faixas de cinema afastam-se a partir do centro, a luz atravessa o título, o título sobe da máscara
//    e o bolo assenta; pétalas, luz e fundo vivem em planos com velocidades próprias (profundidade em camadas).
//  - Cena 1 e 2 (computador): o hero fica fixo enquanto se rola; título desliza, bolo cresce, decoração em
//    velocidades diferentes, luz muda; depois o rosa vira creme e o bolo abre espaço para Nossos Bolos (título
//    palavra a palavra, cartões revelados por máscara).
//  - Cena 3 (pico): uma íris abre-se sobre a fatia e a câmera recua; massa, recheio e cobertura pousam um a um,
//    como camadas a montar o bolo (movimento assinatura).
//  - Cena 4: o painel abre a partir de uma faixa estreita, a câmera recua e as flores flutuam em planos.
//  - Cena 5: corte de cena (a seção sobe com cantos arredondados que se abrem) e o convite assenta.
//
// Celular e tablet: tudo preso à rolagem (scrub) e com deslocamento largo, para que um arrasto rápido também mostre
// o movimento; as entradas acabam acima da barra de baixo. Só transform, opacity e clip-path. Com "reduzir
// movimento" fica só a opacidade (sem faixas, íris, máscaras nem deslocamentos); sem JavaScript a página fica estática
// e completa. Rolagem nativa (sem Lenis): âncoras, teclado e leitores de ecrã funcionam como sempre.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
// No celular a barra de endereço aparece e some durante a rolagem: isso não deve recalcular tudo a cada gesto.
ScrollTrigger.config({ ignoreMobileResize: true });

/** Recalcula as posições quando a altura da página muda depois do arranque (banners, kits, rodapé e imagens que
 *  chegam mais tarde). Sem isto, no celular os gatilhos ficam nas posições antigas e as animações disparam fora do ecrã. */
function refreshOnResize(el: HTMLElement) {
  let last = el.offsetHeight;
  let timer = 0;
  const ro = new ResizeObserver(() => {
    const h = el.offsetHeight;
    if (Math.abs(h - last) < 2) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { ScrollTrigger.refresh(); last = el.offsetHeight; }, 180);
  });
  ro.observe(el);
  return () => { ro.disconnect(); window.clearTimeout(timer); };
}

const q = <T extends Element = HTMLElement>(root: Element, sel: string) => Array.from(root.querySelectorAll<T>(sel));

export function useMoniMotion(root: RefObject<HTMLElement>, ready: boolean) {
  const reveals = useRef<{ scan: () => void } | null>(null);
  // Hero: logo na montagem (abertura, ambiente, parallax e cenas 1 e 2).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia(el);

    mm.add(
      { motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 1024px)', finePointer: '(pointer: fine)' },
      (ctx) => {
        const { motion, desktop, finePointer } = ctx.conditions as Record<string, boolean>;
        if (!motion) return;

        const hero = el.querySelector<HTMLElement>('[data-mc-hero]');
        if (!hero) return;
        const activeScene = hero.querySelector<HTMLElement>('[data-mc-scene][data-active="true"]');
        const mainLayer = activeScene ? q(activeScene, '[data-mc-layer="main"]') : [];
        const decoLayers = activeScene ? q(activeScene, '[data-mc-layer="deco"]') : [];
        const petals = q(hero, '[data-mc-petal]');
        const sideItems = q(hero, '[data-mc-side-item]');

        // ---------- Abertura de cena ----------
        // As faixas de cinema cobrem o hero no primeiro quadro e afastam-se do centro; o resto entra por baixo delas.
        const D = 0.35;
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
        intro
          .fromTo(q(hero, '[data-mc-letterbox]'), { scaleY: 1 }, { scaleY: 0, duration: 1.15, ease: 'expo.inOut' }, 0)
          .from(q(hero, '[data-mc-bg]'), { autoAlpha: 0, scale: 1.08, duration: 1.2, ease: 'power2.out' }, 0.1)
          .from(q(el, '[data-mc-header]'), { autoAlpha: 0, y: -16, duration: 0.5 }, D + 0.2)
          .from(q(hero, '[data-mc-word]'), { yPercent: 115, duration: 1.05, stagger: 0.14, ease: 'expo.out' }, D + 0.2)
          .fromTo(q(hero, '[data-mc-sheen]'), { x: 0, xPercent: -150 }, { x: 0, xPercent: 150, duration: 1.8, ease: 'power2.inOut' }, D + 0.5)
          .from(mainLayer, { autoAlpha: 0, scale: 1.14, y: 50, duration: 1.2, ease: 'expo.out' }, D + 0.5)
          .from(decoLayers, { autoAlpha: 0, y: 34, scale: 0.9, duration: 0.85, stagger: 0.07 }, D + 0.8)
          .from(petals, { autoAlpha: 0, scale: 0.6, rotation: '-=40', duration: 0.9, stagger: 0.06 }, D + 1)
          .from(q(hero, '[data-mc-badge]'), { autoAlpha: 0, scale: 0.8, duration: 0.9 }, D + 1.3)
          .from(q(hero, '[data-mc-picker]'), { autoAlpha: 0, y: 24, duration: 0.6 }, D + 1.5);
        // No celular os textos laterais ficam abaixo da dobra: entram com a rolagem (scrollReveals), não aqui.
        if (desktop) intro.from(sideItems, { autoAlpha: 0, y: 18, duration: 0.6, stagger: 0.07 }, D + 1.1);
        else intro.timeScale(1.3);

        // Movimento ambiente: pétalas a flutuar devagar, cada uma no seu ritmo.
        petals.forEach((p, i) => {
          const delay = Number(p.dataset.delay ?? i * 0.3);
          gsap.to(p, { y: i % 2 ? 14 : -12, rotation: i % 2 ? '+=10' : '-=8', duration: 4.5 + i * 0.7, delay: 2.3 + delay,
            ease: 'sine.inOut', yoyo: true, repeat: -1 });
        });

        // Parallax com o rato (computador): camadas mais próximas mexem mais; o fundo vai ao contrário.
        if (desktop && finePointer) {
          const movers = q(hero, '[data-mc-parallax]').map((node) => {
            const depth = Number(node.parentElement?.dataset.depth ?? 0.5);
            return { depth, x: gsap.quickTo(node, 'x', { duration: 0.9, ease: 'power3.out' }), y: gsap.quickTo(node, 'y', { duration: 0.9, ease: 'power3.out' }) };
          });
          const light = q(hero, '[data-mc-light]')[0];
          const lx = light && gsap.quickTo(light, 'x', { duration: 1.4, ease: 'power3.out' });
          const ly = light && gsap.quickTo(light, 'y', { duration: 1.4, ease: 'power3.out' });
          const onMove = (e: PointerEvent) => {
            const nx = e.clientX / window.innerWidth - 0.5;
            const ny = e.clientY / window.innerHeight - 0.5;
            movers.forEach((m) => { m.x(nx * 22 * m.depth); m.y(ny * 12 * m.depth); });
            if (lx && ly) { lx(nx * -40); ly(ny * -24); }
          };
          hero.addEventListener('pointermove', onMove);
          ctx.add(() => () => hero.removeEventListener('pointermove', onMove));
        }

        // ---------- Cenas 1 e 2: hero fixo e passagem para o catálogo ----------
        const stage = hero.querySelector('[data-mc-stage]');
        if (desktop) {
          const scroll = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: hero, start: 'top top', end: '+=90%', pin: true, scrub: 0.6, anticipatePin: 1 },
          });
          scroll
            .to(q(hero, '[data-mc-bg]'), { scale: 1.06, duration: 1 }, 0)
            .to(q(hero, '[data-mc-title]'), { yPercent: -22, duration: 1 }, 0)
            .to(stage, { scale: 1.1, yPercent: -4, duration: 1 }, 0)
            .to(q(hero, '[data-mc-layer="deco"]'), { yPercent: (i) => -10 - (i % 3) * 8, duration: 1 }, 0)
            .to(petals, { yPercent: (i) => -80 - i * 30, duration: 1 }, 0)
            .to(q(hero, '[data-mc-light]'), { opacity: 1, duration: 1 }, 0)
            .to(q(hero, '[data-mc-side="left"]'), { autoAlpha: 0, x: -40, duration: 0.6 }, 0.1)
            .to(q(hero, '[data-mc-side="right"]'), { autoAlpha: 0, x: 40, duration: 0.6 }, 0.1)
            .to(q(hero, '[data-mc-picker]'), { autoAlpha: 0, y: 30, duration: 0.5 }, 0.15)
            .to(q(hero, '.mc-hero__scroll, [data-mc-badge]'), { autoAlpha: 0, duration: 0.4 }, 0.1)
            // Cena 2: o rosa vira creme, o título apaga e o bolo sobe e abre espaço.
            .fromTo(q(hero, '[data-mc-cream]'), { y: 0, yPercent: 100 }, { y: 0, yPercent: 52, duration: 0.8 }, 0.7)
            .to(q(hero, '[data-mc-title]'), { autoAlpha: 0, duration: 0.5 }, 0.8)
            .to(stage, { scale: 0.94, yPercent: -16, duration: 0.8 }, 1.0)
            .to(petals, { autoAlpha: 0, duration: 0.4 }, 1.0);
        } else {
          // Celular e tablet: sem fixar o hero (rolagem natural). Cinco planos com velocidades diferentes no primeiro
          // ecrã: o fundo quase parado, o título desce e apaga atrás do bolo, o bolo sobe e aproxima-se, a decoração
          // sobe mais depressa e as pétalas (o plano da frente) voam para fora do quadro.
          const scroll = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: hero, start: 'top top', end: '+=75%', scrub: 0.4 },
          });
          scroll
            .to(q(hero, '[data-mc-bg]'), { yPercent: 8, scale: 1.08, duration: 1 }, 0)
            .to(q(hero, '[data-mc-title]'), { yPercent: 45, scale: 0.92, opacity: 0, duration: 1 }, 0)
            .to(stage, { scale: 1.16, yPercent: -8, duration: 1 }, 0)
            .to(q(hero, '[data-mc-layer="deco"]'), { yPercent: (i) => -18 - (i % 3) * 12, duration: 1 }, 0)
            .to(petals, { yPercent: (i) => -160 - i * 50, rotation: (i) => (i % 2 ? 60 : -50), duration: 1 }, 0)
            .to(q(hero, '[data-mc-light]'), { opacity: 1, scale: 1.25, duration: 1 }, 0)
            .to(q(hero, '[data-mc-badge]'), { autoAlpha: 0, scale: 0.7, duration: 0.4 }, 0);
        }

        // Fontes e imagens mudam alturas: recalcula as posições depois de carregarem.
        const refresh = () => ScrollTrigger.refresh();
        document.fonts?.ready.then(refresh).catch(() => undefined);
        window.addEventListener('load', refresh);
        ctx.add(() => () => window.removeEventListener('load', refresh));
      },
    );
    return () => mm.revert();
  }, [root]);

  // Celular e tablet: entradas desde a montagem, sem esperar pelo catálogo. Numa rede lenta, esperar deixava tudo
  // visível e depois escondia o que a pessoa já estava a ler. Ver scrollReveals.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia(el);
    mm.add({ reveals: '(max-width: 1023px), (prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
      const { reveals: on, motion } = ctx.conditions as Record<string, boolean>;
      if (!on) return;
      const r = scrollReveals(el, motion);
      reveals.current = { scan: () => { ctx.add(() => r.scan()); } };
      const stop = refreshOnResize(el);
      ctx.add(() => () => { r.stop(); stop(); reveals.current = null; });
    });
    return () => mm.revert();
  }, [root]);

  // Quando o catálogo decide a altura de Nossos Bolos: entram os cartões novos e, no computador, as cenas fixas.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !ready) return;
    reveals.current?.scan();
    const mm = gsap.matchMedia(el);
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', (ctx) => {
      desktopScenes(el);
      const stop = refreshOnResize(el);
      ctx.add(() => stop);
    });
    ScrollTrigger.refresh();
    return () => mm.revert();
  }, [root, ready]);
}

/**
 * Celular e tablet (e qualquer ecrã com "reduzir movimento"): cada bloco surge PRESO À ROLAGEM (scrub). A posição
 * do dedo decide o quadro: rolar devagar mostra a entrada devagar, um arrasto rápido também a mostra (não há
 * relógio que o gesto possa ultrapassar) e voltar para cima desfaz.
 *  - A entrada começa a 88% da altura do ecrã (acima da barra de baixo, que tapa os últimos ~10%) e acaba perto do
 *    meio, com deslocamento largo: textos 56px, passos 64px de cima, cartões 110px com máscara que abre de baixo
 *    para cima, bolo final 110px. Títulos sobem da máscara palavra a palavra.
 *  - O que já ficou para trás (salto por âncora, rolagem rápida, catálogo que chega tarde) está no estado final
 *    pela posição: nunca fica escondido.
 *  - Só opacidade, transform e clip-path, nunca visibility: o que ainda não entrou continua a ser lido e a receber o foco.
 *  - "Reduzir movimento" = menos e mais suave, não zero: fica só a opacidade, também presa à rolagem.
 *  - Cenas: íris sobre a fatia (pico), painel que abre a partir de uma faixa, corte de cena no convite final e flores
 *    soltas em planos de profundidade.
 */
type RevealKind = 'line' | 'text' | 'step' | 'card' | 'cake';
const REVEAL_NODES: [string, RevealKind][] = [
  ['[data-mc-reveal-line]', 'line'],
  ['[data-mc-fade], [data-mc-celebrate-text], [data-mc-hero] [data-mc-side-item]', 'text'],
  ['[data-mc-step]', 'step'],
  ['[data-mc-card]', 'card'],
  ['[data-mc-final-cake]', 'cake'],
];
/** Faixas de entrada (onde começa e acaba, em % da altura do ecrã a partir do topo). */
const REVEAL_RANGE: Record<RevealKind, [number, number]> = {
  line: [88, 62], text: [88, 58], step: [88, 56], card: [90, 50], cake: [88, 48],
};
function scrollReveals(el: HTMLElement, motion: boolean): { scan: () => void; stop: () => void } {
  const from: Record<RevealKind, gsap.TweenVars> = motion
    ? {
      line: { yPercent: 115 },
      text: { opacity: 0, y: 56 },
      step: { opacity: 0, y: -64 },
      card: { opacity: 0, y: 110, scale: 0.9, clipPath: 'inset(35% 0% 0% 0% round 24px)' },
      cake: { opacity: 0, y: 110, scale: 0.88 },
    }
    : { line: { opacity: 0 }, text: { opacity: 0 }, step: { opacity: 0 }, card: { opacity: 0 }, cake: { opacity: 0 } };
  const to: Record<RevealKind, gsap.TweenVars> = motion
    ? {
      line: { yPercent: 0 },
      text: { opacity: 1, y: 0 },
      step: { opacity: 1, y: 0 },
      card: { opacity: 1, y: 0, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 24px)' },
      cake: { opacity: 1, y: 0, scale: 1 },
    }
    : { line: { opacity: 1 }, text: { opacity: 1 }, step: { opacity: 1 }, card: { opacity: 1 }, cake: { opacity: 1 } };
  const known = new Set<Element>();

  // Pode correr de novo: só apanha o que ainda não conhece (os cartões chegam depois do catálogo).
  const scan = () => {
    REVEAL_NODES.forEach(([sel, kind]) => q(el, sel).forEach((node) => {
      if (known.has(node)) return;
      known.add(node);
      // A palavra do título é seguida pela sua máscara (a própria palavra está deslocada para fora dela).
      const trigger = kind === 'line' ? node.parentElement ?? node : node;
      if (!trigger.getClientRects().length) return; // sem caixa (display: none)
      // Palavras da mesma linha: cada uma começa um pouco depois da anterior (revelação em onda).
      const word = kind === 'line' ? Number(node.dataset.mcI ?? 0) : 0;
      const [s, e] = REVEAL_RANGE[kind];
      const start = `top ${s - word * 3}%`;
      const end = `top ${e - word * 3}%`;
      gsap.fromTo(node, from[kind], { ...to[kind], ease: 'none', scrollTrigger: { trigger, start, end, scrub: 0.5 } });
      const img = kind === 'card' && motion ? node.querySelector('img') : null;
      if (img) gsap.fromTo(img, { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger, start, end: 'top 25%', scrub: 0.5 } });
    }));
  };
  scan();
  const api = { scan, stop: () => undefined };

  if (!motion) return api;
  // Cena 3 (pico): íris que se abre sobre a fatia enquanto a câmera recua.
  const frame = el.querySelector<HTMLElement>('[data-mc-detail-frame]');
  if (frame) {
    const st = { trigger: frame, start: 'top 92%', end: 'top 30%', scrub: 0.5 };
    gsap.fromTo(frame, { clipPath: 'circle(16% at 50% 55%)' }, { clipPath: 'circle(78% at 50% 55%)', ease: 'none', scrollTrigger: st });
    gsap.fromTo(q(frame, '[data-mc-detail-zoom]'), { scale: 1.45, yPercent: 6 }, { scale: 1, yPercent: 0, ease: 'none', scrollTrigger: st });
  }
  // Painel da celebração: abre a partir de uma faixa estreita e a "câmera" recua, presos ao dedo.
  const celebrate = el.querySelector<HTMLElement>('[data-mc-celebrate]');
  if (celebrate) {
    const st = { trigger: celebrate, start: 'top 92%', end: 'top 20%', scrub: 0.5 };
    gsap.fromTo(celebrate.querySelector('[data-mc-celebrate-panel]'), { clipPath: 'inset(28% 12% 28% 12% round 160px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none', scrollTrigger: st });
    gsap.fromTo(q(celebrate, '[data-mc-celebrate-camera]'), { scale: 1.3 }, { scale: 1, ease: 'none', scrollTrigger: { ...st, end: 'bottom 40%' } });
  }
  // Cena 5: corte de cena, a seção sobe com os cantos arredondados que se abrem até à largura toda.
  sceneCut(el);
  // Flores e pétalas soltas em velocidades diferentes (profundidade).
  q(el, '[data-mc-depth]').forEach((node) => {
    const d = Number(node.dataset.mcDepth ?? 1);
    gsap.fromTo(node, { y: 50 * d }, { y: -50 * d, rotation: d * 8, ease: 'none',
      scrollTrigger: { trigger: node.closest('section') ?? node, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  return api;
}

/** Corte de cena do convite final (celular e computador). */
function sceneCut(el: HTMLElement) {
  const final = el.querySelector<HTMLElement>('[data-mc-final]');
  if (!final) return;
  gsap.fromTo(final, { clipPath: 'inset(0% 6% 0% 6% round 56px 56px 0px 0px)' },
    { clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0px 0px)', ease: 'none', scrollTrigger: { trigger: final, start: 'top bottom', end: 'top 35%', scrub: 0.5 } });
}

/** Computador com movimento: cenas fixas (pin) e entradas em sequência. */
function desktopScenes(el: HTMLElement) {
  // Nossos Bolos: título palavra a palavra e cartões revelados por máscara.
  const cakes = el.querySelector('[data-mc-cakes]');
  if (cakes) {
    gsap.from(q(cakes, '[data-mc-reveal-line]'), { yPercent: 115, duration: 1.1, stagger: 0.09, ease: 'expo.out', scrollTrigger: { trigger: cakes, start: 'top 75%' } });
    gsap.from(q(cakes, '[data-mc-fade]'), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.1, ease: 'power2.out', scrollTrigger: { trigger: cakes, start: 'top 70%' } });
    gsap.fromTo(q(cakes, '[data-mc-card]'), { autoAlpha: 0, y: 70, clipPath: 'inset(30% 0% 0% 0% round 24px)' },
      { autoAlpha: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 24px)', duration: 1.1, stagger: 0.12, ease: 'expo.out',
        scrollTrigger: { trigger: q(cakes, '[data-mc-cards]')[0] ?? cakes, start: 'top 80%' } });
  }

  // ---------- Cena 3 (pico): íris sobre a fatia, câmera que recua e camadas que pousam ----------
  const detail = el.querySelector<HTMLElement>('[data-mc-detail]');
  if (detail) {
    gsap.from(q(detail, '[data-mc-reveal-line]'), { yPercent: 115, duration: 1.1, stagger: 0.09, ease: 'expo.out', scrollTrigger: { trigger: detail, start: 'top 70%' } });
    gsap.from(q(detail, '[data-mc-fade]'), { autoAlpha: 0, y: 16, duration: 0.6, scrollTrigger: { trigger: detail, start: 'top 70%' } });
    const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: detail, start: 'top top', end: '+=150%', pin: true, scrub: 0.6 } });
    tl.fromTo(q(detail, '[data-mc-detail-frame]'), { clipPath: 'circle(20% at 50% 55%)' }, { clipPath: 'circle(78% at 50% 55%)', duration: 1 }, 0)
      .fromTo(q(detail, '[data-mc-detail-zoom]'), { scale: 1.5 }, { scale: 1, duration: 1 }, 0)
      .to(q(detail, '[data-mc-detail-zoom]'), { scale: 1.14, duration: 2.2 }, 1);
    q(detail, '[data-mc-step]').forEach((s, i) => {
      const at = 1 + i * 0.7;
      tl.from(s, { autoAlpha: 0, y: -60, duration: 0.6, ease: 'power2.out' }, at);
      const line = q(detail, '[data-mc-detail-line]')[i];
      const mark = q(detail, '[data-mc-detail-mark]')[i];
      if (mark) tl.from(mark, { autoAlpha: 0, duration: 0.4 }, at);
      if (line) tl.from(line, { scaleX: 0, duration: 0.5 }, at + 0.05);
    });
  }

  // ---------- Cena 4: painel que abre a partir de uma faixa, câmera simulada e parallax ----------
  const celebrate = el.querySelector<HTMLElement>('[data-mc-celebrate]');
  if (celebrate) {
    const st = { trigger: celebrate, start: 'top 85%', end: 'top 10%', scrub: 0.6 };
    gsap.fromTo(celebrate.querySelector('[data-mc-celebrate-panel]'), { clipPath: 'inset(32% 26% 32% 26% round 220px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 32px)', ease: 'none', scrollTrigger: st });
    gsap.fromTo(q(celebrate, '[data-mc-celebrate-camera]'), { scale: 1.3, xPercent: -3 }, { scale: 1, xPercent: 0, ease: 'none', scrollTrigger: { ...st, end: 'bottom 40%' } });
    gsap.from(q(celebrate, '[data-mc-celebrate-text]'), { autoAlpha: 0, y: 30, duration: 0.8, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: celebrate, start: 'top 40%' } });
  }

  // Parallax das flores e pétalas soltas das seções (data-mc-depth).
  q(el, '[data-mc-depth]').forEach((node) => {
    const d = Number(node.dataset.mcDepth ?? 1);
    gsap.fromTo(node, { y: 60 * d }, { y: -60 * d, rotation: d * 8, ease: 'none',
      scrollTrigger: { trigger: node.closest('section') ?? node, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // ---------- Cena 5: corte de cena e convite final ----------
  sceneCut(el);
  const final = el.querySelector<HTMLElement>('[data-mc-final]');
  if (final) {
    gsap.from(q(final, '[data-mc-reveal-line]'), { yPercent: 115, duration: 1.1, stagger: 0.09, ease: 'expo.out', scrollTrigger: { trigger: final, start: 'top 70%' } });
    gsap.from(q(final, '[data-mc-fade]'), { autoAlpha: 0, y: 18, duration: 0.7, stagger: 0.12, ease: 'power2.out', scrollTrigger: { trigger: final, start: 'top 65%' } });
    gsap.from(q(final, '[data-mc-final-cake]'), { autoAlpha: 0, y: 70, scale: 1.08, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: final, start: 'top 70%' } });
  }
}
