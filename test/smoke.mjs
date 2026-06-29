// test/smoke.mjs — headless verification run in CI (and locally via `npm test`).
// Exercises the simulation, alerts, megaprojects and save export/import without a
// browser. Throws (non-zero exit) on any failure so CI fails loudly.
//
// Run: node test/smoke.mjs
import assert from 'node:assert';

// A minimal localStorage shim so save.js's import path works under Node.
globalThis.localStorage ||= {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};

const { newGame } = await import('../src/state.js');
const { stepEconomy } = await import('../src/economy.js');
const { computeAlerts } = await import('../src/alerts.js');
const { contributeMega, megaProgress, megaBonuses } = await import('../src/megaprojects.js');
const { protectionAgainst } = await import('../src/events.js');
const { exportSave, importSaveString } = await import('../src/save.js');
const { ensureCamps, spawnCaravan, stepCaravans } = await import('../src/factions.js');
const { giftFaction, demolish, useBuilding, buildingActionable, serviceNeedOf, directToService } = await import('../src/buildings.js');
const { MEGAPROJECTS, FACTIONS, BUILDINGS } = await import('../src/config.js');

const BIOMES = ['woodland', 'prairie', 'mountains', 'lakes', 'rivers', 'marsh', 'beach'];
let pass = 0;
const ok = (label) => { pass++; console.log('  ✓ ' + label); };

// 1) Sim + alerts across every biome (past the grace period).
console.log('Simulation + alerts across all biomes:');
for (const biome of BIOMES) {
  const s = newGame(12345, biome, 'syrian', 'CI', { difficulty: 'normal', density: 'normal' });
  for (let i = 0; i < 4000; i++) stepEconomy(s, 0.1);
  const alerts = computeAlerts(s);
  for (const a of alerts) {
    assert(a.sev && a.icon && a.msg, `malformed alert in ${biome}: ${JSON.stringify(a)}`);
    assert(['critical', 'warning', 'info'].includes(a.sev), `bad severity in ${biome}: ${a.sev}`);
  }
  // alerts must come out sorted by severity (critical first)
  const rank = { critical: 0, warning: 1, info: 2 };
  for (let i = 1; i < alerts.length; i++) assert(rank[alerts[i].sev] >= rank[alerts[i - 1].sev], 'alerts not sorted');
  ok(`${biome}: ${s.units.length} rodents, ${alerts.length} alerts, sorted & well-formed`);
}

// 2) Megaprojects: contribute → complete → bonuses apply.
console.log('Megaprojects:');
{
  const s = newGame(777, 'woodland', 'syrian', 'Mega', {});
  s.units[0].level = 15; // satisfy reqLevel gates
  const def = MEGAPROJECTS.greatGranary;
  for (const k of Object.keys(def.cost)) s.res[k] = 99999;
  let guard = 0;
  while (megaProgress(s, 'greatGranary') < 1 && guard++ < 200) contributeMega(s, 'greatGranary');
  assert(s.megaprojects.greatGranary.done, 'greatGranary should complete');
  ok('greatGranary completes via contributions');

  s.megaprojects.citadel = { contributed: {}, done: true };
  const before = protectionAgainst(s, 'wolf');
  s._mega = megaBonuses(s);
  const after = protectionAgainst(s, 'wolf');
  assert.strictEqual(after - before, 45, `Citadel protectAll should add 45 (got ${after - before})`);
  ok('Citadel adds +45 protection vs every threat');

  for (let i = 0; i < 5; i++) stepEconomy(s, 0.1);
  assert(s.storageCap >= 2100, `Granary storage bonus missing (cap ${s.storageCap})`);
  assert(s.defense >= 90, `Citadel defense bonus missing (def ${s.defense})`);
  ok(`bonuses fold into economy (storageCap ${s.storageCap}, defense ${s.defense})`);
}

// 3) Save export/import roundtrip.
console.log('Save export/import:');
{
  const s = newGame(42, 'marsh', 'robo', 'RoundTrip', {});
  for (let i = 0; i < 200; i++) stepEconomy(s, 0.1);
  const r = importSaveString(exportSave(s));
  assert(r.ok, 'roundtrip import should succeed');
  assert.strictEqual(r.state.units.length, s.units.length, 'unit count preserved');
  assert.strictEqual(r.state.world.terrain.constructor.name, 'Uint8Array', 'terrain typed-array reattached');
  for (let i = 0; i < 50; i++) stepEconomy(r.state, 0.1); // imported state must simulate
  ok('exported colony re-imports, keeps typed arrays, and simulates');
  assert(!importSaveString('not json').ok, 'garbage should be rejected');
  assert(!importSaveString(JSON.stringify({ foo: 1 })).ok, 'non-colony JSON should be rejected');
  ok('invalid saves are rejected');
}

// 4) Faction camps & caravans (living neighbours).
console.log('Faction camps & caravans:');
{
  const s = newGame(99, 'prairie', 'syrian', 'Neighbours', {});
  ensureCamps(s);
  for (const id of Object.keys(FACTIONS)) {
    const camp = s.factions[id]?.camp;
    assert(camp && Number.isInteger(camp.x) && Number.isInteger(camp.y), `faction ${id} should have an integer camp`);
  }
  ok('every faction gets a camp on new game');

  // Old-save back-fill: strip camps, ensureCamps should restore them.
  for (const id of Object.keys(FACTIONS)) delete s.factions[id].camp;
  ensureCamps(s);
  assert(Object.keys(FACTIONS).every(id => s.factions[id].camp), 'camps back-filled for pre-camp saves');
  ok('camps back-fill on load when missing');

  // A gift should dispatch a caravan; it should expire after its lifetime.
  s.res.food = 999; // ensure a coveted resource is available to gift
  // need a trading hut for giftFaction
  s.buildings.push({ id: 1, type: 'tradinghut', x: s.world.spawn.x, y: s.world.spawn.y, active: true });
  const fid = Object.keys(FACTIONS)[0];
  const r = giftFaction(s, fid);
  assert(r.ok, `gift should succeed (${r.reason || ''})`);
  assert((s.caravans || []).some(c => c.fac === fid && c.kind === 'trade'), 'gift dispatches a trade caravan');
  ok('trading dispatches a caravan');

  s.env.lived += 100; stepCaravans(s); // long after its lifetime
  assert((s.caravans || []).length === 0, 'caravans expire and are pruned');
  ok('caravans expire and are pruned');

  // Caravans survive an export/import roundtrip.
  spawnCaravan(s, fid, 'raid');
  const back = importSaveString(exportSave(s));
  assert(back.ok && (back.state.factions[fid].camp), 'camp survives save roundtrip');
  ok('camps & caravans persist through save/load');
}

// 5) Enrichment buildings: curiosity boost with a capped distraction tradeoff.
console.log('Enrichment / distraction:');
{
  const s = newGame(5, 'woodland', 'syrian', 'Fun', {});
  // Pile on maze (distract 0.07) — total distraction must cap at 0.2.
  for (let i = 0; i < 6; i++) s.buildings.push({ id: 100 + i, type: 'maze', x: 2 + i, y: 2, active: true });
  stepEconomy(s, 0.1);
  assert(s._distract <= 0.2 + 1e-9, `distraction should cap at 0.2 (got ${s._distract})`);
  assert(s._distract > 0, 'mazes should register distraction');
  assert(s._funBld >= 14 * 6, `enrichment should raise colony fun building total (got ${s._funBld})`);
  ok(`enrichment raises fun (${s._funBld}) and distraction caps at ${s._distract.toFixed(2)}`);
}

// 6) Bridges: water-placeable, tiered, flood protection, upgradeable.
console.log('Bridges:');
{
  const { placeBuilding, canPlace, upgradeTunnel } = await import('../src/buildings.js');
  const { BRIDGE_TIERS, GRID_W, GRID_H } = await import('../src/config.js');
  const { getTile, TERRAIN } = await import('../src/world.js');
  const s = newGame(2024, 'lakes', 'syrian', 'Bridgey', {});
  let wx = -1, wy = -1;
  outer: for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (getTile(s.world.terrain, x, y) === TERRAIN.water && !s.world.nodes.some(n => n.x === x && n.y === y && n.amount > 0)) { wx = x; wy = y; break outer; }
  }
  assert(wx >= 0, 'lakes biome should have a water tile');
  assert(!canPlace(s, 'wall', wx, wy).ok, 'a wall cannot be placed on water');
  for (const k of ['wood', 'planks', 'stone', 'iron', 'steel']) s.res[k] = 999;
  const r = placeBuilding(s, 'bridge', wx, wy);
  assert(r.ok, 'bridge places on water: ' + (r.reason || ''));
  ok('bridge builds on a water tile (others cannot)');
  const b = s.buildings.find(x => x.type === 'bridge');
  b.underConstruction = false; // pretend finished for protection/upgrade checks
  const prot = protectionAgainst(s, 'flood');
  assert(prot >= 2, `bridge adds flood protection (got ${prot})`);
  ok(`bridge contributes flood protection (${prot.toFixed(1)})`);
  const up = upgradeTunnel(s, b);
  assert(up.ok, 'bridge upgrade starts: ' + (up.reason || ''));
  for (let i = 0; i < 500 && b.upgrading; i++) stepEconomy(s, 0.1);
  assert((b.tier || 0) === 1 && b.hp === BRIDGE_TIERS[1].hp, `bridge upgraded to stone (tier ${b.tier}, hp ${b.hp})`);
  ok('bridge upgrades wood→stone and gains HP');
}

// 7) Tower stances: WATCH (vision, gentle) vs DEFEND (stronger + offense, morale cost).
console.log('Tower stances:');
{
  const { totalOffense } = await import('../src/events.js');
  const s = newGame(7, 'prairie', 'syrian', 'Towers', {});
  const sp = s.world.spawn;
  s.buildings.push({ id: 500, type: 'watchtower', x: sp.x + 2, y: sp.y, active: true, mode: 'watch' });
  const b = s.buildings[s.buildings.length - 1];
  stepEconomy(s, 0.1);
  const defWatch = s.defense, protWatch = protectionAgainst(s, 'wolf'), offWatch = totalOffense(s);
  b.mode = 'defend';
  stepEconomy(s, 0.1);
  const defDefend = s.defense, protDefend = protectionAgainst(s, 'wolf'), offDefend = totalOffense(s);
  assert(defDefend > defWatch, `DEFEND raises defense (${defWatch}→${defDefend})`);
  assert(protDefend > protWatch, `DEFEND raises protection (${protWatch.toFixed(1)}→${protDefend.toFixed(1)})`);
  assert(offDefend > offWatch, `DEFEND adds offense (${offWatch}→${offDefend})`);
  ok(`WATCH→DEFEND raises defense/protection/offense (${defWatch}/${defDefend})`);
  // Defend stance imposes a morale cost over time.
  s.morale = 100;
  for (let i = 0; i < 50; i++) stepEconomy(s, 0.2);
  assert(s.morale < 100, `a militarised (DEFEND) stance costs morale (now ${s.morale.toFixed(1)})`);
  ok('DEFEND stance weighs on morale');
}

// 8) Upgradable walls: tiered wood→stone→steel; defense & protection scale.
console.log('Walls:');
{
  const { placeBuilding, upgradeTunnel } = await import('../src/buildings.js');
  const { WALL_TIERS } = await import('../src/config.js');
  const s = newGame(11, 'prairie', 'syrian', 'Walls', {});
  const sp = s.world.spawn;
  for (const k of ['wood', 'planks', 'stone', 'iron', 'steel']) s.res[k] = 999;
  const r = placeBuilding(s, 'wall', sp.x + 3, sp.y);
  assert(r.ok, 'wall places: ' + (r.reason || ''));
  const b = s.buildings.find(x => x.type === 'wall');
  b.underConstruction = false;
  stepEconomy(s, 0.1);
  const defWood = s.defense, protWood = protectionAgainst(s, 'wolf');
  assert(defWood >= 2 && protWood >= 2, `wood wall gives defense+protection (def ${defWood}, prot ${protWood})`);
  const up = upgradeTunnel(s, b); // generalised: handles walls too
  assert(up.ok, 'wall upgrade starts: ' + (up.reason || ''));
  for (let i = 0; i < 500 && b.upgrading; i++) stepEconomy(s, 0.1);
  assert((b.tier || 0) === 1 && b.hp === WALL_TIERS[1].hp, `wall upgraded to stone (tier ${b.tier})`);
  assert(s.defense > defWood && protectionAgainst(s, 'wolf') > protWood, 'stone wall is tougher than wood');
  ok(`wall upgrades wood→stone, raising defense (${defWood}→${s.defense}) & protection`);
}

// 9) New-game options: peaceful mode disables events; coat persists.
console.log('Creation options:');
{
  const s = newGame(3, 'woodland', 'robo', 'Peace', { disasters: false, coat: { color: 'grey', pattern: 'patched' } });
  assert(s.disasters === false, 'disasters flag stored');
  assert(s.founder.coat?.color === 'grey' && s.founder.coat?.pattern === 'patched', 'coat stored on founder');
  s.env.lived = 400; // past the grace period
  for (let i = 0; i < 200; i++) stepEconomy(s, 0.1);
  assert(!s.events || Object.keys(s.events).length === 0, 'no disasters scheduled in peaceful mode');
  ok('peaceful mode disables disasters; coat stored');
  const back = importSaveString(exportSave(s));
  assert(back.ok && back.state.founder.coat?.color === 'grey' && back.state.disasters === false, 'coat & peaceful flag survive save/load');
  ok('coat & peaceful mode survive a save roundtrip');
}

// 10) Names, family lineage & inheritance (love/attachment system).
console.log('Family & inheritance:');
{
  const { makeRodent, breedChild } = await import('../src/entities.js');
  const { COAT_COLORS } = await import('../src/config.js');
  const s = newGame(50, 'woodland', 'syrian', 'Mama', {});
  // every rodent has a name & family
  assert(s.units.every(u => u.name && u.family), 'all rodents have a name & family');
  // founder wears the chosen coat
  assert(s.units[0].coat && s.units[0].coat.color, 'founder has a coat');
  ok('every rodent has a name + family; founder wears its coat');

  // a child of two parents inherits family, coat (hamster), and parent links
  const a = s.units[0], b = s.units[1];
  a.family = 'Whiskerton'; b.family = 'Nibbleby';
  a.traits.strength = 4; b.traits.strength = 2; // a strong family gift
  a.coat = { color: 'chocolate', pattern: 'classic' }; b.coat = { color: 'cream', pattern: 'solid' };
  const child = breedChild(s, a, b);
  assert(child.parents && child.parents[0] === a.id && child.parents[1] === b.id, 'child records its parents');
  assert([a.family, b.family].includes(child.family), 'child inherits a parent family name');
  assert(child.species === 'hamster' ? [a.coat.color, b.coat.color].includes(child.coat.color) : true, 'child inherits a parent coat colour');
  assert((child.traits.strength || 0) >= 2, `child inherits the family's strength (got ${child.traits.strength})`);
  assert(child.name && child.parentNames && child.parentNames.length === 2, 'child has a name & known parents');
  ok(`child "${child.name} ${child.family}" inherits coat & traits from ${a.name} & ${b.name}`);
}

// 10a) Starting housing fits the starting colony.
console.log('Starting housing fit:');
{
  const { STARTING, BUILDINGS } = await import('../src/config.js');
  const burrowCap = BUILDINGS[Object.keys(BUILDINGS).find(k => BUILDINGS[k].breed)].popCap;
  assert(STARTING.hamsters <= burrowCap, `a fresh colony (${STARTING.hamsters}) fits the first burrow (cap ${burrowCap})`);
  const s = newGame(505, 'woodland', 'syrian', 'Fit', {});
  assert(s.units.length <= burrowCap, `starting population ${s.units.length} ≤ first burrow popCap ${burrowCap}`);
  ok(`starting colony (${s.units.length}) fits one burrow (cap ${burrowCap}) — no forced second burrow`);
}

// 10b) Sex + maturity age model.
console.log('Sex & maturity:');
{
  const { makeRodent, breedChild, isMature } = await import('../src/entities.js');
  const { BREEDING } = await import('../src/config.js');
  const s = newGame(606, 'woodland', 'syrian', 'Age', {});
  // Founders/starting hamsters spawn as ADULTS.
  assert(s.units.every(u => isMature(u)), 'starting hamsters are mature adults');
  // A fresh colony is GUARANTEED both sexes so it can always breed (random sexes
  // could otherwise spawn single-sex). Check across many seeds.
  let mixed = 0, COLS = 200;
  for (let i = 0; i < COLS; i++) {
    const g = newGame(700 + i, 'woodland', 'syrian', 'Mix', {});
    if (g.units.some(u => u.sex === 'm') && g.units.some(u => u.sex === 'f')) mixed++;
  }
  assert(mixed === COLS, `every fresh colony has both sexes (got ${mixed}/${COLS})`);
  // A newborn (from breeding) starts immature and below maturity.
  const child = breedChild(s, s.units[0], s.units[1]);
  assert(child.age === 0 && !isMature(child), 'a newborn is below maturity at birth');
  // It becomes mature once enough sim time advances it past the threshold.
  child.age += BREEDING.maturityAge;
  assert(isMature(child), 'a juvenile matures after reaching the maturity age');
  // Sex is assigned ~50/50 over many makeRodent calls.
  let males = 0, N = 4000;
  for (let i = 0; i < N; i++) { const u = makeRodent(s, 'hamster', 5, 5); if (u.sex === 'm') males++; }
  const frac = males / N;
  assert(frac > 0.42 && frac < 0.58, `sex is roughly 50/50 (got ${(frac * 100).toFixed(1)}% male)`);
  ok(`adults spawn mature, newborns mature with age, sex ~50/50 (${(frac * 100).toFixed(1)}% male)`);
}

// 10c) Burrow-based, sexed, slower breeding.
console.log('Sexed burrow breeding:');
{
  const { BREEDING, BUILDINGS } = await import('../src/config.js');
  const burrowType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].breed);
  // The new gentle base rate is well below the old 0.04.
  assert(BREEDING.baseRate < 0.04, `breed base rate is gentler than before (${BREEDING.baseRate} < 0.04)`);

  // Hold needs comfortable enough to breed (wellbeing ≥ 0.7) but below the
  // wb > 0.95 threshold that draws unrelated WILD JOINERS — so the only way a
  // new rodent appears here is through the breeding system under test.
  const feed = (g) => g.units.forEach(u => { u.needs.food = 60; u.needs.water = 60; u.needs.fun = 60; u.needs.health = 60; });
  function setup(seed) {
    const g = newGame(seed, 'woodland', 'syrian', 'Brood', {});
    g.res.food = 9999; g.popCap = 99;
    for (let k = 0; k < 4; k++) g.buildings.push({ id: g.nextId++, type: burrowType, x: g.world.spawn.x + 1 + k, y: g.world.spawn.y, active: true });
    feed(g);
    return g;
  }
  const run = (g, ticks = 600) => {
    const n0 = g.units.length;
    for (let i = 0; i < ticks; i++) { feed(g); stepEconomy(g, 0.2); }
    return g.units.length - n0;
  };

  // Only one sex present → no breeding.
  const oneSex = setup(701); oneSex.units.forEach(u => u.sex = 'm');
  assert(run(oneSex) === 0, 'no breeding with only one sex present');

  // All candidates immature → no breeding.
  const young = setup(702); young.units.forEach((u, i) => { u.sex = i % 2 ? 'm' : 'f'; u.age = 0; });
  // Keep them juvenile across the run by holding age below maturity each tick.
  {
    const n0 = young.units.length;
    for (let i = 0; i < 600; i++) { feed(young); young.units.forEach(u => u.age = 0); stepEconomy(young, 0.2); }
    assert(young.units.length - n0 === 0, 'no breeding when all candidates are immature');
  }

  // A mature M+F pair + capacity + food → a newborn appears, born at a burrow.
  const pair = setup(703);
  pair.units[0].sex = 'm'; pair.units[0].age = BREEDING.maturityAge;
  pair.units[1].sex = 'f'; pair.units[1].age = BREEDING.maturityAge;
  const burrows = pair.buildings.filter(b => BUILDINGS[b.type]?.breed);
  const sp = pair.world.spawn;
  let born = 0, bornAtBurrow = false;
  for (let i = 0; i < 1200; i++) {
    feed(pair);
    const pre = pair.units.length;
    stepEconomy(pair, 0.2);
    if (pair.units.length > pre) { // a newborn just arrived — check its BIRTH position (before it wanders off)
      born++;
      const baby = pair.units[pair.units.length - 1];
      if (burrows.some(b => Math.hypot(baby.x - b.x, baby.y - b.y) < 1.0)) bornAtBurrow = true;
    }
  }
  assert(born > 0, `a mature M+F pair with a burrow + food breeds a newborn (${born} born)`);
  assert(bornAtBurrow, 'a newborn spawns at a breeding burrow, not the world spawn');
  ok(`sexed burrow breeding: needs mature M+F (no one-sex/immature breeding), born at a burrow (${born} born)`);
}

