// Teste de Avise-me quando chegar e Carrinhos abandonados (src/lib/stockAlerts.ts, src/lib/cartRecovery.ts).
// Uso: node --experimental-strip-types scripts/test-phase1.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alertResult, backInStock, isAlertEmail, STOCK_ALERT_RESULTS } from '../src/lib/stockAlerts.ts';
import { firstName, mailtoLink, whatsappLink } from '../src/lib/cartRecovery.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('e-mail igual à regra do servidor', () => {
  assert.equal(isAlertEmail('ana@loja.com'), true);
  assert.equal(isAlertEmail(' ana@loja.com '), true);
  assert.equal(isAlertEmail('ana@loja'), false);
  assert.equal(isAlertEmail('a na@loja.com'), false);
  assert.equal(isAlertEmail('x'.repeat(250) + '@a.com'), false);
});

test('códigos do servidor', () => {
  assert.equal(alertResult('ok'), 'ok');
  assert.equal(alertResult('lixo'), 'error');
  const sql = readFileSync(new URL('../supabase/migrations/20261006180000_stock_alerts.sql', import.meta.url), 'utf8');
  for (const c of STOCK_ALERT_RESULTS) assert.ok(sql.includes(`'${c}'`), c);
});

test('voltou ao estoque', () => {
  assert.equal(backInStock(null), true);
  assert.equal(backInStock(0), false);
  assert.equal(backInStock(3), true);
});

test('links de contato', () => {
  assert.equal(whatsappLink('+55 (11) 98888-7777', 'Oi'), 'https://wa.me/5511988887777?text=Oi');
  assert.equal(whatsappLink('123', 'Oi'), null);
  assert.equal(whatsappLink(null, 'Oi'), null);
  assert.equal(mailtoLink('a@b.com', 'Olá', 'x y'), 'mailto:a%40b.com?subject=Ol%C3%A1&body=x%20y');
  assert.equal(firstName('  Ana Maria Souza '), 'Ana');
  assert.equal(firstName(null), '');
});

console.log(`${n} testes ok`);
