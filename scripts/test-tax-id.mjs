// Auto-teste do documento fiscal. Correr: node --experimental-strip-types scripts/test-tax-id.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as web from "../src/lib/taxId.ts";
import * as edge from "../supabase/functions/_shared/taxId.ts";

// As duas cópias têm de ser iguais (fora o cabeçalho).
const body = (p) => readFileSync(new URL(p, import.meta.url), "utf8").split("\n").slice(2).join("\n");
assert.equal(body("../src/lib/taxId.ts"), body("../supabase/functions/_shared/taxId.ts"), "src/lib/taxId.ts e _shared/taxId.ts divergem");

for (const m of [web, edge]) {
  const ok = (k, v) => assert.equal(m.isValidTaxId(k, v), true, `${k} ${v} devia ser válido`);
  const bad = (k, v) => assert.equal(m.isValidTaxId(k, v), false, `${k} ${v} devia ser inválido`);
  ok("br_cpf_cnpj", "529.982.247-25"); ok("br_cpf_cnpj", "11144477735");
  bad("br_cpf_cnpj", "529.982.247-24"); bad("br_cpf_cnpj", "111.111.111-11");
  ok("br_cpf_cnpj", "11.222.333/0001-81"); bad("br_cpf_cnpj", "11.222.333/0001-80");
  ok("br_cpf_cnpj", "12.ABC.345/01DE-35"); bad("br_cpf_cnpj", "12.ABC.345/01DE-36"); // CNPJ alfanumérico (exemplo da Receita)
  ok("pt_nif", "123 456 789"); bad("pt_nif", "123456788");
  ok("es_nif", "12345678Z"); bad("es_nif", "12345678A"); ok("es_nif", "X1234567L"); ok("es_nif", "B12345674");
  ok("none", "");
  assert.equal(m.formatTaxId("br_cpf_cnpj", "52998224725"), "529.982.247-25");
  assert.equal(m.formatTaxId("br_cpf_cnpj", "11222333000181"), "11.222.333/0001-81");
  assert.equal(m.formatTaxId("br_cpf_cnpj", "12abc34501de35"), "12.ABC.345/01DE-35");
  assert.equal(m.formatTaxId("pt_nif", "123456789"), "123 456 789");
  assert.equal(m.taxIdType("br_cpf_cnpj", "529.982.247-25"), "cpf");
  assert.equal(m.taxIdType("br_cpf_cnpj", "11.222.333/0001-81"), "cnpj");
}
console.log("taxId: todos os testes passaram");
