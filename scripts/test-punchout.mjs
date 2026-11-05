// Teste do PunchOut (supabase/functions/_shared/punchout.ts, src/lib/punchout.ts, migration, telas e textos).
// Uso: node --experimental-strip-types scripts/test-punchout.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auxId, buyerLogin, cxmlResponse, lineDescription, ociFields, ociLogin, orderMessage, parseAuxId, parseXml, pathOf, readEnvelope,
  readOrderRequest, readSetupRequest, returnUrlAllowed, textOf, totalsDiffer,
} from '../supabase/functions/_shared/punchout.ts';
import {
  buyerErrorOf, buyerErrors, buyerPayload, draftOf, EMPTY_BUYER, endpointUrl, generateSecret, normalizeSession, ociStartUrl, parseHosts,
  punchoutErrorOf, sampleSetupRequest, sessionStatus,
} from '../src/lib/punchout.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const read = (p) => readFileSync(p, 'utf8');
const keys = (s) => new Set([...s.matchAll(/^\s+([a-z0-9_]+): '/gm)].map((m) => m[1]));
const sameKeys = (file) => {
  const src = read(file);
  const block = (start, end) => src.slice(src.indexOf(start), end ? src.indexOf(end) : undefined);
  const br = keys(block('const ptBR', 'export type'));
  for (const [name, s] of [['en', block('  en: {', '  es: {')], ['es', block('  es: {')]]) {
    const k = keys(s);
    assert.deepEqual([...br].filter((x) => !k.has(x)), [], `${file} ${name} sem chaves em falta`);
  }
  assert.match(block("  'pt-PT': {", '  en: {'), /\.\.\.ptBR/);
  assert.doesNotMatch(src, /—/, 'sem travessão');
  return br;
};

const SETUP = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cxml.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="1@ariba" timestamp="2026-10-07T10:00:00+00:00">
  <Header>
    <From><Credential domain="NetworkID"><Identity>AN01000000123</Identity></Credential></From>
    <To><Credential domain="DUNS"><Identity>loja</Identity></Credential></To>
    <Sender><Credential domain="NetworkID"><Identity>AN1</Identity><SharedSecret>s3gr&amp;do</SharedSecret></Credential></Sender>
  </Header>
  <Request deploymentMode="test">
    <PunchOutSetupRequest operation="edit">
      <BuyerCookie><![CDATA[c<1>]]></BuyerCookie>
      <Extrinsic name="UserEmail">ana@empresa.com</Extrinsic>
      <BrowserFormPost><URL>https://s1.ariba.com/retorno?x=1&amp;y=2</URL></BrowserFormPost>
      <!-- comentário -->
      <ItemOut quantity="2"><ItemID><SupplierPartID>VASO</SupplierPartID><SupplierPartAuxiliaryID>b794f07c-8824-4ab0-a1a3-bc107bed989c:1</SupplierPartAuxiliaryID></ItemID></ItemOut>
      <ItemOut quantity="0"><ItemID><SupplierPartID>ZERO</SupplierPartID></ItemID></ItemOut>
    </PunchOutSetupRequest>
  </Request>
</cXML>`;

test('lê XML com entidades, CDATA, comentários e DOCTYPE externo', () => {
  const root = parseXml(SETUP);
  assert.equal(root.name, 'cXML');
  assert.equal(textOf(pathOf(root, 'Header/Sender/Credential/SharedSecret')), 's3gr&do');
  assert.equal(parseXml('<a x="1&lt;2" y=\'3\'><b/>t&#233;&#x41;</a>').attrs.x, '1<2');
  assert.equal(textOf(parseXml('<a>t&#233;&#x41;</a>')), 'téA');
  assert.equal(parseXml('<ns:a xmlns:ns="u"><ns:b>1</ns:b></ns:a>').children[0].name, 'b');
});

test('recusa XML malformado, DTD interna (XXE) e documentos grandes', () => {
  for (const bad of [
    '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>',
    '<a><b></a>', '<a>', '', 'texto', '<a></a><b></b>', '<a><![CDATA[x</a>', '<a x=1></a>',
    `<a>${'<b>'.repeat(70)}${'</b>'.repeat(70)}</a>`,
    `<a>${'x'.repeat(1_000_001)}</a>`,
  ]) assert.throws(() => parseXml(bad), /xml/, bad.slice(0, 40));
  // entidade desconhecida fica como texto (nunca é expandida)
  assert.equal(textOf(parseXml('<a>&xxe;</a>')), '&xxe;');
});

test('envelope cXML e login da empresa', () => {
  const env = readEnvelope(parseXml(SETUP));
  assert.equal(env.requestType, 'PunchOutSetupRequest');
  assert.equal(env.deploymentMode, 'test');
  assert.deepEqual(buyerLogin(env), { domain: 'NetworkID', identity: 'AN01000000123', secret: 's3gr&do' });
  assert.equal(buyerLogin(readEnvelope(parseXml('<cXML><Header><From><Credential domain="D"><Identity>X</Identity></Credential></From></Header><Request/></cXML>'))), null);
  assert.throws(() => readEnvelope(parseXml('<Outro/>')), /xml/);
});

test('PunchOutSetupRequest: operação, cookie, retorno, contato e itens', () => {
  const s = readSetupRequest(readEnvelope(parseXml(SETUP)).request);
  assert.equal(s.operation, 'edit');
  assert.equal(s.buyerCookie, 'c<1>');
  assert.equal(s.browserFormPost, 'https://s1.ariba.com/retorno?x=1&y=2');
  assert.equal(s.contactEmail, 'ana@empresa.com');
  assert.deepEqual(s.items, [{ supplierPartId: 'VASO', auxId: 'b794f07c-8824-4ab0-a1a3-bc107bed989c:1', quantity: 2 }]);
  const x = readSetupRequest(parseXml('<PunchOutSetupRequest operation="hack"/>'));
  assert.equal(x.operation, 'create');
  assert.equal(x.browserFormPost, null);
});

test('OrderRequest: número, total, entrega e linhas', () => {
  const po = readOrderRequest(parseXml(`<OrderRequest><OrderRequestHeader orderID="PO-1" type="new"><Total><Money currency="brl">10.50</Money></Total>
    <ShipTo><Address><Name>Obra</Name><PostalAddress><DeliverTo>Ana</DeliverTo><Street>Rua 1</Street><Street>Sala 2</Street><City>SP</City><State>SP</State>
    <PostalCode>01000-000</PostalCode><Country isoCountryCode="br">Brasil</Country></PostalAddress><Email>a@b.c</Email>
    <Phone><TelephoneNumber><CountryCode isoCountryCode="BR">55</CountryCode><AreaOrCityCode>11</AreaOrCityCode><Number>99999</Number></TelephoneNumber></Phone></Address></ShipTo>
    <Comments>Portão 2</Comments></OrderRequestHeader>
    <ItemOut quantity="3" lineNumber="7"><ItemID><SupplierPartID>SKU</SupplierPartID><SupplierPartAuxiliaryID>aux</SupplierPartAuxiliaryID></ItemID>
    <ItemDetail><UnitPrice><Money currency="BRL">3.50</Money></UnitPrice><Description>Vaso</Description></ItemDetail></ItemOut></OrderRequest>`));
  assert.equal(po.orderId, 'PO-1');
  assert.equal(po.type, 'new');
  assert.equal(po.total, 10.5);
  assert.equal(po.currency, 'BRL');
  assert.deepEqual(po.shipTo, { name: 'Obra', deliverTo: 'Ana', street: 'Rua 1, Sala 2', city: 'SP', state: 'SP', postalCode: '01000-000', country: 'BR', email: 'a@b.c', phone: '+55 11 99999' });
  assert.deepEqual(po.lines[0], { supplierPartId: 'SKU', auxId: 'aux', quantity: 3, lineNumber: 7, unitPrice: 3.5, currency: 'BRL', description: 'Vaso' });
  assert.equal(po.comments, 'Portão 2');
});

const LINES = [
  { quantity: 2, supplierPartId: 'VASO-1', auxId: 's:0', unitPrice: 89.9, description: 'Vaso <Facetado> & cia', unit: 'EA', unspsc: '56101700', brand: 'Marca', leadTimeDays: 5, productId: 'p1' },
  { quantity: 1, supplierPartId: 'p2', auxId: 's:1', unitPrice: 10, description: 'Um nome bem comprido que passa dos quarenta caracteres do OCI', unit: 'EA', unspsc: null, brand: null, leadTimeDays: null, productId: 'p2' },
];

test('PunchOutOrderMessage válido e escapado, lido de volta', () => {
  const xml = orderMessage({
    payloadId: 'p@x', timestamp: '2026-10-07T10:00:00+00:00', buyerCookie: 'c<1>', locale: 'pt-BR', currency: 'BRL',
    buyer: { domain: 'NetworkID', identity: 'AN1' }, store: { identity: 'loja.example', name: 'Loja & Cia' },
    lines: LINES, total: 189.8, tax: 0, taxLabel: '', operationAllowed: 'edit',
  });
  const root = parseXml(xml);
  const msg = pathOf(root, 'Message/PunchOutOrderMessage');
  assert.equal(textOf(pathOf(msg, 'BuyerCookie')), 'c<1>');
  assert.equal(textOf(pathOf(msg, 'PunchOutOrderMessageHeader/Total/Money')), '189.80');
  const items = msg.children.filter((c) => c.name === 'ItemIn');
  assert.equal(items.length, 2);
  assert.equal(items[0].attrs.quantity, '2');
  assert.equal(textOf(pathOf(items[0], 'ItemDetail/Description')), 'Vaso <Facetado> & cia');
  assert.equal(textOf(pathOf(items[0], 'ItemDetail/Classification')), '56101700');
  assert.equal(textOf(pathOf(items[0], 'ItemDetail/LeadTime')), '5');
  assert.equal(pathOf(items[1], 'ItemDetail/Classification'), null);
  assert.equal(textOf(pathOf(root, 'Header/To/Credential/Identity')), 'AN1');
  assert.doesNotMatch(xml, /<Tax>/);
  const withTax = orderMessage({ payloadId: 'p', timestamp: 't', buyerCookie: '', locale: 'pt-PT', currency: 'EUR', buyer: { domain: 'D', identity: 'I' },
    store: { identity: 's', name: 'n' }, lines: LINES, total: 100, tax: 23, taxLabel: 'IVA 23%', operationAllowed: 'edit' });
  assert.equal(textOf(pathOf(parseXml(withTax), 'Message/PunchOutOrderMessage/PunchOutOrderMessageHeader/Tax/Money')), '23.00');
});

test('respostas cXML', () => {
  const ok = parseXml(cxmlResponse({ payloadId: 'a', timestamp: 't', code: 200, text: 'success', startPageUrl: 'https://loja/punchout/entrar?s=1&b=2' }));
  assert.equal(pathOf(ok, 'Response/Status').attrs.code, '200');
  assert.equal(textOf(pathOf(ok, 'Response/PunchOutSetupResponse/StartPage/URL')), 'https://loja/punchout/entrar?s=1&b=2');
  const bad = parseXml(cxmlResponse({ payloadId: 'a', timestamp: 't', code: 401, text: 'Unauthorized', message: 'Credencial <inválida>' }));
  assert.equal(textOf(pathOf(bad, 'Response/Status')), 'Credencial <inválida>');
});

test('OCI: login e campos do carrinho', () => {
  assert.equal(ociLogin({ USERNAME: 'a', PASSWORD: '' , HOOK_URL: 'https://x' }), null);
  const l = ociLogin({ username: 'metal', password: 'p', hook_url: ' https://sap/hook ', '~OkCode': 'ADDI', '~TARGET': '_top', OUTRO: 'x' });
  assert.deepEqual(l, { username: 'metal', password: 'p', hookUrl: 'https://sap/hook', extra: { '~OkCode': 'ADDI', '~TARGET': '_top' } });
  const f = ociFields(LINES, 'BRL', l.extra);
  assert.equal(f['~OkCode'], 'ADDI');
  assert.equal(f['NEW_ITEM-DESCRIPTION[1]'], 'Vaso <Facetado> & cia');
  assert.equal(f['NEW_ITEM-PRICE[1]'], '89.90');
  assert.equal(f['NEW_ITEM-QUANTITY[1]'], '2');
  assert.equal(f['NEW_ITEM-MATGROUP[1]'], '56101700');
  assert.equal(f['NEW_ITEM-LEADTIME[1]'], '5');
  assert.equal(f['NEW_ITEM-DESCRIPTION[2]'].length, 40);
  assert.equal(f['NEW_ITEM-LONGTEXT_2:132[]'], LINES[1].description);
  assert.equal(f['NEW_ITEM-MATGROUP[2]'], undefined);
});

test('endereço de retorno: https e lista da empresa', () => {
  assert.equal(returnUrlAllowed('https://s1.ariba.com/x', []), true);
  assert.equal(returnUrlAllowed('http://s1.ariba.com/x', []), false);
  assert.equal(returnUrlAllowed('http://localhost:9000/x', []), true);
  assert.equal(returnUrlAllowed('javascript:alert(1)', []), false);
  assert.equal(returnUrlAllowed('https://user:pw@s1.ariba.com/', []), false);
  assert.equal(returnUrlAllowed('nada', []), false);
  assert.equal(returnUrlAllowed('https://s1.ariba.com/x', ['s1.ariba.com']), true);
  assert.equal(returnUrlAllowed('https://evil.com/x', ['s1.ariba.com']), false);
  assert.equal(returnUrlAllowed('https://a.coupahost.com/x', ['*.coupahost.com']), true);
  assert.equal(returnUrlAllowed('https://coupahost.com/x', ['*.coupahost.com']), false);
  assert.equal(returnUrlAllowed('https://evilcoupahost.com/x', ['*.coupahost.com']), false);
  assert.equal(returnUrlAllowed('https://sap.empresa.com:8443/h', ['sap.empresa.com:8443']), true);
  assert.equal(returnUrlAllowed('https://sap.empresa.com/h', ['sap.empresa.com:8443']), false);
});

test('referência da linha, descrição e totais', () => {
  const id = 'b794f07c-8824-4ab0-a1a3-bc107bed989c';
  assert.deepEqual(parseAuxId(auxId(id, 3)), { sessionId: id, idx: 3 });
  assert.equal(parseAuxId('qualquer'), null);
  assert.equal(parseAuxId(`${id}:1234`), null);
  assert.equal(lineDescription('Vaso', { variation: 'Laranja', size: 'M' }), 'Vaso (Laranja, M)');
  assert.equal(lineDescription('Vaso', {}), 'Vaso');
  assert.equal(totalsDiffer(null, 10), false);
  assert.equal(totalsDiffer(10.005, 10), false);
  assert.equal(totalsDiffer(10.5, 10), true);
});

test('navegador: sessão, erros e situação dos acessos', () => {
  const tok = 'a'.repeat(48);
  assert.equal(normalizeSession({ token: 'x' }), null);
  assert.equal(normalizeSession({ token: tok, expiresAt: 'nunca' }), null);
  const s = normalizeSession({ token: tok, buyer: 'ACME', protocol: 'oci', operation: 'hack', test: 'sim', expiresAt: '2026-10-07T10:00:00Z' });
  assert.deepEqual(s, { token: tok, buyer: 'ACME', protocol: 'oci', operation: 'create', test: false, expiresAt: '2026-10-07T10:00:00Z', contact: null });
  assert.equal(punchoutErrorOf('expired'), 'expired');
  assert.equal(punchoutErrorOf('outra coisa'), 'server');
  const now = Date.parse('2026-10-07T10:00:00Z');
  assert.equal(sessionStatus({ status: 'open', expires_at: '2026-10-07T09:00:00Z' }, now), 'expired');
  assert.equal(sessionStatus({ status: 'open', expires_at: '2026-10-07T11:00:00Z' }, now), 'open');
  assert.equal(sessionStatus({ status: 'returned', expires_at: '2026-10-07T09:00:00Z' }, now), 'returned');
});

test('Admin: validação da empresa igual à do banco', () => {
  const ok = { ...EMPTY_BUYER, name: 'Construtora', cxml_identity: 'AN01' };
  assert.deepEqual(buyerErrors(ok, true, 'x'.repeat(12)), []);
  assert.deepEqual(buyerErrors(ok, true, ''), ['secret']);
  assert.deepEqual(buyerErrors(ok, false, ''), []);
  assert.deepEqual(buyerErrors(ok, false, 'curta'), ['secret']);
  assert.deepEqual(buyerErrors({ ...ok, protocol: 'oci', oci_username: 'a b' }, false, ''), ['login']);
  assert.deepEqual(buyerErrors({ ...ok, name: 'A', hosts: 'https://s1.ariba.com/x\n*.coupahost.com', unspsc: '1', shipping_fee: '-1', session_minutes: 5 }, false, ''),
    ['name', 'unspsc', 'fee', 'minutes']);
  assert.deepEqual(buyerErrors({ ...ok, hosts: 'não é host' }, false, ''), ['hosts']);
  assert.deepEqual(parseHosts('https://S1.Ariba.com/retorno, *.coupahost.com\nsap.x.com:8443/abc'), ['s1.ariba.com', '*.coupahost.com', 'sap.x.com:8443']);
  const p = buyerPayload({ ...ok, shipping_fee: '25,5', hosts: 'a.com', unspsc: '' });
  assert.equal(p.shipping_fee, 25.5);
  assert.deepEqual(p.return_hosts, ['a.com']);
  assert.equal(p.unspsc, null);
  assert.equal(p.user_id, null);
  assert.equal(buyerErrorOf('login_taken'), 'login_taken');
  assert.equal(buyerErrorOf('boom'), 'server');
  const d = draftOf({ ...p, id: '1', has_secret: true, last_used_at: null, created_at: '', return_hosts: ['a.com', 'b.com'], user_id: null, notes: null, unspsc: null, cxml_identity: 'AN01', oci_username: null });
  assert.equal(d.hosts, 'a.com\nb.com');
  assert.equal(d.shipping_fee, '25.5');
});

test('Admin: senha, endereço e exemplos', () => {
  const a = generateSecret();
  assert.equal(a.length, 24);
  assert.notEqual(a, generateSecret());
  assert.match(a, /^[A-HJ-NP-Za-km-z2-9]+$/);
  assert.equal(endpointUrl('https://loja.com/'), 'https://loja.com/functions/v1/punchout');
  assert.match(ociStartUrl('https://loja.com', 'metal'), /USERNAME=metal&PASSWORD=<senha>&HOOK_URL=/);
  // o exemplo cXML é lido pelo mesmo leitor do servidor
  const env = readEnvelope(parseXml(sampleSetupRequest({ cxml_domain: 'NetworkID', cxml_identity: 'AN<1>' })));
  assert.equal(env.requestType, 'PunchOutSetupRequest');
  assert.equal(buyerLogin(env).identity, 'AN<1>');
});

test('migration: senha só como hash, leitura só do Admin, funções do servidor fechadas', () => {
  const sql = read('supabase/migrations/20261007200000_punchout.sql');
  assert.doesNotMatch(sql, /\bBEGIN;|\bCOMMIT;|CONCURRENTLY/);
  assert.match(sql, /extensions\.crypt\(v_secret, extensions\.gen_salt\('bf'/);
  assert.match(sql, /REVOKE ALL ON public\.punchout_buyers, public\.punchout_sessions, public\.punchout_orders FROM anon, authenticated;/);
  const grant = /GRANT SELECT \(([^)]+)\) ON public\.punchout_buyers TO authenticated/.exec(sql)[1];
  assert.doesNotMatch(grant, /secret_hash/);
  assert.doesNotMatch(/GRANT SELECT \(([^)]+)\) ON public\.punchout_sessions TO authenticated/.exec(sql)[1], /token_hash/);
  for (const fn of ['punchout_authenticate(text, text, text, text)', 'punchout_item_skus(jsonb)', 'punchout_product_by_sku(text)']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn.replace(/[()]/g, '\\$&')} FROM PUBLIC, anon, authenticated;`), fn);
  }
  assert.match(sql, /feature_enabled\('punchout', false\)/);
  assert.match(sql, /to_jsonb\(b\) - 'secret_hash'/);
});

