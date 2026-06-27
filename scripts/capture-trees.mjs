// capture-trees.mjs — screenshot the new tree-species picker + planted species
// on the map (oak/pine/berry/shade). One-off verification aid.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = process.env.PORT || 8139;
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

  // Plant one of each tree species near the colony so they render on the map.
  await page.evaluate(() => {
    const g = window.neuroster; const sp = g.state.world.spawn;
    const kinds = ['oak', 'pine', 'berry', 'sapling'];
    kinds.forEach((type, i) => g.state.buildings.push({ id: 90000 + i, type, x: sp.x - 2 + i, y: sp.y - 2, active: true }));
    g.ui.renderAll();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/tree-species-map.png` });
  console.log('  ✓ tree-species-map.png');

  // Open Build → scroll to the Trees category and shoot the picker.
  await page.click('[data-tab="build"]', { force: true });
  await page.waitForTimeout(300);
  const cat = await page.evaluateHandle(() => [...document.querySelectorAll('#tab-build .cat')].find(c => c.textContent.trim() === 'Trees'));
  const el = cat.asElement();
  if (el) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    // shoot the Trees header + its grid (next sibling)
    const box = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#tab-build .cat')].find(c => c.textContent.trim() === 'Trees');
      const grid = c.nextElementSibling; const a = c.getBoundingClientRect(), b = grid.getBoundingClientRect();
      return { x: Math.floor(a.x) - 6, y: Math.floor(a.y) - 6, width: Math.ceil(Math.max(a.width, b.width)) + 12, height: Math.ceil(b.bottom - a.top) + 12 };
    });
    await page.screenshot({ path: `${OUT}/tree-picker.png`, clip: box });
    console.log('  ✓ tree-picker.png');
  } else console.error('  ! Trees category not found');

  await browser.close();
  if (errs.length) die('console errors: ' + errs.join(' | '));
  console.log('OK (no console errors)');
} catch (e) { die('failed: ' + e.message); } finally { server.kill(); }
