// tools/gen_systems.mjs — generate SYSTEMS.md: a flow map of resources,
// structures, animals & skills, plus a balancing table of every building's
// cost / inputs / outputs. Regenerate after editing src/config.js:
//
//   node tools/gen_systems.mjs
//
// Data-driven from src/config.js so the quantities stay accurate (use it to
// balance: see at a glance what each structure costs, consumes and produces).
// The conceptual diagrams (virtues, progression) are hand-authored below.
import { RESOURCES, BUILDINGS, SPECIES, FACTIONS } from '../src/config.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ico = (k, map) => (map[k]?.icon ? map[k].icon + ' ' : '');
const resIco = (k) => ico(k, RESOURCES) + (RESOURCES[k]?.name || k);
const pairs = (o) => Object.entries(o || {}).map(([k, v]) => `${ico(k, RESOURCES)}${k} ${v}`).join(', ') || '—';

// Mermaid id-safe token.
const nid = (s) => s.replace(/[^A-Za-z0-9]/g, '_');

const L = [];
const p = (s = '') => L.push(s);

p('# 🐹 Neuroster — Systems & Flow Map');
p('');
p('> **Auto-generated** from [`src/config.js`](./src/config.js) by');
p('> [`tools/gen_systems.mjs`](./tools/gen_systems.mjs) — run `node tools/gen_systems.mjs`');
p('> to refresh after a content change. It maps how **resources**, **structures**,');
p('> **animals** and **skills** connect, and tabulates the **quantities** each');
p('> structure costs / consumes / produces (use it for balancing). The conceptual');
p('> diagrams (virtues, progression) are hand-authored at the bottom.');
p('');
p('GitHub renders the Mermaid diagrams below. This map is meant to be folded into');
p('the in-game **Help / How-to-Play** (icons + colour) as it firms up.');
p('');
p('> 🗺️ **At-a-glance picture:** [`docs/neuroster-systems-map.png`](./docs/neuroster-systems-map.png)');
p('> — a single styled PNG charting the whole hierarchy (resources, structures,');
p('> needs/care, species, progression). Regenerate with `node tools/gen_diagram.mjs`.');
p('');

// --------------------------------------------------------------------------- //
// 1. Resource production graph (data-driven from consumes/produces).            //
// --------------------------------------------------------------------------- //
p('## 1. Resource flow (what makes what)');
p('');
p('Boxes are **structures**; rounded nodes are **resources**. An arrow into a');
p('structure is an input it consumes; an arrow out is what it produces.');
p('');
p('```mermaid');
p('flowchart LR');
const usedRes = new Set();
const edge = [];
for (const [key, def] of Object.entries(BUILDINGS)) {
  const cons = def.consumes || {};
  const prod = def.produces || {};
  if (!Object.keys(cons).length && !Object.keys(prod).length) continue;
  const bId = 'B_' + nid(key);
  p(`  ${bId}["${def.icon || ''} ${def.name}"]`);
  for (const r of Object.keys(cons)) { usedRes.add(r); edge.push(`  R_${nid(r)} -->|${cons[r]}| ${bId}`); }
  for (const r of Object.keys(prod)) { usedRes.add(r); edge.push(`  ${bId} -->|${prod[r]}| R_${nid(r)}`); }
}
// Raw resources come from gathered nodes / mines (not buildings) — note them.
for (const r of usedRes) p(`  R_${nid(r)}(["${resIco(r)}"])`);
edge.forEach(e => p(e));
p('```');
p('');
p('_Raw materials (🪵 wood, 🪨 stone, ⛰️ ore, ⚫ coal, 🌱 seeds, 💧 water) are gathered');
p('from world nodes by rodents (trees/rocks/bushes) or **Mines** (ore/coal); 💩 manure');
p('comes from droppings (Composter) & burrow cleaning; ⚡ power from wheels/wind/water/coal._');
p('');

