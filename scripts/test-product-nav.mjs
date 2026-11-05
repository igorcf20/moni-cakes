// Partes (abas) da página do produto no Admin: toda parte tem grupo, explicação nos 4 idiomas e os blocos têm dica.
// node --experimental-strip-types scripts/test-product-nav.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok', name); };
const page = readFileSync(new URL('../src/pages/AdminProductEdit.tsx', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/i18n/adminProductNav.ts', import.meta.url), 'utf8');
const values = [...page.matchAll(/\{ value: "([a-z]+)", label: [^}]*group: "(basics|options|selling|more)"/g)].map((m) => m[1]);

test('todas as partes têm grupo', () => {
  const all = [...page.matchAll(/\{ value: "([a-z]+)", label:/g)].map((m) => m[1]);
  assert.ok(all.length >= 17, `partes encontradas: ${all.length}`);
  assert.deepEqual(values.sort(), all.sort());
});

test('explicação de cada parte e de cada grupo nos 4 idiomas, sem travessões', () => {
  // pt-BR, en e es têm todas as chaves (pt-PT herda do pt-BR)
  const keys = [...values.map((v) => `d_${v}`), ...['basics', 'options', 'selling', 'more'].flatMap((g) => [`g_${g}`, `gd_${g}`])];
  for (const k of keys) assert.ok((i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length >= 3, k);
  assert.doesNotMatch(i18n, /[\u2013\u2014]/);
});

test('cada bloco da página tem dica (HelpTip)', () => {
  const titles = (page.match(/<h2 className=\{panelTitle\}>/g) || []).length;
  const tips = (page.match(/<HelpTip label=\{tnav\("help"\)\}/g) || []).length;
  assert.equal(tips, titles);
});

test('sem abas soltas nem janelas', () => {
  assert.doesNotMatch(page, /<TabsList|<Dialog|AlertDialog|window\.confirm/);
  assert.match(page, /<ProductSectionNav /);
});

console.log(`\n${n} testes ok`);
