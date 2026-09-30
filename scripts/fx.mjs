// Play one card through the UI and capture a burst of frames. usage: node scripts/fx.mjs <query> <out> <cardIndex> <targetUnitId|up> [frames] [interval]
import { chromium } from 'playwright-core';
const [query, out, idx = '0', target = 'e0', frames = '8', interval = '250'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('console', m => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
await page.goto('http://localhost:5320/?' + query);
await page.waitForFunction(() => window.__sf && !window.__sf.busy, null, { timeout: 60000 });
await page.waitForTimeout(500);
if (process.env.FREEZE) await page.evaluate(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 1500 ? 1e9 : ms, ...a); });
if (process.env.FREEZE) await page.evaluate(() => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList?.contains('popup')) setTimeout(() => (n.style.animationPlayState = 'paused'), 250); }))).observe(document.querySelector('.units'), { childList: true }));
const center = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
for (const step of idx.split(';')) {
  const [ci, tgt = target] = step.split('@');
  const uid = await page.evaluate(i => window.__sf.battle.hand[i].uid, Number(ci));
  const from = await center(`.hand .card[data-uid="${uid}"]`);
  const to = tgt === 'up' ? [800, 300] : await center(`.unit[data-id="${tgt}"] .hit`);
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 8 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  for (let f = 0; f < Number(frames); f++) { await page.waitForTimeout(Number(interval)); await page.screenshot({ path: `${out}-${step.replace(/[@;]/g, '_')}-${f}.png` }); }
  await page.waitForFunction(() => !window.__sf.busy, null, { timeout: 60000 }).catch(() => {});
}
logs.push('state: ' + JSON.stringify(await page.evaluate(() => ({ e: window.__sf.battle.enemies.map(e => [e.hp, e.shield, e.broken]), energy: window.__sf.battle.energy }))));
console.log(logs.join('\n'));
await browser.close();
