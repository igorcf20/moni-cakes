// Orçamento de impressão 3D a partir de um ficheiro STL, OBJ ou 3MF: leitura, medidas e estimativa de peso, tempo e preço.
// Funções puras, sem DOM nem three.js, para poderem ser testadas em Node (scripts/test-print3d.mjs).
// As estimativas são aproximadas: um fatiador (PrusaSlicer, Orca, Bambu Studio) dá o valor exato.
// Sem textos visíveis nem moeda fixa: rótulos ficam no i18n (src/i18n/print3d.ts) e os custos vêm do país.
// O mesmo módulo serve de Web Worker para a leitura (ver o fim do ficheiro).
import { inflateSync } from 'fflate';

/**
 * Erro de leitura do ficheiro 3D (STL, OBJ ou 3MF); `code` é traduzido na página.
 * invalid: não deu para ler; empty: lido, mas sem triângulos; unsupported: extensão que não é STL, OBJ nem 3MF;
 * tooLarge: o conteúdo (por exemplo o XML descompactado de um 3MF) passa do que o navegador consegue ler.
 */
export type ModelParseErrorCode = 'invalid' | 'empty' | 'unsupported' | 'tooLarge';
export class StlParseError extends Error {
  code: ModelParseErrorCode;
  constructor(code: ModelParseErrorCode) {
    super(`3D file ${code}`);
    this.name = 'StlParseError';
    this.code = code;
  }
}

export type StlStats = {
  /** mm³ */ volume: number;
  /** mm² */ area: number;
  /** mm, [X, Y, Z] com Z para cima (como no STL) */ size: [number, number, number];
  triangles: number;
};

/** Lê STL binário ou ASCII e devolve as posições (9 números por triângulo). */
export function parseStl(buf: ArrayBuffer): Float32Array {
  if (buf.byteLength >= 84) {
    const dv = new DataView(buf);
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buf.byteLength && n > 0) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12; // salta a normal
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true);
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(buf);
  const nums: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) nums.push(Number(m[1]), Number(m[2]), Number(m[3]));
  if (nums.length === 0) throw new StlParseError(text.includes('solid') ? 'empty' : 'invalid');
  if (nums.length < 9 || nums.length % 9 !== 0 || nums.some((x) => !Number.isFinite(x))) throw new StlParseError('invalid');
  return new Float32Array(nums);
}

// ---------------------------------------------------------------------------------------------
// OBJ

/** Palavras-chave de OBJ que não geram geometria (aceites e ignoradas). */
const OBJ_KEYWORDS = new Set(['vt', 'vn', 'vp', 'o', 'g', 's', 'mtllib', 'usemtl', 'l', 'p', 'cstype', 'deg', 'curv', 'curv2', 'surf', 'parm', 'end']);

/**
 * Lê OBJ (texto): só linhas `v` e `f`; o resto (texturas, normais, materiais, grupos) é ignorado.
 * Faces com mais de 3 vértices viram um leque de triângulos; aceita `v`, `v/vt`, `v//vn`, `v/vt/vn` e índices negativos.
 * O formato não guarda unidade: assume mm, com os eixos como estão no ficheiro (como fazem os fatiadores).
 */