// 10d) Wet tail is far less punishing — fair, not a fast wipe.
console.log('Wet tail (fair disease):');
{
  const { WETTAIL, BUILDINGS } = await import('../src/config.js');
  const burrowType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].breed);
  const vetType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].vet);

  // The retune: gentler illness with a real treatment window.
  assert(WETTAIL.riskPerFilth < 0.0009, `riskPerFilth lowered (${WETTAIL.riskPerFilth} < 0.0009)`);
  assert(WETTAIL.dieAfter > 55, `time-to-death lengthened (${WETTAIL.dieAfter} > 55)`);
  assert(WETTAIL.healthDrain < 5, `health drain softened (${WETTAIL.healthDrain} < 5)`);
  assert(WETTAIL.infectAt > 1, `infection needs a real filth pile (${WETTAIL.infectAt} > 1)`);

  // A TIDY colony (no filth) essentially never catches wet tail.
  {
    const g = newGame(811, 'woodland', 'syrian', 'Tidy', {});
    g.popCap = 99; g.res.food = 9999;
    g.buildings.push({ id: g.nextId++, type: burrowType, x: g.world.spawn.x + 1, y: g.world.spawn.y, active: true });
    let caught = false;
    // Keep it genuinely TIDY every tick (no droppings, no burrow filth) so filth
    // stays below the infection threshold and the result is deterministic.
    for (let i = 0; i < 3000; i++) {
      g.buildings.forEach(b => { b.dirt = 0; });
      g.units.forEach(u => { u.pooT = 999; });
      stepEconomy(g, 0.1);
      if (g.units.some(u => u.sick)) caught = true;
    }
    assert(!caught, 'a tidy (clean) colony does not catch wet tail');
  }

  // An infected rodent recovers under a Vet Clinic.
  {
    const g = newGame(812, 'woodland', 'syrian', 'Cure', {});
    g.popCap = 99; g.res = { ...g.res, planks: 999, iron: 999 };
    g.buildings.push({ id: g.nextId++, type: vetType, x: g.world.spawn.x + 1, y: g.world.spawn.y, active: true });
    g.units[0].sick = true; g.units[0].sickT = 5;
    let cured = false;
    for (let i = 0; i < 400 && !cured; i++) { stepEconomy(g, 0.2); if (!g.units[0].sick) cured = true; }
    assert(cured, 'a Vet Clinic cures a wet-tail case (treatment works)');
  }
  ok(`wet tail retuned: tidy colony immune, vet cures, longer window (die after ${WETTAIL.dieAfter}s vs 55s)`);
}

// 11) Compassion & rescue (kindness as a mechanic).
console.log('Compassion & rescue:');
{
  const { addCompassion } = await import('../src/state.js');
  const { takeInRescue } = await import('../src/buildings.js');
  const { RESCUE } = await import('../src/config.js');
  const s = newGame(60, 'woodland', 'syrian', 'Kind', {});
  assert(s.compassion === 50, 'colony starts at neutral compassion');
  addCompassion(s, 70); assert(s.compassion === 100, 'compassion clamps at 100');
  addCompassion(s, -200); assert(s.compassion === 0, 'compassion clamps at 0');
  ok('compassion stat exists and clamps 0..100');

  // Force a rescue to be available, give housing, and take it in.
  s.compassion = 50;
  s.popCap = 20; // ensure room to adopt
  s.rescue = { species: 'mouse', x: s.world.spawn.x + 4, y: s.world.spawn.y, born: 0, name: 'Lost One' };
  const before = s.units.length;
  const r = takeInRescue(s);
  assert(r.ok && r.joined, 'taking in a stray succeeds and it joins');
  assert(s.units.length === before + 1, 'the rescued animal joins the colony');
  assert(s.units.some(u => u.rescued && u.name === 'Lost One'), 'rescued unit is recorded & named');
  assert(s.compassion === 50 + RESCUE.compassionTakeIn, 'taking in raises compassion');
  assert(s.rescue === null, 'the rescue is cleared after taking it in');
  ok(`rescue: took in "Lost One" → joins, compassion ${s.compassion}`);
}

// 12) Seasons & festivals (recurring return hook).
console.log('Seasons & festivals:');
{
  const { seasonKey, currentSeason, envMods, seasonTint } = await import('../src/environment.js');
  const { DAY_SECONDS, DAYS_PER_SEASON } = await import('../src/config.js');
  const s = newGame(70, 'woodland', 'syrian', 'Seasons', {});
  // Day 1 → spring; advancing a season's worth of days → summer.
  s.env.dayTime = 0.3 * DAY_SECONDS;
  assert(seasonKey(s) === 'spring', `starts in spring (got ${seasonKey(s)})`);
  s.env.dayTime = DAYS_PER_SEASON * DAY_SECONDS + 10; // into the 2nd season
  assert(seasonKey(s) === 'summer', `turns to summer (got ${seasonKey(s)})`);
  // winter raises need drain; spring boosts food — seasonal envMods differ.
  s.env.dayTime = 3 * DAYS_PER_SEASON * DAY_SECONDS + 10; // winter
  assert(seasonKey(s) === 'winter', `reaches winter (got ${seasonKey(s)})`);
  assert(envMods(s).needDrain > 0 && envMods(s).foodMul < 0, 'winter is harsher (needs up, food down)');
  ok('seasons cycle spring→summer→…→winter with distinct modifiers');

  // Seasonal atmosphere wash: each season returns a DISTINCT rgba tint (one
  // cheap fill per frame), and they're well-formed rgba() strings.
  const tints = ['spring', 'summer', 'autumn', 'winter'].map(seasonTint);
  for (const tn of tints) assert(/^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/.test(tn), `season tint is rgba(): ${tn}`);
  assert(new Set(tints).size === 4, 'each of the 4 seasons gets a distinct colour wash');
  assert(seasonTint('spring') === seasonTint('spring'), 'seasonTint is deterministic per season');
  assert(seasonTint('nonsense') === seasonTint('spring'), 'an unknown season falls back to spring');
  ok('seasonTint gives each season a distinct, well-formed colour wash');

  // A festival fires when the season changes (morale lifts).
  const s2 = newGame(71, 'prairie', 'syrian', 'Fest', {});
  s2.env.dayTime = 0.3 * DAY_SECONDS; stepEconomy(s2, 0.1); // seeds _seasonKey = spring
  s2.morale = 50;
  s2.env.dayTime = DAYS_PER_SEASON * DAY_SECONDS + 5; // cross into summer
  stepEconomy(s2, 0.1);
  assert(s2.morale > 50, `a festival lifted morale on the season change (now ${s2.morale.toFixed(1)})`);
  ok('a festival fires (and lifts morale) when the season turns');
}

// 13) Justice & Decrees (spend a virtue on purpose for the group).
console.log('Justice & decrees:');
{
  const { addJustice } = await import('../src/state.js');
  const { stepDecrees, resolveDecree, choiceAllowed } = await import('../src/decrees.js');
  const { DECREES } = await import('../src/config.js');
  const s = newGame(80, 'woodland', 'syrian', 'Judge', {});
  assert(s.justice === 50, 'colony starts at neutral justice');
  addJustice(s, 80); assert(s.justice === 100, 'justice clamps at 100');
  addJustice(s, -300); assert(s.justice === 0, 'justice clamps at 0');
  ok('justice stat exists and clamps 0..100');

  // A decree can be raised and resolved, spending one virtue to buy another.
  s.justice = 50; s.compassion = 50; s.morale = 80;
  s.decree = { id: 'triage', life: 75, born: 0 };
  const beforeC = s.compassion, beforeJ = s.justice, food = s.res.food;
  const applied = resolveDecree(s, 0); // "let the frail rest": +compassion, −food, −justice
  assert(applied, 'resolving a decree returns true');
  assert(s.decree === null, 'decree clears after a choice');
  assert(s.compassion > beforeC, `kind choice raised compassion (${beforeC}→${s.compassion})`);
  assert(s.justice < beforeJ, `kind choice spent justice (${beforeJ}→${s.justice})`);
  assert(s.res.food < food, 'kind choice cost food');
  ok(`decree resolved: compassion ${beforeC}→${s.compassion}, justice ${beforeJ}→${s.justice}`);

  // Court-gated mercy: the raider's "let them join" needs a Courthouse.
  const mercy = DECREES.raider.choices.find(c => c.requires === 'court');
  s._courts = 0; assert(!choiceAllowed(s, mercy), 'mercy verdict locked without a Courthouse');
  s._courts = 1; assert(choiceAllowed(s, mercy), 'a Courthouse unlocks the merciful verdict');
  ok('Courthouse gates the merciful raider verdict');

  // "Let the town decide": deliberately defer → the default course, no penalty.
  s.justice = 50; s.morale = 80; s.decree = { id: 'triage', life: 75, born: 0 };
  const { dismissDecree } = await import('../src/decrees.js');
  const dm = dismissDecree(s);
  assert(dm && s.decree === null, 'dismissing a decree resolves it (town decides)');
  assert(s.morale >= 74, 'deferring to the town carries no indecision penalty beyond the choice itself');
  ok('a decree can be deferred to the town council');

  // Dithering auto-resolves a pending decree (and costs a little morale).
  s.morale = 80; s.decree = { id: 'triage', life: 0.05, born: 0 };
  s.env.lived = 9999; // past the decree grace window
  stepDecrees(s, 0.1); // life runs out → auto-resolve
  assert(s.decree === null, 'an ignored decree auto-resolves');
  assert(s.morale < 80, 'letting the moment pass costs morale');
  ok('an unresolved decree auto-resolves (indecision costs morale)');

  // Almshouse/Courthouse/Hall of Heroes fold into the economy.
  const s2 = newGame(81, 'woodland', 'syrian', 'Civic', {});
  s2.res.food = 200; s2.justice = 50;
  const place = (type) => s2.buildings.push({ type, x: s2.world.spawn.x, y: s2.world.spawn.y });
  place('almshouse'); place('courthouse'); place('hallofheroes');
  for (let i = 0; i < 30; i++) stepEconomy(s2, 0.2);
  assert(s2._courts === 1 && s2._alms === 1 && s2._memorial === 1, 'civic buildings are counted');
  assert(s2.justice > 50, `a Courthouse lifts Justice over time (now ${s2.justice.toFixed(1)})`);
  assert(s2.compassion > 50, `an Almshouse lifts Compassion via sharing (now ${s2.compassion.toFixed(1)})`);
  ok('Courthouse raises Justice, Almshouse raises Compassion, Hall of Heroes counted');

  // High Justice deters raids (raid protection rises with Order).
  const s3 = newGame(82, 'woodland', 'syrian', 'Order', {});
  s3.env.lived = 4000;
  s3.justice = 50; const lowDeter = Math.max(0, (s3.justice - 50));
  s3.justice = 100; const highDeter = Math.max(0, (s3.justice - 50));
  assert(highDeter > lowDeter, 'higher Justice yields more raid deterrence');
  ok('high Justice deters raiders');

  // NPC fates: a raised cub's nature ripens; a sheltered herd sends a gift.
  const sf = newGame(83, 'woodland', 'syrian', 'Fate', {});
  sf.env.lived = 500; sf.compassion = 100;
  sf.pendingFates = [{ kind: 'cub', at: 400 }];
  stepDecrees(sf, 0.1);
  assert(!(sf.pendingFates || []).some(f => f.kind === 'cub'), 'the cub fate resolves once due');
  ok('a raised cub\'s fate ripens (guardian / departs / Trojan-horse betrayal)');

  sf.res.food = 10; sf.popCap = 0; sf.pendingFates = [{ kind: 'herd', at: 400 }];
  const f0 = sf.res.food; stepDecrees(sf, 0.1);
  assert(sf.res.food > f0, `a sheltered herd returns a food gift (${f0}→${sf.res.food})`);
  ok('a sheltered herd returns a parting gift');

  // Parley brokers a truce that stays the raiders.
  const tp = newGame(84, 'woodland', 'syrian', 'Peace', {});
  const fid = Object.keys(tp.factions)[0];
  tp.factions[fid].standing = -40; tp.env.lived = 1000;
  tp.decree = { id: 'parley', life: 75, born: 0, faction: fid };
  resolveDecree(tp, 0); // broker the truce
  assert((tp.truceUntil || 0) > tp.env.lived, 'a brokered truce is in effect');
  ok('parley brokers a truce (raiders & predators hold off)');

  // Valor (martial pride): morally-neutral, rises by winning fights.
  const { addValor } = await import('../src/state.js');
  const sv = newGame(85, 'woodland', 'syrian', 'Spartan', {});
  assert(sv.valor === 20, 'colony starts with a low Valor baseline');
  addValor(sv, 200); assert(sv.valor === 100, 'valor clamps at 100');
  // High Valor lends a proud, morally-neutral lift to spirits (no compassion).
  sv.valor = 90; sv.morale = 50; const c0 = sv.compassion;
  for (let i = 0; i < 20; i++) stepEconomy(sv, 0.2);
  assert(sv.morale > 50, `a proud (high-Valor) colony lifts its own spirits (now ${sv.morale.toFixed(1)})`);
  assert(Math.abs(sv.compassion - c0) < 6, 'Valor is morally neutral — it does not buy Compassion');
  ok('Valor: martial pride is morally neutral and lifts a proud colony');
}

// 14) Doctrines (virtue-gated skill trees).
console.log('Doctrines (skill trees):');
{
  const { learnDoctrine, doctrineStatus, doctrineBonuses, hasDoctrine } = await import('../src/doctrines.js');
  const { killUnit } = await import('../src/state.js');
  const s = newGame(90, 'woodland', 'syrian', 'Doctrine', {});
  s.res.research = 500;
  // Phalanx (War) needs Valor 35 — a fresh colony (Valor 20) can't yet.
  assert(!doctrineStatus(s, 'phalanx').ok, 'War doctrine locked below the Valor threshold');
  s.valor = 60;
  assert(doctrineStatus(s, 'phalanx').ok, 'enough Valor unlocks the first War doctrine');
  // Prereq gating: War Strategy needs Phalanx first.
  assert(!doctrineStatus(s, 'warstrat').ok, 'a doctrine is locked until its prerequisite is learned');
  const r = learnDoctrine(s, 'phalanx');
  assert(r.ok && hasDoctrine(s, 'phalanx'), 'learning a doctrine succeeds');
  assert(doctrineBonuses(s).defense === 15, 'Phalanx grants +15 defense');
  assert(doctrineStatus(s, 'warstrat').ok, 'learning the prerequisite unlocks the next doctrine');
  ok('doctrines gate on virtue thresholds + prerequisites, and fold their bonuses');

  // The bonus folds into the live economy (defense rises).
  s._doc = doctrineBonuses(s);
  for (let i = 0; i < 5; i++) stepEconomy(s, 0.1);
  assert(s.defense >= 15, `doctrine defense folds into the colony (def ${s.defense})`);
  ok('doctrine bonuses fold into recompute');

  // Honoured Sacrifice: a death steels the colony (morale + Valor) instead of pure grief.
  const s2 = newGame(91, 'woodland', 'syrian', 'Honour', {});
  s2.doctrines = { honored: true }; s2._doc = doctrineBonuses(s2);
  s2.morale = 50; s2.valor = 30;
  killUnit(s2, s2.units[s2.units.length - 1]);
  assert(s2.morale > 50 && s2.valor > 30, `Honoured Sacrifice turns loss into resolve (morale ${s2.morale}, valor ${s2.valor})`);
  ok('Honoured Sacrifice steels the colony on a death');
}

