// Interactive playtest: drives EMBERLINE with real keyboard/mouse events
// in headless Chromium — deploy, move, look, shoot, buy, throw a grenade.
// Run: node tools/playtest.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const state = () => page.evaluate(() => window.__fps.state);
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:8080/', { waitUntil: 'load' });
await sleep(1500);
console.log('menu phase:', (await state()).phase);

// Deploy via the button.
await page.click('#play-btn');
await sleep(1000);
let s = await state();
console.log('after deploy:', s.phase, 'round', s.round, 'money', s.money, 'weapon', s.weapon);

// Buy menu with B (it auto-opens at freeze; B closes it, B opens again),
// buy armor + HE via the DOM buttons.
await page.evaluate(() => { window.__fps.sim.money = 5000; });
const buyAutoOpen = await page.evaluate(() => !document.getElementById('buy-menu').hidden);
console.log('buy menu auto-opens at freeze:', buyAutoOpen);
await page.keyboard.press('KeyB');
await sleep(400);
const buyClosed = await page.evaluate(() => document.getElementById('buy-menu').hidden);
console.log('B closes it:', buyClosed);
await page.keyboard.press('KeyB');
await sleep(400);
const buyVisible = await page.evaluate(() => !document.getElementById('buy-menu').hidden);
console.log('B re-opens it:', buyVisible);
await page.click('[data-buy="armor"]');
await page.click('[data-buy="grenade"][data-id="he"]');
s = await state();
console.log('after buys: money', s.money, 'armor', s.armor, 'HE', s.grenades.he);
await page.keyboard.press('KeyB');
await sleep(300);

// Wait out the freeze (12 s sim; SwiftShader is slow, so poll long).
for (let i = 0; i < 120; i++) {
  s = await state();
  if (s.phase === 'live') break;
  await sleep(1000);
}
console.log('live phase reached:', s.phase, 'timer', Math.round(s.timer));

// Move forward + strafe, check the position changes.
const p0 = await page.evaluate(() => ({ x: window.__fps.sim.player.x, z: window.__fps.sim.player.z, yaw: window.__fps.sim.player.yaw }));
await page.keyboard.down('KeyW');
await sleep(2500);
await page.keyboard.up('KeyW');
const p1 = await page.evaluate(() => ({ x: window.__fps.sim.player.x, z: window.__fps.sim.player.z, yaw: window.__fps.sim.player.yaw }));
console.log('moved:', `(${(p0.x).toFixed(1)},${(p0.z).toFixed(1)}) -> (${(p1.x).toFixed(1)},${(p1.z).toFixed(1)})`, 'dist', Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1), 'm');

// Mouse look (pointer lock): click the canvas, then move the mouse.
await page.mouse.click(480, 270);
await sleep(300);
await page.mouse.move(480, 270);
await page.mouse.move(640, 270, { steps: 10 });
await sleep(300);
const yaw1 = await page.evaluate(() => window.__fps.sim.player.yaw);
console.log('yaw after mouse move:', p0.yaw.toFixed(2), '->', yaw1.toFixed(2), 'locked:', await page.evaluate(() => !!document.pointerLockElement));

// Shoot: hold the mouse button.
const mag0 = (await state()).mag;
await page.mouse.down();
await sleep(1200);
await page.mouse.up();
s = await state();
console.log('fired: mag', mag0, '->', s.mag, 'shots total', await page.evaluate(() => window.__fps.sim.stats.shotsFired));

// Throw the HE grenade with key 4.
await page.keyboard.press('Digit4');
await sleep(500);
s = await state();
console.log('HE left:', s.grenades.he, 'grenades in world:', await page.evaluate(() => window.__fps.sim.grenades.length));
await sleep(3000);
console.log('grenades after fuse:', await page.evaluate(() => window.__fps.sim.grenades.length));

// Reload with R.
await page.keyboard.press('KeyR');
await sleep(3500);
s = await state();
console.log('after reload: mag', s.mag, 'reserve', s.reserve);

// Let the bots fight a while; report the round state.
await sleep(8000);
s = await state();
console.log('after 8s: phase', s.phase, 'timer', Math.round(s.timer), 'hp', s.hp, 'emberAlive', s.emberAlive, 'ashAlive', s.ashAlive, 'kills', s.kills);
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