export function parseObj(buf: ArrayBuffer): Float32Array {
  const text = new TextDecoder().decode(buf);
  if (text.includes('\0')) throw new StlParseError('invalid'); // binário: não é OBJ
  const verts: number[] = [];
  const tris: number[] = []; // índices base 0; os positivos são validados no fim (podem apontar para vértices posteriores)
  let known = 0;
  for (const raw of text.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') { if (line) known++; continue; }
    const parts = line.split(/\s+/);
    const kw = parts[0];
    if (kw === 'v') {
      const x = Number(parts[1]), y = Number(parts[2]), z = Number(parts[3]);
      if (parts.length < 4 || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new StlParseError('invalid');
      verts.push(x, y, z);
      known++;
    } else if (kw === 'f') {
      const count = verts.length / 3;
      const idx: number[] = [];
      for (let i = 1; i < parts.length; i++) {
        const tok = parts[i];
        if (tok[0] === '#') break; // comentário no fim da linha
        const slash = tok.indexOf('/');
        const k = Number(slash < 0 ? tok : tok.slice(0, slash));
        if (!Number.isInteger(k) || k === 0) throw new StlParseError('invalid');
        const j = k < 0 ? count + k : k - 1;
        if (j < 0) throw new StlParseError('invalid');
        idx.push(j);
      }
      for (let i = 1; i + 1 < idx.length; i++) tris.push(idx[0], idx[i], idx[i + 1]);
      known++;
    } else if (OBJ_KEYWORDS.has(kw)) known++;
  }
  if (tris.length === 0) throw new StlParseError(known > 0 ? 'empty' : 'invalid');
  const total = verts.length / 3;
  const out = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    const j = tris[i];
    if (j >= total) throw new StlParseError('invalid');
    out[i * 3] = verts[j * 3];
    out[i * 3 + 1] = verts[j * 3 + 1];
    out[i * 3 + 2] = verts[j * 3 + 2];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 3MF (ZIP com XML; especificação 3MF Core e extensão Production para modelos noutros ficheiros)

/** mm por unidade do atributo `unit` de <model>; sem atributo, milímetro. */
const UNIT_MM: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

/** Matriz 4x3 do 3MF em vetor linha (m00 m01 m02 m10 ... m32): x' = x*m00 + y*m10 + z*m20 + m30, etc. */
type Mat = number[];
const IDENTITY: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

/** Lê `transform`; a translação passa para mm com a unidade do ficheiro onde está escrita. */
function readTransform(s: string | undefined, unit: number): Mat {
  if (!s || !s.trim()) return IDENTITY;
  const m = s.trim().split(/\s+/).map(Number);
  if (m.length !== 12 || m.some((x) => !Number.isFinite(x))) throw new StlParseError('invalid');
  m[9] *= unit; m[10] *= unit; m[11] *= unit;
  return m;
}

/** Aplica `a` e depois `b`. */
function compose(a: Mat, b: Mat): Mat {
  const out: Mat = new Array(12);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c] + (r === 3 ? b[9 + c] : 0);
  }
  return out;
}

const det = (m: Mat) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);

/** `printable` só conta nos <item> do build (printable="0": peça que o fatiador não imprime). */
type Ref3mf = { id: string; path: string; m: Mat; printable: boolean };
type Obj3mf = { type: string; verts: number[]; tris: number[]; components: Ref3mf[] };
type Doc3mf = { objects: Map<string, Obj3mf>; build: Ref3mf[] | null };

const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
/** Atributos de uma etiqueta XML; `p:path` (ou outro prefixo) fica também acessível como `path`. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tag))) {
    const v = m[2] ?? m[3];
    out[m[1]] = v;
    const colon = m[1].indexOf(':');
    const local = m[1].slice(colon + 1);
    if (colon >= 0 && !m[1].startsWith('xmlns') && !(local in out)) out[local] = v;
  }
  return out;
}

/** Percorre as etiquetas `<nome ...>` (com ou sem prefixo de namespace), passando os atributos em bruto. */
function eachTag(xml: string, name: string, fn: (attrsRaw: string) => void): void {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b([^>]*?)\\/?>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) fn(m[1]);
}
const tags = (xml: string, name: string): string[] => { const out: string[] = []; eachTag(xml, name, (a) => out.push(a)); return out; };

