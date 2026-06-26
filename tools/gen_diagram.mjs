// tools/gen_diagram.mjs — generate a single, data-driven systems-map PNG that
// visually charts the WHOLE game hierarchy: resources (raw → refined chains),
// structures by category, needs + the care actions that serve them, the
// progression web (traits / tech / evolution / doctrines / megaprojects),
// species and the key flows between them. It is built straight from
// `src/config.js`, so re-running it keeps the picture accurate after content
// changes:
//
//   node tools/gen_diagram.mjs
//
// How it works: we author a styled, self-contained HTML page (the game's dark
// palette + emoji icons from config) and screenshot it with the pre-installed
// Chromium via Playwright — a wide, high-DPI page screenshot → the PNG below.
// (Same Chromium-discovery approach as test/browser-smoke.mjs.) If Playwright
// or a Chromium build is missing, we still write the HTML next to the PNG and
// exit cleanly, telling you what to do.
import {
  RESOURCES, BUILDINGS, NODE_TYPES, NEEDS, CARE, TRAITS, TECH, EVOLUTIONS,
  SPECIES, DIFFICULTIES, BIOMES, DOCTRINES, DOCTRINE_BRANCHES, MEGAPROJECTS,
  COAT_COLORS, VERSION,
} from '../src/config.js';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PNG = join(ROOT, 'docs', 'neuroster-systems-map.png');
const OUT_HTML = join(ROOT, 'docs', 'neuroster-systems-map.html');

