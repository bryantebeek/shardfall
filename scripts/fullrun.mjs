// Soak test: plays an entire run through the real UI (heroes are topped up each turn so the bot reaches the boss).
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? '/tmp/run';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('console', m => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
let shotN = 0;
const shot = n => page.screenshot({ path: `${out}-${String(shotN++).padStart(2, '0')}-${n}.png` });
const vis = async sel => (await page.locator(sel).count()) > 0;
const click = sel => page.locator(sel).first().click({ force: true, timeout: 4000 }).catch(() => {});
const center = sel => page.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const seen = new Set();

await page.goto('http://localhost:5320/');
await page.waitForTimeout(1500);
await page.getByText('New Journey').click({ force: true });
await page.waitForTimeout(800);
await page.getByText('Begin the Ascent').click({ force: true });
await page.waitForTimeout(1200);

async function battle() {
  await page.waitForFunction(() => window.__sf?.battle && !window.__sf.busy, null, { timeout: 60000 });
  for (let turn = 0; turn < 40; turn++) {
    await page.evaluate(() => window.__sf.battle.heroes.forEach(h => { if (h.hp > 0) h.hp = h.maxHp; }));
    if (await page.evaluate(() => window.__sf.battle.limit >= 100)) { await click('.limit-btn'); await page.waitForFunction(() => !window.__sf.busy, null, { timeout: 30000 }).catch(() => {}); if (!seen.has('limit')) { seen.add('limit'); await shot('limit'); } }
    for (let g = 0; g < 10; g++) {
      const pick = await page.evaluate(() => {
        const b = window.__sf.battle;
        if (b.over) return null;
        for (const c of b.hand) {
          if (!b.canPlay(c).ok) continue;
          const e = b.aliveEnemies().sort((x, y) => x.hp - y.hp)[0]?.id, dead = b.heroes.find(h => h.hp <= 0)?.id, ally = b.aliveHeroes()[0]?.id;
          for (const t of [e, dead, ally]) if (t && b.validTarget(c, t)) return { uid: c.uid, t };
          if (!['enemy', 'ally', 'deadAlly'].includes(window.__sf.targetOf?.(c) ?? '')) return { uid: c.uid, t: null };
        }
        return null;
      });
      if (!pick) break;
      const from = await center(`.hand .card[data-uid="${pick.uid}"]`);
      if (!from) break;
      const to = pick.t ? await center(`.unit[data-id="${pick.t}"] .hit`) : [800, 300];
      await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(100);
      await page.waitForFunction(() => !window.__sf.busy || window.__sf.battle.over, null, { timeout: 30000 }).catch(() => logs.push('stuck after play'));
      if (await page.evaluate(() => !!window.__sf.battle.over)) break;
      // cancel any lingering aim
      await page.keyboard.press('Escape');
    }
    if (await page.evaluate(() => !!window.__sf.battle.over)) break;
    await click('.end-turn');
    await page.waitForTimeout(200);
    await page.waitForFunction(() => !window.__sf.busy || window.__sf.battle.over, null, { timeout: 60000 }).catch(() => logs.push('stuck in enemy turn'));
  }
  const r = await page.evaluate(() => ({ over: window.__sf.battle.over, turn: window.__sf.battle.turn, enemies: window.__sf.battle.enemies.map(e => e.def) }));
  logs.push('battle ' + JSON.stringify(r));
  await page.waitForTimeout(4000);
}

for (let step = 0; step < 80; step++) {
  await page.waitForTimeout(700);
  if (await vis('.end-screen')) { await shot('end'); logs.push('END reached'); break; }
  if (await vis('.screen:not(.leaving).battle')) { const t = await page.evaluate(() => window.__sf?.battle?.enemies.map(e => e.def).join('+')); if (!seen.has(t)) { seen.add(t); await page.waitForTimeout(3500); await shot('battle-' + t); } await battle(); continue; }
  if (await vis('.modal .card.pickable')) { await click('.modal .card.pickable'); continue; }
  if (await vis('.modal .hero-pick-btn')) { await click('.modal .hero-pick-btn'); continue; }
  if (await vis('.screen:not(.leaving).levelup-screen')) { if (!seen.has('lv')) { seen.add('lv'); await shot('levelup'); } await click('.levelup-screen .card.pickable'); continue; }
  if (await vis('.screen:not(.leaving).reward-screen')) {
    if (!seen.has('rw')) { seen.add('rw'); await page.waitForTimeout(800); await shot('rewards'); }
    for (const r of await page.locator('.reward-row:not(.taken)').all()) { await r.click({ force: true }).catch(() => {}); await page.waitForTimeout(500); if (await vis('.modal .card.pickable')) { await click('.modal .card.pickable'); await page.waitForTimeout(400); } }
    await click('.reward-screen .big-btn'); continue;
  }
  if (await vis('.screen:not(.leaving).event-screen')) {
    const t = await page.locator('.event-window .window-title').textContent();
    if (!seen.has(t)) { seen.add(t); await shot('event'); }
    if (await vis('.event-screen .big-btn')) { await click('.event-screen .big-btn'); continue; }
    await click('.event-btn:not([disabled])'); await page.waitForTimeout(600);
    if (await vis('.modal .card.pickable')) await click('.modal .card.pickable');
    continue;
  }
  if (await vis('.screen:not(.leaving).shop-screen')) { if (!seen.has('shop')) { seen.add('shop'); await shot('shop'); } await click('.shop-slot:not(.sold)'); await page.waitForTimeout(300); await click('.shop-leave'); continue; }
  if (await vis('.screen:not(.leaving).inn-screen')) { if (await vis('.inn-screen .big-btn')) await click('.inn-screen .big-btn'); else { await shot('inn'); await click('.inn-btn'); } continue; }
  if (await vis('.screen:not(.leaving).treasure-screen')) { if (await vis('.treasure-screen .big-btn')) await click('.treasure-screen .big-btn'); else { await click('.chest'); await page.waitForTimeout(800); await shot('treasure'); } continue; }
  if (await vis('.screen:not(.leaving).map-screen')) {
    const row = await page.evaluate(() => document.querySelectorAll('.map-node.visited').length);
    if (row === 8 || row === 14) await shot('map');
    // prefer elites/events/shops to cover more content
    const pref = ['.map-node.avail.t-boss', '.map-node.avail.t-elite', '.map-node.avail.t-shop', '.map-node.avail.t-event', '.map-node.avail.t-treasure', '.map-node.avail.t-inn', '.map-node.avail'];
    for (const p of pref) if (await vis(p)) { await click(p); break; }
    await page.waitForTimeout(1500);
    continue;
  }
}
console.log(logs.join('\n'));
await browser.close();
