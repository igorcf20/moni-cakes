import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
async function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const { parseMoneyInput } = await load("../src/lib/moneyInput.ts");
const { reconcileMaterialIds } = await load("../src/lib/materialReconciliation.ts");
for (const [text, expected] of [["0", 0], ["2,50", 2.5], ["2.50", 2.5], [" 2,50 ", 2.5]]) {
  assert.equal(parseMoneyInput(text), expected);
}
for (const text of ["", " ", "1 2", "1.000,50", "NaN", "Infinity", "-1", "1e3", "2,3,4", "2.555", "2."]) {
  assert.equal(parseMoneyInput(text), null, text);
}
assert.equal(parseMoneyInput(NaN), null);
assert.equal(parseMoneyInput(Infinity), null);
assert.equal(parseMoneyInput("0,0125", 4), 0.0125);
assert.equal(parseMoneyInput("0,01255", 4), null);
assert.equal(parseMoneyInput("2", -1), null);
assert.equal(parseMoneyInput("999999999999999999999999"), null);
const existing = [{ id: "a", name: "Algodão" }, { id: "b", name: "Poliéster" }];
let serial = 0;
const fresh = () => "new-" + ++serial;
assert.deepEqual(reconcileMaterialIds([{ id: "a", name: "Algodão premium" }], existing, fresh), ["a"], "renaming preserves ID");
assert.deepEqual(reconcileMaterialIds([{ id: "from-another-preset", name: " algodão " }], existing, fresh), ["a"]);
assert.deepEqual(reconcileMaterialIds([{ id: "foreign", name: "Linho" }], existing, fresh), ["new-1"], "never reuse foreign ID");
assert.deepEqual(reconcileMaterialIds([{ name: "Algodão" }, { id: "a", name: "Novo algodão" }], existing, fresh), ["new-2", "a"], "reserve explicit IDs first");
assert.throws(() => reconcileMaterialIds([{ name: "Algodão" }, { name: " algodão " }], existing), /repita/);
assert.throws(() => reconcileMaterialIds([{ id: "a", name: "X" }, { id: "a", name: "Y" }], existing), /mais de uma/);
assert.throws(() => reconcileMaterialIds([{ name: " " }], existing), /nome/);
assert.deepEqual(reconcileMaterialIds([], existing), []);
console.log("Admin materials: stable IDs, independent preset copies, duplicate checks and monetary precision passed.");

