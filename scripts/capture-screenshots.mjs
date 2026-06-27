// capture-screenshots.mjs — one-off helper to capture wall screenshots for the
// already-shipped UI tickets that were missing one (honest-board reconciliation).
// Boots the static server, drives the real Chromium that ships in the env, and
// writes PNGs into docs/screenshots/. Run: node scripts/capture-screenshots.mjs
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = process.env.PORT || 8137;
const OUT = `${ROOT}docs/screenshots`;
const die = (m) => { console.error(m); process.exit(1); };

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { die('playwright-core not installed'); }

function findChromium() {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH))
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base).filter(d => /^chromium(-|_)/.test(d)).sort().reverse();
  for (const d of dirs)
    for (const exe of [`${base}/${d}/chrome-linux/chrome`, `${base}/${d}/chrome-linux/headless_shell`])
      if (existsSync(exe)) return exe;
  return null;
}
const executablePath = findChromium();
if (!executablePath) die('no Chromium found');

const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const waitForPort = (port, ms = 8000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const tick = () => {
    const sock = createConnection(port, '127.0.0.1');
    sock.once('connect', () => { sock.end(); res(); });
    sock.once('error', () => { sock.destroy(); Date.now() - t0 > ms ? rej(new Error('server did not start')) : setTimeout(tick, 150); });
  };
  tick();
});

const shot = async (page, name, opts) => {
  await page.screenshot({ path: `${OUT}/${name}`, ...opts });
  console.log('  ✓ wrote docs/screenshots/' + name);
};

try {
  await waitForPort(PORT);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.error('pageerror:', e.message));

  // --- New-colony flow ---
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#splash-new', { state: 'visible', timeout: 15000 });
  await page.click('#splash-new');
  await page.waitForSelector('[data-biome]', { state: 'visible', timeout: 8000 });
  await page.click('[data-biome]');
  await page.waitForSelector('#splash', { state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('.modal,.splash').forEach(m => { m.style.display = 'none'; }));
  await page.waitForTimeout(400);

  // 1) ux:zoom-map-fixes — the map, zoomed/centered on the colony.
  await shot(page, 'map-zoom.png');

  // Select the first rodent so the per-unit rows (lineage + job) render, then
  // open the Rodents panel.
  await page.click('[data-tab="rodents"]', { force: true });
  await page.waitForTimeout(300);
  await page.click('[data-selunit]', { force: true });
  await page.waitForTimeout(300);

  // 2) creatures:19b — Family lineage & names (the named roster).
  const panel = await page.$('#tab-rodents');
  await shot(page, 'family-lineage.png', { clip: await panel.boundingBox() });

  // 3) add:job-assignment — the 🎯 Job row on the selected rodent.
  const jobRow = await page.$('.jobrow');
  if (jobRow) await shot(page, 'job-assignment.png', { clip: await (await jobRow.evaluateHandle(n => n.closest('.unit'))).asElement().boundingBox() });
  else { await shot(page, 'job-assignment.png', { clip: await panel.boundingBox() }); }

  // 4) engage:17 — alert bar. Force a critical need so the banner renders.
  await page.evaluate(() => {
    const g = window.neuroster; if (!g) return;
    for (const u of g.state.units) { u.needs.food = 8; u.needs.water = 8; }
    g.ui.renderAll();
  });
  await page.waitForTimeout(300);
  await page.click('[data-tab="build"]', { force: true });
  await page.waitForTimeout(200);
  const bar = await page.$('#alertbar');
  const bb = bar && await bar.boundingBox();
  if (bb && bb.height > 4) await shot(page, 'alert-bar.png', { clip: { x: 0, y: 0, width: 1440, height: Math.min(900, bb.y + bb.height + 20) } });
  else { console.error('  ! alert bar not visible — capturing full frame'); await shot(page, 'alert-bar.png'); }

  // 5) infra:project-wall — the git-native wall.
  await page.goto(`http://localhost:${PORT}/docs/project/wall.html`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  await shot(page, 'project-wall.png', { fullPage: false });

  await browser.close();
  console.log('\nALL SCREENSHOTS CAPTURED.');
} catch (e) {
  die('capture failed: ' + e.message);
} finally {
  server.kill();
}
