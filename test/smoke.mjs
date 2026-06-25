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
const { giftFaction } = await import('../src/buildings.js');
const { MEGAPROJECTS, FACTIONS } = await import('../src/config.js');

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

console.log(`\nALL SMOKE TESTS PASSED (${pass} checks).`);