// --------------------------------------------------------------------------- //
// 1b. Sources — where each resource comes from.                                //
// --------------------------------------------------------------------------- //
p('## 1b. Sources — where each resource comes from');
p('');
// Raw / world sources that aren't a building's `produces`.
const RAW_SOURCE = {
  wood: 'gathered from 🌳 tree nodes (Beavers keep their own store)',
  stone: 'gathered from 🪨 rock nodes',
  ironore: 'dug from ⛰️ ore seams by a **Mine**',
  coal: 'dug from ⚫ coal seams by a **Mine**',
  seeds: 'gathered from 🌳 bushes',
  water: 'rain/storms (more with 🛢️ Cisterns); rivers/ponds',
  manure: 'droppings → ♻️ Composter; cleaning a burrow/house',
  food: 'starting stores; foraged; squirrel gifts',
};
const producedBy = {};
for (const [key, def] of Object.entries(BUILDINGS))
  for (const r of Object.keys(def.produces || {})) (producedBy[r] ||= []).push(`${def.icon || ''} ${def.name}`);
p('| Resource | Sources (raw + structures) |');
p('|---|---|');
for (const k of Object.keys(RESOURCES)) {
  const src = [];
  if (RAW_SOURCE[k]) src.push(RAW_SOURCE[k]);
  if (producedBy[k]) src.push(...producedBy[k]);
  p(`| ${resIco(k)} | ${src.join('; ') || '—'} |`);
}
p('');

// --------------------------------------------------------------------------- //
// 2. Structures balancing table.                                               //
// --------------------------------------------------------------------------- //
p('## 2. Structures — cost / consumes / produces (balancing)');
p('');
const byCat = {};
for (const [key, def] of Object.entries(BUILDINGS)) (byCat[def.category || 'Other'] ||= []).push([key, def]);
const effectOf = (def) => {
  const e = [];
  if (def.storage) e.push(`+${def.storage} storage`);
  if (def.popCap) e.push(`+${def.popCap} housing`);
  if (def.defense) e.push(`+${def.defense} defense`);
  if (def.curiosity) e.push(`+${def.curiosity} fun`);
  if (def.health) e.push(`+${def.health} health`);
  if (def.feeder) e.push('auto-feed');
  if (def.waterer) e.push('auto-water');
  if (def.caretaker) e.push('caretaker');
  if (def.composter) e.push('droppings→manure');
  if (def.statue) e.push('morale + compassion');
  if (def.tree) e.push('tree (forest)');
  if (def.mine) e.push('mines ore/coal');
  if (def.belt) e.push('auto-haul');
  if (def.wall || def.tunnel || def.bridge) e.push('tiered fort (HP, upgradeable)');
  if (def.tower) e.push('vision / defense stances');
  if (def.solar) e.push('sun-driven');
  if (def.upstreamPenalty) e.push('dams the river');
  if (def.pollutes) e.push(`pollutes ${def.pollutes}`);
  if (def.needsWater) e.push('build near water');
  return e.join('; ') || '';
};
for (const cat of Object.keys(byCat).sort()) {
  p(`### ${cat}`);
  p('');
  p('| Structure | Cost | Consumes | Produces | Effect |');
  p('|---|---|---|---|---|');
  for (const [, def] of byCat[cat]) {
    p(`| ${def.icon || ''} ${def.name} | ${pairs(def.cost)} | ${pairs(def.consumes)} | ${pairs(def.produces)} | ${effectOf(def)} |`);
  }
  p('');
}

// --------------------------------------------------------------------------- //
// 3. Resources table.                                                          //
// --------------------------------------------------------------------------- //
p('## 3. Resources');
p('');
p('| Resource | Kind | Notes |');
p('|---|---|---|');
for (const [k, d] of Object.entries(RESOURCES)) {
  const notes = [];
  if (d.nourish) notes.push(`food (nourish ×${d.nourish})`);
  if (d.kind === 'abstract') notes.push('not stored (pool)');
  p(`| ${d.icon || ''} ${d.name} | ${d.kind} | ${notes.join(', ')} |`);
}
p('');

