// economy.js — per-tick colony simulation: production, needs, breeding, threats.
import { BUILDINGS, NEEDS, RESOURCES, NODE_TYPES, SPECIES } from './config.js';
import { addRes, canAfford, population, logMsg, wellbeingMul } from './state.js';
import { makeRodent, stepRodent, combineRodents } from './entities.js';
import { stepEvents } from './events.js';

// Run one simulation tick. dt is seconds per tick.
export function stepEconomy(state, dt) {
  state.time++;

  // 1) Rodent AI (gathering & hauling).
  for (const u of state.units) stepRodent(state, u, dt);

  // 2) Recompute derived stats from buildings.
  recomputeBuildings(state);

  // 3) Building production / refining (scaled by power & wellbeing).
  const wb = wellbeingMul(state);
  const powerMul = powerMultiplier(state);
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def || b.active === false) continue;

    if (def.autoMine) { runAutoMine(state, b, def, dt, wb); continue; }

    // Consume inputs (only if available) then produce outputs.
    let rate = dt * wb * powerMul;
    if (def.category === 'Food') rate *= (1 + state.mods.foodMul);
    if (def.category === 'Production') rate *= (1 + state.mods.prodMul);

    if (def.consumes) {
      const ok = Object.entries(def.consumes).every(([k, v]) => (state.res[k] || 0) >= v * rate);
      if (!ok) continue;
      for (const [k, v] of Object.entries(def.consumes)) state.res[k] -= v * rate;
    }
    if (def.produces) {
      for (const [k, v] of Object.entries(def.produces)) addRes(state, k, v * rate);
    }
  }

  // 4) Wellbeing needs: drain by population, replenish from stored resources.
  updateNeeds(state, dt);

  // 5) Breeding new hamsters in burrows (needs food + space + wellbeing).
  updateBreeding(state, dt);

  // 6) Loyalty: neglected colonies see rodents desert; happy ones attract joiners.
  updateLoyalty(state, dt);

  // 7) Disasters & predators.
  stepEvents(state, dt);
}

function recomputeBuildings(state) {
  let popCap = 0, storage = 300, defense = 0, curiosity = 0, health = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def) continue;
    popCap += def.popCap || 0;
    storage += def.storage || 0;
    defense += def.defense || 0;
    curiosity += def.curiosity || 0;
    health += def.health || 0;
  }
  state.popCap = popCap;
  state.storageCap = storage;
  state.defense = defense;
  state._curiosityBld = curiosity;
  state._healthBld = health;
}

// Mines auto-extract from nearby nodes into storage.
function runAutoMine(state, b, def, dt, wb) {
  const r = def.radius || 3;
  for (const n of state.world.nodes) {
    if (n.amount <= 0) continue;
    if (Math.abs(n.x - b.x) > r || Math.abs(n.y - b.y) > r) continue;
    const rate = 1.2 * dt * wb * (1 + state.mods.mineMul);
    const got = Math.min(n.amount, rate);
    n.amount -= got;
    addRes(state, NODE_TYPES[n.kind].resource, got);
    break; // one node per tick
  }
}

function powerMultiplier(state) {
  // Power accelerates automation/production. Each unit of stored power gives a
  // small boost, consumed slowly. Soft-capped.
  const p = state.res.power || 0;
  const boost = Math.min(1.0, p / 100); // up to +100%
  if (p > 0) state.res.power = Math.max(0, p - 0.2); // drains as it's "used"
  return 1 + boost;
}

function updateNeeds(state, dt) {
  const pop = Math.max(1, population(state));
  // Feeders slow the Food need's drain; vigor trait (avg) slows all drains.
  const feeders = state.buildings.reduce((s, b) => s + (BUILDINGS[b.type]?.feeder || 0), 0);
  for (const [key, def] of Object.entries(NEEDS)) {
    let drain = def.drainPerPop * pop * dt;
    if (key === 'food') drain *= Math.max(0.4, 1 - feeders * 0.15);

    // Replenish from a consumable resource (food, water). Rodents eat/drink a
    // modest amount that comfortably outpaces the drain while stores last.
    if (def.from) {
      const want = drain * 1.6;
      const have = state.res[def.from] || 0;
      const used = Math.min(have, want);
      state.res[def.from] -= used;
      state.needs[key] = Math.min(100, state.needs[key] + used * 2.0);
    }
    // Building-based needs (curiosity, health) get passive recovery.
    if (key === 'curiosity') state.needs[key] = Math.min(100, state.needs[key] + (state._curiosityBld || 0) * 0.02 * dt);
    if (key === 'health')    state.needs[key] = Math.min(100, state.needs[key] + (state._healthBld || 0) * 0.02 * dt);

    state.needs[key] = Math.max(0, state.needs[key] - drain);
  }
}

function updateBreeding(state, dt) {
  const burrows = state.buildings.filter(b => BUILDINGS[b.type]?.breed).length;
  if (burrows === 0) return;
  if (population(state) >= state.popCap) return;
  const wb = wellbeingMul(state);
  if (wb < 0.7) return;                 // unhappy colonies don't breed
  if ((state.res.food || 0) < 5) return;
  state._breed = (state._breed || 0) + dt * burrows * wb * 0.04;
  if (state._breed >= 1) {
    state._breed = 0;
    state.res.food -= 5;
    const sp = state.world.spawn;
    // If two different species are present, offspring may be a trait-blended hybrid.
    const species = [...new Set(state.units.map(u => u.species))];
    let child;
    if (species.length >= 2 && Math.random() < 0.5) {
      const a = pickSpecies(state, species[0]);
      const b = pickSpecies(state, species[1]);
      if (a && b) { child = combineRodents(state, a, b); child.x = sp.x; child.y = sp.y; }
    }
    if (!child) child = makeRodent(state, 'hamster', sp.x, sp.y);
    state.units.push(child);
    logMsg(state, child.hybridOf ? `✨ A hybrid ${SPECIES[child.species].name} was born (blended traits)!` : '🐹 A new hamster was born!');
  }
}
function pickSpecies(state, sp) { return state.units.find(u => u.species === sp); }

// Loyalty / rebellion: rodents stay if the colony meets their needs. Sustained
// low wellbeing makes them desert; high wellbeing draws in wild joiners.
function updateLoyalty(state, dt) {
  const wb = wellbeingMul(state);
  // Desertion: below a threshold, discontent builds up and a rodent leaves.
  if (wb < 0.62 && population(state) > 1) {
    state._unrest = (state._unrest || 0) + dt * (0.62 - wb) * 2;
    if (state._unrest >= 1) {
      state._unrest = 0;
      const i = Math.floor(Math.random() * state.units.length);
      const left = state.units.splice(i, 1)[0];
      logMsg(state, `💔 A ${SPECIES[left.species].name} deserted — keep food, water, curiosity & health up to retain rodents!`);
    }
  } else {
    state._unrest = Math.max(0, (state._unrest || 0) - dt * 0.5);
  }
  // Wild joiners: a content, well-fed colony with space attracts free recruits.
  if (wb > 0.95 && population(state) < state.popCap && (state.res.food || 0) > 30) {
    state._join = (state._join || 0) + dt * 0.02;
    if (state._join >= 1) {
      state._join = 0;
      const unlocked = Object.keys(SPECIES).filter(s => state.unlockedSpecies[s]);
      const sp = unlocked[Math.floor(Math.random() * unlocked.length)] || 'hamster';
      const s = state.world.spawn;
      state.units.push(makeRodent(state, sp, s.x, s.y));
      logMsg(state, `🤝 A wild ${SPECIES[sp].name} joined your thriving colony!`);
    }
  }
}
