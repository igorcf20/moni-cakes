// Teste de movimento da página inicial (Playwright; não faz parte das dependências do projeto).
//   npm i --no-save playwright && npx playwright install chromium
//   node scripts/test-home-motion.cjs [url] [pasta-das-capturas]
// Celular (Pixel 7) e computador (1440x900), com e sem "reduzir movimento", com o aviso de cookies aberto na medição.
// Falha se, no celular, uma entrada mexer pouco (menos de 48px ou sem máscara) ou acontecer sobretudo atrás da barra
// de baixo (era o que fazia o movimento passar despercebido num telemóvel real), se algo ficar escondido depois de
// rolar, se com "reduzir movimento" houver deslocamentos, ou se no computador faltarem as cenas fixas.
const path = require('path');
let pw;
try { pw = require('playwright'); } catch { console.log('SKIP: playwright não instalado (npm i --no-save playwright)'); process.exit(0); }
const { chromium, devices } = pw;
const url = process.argv[2] || 'http://localhost:8080/';
const shots = process.argv[3] || '';
const SEL = '[data-mc-fade],[data-mc-card],[data-mc-step],[data-mc-reveal-line],[data-mc-final-cake],[data-mc-celebrate-text]';
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fails.push(`erro na página: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.waitForLoadState('domcontentloaded'));
  await page.waitForTimeout(2600); // abertura de cena
  return { ctx, page };
}

/** Rola em passos de 50px e guarda, por elemento, [topo em % do ecrã, opacidade, deslocamento y, clip]. */
async function walk(page) {
  const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const rows = {};
  for (let y = 0; y <= H; y += 50) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(40);
    const s = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      const m = cs.transform === 'none' ? [1, 0, 0, 1, 0, 0] : cs.transform.replace(/^matrix\(|\)$/g, '').split(',').map(Number);
      return [r.top / innerHeight * 100, +cs.opacity, Math.abs(m[5]) + Math.abs(1 - m[0]) * 100, cs.clipPath !== 'none' && !/inset\(0(px|%)? /.test(cs.clipPath) ? 1 : 0, r.height];
    }), SEL);
    s.forEach((v, i) => (rows[i] ||= []).push(v));
  }
  return rows;
}

async function bottomBar(page) {
  return page.evaluate(() => {
    let e = document.elementFromPoint(innerWidth / 2, innerHeight - 4);
    while (e && e !== document.body) { if (getComputedStyle(e).position === 'fixed') return e.getBoundingClientRect().top / innerHeight * 100; e = e.parentElement; }
    return 100;
  });
}

async function dismissCookies(page) {
  const b = page.getByRole('button', { name: /recusar|rejeitar|reject|rechazar/i }).first();
  if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); }
}

async function capture(page, name, fracs) {
  if (!shots) return;
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const [label, sel, off] of fracs) {
    const y = await page.evaluate(([sel, off]) => { const n = sel ? document.querySelector(sel) : null; return n ? n.getBoundingClientRect().top + scrollY + off * innerHeight : off * innerHeight; }, [sel, off]);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.min(y, H));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(shots, `${name}-${label}.png`) });
  }
}

const SCENES = [
  ['1-hero', null, 0], ['2-hero-rolar', null, 0.45], ['3-bolos', '[data-mc-cakes]', -0.25], ['4-cartoes', '[data-mc-cards]', -0.45],
  ['5-pico-iris', '[data-mc-detail]', -0.35], ['6-pico-camadas', '[data-mc-detail]', 0.5], ['7-celebrar', '[data-mc-celebrate]', -0.3],
  ['8-celebrar-aberto', '[data-mc-celebrate]', 0.1], ['9-final', '[data-mc-final]', -0.3],
];

(async () => {
  const browser = await chromium.launch();
  for (const reduced of [false, true]) {
    const tag = reduced ? 'celular-reduzido' : 'celular';
    const { ctx, page } = await open(browser, { ...devices['Pixel 7'], reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const bar = await bottomBar(page);
    const rows = await walk(page);
    let measured = 0;
    Object.values(rows).forEach((r, i) => {
      const inView = r.filter(([top]) => top > -10 && top < 100);
      if (!inView.length) return;
      const startRow = inView.find(([, o]) => o > 0.05 && o < 0.95);
      const hidden = inView.filter(([, o]) => o < 0.95);
      const maxMove = Math.max(...inView.map((v) => v[2]));
      if (!hidden.length) return; // já visível ao chegar (ex.: dentro do primeiro ecrã)
      measured++;
      if (reduced) { check(maxMove < 1 && !inView.some((v) => v[3]), `${tag}: elemento ${i} desloca-se com reduzir movimento (${maxMove.toFixed(1)})`); return; }
      const clipped = inView.some((v) => v[3]);
      check(maxMove >= 48 || clipped, `${tag}: elemento ${i} mexe pouco (${maxMove.toFixed(0)}px, sem máscara)`);
      // Parte da entrada (de 5% a 95% de opacidade) que acontece atrás da barra de baixo.
      const during = inView.filter(([, o]) => o > 0.05 && o < 0.95);
      const behind = during.filter(([top]) => top > bar).length;
      check(!during.length || behind / during.length <= 0.15, `${tag}: elemento ${i} entra atrás da barra de baixo (${behind}/${during.length} quadros, barra a ${bar.toFixed(0)}%)`);
      if (startRow) check(startRow[0] <= bar + 2, `${tag}: elemento ${i} começa abaixo da barra (${startRow[0].toFixed(0)}%)`);
    });
    check(measured >= 8, `${tag}: só ${measured} entradas medidas`);
    // Voltar ao topo e descer de novo: nada fica escondido no ecrã em repouso.
    await dismissCookies(page);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(800);
    const stuck = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight * 0.45 && +getComputedStyle(e).opacity < 0.99; }).length, SEL);
    check(stuck === 0, `${tag}: ${stuck} elemento(s) escondidos no fim`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(500);
    await capture(page, tag, SCENES);
    console.log(`${tag}: barra de baixo a ${bar.toFixed(0)}%, ${measured} entradas medidas`);
    await ctx.close();
  }
  for (const reduced of [false, true]) {
    const tag = reduced ? 'computador-reduzido' : 'computador';
    const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const pins = await page.evaluate(() => document.querySelectorAll('.pin-spacer').length);
    check(reduced ? pins === 0 : pins >= 2, `${tag}: ${pins} cenas fixas`);
    await dismissCookies(page);
    const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= H; y += 300) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y); await page.waitForTimeout(60); }
    await page.waitForTimeout(1500);
    const stuck = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && +getComputedStyle(e).opacity < 0.99; }).length, SEL);
    check(stuck === 0, `${tag}: ${stuck} elemento(s) escondidos no fim`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(600);
    await capture(page, tag, SCENES);
    console.log(`${tag}: ${pins} cenas fixas`);
    await ctx.close();
  }
  await browser.close();
  if (fails.length) { console.log('FALHOU\n- ' + fails.join('\n- ')); process.exit(1); }
  console.log('OK');
})();
