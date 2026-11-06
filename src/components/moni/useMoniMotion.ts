// Movimento da página inicial Moni Cakes com GSAP + ScrollTrigger (um só motor para timelines e rolagem).
//
//  - Entrada do hero: fundo, título por máscara, bolo principal (1.12 -> 1), bolos secundários, pétalas, textos
//    laterais e seletor, em sequência (~2,2 s).
//  - Cena 1 e 2 (computador): o hero fica fixo enquanto se rola; título desliza, bolo cresce, decoração em
//    velocidades diferentes, luz muda, textos laterais somem; depois o rosa vira creme e o bolo abre espaço
//    para o catálogo (Nossos Bolos), cujo título aparece por máscara e os cartões entram em sequência.
//  - Cena 3: a fatia aproxima-se e os passos (massa, recheio, cobertura) aparecem um a um.
//  - Cena 4: painel com clip-path, câmera simulada (escala) e parallax nas flores.
//  - Cena 5: convite final com o bolo e o botão.
//
// Celular e tablet: entradas únicas por IntersectionObserver (skill scroll-craft, ver scrollReveals).
// Tudo só com transform e opacity (e clip-path no painel). Com "reduzir movimento" ficam só fades de opacidade;
// sem JavaScript a página fica estática e completa. Rolagem nativa (sem Lenis): âncoras, teclado e
// leitores de ecrã funcionam como sempre.
import { useLayoutEffect, type RefObject } from 'react';
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
  // Hero: logo na montagem (entrada, ambiente, parallax e cenas 1 e 2).
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

        // ---------- 12.1 Entrada ----------
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
        intro
          .from(q(hero, '[data-mc-bg]'), { autoAlpha: 0, scale: 1.04, duration: 0.7, ease: 'power2.out' })
          .from(q(el, '[data-mc-header]'), { autoAlpha: 0, y: -16, duration: 0.5 }, 0.2)
          .from(q(hero, '[data-mc-word]'), { yPercent: 115, duration: 0.95, stagger: 0.12, ease: 'expo.out' }, 0.25)
          .from(mainLayer, { autoAlpha: 0, scale: 1.12, y: 40, duration: 1.1, ease: 'expo.out' }, 0.55)
          .from(decoLayers, { autoAlpha: 0, y: 30, scale: 0.92, duration: 0.8, stagger: 0.07 }, 0.85)
          .from(petals, { autoAlpha: 0, scale: 0.6, rotation: '-=40', duration: 0.9, stagger: 0.06 }, 1.05)
          .from(sideItems, { autoAlpha: 0, y: 18, duration: 0.6, stagger: 0.07 }, 1.2)
          .from(q(hero, '[data-mc-badge]'), { autoAlpha: 0, duration: 0.9 }, 1.4)
          .from(q(hero, '[data-mc-picker]'), { autoAlpha: 0, y: 24, duration: 0.6 }, 1.6);

        // Movimento ambiente: pétalas a flutuar devagar, cada uma no seu ritmo.
        petals.forEach((p, i) => {
          const delay = Number(p.dataset.delay ?? i * 0.3);
          gsap.to(p, { y: i % 2 ? 14 : -12, rotation: i % 2 ? '+=10' : '-=8', duration: 4.5 + i * 0.7, delay: 2 + delay,
            ease: 'sine.inOut', yoyo: true, repeat: -1 });
        });

        // Parallax com o rato (computador): camadas mais próximas mexem mais.
        if (desktop && finePointer) {
          const movers = q(hero, '[data-mc-parallax]').map((node) => {
            const depth = Number(node.parentElement?.dataset.depth ?? 0.5);
            return { depth, x: gsap.quickTo(node, 'x', { duration: 0.9, ease: 'power3.out' }), y: gsap.quickTo(node, 'y', { duration: 0.9, ease: 'power3.out' }) };
          });
          const onMove = (e: PointerEvent) => {
            const nx = e.clientX / window.innerWidth - 0.5;
            const ny = e.clientY / window.innerHeight - 0.5;
            movers.forEach((m) => { m.x(nx * 22 * m.depth); m.y(ny * 12 * m.depth); });
          };
          hero.addEventListener('pointermove', onMove);
          ctx.add(() => () => hero.removeEventListener('pointermove', onMove));
        }

        // ---------- 12.2 Cenas 1 e 2: hero fixo e passagem para o catálogo ----------
        if (desktop) {
          const stage = hero.querySelector('[data-mc-stage]');
          const scroll = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: hero, start: 'top top', end: '+=90%', pin: true, scrub: 0.6, anticipatePin: 1 },
          });
          scroll
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
          // Celular e tablet: sem fixar o hero (rolagem natural), mas a cena acompanha o dedo: o título sobe e
          // apaga, o bolo aproxima-se, a decoração e as pétalas sobem em velocidades diferentes e a luz muda.
          const stage = hero.querySelector('[data-mc-stage]');
          const scroll = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.4 },
          });
          scroll
            .to(q(hero, '[data-mc-title]'), { yPercent: -45, autoAlpha: 0.15, duration: 1 }, 0)
            .to(stage, { scale: 1.12, yPercent: -10, duration: 1 }, 0)
            .to(q(hero, '[data-mc-layer="deco"]'), { yPercent: (i) => -14 - (i % 3) * 10, duration: 1 }, 0)
            .to(petals, { yPercent: (i) => -120 - i * 40, rotation: (i) => (i % 2 ? 50 : -40), duration: 1 }, 0)
            .to(q(hero, '[data-mc-light]'), { opacity: 1, duration: 1 }, 0)
            .to(q(hero, '.mc-hero__scroll, [data-mc-badge]'), { autoAlpha: 0, duration: 0.3 }, 0);
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

  // Seções seguintes: quando o catálogo já decidiu a altura de Nossos Bolos (cartões reais ou de exemplo).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !ready) return;
    const mm = gsap.matchMedia(el);
    // "always": o gsap.matchMedia só chama a função quando alguma condição é verdadeira; sem ela, um celular com
    // "reduzir movimento" não teria nenhuma e ficaria sem as entradas suaves.
    mm.add({ always: 'all', motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 1024px)' }, (ctx) => {
      const { motion, desktop } = ctx.conditions as Record<string, boolean>;
      if (desktop && motion) desktopScenes(el);
      else { const stopReveals = scrollReveals(el, motion); ctx.add(() => stopReveals); }
      ScrollTrigger.refresh();
      const stop = refreshOnResize(el);
      ctx.add(() => stop);
    });
    return () => mm.revert();
  }, [root, ready]);
}

