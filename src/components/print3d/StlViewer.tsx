import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Props = {
  /** 9 números por triângulo, Z para cima (como no STL). */
  positions: Float32Array | null;
  color: string;
  /** % da escala original */
  scale: number;
  /** área de impressão X, Y em mm */
  bed: [number, number];
  /** texto acessível (traduzido pela página) */
  label: string;
  className?: string;
  /** workbench: mesa de impressão real (orçamento); showcase: vitrine sem mesa (página inicial). */
  variant?: 'workbench' | 'showcase';
  /** faces facetadas (visual low-poly) */
  flat?: boolean;
  finish?: Finish;
  /** showcase: tamanho (mm) usado para enquadrar a câmara; sem ele a câmara segue a peça. */
  frame?: number;
};

export type Finish = 'standard' | 'matte' | 'glossy';
const FINISH: Record<Finish, { roughness: number; metalness: number }> = {
  standard: { roughness: 0.5, metalness: 0.05 },
  matte: { roughness: 0.92, metalness: 0 },
  glossy: { roughness: 0.18, metalness: 0.12 },
};

/** Lê um token HSL do tema ("211 100% 36%") e devolve uma cor three.js. */
function themeColor(token: string, fallback: string): THREE.Color {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim().split(/\s+/);
    if (v.length >= 3) return new THREE.Color(`hsl(${v[0]}, ${v[1]}, ${v[2]})`);
  } catch { /* usa a cor de reserva */ }
  return new THREE.Color(fallback);
}

/**
 * Visualizador 3D leve: arrastar gira, roda (depois de clicar) ou pinça aproxima. Sem OrbitControls para não carregar mais código.
 * A peça entra com uma animação curta de escala; com "reduzir movimento" não há rotação automática nem animação.
 */
