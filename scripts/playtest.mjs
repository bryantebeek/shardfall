// Automated UI playtest: starts a run, plays the first battle through the real UI, screenshots along the way.
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:5320/';
const out = process.argv[3] ?? '/tmp/pt';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
let n = 0;
const shot = async (name) => page.screenshot({ path: `${out}-${String(n++).padStart(2, '0')}-${name}.png` });
const click = async (sel) => page.locator(sel).first().click({ force: true, noWaitAfter: true, timeout: 5000 });
const center = async (sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);

await page.goto(url);
await page.waitForTimeout(1500);
await page.getByText('New Journey').click({ force: true });
await page.waitForTimeout(900);
await page.getByText('Begin the Ascent').click({ force: true });
await page.waitForTimeout(1200);
await click('.map-node.avail');
await page.waitForTimeout(4500);
await shot('battle-start');

async function playTurn(turn) {
  for (let guard = 0; guard < 8; guard++) {
    const info = await page.evaluate(() => {
      const b = window.__sf.battle;
      if (b.over || b.phase !== 'player') return null;
      const c = b.hand.find(c => b.canPlay(c).ok);
      if (!c) return null;
      const CARDS = { enemy: 'enemy', ally: 'ally' };
      return { uid: c.uid, id: c.id, target: b.hand && c ? null : null };
    });
    if (!info) return;
    const target = await page.evaluate(uid => {
      const b = window.__sf.battle;
      const c = b.hand.find(c => c.uid === uid);
      const enemy = b.aliveEnemies()[0]?.id, ally = b.aliveHeroes().sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0]?.id;
      for (const id of [enemy, ally]) if (id && b.validTarget(c, id)) return id;
      return null;
    }, info.uid);
    const from = await center(`.hand .card[data-uid="${info.uid}"]`);
    if (!from) return;
    let to;
    if (target) {
      to = await page.evaluate(id => { const el = document.querySelector(`.unit[data-id="${id}"] .hit`); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, target);
    } else to = [800, 300];
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 6 });
    await page.mouse.move(to[0], to[1], { steps: 6 });
    await page.waitForTimeout(120);
    if (turn === 1 && guard === 0) await shot('aiming');
    await page.mouse.up();
    await page.waitForTimeout(350);
    if (turn === 1 && guard === 0) await shot('impact');
    await page.waitForFunction(() => !window.__sf.busy || window.__sf.battle.over, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
}

for (let turn = 1; turn <= 12; turn++) {
  await playTurn(turn);
  const over = await page.evaluate(() => window.__sf.battle.over);
  if (over) break;
  if (turn === 1) await shot('before-end');
  logs.push('turn ' + turn + ' ' + JSON.stringify(await page.evaluate(() => ({ e: window.__sf.battle.energy, hand: window.__sf.battle.hand.map(c => c.id + ':' + window.__sf.battle.canPlay(c).ok), btn: document.querySelector('.end-turn')?.className }))));
  await click('.end-turn');
  await page.waitForTimeout(900);
  if (turn === 1) await shot('enemy-turn');
  await page.waitForFunction(() => !window.__sf.busy || window.__sf.battle.over, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(300);
  if (turn === 1) await shot('turn2');
}
const diag = await page.evaluate(() => ({ endBtn: document.querySelector('.end-turn')?.className, phase: window.__sf.battle.phase, energy: window.__sf.battle.energy, hand: window.__sf.battle.hand.map(c => c.id), aiming: !!document.querySelector('.aiming'), banners: document.querySelectorAll('.banner').length }));
logs.push('diag: ' + JSON.stringify(diag));
const state = await page.evaluate(() => ({ over: window.__sf.battle.over, turn: window.__sf.battle.turn, heroes: window.__sf.battle.heroes.map(h => h.hp), enemies: window.__sf.battle.enemies.map(e => e.hp) }));
logs.push('battle: ' + JSON.stringify(state));
await page.waitForTimeout(3500);
await shot('after-battle');
// take all rewards
for (const row of await page.locator('.reward-row').all()) { await row.click({ force: true }).catch(() => {}); await page.waitForTimeout(400); }
await shot('rewards');
const cardChoice = await page.locator('.modal .card.pickable').count();
if (cardChoice) { await page.locator('.modal .card.pickable').first().click({ force: true }); await page.waitForTimeout(500); }
await page.getByText('Continue').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(1500);
await shot('map-after');
console.log(logs.join('\n') || 'no errors');
await browser.close();
