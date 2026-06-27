// capture-growth.mjs — screenshot the maturation system: freshly-built farms &
// trees showing the 🌱 grow-in badge / young (small) trees. One-off doc aid.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = process.env.PORT || 8141;
const OUT = `${ROOT}docs/screenshots`;
const die = (m) => { console.error(m); process.exit(1); };
let chromium; try { ({ chromium } = await import('playwright-core')); } catch { die('no playwright-core'); }
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base).filter(d => /^chromium(-|_)/.test(d)).sort().reverse())
    for (const exe of [`${base}/${d}/chrome-linux/chrome`, `${base}/${d}/chrome-linux/headless_shell`])
      if (existsSync(exe)) return exe;
  return null;
}
const executablePath = findChromium(); if (!executablePath) die('no chromium');
const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const waitForPort = (port, ms = 8000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const tick = () => { const s = createConnection(port, '127.0.0.1'); s.once('connect', () => { s.end(); res(); }); s.once('error', () => { s.destroy(); Date.now() - t0 > ms ? rej(new Error('no server')) : setTimeout(tick, 150); }); };
  tick();
});
try {
  await waitForPort(PORT);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; page.on('console', m => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#splash-new', { state: 'visible', timeout: 15000 });
  await page.click('#splash-new');
  await page.waitForSelector('[data-biome]', { state: 'visible', timeout: 8000 });
  await page.click('[data-biome]');
  await page.waitForSelector('#splash', { state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('.modal,.splash').forEach(m => { m.style.display = 'none'; }));

  // Drop a row of producers at staggered maturities so the grow-in is visible:
  // a fresh field/farm (sprout badge), a half-grown oak, a young pine/berry.
  await page.evaluate(() => {
    const g = window.neuroster; const s = g.state; const sp = s.world.spawn; const lived = s.env.lived || 0;
    const place = (type, dx, dy, mat) => s.buildings.push({ id: 70000 + s.buildings.length, type, x: sp.x + dx, y: sp.y + dy, active: true, builtAt: lived - mat });
    place('sunflower', -2, -2, 2);   // just planted — ~0% grown
    place('farm', -1, -2, 25);       // partway
    place('oak', 0, -2, 10);         // young oak (small)
    place('pine', 1, -2, 40);        // half-grown pine
    place('berry', 2, -2, 70);       // nearly grown berry
    g.ui.renderAll();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/growth-maturation.png` });
  console.log('  ✓ growth-maturation.png');
  await browser.close();
  if (errs.length) die('console errors: ' + errs.join(' | '));
  console.log('OK (no console errors)');
} catch (e) { die('failed: ' + e.message); } finally { server.kill(); }
