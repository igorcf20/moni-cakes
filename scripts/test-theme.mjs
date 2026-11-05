// Auto-teste do tema da loja. Correr: node --experimental-strip-types scripts/test-theme.mjs
// 1. O modelo-base (moniCakes) gera as mesmas variáveis CSS que o src/index.css (reserva) já tem.
// 2. Cores calculadas mantêm contraste legível em todos os modelos.
// 3. Junção da marca: o que o Admin grava ganha, vazio apaga imagens, valores antigos servem de reserva.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contrast, hexToHslString, ensureContrast, parseHex } from "../src/theme/color.ts";
import { themeVars, resolveColors, contrastWarnings } from "../src/theme/themeVars.ts";
import { PRESETS, PRESET_IDS } from "../src/theme/presets.ts";
import { mergeBrand, toSaved, splitAccent } from "../src/theme/brand.ts";
import { STORE_DEFAULTS } from "../src/config/store.ts";

// --- cores básicas ---
assert.equal(hexToHslString("#FF5A0A"), "20 100% 52%");
assert.equal(hexToHslString("#FBF8F3"), "38 50% 97%");
assert.equal(parseHex("#abc").r, 0xaa);
assert.equal(parseHex("nope"), null);
assert.ok(contrast(ensureContrast("#FF5A0A", "#FBF8F3"), "#FBF8F3") >= 4.5);

// --- 1. tema-base (moniCakes) = index.css ---
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const cssVars = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const vars = themeVars(PRESETS.moniCakes);
const hslLike = /^\d+ \d+% \d+%$/;
// Variáveis calculadas (tons auxiliares) podem diferir uns pontos do valor escrito à mão no index.css.
const derived = new Set(["--input", "--card-border", "--brand-royal-glow", "--brand-cyan", "--brand-navy-deep", "--surface-navy"]);
let compared = 0;
const diffs = [];
for (const [name, value] of Object.entries(vars)) {
  const expected = cssVars[name];
  if (!expected || !hslLike.test(value) || !hslLike.test(expected)) continue;
  compared++;
  const a = value.match(/\d+/g).map(Number), b = expected.match(/\d+/g).map(Number);
  const tolerance = derived.has(name) ? 8 : 1; // 1 ponto: arredondamentos
  if (!a.every((n, i) => Math.abs(n - b[i]) <= tolerance)) diffs.push(`${name}: tema ${value} != index.css ${expected}`);
}
assert.deepEqual(diffs, [], "o modelo moniCakes devia reproduzir o index.css");
assert.ok(compared >= 20, `poucas variáveis comparadas (${compared})`);

// --- 2. contraste em todos os modelos ---
for (const id of PRESET_IDS) {
  const r = resolveColors(PRESETS[id].colors);
  assert.ok(contrast(r.primaryText, r.background) >= 4.5, `${id}: cor da marca em texto pequeno ilegível`);
  assert.deepEqual(contrastWarnings(PRESETS[id].colors), [], `${id}: avisos de contraste`);
  assert.ok(themeVars(PRESETS[id])["--font-body"].length > 0);
}

// --- 3. junção da marca ---
const base = STORE_DEFAULTS;
assert.deepEqual(mergeBrand(base, null), base, "sem nada gravado = valores-base");
const m = mergeBrand(base, { logos: { wordmark: "" }, theme: { colors: { primary: "#2563eb", primaryText: "" }, fontBody: "manrope", fontHeading: "xpto" } }, { name: "Minha Loja" });
assert.equal(m.name, "Minha Loja");
assert.equal(m.logos.wordmark, "", "vazio gravado = sem imagem");
assert.equal(m.logos.icon, base.logos.icon);
assert.equal(m.theme.colors.primary, "#2563EB");
assert.equal(m.theme.colors.primaryText, undefined, "vazio num ajuste fino = calculado");
assert.equal(m.theme.fontBody, "manrope");
assert.equal(m.theme.fontHeading, base.theme.fontHeading, "fonte desconhecida é ignorada");
const ocean = mergeBrand(base, { theme: { preset: "ocean", colors: { ...PRESETS.ocean.colors } } });
assert.equal(ocean.theme.colors.primaryText, undefined, "modelo gravado não herda ajustes finos do tema-base");
assert.deepEqual(mergeBrand(base, toSaved(base)).theme, base.theme, "gravar o tema-base preserva os ajustes finos");
const legacy = mergeBrand(base, null, { primaryColor: "#123456", logoUrl: "/x.png", favicon: "/f.png" });
assert.equal(legacy.theme.colors.primary, "#123456");
assert.equal(legacy.logos.full, "/x.png");
assert.equal(legacy.favicon, "/f.png");
const roundTrip = mergeBrand(base, toSaved({ ...base, tagline: "Outra" }));
assert.equal(roundTrip.tagline, "Outra");
assert.deepEqual(splitAccent("PRINT3D", "3D"), ["PRINT", "3D"]);
assert.deepEqual(splitAccent("Loja", "3D"), ["Loja", ""]);
assert.deepEqual(splitAccent("3D", "3D"), ["3D", ""]);

console.log(`tema: todos os testes passaram (${compared} variáveis iguais ao index.css)`);
