// Isolated browser regression: all backend requests are fulfilled by fixtures.
// Run against a local Vite server; never points to production.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = "http://127.0.0.1:5178";
const product = { id: "qa-shirt", name: "T-shirt de teste", category: "T-shirts", price: 20, is_active: true, is_customizable: true, stock_quantity: 10, display_order: 0, description: "Produto de teste", image: "" };
const tables = {
 products: [product, { ...product, id: "qa-mug", name: "Caneca de teste", category: "Canecas" }],
 categories: [{ id: "cat1", name: "T-shirts", is_active: true }, { id: "cat2", name: "Canecas", is_active: true }],
 product_sizes: [{ id: "size1", product_id: product.id, size_label: "M", price_modifier: 1.5, display_order: 0, is_active: true }],
 size_presets: [{ id: "preset-size", name: "Tamanhos teste", sizes: ["M"], items: [{ label: "M", defaultPriceAdjustment: 1.5, displayOrder: 0 }], display_order: 0 }],
 product_variations: [{ id: "var1", product_id: product.id, name: "Azul", color_hex: "#123456", price_modifier: 2, display_order: 0, is_active: true }],
 variation_presets: [], variation_preset_items: [],
 product_print_areas: [{ id: "area1", product_id: product.id, label: "Peito", key: "chest", allowed_techniques: ["dtf"], default_technique: "dtf", base_price: 3, min_price: 0, pricing_mode: "flat", area_width_cm: 30, area_height_cm: 40, max_width_cm: 30, max_height_cm: 40, is_active: true, display_order: 0 }],
 product_print_area_techniques: [{ id: "tech1", print_area_id: "area1", technique: "dtf", pricing_mode: "flat", base_price: 3, min_price: 0, price_per_cm2: 0, is_active: true, display_order: 0 }],
 product_print_area_technique_materials: [{ id: "mat1", area_technique_id: "tech1", name: "Película", price_adjustment: 2.5, pricing_mode: "fixed", price_per_meter: 0, calculation_dimension: "height", display_order: 0 }],
 customization_technique_presets: [], customization_technique_preset_materials: [], customization_area_presets: [],
};
(async () => {
 console.log("Admin QA: launching browser");
 const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined, timeout: 30000 });
 console.log("Admin QA: browser ready");
 try {
 const page = await browser.newPage();
 page.setDefaultTimeout(30000);
 page.setDefaultNavigationTimeout(90000);
 await page.addInitScript(() => localStorage.setItem("cookie-consent-v2", JSON.stringify({ essential: true, analytics: false, marketing: false, preferences: false, timestamp: new Date().toISOString(), version: 1 })));
 const navigate = async (path) => {
   console.log("Admin QA: navigate", path);
   await page.goto(base + path, { waitUntil: "domcontentloaded" });
 };
 const errors = [];
 page.on("pageerror", error => errors.push(error.message));
 await page.route("**/*", async route => {
   const request = route.request(), url = new URL(request.url());
   if (url.origin === base) {
     if (url.pathname === "/src/hooks/useAuth.tsx") return route.fulfill({ contentType: "application/javascript", body: 'export const useAuth = () => ({ user: { id: "qa-admin" }, loading: false, signOut: async () => {} });' });
     if (url.pathname === "/src/hooks/useRole.tsx") return route.fulfill({ contentType: "application/javascript", body: 'export const useRole = () => ({ isAdmin: true, isLoading: false });' });
     return route.continue();
   }
   if (url.pathname.startsWith("/rest/v1/")) {
     const table = url.pathname.split("/").pop();
     if (url.pathname.includes("/rpc/")) return route.fulfill({ json: false });
     let rows = tables[table] ?? [];
     const matches = row => [...url.searchParams].every(([key, value]) => {
       if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
       if (value.startsWith("in.(")) return value.slice(4, -1).split(",").map(id => id.replace(/^"|"$/g, "")).includes(String(row[key]));
       return true;
     });
     if (request.method() === "POST") {
       const payload = request.postDataJSON();
       const entries = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: "qa-" + Math.random().toString(16).slice(2), ...row }));
       tables[table] ??= [];
       for (const row of entries) {
         const index = tables[table].findIndex(saved => saved.id === row.id);
         if (index < 0) tables[table].push(row); else tables[table][index] = { ...tables[table][index], ...row };
       }
       rows = entries;
     } else if (request.method() === "PATCH") {
       const update = request.postDataJSON();
       rows.filter(matches).forEach(row => Object.assign(row, update));
       rows = rows.filter(matches);
     } else if (request.method() === "DELETE") {
       tables[table] = rows.filter(row => !matches(row));
       rows = [];
     } else rows = rows.filter(matches);
     const single = request.headers().accept?.includes("vnd.pgrst.object");
     return route.fulfill({ json: single ? (rows[0] ?? null) : rows });
   }
   return route.fulfill({ json: {} });
 });
 for (const width of [390, 1440]) {
   await page.setViewportSize({ width, height: 1000 });
   await navigate( "/admin?tab=products");
   await page.getByRole("heading", { name: "Catálogo de Produtos" }).last().waitFor();
   await page.getByRole("navigation", { name: "Categorias do catálogo" }).getByRole("button", { name: /Canecas/ }).click();
   await page.getByText("Caneca de teste", { exact: true }).waitFor();
   assert.equal(await page.getByText("T-shirt de teste", { exact: true }).count(), 0);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "catalogue overflow");
   await page.screenshot({ path: ".qa-admin-catalogue-" + width + ".png", fullPage: true });
   await navigate( "/admin/produto/qa-shirt?tab=variations");
   if (width < 1024) {
     await page.getByLabel("Secção do produto", { exact: true }).waitFor();
     assert.equal(await page.getByLabel("Secção do produto", { exact: true }).inputValue(), "variations");
     await page.getByLabel("Secção do produto", { exact: true }).selectOption("sizes");
   } else {
     await page.getByRole("tab", { name: "Cores", exact: true }).waitFor();
     assert.equal(await page.getByRole("tab", { name: "Cores", exact: true }).getAttribute("data-state"), "active");
     await page.getByRole("tab", { name: "Tamanhos", exact: true }).click();
   }
   await page.getByRole("button", { name: "Gerir presets", exact: true }).click();
   await page.getByRole("dialog", { name: "Presets de tamanhos" }).waitFor();
   await page.getByText("Editar tamanhos e acréscimos padrão", { exact: true }).first().click();
   const details = page.locator("details").filter({ hasText: "Editar tamanhos e acréscimos padrão" }).first();
   await details.getByLabel("Acréscimo (€)", { exact: true }).fill("4,50");
   await details.getByRole("button", { name: "Guardar tamanhos e valores" }).click();
   await page.waitForTimeout(300);
   assert.equal(tables.size_presets[0].items[0].defaultPriceAdjustment, 4.5);
   if (width === 390) {
     await page.getByRole("button", { name: "Duplicar", exact: true }).click();
     await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
     await page.waitForTimeout(300);
     assert.equal(tables.size_presets.at(-1).items[0].defaultPriceAdjustment, 4.5);
     await page.getByLabel("Origem do preset de tamanhos").selectOption("empty");
     await page.getByPlaceholder("Ex: EU S-3XL").fill("Preset vazio");
     await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
     await page.waitForTimeout(300);
     assert.deepEqual(tables.size_presets.at(-1).items, []);
   }
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "editor overflow");
   await page.screenshot({ path: ".qa-admin-editor-" + width + ".png", fullPage: true });
   await page.keyboard.press("Escape");
 }
 console.log("Admin QA: material presets");
 await page.getByRole("tab", { name: "Materiais", exact: true }).click();
 await page.getByText("Valores ativos neste produto", { exact: true }).waitFor();
 const configCard = page.locator("div.rounded-xl.border.p-3").filter({ hasText: "Película" });
 await configCard.getByRole("button", { name: "Editar", exact: true }).click();
 await page.getByRole("button", { name: "Criar preset desta área" }).click();
 await page.getByRole("button", { name: "Guardar preset", exact: true }).click();
 await page.waitForTimeout(500);
 assert.equal(tables.customization_technique_presets[0].base_price, 3);
 assert.equal(tables.customization_technique_preset_materials[0].default_price_adjustment, 2.5);
 assert.equal(tables.customization_technique_preset_materials[0].pricing_mode, "fixed");
 await page.getByRole("dialog").getByRole("button", { name: "Duplicar", exact: true }).click();
 await page.getByRole("button", { name: "Guardar preset", exact: true }).click();
 await page.waitForTimeout(400);
 assert.equal(tables.customization_technique_presets.length, 2);
 assert.equal(tables.customization_technique_preset_materials.at(-1).default_price_adjustment, 2.5);
 const originalPresetId = tables.customization_technique_presets[0].id;
 const originalMaterial = tables.customization_technique_preset_materials.find(row => row.preset_id === originalPresetId);
 const originalMaterialId = originalMaterial.id;
 await page.getByLabel("Pesquisar presets de materiais").fill("pelicula dtf");
 await page.getByRole("status").filter({ hasText: "2 de 2 presets" }).waitFor();
 await page.getByLabel("Pesquisar presets de materiais").fill("inexistente");
 await page.getByText("Nenhum preset corresponde à pesquisa.", { exact: true }).waitFor();
 await page.getByRole("button", { name: "Limpar pesquisa", exact: true }).click();
 await page.getByLabel("Pesquisar presets de materiais").fill("cópia");
 assert.equal(await page.getByRole("button", { name: "Editar Peito — DTF", exact: true }).count(), 0);
 await page.getByRole("button", { name: "Limpar pesquisa", exact: true }).click();
 await page.getByRole("button", { name: "Editar Peito — DTF", exact: true }).click();
 await page.getByRole("dialog").getByLabel("Nome do material 1", { exact: true }).fill("Película premium");
 await page.getByRole("dialog").getByLabel("Valor fixo do material 1", { exact: true }).fill("");
 await page.getByRole("button", { name: "Guardar preset", exact: true }).click();
 await page.waitForTimeout(200);
 assert.equal(originalMaterial.default_price_adjustment, 2.5, "empty price must not save as zero");
 assert.equal(await page.getByRole("dialog").getByLabel("Valor fixo do material 1", { exact: true }).getAttribute("aria-invalid"), "true");
 await page.getByRole("dialog").getByLabel("Valor fixo do material 1", { exact: true }).fill("4,25");
 await page.getByRole("button", { name: "Material", exact: true }).click();
 await page.getByRole("dialog").getByLabel("Nome do material 2", { exact: true }).fill("Vinil");
 await page.getByRole("dialog").getByLabel("Valor fixo do material 2", { exact: true }).fill("1,50");
 await page.getByRole("button", { name: "Subir material Vinil", exact: true }).click();
 await page.getByRole("button", { name: "Guardar preset", exact: true }).click();
 await page.waitForTimeout(400);
 const retained = tables.customization_technique_preset_materials.find(row => row.id === originalMaterialId);
 assert.equal(retained.name, "Película premium");
 assert.equal(retained.default_price_adjustment, 4.25);
 assert.equal(retained.display_order, 1);
 assert.equal(tables.customization_technique_preset_materials.find(row => row.preset_id === originalPresetId && row.name === "Vinil").display_order, 0);
 assert.equal(tables.product_print_area_technique_materials[0].price_adjustment, 2.5, "editing preset must not change product");

 await page.setViewportSize({ width: 390, height: 950 });
 await page.getByRole("dialog").evaluate(el => { el.scrollTop = 0; });
 await page.getByRole("button", { name: "Editar Peito — DTF", exact: true }).click();
 await page.getByRole("dialog").getByLabel("Nome do material 1", { exact: true }).scrollIntoViewIfNeeded();
 assert.equal(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, "material modal overflow");
 await page.screenshot({ path: ".qa-simple-materials-390.png" });
 console.log("Admin QA: material search, prices, identity and mobile controls passed");
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.keyboard.press("Escape");
 await page.getByRole("tab", { name: "Cores", exact: true }).click();
 await page.getByRole("button", { name: /Gerir presets/ }).click();
 await page.getByPlaceholder("Nome do novo preset").fill("Cores com valores");
 await page.getByRole("button", { name: "Guardar produto", exact: true }).click();
 await page.waitForTimeout(400);
 assert.equal(tables.variation_preset_items[0].price_modifier, 2);
 assert.equal(tables.variation_preset_items[0].color_hex, "#123456");
 await page.getByRole("button", { name: "Duplicar Cores com valores", exact: true }).click();
 await page.waitForTimeout(400);
 assert.equal(tables.variation_presets.length, 2);
 assert.equal(tables.variation_preset_items.at(-1).price_modifier, 2);
 await page.setViewportSize({ width: 390, height: 950 });
 await page.getByRole("dialog").evaluate(el => { el.scrollTop = 0; });
 await page.screenshot({ path: ".qa-simple-colors-390.png" });
 assert.equal(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, "color modal overflow");
 await page.keyboard.press("Escape");
 for (const width of [390, 1440]) {
   await page.setViewportSize({ width, height: 950 });
   await navigate( "/admin/produto/qa-shirt?tab=customization");
   await page.getByRole("heading", { name: "Áreas de personalização", exact: true }).waitFor();
   assert.equal(await page.getByText("Cores disponíveis", { exact: true }).count(), 0);
   assert.equal(await page.getByText("Configuração rápida", { exact: true }).count(), 0);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "area page overflow");
   await page.screenshot({ path: ".qa-simple-areas-" + width + ".png", fullPage: true });
   await page.getByRole("button", { name: "Gerir presets", exact: true }).click();
   await page.getByRole("button", { name: "Criar deste produto" }).click();
   await page.getByLabel("Nome do preset", { exact: true }).fill("Áreas " + width);
   await page.getByRole("button", { name: "Guardar preset", exact: true }).click();
   await page.waitForTimeout(400);
   assert.equal(tables.customization_area_presets.at(-1).items[0].base_price, 3);
   await page.getByRole("dialog").evaluate(el => { el.scrollTop = 0; });
   await page.screenshot({ path: ".qa-simple-area-presets-" + width + ".png" });
   await page.keyboard.press("Escape");
   await page.getByLabel("Preset de áreas", { exact: true }).selectOption(tables.customization_area_presets.at(-1).id);
   const areaCount = tables.product_print_areas.length;
   await page.getByRole("button", { name: "Aplicar ao produto", exact: true }).click();
   await page.waitForTimeout(200);
   assert.equal(tables.product_print_areas.length, areaCount, "reapply must not duplicate areas");
   await page.getByRole("button", { name: "Adicionar área", exact: true }).click();
   await page.getByLabel("Nome da área", { exact: true }).fill("Manga " + width);
   await page.getByLabel("Acréscimo por unidade (€)", { exact: true }).fill("-1");
   await page.getByRole("button", { name: "Guardar área", exact: true }).click();
   await page.waitForTimeout(200);
   assert.equal(tables.product_print_areas.length, areaCount, "negative price must be rejected");
   await page.getByLabel("Acréscimo por unidade (€)", { exact: true }).fill("2,70");
   await page.getByRole("button", { name: "Guardar área", exact: true }).click();
   await page.waitForTimeout(300);
   assert.equal(tables.product_print_areas.at(-1).base_price, 2.7);
   assert.equal(tables.product_print_areas.at(-1).product_id, product.id);
 }
 await navigate( "/admin?tab=products");
 await page.getByRole("navigation", { name: "Categorias do catálogo" }).getByRole("button", { name: /T-shirts/ }).click();
 await page.getByRole("button", { name: "Duplicar", exact: true }).first().click();
 await page.waitForURL(/\/admin\/produto\/qa-shirt-copia-/);
 const duplicate = tables.products.find(row => row.id.startsWith("qa-shirt-copia-"));
 assert.equal(duplicate.is_active, false);
 const copiedArea = tables.product_print_areas.find(row => row.product_id === duplicate.id);
 const copiedTechnique = tables.product_print_area_techniques.find(row => row.print_area_id === copiedArea.id);
 assert.equal(copiedTechnique.base_price, 3);
 assert.equal(tables.product_print_area_technique_materials.find(row => row.area_technique_id === copiedTechnique.id).price_adjustment, 2.5);
 console.log("Admin QA: global size preset editor");
 for (const width of [390, 1440]) {
   await page.setViewportSize({ width, height: 1000 });
   await navigate("/admin?tab=sizes");
   const editor = page.locator("fieldset").first();
   const nameInput = editor.getByLabel("Nome do tamanho", { exact: true }).first();
   await nameInput.fill("");
   await nameInput.pressSequentially("XXL" + width);
   assert.equal(await nameInput.inputValue(), "XXL" + width, "typing must not lose characters");
   assert.equal(await nameInput.evaluate(el => el === document.activeElement), true, "typing must retain focus");
   const priceInput = editor.getByLabel("Acréscimo padrão de XXL" + width, { exact: true });
   const oldPrice = tables.size_presets[0].items[0].defaultPriceAdjustment;
   await priceInput.fill("");
   await editor.getByRole("button", { name: "Guardar", exact: true }).click();
   await page.waitForTimeout(200);
   assert.equal(tables.size_presets[0].items[0].defaultPriceAdjustment, oldPrice, "empty price cannot overwrite saved amount");
   await priceInput.fill(width === 390 ? "1,25" : "2,50");
   await editor.getByRole("button", { name: "Guardar", exact: true }).click();
   await page.waitForTimeout(300);
   assert.equal(tables.size_presets[0].items[0].label, "XXL" + width);
   assert.equal(tables.size_presets[0].items[0].defaultPriceAdjustment, width === 390 ? 1.25 : 2.5);
   assert.equal("draftKey" in tables.size_presets[0].items[0], false, "UI keys never reach storage");
   await editor.getByPlaceholder("Adicionar tamanho", { exact: true }).fill(" xxl" + width + " ");
   await editor.getByPlaceholder("Adicionar tamanho", { exact: true }).press("Enter");
   assert.equal(await editor.getByLabel("Nome do tamanho", { exact: true }).count(), 1, "duplicate label blocked");
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "global size editor overflow");
   await editor.screenshot({ path: ".qa-global-sizes-" + width + ".png" });
 }
 assert.deepEqual(errors, []);
 console.log("Admin browser fixtures: 390/1440px, categories, direct tabs, size/color preset prices, material preset copy and complete product duplication passed.");
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
