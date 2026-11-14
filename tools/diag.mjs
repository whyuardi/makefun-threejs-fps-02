// Diagnostic: two screenshots of ?shot=play — one before firing starts,
// one after — to identify the pale squares in the combat shot.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto('http://localhost:8080/?shot=play&seed=1', { waitUntil: 'load' });
await page.waitForTimeout(200); // before the scripted fire at 350ms
await page.screenshot({ path: '/tmp/diag-before.jpg', type: 'jpeg', quality: 82 });
await page.waitForTimeout(2300);
await page.screenshot({ path: '/tmp/diag-after.jpg', type: 'jpeg', quality: 82 });
const s = await page.evaluate(() => ({ ...window.__fps.state, fps: 0 }));
console.log('state', JSON.stringify(s));
await browser.close();
