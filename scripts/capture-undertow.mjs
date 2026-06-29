// capture-undertow.mjs — beach map: a rodent wading in the shallows and another
// caught by the undertow (🆘 + bubbles — click to rescue).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = process.env.PORT || 8160;
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
  // pick the beach biome if present (last card), else the first
  const biomes = await page.$$('[data-biome]');
  await (biomes[biomes.length - 1] || biomes[0]).click();
  await page.waitForSelector('#splash', { state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelectorAll('.modal,.splash').forEach(m => { m.style.display = 'none'; }));
  // Put a wader & a drowning rodent onto water tiles near the colony, centre view.
  await page.evaluate(() => {
    const g = window.neuroster, s = g.state;
    for (let i = 0; i < s.world.seen.length; i++) s.world.seen[i] = 1;
    // find some water tiles
    const W = s.world; const GW = 40; const water = [];
    for (let i = 0; i < W.terrain.length && water.length < 6; i++) if (W.terrain[i] === 3) water.push([i % GW, Math.floor(i / GW)]);
    const u0 = s.units[0], u1 = s.units[1] || s.units[0];
    if (water[0]) { u0.wading = true; u0._wadeDepth = 1; u0.x = water[0][0]; u0.y = water[0][1]; }
    if (water[2]) { u1.wading = true; u1.drowning = { until: (s.env.lived || 0) + 6 }; u1.x = water[2][0]; u1.y = water[2][1]; }
    g.ui.renderAll();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/undertow.png` });
  console.log('  ✓ undertow.png');
  await browser.close();
  if (errs.length) die('console errors: ' + errs.join(' | '));
  console.log('OK (no console errors)');
} catch (e) { die('failed: ' + e.message); } finally { server.kill(); }