/**
 * Celular e tablet (e qualquer ecrã com "reduzir movimento"), pelas regras da skill scroll-craft:
 *  - Seções comuns ("flow + in"): cada bloco entra uma vez, quando chega a ~12% do fundo do ecrã, com
 *    IntersectionObserver (não depende das posições do ScrollTrigger, que no celular mudam com a barra de endereço
 *    e as imagens). Opacidade e uma subida curta (14px, cartões 22px a partir de scale 0.95) em 620ms com ease-out
 *    forte, irmãos em sequência de 60ms na ordem de leitura. O que já entrou não volta a esconder ao subir.
 *  - Profundidade presa ao dedo (scrub) só onde é cena: fatia em detalhe, painel da celebração e flores soltas.
 *  - "Reduzir movimento" = menos e mais suave, não zero: fica só a opacidade, sem deslocamentos nem zoom.
 */
const EASE_IN = 'expo.out';
function scrollReveals(el: HTMLElement, motion: boolean): () => void {
  let stop = () => undefined as void;
  const sections = q(el, '[data-mc-cakes], [data-mc-detail], [data-mc-celebrate], [data-mc-final]');
  type Kind = 'line' | 'text' | 'card' | 'cake';
  const kinds = new Map<Element, Kind>();
  sections.forEach((sec) => {
    q(sec, '[data-mc-reveal-line]').forEach((n) => kinds.set(n, 'line'));
    q(sec, '[data-mc-fade], [data-mc-step], [data-mc-celebrate-text]').forEach((n) => kinds.set(n, 'text'));
    q(sec, '[data-mc-card]').forEach((n) => kinds.set(n, 'card'));
    q(sec, '[data-mc-final-cake]').forEach((n) => kinds.set(n, 'cake'));
  });
  const hidden: Record<Kind, gsap.TweenVars> = motion
    ? { line: { yPercent: 110 }, text: { autoAlpha: 0, y: 14 }, card: { autoAlpha: 0, y: 22, scale: 0.95 }, cake: { autoAlpha: 0, y: 24, scale: 0.96 } }
    : { line: { autoAlpha: 0 }, text: { autoAlpha: 0 }, card: { autoAlpha: 0 }, cake: { autoAlpha: 0 } };
  const shown: Record<Kind, gsap.TweenVars> = motion
    ? { line: { yPercent: 0, duration: 0.9 }, text: { autoAlpha: 1, y: 0, duration: 0.62 }, card: { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, cake: { autoAlpha: 1, y: 0, scale: 1, duration: 0.9 } }
    : { line: { autoAlpha: 1, duration: 0.5 }, text: { autoAlpha: 1, duration: 0.5 }, card: { autoAlpha: 1, duration: 0.5 }, cake: { autoAlpha: 1, duration: 0.5 } };
  kinds.forEach((kind, node) => gsap.set(node, hidden[kind]));

  const enter = (nodes: Element[]) => {
    nodes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    nodes.forEach((node, i) => {
      const kind = kinds.get(node)!;
      gsap.to(node, { ...shown[kind], ease: EASE_IN, delay: i * 0.06, overwrite: 'auto' });
      const img = kind === 'card' && motion ? node.querySelector('img') : null;
      if (img) gsap.fromTo(img, { scale: 1.08 }, { scale: 1, duration: 1.1, ease: EASE_IN, delay: i * 0.06 });
    });
  };
  // A linha do título é observada pela sua faixa (a própria linha está deslocada para fora da máscara).
  const target = (node: Element) => (kinds.get(node) === 'line' ? node.parentElement ?? node : node);
  const byTarget = new Map<Element, Element[]>();
  kinds.forEach((_k, node) => { const t = target(node); byTarget.set(t, [...(byTarget.get(t) ?? []), node]); });

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      const batch: Element[] = [];
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        batch.push(...(byTarget.get(e.target) ?? []));
      });
      if (batch.length) enter(batch);
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
    byTarget.forEach((_n, t) => io.observe(t));
    stop = () => io.disconnect();
  } else {
    enter([...kinds.keys()]);
  }

  if (!motion) return stop;
  // Fatia em detalhe: aproxima enquanto a seção passa.
  q(el, '[data-mc-detail-zoom]').forEach((n) => gsap.fromTo(n, { scale: 1 }, { scale: 1.12, ease: 'none',
    scrollTrigger: { trigger: n.closest('[data-mc-detail]') ?? n, start: 'top bottom', end: 'bottom top', scrub: true } }));
  // Painel da celebração: abre por máscara e a "câmera" recua, presos ao dedo.
  const celebrate = el.querySelector<HTMLElement>('[data-mc-celebrate]');
  if (celebrate) {
    const st = { trigger: celebrate, start: 'top 90%', end: 'top 25%', scrub: 0.5 };
    gsap.fromTo(celebrate.querySelector('[data-mc-celebrate-panel]'), { clipPath: 'inset(6% 6% 6% 6% round 36px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none', scrollTrigger: st });
    gsap.fromTo(q(celebrate, '[data-mc-celebrate-camera]'), { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { ...st, end: 'bottom 40%' } });
  }
  // Flores e pétalas soltas em velocidades diferentes (profundidade).
  q(el, '[data-mc-depth]').forEach((node) => {
    const d = Number(node.dataset.mcDepth ?? 1);
    gsap.fromTo(node, { y: 30 * d }, { y: -30 * d, rotation: d * 5, ease: 'none',
      scrollTrigger: { trigger: node.closest('section') ?? node, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  return stop;
}

/** Computador com movimento: cenas fixas (pin) e entradas em sequência. */
function desktopScenes(el: HTMLElement) {
  // Nossos Bolos: título por máscara e cartões em sequência.
  const cakes = el.querySelector('[data-mc-cakes]');
  if (cakes) {
    gsap.from(q(cakes, '[data-mc-reveal-line]'), { yPercent: 110, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: cakes, start: 'top 75%' } });
    gsap.from(q(cakes, '[data-mc-fade]'), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.1, ease: 'power2.out', scrollTrigger: { trigger: cakes, start: 'top 70%' } });
    gsap.from(q(cakes, '[data-mc-card]'), { autoAlpha: 0, y: 60, scale: 0.97, duration: 0.9, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: q(cakes, '[data-mc-cards]')[0] ?? cakes, start: 'top 80%' } });
  }

  // ---------- Cena 3: a fatia aproxima-se e os passos aparecem ----------
  const detail = el.querySelector<HTMLElement>('[data-mc-detail]');
  if (detail) {
    gsap.from(q(detail, '[data-mc-reveal-line]'), { yPercent: 110, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: detail, start: 'top 70%' } });
    gsap.from(q(detail, '[data-mc-fade]'), { autoAlpha: 0, y: 16, duration: 0.6, scrollTrigger: { trigger: detail, start: 'top 70%' } });
    const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: detail, start: 'top top', end: '+=120%', pin: true, scrub: 0.6 } });
    tl.fromTo(q(detail, '[data-mc-detail-zoom]'), { scale: 1 }, { scale: 1.35, duration: 3 }, 0);
    q(detail, '[data-mc-step]').forEach((s, i) => {
      tl.from(s, { autoAlpha: 0, y: 40, duration: 0.6, ease: 'power2.out' }, 0.3 + i * 0.85);
      const line = q(detail, '[data-mc-detail-line]')[i];
      const mark = q(detail, '[data-mc-detail-mark]')[i];
      if (mark) tl.from(mark, { autoAlpha: 0, duration: 0.4 }, 0.3 + i * 0.85);
      if (line) tl.from(line, { scaleX: 0, duration: 0.5 }, 0.35 + i * 0.85);
    });
  }

  // ---------- Cena 4: painel por máscara, câmera simulada e parallax ----------
  const celebrate = el.querySelector<HTMLElement>('[data-mc-celebrate]');
  if (celebrate) {
    const st = { trigger: celebrate, start: 'top 85%', end: 'top 15%', scrub: 0.6 };
    gsap.fromTo(celebrate.querySelector('[data-mc-celebrate-panel]'), { clipPath: 'inset(10% 16% 10% 16% round 48px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 32px)', ease: 'none', scrollTrigger: st });
    gsap.fromTo(q(celebrate, '[data-mc-celebrate-camera]'), { scale: 1.18, xPercent: -2 }, { scale: 1, xPercent: 0, ease: 'none', scrollTrigger: { ...st, end: 'bottom 40%' } });
    gsap.from(q(celebrate, '[data-mc-celebrate-text]'), { autoAlpha: 0, y: 30, duration: 0.8, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: celebrate, start: 'top 45%' } });
  }

  // Parallax das flores e pétalas soltas das seções (data-mc-depth).
  q(el, '[data-mc-depth]').forEach((node) => {
    const d = Number(node.dataset.mcDepth ?? 1);
    gsap.fromTo(node, { y: 50 * d }, { y: -50 * d, rotation: d * 6, ease: 'none',
      scrollTrigger: { trigger: node.closest('section') ?? node, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // ---------- Cena 5: convite final ----------
  const final = el.querySelector<HTMLElement>('[data-mc-final]');
  if (final) {
    gsap.from(q(final, '[data-mc-reveal-line]'), { yPercent: 110, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: final, start: 'top 70%' } });
    gsap.from(q(final, '[data-mc-fade]'), { autoAlpha: 0, y: 18, duration: 0.7, stagger: 0.12, ease: 'power2.out', scrollTrigger: { trigger: final, start: 'top 65%' } });
    gsap.from(q(final, '[data-mc-final-cake]'), { autoAlpha: 0, y: 60, scale: 1.08, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: final, start: 'top 70%' } });
  }
}