/** Atributo numérico rápido para vértices e triângulos (há ficheiros com milhões). */
const numAttr = (() => {
  const cache = new Map<string, RegExp>();
  return (tag: string, name: string): number => {
    let re = cache.get(name);
    if (!re) { re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`); cache.set(name, re); }
    const m = re.exec(tag);
    return m ? Number(m[1]) : NaN;
  };
})();

/** Caminho de uma parte do pacote, normalizado para comparar com as entradas do ZIP. */
function partName(p: string): string {
  let s = p.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  try { s = decodeURIComponent(s); } catch { /* fica como está */ }
  return s.toLowerCase();
}

function parseModelXml(xmlRaw: string, path: string): Doc3mf {
  const xml = xmlRaw.replace(/<!--[\s\S]*?-->/g, '');
  const model = /<(?:[\w-]+:)?model\b([^>]*)>/.exec(xml);
  if (!model) throw new StlParseError('invalid');
  const unitName = (attrs(model[1]).unit ?? 'millimeter').trim().toLowerCase();
  const unit = UNIT_MM[unitName] ?? 1;
  const ref = (a: Record<string, string>): Ref3mf => {
    if (!a.objectid) throw new StlParseError('invalid');
    const printable = !/^(0|false)$/i.test((a.printable ?? '').trim());
    return { id: a.objectid, path: a.path ? partName(a.path) : path, m: readTransform(a.transform, unit), printable };
  };

  const objects = new Map<string, Obj3mf>();
  const startRe = /<(?:[\w-]+:)?object\b([^>]*?)(\/?)>/g;
  const endRe = /<\/(?:[\w-]+:)?object\s*>/g;
  let o: RegExpExecArray | null;
  while ((o = startRe.exec(xml))) {
    let body = '';
    if (!o[2]) {
      endRe.lastIndex = startRe.lastIndex;
      const end = endRe.exec(xml);
      body = xml.slice(startRe.lastIndex, end ? end.index : xml.length);
      startRe.lastIndex = end ? endRe.lastIndex : xml.length;
    }
    const a = attrs(o[1]);
    if (!a.id) continue;
    const verts: number[] = [];
    eachTag(body, 'vertex', (v) => {
      const x = numAttr(v, 'x'), y = numAttr(v, 'y'), z = numAttr(v, 'z');
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new StlParseError('invalid');
      verts.push(x * unit, y * unit, z * unit);
    });
    const n = verts.length / 3;
    const tris: number[] = [];
    eachTag(body, 'triangle', (tri) => {
      const v1 = numAttr(tri, 'v1'), v2 = numAttr(tri, 'v2'), v3 = numAttr(tri, 'v3');
      for (const k of [v1, v2, v3]) if (!Number.isInteger(k) || k < 0 || k >= n) throw new StlParseError('invalid');
      tris.push(v1, v2, v3);
    });
    const components = tags(body, 'component').map((c) => ref(attrs(c)));
    objects.set(a.id, { type: (a.type ?? 'model').toLowerCase(), verts, tris, components });
  }

  const buildBlock = /<(?:[\w-]+:)?build\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?build>/.exec(xml);
  const build = buildBlock ? tags(buildBlock[1], 'item').map((i) => ref(attrs(i))) : null;
  return { objects, build };
}

// ZIP: só o diretório central e as entradas que o leitor usa (os .model e os .rels). Miniaturas, G-code e
// configurações de Bambu Studio e Orca ficam por descompactar, e o tamanho descompactado é conferido antes.

const MB = 1024 * 1024;
/** Teto do XML descompactado (soma dos .model) de um 3MF; acima disto a leitura fica lenta demais e pode esgotar a memória. */
export const MAX_3MF_MODEL_MB = 256;

type ZipEntry = { method: number; flags: number; compressed: number; size: number; offset: number };

const zipInvalid = () => new StlParseError('invalid');
const u16 = (d: Uint8Array, o: number) => { if (o < 0 || o + 2 > d.length) throw zipInvalid(); return d[o] | (d[o + 1] << 8); };
const u32 = (d: Uint8Array, o: number) => { if (o < 0 || o + 4 > d.length) throw zipInvalid(); return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) + d[o + 3] * 0x1000000; };
const u64 = (d: Uint8Array, o: number) => u32(d, o) + u32(d, o + 4) * 0x100000000;

/** Diretório central do ZIP (sem descompactar nada): nome normalizado (partName) para método, tamanhos e posição. */
function zipDirectory(d: Uint8Array): Map<string, ZipEntry> {
  // Fim do diretório central (EOCD): 22 bytes no fim, mais um comentário de até 65535.
  const stop = Math.max(0, d.length - 22 - 0xffff);
  let e = d.length - 22;
  while (e >= stop && !(d[e] === 0x50 && d[e + 1] === 0x4b && d[e + 2] === 5 && d[e + 3] === 6)) e--;
  if (e < stop) throw zipInvalid();
  let count = u16(d, e + 10);
  let at = u32(d, e + 16);
  if (count === 0xffff || at === 0xffffffff) {
    // ZIP64: o localizador fica 20 bytes antes do EOCD e aponta para o registo ZIP64 com os valores reais.
    if (u32(d, e - 20) !== 0x07064b50) throw zipInvalid();
    const z = u64(d, e - 12);
    if (u32(d, z) !== 0x06064b50) throw zipInvalid();
    count = u64(d, z + 32);
    at = u64(d, z + 48);
  }
  const utf8 = new TextDecoder();
  const latin1 = new TextDecoder('latin1');
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (u32(d, at) !== 0x02014b50) throw zipInvalid();
    const flags = u16(d, at + 8);
    const method = u16(d, at + 10);
    let compressed = u32(d, at + 20);
    let size = u32(d, at + 24);
    const nameLen = u16(d, at + 28), extraLen = u16(d, at + 30), commentLen = u16(d, at + 32);
    let offset = u32(d, at + 42);
    const nameAt = at + 46;
    if (nameAt + nameLen + extraLen > d.length) throw zipInvalid();
    const name = (flags & 0x800 ? utf8 : latin1).decode(d.subarray(nameAt, nameAt + nameLen));
    if (size === 0xffffffff || compressed === 0xffffffff || offset === 0xffffffff) {
      // ZIP64: os campos a 0xFFFFFFFF estão no extra 0x0001, por esta ordem: tamanho, comprimido, posição.
      let x = nameAt + nameLen;
      const end = x + extraLen;
      while (x + 4 <= end && u16(d, x) !== 1) x += 4 + u16(d, x + 2);
      if (x + 4 > end) throw zipInvalid();
      let p = x + 4;
      if (size === 0xffffffff) { size = u64(d, p); p += 8; }
      if (compressed === 0xffffffff) { compressed = u64(d, p); p += 8; }
      if (offset === 0xffffffff) offset = u64(d, p);
    }
    out.set(partName(name), { method, flags, compressed, size, offset });
    at = nameAt + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Conteúdo de uma entrada (guardada ou deflate); a saída nunca passa do tamanho declarado no diretório. */
function zipRead(d: Uint8Array, z: ZipEntry): Uint8Array {
  if (z.flags & 1) throw zipInvalid(); // cifrada
  if (u32(d, z.offset) !== 0x04034b50) throw zipInvalid();
  const start = z.offset + 30 + u16(d, z.offset + 26) + u16(d, z.offset + 28);
  if (start + z.compressed > d.length) throw zipInvalid();
  const raw = d.subarray(start, start + z.compressed);
  if (z.method === 0) return raw;
  if (z.method !== 8) throw zipInvalid();
  try { return inflateSync(raw, new Uint8Array(z.size)); } catch { throw zipInvalid(); }
}

const concat = (list: Float32Array[]): Float32Array => {
  if (list.length === 1) return list[0];
  const out = new Float32Array(list.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of list) { out.set(c, at); at += c.length; }
  return out;
};

/**
 * Lê 3MF: pacote ZIP com o modelo em 3D/3dmodel.model (ou o indicado em _rels/.rels).
 * Junta as malhas de cada objeto com as transformações de <item> e <component> (também em outros ficheiros do pacote,
 * como fazem Bambu Studio e Orca) e converte para mm pela unidade de <model>. Ficam de fora os objetos de suporte
 * (type="support") e os itens com printable="0". Devolve as malhas de cada item do build em separado (cada item é uma
 * peça; projetos com várias placas guardam cada placa deslocada no mesmo build).
 */
function read3mfItems(buf: ArrayBuffer): Float32Array[][] {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new StlParseError('invalid'); // "PK"
  const entries = zipDirectory(bytes);
  // Antes de descompactar: o XML inteiro vira texto, por isso o tamanho descompactado é que conta.
  const isXml = (name: string) => name.endsWith('.model') || name.endsWith('.rels');
  let xmlBytes = 0;
  const reserve = (n: number) => { xmlBytes += n; if (xmlBytes > MAX_3MF_MODEL_MB * MB) throw new StlParseError('tooLarge'); };
  for (const [name, z] of entries) if (isXml(name)) reserve(z.size);
  const decoder = new TextDecoder();
  const read = (p: string) => {
    const z = entries.get(p);
    if (!z) return null;
    if (!isXml(p)) reserve(z.size); // parte referida por p:path com outra extensão
    return decoder.decode(zipRead(bytes, z));
  };

  // Modelo principal: relação 3dmodel em _rels/.rels; senão o caminho padrão; senão o primeiro .model.
  let root = '';
  const rels = read('_rels/.rels');
  if (rels) {
    for (const r of tags(rels, 'Relationship')) {
      const a = attrs(r);
      if (a.Target && /\/3dmodel$/i.test(a.Type ?? '') && entries.has(partName(a.Target))) { root = partName(a.Target); break; }
    }
  }
  if (!root) root = entries.has('3d/3dmodel.model') ? '3d/3dmodel.model' : [...entries.keys()].find((k) => k.endsWith('.model')) ?? '';
  if (!root) throw new StlParseError('invalid');

  const docs = new Map<string, Doc3mf>();
  const doc = (p: string): Doc3mf => {
    let d = docs.get(p);
    if (!d) {
      const xml = read(p);
      if (xml === null) throw new StlParseError('invalid');
      d = parseModelXml(xml, p);
      docs.set(p, d);
    }
    return d;
  };

  const emit = (r: Ref3mf, parent: Mat, depth: number, sink: Float32Array[]) => {
    if (depth > 32) throw new StlParseError('invalid'); // referência circular
    const obj = doc(r.path).objects.get(r.id);
    if (!obj) throw new StlParseError('invalid');
    if (obj.type === 'support' || obj.type === 'other') return;
    const m = compose(r.m, parent);
    if (obj.tris.length) {
      const flip = det(m) < 0; // espelhado: troca a ordem para o volume não ficar negativo
      const { verts: v, tris: t } = obj;
      const out = new Float32Array(t.length * 3);
      const put = (o: number, j: number) => {
        const x = v[j * 3], y = v[j * 3 + 1], z = v[j * 3 + 2];
        out[o] = x * m[0] + y * m[3] + z * m[6] + m[9];
        out[o + 1] = x * m[1] + y * m[4] + z * m[7] + m[10];
        out[o + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
      };
      for (let i = 0; i < t.length; i += 3) {
        put(i * 3, t[i]);
        put(i * 3 + 3, flip ? t[i + 2] : t[i + 1]);
        put(i * 3 + 6, flip ? t[i + 1] : t[i + 2]);
      }
      sink.push(out);
    }
    for (const c of obj.components) emit(c, m, depth + 1, sink);
  };

  const main = doc(root);
  let items = main.build;
  if (!items || items.length === 0) {
    // Sem <build>: usa os objetos que não são componentes de outros.
    const used = new Set<string>();
    for (const ob of main.objects.values()) for (const c of ob.components) if (c.path === root) used.add(c.id);
    items = [...main.objects.keys()].filter((id) => !used.has(id)).map((id) => ({ id, path: root, m: IDENTITY, printable: true }));
  }
  const pieces: Float32Array[][] = [];
  for (const it of items) {
    if (!it.printable) continue;
    const sink: Float32Array[] = [];
    emit(it, IDENTITY, 0, sink);
    if (sink.length) pieces.push(sink);
  }
  if (pieces.length === 0) throw new StlParseError('empty');
  return pieces;
}

/** Lê 3MF e devolve as posições de todas as peças juntas (ver read3mfItems). */
export function parse3mf(buf: ArrayBuffer): Float32Array {
  return concat(read3mfItems(buf).flat());
}

// ---------------------------------------------------------------------------------------------
// Escolha do formato

export const MODEL_FORMATS = ['stl', 'obj', '3mf'] as const;
export type ModelFormat = (typeof MODEL_FORMATS)[number];
/** Valor do atributo `accept` do campo de ficheiro (extensões e tipos MIME conhecidos). */
export const MODEL_ACCEPT = '.stl,.obj,.3mf,model/stl,model/obj,model/3mf,application/sla,application/vnd.ms-package.3dmanufacturing-3dmodel+xml';

/** Formato pela extensão do nome do ficheiro; null se não for STL, OBJ nem 3MF. */
export function modelFormat(fileName: string): ModelFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase() ?? '';
  return (MODEL_FORMATS as readonly string[]).includes(ext) ? (ext as ModelFormat) : null;
}

/** Lê STL, OBJ ou 3MF conforme a extensão; devolve as posições (9 números por triângulo, mm, Z para cima). */
export function parseModel(fileName: string, buf: ArrayBuffer): Float32Array {
  switch (modelFormat(fileName)) {
    case 'stl': return parseStl(buf);
    case 'obj': return parseObj(buf);
    case '3mf': return parse3mf(buf);
    default: throw new StlParseError('unsupported');
  }
}

export type ParsedModel = {
  /** 9 números por triângulo, mm, Z para cima */ positions: Float32Array;
  stats: StlStats;
  /** Medidas (mm) de cada peça impressa em separado: os itens de um 3MF; uma só nos outros formatos. */
  pieces: [number, number, number][];
};

/** Caixa envolvente de um conjunto de malhas. */
function boxSize(list: Float32Array[]): [number, number, number] {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const p of list) for (let i = 0; i < p.length; i += 3) for (let d = 0; d < 3; d++) {
    const x = p[i + d];
    if (x < mn[d]) mn[d] = x;
    if (x > mx[d]) mx[d] = x;
  }
  return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
}

/** Lê o ficheiro e mede-o: posições, medidas do conjunto e de cada peça (para ver se cada uma cabe na impressora). */
export function readModel(fileName: string, buf: ArrayBuffer): ParsedModel {
  const items = modelFormat(fileName) === '3mf' ? read3mfItems(buf) : [[parseModel(fileName, buf)]];
  const positions = concat(items.flat());
  const stats = measureStl(positions);
  return { positions, stats, pieces: items.length > 1 ? items.map(boxSize) : [stats.size] };
}

/** Código de erro para mostrar ao cliente; RangeError é texto ou memória acima do limite do motor JS. */
export function modelErrorCode(e: unknown): ModelParseErrorCode {
  if (e instanceof StlParseError) return e.code;
  return e instanceof RangeError ? 'tooLarge' : 'invalid';
}

/** Volume (tetraedros com sinal), área de superfície e caixa envolvente. */
export function measureStl(p: Float32Array): StlStats {
  let v = 0;
  let a = 0;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7], p[i + 8]];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    for (let k = 0; k < 9; k += 3) for (let d = 0; d < 3; d++) {
      const x = p[i + k + d];
      if (x < mn[d]) mn[d] = x;
      if (x > mx[d]) mx[d] = x;
    }
  }
  return { volume: Math.abs(v), area: a, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], triangles: p.length / 9 };
}

/** density em g/cm³; flow é o fator de velocidade de extrusão face ao PLA. */
export const MATERIALS = [
  { id: 'pla', density: 1.24, flow: 1 },
  { id: 'petg', density: 1.27, flow: 1.05 },
  { id: 'abs', density: 1.04, flow: 1.15 },
  { id: 'tpu', density: 1.21, flow: 0.7 },
] as const;
export type MaterialId = (typeof MATERIALS)[number]['id'];

export type PrintSettings = {
  material: MaterialId;
  /** % da escala original */ scale: number;
  /** % de preenchimento */ infill: number;
  /** mm */ layer: number;
  /** fração extra de material em suportes: 0, 0.15, 0.35 */ supports: number;
  quantity: number;
  /** custo do filamento por kg, na moeda do país */ filamentPerKg: number;
  /** custo da máquina por hora (energia e desgaste) */ machinePerHour: number;
  /** acabamento e embalagem por peça */ finishing: number;
  /** % de margem */ margin: number;
  /** mm/s médios */ speed: number;
  /** % de taxa de pagamento */ fee: number;
};

export type Estimate = {
  size: [number, number, number];
  volumeCm3: number;
  /** fração do volume que vira plástico */ solid: number;
  grams: number;
  hours: number;
  material: number;
  machine: number;
  finishing: number;
  markup: number;
  unit: number;
  total: number;
};

const WALL_MM = 1.2; // 3 perímetros de 0,4 mm

export function estimate(stats: StlStats, s: PrintSettings): Estimate {
  const k = Math.max(s.scale, 1) / 100;
  const mat = MATERIALS.find((m) => m.id === s.material) ?? MATERIALS[0];
  const volume = stats.volume * k ** 3;
  const area = stats.area * k ** 2;
  const shell = volume > 0 ? Math.min(1, (area * WALL_MM) / volume) : 1;
  const solid = shell + (1 - shell) * (s.infill / 100);
  const matMm3 = volume * solid * (1 + s.supports);
  const grams = (matMm3 / 1000) * mat.density;
  const flow = s.speed * s.layer * 0.4 * mat.flow; // mm³/s
  const hours = flow > 0 ? (matMm3 / flow / 3600) * 1.2 : 0; // 20% para deslocações e arranque
  const material = (grams / 1000) * s.filamentPerKg;
  const machine = hours * s.machinePerHour;
  const base = material + machine + s.finishing;
  const unit = (base * (1 + s.margin / 100)) / (1 - Math.min(s.fee / 100, 0.5));
  const quantity = Math.max(1, Math.floor(s.quantity) || 1);
  return {
    size: [stats.size[0] * k, stats.size[1] * k, stats.size[2] * k],
    volumeCm3: volume / 1000,
    solid, grams, hours, material, machine, finishing: s.finishing,
    markup: unit - base, unit, total: unit * quantity,
  };
}

/** A peça cabe na mesa em alguma orientação (compara as medidas ordenadas). */
export function fitsBed(size: readonly number[], bed: readonly number[]): boolean {
  const a = [...size].sort((x, y) => x - y);
  const b = [...bed].sort((x, y) => x - y);
  return a.every((x, i) => x <= b[i]);
}

// ---------------------------------------------------------------------------------------------
// Web Worker: a página cria `new Worker(new URL('../lib/print3d.ts', import.meta.url), { type: 'module' })`, envia o
// ficheiro e recebe o modelo lido, sem bloquear a página. Na página e em Node este bloco não faz nada.

export const READ_MODEL_MESSAGE = 'print3d:read';
export type ReadModelRequest = { type: typeof READ_MODEL_MESSAGE; file: File };
export type ReadModelReply = { model: ParsedModel } | { code: ModelParseErrorCode };

type WorkerScope = {
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  postMessage(message: ReadModelReply, transfer?: Transferable[]): void;
};
const workerGlobal = globalThis as unknown as { WorkerGlobalScope?: abstract new () => unknown };
if (typeof workerGlobal.WorkerGlobalScope === 'function' && globalThis instanceof workerGlobal.WorkerGlobalScope) {
  const scope = globalThis as unknown as WorkerScope;
  scope.addEventListener('message', (e) => {
    const req = e.data as ReadModelRequest | null;
    if (!req || req.type !== READ_MODEL_MESSAGE) return;
    // Responde sempre (modelo ou código de erro), senão a página ficaria à espera.
    req.file.arrayBuffer()
      .then((buf) => { const model = readModel(req.file.name, buf); scope.postMessage({ model }, [model.positions.buffer as ArrayBuffer]); })
      .catch((err) => scope.postMessage({ code: modelErrorCode(err) }));
  });
}