// --- palette (the in-game look) --------------------------------------------
const PAL = {
  bg: '#1c1a17', panel: '#2a2722', panel2: '#332f29', ink: '#f3ead9',
  muted: '#b8ad99', accent: '#e6b450', good: '#7cdc6a', bad: '#e06b6b',
  line: '#44403a',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ico = (d) => (d && d.icon ? d.icon + ' ' : '');

// A small pill/chip for an entity (icon + label, optional sub-line + tint).
function chip(icon, label, sub, tint) {
  const border = tint ? `border-color:${tint};` : '';
  return `<span class="chip" style="${border}"><b>${icon || ''}</b>${esc(label)}${sub ? `<i>${esc(sub)}</i>` : ''}</span>`;
}

// A titled card section.
function card(title, subtitle, bodyHtml, span = 1) {
  return `<section class="card span${span}">
    <h2>${title}</h2>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
    <div class="body">${bodyHtml}</div>
  </section>`;
}

// --- 1. Resources: raw → refined chains ------------------------------------
function resourcesCard() {
  const raw = [], refined = [], abstract = [];
  for (const [k, d] of Object.entries(RESOURCES)) {
    const c = chip(d.icon, d.name, d.kind === 'refined' && d.nourish ? `food ×${d.nourish}` : '', d.color);
    (d.kind === 'raw' ? raw : d.kind === 'abstract' ? abstract : refined).push(c);
  }
  // Refining chains derived from buildings (consumes → produces).
  const chains = [];
  for (const [, b] of Object.entries(BUILDINGS)) {
    const cons = Object.keys(b.consumes || {}), prod = Object.keys(b.produces || {});
    if (!cons.length || !prod.length) continue;
    const inIco = cons.map((r) => RESOURCES[r]?.icon || r).join(' ');
    const outIco = prod.map((r) => RESOURCES[r]?.icon || r).join(' ');
    chains.push(`<span class="flow">${inIco} <em>${esc(b.icon || '')}${esc(b.name)}</em> → ${outIco}</span>`);
  }
  const nodes = Object.entries(NODE_TYPES).map(([, n]) => chip(n.icon, RESOURCES[n.resource]?.name || n.resource, n.surface ? 'surface' : 'mined', n.color)).join('');
  return card('🧱 Resources', 'Raw gathered · refined (chains) · abstract pools',
    `<h3>Raw (gathered)</h3><div class="row">${raw.join('')}</div>
     <h3>Refined (produced)</h3><div class="row">${refined.join('')}</div>
     <h3>Abstract pools</h3><div class="row">${abstract.join('')}</div>
     <h3>World nodes</h3><div class="row">${nodes}</div>
     <h3>Refining chains (input → structure → output)</h3><div class="chains">${chains.join('')}</div>`, 2);
}

// --- 2. Structures by category ---------------------------------------------
function structuresCard() {
  const byCat = {};
  for (const [, b] of Object.entries(BUILDINGS)) {
    if (b.noBuild) continue;
    (byCat[b.category || 'Other'] ||= []).push(b);
  }
  const order = ['Housing', 'Food', 'Storage', 'Production', 'Extraction', 'Automation', 'Wellbeing', 'Defense'];
  const cats = Object.keys(byCat).sort((a, b) => (order.indexOf(a) + 99 * (order.indexOf(a) < 0)) - (order.indexOf(b) + 99 * (order.indexOf(b) < 0)));
  const blocks = cats.map((cat) => {
    const items = byCat[cat].map((b) => {
      const tag = b.produces ? Object.keys(b.produces).map((r) => RESOURCES[r]?.icon || '').join('') : '';
      return chip(b.icon, b.name, tag, PAL.line);
    }).join('');
    return `<div class="catblock"><h3>${esc(cat)} <span class="count">${byCat[cat].length}</span></h3><div class="row">${items}</div></div>`;
  }).join('');
  return card('🏗️ Structures', 'Every buildable structure, grouped by category', blocks, 2);
}

// --- 3. Needs → Care --------------------------------------------------------
function needsCard() {
  const rows = Object.entries(NEEDS).map(([k, n]) => {
    const servers = Object.entries(CARE).filter(([, c]) => c.need === k).map(([, c]) => `${c.icon} ${c.name}`);
    return `<div class="needrow">${chip(n.icon, n.name, '', PAL.good)}<span class="arrow">served by →</span>${servers.length ? servers.map((s) => `<span class="chip small">${esc(s)}</span>`).join('') : '<i>sustained needs (Infirmary heals)</i>'}</div>`;
  }).join('');
  const care = Object.entries(CARE).map(([, c]) => chip(c.icon, c.name, `+${c.amount} ${c.need}`, PAL.good)).join('');
  return card('🍗 Needs &amp; Care', 'Per-rodent meters and the hands-on actions that serve them',
    `${rows}<h3>Care actions (instant boost · XP · bond)</h3><div class="row">${care}</div>`, 1);
}

// --- 4. Species -------------------------------------------------------------
function speciesCard() {
  const items = Object.entries(SPECIES).map(([, s]) => {
    const tags = [];
    if (s.power) tags.push(`⚡×${s.power}`);
    if (s.build && s.build !== 1) tags.push(`build×${s.build}`);
    if (s.research) tags.push(`🔬×${s.research}`);
    return chip(s.icon, s.name, s.role ? s.role.split(/[—(]/)[0].trim() : '', s.locked ? PAL.muted : PAL.good);
  }).join('');
  const coats = Object.entries(COAT_COLORS).map(([, c]) => `<span class="coat" style="background:${c.body};border-color:${c.belly}" title="${esc(c.name)}"></span>`).join('');
  return card('🐹 Species', 'Your colony — hamster plus recruitable rodents',
    `<div class="row">${items}</div><h3>Founder coat palette</h3><div class="coats">${coats}</div>`, 1);
}

// --- 5. Progression: traits, tech, evolution, doctrines, megaprojects -------
function progressionCard() {
  const traits = Object.entries(TRAITS).map(([, t]) => chip(t.icon, t.name, `+${(t.perLevel * 100) | 0}%/lvl`, PAL.accent)).join('');
  const tech = Object.entries(TECH).map(([, t]) => chip(t.icon, t.name, '', PAL.accent)).join('');
  const evo = Object.entries(EVOLUTIONS).map(([k, e]) => chip(e.icon, e.name, e.req ? `↑${EVOLUTIONS[e.req]?.name || e.req}` : (e.species !== 'all' ? e.species : ''), PAL.accent)).join('');
  const branches = Object.entries(DOCTRINE_BRANCHES).map(([bk, b]) => {
    const docs = Object.entries(DOCTRINES).filter(([, d]) => d.branch === bk).map(([, d]) => `${d.icon} ${d.name}`).join(' · ');
    return `<div class="needrow">${chip(b.icon, b.name, b.virtue, PAL.bad)}<span class="arrow">→</span><i>${esc(docs)}</i></div>`;
  }).join('');
  const mega = Object.entries(MEGAPROJECTS).map(([, m]) => chip(m.icon, m.name, m.blurb, PAL.accent)).join('');
  return card('🌟 Progression', 'XP → levels → skill points; research → tech / evolution / doctrines; surplus → wonders',
    `<h3>Per-rodent traits (skill points)</h3><div class="row">${traits}</div>
     <h3>Colony tech tree (research)</h3><div class="row">${tech}</div>
     <h3>Evolution tree (species-wide, branching)</h3><div class="row">${evo}</div>
     <h3>Doctrines (virtue-gated branches)</h3>${branches}
     <h3>Megaprojects (multi-session wonders)</h3><div class="row">${mega}</div>`, 2);
}

// --- 6. World: biomes & difficulties ---------------------------------------
function worldCard() {
  const biomes = Object.entries(BIOMES).map(([, b]) => chip(b.icon, b.name, '', PAL.line)).join('');
  const diffs = Object.entries(DIFFICULTIES).map(([, d]) => chip(d.icon, d.name, '', PAL.line)).join('');
  return card('🗺️ World', 'Pick a biome &amp; difficulty when starting a colony',
    `<h3>Biomes</h3><div class="row">${biomes}</div><h3>Difficulty</h3><div class="row">${diffs}</div>`, 1);
}

// --- The whole flow rail across the top -------------------------------------
function flowRail() {
  const steps = [
    ['🌳', 'World nodes'], ['🐹', 'Rodents gather'], ['🏗️', 'Build structures'],
    ['⚙️', 'Refine resources'], ['🍗', 'Meet needs'], ['🌟', 'Level &amp; research'],
    ['🧬', 'Evolve &amp; unlock'], ['🛡️', 'Defend &amp; thrive'],
  ];
  return `<div class="rail">${steps.map(([i, l], n) => `<span class="railstep"><b>${i}</b>${l}</span>${n < steps.length - 1 ? '<span class="railsep">→</span>' : ''}`).join('')}</div>`;
}

function buildHtml() {
  const counts = `${Object.keys(BUILDINGS).length} structures · ${Object.keys(RESOURCES).length} resources · ${Object.keys(SPECIES).length} species · ${Object.keys(TECH).length} tech · ${Object.keys(EVOLUTIONS).length} evolutions · ${Object.keys(DOCTRINES).length} doctrines`;
  const grid = [
    resourcesCard(),
    structuresCard(),
    progressionCard(),
    needsCard(),
    speciesCard(),
    worldCard(),
  ].join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; background: ${PAL.bg}; color: ${PAL.ink};
    font-family: 'Segoe UI', system-ui, -apple-system, 'Noto Color Emoji', sans-serif;
    width: 1800px; padding: 36px 40px 44px; }
  header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 14px; }
  header h1 { font-size: 38px; margin: 0; }
  header h1 b { color: ${PAL.accent}; }
  header .ver { color: ${PAL.muted}; font-size: 15px; }
  header .counts { margin-left: auto; color: ${PAL.muted}; font-size: 14px; }
  .rail { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    background: ${PAL.panel}; border: 1px solid ${PAL.line}; border-radius: 12px;
    padding: 12px 16px; margin-bottom: 22px; }
  .railstep { display: inline-flex; align-items: center; gap: 7px; font-size: 16px; font-weight: 600; }
  .railstep b { font-size: 22px; font-weight: 400; }
  .railsep { color: ${PAL.accent}; font-size: 20px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; align-items: start; }
  .card { background: ${PAL.panel}; border: 1px solid ${PAL.line}; border-radius: 14px;
    padding: 16px 18px 18px; }
  .card.span1 { grid-column: span 2; }
  .card.span2 { grid-column: span 4; }
  .card h2 { margin: 0 0 2px; font-size: 22px; }
  .card .sub { margin: 0 0 10px; color: ${PAL.muted}; font-size: 13px; }
  .card h3 { margin: 14px 0 7px; font-size: 14px; color: ${PAL.accent};
    text-transform: uppercase; letter-spacing: .06em; }
  .card h3:first-child, .body > h3:first-child { margin-top: 2px; }
  .row { display: flex; flex-wrap: wrap; gap: 7px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: ${PAL.panel2};
    border: 1px solid ${PAL.line}; border-radius: 9px; padding: 5px 10px; font-size: 14.5px;
    white-space: nowrap; }
  .chip.small { font-size: 13px; padding: 4px 8px; }
  .chip b { font-size: 17px; font-weight: 400; }
  .chip i { color: ${PAL.muted}; font-style: normal; font-size: 12px; }
  .catblock { margin-bottom: 12px; }
  .catblock h3 { display: flex; align-items: center; gap: 8px; }
  .count { background: ${PAL.accent}; color: #2a2107; border-radius: 20px;
    font-size: 11px; padding: 1px 8px; font-weight: 700; }
  .chains { display: flex; flex-wrap: wrap; gap: 8px; }
  .flow { background: ${PAL.panel2}; border: 1px solid ${PAL.line}; border-radius: 9px;
    padding: 6px 11px; font-size: 15px; white-space: nowrap; }
  .flow em { color: ${PAL.accent}; font-style: normal; }
  .needrow { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .needrow .arrow, .arrow { color: ${PAL.muted}; font-size: 12px; }
  .needrow i, .flow + i, i.big { color: ${PAL.ink}; font-style: normal; font-size: 13.5px; }
  .coats { display: flex; gap: 7px; flex-wrap: wrap; }
  .coat { width: 28px; height: 28px; border-radius: 50%; border: 3px solid; display: inline-block; }
  footer { margin-top: 22px; color: ${PAL.muted}; font-size: 12.5px; }
  </style></head><body>
  <header>
    <h1>🐹 <b>Neuroster</b> — Systems Map</h1>
    <span class="ver">${esc(VERSION)}</span>
    <span class="counts">${counts}</span>
  </header>
  ${flowRail()}
  <div class="grid">${grid}</div>
  <footer>Auto-generated from <code>src/config.js</code> by <code>tools/gen_diagram.mjs</code> — run <code>node tools/gen_diagram.mjs</code> to refresh. Raw → refined chains, structures by category, needs &amp; care, species, and the full progression web (traits · tech · evolution · doctrines · megaprojects).</footer>
  </body></html>`;
}

// --- Chromium discovery (mirrors test/browser-smoke.mjs) --------------------
function findChromium() {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH))
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  const dirs = readdirSync(base).filter((d) => /^chromium(-|_)/.test(d)).sort().reverse();
  // Prefer a full chromium (which renders colour emoji); fall back to the shell.
  const ordered = dirs.sort((a, b) => (a.includes('headless') ? 1 : 0) - (b.includes('headless') ? 1 : 0));
  for (const d of ordered)
    for (const exe of [`${base}/${d}/chrome-linux/chrome`, `${base}/${d}/chrome-linux/headless_shell`])
      if (existsSync(exe)) return exe;
  return null;
}

const html = buildHtml();
writeFileSync(OUT_HTML, html, 'utf8');

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('[gen_diagram] playwright-core not installed — wrote HTML only:', OUT_HTML); process.exit(0); }
const executablePath = findChromium();
if (!executablePath) { console.log('[gen_diagram] no Chromium found — wrote HTML only:', OUT_HTML); process.exit(0); }

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--force-color-profile=srgb'] });
const page = await browser.newPage({ deviceScaleFactor: 2 }); // 2× for a crisp, high-res PNG
await page.setViewportSize({ width: 1800, height: 1200 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(250); // let emoji/fonts settle
const el = await page.$('body');
await el.screenshot({ path: OUT_PNG });
const box = await el.boundingBox();
await browser.close();
console.log(`[gen_diagram] wrote ${OUT_PNG} (${Math.round(box.width)}×${Math.round(box.height)} CSS px @2× → ${Math.round(box.width * 2)}×${Math.round(box.height * 2)} px)`);
