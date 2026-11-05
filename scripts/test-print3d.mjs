// Auto-teste de src/lib/print3d.ts. Correr: node --experimental-strip-types scripts/test-print3d.mjs
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import {
  parseStl, parseObj, parse3mf, parseModel, readModel, modelFormat, modelErrorCode, measureStl, estimate, fitsBed, MAX_3MF_MODEL_MB,
} from "../src/lib/print3d.ts";

// Cubo 20 mm em STL binário (12 triângulos).
const tri = (a, b, c) => [...a, ...b, ...c];
const v = (x, y, z) => [x * 20, y * 20, z * 20];
const faces = [
  [v(0,0,0), v(1,0,0), v(1,1,0)], [v(0,0,0), v(1,1,0), v(0,1,0)], [v(0,0,1), v(1,1,1), v(1,0,1)], [v(0,0,1), v(0,1,1), v(1,1,1)],
  [v(0,0,0), v(0,0,1), v(1,0,1)], [v(0,0,0), v(1,0,1), v(1,0,0)], [v(1,0,0), v(1,0,1), v(1,1,1)], [v(1,0,0), v(1,1,1), v(1,1,0)],
  [v(1,1,0), v(1,1,1), v(0,1,1)], [v(1,1,0), v(0,1,1), v(0,1,0)], [v(0,1,0), v(0,1,1), v(0,0,1)], [v(0,1,0), v(0,0,1), v(0,0,0)],
];
const buf = new ArrayBuffer(84 + faces.length * 50); const dv = new DataView(buf); dv.setUint32(80, faces.length, true);
faces.forEach((f, i) => tri(...f).forEach((x, k) => dv.setFloat32(84 + i * 50 + 12 + k * 4, x, true)));

const stats = measureStl(parseStl(buf));
assert.equal(Math.round(stats.volume), 8000);
assert.equal(Math.round(stats.area), 2400);
assert.deepEqual(stats.size.map(Math.round), [20, 20, 20]);

// ASCII com o mesmo cubo
const ascii = "solid c\n" + faces.map((f) => "facet normal 0 0 0\nouter loop\n" + f.map((p) => `vertex ${p.join(" ")}`).join("\n") + "\nendloop\nendfacet").join("\n") + "\nendsolid c";
assert.equal(Math.round(measureStl(parseStl(new TextEncoder().encode(ascii).buffer)).volume), 8000);
assert.throws(() => parseStl(new TextEncoder().encode("isto nao e stl").buffer), { name: "StlParseError", code: "invalid" });
assert.throws(() => parseStl(new TextEncoder().encode("solid vazio\nendsolid vazio").buffer), { code: "empty" });

const base = { material: "pla", scale: 100, infill: 20, layer: 0.2, supports: 0, quantity: 1, filamentPerKg: 20, machinePerHour: 1, finishing: 0, margin: 0, speed: 60, fee: 0 };
const e = estimate(stats, base);
// casca 1,2 mm: 2400*1,2/8000 = 36% + 64% x 20% = 48,8% de 8 cm³ x 1,24 g/cm³
assert.ok(Math.abs(e.grams - 8 * 0.488 * 1.24) < 0.01, `gramas ${e.grams}`);
assert.ok(e.hours > 0.2 && e.hours < 0.6, `horas ${e.hours}`);
assert.ok(Math.abs(e.unit - (e.material + e.machine)) < 1e-9);
{ const g2 = estimate(stats, { ...base, scale: 200 }).grams; assert.ok(g2 > e.grams * 5 && g2 < e.grams * 8, "escala 200%: volume x8, mas as paredes pesam menos"); }
assert.ok(estimate(stats, { ...base, infill: 100 }).grams > e.grams);
assert.equal(estimate(stats, { ...base, quantity: 3, margin: 100 }).total, estimate(stats, { ...base, margin: 100 }).unit * 3);
assert.ok(estimate(stats, { ...base, fee: 10 }).unit > e.unit);
assert.equal(fitsBed([20, 300, 10], [220, 220, 250]), false);
assert.equal(fitsBed([240, 10, 10], [250, 220, 250]), true, "cabe rodando a peça");

