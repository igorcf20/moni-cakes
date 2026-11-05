import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type ViewerPart = { positions: Float32Array; color: string };

type Props = {
  /** peças no formato do STL (Z para cima), cada uma com a sua cor */
  parts: ViewerPart[];
  label: string;
  className?: string;
};

/**
 * Visualizador de peças com várias cores (personalizador). Arrastar gira; roda (depois de clicar) ou pinça aproxima.
 * As peças são reconstruídas quando o modelo muda; a câmara desliza para o novo enquadramento.
 * Com "reduzir movimento" não há rotação automática nem transições.
 */
export function PartsViewer({ parts, label, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{ scene: THREE.Scene; group: THREE.Group; view: { dist: number; target: number; look: number; lookTarget: number }; reduce: boolean } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a6a4a, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(140, 260, 200);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd59a, 0.8);
    rim.position.set(-220, 120, -200);
    scene.add(rim);
    const group = new THREE.Group();
    scene.add(group);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // O texto fica legível de frente (yaw 0); a animação só balança de um lado para o outro.
    const view = { yaw: 0, pitch: 0.7, dist: 260, target: 260, look: 0, lookTarget: 0, auto: !reduce };
    let t0 = performance.now();
    state.current = { scene, group, view, reduce };

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

    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0, raf = 0, active = false;
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const zoomBy = (f: number) => { view.target = Math.max(30, Math.min(3000, view.target * f)); };
    const down = (e: PointerEvent) => { view.auto = false; t0 = performance.now(); active = true; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture(e.pointerId); if (pts.size === 2) pinch = spread(); };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        view.yaw -= (e.clientX - p.x) * 0.01;
        view.pitch = Math.max(0.08, Math.min(1.5, view.pitch + (e.clientY - p.y) * 0.01));
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const d = spread(); if (pinch > 0 && d > 0) zoomBy(pinch / d); pinch = d; }
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
    const wheel = (e: WheelEvent) => { if (!active && !e.ctrlKey) return; e.preventDefault(); zoomBy(1 + Math.max(-50, Math.min(50, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.001)); };
    const leave = () => { active = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });

    const loop = () => {
      if (view.auto && pts.size === 0) view.yaw = Math.sin((performance.now() - t0) / 2400) * 0.55;
      const k = reduce ? 1 : 0.1;
      view.dist += (view.target - view.dist) * k;
      view.look += (view.lookTarget - view.look) * k;
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
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
      group.children.forEach((m) => { (m as THREE.Mesh).geometry.dispose(); ((m as THREE.Mesh).material as THREE.Material).dispose(); });
      renderer.dispose();
      el.removeChild(renderer.domElement);
      state.current = null;
    };
  }, []);

  // Reconstrói as peças com o mesmo centro (caixa de todas juntas), deitadas na mesa.
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.group.children.slice().forEach((m) => { s.group.remove(m); (m as THREE.Mesh).geometry.dispose(); ((m as THREE.Mesh).material as THREE.Material).dispose(); });
    const box = new THREE.Box3();
    const geoms = parts.map((p) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.positions.slice(), 3));
      g.rotateX(-Math.PI / 2);
      g.computeVertexNormals();
      g.computeBoundingBox();
      box.union(g.boundingBox!);
      return g;
    });
    if (!geoms.length) return;
    const c = box.getCenter(new THREE.Vector3());
    geoms.forEach((g, i) => {
      g.translate(-c.x, -box.min.y, -c.z);
      s.group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: parts[i].color, roughness: 0.55, metalness: 0.04 })));
    });
    const size = box.getSize(new THREE.Vector3());
    s.view.target = Math.max(90, Math.max(size.x, size.z) * 2.5);
    s.view.lookTarget = size.y / 2;
  }, [parts]);

  return <div ref={host} className={className} style={{ touchAction: 'none' }} role="img" aria-label={label} />;
}
