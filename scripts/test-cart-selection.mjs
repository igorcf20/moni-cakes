import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/cartSelection.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { prepareCartSelection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const areas = { chest: { areaLabel: "Peito", widthCm: 29.09090909090909, heightCm: 40, notes: "Comentário opcional", fileDataURL: "data:image/png;base64,original", artwork: { originalBytes: 123, sha256: "original-hash", sourceWidthCm: 32, sourceHeightCm: 44 } } };
const input = [
  { productId: "product", variationId: "white", sizeLabel: "M", quantity: 3, designData: { price: 17, size: "M", customization: { areas, addon: 4.5 } } },
  { productId: "product", variationId: "white", sizeLabel: "XL", quantity: 1, designData: { price: 18.5, size: "XL", customization: { areas, addon: 4.5 } } },
];
const rows = prepareCartSelection(input);
assert.deepEqual(rows.map(r => [r.size_label, r.quantity, r.design_data.price]), [["M", 3, 17], ["XL", 1, 18.5]]);
assert.equal(rows.reduce((sum, r) => sum + r.quantity * r.design_data.price, 0), 69.5);
assert.strictEqual(rows[0].design_data.customization.areas, areas);
assert.deepEqual(JSON.parse(JSON.stringify(rows))[1].design_data.customization.areas, areas);
for (const quantity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => prepareCartSelection([{ ...input[0], quantity }]));
for (const price of [-1, NaN, Infinity, "17"]) assert.throws(() => prepareCartSelection([{ ...input[0], designData: { price } }]));
assert.throws(() => prepareCartSelection([]));
assert.equal(prepareCartSelection([{ ...input[0], designData: { price: 0 } }])[0].design_data.price, 0);
console.log("Cart selection: per-size quantities/prices, artwork fidelity and invalid input checks passed.");
