// browser-smoke.mjs — real-browser smoke test (Playwright + the pre-installed
// Chromium). Boots the static server, creates a colony, opens the Defense screen
// and asserts it renders with no console/page errors. Complements the headless
// logic suite in smoke.mjs (which has no DOM).
//
// Run: npm run verify:browser
//
// Browsers are NOT downloaded — we point Playwright at the Chromium that ships in
// the environment (PLAYWRIGHT_BROWSERS_PATH, default /opt/pw-browsers). If neither
// playwright-core nor a Chromium build is present, the test SKIPS (exit 0) rather
// than failing, so it never blocks a machine that simply lacks a browser.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = process.env.PORT || 8123;
const skip = (why) => { console.log(`SKIP browser-smoke: ${why}`); process.exit(0); };

// 1) Resolve playwright-core (skip cleanly if it isn't installed).
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { skip('playwright-core not installed (run `npm install`)'); }

// 2) Find a Chromium binary in the environment's browser cache.
function findChromium() {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH))
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  // Prefer a full chromium build; fall back to the headless shell.
  const dirs = readdirSync(base).filter(d => /^chromium(-|_)/.test(d)).sort().reverse();
  for (const d of dirs) {
    for (const exe of [`${base}/${d}/chrome-linux/chrome`, `${base}/${d}/chrome-linux/headless_shell`])
      if (existsSync(exe)) return exe;
  }
  return null;
}
const executablePath = findChromium();
if (!executablePath) skip('no Chromium found under PLAYWRIGHT_BROWSERS_PATH');

// 3) Boot the static server.
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

let failed = false;
try {
  await waitForPort(PORT);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  // New-colony flow: splash → New Colony → pick the first biome (starts the game).
  await page.waitForSelector('#splash-new', { state: 'visible', timeout: 15000 });
  await page.click('#splash-new');
  await page.waitForSelector('[data-biome]', { state: 'visible', timeout: 8000 });
  await page.click('[data-biome]');
  await page.waitForSelector('#splash', { state: 'hidden', timeout: 10000 });
  await page.waitForTimeout(600);
  // Clear any first-launch modal, then open the Defense & Military screen.
  await page.evaluate(() => document.querySelectorAll('.modal,.splash').forEach(m => { m.style.display = 'none'; }));
  await page.click('[data-tab="threats"]', { force: true });
  await page.waitForTimeout(300);

  const assert = (cond, label) => { if (cond) console.log('  ✓ ' + label); else { console.log('  ✗ ' + label); failed = true; } };
  const label = (await page.textContent('[data-tab="threats"]')).trim();
  const pane = await page.textContent('#tab-threats');
  assert(label.includes('Defense'), `tab is labelled Defense (got "${label}")`);
  assert(pane.includes('Garrison'), 'Defense screen shows the Garrison roster');
  assert(pane.includes('Defensive works'), 'Defense screen shows Defensive works');
  assert(pane.includes('Threat readiness'), 'Defense screen shows Threat readiness');
  assert(errors.length === 0, `no console/page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

  await browser.close();
} catch (e) {
  console.log('  ✗ ' + e.message);
  failed = true;
} finally {
  server.kill();
}

console.log(failed ? '\nBROWSER SMOKE FAILED.' : '\nBROWSER SMOKE PASSED.');
process.exit(failed ? 1 : 0);