// --------------------------------------------------------------------------- //
// 4. Animals.                                                                  //
// --------------------------------------------------------------------------- //
p('## 4. Animals');
p('');
p('### Rodent species (your colony)');
p('');
p('| Species | Speed | Carry | Mine | Build | Special |');
p('|---|---|---|---|---|---|');
for (const [, s] of Object.entries(SPECIES)) {
  const sp = [];
  if (s.power) sp.push(`power ×${s.power}`);
  if (s.def || s.atk) sp.push(`def ${s.def || 0}/atk ${s.atk || 0}`);
  if (s.repair) sp.push(`repair ×${s.repair}`);
  if (s.research) sp.push(`research ×${s.research}`);
  p(`| ${s.icon || ''} ${s.name} | ${s.speed} | ${s.carry} | ${s.mine} | ${s.build || 1} | ${(s.role || '') + (sp.length ? ' (' + sp.join(', ') + ')' : '')} |`);
}
p('');
p('- **🦫 Beavers** also build Dams and keep their **own wood store** (hamsters tap it');
p('  when wood is low — over-tap them and they sabotage the water works).');
p('- **🐿️ Squirrels** are drawn by **🌰 Oaks & Nuts**: a kind colony trades, a hoard gets');
p('  raided; friendly squirrels speed up timber builds.');
p('');
p('### Neighbouring factions (trade / raid)');
p('');
p('| Faction | Covets | Offers |');
p('|---|---|---|');
for (const [, f] of Object.entries(FACTIONS)) {
  p(`| ${f.icon || ''} ${f.name} | ${(f.covets || []).map(resIco).join(', ') || '—'} | ${f.offers ? resIco(f.offers) : '—'} |`);
}
p('');

// --------------------------------------------------------------------------- //
// 4b. Modifiers (+/−) — what raises and lowers each output (for balancing).    //
// --------------------------------------------------------------------------- //
p('## 4b. Modifiers (+ / −) — what tunes each output');
p('');
p('The sim multiplies a base rate by these. Use it to balance: if an output feels');
p('off, this is the list of levers acting on it. (Hand-authored from the per-tick');
p('order in [`src/economy.js`](./src/economy.js); keep it in sync as systems change.)');
p('');
p('| Output | Raised by (+) | Lowered by (−) |');
p('|---|---|---|');
const MOD = [
  ['🌾 Farm food yield', 'fertile ground (near water), stored 🪴 fertilizer, post-flood silt, leadership (Town Hall), spring/harvest season', '🏭 pollution (smog), drought/snow/winter, distraction'],
  ['⚙️ Production / refining (all)', 'leadership, megaprojects (prodMul), doctrines, abundant ⚡ power', 'builders busy (labour diverted), low wellbeing/needs, power shortage, distraction (play wheels/maze)'],
  ['⛏️ Gather / mine rate', 'per-rodent 💪 strength & 🪨 mine traits, levels, species mine stat, evolutions, day/night alignment', 'few free hands (builders busy), low needs/health, sickness (wet-tail)'],
  ['🍗 Per-rodent need drain', '— (faster) hot/humid/winter weather, crowding', '🔋 Vigor trait, needRetain evolutions, feeders/waterers/caretakers'],
  ['💧 Water flow', '🛢️ Cisterns (rain capture), rain/storm weather, ⛲ Wells / 🛞 Water Mills', '🦫 dams (upstream), grumpy beavers (sabotage), drought'],
  ['⚡ Power', 'wheels, 🌬️ Windmill (wind/storm), 🛞 Water Mill, 🔆 Solar (sun), 🏭 Coal Plant', 'night/fog/snow (solar), calm (windmill), upstream dams (hydro)'],
  ['🛡️ Defense', 'walls/fences/towers (DEFEND), guard species (guinea pig), 🏛️ Citadel, War doctrines', 'wood forts burn/wash (wildfire/flood), damaged HP'],
  ['👶 Breeding', 'burrows, leadership, Sacrifice doctrine, megaprojects, spring', 'degraded/dirty burrows, resentment (too-lavish Town Hall), winter, low food'],
  ['😊 Morale', 'tiered burials, Hall of Heroes, festivals, statues, high 🦁 Valor, leadership, Almshouse goodwill', 'unburied dead, untreated injuries, lethal defense, militarised (DEFEND) towers, ignored decrees'],
  ['🏭 Pollution', 'coal industry (coal plant, smelter, steelworks, refinery, electric wheel)', '🌳 forests (scrub), natural decay, clean power'],
  ['🐿️ Squirrel pressure', '🌰 oaks, a 🌰 nut hoard', '(spend nuts via trade; clears after a visit)'],
  ['🦫 Beaver mood', 'keeping colony 🪵 wood stocked (store left to rebuild)', 'tapping their store too often (chronic wood shortage)'],
];
for (const [o, up, dn] of MOD) p(`| ${o} | ${up} | ${dn} |`);
p('');