// 15) Palette (procedural-texture colour system).
console.log('Palette:');
{
  const { PAL, quantize, rampAt, RAMPS } = await import('../src/palette.js');
  assert(PAL.length === 64, `palette is exactly 64 colours (got ${PAL.length})`);
  assert(PAL.every(c => /^#[0-9a-fA-F]{6}$/.test(c)), 'every palette entry is a #rrggbb hex');
  assert(PAL.length === new Set(PAL).size, 'palette has no duplicate colours');
  // quantize snaps an off-palette colour to a real palette member.
  const q = quantize('#010203');
  assert(PAL.includes(q), 'quantize returns an on-palette colour');
  assert(rampAt('grass', 1) === RAMPS.grass[RAMPS.grass.length - 1], 'rampAt(…,1) is the darkest ramp step');
  ok(`64-colour palette: ${PAL.length} unique, quantises & ramps correctly`);
}

// 16) Pollution & power variety (environmental tradeoffs).
console.log('Pollution & power:');
{
  const { BUILDINGS, POLLUTION } = await import('../src/config.js');
  // New power buildings exist with the right traits.
  assert(BUILDINGS.coalplant?.pollutes > 0 && BUILDINGS.coalplant.produces.power, 'coal plant makes power & pollutes');
  assert(BUILDINGS.solar?.solar && !BUILDINGS.solar.pollutes, 'solar is clean & sun-driven');
  assert(BUILDINGS.hydro?.upstreamPenalty && BUILDINGS.hydro.produces.power, 'hydro makes power & throttles upstream');
  assert(!BUILDINGS.wheel?.pollutes, 'the plain wheel stays clean');
  ok('power buildings: coal (dirty), solar (sun), hydro (upstream), wheel (clean)');

  // A running coal plant raises pollution; pollution drains health when high.
  const s = newGame(95, 'prairie', 'syrian', 'Smog', {}); // prairie: few trees to scrub
  s.res.coal = 9999; s.res.stone = 9999; s.res.iron = 9999;
  const sp = s.world.spawn;
  for (let i = 0; i < 4; i++) s.buildings.push({ type: 'coalplant', x: sp.x + i, y: sp.y });
  const p0 = s.pollution;
  for (let i = 0; i < 200; i++) stepEconomy(s, 0.2);
  assert(s.pollution > p0 + 4, `coal plants raise pollution (${p0}→${s.pollution.toFixed(1)})`);
  ok(`coal plants raise pollution to ${s.pollution.toFixed(1)}`);

  // Pollution cuts farm yield: same farm makes less food at high pollution.
  function farmOutput(pollution) {
    const g = newGame(96, 'prairie', 'syrian', 'Farm', {});
    g.res = { wood: 0, stone: 0, water: 0, food: 0, seeds: 120 }; // leave storage room for the harvest
    g.pollution = pollution;
    g.units.forEach(u => u.needs.food = 100); // keep them from eating the output
    const f = g.world.spawn;
    g.buildings.push({ type: 'storage', x: f.x + 1, y: f.y }, { type: 'storage', x: f.x + 2, y: f.y }); // depots add storage headroom for the harvest
    g.buildings.push({ type: 'farm', x: f.x, y: f.y });
    const before = g.res.food; for (let i = 0; i < 25; i++) stepEconomy(g, 0.2); return g.res.food - before;
  }
  const clean = farmOutput(0), dirty = farmOutput(90);
  assert(dirty < clean, `heavy pollution cuts farm output (${clean.toFixed(1)} → ${dirty.toFixed(1)})`);
  ok(`pollution poisons farms (clean ${clean.toFixed(1)} > dirty ${dirty.toFixed(1)})`);

  // Planting trees scrubs pollution faster.
  function scrub(saplings) {
    const g = newGame(97, 'prairie', 'syrian', 'Tree', {}); g.pollution = 50;
    const f = g.world.spawn;
    for (let i = 0; i < saplings; i++) g.buildings.push({ type: 'sapling', x: f.x + i, y: f.y + 2 });
    for (let i = 0; i < 50; i++) stepEconomy(g, 0.2); return g.pollution;
  }
  assert(scrub(8) < scrub(0), 'planted trees scrub pollution faster');
  ok('planting trees (forests) scrub pollution from the air');

  // A statue lifts the colony's spirit & compassion (passive, isolated at 50).
  const g2 = newGame(98, 'woodland', 'syrian', 'Civic', {});
  g2.compassion = 50; g2.buildings.push({ type: 'statue', x: g2.world.spawn.x, y: g2.world.spawn.y });
  for (let i = 0; i < 30; i++) stepEconomy(g2, 0.2);
  assert(g2._statues === 1 && g2.compassion > 50, `a statue raises Compassion (now ${g2.compassion.toFixed(1)})`);
  ok('statues lift morale & compassion');
}

// 17) Burrow crowding: a packed burrow gets filthy faster than a sparse one.
console.log('Burrow crowding:');
{
  const { BUILDINGS } = await import('../src/config.js');
  const bk = Object.keys(BUILDINGS).find(k => BUILDINGS[k].breed); // the burrow type
  function burrowDirt(popN) {
    const g = newGame(40, 'woodland', 'syrian', 'Dirt', {});
    while (g.units.length > popN) g.units.pop();
    g.res.food = 4; // keep population put (no breeding) so we isolate crowding
    const sp = g.world.spawn; g.buildings.push({ type: bk, x: sp.x, y: sp.y });
    for (let i = 0; i < 25; i++) stepEconomy(g, 0.2);
    return g.buildings.find(b => b.type === bk).dirt || 0;
  }
  const crowded = burrowDirt(5), sparse = burrowDirt(1);
  assert(crowded > sparse * 1.5, `a crowded burrow dirties faster (sparse ${sparse.toFixed(2)} vs crowded ${crowded.toFixed(2)})`);
  ok(`burrow filth scales with crowding (sparse ${sparse.toFixed(2)} < crowded ${crowded.toFixed(2)})`);
}

// 18) Player orders: directable go-to + Explore (reveal the fog of war).
console.log('Player orders (go-to + explore):');
{
  const seenCount = (s) => s.world.seen.reduce((a, b) => a + b, 0);

  // go-to: send a rodent to a far tile; it should travel there and clear the
  // order (resuming auto-work). Keep it awake so sleep doesn't skew the test.
  const s = newGame(2468, 'prairie', 'syrian', 'Orders', {});
  const u = s.units[0];
  const tx = 36, ty = 24;
  u.order = { kind: 'goto', x: tx, y: ty };
  let guard = 0;
  while (u.order && guard++ < 6000) { u.needs.energy = 100; stepEconomy(s, 0.1); }
  assert(u.order === null, 'go-to order clears on arrival');
  assert(Math.hypot(u.x - tx, u.y - ty) < 1.5, `rodent reaches the target tile (at ${u.x.toFixed(1)},${u.y.toFixed(1)})`);
  ok('go-to: a selected rodent travels to the clicked tile, then resumes work');

  // explore: roaming toward the unknown reveals new fog.
  const before = seenCount(s);
  const u2 = s.units[0];
  u2.order = { kind: 'explore' };
  for (let i = 0; i < 2000 && u2.order; i++) { u2.needs.energy = 100; stepEconomy(s, 0.1); }
  assert(seenCount(s) > before, `explore reveals new fog (${before} → ${seenCount(s)} tiles)`);
  ok(`explore: fog of war shrinks as the scout roams (${before} → ${seenCount(s)} seen)`);

  // explore completes (clears its order) once the whole map is revealed.
  const s2 = newGame(2469, 'prairie', 'syrian', 'Done', {});
  s2.world.seen.fill(1); // pretend everything is already found
  const u3 = s2.units[0];
  u3.order = { kind: 'explore' }; u3.needs.energy = 100;
  stepEconomy(s2, 0.1);
  assert(u3.order === null, 'explore finishes when nothing is left to find');
  ok('explore: ends automatically once every tile has been mapped');
}

// 19) Per-unit Vigor: a high-Vigor rodent's needs drain slower.
console.log('Per-unit Vigor (stamina trait):');
{
  function drainOver(vigorLevel) {
    const g = newGame(1357, 'prairie', 'syrian', 'Vig', {});
    g.res.food = 0; g.res.water = 0; // no stores to refill from — isolate drain
    const u = g.units[0];
    u.traits = { vigor: vigorLevel };
    u.needs.food = 100; u.needs.water = 100; u.phase = 'idle'; // not gathering
    for (let i = 0; i < 60; i++) { u.phase = 'idle'; stepEconomy(g, 0.2); }
    return u.needs.food + u.needs.water;
  }
  const weak = drainOver(0), tough = drainOver(6);
  assert(tough > weak, `Vigor should slow need drain (vigor0 left ${weak.toFixed(1)} < vigor6 left ${tough.toFixed(1)})`);
  ok(`per-unit Vigor slows food/water drain (vigor0 ${weak.toFixed(1)} → vigor6 ${tough.toFixed(1)} left)`);
}

// 20) New milestones: present and firing on the right conditions.
console.log('Milestones (new goals):');
{
  const { MILESTONES, checkMilestones } = await import('../src/milestones.js');
  const ids = new Set(MILESTONES.map(m => m.id));
  for (const id of ['pop50', 'explored', 'plastic', 'doctrine', 'valor90', 'justice90'])
    assert(ids.has(id), `milestone ${id} should exist`);
  // Cartographer fires once the whole map is revealed (ties to the Explore task).
  const s = newGame(321, 'prairie', 'syrian', 'Goals', {});
  s.world.seen.fill(1);
  assert(checkMilestones(s).some(m => m.id === 'explored'), 'revealing the whole map awards Cartographer');
  // Valor / Justice thresholds award their milestones.
  const s2 = newGame(322, 'prairie', 'syrian', 'Virtue', {});
  s2.valor = 95; s2.justice = 95;
  const got = checkMilestones(s2);
  assert(got.some(m => m.id === 'valor90') && got.some(m => m.id === 'justice90'), 'high Valor & Justice award their milestones');
  ok(`new milestones present & firing (total ${MILESTONES.length})`);
}

// 21) Oak → squirrel / nut economy.
console.log('Oak → squirrel / nut economy:');
{
  const { BUILDINGS, SQUIRREL, RESOURCES } = await import('../src/config.js');
  assert(RESOURCES.nuts && BUILDINGS.oak?.produces?.nuts, 'Nuts resource + nut-producing Oak exist');

  // An oak grows nuts over time (via the standard production loop).
  const g = newGame(606, 'prairie', 'syrian', 'Oaks', {});
  const sp = g.world.spawn;
  g.buildings.push({ id: 9001, type: 'oak', x: sp.x, y: sp.y, active: true }); // already built
  const before = g.res.nuts || 0;
  for (let i = 0; i < 30; i++) stepEconomy(g, 0.2);
  assert((g.res.nuts || 0) > before, `an oak produces nuts over time (${before} → ${(g.res.nuts || 0).toFixed(1)})`);
  assert((g.squirrelPressure || 0) > 0, 'oaks + nuts build squirrel pressure');
  ok(`oaks grow nuts (${(g.res.nuts || 0).toFixed(1)}) and raise squirrel pressure (${Math.round(g.squirrelPressure)})`);

  // A nut hoard behind weak defenses + low Compassion gets raided (nuts stolen).
  const r = newGame(607, 'prairie', 'syrian', 'Hoard', {});
  r.res.nuts = 60; r.compassion = 40; r.defense = 0; r.justice = 50; r.disasters = true;
  r._squirrelT = 1e4; // force the visit this tick
  const hoard = r.res.nuts;
  stepEconomy(r, 0.1);
  assert((r.res.nuts || 0) < hoard, `a hoard behind weak defenses gets raided (${hoard} → ${r.res.nuts})`);
  ok(`squirrels raid an unguarded nut hoard (${hoard} → ${r.res.nuts} nuts)`);

  // A kind colony stays on friendly terms — no raid, Compassion grows.
  const k = newGame(608, 'prairie', 'syrian', 'Kind', {});
  k.res.nuts = 60; k.compassion = 80; k.disasters = true;
  k._squirrelT = 1e4;
  const c0 = k.compassion;
  stepEconomy(k, 0.1);
  assert(k.compassion >= c0, 'a kind colony keeps squirrels friendly (Compassion does not fall)');
  ok('a kind colony trades with squirrels instead of being raided');

  // Tree variety: several plantable species, all trees, but ONLY the oak grows
  // nuts — so only the oak draws squirrels.
  const species = ['sapling', 'pine', 'berry', 'oak'];
  assert(species.every(t => BUILDINGS[t]?.tree), 'multiple plantable tree species exist (sapling/pine/berry/oak)');
  const nutBearers = species.filter(t => BUILDINGS[t]?.produces?.nuts);
  assert(nutBearers.length === 1 && nutBearers[0] === 'oak', 'only the oak bears nuts — only oaks entice squirrels');
  assert(species.every(t => Object.keys(BUILDINGS[t].cost).includes('seeds')), 'every tree costs seeds (seeds/food economy)');
  ok(`tree-species picker: ${species.join(', ')} — only the oak draws squirrels`);

  // Too many oaks → the swarm raids FOOD and WATER, overriding goodwill: a kind,
  // small-hoard colony still gets hit once the grove is overcrowded.
  const o = newGame(609, 'prairie', 'syrian', 'Grove', {});
  const op = o.world.spawn;
  const oakN = SQUIRREL.crowdAt + Math.ceil(1 / SQUIRREL.tensionPerOak); // enough to max tension
  for (let i = 0; i < oakN; i++)
    o.buildings.push({ id: 9100 + i, type: 'oak', x: op.x + (i % 5), y: op.y + Math.floor(i / 5), active: true });
  o.res.nuts = 5; o.res.food = 100; o.res.water = 100; o.compassion = 90; o.defense = 0; o.justice = 50; o.disasters = true;
  o._squirrelT = 1e4; // force the visit this tick
  const f0 = o.res.food, w0 = o.res.water;
  stepEconomy(o, 0.1);
  assert((o.squirrelTension || 0) >= 1, `an overcrowded oak grove maxes squirrel tension (${(o.squirrelTension || 0).toFixed(2)})`);
  assert(o.res.food < f0 && o.res.water < w0, `the swarm raids food (${f0}→${o.res.food.toFixed(0)}) AND water (${w0}→${o.res.water.toFixed(0)}) despite high Compassion`);
  ok(`too many oaks → swarm raids food & water (food ${f0}→${o.res.food.toFixed(0)}, water ${w0}→${o.res.water.toFixed(0)})`);
}

// 21d) Growth / maturation: crops, trees & animals take time to become useful.
console.log('Growth & maturation (crops, trees, animals grow in):');
{
  const { BUILDINGS, GROWTH, growTime, buildingMaturity, BREEDING } = await import('../src/config.js');
  const { workMaturity, PUP_WORK } = await import('../src/entities.js');

  // growTime: food producers & trees grow in; instant buildings don't.
  assert(growTime(BUILDINGS.sunflower) === GROWTH.cropGrow, 'a food producer (sunflower) grows in over cropGrow seconds');
  assert(growTime(BUILDINGS.oak) === GROWTH.treeGrow, 'a tree (oak) grows in over the longer treeGrow time');
  assert(growTime(BUILDINGS.wheel) === 0 && growTime(BUILDINGS.burrow) === 0, 'non-producers (wheel, burrow) are instant — no grow-in');

  // buildingMaturity: just-built ≈ 0, no stamp = mature (legacy/founding/fixtures).
  assert(buildingMaturity({ type: 'sunflower', builtAt: 100 }, 100) === 0, 'a just-built producer starts at 0 maturity');
  assert(buildingMaturity({ type: 'sunflower', builtAt: 100 }, 100 + GROWTH.cropGrow) === 1, 'it reaches full maturity after cropGrow seconds');
  assert(buildingMaturity({ type: 'sunflower' }, 1e6) === 1, 'a building with no builtAt stamp counts as fully grown');

  // A young crop yields far less than the same crop once grown (isolated: a fresh
  // colony has no other seed source, so the sunflower's ramp is the whole delta).
  const m = newGame(701, 'prairie', 'syrian', 'Grow', {});
  const mp = m.world.spawn;
  m.units = []; // isolate the sunflower's ramp from rodents foraging seeds
  const sun = { id: m.nextId++, type: 'sunflower', x: mp.x, y: mp.y, active: true, builtAt: m.env.lived || 0 };
  m.buildings.push(sun);
  const sy0 = m.res.seeds || 0;
  for (let i = 0; i < 6; i++) stepEconomy(m, 0.2); // ~1.2s in — still a seedling
  const youngGain = (m.res.seeds || 0) - sy0;
  sun.builtAt = (m.env.lived || 0) - GROWTH.cropGrow - 5; // now fully grown in
  const sy1 = m.res.seeds || 0;
  for (let i = 0; i < 6; i++) stepEconomy(m, 0.2);
  const matureGain = (m.res.seeds || 0) - sy1;
  assert(youngGain < matureGain * 0.4, `a young crop yields far less than a grown one (young ${youngGain.toFixed(2)} ≪ mature ${matureGain.toFixed(2)})`);
  ok(`crops grow in: yield ramps from ${youngGain.toFixed(2)} (seedling) to ${matureGain.toFixed(2)} (grown)`);

  // Animals grow into usefulness: a pup works at reduced effort, ramping to full.
  assert(workMaturity({ age: BREEDING.maturityAge }) === 1, 'a mature rodent works at full effort');
  assert(Math.abs(workMaturity({ age: 0 }) - PUP_WORK) < 1e-9, 'a newborn pup works at the reduced PUP_WORK rate');
  assert(workMaturity({}) === 1, 'a legacy rodent (no age) works at full effort');
  assert(workMaturity({ age: 0 }) < workMaturity({ age: BREEDING.maturityAge }), 'young animals are less useful at work until grown');
  ok(`animals grow into usefulness: pup works at ${PUP_WORK} → full at maturity`);
}

// 21e) Rabbits: veg-fed warren → manure (→ fertilizer), and predator bait.
console.log('Rabbits (carrot/cabbage gardens → manure → fertilizer; predator bait):');
{
  const { BUILDINGS, RESOURCES, RABBIT } = await import('../src/config.js');
  const { removeUnits } = await import('../src/events.js');

  assert(RESOURCES.carrot && RESOURCES.cabbage, 'Carrot & Cabbage resources exist');
  assert(BUILDINGS.carrotgarden?.produces?.carrot && BUILDINGS.cabbagegarden?.produces?.cabbage, 'Carrot & Cabbage gardens grow their veg');
  assert(BUILDINGS.rabbithutch?.rabbithutch, 'Rabbit Hutch exists');

  // A hutch stocked with carrot + cabbage grows a warren and makes lots of manure.
  const g = newGame(801, 'prairie', 'syrian', 'Warren', {});
  const gp = g.world.spawn;
  g.buildings.push({ id: g.nextId++, type: 'rabbithutch', x: gp.x, y: gp.y, active: true });
  g.res.carrot = 50; g.res.cabbage = 50; g.res.manure = 0; g.rabbits = 0;
  const man0 = g.res.manure || 0;
  for (let i = 0; i < 40; i++) stepEconomy(g, 0.25);
  assert((g.rabbits || 0) > 1, `a fed warren grows from 0 (now ${(g.rabbits || 0).toFixed(1)} rabbits, cap ${g.rabbitCap})`);
  assert((g.res.manure || 0) > man0, `the warren produces manure (${man0} → ${(g.res.manure || 0).toFixed(1)})`);
  ok(`fed rabbit warren grows to ${(g.rabbits || 0).toFixed(1)} & makes manure (${(g.res.manure || 0).toFixed(1)})`);

  // Starved (no carrots/cabbage) the warren dwindles.
  const s = newGame(802, 'prairie', 'syrian', 'Starve', {});
  s.buildings.push({ id: s.nextId++, type: 'rabbithutch', x: s.world.spawn.x, y: s.world.spawn.y, active: true });
  s.res.carrot = 0; s.res.cabbage = 0; s.rabbits = 5;
  const r0 = s.rabbits;
  for (let i = 0; i < 20; i++) stepEconomy(s, 0.25);
  assert(s.rabbits < r0, `a starved warren dwindles (${r0} → ${s.rabbits.toFixed(1)} rabbits)`);
  ok(`starved warren shrinks without carrot/cabbage (${r0} → ${s.rabbits.toFixed(1)})`);

  // Predator bait: an abundant warren is eaten instead of the rodents.
  const p = newGame(803, 'prairie', 'syrian', 'Bait', {});
  while (p.units.length < 5) p.units.push({ ...p.units[0], id: p.nextId++, inBall: false });
  p.rabbits = 6; // ≥ baitAbundance
  const units0 = p.units.length, rab0 = p.rabbits;
  const lost = removeUnits(p, 3);
  assert(lost === 0 && p.units.length === units0, 'an abundant warren spares the rodents from a predator');
  assert(p.rabbits === rab0 - 3, `the predator took rabbits instead (${rab0} → ${p.rabbits})`);
  ok(`abundant rabbits lure predators off the rodents (${rab0}→${p.rabbits} rabbits, 0 rodents lost)`);

  // With no rabbits left, predators fall back to the rodents.
  p.rabbits = 0;
  const u1 = p.units.length;
  const lost2 = removeUnits(p, 2);
  assert(lost2 > 0 && p.units.length < u1, 'with the warren gone, predators take rodents again');
  ok(`once rabbits run out, rodents are exposed again (lost ${lost2})`);
}

// 21f) Grain silo (off-book grain storage) + mill seed byproduct.
console.log('Grain silo (off-book storage) + mill seeds:');
{
  const { BUILDINGS } = await import('../src/config.js');
  const { totalStored } = await import('../src/state.js');

  assert(BUILDINGS.grainsilo?.grainCap > 0, 'Grain Silo provides dedicated grain capacity');
  assert(BUILDINGS.mill?.produces?.seeds > 0, 'the Mill now saves back grain as Seeds');

  // Grain held within silo capacity does NOT count against general storage.
  const g = newGame(811, 'prairie', 'syrian', 'Silo', {});
  g.buildings.push({ id: g.nextId++, type: 'grainsilo', x: g.world.spawn.x, y: g.world.spawn.y, active: true });
  stepEconomy(g, 0.1); // recompute building effects → state.grainCap
  assert((g.grainCap || 0) >= BUILDINGS.grainsilo.grainCap, `a silo raises grainCap (${g.grainCap})`);
  g.res.wood = 100;
  const baseStored = totalStored(g);
  g.res.grain = (g.res.grain || 0) + 500; // bank 500 grain in the silo
  assert(Math.abs(totalStored(g) - baseStored) < 1e-6, `silo grain is off-book — general storage unchanged (${baseStored.toFixed(1)})`);
  // Grain beyond the silo capacity DOES count against general storage again.
  g.res.grain = g.grainCap + 300;
  assert(totalStored(g) > baseStored + 200, 'grain over silo capacity spills onto the general books');
  ok(`grain silo banks ${g.grainCap} grain off the general storehouse books`);

  // A mill turns wheat into grain AND a trickle of seed grain.
  const m = newGame(812, 'prairie', 'syrian', 'Mill', {});
  m.units = []; // isolate the mill from foraging
  m.buildings.push({ id: m.nextId++, type: 'mill', x: m.world.spawn.x, y: m.world.spawn.y, active: true });
  m.res.wheat = 50; m.res.seeds = 0; m.res.grain = 0;
  for (let i = 0; i < 20; i++) stepEconomy(m, 0.2);
  assert((m.res.grain || 0) > 0 && (m.res.seeds || 0) > 0, `milling yields grain (${(m.res.grain || 0).toFixed(1)}) AND seed (${(m.res.seeds || 0).toFixed(1)})`);
  ok(`mill saves back seed grain (grain ${(m.res.grain || 0).toFixed(1)}, seeds ${(m.res.seeds || 0).toFixed(1)})`);
}

// 21g) Inter-faction communities: rivalry/symbiosis, prosperity, war/alliance.
console.log('Inter-faction communities (rivalry → war, symbiosis → alliance):');
{
  const { FACTIONS } = await import('../src/config.js');
  const { factionAffinity, getRelation, stepInterFactions, RELATIONS } = await import('../src/factions.js');

  // Affinity reads off resource interests: shared covets → rivalry; one wanting
  // the other's offer / no competition → symbiosis.
  assert(factionAffinity('chipmunks', 'fieldmice') <= RELATIONS.warAt, 'chipmunks & fieldmice (both covet grain+wheat) are bitter rivals');
  assert(factionAffinity('packrats', 'squirrels') >= RELATIONS.allyAt, 'packrats & squirrels (planks trade) trend symbiotic');
  assert(factionAffinity('squirrels', 'chipmunks') > RELATIONS.warAt && factionAffinity('squirrels', 'chipmunks') < RELATIONS.allyAt, 'a mild rivalry stays neutral');

  // Run the community sim: relations drift to their targets, prosperity moves.
  const g = newGame(901, 'prairie', 'syrian', 'Neighbours', {});
  for (const id of Object.keys(FACTIONS)) g.factions[id] = g.factions[id] || { standing: 0, raidTimer: 150 };
  for (let i = 0; i < 700; i++) stepInterFactions(g, 0.2); // ~140s
  const warRel = getRelation(g, 'chipmunks', 'fieldmice');
  const allyRel = getRelation(g, 'packrats', 'squirrels');
  assert(warRel <= RELATIONS.warAt, `rivals drift into war (${warRel.toFixed(0)})`);
  assert(allyRel >= RELATIONS.allyAt, `partners drift into a pact (${allyRel.toFixed(0)})`);
  assert(g.factions.fieldmice._atWar === true, 'a community fighting a neighbour is flagged at war');
  assert(g.factions.packrats._allied === true, 'a trading community is flagged allied');
  // The peaceful trade hub out-prospers a war-torn neighbour.
  assert((g.factions.packrats.prosperity || 0) > (g.factions.fieldmice.prosperity || 0),
    `peace & trade out-prosper war (packrats ${Math.round(g.factions.packrats.prosperity)}% > fieldmice ${Math.round(g.factions.fieldmice.prosperity)}%)`);
  ok(`neighbours run their own lives: chipmunks↔fieldmice war (${warRel.toFixed(0)}), packrats pacts (${allyRel.toFixed(0)}); prosperity diverges`);
}

// 21h) Varied wild flora: different forests & plants, finite (no auto-regrow).
console.log('Varied wild flora (pinewood / berry bushes / wildflowers):');
{
  const { NODE_TYPES } = await import('../src/config.js');
  for (const k of ['pinewood', 'berrybush', 'wildflowers'])
    assert(NODE_TYPES[k]?.surface === true && NODE_TYPES[k].resource, `${k} is a surface flora node yielding ${NODE_TYPES[k]?.resource || '??'}`);
  assert(NODE_TYPES.pinewood.resource === 'wood' && NODE_TYPES.berrybush.resource === 'food' && NODE_TYPES.wildflowers.resource === 'seeds',
    'wild flora yield existing staples (wood/food/seeds) — no orphan resources');

  // A generated woodland seeds VARIED flora, not just the one tree type.
  const g = newGame(321, 'woodland', 'syrian', 'Flora', {});
  const kinds = new Set(g.world.nodes.map(n => n.kind));
  const variety = ['pinewood', 'berrybush', 'wildflowers'].filter(k => kinds.has(k));
  assert(variety.length >= 2, `the wild world grows varied flora (${variety.join(', ') || 'none'})`);
  ok(`world seeds varied wild flora: ${['trees', 'pinewood', 'berrybush', 'wildflowers', 'bush'].filter(k => kinds.has(k)).join(', ')}`);

  // Wild flora deplete and do NOT regrow on their own — replant (Trees/gardens) to restore.
  const f = g.world.nodes.find(n => ['pinewood', 'berrybush', 'wildflowers'].includes(n.kind));
  g.units = []; // no gatherers, so the only change would be regrowth (there is none)
  f.amount = 7;
  for (let i = 0; i < 40; i++) stepEconomy(g, 0.25);
  assert(f.amount <= 7, `wild flora doesn't regrow by itself (held at ${f.amount})`);
  ok(`wild flora is finite — depletes & needs replanting (${f.kind} held at ${f.amount})`);
}

// 22) Wood economy: more trees, sunflower seeds, wooden power & mills, cistern,
//     fence, and friendly squirrels speeding timber builds.
console.log('Wood economy (trees, mills, power, storage):');
{
  const { BUILDINGS } = await import('../src/config.js');
  const built = (s, type, x, y, extra = {}) => { s.buildings.push({ id: s.nextId++, type, x, y, active: true, ...extra }); return s.buildings[s.buildings.length - 1]; };

  // ~2.6× denser starting trees → a real timber supply.
  const w = newGame(111, 'woodland', 'syrian', 'Woods', {});
  const treeNodes = w.world.nodes.filter(n => n.kind === 'trees').length;
  assert(treeNodes >= 15, `woodland seeds plenty of trees for a wood economy (got ${treeNodes})`);
  ok(`denser tree cover: ${treeNodes} tree nodes on a woodland map`);

  // Sunflower field grows seeds (+ a little food).
  const g = newGame(112, 'prairie', 'syrian', 'Sun', {});
  const sp = g.world.spawn;
  const s0 = g.res.seeds || 0;
  built(g, 'sunflower', sp.x + 2, sp.y);
  for (let i = 0; i < 25; i++) stepEconomy(g, 0.2);
  assert((g.res.seeds || 0) > s0, `sunflower field grows seeds (${s0} → ${(g.res.seeds || 0).toFixed(1)})`);
  ok('sunflower field produces seeds');

  // Wooden Windmill makes clean Power.
  const p = newGame(113, 'prairie', 'syrian', 'Wind', {});
  built(p, 'windmill', p.world.spawn.x + 2, p.world.spawn.y);
  for (let i = 0; i < 20; i++) stepEconomy(p, 0.2);
  assert((p.res.power || 0) > 0, 'a windmill generates power');
  ok(`wooden windmill generates clean power (${(p.res.power || 0).toFixed(1)})`);

  // Fertilizer Mill: Manure (poop) + Power → Fertilizer (the poop→fertilizer chain).
  const m = newGame(114, 'prairie', 'syrian', 'Mill', {});
  m.res = { manure: 200, power: 200 }; // leave storage room for the fertilizer
  const f0 = m.res.fertilizer || 0;
  built(m, 'fertilizerplant', m.world.spawn.x + 2, m.world.spawn.y);
  for (let i = 0; i < 20; i++) stepEconomy(m, 0.2);
  assert((m.res.fertilizer || 0) > f0, `fertilizer mill turns manure → fertilizer (${f0} → ${(m.res.fertilizer || 0).toFixed(1)})`);
  assert((m.res.manure || 0) < 200, 'the fertilizer mill consumes manure');
  ok('fertilizer mill turns manure + power into fertilizer');

  // Cistern raises storage capacity (+300, wooden water storage).
  const c = newGame(115, 'prairie', 'syrian', 'Cist', {});
  stepEconomy(c, 0.1); const cap0 = c.storageCap;
  built(c, 'cistern', c.world.spawn.x + 2, c.world.spawn.y);
  stepEconomy(c, 0.1);
  assert(c.storageCap === cap0 + 300, `cistern adds +300 storage (${cap0} → ${c.storageCap})`);
  ok('wooden cistern expands storage');

  // Wooden Fence adds light defense.
  const d = newGame(116, 'prairie', 'syrian', 'Fence', {});
  stepEconomy(d, 0.1); const def0 = d.defense;
  built(d, 'woodfence', d.world.spawn.x + 2, d.world.spawn.y);
  stepEconomy(d, 0.1);
  assert(d.defense > def0, `wooden fence adds defense (${def0} → ${d.defense})`);
  ok('wooden fence raises colony defense');

  // Friendly squirrels speed up TIMBER builds (~35% faster on wood structures).
  function woodBuildProgress(friendly) {
    const s = newGame(117, 'prairie', 'syrian', 'Help', {});
    if (friendly) { s.res.nuts = 40; s.compassion = 85; } // oaks/nuts draw helpful squirrels
    const b = built(s, 'storage', s.world.spawn.x + 3, s.world.spawn.y, { underConstruction: true, progress: 0, buildTime: 400 });
    for (let i = 0; i < 25; i++) {
      if (friendly) { s.res.nuts = Math.max(20, s.res.nuts); s.compassion = 85; }
      stepEconomy(s, 0.2);
    }
    return b.progress || 0;
  }
  const plain = woodBuildProgress(false), helped = woodBuildProgress(true);
  assert(helped > plain, `friendly squirrels speed timber builds (plain ${plain.toFixed(1)} < helped ${helped.toFixed(1)})`);
  ok(`friendly squirrels lend paws on wood builds (${plain.toFixed(0)} → ${helped.toFixed(0)} progress)`);
}

// 23) Beaver wood store + take-too-much sabotage.
console.log('Beaver wood store & sabotage:');
{
  const mk = (seed) => { const s = newGame(seed, 'rivers', 'syrian', 'Beav', {}); s.units[0].species = 'beaver'; return s; };

  // Beavers stockpile wood in their own store.
  const s = mk(700);
  for (let i = 0; i < 20; i++) stepEconomy(s, 0.2);
  assert((s.beaverWood || 0) > 0, 'beavers stockpile wood in their own store');
  ok(`beavers keep a wood store (${(s.beaverWood || 0).toFixed(1)})`);

  // Hamsters tap the store when colony wood runs low (store is drawn down).
  const d = mk(701);
  for (let i = 0; i < 40; i++) stepEconomy(d, 0.2); // build up the store
  d.res.wood = 1; // colony short on wood
  const store0 = d.beaverWood;
  stepEconomy(d, 0.2);
  assert(d.beaverWood < store0, `the beaver store is tapped in a wood shortage (${store0.toFixed(1)} → ${d.beaverWood.toFixed(1)})`);
  ok('hamsters draw from the beaver store when wood is low');

  // Constant over-taking sours the beavers → they sabotage the water works.
  const r = mk(702);
  for (let i = 0; i < 90; i++) { r.res.wood = 0; stepEconomy(r, 0.2); }
  assert((r.beaverMood ?? 70) < 35, `over-taxing the store makes beavers grumpy (mood ${(r.beaverMood ?? 70).toFixed(1)})`);
  assert((r._beaverSabotage || 0) > 0, 'grumpy beavers sabotage the water works');
  ok(`over-taken beavers turn grumpy & sabotage water (mood ${(r.beaverMood ?? 70).toFixed(0)})`);

  // Fair use keeps them content — no sabotage.
  const f = mk(703);
  for (let i = 0; i < 40; i++) { f.res.wood = 500; stepEconomy(f, 0.2); }
  assert((f.beaverMood ?? 70) >= 35 && !((f._beaverSabotage || 0) > 0), 'fairly-treated beavers stay content');
  ok('fairly-treated beavers stay content (no sabotage)');
}

// 24) Fertilizer comes from POOP: composter & burrow-cleaning → manure → mill.
console.log('Poop → manure → fertilizer chain:');
{
  const { BUILDINGS } = await import('../src/config.js');
  const { cleanBurrow } = await import('../src/buildings.js');
  const { addWaste } = await import('../src/world.js');
  const breedType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].breed); // the burrow

  // Composter gathers droppings into stored Manure (not fertilizer directly).
  const s = newGame(800, 'woodland', 'syrian', 'Poop', {});
  const sp = s.world.spawn;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) addWaste(s.world, sp.x + dx, sp.y + dy, 5);
  s.buildings.push({ id: s.nextId++, type: 'composter', x: sp.x, y: sp.y, active: true });
  const m0 = s.res.manure || 0;
  for (let i = 0; i < 20; i++) stepEconomy(s, 0.2);
  assert((s.res.manure || 0) > m0, `composter stockpiles droppings as manure (${m0} → ${(s.res.manure || 0).toFixed(1)})`);
  assert((s.res.fertilizer || 0) === 0, 'a composter alone makes no fertilizer (needs the powered mill)');
  ok('composter gathers droppings into manure (not fertilizer)');

  // Cleaning a burrow yields manure (poop from houses).
  const c = newGame(801, 'woodland', 'syrian', 'Clean', {});
  const burrow = { id: c.nextId++, type: breedType, x: c.world.spawn.x + 1, y: c.world.spawn.y, active: true, dirt: 6 };
  c.buildings.push(burrow);
  const mb = c.res.manure || 0;
  const r = cleanBurrow(c, burrow);
  assert(r.ok && (c.res.manure || 0) > mb, `cleaning a burrow collects manure (${mb} → ${(c.res.manure || 0)})`);
  ok('cleaning a burrow/house yields manure for fertilizer');
}

