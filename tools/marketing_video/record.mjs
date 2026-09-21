// record.mjs — captures the raw footage for the marketing video.
//
// Boots the static server, drives the real game in the environment's Chromium
// and records each scene as a separate .webm via Playwright's video recorder:
//
//   gameplay_found   splash → New Colony → biome pick → world reveal + camera work
//   gameplay_build   staged build-boom: resources granted, buildings placed live
//   gameplay_life    labels on, zoomed-in colony life, marquee-select a work gang
//   gameplay_defend  Defense / Skills / Evolve screens
//   cut_*            animated hero cards rendered from cutscene.html
//
// Output: tools/marketing_video/build/footage/*.webm (override with OUT_DIR).
// Run: node tools/marketing_video/record.mjs   (then assemble.py)
import { mkdirSync } from 'node:fs';
import { findChromium, startServer, sleep, newColony, continueColony,
         panTo, setSpeed, stageBoom, saveColony } from './lib.mjs';

const PORT = process.env.PORT || 8188;
const OUT = process.env.OUT_DIR || new URL('./build/footage', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const { chromium } = await import('playwright-core');
const executablePath = findChromium();
if (!executablePath) { console.error('no Chromium found'); process.exit(1); }
const server = await startServer(PORT);

const W = 1280, H = 720;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
// One context for everything: gameplay scenes share localStorage, so the colony
// persists (and keeps progressing at high sim speed) from scene to scene.
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
});
// The Game Guide auto-opens on every load until marked seen (ui.js) — mark it
// before any page script runs so it never sits over the footage.
await ctx.addInitScript(() => { try { localStorage.setItem('neuroster.seenHelp', '1'); } catch {} });

/** Run one scene on a fresh page, then save its recording as <name>.webm. */
async function scene(name, fn) {
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error(`  [${name}] pageerror: ${e.message}`));
  try { await fn(page); }
  catch (e) { console.error(`  [${name}] scene error: ${e.message}`); }
  const video = page.video();
  await page.close();
  await video.saveAs(`${OUT}/${name}.webm`);
  await video.delete();
  console.log(`✓ recorded ${name}.webm`);
}

// ---------------------------------------------------------------------------
// Scene 1 — founding: splash, New Colony, biome pick, world reveal.
await scene('gameplay_found', async (page) => {
  await newColony(page, PORT, { biomeHoverMs: 650, lingerMs: 1300 });
  await sleep(1400);                                  // first look at the colony
  for (let i = 0; i < 3; i++) { await page.click('#zoom-out'); await sleep(450); }
  await panTo(page, 260, 140, 2200);
  await sleep(500);
  await panTo(page, -420, -180, 2400);
  await page.click('#zoom-in'); await sleep(500);
  await sleep(1200);
});

// Scene 2 — build boom: grant materials, place a district, fast-forward.
await scene('gameplay_build', async (page) => {
  await continueColony(page, PORT);
  await setSpeed(page, 2);
  const placed = await stageBoom(page);
  console.log(`  placed ${placed} buildings`);
  await setSpeed(page, 4);                            // hamsters swarm the sites
  await sleep(6000);
  await panTo(page, 120, 60, 1800);
  await sleep(2000);
  // Persist the boom so the later scenes inherit a lively colony.
  await saveColony(page);
});

// Scene 3 — colony life: labels, zoom-in, marquee-select a work gang.
await scene('gameplay_life', async (page) => {
  await continueColony(page, PORT);
  await setSpeed(page, 2);
  await page.click('#btn-labels');
  await sleep(400);
  await page.click('#zoom-in'); await sleep(400);
  await page.click('#zoom-in'); await sleep(600);
  const box = await page.locator('#viewport').boundingBox();
  // Marquee-select around the town centre — selection ring + group chip footage.
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.68, { steps: 24 });
  await page.mouse.up();
  await sleep(1800);
  await panTo(page, 180, 90, 2600);
  await sleep(2200);
});

// Scene 4 — stewardship: Defense, Skills and Evolve screens.
await scene('gameplay_defend', async (page) => {
  await continueColony(page, PORT);
  await setSpeed(page, 2);
  await page.click('[data-tab="threats"]', { force: true });
  await sleep(3200);
  await page.click('[data-tab="tech"]', { force: true });
  await sleep(2800);
  await page.click('[data-tab="evo"]', { force: true });
  await sleep(2800);
  await page.click('[data-tab="build"]', { force: true });
  await sleep(1200);
});

// ---------------------------------------------------------------------------
// Hero cut-scenes: animated title cards from cutscene.html.
const CUT = (p) => `http://localhost:${PORT}/tools/marketing_video/cutscene.html?${p}`;
const cuts = [
  ['cut_intro',  'title=Neuroster&sub=A+hamster+colony+world-builder&emoji=%F0%9F%90%B9&variant=intro',      9000],
  ['cut_build',  'title=Build.+Automate.+Thrive.&sub=From+first+burrow+to+bustling+town&emoji=%F0%9F%8F%97%EF%B8%8F&variant=build', 7000],
  ['cut_defend', 'title=The+wild+is+watching&sub=Defend+what+you+dig&emoji=%F0%9F%9B%A1%EF%B8%8F&variant=defend', 7000],
  ['cut_outro',  'title=Neuroster&sub=Your+colony.+Your+world.+Start+digging.&emoji=%F0%9F%90%B9&variant=outro', 10000],
];
for (const [name, params, ms] of cuts)
  await scene(name, async (page) => { await page.goto(CUT(params), { waitUntil: 'load' }); await sleep(ms); });

await ctx.close();
await browser.close();
server.kill();
console.log(`All footage in ${OUT}`);
