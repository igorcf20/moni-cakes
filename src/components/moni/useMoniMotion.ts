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
// Tudo só com transform e opacity (e clip-path no painel). Com "reduzir movimento" no sistema nada disto corre e
// a página fica estática e completa; sem JavaScript também. Rolagem nativa (sem Lenis): âncoras, teclado e
// leitores de ecrã funcionam como sempre.
import { useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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
            // Cena 2: o rosa vira creme, o título apaga e o bolo sobe e abre espaço.
            .fromTo(q(hero, '[data-mc-cream]'), { yPercent: 100 }, { yPercent: 52, duration: 0.8 }, 0.7)
            .to(q(hero, '[data-mc-title]'), { autoAlpha: 0, duration: 0.5 }, 0.8)
            .to(stage, { scale: 0.94, yPercent: -16, duration: 0.8 }, 1.0)
            .to(petals, { autoAlpha: 0, duration: 0.4 }, 1.0);
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
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 1024px)' }, (ctx) => {
      const { motion, desktop } = ctx.conditions as Record<string, boolean>;
      if (!motion) return;
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
          const steps = q(detail, '[data-mc-step]');
          gsap.from(q(detail, '[data-mc-reveal-line]'), { yPercent: 110, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: detail, start: 'top 70%' } });
          gsap.from(q(detail, '[data-mc-fade]'), { autoAlpha: 0, y: 16, duration: 0.6, scrollTrigger: { trigger: detail, start: 'top 70%' } });
          if (desktop) {
            const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: detail, start: 'top top', end: '+=120%', pin: true, scrub: 0.6 } });
            tl.fromTo(q(detail, '[data-mc-detail-zoom]'), { scale: 1 }, { scale: 1.35, duration: 3 }, 0);
            steps.forEach((s, i) => {
              tl.from(s, { autoAlpha: 0, y: 40, duration: 0.6, ease: 'power2.out' }, 0.3 + i * 0.85);
              const line = q(detail, '[data-mc-detail-line]')[i];
              const mark = q(detail, '[data-mc-detail-mark]')[i];
              if (mark) tl.from(mark, { autoAlpha: 0, duration: 0.4 }, 0.3 + i * 0.85);
              if (line) tl.from(line, { scaleX: 0, duration: 0.5 }, 0.35 + i * 0.85);
            });
          } else {
            gsap.fromTo(q(detail, '[data-mc-detail-zoom]'), { scale: 1 }, { scale: 1.15, ease: 'none', scrollTrigger: { trigger: detail, start: 'top bottom', end: 'bottom top', scrub: true } });
            steps.forEach((s) => gsap.from(s, { autoAlpha: 0, y: 30, duration: 0.7, ease: 'power2.out', scrollTrigger: { trigger: s, start: 'top 85%' } }));
          }
        }

        // ---------- Cena 4: painel por máscara, câmera simulada e parallax ----------
        const celebrate = el.querySelector<HTMLElement>('[data-mc-celebrate]');
        if (celebrate) {
          const panel = celebrate.querySelector('[data-mc-celebrate-panel]');
          const st = { trigger: celebrate, start: 'top 85%', end: 'top 15%', scrub: 0.6 };
          gsap.fromTo(panel, { clipPath: desktop ? 'inset(10% 16% 10% 16% round 48px)' : 'inset(6% 6% 6% 6% round 40px)' },
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

      ScrollTrigger.refresh();
    });
    return () => mm.revert();
  }, [root, ready]);
}