// ---------------------------------------------------------------------------------------------
// OBJ: cubo de 20 mm com 6 quads (normais para fora), em vários formatos de índice
const enc = (s) => new TextEncoder().encode(s).buffer;
const cubeV = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(([x, y, z]) => `v ${x * 20} ${y * 20} ${z * 20}`).join("\n");
const quads = [[1,4,3,2],[5,6,7,8],[1,2,6,5],[2,3,7,6],[3,4,8,7],[4,1,5,8]];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
{
  const obj = `# cubo\nmtllib cubo.mtl\no Cubo\n${cubeV}\nvt 0 0\nvn 0 0 1\nusemtl cinza\ns off\n` + quads.map((q) => "f " + q.join(" ")).join("\n");
  const p = parseObj(enc(obj));
  assert.equal(p.length / 9, 12, "6 quads = 12 triângulos");
  const st = measureStl(p);
  assert.equal(Math.round(st.volume), 8000);
  assert.equal(Math.round(st.area), 2400);
  assert.deepEqual(st.size.map(Math.round), [20, 20, 20]);
  // v/vt/vn, v//vn e v/vt com CRLF
  const fmts = [(i) => `${i}/1/1`, (i) => `${i}//1`, (i) => `${i}/1`];
  const obj2 = `${cubeV}\nvt 0 0\nvn 0 0 1\n` + quads.map((q, k) => "f " + q.map(fmts[k % 3]).join(" ")).join("\r\n");
  assert.equal(Math.round(measureStl(parseObj(enc(obj2.replace(/\n/g, "\r\n")))).volume), 8000);
}
{
  // Índices negativos: cada face refere os vértices pela posição relativa ao fim da lista atual.
  const lines = [];
  const pts = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  for (const q of quads) {
    for (const i of q) { const [x, y, z] = pts[i - 1]; lines.push(`v ${x * 20} ${y * 20} ${z * 20}`); }
    lines.push("f -4 -3 -2 -1");
  }
  const st = measureStl(parseObj(enc(lines.join("\n"))));
  assert.equal(Math.round(st.volume), 8000, "índices negativos");
  // Polígono de 5 lados em leque: 3 triângulos.
  assert.equal(parseObj(enc("v 0 0 0\nv 2 0 0\nv 3 1 0\nv 1 2 0\nv -1 1 0\nf 1 2 3 4 5")).length / 9, 3);
}
{
  // Continuação de linha com "\" (também com CRLF): "f 1 4 \" + "3 2" é uma só face.
  const cont = `${cubeV}\n` + quads.map((q, k) => `f ${q[0]} ${q[1]} \\${k % 2 ? "\r\n" : "\n"} ${q[2]} ${q[3]}`).join("\n");
  const st = measureStl(parseObj(enc(cont)));
  assert.equal(st.triangles, 12, "continuação de linha");
  assert.equal(Math.round(st.volume), 8000);
  // Índices positivos para vértices definidos depois: as faces vêm antes das linhas v.
  const later = quads.map((q) => "f " + q.join(" ")).join("\n") + `\n${cubeV}`;
  assert.equal(Math.round(measureStl(parseObj(enc(later))).volume), 8000, "faces antes dos vértices");
}
assert.throws(() => parseObj(enc("# só comentários\nv 1 2 3\nvn 0 0 1")), { name: "StlParseError", code: "empty" });
assert.throws(() => parseObj(enc("isto nao e obj")), { code: "invalid" });
assert.throws(() => parseObj(enc("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9")), { code: "invalid" }, "índice fora da lista");
assert.throws(() => parseObj(buf), { code: "invalid" }, "STL binário com extensão .obj");

// ---------------------------------------------------------------------------------------------
// 3MF: pacote ZIP gerado no teste com o mesmo cubo
const NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const verts3 = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const tris3 = quads.flatMap((q) => [[q[0], q[1], q[2]], [q[0], q[2], q[3]]].map((t) => t.map((i) => i - 1)));
const mesh = (s) => `<mesh><vertices>${verts3.map(([x, y, z]) => `<vertex x="${x * s}" y="${y * s}" z="${z * s}" />`).join("")}</vertices>`
  + `<triangles>${tris3.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("\n")}</triangles></mesh>`;
const model = ({ unit, objects, build }) => `<?xml version="1.0" encoding="UTF-8"?>\n<model ${unit ? `unit="${unit}" ` : ""}xml:lang="en-US" xmlns="${NS}" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">`
  + `<metadata name="Title">Cubo</metadata><resources>${objects}</resources><build>${build}</build></model>`;
