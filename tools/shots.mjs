// Screenshot + smoke-test driver for EMBERLINE.
// Serves game/ on :8080 (expects `node serve.ts` running), opens each
// ?shot= staging in headless Chromium and writes screenshots/*.jpg.
// Run: node tools/shots.mjs
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const shots = JSON.parse(readFileSync(new URL('../shots.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({
  // Note: /opt/meta-chromium/chrome refuses to start on this VM
  // ("Hatch WebGL domain policy is required for browser startup"),
  // so use Playwright's own cached Chromium instead.
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

for (const shot of shots) {
  const url = `http://localhost:8080/${shot.query}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(4000); // SwiftShader renders slowly; let sim time elapse
  const state = await page.evaluate(() => window.__fps?.state ?? null);
  console.log(shot.name, 'phase=', state?.phase, 'hp=', state?.hp, 'weapon=', state?.weapon, 'ashAlive=', state?.ashAlive);
  await page.screenshot({ path: `screenshots/${shot.name}`, type: 'jpeg', quality: 82 });
}
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