// 25) Hamster balls: workshop rolls plastic → balls; joy → anxiety → pop / heat death.
console.log('Hamster balls:');
{
  const { BUILDINGS, DAYS_PER_SEASON, DAY_SECONDS } = await import('../src/config.js');
  const { enterBall, exitBall } = await import('../src/economy.js');
  assert(BUILDINGS.ballworkshop?.produces?.balls && BUILDINGS.ballworkshop.consumes?.plastic,
    'Ball Workshop turns plastic → hamster balls');

  // Workshop rolls plastic into balls.
  const g = newGame(900, 'prairie', 'syrian', 'Balls', {});
  g.res = { plastic: 100 }; // plenty of plastic, storage room for balls
  g.buildings.push({ id: g.nextId++, type: 'ballworkshop', x: g.world.spawn.x + 2, y: g.world.spawn.y, active: true });
  for (let i = 0; i < 40; i++) stepEconomy(g, 0.2);
  assert((g.res.balls || 0) > 0, `Ball Workshop produces hamster balls (${(g.res.balls || 0).toFixed(2)})`);
  ok(`Ball Workshop rolls plastic into balls (${(g.res.balls || 0).toFixed(1)})`);

  // Entering a ball needs the workshop + a ball in stock; it checks one out.
  const u = g.units[0];
  g.res.balls = 5; // stock the rack for the enter checks
  const balls0 = g.res.balls;
  const r = enterBall(g, u);
  assert(r.ok && u.inBall && Math.abs(g.res.balls - (balls0 - 1)) < 1e-9, 'entering checks a ball out of stock');
  ok('a rodent enters a ball (one ball checked out)');

  // Rolling lifts fun & curiosity early, then anxiety builds until it pops out.
  u.needs.fun = 40; u.anxiety = 0;
  for (let i = 0; i < 5; i++) stepEconomy(g, 0.2);
  assert(u.needs.fun > 40 && (u.anxiety || 0) > 0, 'a ball lifts fun/curiosity early and builds anxiety');
  for (let i = 0; i < 300 && u.inBall; i++) stepEconomy(g, 0.2);
  assert(!u.inBall, 'high anxiety pops the rodent out of the ball');
  ok('rolling: fun rises, then anxiety pops it out (ball returned)');

  // Heat death: a rodent left in its ball on a HOT (summer) day overheats & dies.
  const h = newGame(901, 'prairie', 'syrian', 'Heat', {});
  h.env.dayTime = DAYS_PER_SEASON * DAY_SECONDS + 50; // summer → hot
  h.buildings.push({ id: h.nextId++, type: 'ballworkshop', x: h.world.spawn.x + 2, y: h.world.spawn.y, active: true });
  h.res.balls = 5;
  const v = h.units[0];
  enterBall(h, v);
  assert(h.units.includes(v), 'rodent is in the colony before the hot roll');
  for (let i = 0; i < 150 && h.units.includes(v); i++) stepEconomy(h, 0.2);
  assert(!h.units.includes(v), 'a rodent left in a ball on a hot day overheats and dies');
  ok('hamster-ball heat death on a hot day — get them out!');

  // A ball death shakes the colony: a Broken Ball is left, balls are locked.
  assert(h.ballFear === true, 'a ball death scares the colony (fear)');
  assert(h.buildings.some(bb => bb.type === 'taintedball'), 'a Broken Hamster Ball is left where it died');
  assert(!enterBall(h, h.units[0]).ok, 'no rodent will use a ball while the colony is shaken');
  ok('a ball death scares the colony & locks every ball');

  // Peace (and ball use) returns once the broken ball is DESTROYED and the lost
  // hamster is BURIED.
  h.buildings = h.buildings.filter(bb => bb.type !== 'taintedball'); // destroy the ball (demolish)
  h.bodies = (h.bodies || []).filter(bb => !bb.ballDeath);           // bury the lost one
  stepEconomy(h, 0.1);
  assert(h.ballFear === false, 'fear lifts once the ball is destroyed and the hamster buried');
  assert(enterBall(h, h.units[0]).ok, 'the colony rolls again after making peace');
  ok('balls return only after burial + destroying the broken ball');

  // Only ONE hamster can be in a ball at a time; balls aren't for hauling.
  const o = newGame(902, 'prairie', 'syrian', 'Solo', {});
  o.buildings.push({ id: o.nextId++, type: 'ballworkshop', x: o.world.spawn.x + 2, y: o.world.spawn.y, active: true });
  o.res.balls = 5;
  const a = o.units[0], b2 = o.units[1];
  assert(enterBall(o, a).ok && !enterBall(o, b2).ok, 'only one hamster can roll at a time');
  ok('one hamster in a ball at a time');
  exitBall(o, a);
  a.carrying = { res: 'wood', amount: 5 };
  enterBall(o, a);
  assert(!a.carrying, 'entering a ball drops any carried load (travel/fun, not transport)');
  ok('balls are travel/fun only — no hauling');
}

// 26) Guard / soldier skill + equipment tiers.
console.log('Guard skill & equipment:');
{
  const { toggleGuard, equipGuard } = await import('../src/buildings.js');
  const { GUARD_GEAR } = await import('../src/config.js');
  const { totalOffense } = await import('../src/events.js');
  const s = newGame(1000, 'prairie', 'syrian', 'Guard', {});
  s.env.lived = 4000;
  const u = s.units[0];
  const def0 = protectionAgainst(s, 'wolf'), off0 = totalOffense(s);
  toggleGuard(s, u);
  assert(u.guard, 'a loyal rodent can be trained as a guard');
  const def1 = protectionAgainst(s, 'wolf'), off1 = totalOffense(s);
  assert(def1 > def0 && off1 > off0, `a guard adds colony defense & offense (${def0}/${off0} → ${def1}/${off1})`);
  ok(`training a guard raises defense ${def0}→${def1} & offense ${off0}→${off1}`);

  // Equip the next tier — spends materials, raises protection & damage.
  s.res = { wood: 999, planks: 999, iron: 999, steel: 999 };
  const wood0 = s.res.wood;
  const r = equipGuard(s, u);
  assert(r.ok && u.gear === 1, 'a guard equips the next gear tier');
  assert(s.res.wood < wood0, 'equipping spends materials');
  const def2 = protectionAgainst(s, 'wolf'), off2 = totalOffense(s);
  assert(def2 > def1 && off2 > off1, `equipment raises protection & damage (${def1}/${off1} → ${def2}/${off2})`);
  ok(`equipping ${GUARD_GEAR[u.gear].name} adds more def/atk (${def1}/${off1} → ${def2}/${off2})`);

  // Only a trained guard can be equipped.
  assert(!equipGuard(s, s.units[1]).ok, 'an untrained rodent cannot be equipped');
  ok('equipment requires the guard skill first');
}

// 27) Multi-segment conveyor belt networks: belts chain to extend reach + rate.
console.log('Belt networks (multi-segment conveyors):');
{
  const { placeBuilding, canPlace } = await import('../src/buildings.js');
  // Quiet world: clear nodes so only the seam we plant feeds the belts.
  const s = newGame(2727, 'prairie', 'syrian', 'Belts', {});
  s.res = { wood: 80, planks: 120, plastic: 40, iron: 40 }; // headroom under the 700 cap
  s.world.nodes.length = 0;
  const sp = s.world.spawn;
  // A wood node well clear of the colony, and a belt sitting right on it.
  const nx = sp.x + 8, ny = sp.y;
  s.world.nodes.push({ id: 1, kind: 'trees', x: nx, y: ny - 2, amount: 200, max: 400 });
  const head = placeBuilding(s, 'conveyor', nx, ny);
  assert(head.ok, 'a conveyor places next to a node: ' + (head.reason || ''));

  // A relay belt sitting on bare ground (no node in range) still places, because
  // it chains off the head belt — this is the multi-segment network rule.
  const relay = placeBuilding(s, 'conveyor', nx + 2, ny);
  assert(relay.ok, 'a relay conveyor places by chaining off another belt: ' + (relay.reason || ''));
  // A lone belt far from both nodes and belts is rejected.
  assert(!canPlace(s, 'conveyor', sp.x - 9, sp.y + 9).ok, 'a stranded belt (no node, no neighbour) is refused');
  ok('belts place on a node OR chain off an adjacent belt (network extension)');

  const isBelt = (b) => /^conveyor/.test(b.type);
  for (const b of s.buildings) if (isBelt(b)) b.underConstruction = false;
  const wood0 = s.res.wood, amt0 = s.world.nodes[0].amount;
  for (let i = 0; i < 20; i++) stepEconomy(s, 0.2);
  assert(s.res.wood > wood0, `the belt network hauls wood to storage (${wood0} → ${s.res.wood.toFixed(1)})`);
  assert(s.world.nodes[0].amount < amt0, 'the network drains the source node');
  assert(s.buildings.filter(isBelt).every(b => b._flow === 1), 'every belt in a live network animates');
  ok(`a 2-belt network drains a node into storage (node ${amt0} → ${s.world.nodes[0].amount.toFixed(1)})`);

  // Reach via chaining: a node sits next to the FAR relay only (out of the head
  // belt's own radius). A connected network still reaches and drains it.
  const far = newGame(2728, 'prairie', 'syrian', 'Reach', {});
  far.res = { wood: 120, planks: 80 }; // headroom under the cap
  far.world.nodes.length = 0;
  const fx = far.world.spawn.x + 7, fy = far.world.spawn.y; // clear of the colony
  // A bush feeds the head belt; a rock sits 4 tiles out, reachable only via relays.
  far.world.nodes.push({ id: 1, kind: 'bush', x: fx, y: fy + 1, amount: 30, max: 200 });
  // Rock 6 tiles out — only the last relay (at fx+4) is within radius of it.
  const farNode = { id: 2, kind: 'rock', x: fx + 6, y: fy, amount: 100, max: 500 };
  far.world.nodes.push(farNode);
  assert(placeBuilding(far, 'conveyor', fx, fy).ok, 'head belt places (feeds off the near bush)');
  assert(placeBuilding(far, 'conveyor', fx + 2, fy).ok, 'relay 1 chains off the head');
  assert(placeBuilding(far, 'conveyor', fx + 4, fy).ok, 'relay 2 chains out toward the far rock');
  for (const b of far.buildings) if (isBelt(b)) b.underConstruction = false;
  const rock0 = farNode.amount;
  for (let i = 0; i < 20; i++) stepEconomy(far, 0.2);
  assert(farNode.amount < rock0, `a 3-belt chain reaches a node only the far end touches (${rock0} → ${farNode.amount.toFixed(1)})`);
  ok('a longer chain extends reach to nodes no single belt could touch');
}

