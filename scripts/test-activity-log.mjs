// Teste do registo de atividade do Admin (src/lib/activityLog.ts + migration). Uso: node --experimental-strip-types scripts/test-activity-log.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  ENTITY_GROUPS, activityHref, activitySince, activityTotals, changedFields, entitiesOf, formatChangeValue, groupOf, humanField,
  normalizeRetention, shortAgent,
} from '../src/lib/activityLog.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };
const sql = readFileSync('supabase/migrations/20261007040000_admin_activity_log.sql', 'utf8');

test('cada tabela do trigger está num grupo de filtro e tem nome nos 4 idiomas', () => {
  const list = /tables text\[\] := ARRAY\[([\s\S]*?)\];/.exec(sql)[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
  // Tabelas novas entram no registo nas suas próprias migrations (CREATE TRIGGER zz_admin_activity ... ON public.<tabela>).
  for (const f of readdirSync('supabase/migrations')) {
    for (const m of readFileSync(`supabase/migrations/${f}`, 'utf8').matchAll(/CREATE TRIGGER zz_admin_activity AFTER [^;(%]*?ON public\.([a-z_]+)/g)) list.push(m[1]);
  }
  const grouped = Object.values(ENTITY_GROUPS).flat();
  assert.deepEqual([...new Set([...list, 'auth_users'])].sort(), [...grouped].sort());
  const texts = readFileSync('src/i18n/adminActivity.ts', 'utf8');
  for (const e of grouped) assert.ok(texts.split(`e_${e}:`).length - 1 >= 3, `e_${e} em pt-BR, en e es (pt-PT herda)`);
  assert.ok(!/—/.test(texts), 'sem travessões');
});

test('links para as páginas do Admin', () => {
  assert.equal(activityHref({ entity: 'products', entity_id: 'vaso', parent_id: null, action: 'update' }), '/admin/produto/vaso');
  assert.equal(activityHref({ entity: 'products', entity_id: 'vaso', parent_id: null, action: 'delete' }), null);
  assert.equal(activityHref({ entity: 'product_variations', entity_id: 'x', parent_id: 'vaso', action: 'delete' }), '/admin/produto/vaso');
  assert.equal(activityHref({ entity: 'order_notes', entity_id: 'n1', parent_id: 'o1', action: 'create' }), '/admin/pedidos/o1');
  assert.equal(activityHref({ entity: 'auth_users', entity_id: 'u1', parent_id: 'u1', action: 'update' }), '/admin/clientes/u1');
  assert.equal(activityHref({ entity: 'user_addresses', entity_id: 'a1', parent_id: 'u1', action: 'update' }), '/admin/clientes/u1');
  assert.equal(activityHref({ entity: 'coupons', entity_id: 'c1', parent_id: null, action: 'create' }), '/admin/cupons/c1');
  assert.equal(activityHref({ entity: 'store_settings', entity_id: 'features', parent_id: null, action: 'update' }), null);
});

test('filtros, período e totais', () => {
  assert.equal(entitiesOf('all'), null);
  assert.deepEqual(entitiesOf('sales'), ['coupons', 'gift_cards', 'checkout_fields', 'subscriptions', 'rental_bookings', 'vendors', 'vendor_payouts', 'affiliates', 'affiliate_payouts', 'quote_requests', 'quote_items', 'punchout_buyers', 'finance_entries', 'finance_categories']);
  assert.equal(groupOf('order_items'), 'orders');
  assert.equal(groupOf('xyz'), null);
  assert.equal(activitySince('1d', new Date('2026-10-07T12:00:00Z')), '2026-10-06T12:00:00.000Z');
  assert.deepEqual(activityTotals([{ action: 'create', entity: 'a', changes: 2 }, { action: 'update', entity: 'a', changes: 5 }, { action: 'update', entity: 'b', changes: 1 }]),
    { total: 8, created: 2, updated: 6, deleted: 0 });
});

test('valores e campos legíveis', () => {
  const yn = { yes: 'Sim', no: 'Não', empty: '(vazio)' };
  assert.equal(formatChangeValue(null, yn), '(vazio)');
  assert.equal(formatChangeValue(true, yn), 'Sim');
  assert.equal(formatChangeValue(12.5, yn), '12.5');
  assert.equal(formatChangeValue({ a: 1 }, yn), '{"a":1}');
  assert.equal(humanField('value.free_shipping_from'), 'Value: free shipping from');
  assert.deepEqual(changedFields({ description: {}, price: {}, name: {} }), ['name', 'price', 'description']);
  assert.equal(shortAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'), 'Chrome · Windows');
  assert.equal(shortAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'Safari · iOS');
  assert.equal(shortAgent(null), null);
});

test('prazo de guarda', () => {
  assert.equal(normalizeRetention({}), 365);
  assert.equal(normalizeRetention({ retention_days: 0 }), 0);
  assert.equal(normalizeRetention({ retention_days: 7 }), 30);
  assert.equal(normalizeRetention({ retention_days: 99999 }), 3650);
});

test('migration: só admin, segredos escondidos, recurso, cron, sem BEGIN/COMMIT', () => {
  assert.ok(sql.includes("IF uid IS NULL OR NOT COALESCE(public.has_role(uid, 'admin'::app_role), false) THEN RETURN NULL; END IF;"));
  assert.ok(sql.includes("_field ~* '(pass|secret|token|api_?key|private|credential|signature|access_?key)'"));
  assert.ok(sql.includes("TG_TABLE_NAME = 'integration_credentials'"));
  assert.ok(sql.includes("public.feature_enabled('activity_log', true)"));
  assert.ok(sql.includes("r ->> 'key' = 'features'"), 'ligar ou desligar recursos fica sempre registado');
  assert.ok(sql.includes("'activity-log-purge'"));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.admin_activity_record(uuid, text, text, text, text, jsonb, text, text) TO service_role;'));
  assert.ok(!/\bBEGIN;|\bCOMMIT;|CONCURRENTLY/.test(sql));
});

test('funções do servidor com chave de serviço registam e nunca mandam segredos', () => {
  for (const f of ['admin-update-user', 'admin-create-user', 'admin-delete-user', 'admin-credentials']) {
    assert.ok(readFileSync(`supabase/functions/${f}/index.ts`, 'utf8').includes('recordAdminActivity('), f);
  }
  assert.ok(readFileSync('supabase/functions/admin-update-user/index.ts', 'utf8').includes('changes.password = hidden()'));
  assert.ok(readFileSync('supabase/functions/admin-credentials/index.ts', 'utf8').includes('changes[`credentials.${k}`] = hidden('));
});

test('recurso, seção e textos registados', () => {
  assert.ok(readFileSync('src/lib/features.ts', 'utf8').includes("{ id: 'activity_log', category: 'security', defaultOn: true, sections: ['activity-log']"));
  assert.ok(readFileSync('src/components/admin/shell/adminSections.ts', 'utf8').includes('value: "activity-log"'));
  assert.ok(readFileSync('src/pages/Admin.tsx', 'utf8').includes('"activity-log": <AdminActivityLog />'));
  const f = readFileSync('src/i18n/adminFeatures.ts', 'utf8');
  assert.equal(f.split('c_security:').length - 1, 4);
});

console.log(`\n${n} testes ok`);