const rels = (target = "/3D/3dmodel.model") => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="${target}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" /></Relationships>`;
const pack = (files) => { const z = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))); return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength); };
// Muda um campo de uma entrada no diretório central do ZIP (cabeçalho 0x02014b50 com esse nome).
const patchCentral = (ab, name, field, value, bytes = 4) => {
  const d = new Uint8Array(ab), nm = strToU8(name), dvz = new DataView(ab);
  for (let i = 0; i + 46 <= d.length; i++) {
    if (dvz.getUint32(i, true) !== 0x02014b50 || dvz.getUint16(i + 28, true) !== nm.length) continue;
    if (!nm.every((c, k) => d[i + 46 + k] === c)) continue;
    if (bytes === 2) dvz.setUint16(i + field, value, true); else dvz.setUint32(i + field, value, true);
    return ab;
  }
  throw new Error(`entrada ${name} não encontrada`);
};
// ZIP64 sem compressão, montado à mão: tamanhos e posição a 0xFFFFFFFF no diretório central, valores reais no
// extra 0x0001, e registo e localizador ZIP64 antes do EOCD.
const zip64 = (files) => {
  const le = (n, len) => { const b = new Uint8Array(len); let x = BigInt(n); for (let i = 0; i < len; i++) { b[i] = Number(x & 0xffn); x >>= 8n; } return b; };
  const body = [], central = [];
  let size = 0;
  const add = (list, chunks) => { for (const c of chunks) { list.push(c); if (list === body) size += c.length; } };
  for (const [name, text] of Object.entries(files)) {
    const nm = strToU8(name), data = strToU8(text), offset = size;
    add(body, [le(0x04034b50, 4), le(45, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), le(data.length, 4), le(data.length, 4), le(nm.length, 2), le(0, 2), nm, data]);
    add(central, [le(0x02014b50, 4), le(45, 2), le(45, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), le(0xffffffff, 4), le(0xffffffff, 4),
      le(nm.length, 2), le(28, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(0xffffffff, 4), nm,
      le(1, 2), le(24, 2), le(data.length, 8), le(data.length, 8), le(offset, 8)]);
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0), cdAt = size, z64At = cdAt + cdSize, count = Object.keys(files).length;
  const tail = [
    le(0x06064b50, 4), le(44, 8), le(45, 2), le(45, 2), le(0, 4), le(0, 4), le(count, 8), le(count, 8), le(cdSize, 8), le(cdAt, 8),
    le(0x07064b50, 4), le(0, 4), le(z64At, 8), le(1, 4),
    le(0x06054b50, 4), le(0, 2), le(0, 2), le(0xffff, 2), le(0xffff, 2), le(0xffffffff, 4), le(0xffffffff, 4), le(0, 2),
  ];
  const all = [...body, ...central, ...tail];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const c of all) { out.set(c, at); at += c.length; }
  return out.buffer;
};
const cube3mf = (opts = {}) => pack({
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
  "_rels/.rels": rels(),
  "3D/3dmodel.model": model({ unit: opts.unit, objects: `<object id="1" type="model">${mesh(opts.s ?? 20)}</object>`, build: `<item objectid="1"${opts.transform ? ` transform="${opts.transform}"` : ""}/>` }),
});
{
  const st = measureStl(parse3mf(cube3mf()));
  assert.equal(Math.round(st.volume), 8000, "3MF em mm (sem unit)");
  assert.deepEqual(st.size.map(Math.round), [20, 20, 20]);
  // unit="inch": cubo de 1 polegada = 25,4 mm
  const inch = measureStl(parse3mf(cube3mf({ unit: "inch", s: 1 })));
  assert.ok(near(inch.size[0], 25.4, 1e-4) && near(inch.volume, 25.4 ** 3, 0.01), `inch ${inch.size}`);
  assert.ok(near(measureStl(parse3mf(cube3mf({ unit: "centimeter", s: 2 }))).size[2], 20, 1e-4), "centimeter");
  assert.ok(near(measureStl(parse3mf(cube3mf({ unit: "micron", s: 20000 }))).size[1], 20, 1e-3), "micron");
  // transform: escala 2 x 1 x 0,5 e translação (100, 50, 10)
  const p = parse3mf(cube3mf({ transform: "2 0 0 0 1 0 0 0 0.5 100 50 10" }));
  const t = measureStl(p);
  assert.deepEqual(t.size.map((x) => Math.round(x * 1000) / 1000), [40, 20, 10]);
  assert.equal(Math.round(t.volume), 8000);
  const xs = [], zs = [];
  for (let i = 0; i < p.length; i += 3) { xs.push(p[i]); zs.push(p[i + 2]); }
  assert.ok(near(Math.min(...xs), 100) && near(Math.max(...xs), 140) && near(Math.min(...zs), 10), "translação");
  // em polegadas, a translação também passa para mm
  const pin = parse3mf(cube3mf({ unit: "inch", s: 1, transform: "1 0 0 0 1 0 0 0 1 1 0 0" }));
  let minX = Infinity; for (let i = 0; i < pin.length; i += 3) minX = Math.min(minX, pin[i]);
  assert.ok(near(minX, 25.4, 1e-4), `translação em inch ${minX}`);
}
{
  // Componentes: objeto 2 junta duas cópias do cubo (uma deslocada 30 mm) e o item roda 90° em Z; modelo noutro caminho via _rels.
  const objects = `<object id="1" type="model">${mesh(20)}</object>`
    + `<object id="2" type="model"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 30 0 0"/></components></object>`
    + `<object id="3" type="support">${mesh(5)}</object>`;
  const files = { "_rels/.rels": rels("/3D/peca.model"), "3D/peca.model": model({ objects, build: `<item objectid="2" transform="0 1 0 -1 0 0 0 0 1 0 0 0"/><item objectid="3"/>` }) };
  const st = measureStl(parse3mf(pack(files)));
  assert.equal(Math.round(st.volume), 16000, "duas cópias, suporte ignorado");
  assert.deepEqual(st.size.map(Math.round), [20, 50, 20], "rodado 90° em Z");
  // Extensão Production (Bambu Studio, Orca): a malha está em 3D/Objects/*.model e o principal usa p:path.
  const bambu = {
    "_rels/.rels": rels(),
    "3D/3dmodel.model": model({ objects: `<object id="5" p:UUID="x" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object>`, build: `<item objectid="5" transform="1 0 0 0 1 0 0 0 1 128 128 10" printable="1"/>` }),
    "3D/Objects/object_1.model": model({ objects: `<object id="1" type="model">${mesh(20)}</object>`, build: "" }),
    "Metadata/thumbnail.png": "PNG",
  };
  const pb = parse3mf(pack(bambu));
  assert.equal(Math.round(measureStl(pb).volume), 8000, "p:path noutro ficheiro");
  let mnX = Infinity, mnZ = Infinity; for (let i = 0; i < pb.length; i += 3) { mnX = Math.min(mnX, pb[i]); mnZ = Math.min(mnZ, pb[i + 2]); }
  assert.ok(near(mnX, 128) && near(mnZ, 10), "translação do item aplicada à malha do outro ficheiro");
  // Uma cópia normal e outra espelhada no mesmo modelo: sem corrigir a ordem, os volumes anulavam-se.
  // O comentário XML com um item falso tem de ser ignorado.
  const mirror = { "3D/3dmodel.model": model({ objects: `<object id="1" type="model">${mesh(20)}</object>`, build: `<!-- <item objectid="9"/> --><item objectid="1"/><item objectid="1" transform="-1 0 0 0 1 0 0 0 1 -5 0 0"/>` }) };
  assert.equal(Math.round(measureStl(parse3mf(pack(mirror))).volume), 16000, "espelhado soma volume");
}
{
  // Sem <build> (ou com <build/>): entram os objetos que não são componentes de outros (só o 2, que junta duas cópias do 1).
  const objects = `<object id="1" type="model">${mesh(20)}</object>`
    + `<object id="2" type="model"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 30 0 0"/></components></object>`;
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xmlns="${NS}"><resources>${objects}</resources>`;
  for (const tail of ["</model>", "<build/></model>", "<build></build></model>"]) {
    assert.equal(Math.round(measureStl(parse3mf(pack({ "3D/3dmodel.model": head + tail }))).volume), 16000, `sem build: ${tail}`);
  }
  // Componentes em ciclo (A usa B e B usa A): não pode ficar em recursão infinita.
  const cyc = `<object id="1" type="model"><components><component objectid="2"/></components></object><object id="2" type="model"><components><component objectid="1"/></components></object>`;
  assert.throws(() => parse3mf(pack({ "3D/3dmodel.model": model({ objects: cyc, build: `<item objectid="1"/>` }) })), { code: "invalid" }, "ciclo");
}
{
  // printable="0" fica de fora; cada item é uma peça (placas de um projeto ficam deslocadas no mesmo build).
  const cube = `<object id="1" type="model">${mesh(20)}</object>`;
  const off = (dx, extra = "") => `<item objectid="1" transform="1 0 0 0 1 0 0 0 1 ${dx} 0 0"${extra}/>`;
  const hidden = pack({ "3D/3dmodel.model": model({ objects: cube, build: `<item objectid="1"/>${off(400, ' printable="0"')}${off(800, " printable='false'")}` }) });
  const h = measureStl(parse3mf(hidden));
  assert.deepEqual(h.size.map(Math.round), [20, 20, 20], "printable=0 ignorado");
  assert.equal(Math.round(h.volume), 8000);
  assert.throws(() => parse3mf(pack({ "3D/3dmodel.model": model({ objects: cube, build: off(0, ' printable="0"') }) })), { code: "empty" });
  const plates = readModel("placas.3mf", pack({ "3D/3dmodel.model": model({ objects: cube, build: `<item objectid="1"/>${off(400)}` }) }));
  assert.deepEqual(plates.stats.size.map(Math.round), [420, 20, 20], "conjunto");
  assert.deepEqual(plates.pieces.map((p) => p.map(Math.round)), [[20, 20, 20], [20, 20, 20]], "uma medida por item");
  assert.equal(Math.round(plates.stats.volume), 16000);
  assert.ok(!fitsBed(plates.stats.size, [256, 256, 256]) && plates.pieces.every((p) => fitsBed(p, [256, 256, 256])), "cada peça cabe");
  const one = readModel("cubo.stl", buf);
  assert.equal(one.positions.length, 12 * 9);
  assert.deepEqual(one.pieces, [one.stats.size]);
}
{
  // Só os .model e .rels são descompactados: uma miniatura com método de compressão desconhecido não estraga a leitura.
  const files = { "_rels/.rels": rels(), "3D/3dmodel.model": model({ objects: `<object id="1" type="model">${mesh(20)}</object>`, build: `<item objectid="1"/>` }), "Metadata/plate_1.png": "PNG" };
  assert.equal(Math.round(measureStl(parse3mf(patchCentral(pack(files), "Metadata/plate_1.png", 10, 99, 2))).volume), 8000, "entrada ignorada");
  // O tamanho descompactado vem do diretório central e é conferido antes de descompactar.
  const big = patchCentral(pack(files), "3D/3dmodel.model", 24, (MAX_3MF_MODEL_MB + 1) * 1024 * 1024);
  assert.throws(() => parse3mf(big), { name: "StlParseError", code: "tooLarge" }, "XML descompactado acima do teto");
  assert.throws(() => readModel("grande.3mf", big), { code: "tooLarge" });
  // ZIP64 (tamanhos e posição no campo extra).
  assert.equal(Math.round(measureStl(parse3mf(zip64(files))).volume), 8000, "ZIP64");
  assert.throws(() => parse3mf(pack(files).slice(0, 200)), { code: "invalid" }, "ZIP cortado");
}
assert.equal(modelErrorCode(new RangeError("Invalid string length")), "tooLarge");
assert.equal(modelErrorCode(new Error("x")), "invalid");
assert.throws(() => parse3mf(pack({ "3D/3dmodel.model": model({ objects: `<object id="1" type="model"><mesh><vertices/><triangles/></mesh></object>`, build: `<item objectid="1"/>` }) })), { code: "empty" });
assert.throws(() => parse3mf(enc("não é zip")), { code: "invalid" });
assert.throws(() => parse3mf(pack({ "leia-me.txt": "nada" })), { code: "invalid" }, "ZIP sem modelo");
assert.throws(() => parse3mf(pack({ "3D/3dmodel.model": model({ objects: `<object id="1">${mesh(1).replace('v3="2"', 'v3="99"')}</object>`, build: `<item objectid="1"/>` }) })), { code: "invalid" }, "triângulo fora da lista");

// parseModel escolhe pela extensão
assert.equal(parseModel("peca.STL", buf).length, 12 * 9);
assert.equal(parseModel("cubo.obj", enc(`${cubeV}\n` + quads.map((q) => "f " + q.join(" ")).join("\n"))).length, 12 * 9);
assert.equal(parseModel("Cubo Final.3MF", cube3mf()).length, 12 * 9);
assert.throws(() => parseModel("peca.step", buf), { name: "StlParseError", code: "unsupported" });
assert.throws(() => parseModel("sem-extensao", buf), { code: "unsupported" });
assert.equal(modelFormat("a.b.Obj"), "obj");
assert.equal(modelFormat("x.stl.zip"), null);
console.log("print3d: todos os testes passaram");