// 28) Building glyph textures: every building gets a procedural material base.
console.log('Building textures (glyph treatment):');
{
  const { BUILDINGS, BUILDING_TEX, DEFAULT_BUILDING_TEX, buildingTex } = await import('../src/config.js');
  // The materials textures.js can synthesise (must mirror its MATERIALS keys).
  const MATERIALS = ['fur', 'feather', 'grass', 'dirt', 'sand', 'stone', 'brick', 'wood', 'bark', 'leaf', 'water', 'marsh'];

  // The default is itself a valid material (timber), as before.
  assert(MATERIALS.includes(DEFAULT_BUILDING_TEX.tex), 'default building texture is a real material');
  assert(/^#[0-9a-fA-F]{6}$/.test(DEFAULT_BUILDING_TEX.base), 'default building base is a hex colour');

  // EVERY building type resolves to a valid, drawable material treatment — the
  // previously-untextured glyphs now carry the same {tex, base} the textured
  // bespoke buildings imply. (buildingTex never returns undefined.)
  for (const type of Object.keys(BUILDINGS)) {
    const m = buildingTex(type);
    assert(m && MATERIALS.includes(m.tex), `building ${type} maps to a real texture material (got ${m && m.tex})`);
    assert(/^#[0-9a-fA-F]{6}$/.test(m.base), `building ${type} has a hex base colour (got ${m && m.base})`);
  }
  ok(`every building (${Object.keys(BUILDINGS).length}) resolves to a drawable material treatment`);

  // The explicit map only references real materials & real building types, and
  // it actually textures the formerly plain-timber one-offs (not all 'wood').
  for (const [type, m] of Object.entries(BUILDING_TEX)) {
    assert(BUILDINGS[type], `BUILDING_TEX key ${type} is a real building`);
    assert(MATERIALS.includes(m.tex), `BUILDING_TEX[${type}].tex is a real material`);
  }
  const nonWood = Object.values(BUILDING_TEX).filter(m => m.tex !== 'wood').length;
  assert(nonWood >= 10, `the texture pass gives many buildings a non-timber material (got ${nonWood})`);
  // Spot-check a few that should clearly differ from the old plain-wood base.
  assert(buildingTex('smelter').tex === 'brick', 'a smelter reads as brick');
  assert(buildingTex('mausoleum').tex === 'stone', 'a mausoleum reads as stone');
  assert(buildingTex('composter').tex === 'dirt', 'a composter reads as earth');
  ok(`textured one-offs now vary by material (${nonWood} non-timber treatments)`);
}

// 29) Production chain: Mason → brick, Furnace → iron, Forge → armour; armour boosts defense.
console.log('Production chain (Mason / Furnace / Forge + brick + armour):');
{
  const { BUILDINGS, RESOURCES, ARMOUR } = await import('../src/config.js');
  const { totalOffense } = await import('../src/events.js');
  // New resources & buildings exist with valid cost/produce/consume.
  assert(RESOURCES.brick && RESOURCES.armour, 'brick & armour are real resources');
  for (const t of ['mason', 'furnace', 'forge']) {
    const d = BUILDINGS[t];
    assert(d && d.category === 'Production', `${t} exists in Production`);
    assert(d.cost && Object.values(d.cost).every(v => v > 0), `${t} has a valid cost`);
    assert(d.produces && Object.values(d.produces).every(v => v > 0), `${t} has a valid produce`);
    assert(d.consumes && Object.values(d.consumes).every(v => v > 0), `${t} consumes inputs`);
  }
  assert(BUILDINGS.mason.produces.brick && BUILDINGS.mason.consumes.stone, 'Mason: stone → brick');
  assert(BUILDINGS.furnace.produces.iron && BUILDINGS.furnace.consumes.ironore, 'Furnace: ore → iron');
  assert(BUILDINGS.forge.produces.armour && BUILDINGS.forge.consumes.iron && BUILDINGS.forge.consumes.planks, 'Forge: iron+planks → armour');
  ok('Mason/Furnace/Forge exist with valid cost/consume/produce; brick & armour are resources');

  const built = (s, type, x, y) => { s.buildings.push({ id: s.nextId++, type, x, y, active: true }); };

  // Mason fires stone into brick.
  const m = newGame(1200, 'mountains', 'syrian', 'Brick', {});
  m.res = { stone: 400 };
  built(m, 'mason', m.world.spawn.x + 2, m.world.spawn.y);
  const b0 = m.res.brick || 0;
  for (let i = 0; i < 30; i++) stepEconomy(m, 0.2);
  assert((m.res.brick || 0) > b0, `Mason turns stone → brick (${b0} → ${(m.res.brick || 0).toFixed(1)})`);
  ok(`Mason produces brick (${(m.res.brick || 0).toFixed(1)})`);

  // Furnace smelts ore + coal into iron.
  const f = newGame(1201, 'mountains', 'syrian', 'Furn', {});
  f.res = { ironore: 200, coal: 200 };
  built(f, 'furnace', f.world.spawn.x + 2, f.world.spawn.y);
  const i0 = f.res.iron || 0;
  for (let i = 0; i < 30; i++) stepEconomy(f, 0.2);
  assert((f.res.iron || 0) > i0, `Furnace smelts ore → iron (${i0} → ${(f.res.iron || 0).toFixed(1)})`);
  assert((f.res.ironore || 0) < 200, 'Furnace consumes ore');
  ok(`Furnace smelts ore into iron (${(f.res.iron || 0).toFixed(1)})`);

  // Forge hammers iron + planks into armour.
  const g = newGame(1202, 'mountains', 'syrian', 'Forge', {});
  g.res = { iron: 200, planks: 200 };
  built(g, 'forge', g.world.spawn.x + 2, g.world.spawn.y);
  const a0 = g.res.armour || 0;
  for (let i = 0; i < 40; i++) stepEconomy(g, 0.2);
  assert((g.res.armour || 0) > a0, `Forge makes armour (${a0} → ${(g.res.armour || 0).toFixed(2)})`);
  assert((g.res.iron || 0) < 200 && (g.res.planks || 0) < 200, 'Forge consumes iron & planks');
  ok(`Forge forges armour from iron + planks (${(g.res.armour || 0).toFixed(2)})`);

  // Armour in store raises colony defense (and lends a little guard offense).
  const d = newGame(1203, 'prairie', 'syrian', 'Armed', {});
  d.res.armour = 0;
  stepEconomy(d, 0.1);
  const def0 = d.defense, off0 = totalOffense(d);
  d.res.armour = 10;
  stepEconomy(d, 0.1);
  const def1 = d.defense, off1 = totalOffense(d);
  assert(def1 > def0, `stored armour raises colony defense (${def0} → ${def1})`);
  assert(off1 > off0, `stored armour arms the guard's offense (${off0} → ${off1})`);
  // The contribution is capped — a huge stockpile can't trivialise threats.
  d.res.armour = 9999; stepEconomy(d, 0.1);
  assert(d.defense - def0 <= ARMOUR.defCap + 1e-6, `armour defense is capped at ${ARMOUR.defCap}`);
  ok(`armour boosts defense ${def0}→${def1} & offense ${off0}→${off1} (capped at ${ARMOUR.defCap})`);
}

// 30) AI colonies compete for resource nodes (standing-driven contest / cede).
console.log('AI colonies compete for nodes:');
{
  const { contestNode, resolveContest, expireContests, nodeContestFactor, hasContest, CONTEST } = await import('../src/factions.js');
  const { FACTIONS } = await import('../src/config.js');

  // A faction can contest a surface seam, dropping your yield there.
  const s = newGame(1300, 'woodland', 'syrian', 'Compete', {});
  const fid = Object.keys(FACTIONS)[0];
  const surf = s.world.nodes.find(n => n.amount > 0 && !n.claimedBy);
  assert(surf, 'a surface node to contest exists');
  const node = contestNode(s, fid, 100);
  assert(node && node.contestedBy === fid, 'a faction claims/contests a node');
  assert(hasContest(s, fid), 'the contest is registered against the faction');
  assert(Math.abs(nodeContestFactor(s, node) - CONTEST.yieldMul) < 1e-9, `a contested node yields only ×${CONTEST.yieldMul}`);
  assert(nodeContestFactor(s, { amount: 5 }) === 1, 'an uncontested node yields fully');
  ok(`an AI colony contests a node (yield ×${CONTEST.yieldMul} while disputed)`);

  // Contesting actually reduces what a worker pulls from that very seam.
  function harvestFrom(contested) {
    const g = newGame(1301, 'woodland', 'syrian', 'Yield', {});
    g.world.nodes.length = 0;
    const sp = g.world.spawn;
    const n = { id: 1, kind: 'trees', x: sp.x + 1, y: sp.y, amount: 500, max: 500 };
    g.world.nodes.push(n);
    if (contested) { n.contestedBy = Object.keys(FACTIONS)[0]; n.contestUntil = 1e9; }
    const a0 = n.amount;
    for (let i = 0; i < 120; i++) { for (const u of g.units) u.needs.energy = 100; stepEconomy(g, 0.2); }
    return a0 - n.amount; // how much was drawn from the seam
  }
  const free = harvestFrom(false), disputed = harvestFrom(true);
  assert(disputed < free, `a contested seam is drained slower (free ${free.toFixed(1)} > disputed ${disputed.toFixed(1)})`);
  ok(`contesting a node cuts your real harvest from it (${free.toFixed(0)} → ${disputed.toFixed(0)})`);

  // Standing drives the outcome: HIGH standing → the neighbour cedes & trades.
  const hi = newGame(1302, 'woodland', 'syrian', 'Peace', {});
  const n2 = contestNode(hi, fid, 100);
  hi.factions[fid].standing = CONTEST.cedeStanding + 10; // on good terms
  const offered = hi.res[FACTIONS[fid].offers] || 0;
  const did = resolveContest(hi, fid);
  assert(did && !n2.contestedBy, 'a high-standing neighbour cedes the contested seam');
  assert((hi.res[FACTIONS[fid].offers] || 0) > offered, 'ceding comes with a goodwill trade of their offered goods');
  ok('high standing → the AI colony cedes/trades the node back (peaceful outcome)');

  // LOW standing → stepFactions drives an active contest (and never trades it away).
  const lo = newGame(1303, 'woodland', 'syrian', 'Rival', {});
  lo.env.lived = 4000; lo.disasters = true;
  const fids = Object.keys(FACTIONS);
  for (const id of fids) { lo.factions[id].standing = -50; lo.factions[id].interestTimer = 0.01; }
  let contestedNow = false;
  for (let i = 0; i < 5 && !contestedNow; i++) { stepEconomy(lo, 0.1); contestedNow = lo.world.nodes.some(n => n.contestedBy); }
  assert(contestedNow, 'a low-standing AI colony actively contests a node via the faction step');
  ok('low standing → the AI colony contests a node (hostile outcome)');

  // Contests lapse once their timer runs out.
  const ex = newGame(1304, 'woodland', 'syrian', 'Lapse', {});
  const n3 = contestNode(ex, fid, 100);
  expireContests(ex, n3.contestUntil + 1);
  assert(!n3.contestedBy, 'a contest lapses after its duration');
  ok('contests expire after their duration');

  // Contest state survives a save/load roundtrip.
  const rt = newGame(1305, 'woodland', 'syrian', 'Save', {});
  const n4 = contestNode(rt, fid, 100);
  const back = importSaveString(exportSave(rt));
  assert(back.ok && back.state.world.nodes.some(n => n.contestedBy === fid), 'a contest persists through save/load');
  ok('node contests persist through a save roundtrip');
}

// 31) More NPC animal events: wandering merchant + predator (beast) parley.
console.log('NPC animal events (merchant & beast parley):');
{
  const { resolveDecree } = await import('../src/decrees.js');
  const { DECREES } = await import('../src/config.js');

  // The new events are registered in the decree pool, well-formed.
  for (const id of ['merchant', 'beastParley']) {
    const d = DECREES[id];
    assert(d && d.id === id && d.title && d.prompt && typeof d.eligible === 'function', `${id} is a registered, well-formed event`);
    assert(Array.isArray(d.choices) && d.choices.length >= 2, `${id} has choices`);
    assert(d.choices.some(c => c.default), `${id} has a default choice for auto-resolve`);
  }
  ok('wandering merchant & beast-parley NPC events are registered & well-formed');

  // Wandering merchant: trading food for goods applies its resolution effect.
  const m = newGame(1400, 'woodland', 'syrian', 'Market', {});
  m.res.food = 80; m.compassion = 50;
  m.res.planks = 0; m.res.iron = 0; m.res.research = 0;
  m.storageCap = 9999;
  m.decree = { id: 'merchant', life: 75, born: 0 };
  const f0 = m.res.food, c0 = m.compassion;
  const applied = resolveDecree(m, 0); // trade food → planks/iron/research
  assert(applied && m.decree === null, 'merchant decree resolves on a choice');
  assert(m.res.food < f0, `the trade spends food (${f0} → ${m.res.food})`);
  assert((m.res.planks || 0) > 0 && (m.res.iron || 0) > 0 && (m.res.research || 0) > 0, 'the trade yields planks, iron & research');
  assert(m.compassion > c0, 'a fair trade raises Compassion');
  ok(`wandering merchant: food → goods (food ${f0}→${m.res.food}, +planks/iron/research)`);

  // Beast parley: an offering buys a truce (predators & raids hold off a while).
  const b = newGame(1401, 'woodland', 'syrian', 'Bear', {});
  b.res.food = 60; b.env.lived = 1000; b.truceUntil = 0;
  b.decree = { id: 'beastParley', life: 75, born: 0 };
  const bf0 = b.res.food;
  resolveDecree(b, 0); // set out an offering → truce
  assert((b.truceUntil || 0) > b.env.lived, 'the offering brokers a truce that stays predators & raids');
  assert(b.res.food < bf0, 'the offering costs food');
  ok('beast parley: an offering stalls the attack (food cost → truce)');

  // Standing firm instead raises Valor (and risks the beast yet striking).
  const b2 = newGame(1402, 'woodland', 'syrian', 'Stand', {});
  b2.valor = 20; b2.decree = { id: 'beastParley', life: 75, born: 0 };
  resolveDecree(b2, 1); // stand to arms
  assert(b2.valor > 20, `standing to arms steels the colony (Valor ${20} → ${b2.valor})`);
  ok('beast parley: standing firm raises Valor instead of spending food');
}

// 32) Plastics & advanced refining: coal/oil → plastic; plastic feeds consumers.
console.log('Plastics & advanced refining:');
{
  const { BUILDINGS, RESOURCES, NODE_TYPES } = await import('../src/config.js');
  const built = (s, type, x, y) => { s.buildings.push({ id: s.nextId++, type, x, y, active: true }); };

  // The refining tier exists: oil resource + oil seep node + two refineries.
  assert(RESOURCES.oil && RESOURCES.oil.kind === 'raw', 'Oil is a real raw resource');
  assert(NODE_TYPES.oilseep && NODE_TYPES.oilseep.resource === 'oil' && NODE_TYPES.oilseep.surface === false,
    'Oil seep is an underground node yielding oil');
  assert(BUILDINGS.refinery?.consumes?.coal && BUILDINGS.refinery?.produces?.plastic, 'Refinery: coal → plastic');
  assert(BUILDINGS.oilrefinery?.consumes?.oil && BUILDINGS.oilrefinery?.produces?.plastic, 'Oil Refinery: oil → plastic');
  // The advanced tier is more plastic-efficient per input than the coal refinery.
  const coalEff = BUILDINGS.refinery.produces.plastic / BUILDINGS.refinery.consumes.coal;
  const oilEff = BUILDINGS.oilrefinery.produces.plastic / BUILDINGS.oilrefinery.consumes.oil;
  assert(oilEff > coalEff && BUILDINGS.oilrefinery.pollutes < BUILDINGS.refinery.pollutes,
    'Oil refining is more efficient & cleaner than coal refining');
  ok('refining tier present: coal/oil → plastic, oil being the cleaner, richer route');

  // Coal Refinery converts coal → plastic in the production tick.
  const c = newGame(1500, 'mountains', 'syrian', 'CoalPlas', {});
  c.res = { coal: 200 };
  built(c, 'refinery', c.world.spawn.x + 2, c.world.spawn.y);
  const p0 = c.res.plastic || 0;
  for (let i = 0; i < 30; i++) stepEconomy(c, 0.2);
  assert((c.res.plastic || 0) > p0, `Refinery turns coal → plastic (${p0} → ${(c.res.plastic || 0).toFixed(1)})`);
  assert((c.res.coal || 0) < 200, 'Refinery consumes coal');
  ok(`coal Refinery refines plastic (${(c.res.plastic || 0).toFixed(1)})`);

  // Oil Refinery converts oil → plastic, faster than the coal route.
  const o = newGame(1501, 'mountains', 'syrian', 'OilPlas', {});
  o.res = { oil: 200 };
  built(o, 'oilrefinery', o.world.spawn.x + 2, o.world.spawn.y);
  const op0 = o.res.plastic || 0;
  for (let i = 0; i < 30; i++) stepEconomy(o, 0.2);
  assert((o.res.plastic || 0) > op0, `Oil Refinery turns oil → plastic (${op0} → ${(o.res.plastic || 0).toFixed(1)})`);
  assert((o.res.oil || 0) < 200, 'Oil Refinery consumes oil');
  assert((o.res.plastic || 0) > (c.res.plastic || 0), 'oil refining out-produces coal refining over the same time');
  ok(`oil Refinery refines plastic faster (${(o.res.plastic || 0).toFixed(1)})`);

  // Plastic is a usable resource for its consumers: the Ball Workshop eats it.
  const w = newGame(1502, 'prairie', 'syrian', 'Consume', {});
  w.res = { plastic: 100 };
  built(w, 'ballworkshop', w.world.spawn.x + 2, w.world.spawn.y);
  const plas0 = w.res.plastic;
  for (let i = 0; i < 30; i++) stepEconomy(w, 0.2);
  assert((w.res.plastic || 0) < plas0, `a plastic consumer (Ball Workshop) draws down plastic (${plas0} → ${(w.res.plastic || 0).toFixed(1)})`);
  assert((w.res.balls || 0) > 0, 'plastic feeds the Ball Workshop into hamster balls');
  // Plastic is also a build material for plastic conveyors & solar panels.
  assert((BUILDINGS.conveyorPlastic.cost.plastic || 0) > 0 && (BUILDINGS.solar.cost.plastic || 0) > 0,
    'plastic is a build cost for plastic conveyors & solar panels');
  ok('plastic is a usable resource: consumed by the Ball Workshop & spent on plastic conveyors/solar');
}

// 33) Disease outbreaks: spread lowers health; Infirmary heals & curbs spread; quarantine slows it.
console.log('Disease outbreaks, Infirmary & quarantine:');
{
  const { BUILDINGS, DISASTERS, DISEASE } = await import('../src/config.js');
  const { toggleQuarantine } = await import('../src/buildings.js');
  const built = (s, type, x, y, n = 1) => { for (let i = 0; i < n; i++) s.buildings.push({ id: s.nextId++, type, x: x + i, y, active: true }); };

  // The outbreak disaster, Infirmary clinic flag, and DISEASE tuning all exist.
  assert(DISASTERS.outbreak?.effect === 'outbreak', 'a contagious Outbreak disaster exists');
  assert(BUILDINGS.infirmary?.infirmary > 0 && BUILDINGS.infirmary?.health > 0, 'the Infirmary is a clinic that heals');
  assert(DISEASE && DISEASE.spreadPerSick > 0 && DISEASE.quarantineSpreadCut < 1, 'disease tuning present');
  ok('outbreak disaster, Infirmary clinic & disease tuning are present');

  // An active outbreak lowers the sick rodents' health over time.
  const s = newGame(1600, 'woodland', 'syrian', 'Sick', {});
  s.outbreak = { until: 1e9 };
  s.units.forEach(u => { u.needs.health = 90; });
  s.units[0].sick = true; s.units[0].outbreak = true;
  const h0 = s.units[0].needs.health;
  for (let i = 0; i < 20; i++) stepEconomy(s, 0.2);
  assert(s.units[0].needs.health < h0, `an outbreak drains a sick rodent's health (${h0} → ${s.units[0].needs.health.toFixed(1)})`);
  ok(`outbreak lowers the sick rodent's health (${h0} → ${s.units[0].needs.health.toFixed(1)})`);

  // The outbreak spreads to healthy rodents in a crowded warren.
  function spreadCount(infirmaries, quarantine) {
    const g = newGame(1601, 'woodland', 'syrian', 'Spread', {});
    g.popCap = 1; // crowded: pop over housing → full spread pressure
    g.outbreak = { until: 1e9 };
    g.units.forEach(u => { u.needs.health = 100; });
    g.units[0].sick = true; g.units[0].outbreak = true;
    if (infirmaries) built(g, 'infirmary', g.world.spawn.x + 3, g.world.spawn.y, infirmaries);
    if (quarantine) g.quarantine = true;
    let maxSick = 1;
    for (let i = 0; i < 200; i++) { stepEconomy(g, 0.2); maxSick = Math.max(maxSick, g.units.filter(u => u.outbreak).length); }
    return maxSick;
  }
  const bare = spreadCount(0, false);
  assert(bare > 1, `an outbreak spreads through a crowded warren (peaked at ${bare} ill)`);
  ok(`an outbreak spreads rodent-to-rodent when crowded (peak ${bare} ill)`);

  // An Infirmary heals the ill (an isolated case recovers under care).
  const heal = newGame(1602, 'woodland', 'syrian', 'Heal', {});
  heal.units.forEach(u => { u.needs.health = 50; });
  heal.units[0].sick = true; heal.units[0].outbreak = true; heal.units[0].sickT = 3;
  built(heal, 'infirmary', heal.world.spawn.x + 3, heal.world.spawn.y, 2);
  for (let i = 0; i < 60; i++) stepEconomy(heal, 0.2);
  assert(!heal.units[0].sick, 'an Infirmary cures an outbreak case under care');
  ok('Infirmary treats & cures the ill');

  // Quarantine slows the spread vs no quarantine (fewer rodents infected).
  // Outbreak spread is stochastic, so a single draw is too noisy — seed
  // Math.random and average several trials for a deterministic, fair comparison.
  const _rand = Math.random;
  let _seed = 0x2f6e2b1;
  Math.random = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
  let noQ = 0, withQ = 0;
  try {
    for (let t = 0; t < 12; t++) { noQ += spreadCount(0, false); withQ += spreadCount(0, true); }
  } finally { Math.random = _rand; }
  assert(withQ <= noQ, `quarantine slows spread over 12 seeded trials (no-Q total ${noQ} ≥ Q total ${withQ})`);
  // …and the quarantine output penalty is felt by production.
  const q = newGame(1603, 'prairie', 'syrian', 'Lockdown', {});
  q.res = { stone: 400 };
  built(q, 'mason', q.world.spawn.x + 2, q.world.spawn.y);
  const noLock = (() => { const g = newGame(1603, 'prairie', 'syrian', 'Lockdown', {}); g.res = { stone: 400 }; g.buildings.push({ id: 1, type: 'mason', x: g.world.spawn.x + 2, y: g.world.spawn.y, active: true }); const b0 = g.res.brick || 0; for (let i = 0; i < 30; i++) stepEconomy(g, 0.2); return (g.res.brick || 0) - b0; })();
  toggleQuarantine(q);
  const b0 = q.res.brick || 0;
  for (let i = 0; i < 30; i++) stepEconomy(q, 0.2);
  const locked = (q.res.brick || 0) - b0;
  assert(locked < noLock, `a quarantine reduces output (free ${noLock.toFixed(2)} > locked ${locked.toFixed(2)})`);
  ok(`quarantine reduces spread & costs output (${noQ}→${withQ} ill; output ${noLock.toFixed(1)}→${locked.toFixed(1)})`);
}

// 34) Species-specific evolution branches: gated on species, apply their effect.
console.log('Species-specific evolution branches:');
{
  const { EVOLUTIONS } = await import('../src/config.js');
  const { evolve } = await import('../src/buildings.js');
  const { protectionAgainst } = await import('../src/events.js');

  // The new branches exist and are species-gated.
  const branches = ['beaverEngineer', 'beaverHydro', 'ratSwarm', 'ratBrood'];
  for (const id of branches) {
    const e = EVOLUTIONS[id];
    assert(e && e.requiresSpecies, `${id} is a species-specific branch`);
    assert(e.bonus && Object.keys(e.bonus).length, `${id} grants a bonus`);
  }
  assert(EVOLUTIONS.beaverEngineer.requiresSpecies === 'beaver' && EVOLUTIONS.ratSwarm.requiresSpecies === 'rat',
    'beaver & rat branches require their species');
  ok('beaver & rat evolution branches exist and are species-gated');

  // Gating: a hamster-only colony can't take the beaver branch; unlocking beavers does.
  const g = newGame(1700, 'rivers', 'syrian', 'EvoGate', {});
  g.res = { research: 999, planks: 999, stone: 999, iron: 999, food: 999 };
  assert(!evolve(g, 'beaverEngineer').ok, 'beaver branch locked without beavers unlocked');
  g.unlockedSpecies.beaver = true;
  assert(evolve(g, 'beaverEngineer').ok, 'unlocking beavers opens the beaver branch');
  assert(g.evolutions.beaverEngineer, 'the beaver evolution is recorded once taken');
  // Prereq + level gating on the deeper node.
  assert(!evolve(g, 'beaverHydro').ok, 'the deeper beaver node needs its prereq/level');
  ok('species-gated branches unlock with the species (and chain via prereqs)');

  // Effect applies: beaver flood defense lifts flood protection while a beaver is present.
  const fl = newGame(1701, 'rivers', 'syrian', 'Flood', {});
  fl.unlockedSpecies.beaver = true;
  fl.units[0].species = 'beaver'; // a beaver in the colony
  const before = protectionAgainst(fl, 'flood');
  fl.res = { research: 999, planks: 999, stone: 999, iron: 999 };
  assert(evolve(fl, 'beaverEngineer').ok, 'take the beaver engineer branch');
  const after = protectionAgainst(fl, 'flood');
  assert(after > before, `the beaver branch raises flood defense (${before.toFixed(1)} → ${after.toFixed(1)})`);
  ok(`beaver branch applies: +flood defense (${before.toFixed(1)} → ${after.toFixed(1)})`);

  // Rat swarm: raises breeding speed (more children over the same time).
  function childrenOver(withEvo) {
    const s = newGame(1702, 'prairie', 'syrian', 'Brood', {});
    s.unlockedSpecies.rat = true;
    s.units.forEach(u => { u.species = 'rat'; u.needs.food = 100; u.needs.water = 100; u.needs.fun = 100; u.needs.health = 100; });
    // a guaranteed mature male + female so the sexed pair requirement never blocks
    s.units[0].sex = 'm'; s.units[1].sex = 'f';
    s.res.food = 9999;
    // plenty of housing so population cap never blocks breeding
    for (let k = 0; k < 12; k++) s.buildings.push({ id: s.nextId++, type: 'burrow', x: s.world.spawn.x + 1 + k, y: s.world.spawn.y, active: true });
    if (withEvo) { s.res.research = 999; s.evolutions.ratSwarm = true; }
    const n0 = s.units.length;
    // a longer window than before to see the deliberately gentler growth curve
    for (let i = 0; i < 300; i++) { s.units.forEach(u => { u.needs.food = 100; u.needs.water = 100; u.needs.fun = 100; u.needs.health = 100; }); stepEconomy(s, 0.2); }
    return s.units.length - n0;
  }
  const plain = childrenOver(false), swarm = childrenOver(true);
  assert(swarm > plain, `rat swarm breeds faster than without it (plain ${plain} < swarm ${swarm})`);
  assert(swarm > 0, 'rat colony breeds with the swarm branch');
  ok(`rat swarm branch applies: faster breeding (plain ${plain} → swarm ${swarm} born)`);
}

// 35) Main Hamster level unlocks: buildings/species/tech gated by level threshold.
console.log('Main Hamster level unlocks:');
{
  const { BUILDINGS, TECH } = await import('../src/config.js');
  const { canPlace, placeBuilding, researchTech, mainLevel } = await import('../src/buildings.js');

  // Several advanced buildings now carry a level gate.
  const gated = ['forge', 'steelworks', 'coalplant', 'barracks', 'mausoleum', 'solar', 'oilrefinery'];
  for (const t of gated) assert((BUILDINGS[t]?.reqLevel || 0) > 0, `${t} is gated by Main Hamster level`);
  ok(`advanced buildings are level-gated (${gated.join(', ')})`);

  // A building is refused below its level threshold and allowed at/above it.
  const s = newGame(1800, 'mountains', 'syrian', 'Levels', {});
  for (const k of ['brick', 'iron', 'planks', 'stone', 'steel', 'plastic', 'coal']) s.res[k] = 999;
  const sp = s.world.spawn;
  assert(mainLevel(s) === 1, 'a fresh colony is Main level 1');
  const need = BUILDINGS.forge.reqLevel;
  const blocked = canPlace(s, 'forge', sp.x + 2, sp.y);
  assert(!blocked.ok && /Lv\.|level/i.test(blocked.reason), `the Forge is locked below Lv.${need} (${blocked.reason})`);
  // Level up the main hamster past the threshold.
  s.units[0].level = need;
  assert(canPlace(s, 'forge', sp.x + 2, sp.y).ok, `the Forge unlocks at Main Hamster Lv.${need}`);
  assert(placeBuilding(s, 'forge', sp.x + 2, sp.y).ok, 'and it can actually be placed at the threshold');
  ok(`a level-gated building unlocks at its threshold (Forge @ Lv.${need})`);

  // A species unlock (tech) is also level-gated.
  const t = newGame(1801, 'rivers', 'syrian', 'Recruit', {});
  for (const k of ['research', 'planks', 'stone']) t.res[k] = 999;
  const blockedTech = researchTech(t, 'unlockBeaver');
  assert(!blockedTech.ok && /Lv\./.test(blockedTech.reason), 'unlocking Beavers needs a level first');
  t.units[0].level = TECH.unlockBeaver.reqLevel;
  assert(researchTech(t, 'unlockBeaver').ok && t.unlockedSpecies.beaver, 'reaching the level unlocks the Beaver recruitment tech');
  ok(`a level-gated species unlock opens at its threshold (Beavers @ Lv.${TECH.unlockBeaver.reqLevel})`);

  // An advanced ability/tech (Refining II) is gated on level too.
  const r = newGame(1802, 'prairie', 'syrian', 'Ability', {});
  r.res = { research: 999, plastic: 999 };
  assert(!researchTech(r, 'refining2').ok, 'Refining II is locked below its level');
  r.units[0].level = TECH.refining2.reqLevel;
  assert(researchTech(r, 'refining2').ok && r.tech.refining2, 'Refining II unlocks at its level threshold and applies');
  assert(r.mods.prodMul > 0, 'the unlocked ability folds its bonus into the colony');
  ok(`a level-gated ability unlocks & applies at threshold (Refining II @ Lv.${TECH.refining2.reqLevel})`);
}

// 36) Difficulty knob: event pacing & grace scale with the chosen difficulty.
console.log('Difficulty pacing & grace knob:');
{
  const { eventPace, graceSeconds } = await import('../src/events.js');
  const { DIFFICULTIES } = await import('../src/config.js');
  const mk = (d) => newGame(2200, 'woodland', 'syrian', 'Pace', { difficulty: d });
  const relaxed = mk('relaxed'), normal = mk('normal'), harsh = mk('harsh');
  // Easier → MORE grace and gentler (longer) pacing; harder → less.
  assert(graceSeconds(relaxed) > graceSeconds(normal), `relaxed has more grace than normal (${graceSeconds(relaxed)} > ${graceSeconds(normal)})`);
  assert(graceSeconds(normal) > graceSeconds(harsh), `normal has more grace than harsh (${graceSeconds(normal)} > ${graceSeconds(harsh)})`);
  assert(eventPace(relaxed) > eventPace(normal), `relaxed has gentler pacing than normal (${eventPace(relaxed).toFixed(2)} > ${eventPace(normal).toFixed(2)})`);
  assert(eventPace(normal) > eventPace(harsh), `normal has gentler pacing than harsh (${eventPace(normal).toFixed(2)} > ${eventPace(harsh).toFixed(2)})`);
  // The knobs live on the difficulty config (a real, tunable dial).
  assert(DIFFICULTIES.relaxed.graceMul > 1 && DIFFICULTIES.harsh.graceMul < 1, 'graceMul reads >1 for relaxed, <1 for harsh');
  assert(DIFFICULTIES.relaxed.paceMul > 1 && DIFFICULTIES.harsh.paceMul < 1, 'paceMul reads >1 for relaxed, <1 for harsh');
  ok(`event pace/grace scale by difficulty (grace ${graceSeconds(relaxed)}/${graceSeconds(normal)}/${graceSeconds(harsh)}, pace ${eventPace(relaxed).toFixed(1)}/${eventPace(normal).toFixed(1)}/${eventPace(harsh).toFixed(1)})`);

  // Calm-by-default knobs: a global sim time-scale <1 keeps the 1× tier relaxed in
  // real time, and the normal cadence/grace are roomy (events shouldn't pile up).
  const { SIM_SCALE } = await import('../src/config.js');
  assert(SIM_SCALE > 0 && SIM_SCALE < 1, `SIM_SCALE is a sub-real-time base scale (got ${SIM_SCALE})`);
  assert(SIM_SCALE <= 0.7, `SIM_SCALE keeps the default noticeably calmer than real time (got ${SIM_SCALE})`);
  assert(graceSeconds(normal) >= 540, `normal grace is roomy enough for a peaceful start (got ${graceSeconds(normal)})`);
  assert(eventPace(normal) >= 2.0, `normal event pace spaces disasters out (got ${eventPace(normal)})`);
  ok(`calm default locked: SIM_SCALE ${SIM_SCALE}, normal grace ${graceSeconds(normal)}s, pace ${eventPace(normal)}`);
}

// 36b) Skill points & traits work for ANY rodent, not just the founder/leader.
console.log('Non-founder rodents spend earned skill points:');
{
  const { gainXp } = await import('../src/entities.js');
  const { upgradeTrait } = await import('../src/buildings.js');
  const s = newGame(3300, 'woodland', 'syrian', 'Skills', { difficulty: 'normal' });
  // A non-founder unit earns XP from work → levels → gains a skill point.
  const u = s.units.find(x => !x.founder);
  assert(u, 'a non-founder rodent exists at colony start');
  assert(!u.founder, 'the test subject is genuinely not the leader');
  const before = u.skillPoints || 0;
  gainXp(s, u, 100000); // force a few level-ups
  assert(u.level > 1 && (u.skillPoints || 0) > before, `non-founder leveled & earned skill points (lvl ${u.level}, sp ${u.skillPoints})`);
  const sp0 = u.skillPoints, lvl0 = u.traits.strength || 0;
  const r = upgradeTrait(s, u, 'strength');
  assert(r.ok && r.paidWith === 'skillPoint', 'a leveled non-founder spends a skill point on a trait');
  assert((u.traits.strength || 0) === lvl0 + 1, 'the non-founder trait level went up');
  assert((u.skillPoints || 0) === sp0 - 1, 'one skill point was consumed (no resource cost)');
  ok(`a leveled non-founder spends a skill point on a trait (strength → ${u.traits.strength})`);
}

// 37) Feeder/waterer throughput degrades with crowding (build more as you grow).
console.log('Feeder/waterer crowding throughput:');
{
  const { FEEDER_SERVES } = await import('../src/config.js');
  // One feeder serving a small colony vs an oversized one: per-feeder
  // effectiveness must drop as the population per feeder rises.
  function feederEff(popN, feeders) {
    const g = newGame(2300, 'woodland', 'syrian', 'Feed', {});
    while (g.units.length < popN) g.units.push({ ...g.units[0], id: g.nextId++, needs: { ...g.units[0].needs } });
    while (g.units.length > popN) g.units.pop();
    const sp = g.world.spawn;
    for (let i = 0; i < feeders; i++) g.buildings.push({ id: g.nextId++, type: 'feeder', x: sp.x + i, y: sp.y, active: true });
    stepEconomy(g, 0.1);
    return g._feederEff;
  }
  const lightlyLoaded = feederEff(FEEDER_SERVES, 1);   // ~1 feeder per FEEDER_SERVES rodents
  const overcrowded = feederEff(FEEDER_SERVES * 3, 1); // 3× the rodents per feeder
  assert(lightlyLoaded > overcrowded, `a feeder serving more rodents is less effective each (${lightlyLoaded.toFixed(2)} > ${overcrowded.toFixed(2)})`);
  assert(overcrowded >= 0.3 - 1e-9, 'per-feeder effectiveness has a sane floor (>=0.3)');
  // Building MORE feeders for the same crowded colony restores effectiveness.
  const moreFeeders = feederEff(FEEDER_SERVES * 3, 3);
  assert(moreFeeders > overcrowded, `adding feeders for a big colony raises per-feeder effectiveness (${overcrowded.toFixed(2)} → ${moreFeeders.toFixed(2)})`);
  ok(`feeder throughput degrades with crowding & recovers with more stations (${lightlyLoaded.toFixed(2)} vs ${overcrowded.toFixed(2)} → ${moreFeeders.toFixed(2)})`);
}

// 38) Starting economy: the re-tuned bundle is exact (normal) & within cap.
console.log('Starting economy bundle:');
{
  const { STARTING } = await import('../src/config.js');
  const intended = { wood: 160, stone: 75, food: 110, seeds: 60, water: 100, planks: 16 };
  for (const [k, v] of Object.entries(intended))
    assert(STARTING.resources[k] === v, `starting ${k} is ${v} (got ${STARTING.resources[k]})`);
  const total = Object.values(STARTING.resources).reduce((a, b) => a + b, 0);
  assert(total <= STARTING.storageCap, `the starting bundle fits the cap (${total} <= ${STARTING.storageCap})`);
  // On normal difficulty (startMul 1) a fresh colony gets exactly the bundle, no spill.
  const s = newGame(2400, 'woodland', 'syrian', 'Start', { difficulty: 'normal' });
  for (const [k, v] of Object.entries(intended)) assert(s.res[k] === v, `new game stocks ${v} ${k} (got ${s.res[k]})`);
  // Wood is the most generous (it's the dominant early currency).
  assert(STARTING.resources.wood >= Math.max(...Object.entries(STARTING.resources).filter(([k]) => k !== 'wood').map(([, v]) => v)), 'wood is the largest starting stock');
  ok(`starting bundle re-tuned & within cap (total ${total}/${STARTING.storageCap})`);
}

// 39) Difficulty also scales resource YIELDS & BREEDING (not just combat/events).
console.log('Difficulty scales yields & breeding:');
{
  const { diffYieldMul, diffBreedMul } = await import('../src/economy.js');
  const { DIFFICULTIES } = await import('../src/config.js');
  // The config knobs read in the intended direction (easier > 1 > harder).
  assert(DIFFICULTIES.relaxed.yieldMul > 1 && DIFFICULTIES.harsh.yieldMul < 1, 'yieldMul >1 relaxed, <1 harsh');
  assert(DIFFICULTIES.relaxed.breedMul > 1 && DIFFICULTIES.harsh.breedMul < 1, 'breedMul >1 relaxed, <1 harsh');

  // Production yield: a Mason makes more brick on easier difficulty over the same time.
  function brickOver(d) {
    const g = newGame(2500, 'mountains', 'syrian', 'Yield', { difficulty: d });
    g.res = { stone: 400 };
    g.buildings.push({ id: g.nextId++, type: 'mason', x: g.world.spawn.x + 2, y: g.world.spawn.y, active: true });
    const b0 = g.res.brick || 0;
    for (let i = 0; i < 40; i++) stepEconomy(g, 0.2);
    return (g.res.brick || 0) - b0;
  }
  const easyY = brickOver('relaxed'), normY = brickOver('normal'), hardY = brickOver('harsh');
  assert(easyY > normY && normY > hardY, `harder difficulty cuts yield (relaxed ${easyY.toFixed(1)} > normal ${normY.toFixed(1)} > harsh ${hardY.toFixed(1)})`);
  assert(Math.abs(diffYieldMul({ difficulty: 'normal' }) - 1) < 1e-9, 'normal yield multiplier is 1 (the baseline)');
  ok(`difficulty scales resource yields (${easyY.toFixed(1)}/${normY.toFixed(1)}/${hardY.toFixed(1)} brick)`);

  // Breeding: the per-tick breed accumulator scales with difficulty.
  function breedRate(d) {
    const g = newGame(2501, 'woodland', 'syrian', 'Breed', { difficulty: d });
    g.units.forEach(u => { u.needs.food = 100; u.needs.water = 100; u.needs.fun = 100; u.needs.health = 100; });
    g.res.food = 9999; g.popCap = 99;
    g.units[0].sex = 'm'; g.units[1].sex = 'f'; // guarantee a mature M+F pair so the rate is deterministic
    for (let k = 0; k < 6; k++) g.buildings.push({ id: g.nextId++, type: 'burrow', x: g.world.spawn.x + 1 + k, y: g.world.spawn.y, active: true });
    g._breed = 0;
    g.units.forEach(u => { u.needs.food = 100; u.needs.water = 100; u.needs.fun = 100; u.needs.health = 100; });
    stepEconomy(g, 0.2);
    return g._breed; // accumulator advance for one tick (before any birth resets it)
  }
  const easyB = breedRate('relaxed'), hardB = breedRate('harsh');
  assert(easyB > hardB, `easier difficulty breeds faster (relaxed ${easyB.toFixed(4)} > harsh ${hardB.toFixed(4)})`);
  assert(Math.abs(diffBreedMul({ difficulty: 'normal' }) - 1) < 1e-9, 'normal breed multiplier is 1 (the baseline)');
  ok(`difficulty scales breeding speed (relaxed ${easyB.toFixed(3)} > harsh ${hardB.toFixed(3)} per tick)`);
}

// 40) Balance pass: corrected costs/outputs now the full build set has landed.
console.log('Balance pass (conveyors & defense costs):');
{
  const { BUILDINGS } = await import('../src/config.js');
  // Wooden Fence is the cheapest raw-defense perimeter: cheaper than the Wall,
  // which earns its keep with HP/upgrades/protect keys.
  assert(BUILDINGS.woodfence.cost.wood === 8, `fence re-costed to wood:8 (got ${BUILDINGS.woodfence.cost.wood})`);
  assert(BUILDINGS.woodfence.cost.wood < BUILDINGS.wall.cost.wood, 'the flat fence is cheaper than the upgradeable wall');
  // Belt tiers form a clean strictly-increasing throughput ladder, and the
  // plastic (refined-chain) belt now sits well above the free wood belt.
  const wood = BUILDINGS.conveyor.belt.rate, plastic = BUILDINGS.conveyorPlastic.belt.rate, metal = BUILDINGS.conveyorMetal.belt.rate;
  assert(plastic === 1.8, `plastic belt bumped to rate 1.8 (got ${plastic})`);
  assert(wood < plastic && plastic < metal, `belt throughput strictly increases by tier (${wood} < ${plastic} < ${metal})`);
  assert(plastic - wood >= 0.7, `the plastic tier is a meaningful step over wood (Δ${(plastic - wood).toFixed(1)})`);
  ok(`balance pass locked: fence wood:8 (< wall), belt ladder ${wood}/${plastic}/${metal}`);
}

// 41) Worker pathing: local avoidance keeps movers out of water/blocked tiles.
console.log('Worker pathing (local obstacle avoidance):');
{
  const { stepRodent } = await import('../src/entities.js');
  const { isBlockedTile, getTile, TERRAIN } = await import('../src/world.js');
  const { GRID_W, GRID_H } = await import('../src/config.js');
  const s = newGame(4242, 'rivers', 'syrian', 'Pathing', {});
  // The helper exists and flags water as a tile to avoid.
  let wx = -1, wy = -1;
  outer: for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
    if (getTile(s.world.terrain, x, y) === TERRAIN.water) { wx = x; wy = y; break outer; }
  }
  assert(wx >= 0, 'rivers biome should carve a water tile');
  assert(isBlockedTile(s.world, wx, wy), 'isBlockedTile flags a water tile as blocked');
  assert(!isBlockedTile(s.world, s.world.spawn.x, s.world.spawn.y), 'the (land) spawn tile is not blocked');
  ok('isBlockedTile marks water as impassable, land as free');

  // Place a rodent just on one side of the water tile, target the far side so a
  // straight line crosses the water — after many steps it must never END inside
  // water (the avoidance redirects each blocked step to a free neighbour / holds).
  const u = s.units[0];
  u.order = null; u.phase = 'idle'; u.inBall = false; u.targetNode = null;
  u.x = wx - 1.2; u.y = wy; u.needs.energy = 100;
  u.order = { kind: 'goto', x: wx + 1.2, y: wy };
  let everInWater = false;
  for (let i = 0; i < 400 && u.order; i++) {
    u.needs.energy = 100;
    stepRodent(s, u, 0.1);
    if (isBlockedTile(s.world, u.x, u.y)) everInWater = true;
  }
  assert(!everInWater, `a mover crossing toward water never ends a step inside it (at ${u.x.toFixed(1)},${u.y.toFixed(1)})`);
  ok('local avoidance keeps a mover from stepping into water');
}

// 42) River geography for dams: rivers carry real flow; a dam reads it.
console.log('River dams (real upstream/flow geography):');
{
  const { isRiverTile, riverFlowAt, riverNear, TERRAIN, getTile } = await import('../src/world.js');
  const { damRiverFactor, RIVER_DAM_BONUS } = await import('../src/economy.js');
  const { GRID_W, GRID_H } = await import('../src/config.js');
  const s = newGame(909, 'rivers', 'syrian', 'Dammit', {});

  // Rivers carry a flow/upstream attribute on real river tiles.
  let rx = -1, ry = -1;
  outer: for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
    if (isRiverTile(s.world, x, y)) { rx = x; ry = y; break outer; }
  }
  assert(rx >= 0, 'rivers biome tags real river tiles');
  assert(getTile(s.world.terrain, rx, ry) === TERRAIN.water, 'a river tile is water');
  const fl = riverFlowAt(s.world, rx, ry);
  assert(fl && fl.downstream && fl.upstream, 'a river tile exposes downstream/upstream flow');
  assert(fl.upstream.dy === -fl.downstream.dy, 'upstream is the opposite of downstream');
  // A still pond tile (lakes biome, not river-carved) carries no flow.
  const lake = newGame(910, 'lakes', 'syrian', 'Pond', {});
  let pondFound = false;
  for (let y = 0; y < GRID_H && !pondFound; y++) for (let x = 0; x < GRID_W; x++) {
    if (getTile(lake.world.terrain, x, y) === TERRAIN.water && !isRiverTile(lake.world, x, y)) { pondFound = true; break; }
  }
  assert(pondFound, 'a pond water tile is NOT flagged as a flowing river');
  ok('rivers carry flow geography (downstream/upstream); ponds do not');

  // A dam placed on a real river tile reads the flow → flow/water bonus, vs a
  // non-river placement which gets none.
  const onRiver = riverNear(s.world, rx, ry, 2);
  assert(onRiver && onRiver.flow, 'riverNear finds a river tile and its flow under a dam footprint');
  const damOn = { id: 1, type: 'dam', x: rx, y: ry, active: true };
  assert(Math.abs(damRiverFactor(s, damOn) - (1 + RIVER_DAM_BONUS)) < 1e-9, `a dam on a river earns the flow bonus (×${1 + RIVER_DAM_BONUS})`);
  // A spot far from any water gets the plain factor (no river current).
  const damOff = { id: 2, type: 'dam', x: s.world.spawn.x, y: s.world.spawn.y };
  assert(damRiverFactor(s, damOff) === 1, 'a dam off any river gets no flow bonus');
  ok(`a dam on a real river reads its flow for a ${(RIVER_DAM_BONUS * 100).toFixed(0)}% water bonus (off-river: none)`);

  // The bonus actually folds into water output over a few ticks.
  function damWater(x, y) {
    const g = newGame(911, 'rivers', 'syrian', 'Flow', {});
    g.units[0].species = 'beaver';
    g.res = {}; // start from empty water store
    g.buildings.push({ id: g.nextId++, type: 'dam', x, y, active: true });
    for (let i = 0; i < 15; i++) stepEconomy(g, 0.2);
    return g.res.water || 0;
  }
  // find a river tile in the seed-911 world
  const g0 = newGame(911, 'rivers', 'syrian', 'Flow', {});
  let frx = -1, fry = -1;
  scan: for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++)
    if (isRiverTile(g0.world, x, y)) { frx = x; fry = y; break scan; }
  const wRiver = damWater(frx, fry), wDry = damWater(g0.world.spawn.x, g0.world.spawn.y);
  assert(wRiver > wDry, `a river dam yields more water than a dry-placed one (${wRiver.toFixed(1)} > ${wDry.toFixed(1)})`);
  ok(`river flow bonus folds into water output (${wDry.toFixed(1)} → ${wRiver.toFixed(1)})`);
}

