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

console.log(`\nALL SMOKE TESTS PASSED (${pass} checks).`);
