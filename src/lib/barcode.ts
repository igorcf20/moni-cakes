// =====================================================================================
// Códigos de barras para etiquetas e impressões do Admin, sem biblioteca externa nem rede.
//   EAN-13 (e UPC-A como EAN-13 com 0 na frente) para GTIN válido; Code 128 para o resto (SKU, código interno, pedido).
//   barcodeModules(valor) devolve as barras (true = preta) e o tipo; barcodeSvg desenha em SVG para imprimir.
// Sem imports com @/ para o teste em node (scripts/test-barcode.mjs, que compara com valores de referência).
// =====================================================================================

export type BarcodeKind = 'ean13' | 'code128';
export type Barcode = { kind: BarcodeKind; text: string; modules: boolean[] };

// Code 128: larguras (barra, espaço, barra...) dos 107 símbolos; 103/104/105 = início A/B/C, 106 = fim.
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
export const CODE128_PATTERNS = C128;
const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

/** Texto aceito no Code 128 B: ASCII visível e espaço. Outros caracteres viram "?". */
export function code128Clean(text: string): string {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');
}

/** Símbolos (valores) do Code 128 com início, troca B/C para blocos de dígitos, soma de verificação e fim. */
export function code128Values(input: string): number[] {
  const s = code128Clean(input);
  const out: number[] = [];
  const digitsRun = (i: number) => { let j = i; while (j < s.length && s[j] >= '0' && s[j] <= '9') j++; return j - i; };
  let i = 0;
  let set: 'B' | 'C';
  // Começa em C quando abre com 4 ou mais dígitos (ou o texto todo é um número par de dígitos).
  const first = digitsRun(0);
  if (first >= 4 || (first === s.length && first >= 2 && first % 2 === 0)) { set = 'C'; out.push(START_C); } else { set = 'B'; out.push(START_B); }
  while (i < s.length) {
    if (set === 'C') {
      const run = digitsRun(i);
      if (run >= 2) { out.push(Number(s.slice(i, i + 2))); i += 2; continue; }
      out.push(CODE_B); set = 'B';
      continue;
    }
    const run = digitsRun(i);
    // Bloco de dígitos que compensa trocar para C: 4+ no meio, ou um número par que vai até o fim.
    if (run >= 6 || (run >= 4 && i + run === s.length) ) {
      if (run % 2 === 1) { out.push(s.charCodeAt(i) - 32); i += 1; }
      out.push(CODE_C); set = 'C';
      continue;
    }
    out.push(s.charCodeAt(i) - 32); i += 1;
  }
  let sum = out[0];
  for (let k = 1; k < out.length; k++) sum += out[k] * k;
  out.push(sum % 103, STOP);
  return out;
}

const widthsToModules = (widths: string, out: boolean[]) => {
  let bar = true;
  for (const w of widths) { for (let k = 0; k < Number(w); k++) out.push(bar); bar = !bar; }
};

export function code128Modules(text: string): boolean[] {
  const out: boolean[] = [];
  for (const v of code128Values(text)) widthsToModules(C128[v], out);
  return out;
}

// EAN-13
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const R = L.map((p) => [...p].map((c) => (c === '0' ? '1' : '0')).join(''));
const G = R.map((p) => [...p].reverse().join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Dígito verificador GTIN (8, 12, 13 ou 14 dígitos: soma com pesos 3 e 1 da direita para a esquerda). */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(v: string | null | undefined): boolean {
  const s = String(v ?? '').trim();
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)) return false;
  return gtinCheckDigit(s.slice(0, -1)) === Number(s[s.length - 1]);
}

export function ean13Modules(code13: string): boolean[] {
  const d = code13.split('').map(Number);
  let bits = '101';
  const parity = PARITY[d[0]];
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  return [...bits].map((c) => c === '1');
}

/** Melhor código para um valor: GTIN de 12 ou 13 dígitos válido = EAN-13; o resto = Code 128. */
export function barcodeModules(value: string): Barcode | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (isValidGtin(v) && (v.length === 13 || v.length === 12)) {
    const c = v.length === 12 ? `0${v}` : v;
    return { kind: 'ean13', text: c, modules: ean13Modules(c) };
  }
  return { kind: 'code128', text: code128Clean(v), modules: code128Modules(v) };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * SVG do código (largura em módulos, altura relativa; o CSS de quem usa define o tamanho real).
 * showText escreve o valor por baixo. quiet = margem branca (10 módulos, a que os leitores pedem).
 */
export function barcodeSvg(value: string, opts: { height?: number; showText?: boolean; quiet?: number } = {}): string {
  const b = barcodeModules(value);
  if (!b) return '';
  const quiet = opts.quiet ?? 10;
  const h = opts.height ?? 50;
  const textH = opts.showText === false ? 0 : 12;
  const w = b.modules.length + quiet * 2;
  let rects = '';
  let x = 0;
  while (x < b.modules.length) {
    if (!b.modules[x]) { x++; continue; }
    let run = 1;
    while (x + run < b.modules.length && b.modules[x + run]) run++;
    rects += `<rect x="${x + quiet}" y="0" width="${run}" height="${h}"/>`;
    x += run;
  }
  const text = textH ? `<text x="${w / 2}" y="${h + 10}" text-anchor="middle" font-family="monospace" font-size="10">${esc(b.text)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h + textH}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${esc(b.text)}"><rect width="${w}" height="${h + textH}" fill="#fff"/><g fill="#000">${rects}</g>${text}</svg>`;
}