test('função, rotas, recurso, menu e privacidade ligados', () => {
  const fn = read('supabase/functions/punchout/index.ts');
  assert.match(fn, /feature_enabled", \{ _key: "punchout", _default: false \}/);
  assert.match(fn, /priceItems\(sb, items, \{ strict: false, userId: buyer\.user_id/);
  assert.match(read('supabase/config.toml'), /\[functions\.punchout\]\nverify_jwt = false/);
  assert.match(read('src/lib/features.ts'), /id: 'punchout', category: 'sales', defaultOn: false/);
  assert.match(read('src/App.tsx'), /path="\/punchout\/entrar"/);
  assert.match(read('src/App.tsx'), /<PunchoutCheckoutGuard><Checkout \/><\/PunchoutCheckoutGuard>/);
  assert.match(read('src/components/admin/shell/adminSections.ts'), /value: "punchout"/);
  assert.match(read('src/lib/privacy.ts'), /'loja3d-punchout'.*feature: 'punchout'/);
  assert.match(read('src/lib/activityLog.ts'), /'punchout_buyers'/);
});

test('textos em 4 idiomas, sem travessões', () => {
  const store = sameKeys('src/i18n/punchout.ts');
  const admin = sameKeys('src/i18n/adminPunchout.ts');
  assert.ok(store.has('cart_send') && admin.has('side_test'));
  for (const f of ['src/components/admin/AdminPunchout.tsx', 'src/pages/PunchoutStart.tsx', 'src/pages/PunchoutTest.tsx', 'src/components/punchout/PunchoutBar.tsx']) {
    const src = read(f);
    assert.doesNotMatch(src, /—/, f);
    assert.doesNotMatch(src, /\b(Dialog|AlertDialog)\b|window\.confirm|\bconfirm\(/, `${f} sem janelas`);
  }
  for (const [file, k] of [['src/i18n/admin.ts', 's_punchout'], ['src/i18n/adminFeatures.ts', 'f_punchout_d'], ['src/i18n/orders.ts', 'pay_purchase_order'], ['src/i18n/legal.ts', 'p_punchout']]) {
    assert.ok((read(file).match(new RegExp(`\\b${k}: '`, 'g')) ?? []).length >= 3, `${file} ${k}`);
  }
});

console.log(`\n${n} testes ok`);