// --------------------------------------------------------------------------- //
// 5. Virtues & progression (hand-authored — not a simple config extract).      //
// --------------------------------------------------------------------------- //
p('## 5. Virtues, morale & doctrines');
p('');
p('```mermaid');
p('flowchart TD');
p('  care["💗 care · gifts · mercy · rescues · burials"] --> C[💗 Compassion]');
p('  law["⚖️ fair verdicts · Courthouse · order"] --> J[⚖️ Justice]');
p('  fight["🦁 winning fights · standing firm"] --> V[🦁 Valor]');
p('  C --> calm[calms predators · draws joiners]');
p('  J --> deter[deters raids]');
p('  V --> proud[fierce & proud: morale + spark]');
p('  C --> DocC["🎓 Doctrines: Negotiation · Sacrifice"]');
p('  J --> DocJ["🎓 Doctrines: Stoicism"]');
p('  V --> DocV["🎓 Doctrines: War Strategy"]');
p('  dead["💀 unburied dead · untreated injuries"] --> M[😊 Morale]');
p('  burial["⚰️ tiered burials · Hall of Heroes · festivals"] --> M');
p('  M --> output[output · loyalty · breeding]');
p('  decree["⚖️ Decree dilemmas"] -. spend one virtue to buy another .-> C & J');
p('```');
p('');
p('## 6. Progression & skills');
p('');
p('```mermaid');
p('flowchart LR');
p('  work[work · fights] --> XP[⭐ XP]');
p('  XP --> LV[levels] --> SP[skill points]');
p('  SP --> traits["per-rodent traits: 💪 strength · 🔋 vigor · 💨 speed · 📦 capacity · 🧠 wit …"]');
p('  labs[🔬 labs · milestones] --> RES[Research]');
p('  RES --> tech["colony Tech tree (mods) + species unlocks"]');
p('  RES --> evo["Evolution tree (species-wide)"]');
p('  RES --> DOC["🎓 Doctrines (virtue-gated)"]');
p('  surplus[surplus materials] --> MEGA["🏛️ Megaprojects (multi-session wonders)"]');
p('```');
p('');
p('---');
p('');
p(`_Generated from \`src/config.js\` — ${Object.keys(BUILDINGS).length} structures, ${Object.keys(RESOURCES).length} resources, ${Object.keys(SPECIES).length} species. Run \`node tools/gen_systems.mjs\` to refresh._`);
p('');

writeFileSync(join(ROOT, 'SYSTEMS.md'), L.join('\n'), 'utf8');
console.log(`[gen_systems] wrote SYSTEMS.md (${L.length} lines, ${Object.keys(BUILDINGS).length} structures)`);
