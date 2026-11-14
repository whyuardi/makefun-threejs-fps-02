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
await page.keyboard.press('KeyB');
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const btn = document.querySelector('[data-buy="grenade"][data-id="he"]');
  const r = btn.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const el = document.elementFromPoint(cx, cy);
  const panel = document.querySelector('#buy-menu .panel').getBoundingClientRect();
  return { btnRect: { x: r.x, y: r.y, w: r.width, h: r.height }, center: { cx, cy },
    atPoint: el ? el.tagName + '.' + el.className + ' "' + (el.textContent || '').slice(0, 40) + '"' : 'none',
    panel: { y: panel.y, h: panel.height }, scrollH: document.querySelector('#buy-menu .panel').scrollHeight,
    winH: window.innerHeight };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