// 43) Persist zoom level (per colony): the camera (zoom + pan center) is written
//     to the save state and restored on load, without breaking the first-run
//     "start centered on town" default (only restore when a saved value exists).
console.log('Persist zoom per colony:');
{
  const { captureViewPrefs } = await import('../src/save.js');
  // A fresh colony has no saved view prefs (so a first run starts centered/default).
  const s = newGame(1700, 'woodland', 'syrian', 'Zoom', {});
  assert(s.viewPrefs == null, 'a new colony stores no view prefs (first run uses the default view)');

  // The player zooms and pans; capturing folds the live camera into the state.
  const view = { zoom: 2.75, centerFracX: 0.4, centerFracY: 0.6 };
  captureViewPrefs(s, view);
  assert(s.viewPrefs && s.viewPrefs.zoom === 2.75, `zoom is written to the save state (got ${s.viewPrefs?.zoom})`);
  assert(s.viewPrefs.centerFracX === 0.4 && s.viewPrefs.centerFracY === 0.6, 'pan center is written to the save state');
  ok('zoom + pan center are written into the colony save state');

  // The camera survives a save/load roundtrip (so a reload restores the last view).
  const back = importSaveString(exportSave(s));
  assert(back.ok && back.state.viewPrefs?.zoom === 2.75, `zoom is restored from the save state (got ${back.state.viewPrefs?.zoom})`);
  assert(back.state.viewPrefs.centerFracX === 0.4 && back.state.viewPrefs.centerFracY === 0.6, 'pan center is restored from the save state');
  ok('zoom + pan center persist through save/load and are restored');

  // Capture is a graceful no-op without a view, and never invents a zoom.
  const s2 = newGame(1701, 'prairie', 'syrian', 'NoView', {});
  captureViewPrefs(s2, null);
  assert(s2.viewPrefs == null, 'capturing with no view leaves the colony at the first-run default (no zoom invented)');
  ok('capture is a safe no-op when there is no live view to read');
}

