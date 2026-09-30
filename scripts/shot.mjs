// Dev helper: drive the game in headless Chromium and take screenshots.
// usage: node scripts/shot.mjs <url> <out-prefix> [steps.json]
import { chromium } from 'playwright-core';
const [url = 'http://localhost:5310/', out = '/tmp/shot', stepsArg] = process.argv.slice(2);
const steps = stepsArg ? JSON.parse(stepsArg) : [];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(2500);
let n = 0;
for (const s of steps) {
  if (s.click) await page.click(s.click, { timeout: 5000, force: true, noWaitAfter: true }).catch(e => logs.push('click fail ' + s.click + ' ' + e.message.split('\n')[0]));
  if (s.clickText) await page.getByText(s.clickText, { exact: false }).first().click({ timeout: 5000, noWaitAfter: true, force: true }).catch(e => logs.push('clickText fail ' + s.clickText + ' ' + e.message.split('\n')[0]));
  if (s.mouse) { await page.mouse.click(s.mouse[0], s.mouse[1]); }
  if (s.drag) { const [a, b, c, d] = s.drag; await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move((a + c) / 2, (b + d) / 2, { steps: 5 }); await page.mouse.move(c, d, { steps: 5 }); await page.waitForTimeout(150); if (s.shotMid) await page.screenshot({ path: `${out}-${n++}.png` }); await page.mouse.up(); }
  if (s.hover) { await page.mouse.move(s.hover[0], s.hover[1], { steps: 4 }); }
  if (s.key) await page.keyboard.press(s.key);
  if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) logs.push('eval: ' + JSON.stringify(r)); }
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${out}-${n++}.png` });
}
if (!steps.length) await page.screenshot({ path: `${out}-0.png` });
console.log(logs.join('\n') || 'no errors');
await browser.close();
