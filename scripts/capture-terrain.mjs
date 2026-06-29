// capture-terrain.mjs — screenshot richer terrain: a mountains map (hills +
// rocky cliff faces) and a rivers map with a raging (white-water) channel.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = process.env.PORT || 8152;
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
const setBiome = async (page, biome, seed) => {
  await page.evaluate(async ([biome, seed]) => {
    const W = await import('./src/world.js');
    const s = window.neuroster.state;
    const w = W.generateWorld(seed, biome, 1);
    for (let i = 0; i < w.seen.length; i++) w.seen[i] = 1; // lift fog
    s.world = w;
    window.neuroster.ui.renderAll();
  }, [biome, seed]);
  await page.waitForTimeout(500);
};
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
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelectorAll('.modal,.splash').forEach(m => { m.style.display = 'none'; }));

  await setBiome(page, 'mountains', 3);
  await page.screenshot({ path: `${OUT}/terrain-hills.png` });
  console.log('  ✓ terrain-hills.png (hills + rocky cliff faces)');

  // rivers biome — retry seeds until the channel is raging, for the screenshot
  let raging = false;
  for (const seed of [7, 2, 5, 11, 13, 17]) {
    await setBiome(page, 'rivers', seed);
    raging = await page.evaluate(() => window.neuroster.state.world.raging.some(v => v === 1));
    if (raging) break;
  }
  await page.screenshot({ path: `${OUT}/terrain-raging-river.png` });
  console.log(`  ✓ terrain-raging-river.png (raging=${raging})`);

  await browser.close();
  if (errs.length) die('console errors: ' + errs.join(' | '));
  console.log('OK (no console errors)');
} catch (e) { die('failed: ' + e.message); } finally { server.kill(); }
