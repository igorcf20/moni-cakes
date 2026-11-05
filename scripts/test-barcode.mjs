// Teste dos códigos de barras (src/lib/barcode.ts): EAN-13 igual à referência (python-barcode), Code 128 lido de volta
// por um decodificador independente (padrões, soma de verificação, troca B/C) e comparado com códigos de referência.
// Uso: node --experimental-strip-types scripts/test-barcode.mjs
import assert from 'node:assert/strict';
import { CODE128_PATTERNS, barcodeModules, barcodeSvg, code128Modules, gtinCheckDigit, isValidGtin } from '../src/lib/barcode.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const bits = (m) => m.map((b) => (b ? '1' : '0')).join('');

// Referências geradas com python-barcode 0.15 (build()[0]).
const EAN = {
  '7891234567895': '10101101110010111001100100110110111101001110101010100111010100001000100100100011101001001110101',
  '4006381333931': '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101',
  '0012345678905': '10100011010011001001001101111010100011011000101010101000010001001001000111010011100101001110101',
};
const PY128 = {
  'VF-AREIA-M': '1101001000011101011000100011000101001101110010100011000110001011101000110100011000100010101000110001001101110010111011000100011000101100011101011',
  '12345678': '1101001110010110011100100010110001110001011011000010100100011101101100011101011',
  'PED 1A2B3C4D': '11010010000111011101101000110100010110001000110110011001001110011010100011000110011100101000101100011001011100100010001101100100111010110001000111001011001100011101011',
};

/** Decodificador Code 128 independente: módulos -> texto, conferindo a soma. */
function decode128(b) {
  const widths = [];
  let i = 0;
  while (i < b.length) { let j = i; while (j < b.length && b[j] === b[i]) j++; widths.push(j - i); i = j; }
  const vals = [];
  let k = 0;
  while (k < widths.length) {
    const take = widths.slice(k, k + 6).join('');
    const idx = CODE128_PATTERNS.indexOf(take);
    if (idx === -1) { const stop = widths.slice(k, k + 7).join(''); assert.equal(stop, '2331112', 'fim'); break; }
    vals.push(idx); k += 6;
  }
  const check = vals.pop();
  let sum = vals[0];
  for (let x = 1; x < vals.length; x++) sum += vals[x] * x;
  assert.equal(sum % 103, check, 'soma de verificação');
  let set = vals[0] === 105 ? 'C' : vals[0] === 104 ? 'B' : 'A';
  let out = '';
  for (const v of vals.slice(1)) {
    if (v === 99) { set = 'C'; continue; }
    if (v === 100 && set === 'C') { set = 'B'; continue; }
    out += set === 'C' ? String(v).padStart(2, '0') : String.fromCharCode(v + 32);
  }
  return out;
}

test('tabela do Code 128: 107 padrões únicos de 11 módulos (fim 13)', () => {
  assert.equal(CODE128_PATTERNS.length, 107);
  assert.equal(new Set(CODE128_PATTERNS).size, 107);
  CODE128_PATTERNS.forEach((p, i) => assert.equal([...p].reduce((s, c) => s + Number(c), 0), i === 106 ? 13 : 11, String(i)));
});

test('Code 128 lido de volta e referências lidas pelo mesmo decodificador', () => {
  for (const s of ['VF-AREIA-M', 'EST-0142', '12345678', '123456789', 'PED 1A2B3C4D', 'A1', '7', 'Hello world 2026 ~{}', '00', 'AB1234CD567890']) {
    assert.equal(decode128(bits(code128Modules(s))), s, s);
  }
  for (const [s, ref] of Object.entries(PY128)) assert.equal(decode128(ref), s, `referência ${s}`);
  assert.equal(bits(code128Modules('VF-AREIA-M')), PY128['VF-AREIA-M'], 'igual à referência (só B)');
  assert.equal(bits(code128Modules('12345678')), PY128['12345678'], 'igual à referência (só C)');
  assert.equal(decode128(bits(code128Modules('Ação'))), 'Acao', 'acentos viram letra simples');
});

test('EAN-13 igual à referência e GTIN', () => {
  for (const [c, ref] of Object.entries(EAN)) {
    const b = barcodeModules(c);
    assert.equal(b.kind, 'ean13');
    assert.equal(bits(b.modules), ref, c);
  }
  assert.equal(barcodeModules('012345678905').text, '0012345678905', 'UPC-A vira EAN-13');
  assert.equal(barcodeModules('7891234567890').kind, 'code128', 'dígito errado não é EAN');
  assert.equal(gtinCheckDigit('789123456789'), 5);
  assert.ok(isValidGtin('7891234567895') && isValidGtin('96385074') && !isValidGtin('123'));
  assert.equal(barcodeModules('  '), null);
});

test('SVG com margem branca, texto escapado', () => {
  const svg = barcodeSvg('<A&B>');
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes('&lt;A&amp;B&gt;') && !svg.includes('<A&B>'));
  assert.ok(!barcodeSvg('X', { showText: false }).includes('<text'));
});

console.log(`\n${n} testes ok`);
