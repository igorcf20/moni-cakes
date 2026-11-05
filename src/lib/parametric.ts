// Produtos personalizáveis gerados em código (chaveiro com nome, placa de nome...).
// Cada modelo devolve peças separadas por cor, no formato do STL: 9 números por triângulo, em mm, Z para cima.
// As fontes (Droid Sans/Serif Bold, Apache 2.0) vêm do three.js e só carregam nesta página.
import * as THREE from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export type FontId = 'sans' | 'serif';
export type TemplateId = 'keychain' | 'nameplate';
export type SizeId = 'S' | 'M' | 'L';

export const TEMPLATES: { id: TemplateId; maxChars: number; defaultText: string }[] = [
  { id: 'keychain', maxChars: 14, defaultText: 'Maria' },
  { id: 'nameplate', maxChars: 22, defaultText: 'Escritório da Ana' },
];

/** Altura das letras (mm) por tamanho e modelo. */
const LETTER: Record<TemplateId, Record<SizeId, number>> = {
  keychain: { S: 8, M: 10, L: 13 },
  nameplate: { S: 12, M: 16, L: 22 },
};

const fontCache = new Map<FontId, Promise<Font>>();
export function loadFont(id: FontId): Promise<Font> {
  if (!fontCache.has(id)) {
    const json = id === 'serif'
      ? import('three/examples/fonts/droid/droid_serif_bold.typeface.json')
      : import('three/examples/fonts/droid/droid_sans_bold.typeface.json');
    fontCache.set(id, json.then((m: any) => new Font(m.default ?? m)));
  }
  return fontCache.get(id)!;
}

export type Part = { role: 'base' | 'detail'; positions: Float32Array };
export type Model = { parts: Part[]; size: [number, number, number] };

const toPositions = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  const out = new Float32Array(n.attributes.position.array);
  if (n !== g) n.dispose();
  g.dispose();
  return out;
};

function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y); s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr); s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

const holePath = (shape: THREE.Shape) => {
  const p = new THREE.Path();
  p.setFromPoints(shape.getPoints(8).reverse());
  return p;
};

const extrude = (shape: THREE.Shape, depth: number, z = 0) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, z);
  return g;
};

/** Texto em relevo, centrado em (0,0), com a base na altura z. */
function textGeometry(text: string, font: Font, size: number, depth: number, z: number) {
  const g = new TextGeometry(text, { font, size, height: depth, curveSegments: 6, bevelEnabled: false });
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, z);
  return { g, w: b.max.x - b.min.x, h: b.max.y - b.min.y };
}

export function buildModel(template: TemplateId, text: string, font: Font, size: SizeId): Model {
  const clean = text.trim() || ' ';
  const letter = LETTER[template][size];
  if (template === 'keychain') {
    const base = 3, relief = 1.6, pad = letter * 0.45, ring = 11;
    const tx = textGeometry(clean, font, letter, relief, base);
    const w = Math.max(tx.w + pad * 2, letter * 2) + ring;
    const h = Math.max(tx.h, letter) + pad * 2;
    // Texto deslocado para a direita, para dar lugar à argola.
    tx.g.translate(ring / 2, 0, 0);
    const shape = roundedRect(w, h, Math.min(5, h / 2));
    shape.holes.push(holePath(roundedRect(5.2, 5.2, 2.6, -w / 2 + ring / 2 + 0.5, 0)));
    return { parts: [{ role: 'base', positions: toPositions(extrude(shape, base)) }, { role: 'detail', positions: toPositions(tx.g) }], size: [w, h, base + relief] };
  }
  // Placa de nome: base, moldura em relevo e texto em relevo.
  const base = 4, relief = 1.8, pad = letter * 0.9, border = 3;
  const tx = textGeometry(clean, font, letter, relief, base);
  const w = Math.max(tx.w + pad * 2, 60), h = Math.max(tx.h + pad * 2, letter * 2.4);
  const plate = roundedRect(w, h, 6);
  const frame = roundedRect(w, h, 6);
  frame.holes.push(holePath(roundedRect(w - border * 2, h - border * 2, 4)));
  const detail = [toPositions(extrude(frame, relief, base)), toPositions(tx.g)];
  const merged = new Float32Array(detail[0].length + detail[1].length);
  merged.set(detail[0]); merged.set(detail[1], detail[0].length);
  return { parts: [{ role: 'base', positions: toPositions(extrude(plate, base)) }, { role: 'detail', positions: merged }], size: [w, h, base + relief] };
}

/** Todas as peças juntas (para medir volume e peso). */
export function mergeParts(parts: Part[]): Float32Array {
  const out = new Float32Array(parts.reduce((s, p) => s + p.positions.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p.positions, o); o += p.positions.length; }
  return out;
}