export function StlViewer({ positions, color, scale, bed, label, className, variant = 'workbench', flat = false, finish = 'standard', frame }: Props) {
  const showcase = variant === 'showcase';
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    mesh: THREE.Mesh | null; grid: THREE.GridHelper | null; plate: THREE.Mesh | null;
    view: { yaw: number; pitch: number; dist: number; target: number; look: number; lookTarget: number; auto: boolean; pop: number };
    reduce: boolean;
  } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 4 / 3, 1, 8000);

    // Luz de estúdio: céu claro, chão azul da marca, luz principal e contraluz para recortar a silhueta.
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a6a4a, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(160, 260, 180);
    scene.add(key);
    const rim = new THREE.DirectionalLight(themeColor('--brand-royal-light', '#1b85ff'), 0.9);
    rim.position.set(-200, 120, -220);
    scene.add(rim);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const view = { yaw: 0.7, pitch: showcase ? 0.22 : 0.45, dist: 400, target: 400, look: 20, lookTarget: 20, auto: !reduce, pop: 1 };
    three.current = { renderer, scene, camera, mesh: null, grid: null, plate: null, view, reduce };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Ponteiros ativos: 1 gira, 2 aproxima (pinça).
    // A roda só aproxima depois de clicar na peça (ou com pinça no trackpad, que chega com ctrlKey),
    // para não prender a rolagem da página quando o cursor passa por cima.
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0, raf = 0, active = false;
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const zoomBy = (f: number) => { view.target = Math.max(40, Math.min(4000, view.target * f)); };
    const down = (e: PointerEvent) => {
      view.auto = false;
      active = true;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pts.size === 2) pinch = spread();
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        view.yaw -= (e.clientX - p.x) * 0.01;
        view.pitch = Math.max(0.05, Math.min(1.45, view.pitch + (e.clientY - p.y) * 0.01));
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const d = spread(); if (pinch > 0 && d > 0) zoomBy(pinch / d); pinch = d; }
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
    const wheel = (e: WheelEvent) => {
      if (!active && !e.ctrlKey) return;
      e.preventDefault();
      zoomBy(1 + Math.max(-50, Math.min(50, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.001));
    };
    const leave = () => { active = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerleave', leave);

    const loop = () => {
      if (view.auto && pts.size === 0) view.yaw += 0.0035;
      view.dist += (view.target - view.dist) * (reduce ? 1 : 0.12);
      view.look += (view.lookTarget - view.look) * (reduce ? 1 : 0.12);
      const t = three.current;
      if (t?.mesh && view.pop < 1) {
        view.pop = Math.min(1, view.pop + 0.06);
        const ease = 1 - Math.pow(1 - view.pop, 3);
        t.mesh.scale.setScalar(((t.mesh.userData.k as number) ?? 1) * (0.85 + 0.15 * ease));
      }
      camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, Math.sin(view.pitch) * view.dist + view.look, Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
      camera.lookAt(0, view.look, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerleave', leave);
      const t = three.current;
      t?.mesh?.geometry.dispose();
      (t?.mesh?.material as THREE.Material | undefined)?.dispose();
      t?.grid?.geometry.dispose();
      (t?.grid?.material as THREE.Material | undefined)?.dispose();
      t?.plate?.geometry.dispose();
      (t?.plate?.material as THREE.Material | undefined)?.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- o modo é fixo durante a vida do componente

  // Peça: geometria nova quando o ficheiro muda.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    if (t.mesh) { t.scene.remove(t.mesh); t.mesh.geometry.dispose(); (t.mesh.material as THREE.Material).dispose(); t.mesh = null; }
    if (!positions) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    g.rotateX(-Math.PI / 2); // STL tem Z para cima; three.js tem Y
    g.computeVertexNormals();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    t.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, flatShading: flat, side: showcase ? THREE.DoubleSide : THREE.FrontSide, ...FINISH[finish] }));
    t.mesh.userData.k = 1;
    t.scene.add(t.mesh);
    t.view.pop = t.reduce ? 1 : 0;
  }, [positions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { (three.current?.mesh?.material as THREE.MeshStandardMaterial | undefined)?.color.set(color); }, [color]);
  useEffect(() => {
    const m = three.current?.mesh?.material as THREE.MeshStandardMaterial | undefined;
    if (m) Object.assign(m, FINISH[finish]);
  }, [finish]);

  // Escala, área de impressão e distância da câmara.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const k = scale / 100;
    let biggest = 0, tall = 0;
    if (t.mesh) {
      t.mesh.userData.k = k;
      if (t.view.pop >= 1) t.mesh.scale.setScalar(k);
      const bb = t.mesh.geometry.boundingBox!;
      biggest = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * k;
      tall = (bb.max.y - bb.min.y) * k;
    }
    for (const o of [t.grid, t.plate]) if (o) { t.scene.remove(o); o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    t.grid = null; t.plate = null;
    if (showcase) {
      t.view.target = Math.max(80, (frame ?? biggest) * 2.1);
      t.view.lookTarget = tall * 0.48;
      return;
    }
    const [bx, by] = [Math.max(bed[0], 20), Math.max(bed[1], 20)];
    const size = Math.max(bx, by);
    const line = themeColor('--muted-foreground', '#6b6460');
    t.grid = new THREE.GridHelper(size, Math.max(2, Math.round(size / 20)), line, line);
    const gm = t.grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.28;
    t.scene.add(t.grid);
    // Mesa: placa fina e clara com o tamanho real X por Y, por baixo da grelha (o palco da página dá o fundo creme).
    t.plate = new THREE.Mesh(
      new THREE.BoxGeometry(bx, 1.2, by),
      new THREE.MeshStandardMaterial({ color: themeColor('--card', '#ffffff'), transparent: true, opacity: 0.7, roughness: 0.95 }),
    );
    t.plate.position.y = -0.7;
    t.scene.add(t.plate);
    // Enquadra a peça (não a mesa inteira): a mesa aparece à volta como referência de tamanho.
    t.view.target = Math.max(120, biggest * 2.4);
    t.view.lookTarget = tall / 2;
  }, [scale, bed, positions, showcase, frame]);

  return <div ref={host} className={className} style={{ touchAction: 'none' }} role="img" aria-label={label} />;
}
