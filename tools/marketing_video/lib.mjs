// lib.mjs — shared helpers for the marketing capture scripts (record.mjs,
// screenshots.mjs): server boot, Chromium discovery, and game-staging utilities
// that drive the real UI (build cards, canvas clicks, camera pans).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createConnection } from 'node:net';

export const ROOT = new URL('../..', import.meta.url).pathname;
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function findChromium() {
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

export async function startServer(port) {
  const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
      const s = createConnection(port, '127.0.0.1');
      s.once('connect', () => { s.end(); res(); });
      s.once('error', () => { s.destroy(); Date.now() - t0 > 8000 ? rej(new Error('server did not start')) : setTimeout(tick, 150); });
    };
    tick();
  });
  return server;
}

/** Hide splash/modal overlays once, via the game's own `.hidden` class. */
export const clearOverlays = (page) => page.evaluate(() => {
  document.querySelectorAll('.modal, .splash').forEach(m => m.classList.add('hidden'));
});

/** Keep auto-opening modals (first-launch Game Guide, decrees…) off the
 *  footage for the rest of the page's life. The menu modal is spared so the
 *  save flow still works. */
export const suppressModals = (page) => page.evaluate(() => {
  if (window.__suppressModals) return;
  window.__suppressModals = setInterval(() =>
    document.querySelectorAll('.modal:not(.hidden):not(#menu-modal)')
      .forEach(m => m.classList.add('hidden')), 350);
});

/** Fresh colony: splash → New Colony → first biome. */
export async function newColony(page, port, { biomeHoverMs = 0, lingerMs = 0 } = {}) {
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#splash-new', { state: 'visible', timeout: 15000 });
  if (lingerMs) await sleep(lingerMs);               // hold on the title screen
  await page.click('#splash-new');
  await page.waitForSelector('[data-biome]', { state: 'visible', timeout: 8000 });
  if (biomeHoverMs) {
    const biomes = page.locator('[data-biome]');
    const n = Math.min(await biomes.count(), 3);
    for (let i = 0; i < n; i++) { await biomes.nth(i).hover(); await sleep(biomeHoverMs); }
  }
  await page.locator('[data-biome]').first().click();
  await page.waitForSelector('#splash', { state: 'hidden', timeout: 10000 });
  await sleep(600);
  await suppressModals(page);
}

/** Revisit: continue the saved colony past the splash. */
export async function continueColony(page, port) {
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
  try {
    await page.waitForSelector('#splash-menu:not(.hidden), #splash[style*="none"]', { timeout: 15000 });
  } catch { /* splash may auto-dismiss */ }
  const cont = page.locator('#splash-continue');
  if (await cont.isVisible().catch(() => false)) await cont.click();
  await page.waitForSelector('#splash', { state: 'hidden', timeout: 10000 });
  await sleep(400);
  await suppressModals(page);
}

/** Smooth cinematic pan: lerp the board scroll (same thing right-drag does). */
export const panTo = (page, dx, dy, ms) => page.evaluate(([dx, dy, ms]) => new Promise(done => {
  const b = document.getElementById('board');
  const x0 = b.scrollLeft, y0 = b.scrollTop, t0 = performance.now();
  const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    b.scrollLeft = x0 + dx * ease(k); b.scrollTop = y0 + dy * ease(k);
    k < 1 ? requestAnimationFrame(tick) : done();
  };
  requestAnimationFrame(tick);
}), [dx, dy, ms]);

export const setSpeed = (page, s) => page.evaluate(v => { window.neuroster.view.speed = v; }, s);

/** Modest resource grant sized to fit under the cap once depots stand. */
export const grantResources = (page) => page.evaluate(() => {
  const st = window.neuroster.state;
  const add = { wood: 450, stone: 350, planks: 250, iron: 120, seeds: 150 };
  for (const [k, v] of Object.entries(add)) st.res[k] = (st.res[k] || 0) + v;
});

/** Finish any in-construction storage instantly (off-camera nudge so the cap
 *  rises before the big grant lands). */
export const finishStorage = (page) => page.evaluate(() => {
  for (const b of window.neuroster.state.buildings)
    if (b.type === 'storage' && b.underConstruction) { b.underConstruction = false; b.progress = 1; }
});

/** Click a build card, then click canvas spots (Shift held = keep placing).
 *  Fractions are of the VISIBLE viewport, near the revealed town centre. */
export async function placeBuildings(page, type, spots) {
  const card = page.locator(`[data-build="${type}"]`);
  if (!await card.count()) return 0;
  await card.first().scrollIntoViewIfNeeded();
  await card.first().click({ force: true });
  const box = await page.locator('#viewport').boundingBox();
  const before = await page.evaluate(() => window.neuroster.state.buildings.length);
  await page.keyboard.down('Shift');
  for (const [fx, fy] of spots) {
    const x = box.x + Math.min(Math.max(box.width * fx, 8), box.width - 8);
    const y = box.y + Math.min(Math.max(box.height * fy, 8), box.height - 8);
    await page.mouse.move(x, y, { steps: 12 });     // ghost preview slides over
    await sleep(280);
    await page.mouse.click(x, y);
    await sleep(320);
  }
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');              // leave placement mode
  await sleep(150);
  const after = await page.evaluate(() => window.neuroster.state.buildings.length);
  return after - before;
}

/** The staged "build boom" used by both capture scripts: storage first (cap
 *  up), then housing, food and industry. Returns how many buildings landed. */
export async function stageBoom(page) {
  await grantResources(page);
  await page.click('[data-tab="build"]', { force: true });
  await sleep(700);
  let placed = 0;
  placed += await placeBuildings(page, 'storage', [[0.42, 0.60], [0.33, 0.46]]);
  await finishStorage(page);
  placed += await placeBuildings(page, 'burrow',  [[0.40, 0.33], [0.55, 0.32], [0.60, 0.52]]);
  placed += await placeBuildings(page, 'farm',    [[0.52, 0.64], [0.62, 0.42], [0.30, 0.62]]);
  placed += await placeBuildings(page, 'mill',    [[0.47, 0.45], [0.52, 0.50]]);
  return placed;
}

/** Save through the real menu so later visits inherit the colony. */
export async function saveColony(page) {
  const t = { timeout: 4000 };
  await page.click('#btn-menu', t).catch(() => {}); await sleep(300);
  await page.click('#btn-save', t).catch(() => {}); await sleep(300);
  await page.click('#menu-close', t).catch(() => {}); await sleep(200);
  await clearOverlays(page);
}