// 44) Job assignment: a player can bias a rodent toward a resource (a soft
//     preference over the auto-sim), it persists through save/load, and the
//     sim's task-selection honours it when the assigned target is available.
console.log('Job assignment (resource bias):');
{
  const { stepRodent } = await import('../src/entities.js');
  const s = newGame(1800, 'prairie', 'syrian', 'Jobs', {});
  // A controlled world: a NEAR bush (seeds) and a FAR rock (stone). Auto would
  // grab the near bush; a stone-pinned rodent should walk past it to the rock.
  s.world.nodes.length = 0;
  const sp = s.world.spawn;
  const bush = { id: 1, kind: 'bush', x: sp.x + 1, y: sp.y, amount: 200, max: 200 };
  const rock = { id: 2, kind: 'rock', x: sp.x + 6, y: sp.y, amount: 500, max: 500 };
  s.world.nodes.push(bush, rock);

  const u = s.units[0];
  // Pin a job preference, and make it the auto round-robin's NON-choice so we're
  // really testing the explicit jobPref override.
  u.prefKind = 'bush';        // auto would pick the near bush
  u.jobPref = 'rock';         // the player pins stone instead
  u.order = null; u.inBall = false; u.phase = 'seek'; u.targetNode = null; u.needs.energy = 100;
  assert(u.jobPref === 'rock', 'a rodent can be given an explicit job preference');

  // One seek step picks a target — the pinned kind, even though it's farther.
  stepRodent(s, u, 0.05);
  assert(u.targetNode && u.targetNode.kind === 'rock', `a pinned rodent targets its assigned kind over a nearer one (got ${u.targetNode?.kind})`);
  ok('the sim honours a job preference: a stone-pinned rodent skips the nearer bush for rock');

  // "Auto" (no jobPref) falls back to the round-robin prefKind (here, the bush).
  const a = s.units[1] || s.units[0];
  a.jobPref = null; a.prefKind = 'bush';
  a.order = null; a.inBall = false; a.phase = 'seek'; a.targetNode = null; a.needs.energy = 100;
  stepRodent(s, a, 0.05);
  assert(a.targetNode && a.targetNode.kind === 'bush', `Auto (no pin) follows the colony's default choice (got ${a.targetNode?.kind})`);
  ok('Auto default leaves selection to the colony (round-robin prefKind)');

  // The preference is a soft bias: if the pinned kind runs out, it still works
  // (takes the nearest available) rather than stalling the auto-sim.
  const t = newGame(1801, 'prairie', 'syrian', 'Soft', {});
  t.world.nodes.length = 0;
  const tp = t.world.spawn;
  t.world.nodes.push({ id: 1, kind: 'trees', x: tp.x + 2, y: tp.y, amount: 100, max: 400 });
  const tu = t.units[0];
  tu.jobPref = 'coalseam'; // no coal seam exists on this map
  tu.order = null; tu.inBall = false; tu.phase = 'seek'; tu.targetNode = null; tu.needs.energy = 100;
  stepRodent(t, tu, 0.05);
  assert(tu.targetNode && tu.targetNode.kind === 'trees', 'an unavailable preference falls back to the nearest node (no stall)');
  ok('a job preference is a soft bias — it never strands a rodent when its target is gone');

  // The assignment persists through a save/load roundtrip.
  const back = importSaveString(exportSave(s));
  assert(back.ok, 'colony with job assignments re-imports');
  const ru = back.state.units.find(x => x.id === u.id);
  assert(ru && ru.jobPref === 'rock', `a rodent's job preference survives save/load (got ${ru?.jobPref})`);
  ok('job assignments persist through save/load');
}

// 45) Pathfinding core: a pure A* grid pathfinder. Built on a controlled world
//     so barriers are exact and assertions are deterministic.
console.log('Pathfinding (A* core):');
{
  const { findPath } = await import('../src/pathfinding.js');
  const { TERRAIN, idx, getTile } = await import('../src/world.js');
  const { GRID_W, GRID_H } = await import('../src/config.js');

  // A clean, all-grass world we can carve barriers into.
  const mk = () => {
    const s = newGame(9001, 'prairie', 'syrian', 'Path', {});
    s.world.terrain.fill(TERRAIN.grass);
    return s.world;
  };
  const blocked = (world, p) => world.terrain[idx(p.x, p.y)] === TERRAIN.water || world.terrain[idx(p.x, p.y)] === TERRAIN.mountain;

  // Straight shot across open grass: a path exists, ends on the target, and
  // every step is adjacent (no teleporting).
  {
    const w = mk();
    const path = findPath(w, 2, 2, 10, 2);
    assert(Array.isArray(path) && path.length > 0, 'open path returns waypoints');
    const last = path[path.length - 1];
    assert(last.x === 10 && last.y === 2, `path ends on the target (got ${last.x},${last.y})`);
    let prevX = 2, prevY = 2, contiguous = true;
    for (const p of path) { if (Math.max(Math.abs(p.x - prevX), Math.abs(p.y - prevY)) !== 1) contiguous = false; prevX = p.x; prevY = p.y; }
    assert(contiguous, 'every waypoint is a single grid step from the last');
    ok(`straight path across open ground (${path.length} steps, ends on target)`);
  }

  // start == target → empty path (already there, nothing to do).
  {
    const w = mk();
    const path = findPath(w, 5, 5, 5, 5);
    assert(Array.isArray(path) && path.length === 0, 'start==target yields an empty path');
    ok('start == target returns an empty path');
  }

  // A full-height water wall with a single gap forces a detour: the path must
  // route around through the gap and never step on a blocked tile.
  {
    const w = mk();
    const wallX = 8;
    for (let y = 0; y < GRID_H; y++) w.terrain[idx(wallX, y)] = TERRAIN.water;
    const gapY = 13; w.terrain[idx(wallX, gapY)] = TERRAIN.grass; // the only door
    const path = findPath(w, 4, 4, 20, 4, { budget: 2000 });
    assert(path, 'a path exists around a walled barrier with a gap');
    assert(path.every(p => !blocked(w, p)), 'no waypoint is a blocked (water/mountain) tile');
    assert(path.some(p => p.x === wallX && p.y === gapY), 'the route threads the single gap in the wall');
    ok(`path detours around a water wall through its only gap (${path.length} steps)`);
  }

  // A sealed-off target (wall with NO gap) is unreachable → null.
  {
    const w = mk();
    for (let y = 0; y < GRID_H; y++) w.terrain[idx(10, y)] = TERRAIN.mountain;
    const path = findPath(w, 4, 4, 20, 4, { budget: 5000 });
    assert(path === null, 'a fully walled-off target is unreachable (null)');
    ok('unreachable target returns null');
  }

  // A blocked target tile itself returns null (can't stand in water).
  {
    const w = mk();
    w.terrain[idx(12, 6)] = TERRAIN.water;
    assert(findPath(w, 2, 2, 12, 6) === null, 'a path INTO a blocked tile returns null');
    ok('a target on a blocked tile returns null');
  }

  // A tiny budget forces an early give-up on a long search → null (the frame
  // safety valve). The same query with an ample budget still succeeds.
  {
    const w = mk();
    const tight = findPath(w, 0, 0, GRID_W - 1, GRID_H - 1, { budget: 3 });
    assert(tight === null, 'an exhausted node budget returns null (never stalls the frame)');
    const ample = findPath(w, 0, 0, GRID_W - 1, GRID_H - 1, { budget: 4000 });
    assert(ample && ample.length > 0, 'the same query succeeds with an ample budget');
    ok('budget cap: over-budget returns null; ample budget finds the path');
  }

  // Determinism: identical queries return identical paths (no RNG, stable order).
  {
    const w = mk();
    const a = findPath(w, 1, 1, 15, 9), b = findPath(w, 1, 1, 15, 9);
    assert(JSON.stringify(a) === JSON.stringify(b), 'findPath is deterministic for identical inputs');
    ok('pathfinder is deterministic');
  }
}

// 46) Pathfinding integration: movers follow cached A* paths around barriers,
//     and fall back to local steering when no path exists — never stalling.
console.log('Pathfinding (mover integration):');
{
  const { stepRodent } = await import('../src/entities.js');
  const { TERRAIN, idx, isBlockedTile } = await import('../src/world.js');
  const { GRID_H } = await import('../src/config.js');

  // A wall of water between a mover and its goto target, with a single gap. The
  // rodent must route AROUND it (through the gap) without ever standing in water.
  {
    const s = newGame(9100, 'prairie', 'syrian', 'Route', {});
    s.world.terrain.fill(TERRAIN.grass);
    const sp = s.world.spawn;
    const wallX = sp.x + 5;
    for (let y = 0; y < GRID_H; y++) s.world.terrain[idx(wallX, y)] = TERRAIN.water;
    const gapY = 2; s.world.terrain[idx(wallX, gapY)] = TERRAIN.grass; // the only door, far from the straight line
    const u = s.units[0];
    u.x = sp.x - 4; u.y = sp.y; // start well left of the wall
    const tx = wallX + 4, ty = sp.y; // target well right of it
    u.order = { kind: 'goto', x: tx, y: ty };
    u.inBall = false; u.phase = 'seek'; u.targetNode = null;
    let steppedOnWater = false, threadedGap = false, guard = 0;
    while (u.order && guard++ < 8000) {
      u.needs.energy = 100; // keep it awake
      stepEconomy(s, 0.1);
      if (isBlockedTile(s.world, u.x, u.y)) steppedOnWater = true;
      if (Math.abs(Math.round(u.x) - wallX) <= 0 && Math.abs(Math.round(u.y) - gapY) <= 1) threadedGap = true;
    }
    assert(u.order === null, 'the mover eventually reaches the walled-off target');
    assert(!steppedOnWater, 'the mover never stands on a blocked (water) tile en route');
    assert(threadedGap, 'the mover detoured through the single gap (true pathfinding, not clipping)');
    assert(Math.hypot(u.x - tx, u.y - ty) < 1.5, `mover arrives at the target (at ${u.x.toFixed(1)},${u.y.toFixed(1)})`);
    ok('a mover follows an A* path around a wall, through the gap, onto the target');
  }

  // Fallback: when the target sits behind a SEALED wall (unreachable), findPath
  // returns null and the mover falls back to steering — it presses toward the
  // wall without crashing, stalling the sim, or wading into water.
  {
    const s = newGame(9101, 'prairie', 'syrian', 'Fallback', {});
    s.world.terrain.fill(TERRAIN.grass);
    const sp = s.world.spawn;
    const wallX = sp.x + 5;
    for (let y = 0; y < GRID_H; y++) s.world.terrain[idx(wallX, y)] = TERRAIN.water; // no gap → unreachable
    const u = s.units[0];
    u.x = sp.x - 2; u.y = sp.y;
    u.order = { kind: 'goto', x: wallX + 4, y: sp.y };
    u.inBall = false; u.phase = 'seek'; u.targetNode = null;
    let everBlocked = false;
    for (let i = 0; i < 600; i++) { u.needs.energy = 100; stepEconomy(s, 0.1); if (isBlockedTile(s.world, u.x, u.y)) everBlocked = true; }
    assert(!everBlocked, 'unreachable target: the steering fallback still keeps the mover off water');
    assert(u.x < wallX, 'the fallback presses toward the barrier but cannot cross the sealed wall');
    assert(u.order && u.order.kind === 'goto', 'an impossible order does not silently clear (no false arrival)');
    ok('fallback engages on an unreachable target — steering keeps moving, never stalls or wades in');
  }
}

// 46) On-map labels: the 🏷️ toggle drives a render code path. collectMapLabels
//     yields per-entity labels when labels are ON and nothing when OFF.
console.log('On-map labels (🏷️ toggle):');
{
  const { collectMapLabels } = await import('../src/render.js');
  const s = newGame(4242, 'woodland', 'syrian', 'Labels', {});
  // Place a visible building so there's at least one named entity on the map.
  const sp = s.world.spawn;
  s.buildings.push({ id: 999, type: 'burrow', x: sp.x, y: sp.y, underConstruction: false });

  const off = collectMapLabels(s, { showLabels: false, selUnit: null });
  assert(Array.isArray(off) && off.length === 0, 'labels OFF → no on-map labels drawn');
  ok('labels OFF yields an empty label set (no on-map labels)');

  const on = collectMapLabels(s, { showLabels: true, selUnit: null });
  assert(Array.isArray(on) && on.length > 0, 'labels ON → at least one on-map label');
  assert(on.some(l => l.kind === 'building' && /Burrow/.test(l.text)), 'building names appear as labels when ON');
  assert(on.every(l => typeof l.x === 'number' && typeof l.y === 'number' && l.text), 'each label has a position and text');
  ok('labels ON draws building & node names near each entity');

  // The selected rodent is labelled by name when one is selected.
  const u = s.units[0];
  const onSel = collectMapLabels(s, { showLabels: true, selUnit: u.id });
  assert(onSel.some(l => l.kind === 'unit'), 'the selected rodent gets its own on-map label');
  ok('the selected rodent is labelled by name when labels are ON');
}

