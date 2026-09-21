// screenshots.mjs — captures polished still screenshots for marketing use
// (website carousel, store pages). Stages the same build-boom as the video,
// lets the colony develop at high sim speed, then shoots six 1600×900 PNGs:
//
//   01-title        splash / title screen
//   02-biome        the biome & world-options picker
//   03-town         developed town overview, labels on
//   04-life         zoomed-in colony life with a work gang selected
//   05-defense      Defense & garrison screen
//   06-evolve       Evolve (species) screen
//
// Output: tools/marketing_video/build/shots/*.png (override with OUT_DIR).
// Run: node tools/marketing_video/screenshots.mjs
import { mkdirSync } from 'node:fs';
import { findChromium, startServer, sleep, newColony, setSpeed, stageBoom,
         panTo } from './lib.mjs';

const PORT = process.env.PORT || 8189;
const OUT = process.env.OUT_DIR || new URL('./build/shots', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const { chromium } = await import('playwright-core');
const executablePath = findChromium();
if (!executablePath) { console.error('no Chromium found'); process.exit(1); }
const server = await startServer(PORT);

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
// Keep the auto-opening Game Guide off the shots (see record.mjs).
await ctx.addInitScript(() => { try { localStorage.setItem('neuroster.seenHelp', '1'); } catch {} });
const page = await ctx.newPage();
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}.png`);
};

// Title screen.
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForSelector('#splash-new', { state: 'visible', timeout: 15000 });
await sleep(600);
await shot('01-title');

// Biome picker.
await page.click('#splash-new');
await page.waitForSelector('[data-biome]', { state: 'visible', timeout: 8000 });
await page.locator('[data-biome]').first().hover();
await sleep(400);
await shot('02-biome');

// Found the colony and stage the boom, then let it develop fast.
await page.locator('[data-biome]').first().click();
await page.waitForSelector('#splash', { state: 'hidden', timeout: 10000 });
await sleep(600);
await page.evaluate(() => {
  if (window.__suppressModals) return;
  window.__suppressModals = setInterval(() =>
    document.querySelectorAll('.modal:not(.hidden):not(#menu-modal)')
      .forEach(m => m.classList.add('hidden')), 350);
});
const placed = await stageBoom(page);
console.log(`  placed ${placed} buildings`);
await setSpeed(page, 4);
await sleep(15000);                       // construction finishes, pups arrive
await setSpeed(page, 1);

// Town overview with labels.
await page.click('#btn-labels');
await page.click('#zoom-out'); await sleep(400);
await shot('03-town');

// Colony life close-up with a selected work gang.
await page.click('#zoom-in'); await sleep(300);
await page.click('#zoom-in'); await sleep(500);
const box = await page.locator('#viewport').boundingBox();
await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.68, { steps: 20 });
await page.mouse.up();
await sleep(700);
await panTo(page, 40, 20, 600);
await sleep(600);
await shot('04-life');

// Defense & Evolve screens.
await page.click('[data-tab="threats"]', { force: true });
await sleep(800);
await shot('05-defense');
await page.click('[data-tab="evo"]', { force: true });
await sleep(800);
await shot('06-evolve');

await browser.close();
server.kill();
console.log(`All screenshots in ${OUT}`);
