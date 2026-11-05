// Teste das regras das páginas da loja (src/lib/sitePages.ts).
// Uso: node --experimental-strip-types scripts/test-site-pages.mjs
import assert from 'node:assert/strict';
import { hasHtmlText, legalDocToHtml, pickSitePage, richToHtml } from '../src/lib/sitePages.ts';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', name); };

test('escolhe a versão do idioma e a variante da mesma língua', () => {
  const rows = [
    { locale: 'pt-BR', published: true, id: 'br' },
    { locale: 'en', published: false, id: 'en' },
    { locale: 'es', published: true, id: 'es' },
  ];
  assert.equal(pickSitePage(rows, 'pt-BR')?.id, 'br');
  assert.equal(pickSitePage(rows, 'pt-PT')?.id, 'br');
  assert.equal(pickSitePage(rows, 'en'), null, 'rascunho não aparece');
  assert.equal(pickSitePage(rows, 'es')?.id, 'es');
});

test('texto vazio do editor', () => {
  assert.equal(hasHtmlText('<p></p>'), false);
  assert.equal(hasHtmlText('<p>&nbsp;</p>'), false);
  assert.equal(hasHtmlText('<p>Olá</p>'), true);
  assert.equal(hasHtmlText(null), false);
});

test('negrito, links seguros e escape', () => {
  assert.equal(richToHtml('**Loja** <b>'), '<strong>Loja</strong> &lt;b&gt;');
  assert.equal(richToHtml('[Contato](/contatos)'), '<a href="/contatos">Contato</a>');
  assert.equal(richToHtml('[x](javascript:alert(1))'), 'x)', 'destino perigoso vira texto');
  assert.equal(richToHtml('[x](//mal.com)'), 'x');
});

test('documento legal em HTML', () => {
  const html = legalDocToHtml({
    intro: ['Intro', false],
    sections: [
      { id: 'a', title: 'Dados', blocks: [{ kind: 'p', text: 'Texto' }, { kind: 'list', items: ['um', '', 'dois'], ordered: true }, { kind: 'cookieSettings' }] },
      false,
    ],
  });
  assert.equal(html, '<p>Intro</p><h2>Dados</h2><p>Texto</p><ol><li><p>um</p></li><li><p>dois</p></li></ol>');
});

console.log(`${n} testes ok`);