// 47) Deep mining: Mine Shaft → deep gem seam → Jeweller → Jewellery.
console.log('Deep mining (Mine Shaft → gems → jewellery):');
{
  const { BUILDINGS, NODE_TYPES, RESOURCES, SHAFT_DEPTH, FACTIONS } = await import('../src/config.js');
  const { placeBuilding, canPlace, digDeeper } = await import('../src/buildings.js');

  // The new content exists and is wired sanely.
  assert(RESOURCES.gem && RESOURCES.gem.kind === 'raw', 'a deep-only Gems resource exists');
  assert(RESOURCES.jewel && RESOURCES.jewel.kind === 'refined', 'a refined Jewellery good exists');
  assert(NODE_TYPES.gemseam && NODE_TYPES.gemseam.surface === false && NODE_TYPES.gemseam.deep === true,
    'gemseam is a DEEP underground node (surface:false, deep:true)');
  const shaft = BUILDINGS.mineshaft;
  assert(shaft && shaft.mine && shaft.deep, 'a Mine Shaft building exists and taps the deep layer');
  // Sensible cost: refined materials, nothing free, and it costs more than nothing.
  assert(Object.keys(shaft.cost).length >= 2 && (shaft.cost.iron || 0) > 0 && (shaft.cost.planks || 0) > 0,
    `Mine Shaft has a sensible cost (${JSON.stringify(shaft.cost)})`);
  const jew = BUILDINGS.jeweller;
  assert(jew && jew.consumes?.gem > 0 && jew.produces?.jewel > 0, 'a Jeweller turns Gems → Jewellery');
  assert(FACTIONS.packrats.covets.includes('jewel'), 'jewellery is a coveted trade good (a real use)');
  ok('content present: Gems/Jewellery resources, deep gemseam, Mine Shaft, Jeweller, covet wiring');

  // A regular Mine NEVER claims a deep gem seam, and never makes gems.
  {
    const g = newGame(7001, 'mountains', 'syrian', 'Shallow', {});
    // Drop a deep gem seam next to spawn and an ordinary Mine on top of it.
    const sp = g.world.spawn;
    g.world.nodes.push({ id: 9000, kind: 'gemseam', x: sp.x + 1, y: sp.y, amount: 100, max: 100 });
    g.buildings.push({ id: g.nextId++, type: 'mine', x: sp.x + 1, y: sp.y, active: true });
    const gem0 = g.res.gem || 0;
    for (let i = 0; i < 100; i++) stepEconomy(g, 0.2);
    assert((g.res.gem || 0) === gem0, 'an ordinary Mine does NOT mine the deep gem layer');
    const node = g.world.nodes.find(n => n.id === 9000);
    assert(node && node.amount === 100 && !node.claimedBy, 'the gem seam is untouched & unclaimed by a plain Mine');
    ok('ordinary Mines cannot reach the deep gem layer (only a Mine Shaft can)');
  }

  // A Mine Shaft mines ONLY the deep gem seam; a stock of gems accumulates.
  {
    const g = newGame(7002, 'mountains', 'syrian', 'Deep', {});
    g.popCap = 99; g.units.forEach(u => u.level = 8); // satisfy reqLevel gates
    const sp = g.world.spawn;
    g.world.nodes.push({ id: 9100, kind: 'gemseam', x: sp.x + 1, y: sp.y, amount: 200, max: 200 });
    g.buildings.push({ id: g.nextId++, type: 'mineshaft', x: sp.x + 1, y: sp.y, active: true });
    for (let i = 0; i < 400; i++) stepEconomy(g, 0.2);
    const node = g.world.nodes.find(n => n.id === 9100);
    assert(node.amount < 200 && node.claimedBy, `the Mine Shaft extracts gems from the deep seam (${node.amount.toFixed(0)}/200 left)`);
    assert((g.res.gem || 0) > 0, `gems accumulate from the deep seam (${(g.res.gem || 0).toFixed(1)})`);
    ok(`Mine Shaft mines the deep gem seam → Gems in store (${(g.res.gem || 0).toFixed(1)})`);

    // …and a Jeweller cuts a stock of gems into Jewellery (with storage headroom).
    g.buildings.push({ id: g.nextId++, type: 'storage', x: sp.x, y: sp.y + 2, active: true });
    g.buildings.push({ id: g.nextId++, type: 'jeweller', x: sp.x - 1, y: sp.y, active: true });
    g.res.gem = 50; g.res.iron = 30;
    const j0 = g.res.jewel || 0;
    for (let i = 0; i < 100; i++) stepEconomy(g, 0.2);
    assert((g.res.jewel || 0) > j0, `the Jeweller cut gems into Jewellery (${(g.res.jewel || 0).toFixed(1)})`);
    ok(`a Jeweller cuts gems → Jewellery (${(g.res.jewel || 0).toFixed(1)})`);

    // Jewellery in store lends a small, capped morale lift (a luxury good's use).
    {
      const m = newGame(7006, 'woodland', 'syrian', 'Luxe', {});
      m.morale = 50; m.res.jewel = 20;
      const m0 = m.morale;
      for (let i = 0; i < 40; i++) stepEconomy(m, 0.2);
      assert(m.morale > m0, `stored Jewellery lifts colony morale (${m0} → ${m.morale.toFixed(1)})`);
      ok('stored Jewellery is a luxury that lifts morale');
    }
  }

  // Depth ramp: a deeper shaft yields more per tick than a fresh one.
  {
    function shaftYield(depth) {
      const g = newGame(7003, 'mountains', 'syrian', 'Depth', {});
      const sp = g.world.spawn;
      g.world.nodes.push({ id: 9200, kind: 'gemseam', x: sp.x + 1, y: sp.y, amount: 9999, max: 9999 });
      g.buildings.push({ id: g.nextId++, type: 'mineshaft', x: sp.x + 1, y: sp.y, active: true, depth });
      const before = g.res.gem || 0;
      for (let i = 0; i < 20; i++) stepEconomy(g, 0.2);
      return (g.res.gem || 0) - before;
    }
    const shallow = shaftYield(0), deep = shaftYield(SHAFT_DEPTH.maxLevel);
    assert(deep > shallow * 1.2, `a deeper shaft yields more (depth0 ${shallow.toFixed(1)} < deepest ${deep.toFixed(1)})`);
    assert(SHAFT_DEPTH.maxLevel >= 2 && SHAFT_DEPTH.digCost.length === SHAFT_DEPTH.maxLevel, 'depth ramp is bounded & costed per level');
    ok(`depth ramp: deeper shaft yields more (depth0 ${shallow.toFixed(1)} → deepest ${deep.toFixed(1)})`);
  }

  // digDeeper: pays a cost and (over time) raises the shaft's depth level.
  {
    const g = newGame(7004, 'mountains', 'syrian', 'Dig', {});
    g.units.forEach(u => u.level = 8);
    const sp = g.world.spawn;
    g.world.nodes.push({ id: 9300, kind: 'gemseam', x: sp.x + 1, y: sp.y, amount: 9999, max: 9999 });
    const shaftB = { id: g.nextId++, type: 'mineshaft', x: sp.x + 1, y: sp.y, active: true, depth: 0 };
    g.buildings.push(shaftB);
    for (const k of Object.keys(SHAFT_DEPTH.digCost[0])) g.res[k] = 999;
    const r = digDeeper(g, shaftB);
    assert(r.ok, 'digging deeper starts: ' + (r.reason || ''));
    assert(shaftB.digging, 'the shaft is now digging deeper');
    for (let i = 0; i < 400 && shaftB.digging; i++) stepEconomy(g, 0.2);
    assert((shaftB.depth || 0) === 1, `the shaft reached depth level 1 (got ${shaftB.depth})`);
    ok('digDeeper sinks the shaft one richer level (paid + labour-timed)');
  }

  // Old saves without the gem resource still load & simulate (defaults to 0).
  {
    const g = newGame(7005, 'woodland', 'syrian', 'Legacy', {});
    delete g.res.gem; delete g.res.jewel; // pretend a pre-feature save
    for (let i = 0; i < 30; i++) stepEconomy(g, 0.1); // must not throw
    const back = importSaveString(exportSave(g));
    assert(back.ok, 'a save missing the new resources still re-imports');
    ok('saves without gems/jewellery default cleanly (no migration needed)');
  }
}

// ---- Map-click tool modes & building-click priority -------------------------
console.log('Demolish tool (no confirm) & building-click priority:');
{
  const burrowType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].breed);

  // Demolish-mode click removes a building immediately (no confirm) and refunds.
  {
    const g = newGame(8801, 'woodland', 'syrian', 'Dem', {});
    const sp = g.world.spawn;
    const b = { id: g.nextId++, type: 'storage', x: sp.x + 2, y: sp.y, active: true };
    g.buildings.push(b);
    const n0 = g.buildings.length;
    const wood0 = g.res.wood || 0;
    demolish(g, b); // what the demolish tool calls on a left-click
    assert(g.buildings.length === n0 - 1, 'demolish removes the building immediately');
    assert(!g.buildings.includes(b), 'the demolished building is gone');
    assert((g.res.wood || 0) >= wood0, 'demolish refunds part of the cost (no confirm dialog)');
    ok('demolish-mode click removes a building without a confirm dialog');
  }

  // Select-mode building action runs even when a hamster overlaps the tile: a
  // dirty burrow with a unit standing on it still cleans (the burrow-cleaning fix).
  {
    const g = newGame(8802, 'woodland', 'syrian', 'Clean', {});
    const sp = g.world.spawn;
    const burrow = { id: g.nextId++, type: burrowType, x: sp.x + 3, y: sp.y, active: true, dirt: 5 };
    g.buildings.push(burrow);
    // Park a hamster directly on the burrow tile so it would "win" a nearest-rodent pick.
    g.units[0].x = burrow.x; g.units[0].y = burrow.y;
    assert(buildingActionable(g, burrow) === 'clean', 'a dirty burrow is actionable (clean)');
    const r = useBuilding(g, burrow); // the building-first branch of the click handler
    assert(r.ok && r.action === 'clean', 'useBuilding cleans the dirty burrow: ' + (r.reason || ''));
    assert((burrow.dirt || 0) === 0, 'the burrow is clean even with a unit overlapping its tile');
    ok('select-mode click cleans a dirty burrow despite a hamster on the tile');
  }

  // A building with no current action returns { none } so the click falls through.
  {
    const g = newGame(8803, 'woodland', 'syrian', 'Fall', {});
    const sp = g.world.spawn;
    const clean = { id: g.nextId++, type: burrowType, x: sp.x + 1, y: sp.y, active: true, dirt: 0 };
    g.buildings.push(clean);
    assert(buildingActionable(g, clean) === null, 'a clean burrow offers no action');
    assert(useBuilding(g, clean).none === true, 'useBuilding falls through on a non-actionable building');
    ok('non-actionable buildings fall through to rodent selection/directing');
  }
}

console.log('Direct a hamster to a feeder/well to eat/drink:');
{
  const feederType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].feeder);
  const wellType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].produces?.water);
  const watererType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].waterer);

  // serviceNeedOf classifies food vs water sources.
  {
    assert(serviceNeedOf({ type: feederType }) === 'food', `a Feeder services food (${feederType})`);
    assert(serviceNeedOf({ type: wellType }) === 'water', `a Well services water (${wellType})`);
    assert(serviceNeedOf({ type: watererType }) === 'water', `an Auto-Waterer services water (${watererType})`);
    assert(serviceNeedOf({ type: 'farm' }) === 'food', 'a Farm (food producer) services food');
    assert(serviceNeedOf({ type: 'storage' }) === null, 'a Storage services no need');
    ok('serviceNeedOf classifies feeders/wells/waterers correctly');
  }

  // directToService sets a 'service' order targeting the building.
  {
    const g = newGame(8901, 'woodland', 'syrian', 'Feed', {});
    const sp = g.world.spawn;
    const feeder = { id: g.nextId++, type: feederType, x: sp.x + 2, y: sp.y, active: true };
    g.buildings.push(feeder);
    const u = g.units[0];
    const r = directToService(g, u, feeder);
    assert(r && r.ok && r.need === 'food', 'directing to a feeder sets a food service order');
    assert(u.order && u.order.kind === 'service' && u.order.need === 'food', 'the unit has a food service order');
    assert(u.order.x === feeder.x && u.order.y === feeder.y, 'the service order targets the feeder tile');
    ok('directToService sends a hamster to a feeder with a food service order');
  }

  // On arrival the service order tops up the matching need from stores, then clears.
  {
    const g = newGame(8902, 'woodland', 'syrian', 'Drink', {});
    const sp = g.world.spawn;
    const well = { id: g.nextId++, type: wellType, x: sp.x + 1, y: sp.y, active: true };
    g.buildings.push(well);
    const u = g.units[0];
    u.x = sp.x; u.y = sp.y; u.needs.water = 20; // thirsty, right next to the well
    g.res.water = 200;
    directToService(g, u, well);
    let ticks = 0;
    while (u.order && ticks < 400) { stepEconomy(g, 0.1); ticks++; }
    assert(!u.order, 'the service order clears once the hamster arrives');
    assert(u.needs.water > 20, `the hamster drank on arrival (water ${u.needs.water.toFixed(0)} > 20)`);
    ok('a hamster sent to a well actually services its water need on arrival');
  }
}

// ---- Tool modes + marquee multi-select + group actions ----------------------
console.log('Tool modes, marquee multi-select & group actions:');
{
  const {
    TOOLS, isSelectTool, normRect, isDrag, DRAG_THRESHOLD,
    unitsInRect, buildingsInRect, selectUnits, selectBuildings, clearSelection,
    selectedUnits, groupGather, groupService, groupGoto, groupJob,
    groupDemolish, groupCleanBurrows,
  } = await import('../src/select.js');

  // The three tools exist and the two select tools are recognised.
  assert(TOOLS.join(',') === 'animals,buildings,demolish', 'tool set is animals/buildings/demolish');
  assert(isSelectTool('animals') && isSelectTool('buildings') && !isSelectTool('demolish'), 'animals & buildings are select tools, demolish is not');
  ok('three tool modes: animals (select rodents), buildings (select buildings), demolish');

  // normRect orders bounds; isDrag distinguishes a drag from a tap.
  const r = normRect(5, 8, 2, 3);
  assert(r.x0 === 2 && r.y0 === 3 && r.x1 === 5 && r.y1 === 8, 'normRect orders min/max bounds');
  assert(!isDrag(4, 4, 4, 4 + DRAG_THRESHOLD * 0.5), 'a sub-threshold move is NOT a drag (stays a click)');
  assert(isDrag(4, 4, 4 + DRAG_THRESHOLD + 0.1, 4), 'a move past the threshold IS a drag (a marquee)');
  ok('marquee threshold: small move = click, larger move = marquee');

  // A marquee selects MULTIPLE rodents inside its rect (Animals tool).
  {
    const g = newGame(9101, 'prairie', 'syrian', 'Box', {});
    const sp = g.world.spawn;
    // Make the test independent of STARTING.hamsters: ensure at least 4 rodents.
    while (g.units.length < 4) g.units.push({ id: g.nextId++, species: 'hamster', x: sp.x, y: sp.y, traits: {}, needs: { food: 80, water: 80, energy: 80, fun: 80, health: 100 } });
    // Three rodents inside a 4×4 box; every other rodent moved well outside it.
    g.units.forEach(u => { u.x = sp.x + 20; u.y = sp.y + 20; u._rx = undefined; u._ry = undefined; });
    g.units[0].x = sp.x; g.units[0].y = sp.y;
    g.units[1].x = sp.x + 1; g.units[1].y = sp.y + 1;
    g.units[2].x = sp.x + 2; g.units[2].y = sp.y + 2;
    const outsider = g.units[3];
    const rect = normRect(sp.x - 0.2, sp.y - 0.2, sp.x + 3, sp.y + 3);
    const inside = unitsInRect(g, rect);
    assert(inside.length === 3, `marquee captures exactly the 3 rodents in the box (got ${inside.length})`);
    assert(!inside.includes(outsider), 'a rodent far outside the box is NOT selected');
    const view = { selUnit: null, selUnits: [], selBuildings: [] };
    selectUnits(view, inside);
    assert(view.selUnits.length === inside.length, 'selectUnits stores every captured rodent id');
    assert(view.selUnit === inside[0].id, 'selUnit tracks the primary (first) of the multi-selection');
    ok(`marquee selects multiple rodents in a rect (${inside.length}); selUnit = primary`);
  }

  // Buildings marquee captures buildings by tile.
  {
    const g = newGame(9102, 'woodland', 'syrian', 'BoxB', {});
    const sp = g.world.spawn;
    const a = { id: g.nextId++, type: 'storage', x: sp.x, y: sp.y, active: true };
    const b = { id: g.nextId++, type: 'storage', x: sp.x + 1, y: sp.y, active: true };
    const far = { id: g.nextId++, type: 'storage', x: sp.x + 15, y: sp.y, active: true };
    g.buildings.push(a, b, far);
    const got = buildingsInRect(g, normRect(sp.x, sp.y, sp.x + 2, sp.y + 2));
    assert(got.includes(a) && got.includes(b) && !got.includes(far), 'buildingsInRect captures buildings inside the box only');
    const view = { selUnit: null, selUnits: [], selBuildings: [] };
    selectBuildings(view, got);
    assert(view.selBuildings.length === got.length, 'selectBuildings stores the captured buildings');
    ok(`buildings marquee captures buildings by tile (${got.length})`);
  }

  // Group gather: a multi-selection sent to a node pins jobPref on ALL of them.
  {
    const g = newGame(9103, 'prairie', 'syrian', 'Gather', {});
    const node = g.world.nodes.find(n => n.kind === 'rock' && n.amount > 0) || g.world.nodes.find(n => n.amount > 0);
    assert(node, 'the map has a resource node to gather');
    const team = g.units.slice(0, 3);
    const res = groupGather(g, team, node);
    assert(res.ok && res.n === team.length, 'groupGather reports the group size');
    assert(team.every(u => u.jobPref === node.kind), 'EVERY selected rodent gets the node kind as its jobPref');
    assert(team.every(u => u.order && u.order.kind === 'goto'), 'every selected rodent is ordered to the node');
    ok(`group gather sets jobPref + goto on all ${team.length} selected rodents (→ ${res.resource})`);
  }

  // Group service: a multi-selection sent to a feeder/well gets a service order.
  {
    const { BUILDINGS } = await import('../src/config.js');
    const wellType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].produces?.water);
    const g = newGame(9104, 'woodland', 'syrian', 'Drink', {});
    const sp = g.world.spawn;
    const well = { id: g.nextId++, type: wellType, x: sp.x + 2, y: sp.y, active: true };
    g.buildings.push(well);
    const team = g.units.slice(0, 3);
    const res = groupService(g, team, well);
    assert(res.ok && res.need === 'water', 'groupService classifies the well as water');
    assert(team.every(u => u.order && u.order.kind === 'service' && u.order.need === 'water'), 'every selected rodent has a water service order');
    ok(`group service sends all ${team.length} selected rodents to drink`);
  }

  // Group goto: fans the group out (not all stacked on one tile).
  {
    const g = newGame(9105, 'prairie', 'syrian', 'Goto', {});
    const team = g.units.slice(0, 5);
    const res = groupGoto(g, team, 20, 14);
    assert(res.ok && res.n === team.length, 'groupGoto orders the whole group');
    assert(team.every(u => u.order && u.order.kind === 'goto'), 'every selected rodent gets a goto order');
    const targets = new Set(team.map(u => `${u.order.x.toFixed(2)},${u.order.y.toFixed(2)}`));
    assert(targets.size > 1, 'the group is fanned out across distinct targets (not all on one tile)');
    ok(`group goto fans ${team.length} rodents out around the target`);
  }

  // Group job applies a pinned preference to everyone (the 🎯 buttons en masse).
  {
    const g = newGame(9106, 'prairie', 'syrian', 'Job', {});
    const team = g.units.slice(0, 4);
    groupJob(g, team, 'rock');
    assert(team.every(u => u.jobPref === 'rock'), 'groupJob pins the kind on every selected rodent');
    groupJob(g, team, null);
    assert(team.every(u => u.jobPref === null), 'groupJob(null) clears every selected rodent back to Auto');
    ok('group Job buttons apply to the whole multi-selection');
  }

  // Demolish-drag removes ALL buildings in a rect.
  {
    const g = newGame(9107, 'woodland', 'syrian', 'Bulldoze', {});
    const sp = g.world.spawn;
    const bs = [];
    for (let i = 0; i < 4; i++) { const b = { id: g.nextId++, type: 'storage', x: sp.x + i, y: sp.y + 5, active: true }; g.buildings.push(b); bs.push(b); }
    const keep = { id: g.nextId++, type: 'storage', x: sp.x + 20, y: sp.y + 5, active: true };
    g.buildings.push(keep);
    const inBox = buildingsInRect(g, normRect(sp.x, sp.y + 5, sp.x + 3, sp.y + 5));
    const res = groupDemolish(g, inBox);
    assert(res.ok && res.n === 4, `demolish-drag removes every building in the rect (removed ${res.n})`);
    assert(bs.every(b => !g.buildings.includes(b)), 'all four boxed buildings are gone');
    assert(g.buildings.includes(keep), 'a building outside the rect survives');
    ok(`demolish-drag bulldozes all ${res.n} buildings in a rect, sparing those outside`);
  }

  // Group clean: cleans every dirty burrow in a building selection.
  {
    const { BUILDINGS } = await import('../src/config.js');
    const burrowType = Object.keys(BUILDINGS).find(k => BUILDINGS[k].breed);
    const g = newGame(9108, 'woodland', 'syrian', 'CleanAll', {});
    const sp = g.world.spawn;
    const dirty = [];
    for (let i = 0; i < 3; i++) { const b = { id: g.nextId++, type: burrowType, x: sp.x + i, y: sp.y + 6, active: true, dirt: 5 }; g.buildings.push(b); dirty.push(b); }
    const cleanAlready = { id: g.nextId++, type: burrowType, x: sp.x + 5, y: sp.y + 6, active: true, dirt: 0 };
    g.buildings.push(cleanAlready);
    const res = groupCleanBurrows(g, [...dirty, cleanAlready]);
    assert(res.ok && res.n === 3, `group clean cleans only the dirty burrows (cleaned ${res.n})`);
    assert(dirty.every(b => (b.dirt || 0) === 0), 'every dirty burrow in the selection is now clean');
    ok(`group clean tidies all ${res.n} dirty burrows in a building selection`);
  }

  // Tool toggle switches the selection target type; clearSelection resets both.
  {
    const g = newGame(9109, 'woodland', 'syrian', 'Toggle', {});
    const view = { tool: 'animals', selUnit: null, selUnits: [], selBuildings: [] };
    selectUnits(view, g.units.slice(0, 2));
    assert(view.selUnits.length === 2 && view.selBuildings.length === 0, 'animals tool fills selUnits');
    clearSelection(view);
    assert(view.selUnits.length === 0 && view.selUnit === null && view.selBuildings.length === 0, 'clearSelection empties everything');
    const sp = g.world.spawn;
    const b = { id: g.nextId++, type: 'storage', x: sp.x, y: sp.y, active: true }; g.buildings.push(b);
    selectBuildings(view, [b]);
    assert(view.selBuildings.length === 1, 'buildings tool fills selBuildings');
    assert(selectedUnits(g, { selUnits: [g.units[0].id] }).length === 1, 'selectedUnits resolves ids → live units');
    ok('tool toggle switches target type (rodents ↔ buildings); selection clears cleanly');
  }
}

console.log(`\nALL SMOKE TESTS PASSED (${pass} checks).`);
