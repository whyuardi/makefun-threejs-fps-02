import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:8080/', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.click('#play-btn');
await page.waitForTimeout(600);
await page.evaluate(() => { window.__fps.sim.money = 5000; });
await page.keyboard.press('KeyB'); await page.waitForTimeout(300);
await page.keyboard.press('KeyB'); await page.waitForTimeout(300);
const info = await page.evaluate(() => {
  const btn = document.querySelector('[data-buy="armor"]');
  const r = btn.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const el = document.elementFromPoint(cx, cy);
  return { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    atPoint: el ? el.tagName + '.' + (el.className || '') + ' "' + (el.textContent || '').slice(0, 30) + '"' : 'none',
    money: window.__fps.sim.money };
});
console.log('before raw click:', JSON.stringify(info));
// Raw mouse click at the button's center.
await page.mouse.click(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({ money: window.__fps.sim.money, armor: window.__fps.sim.player.armor }));
console.log('after raw click:', JSON.stringify(after));
await browser.close();
