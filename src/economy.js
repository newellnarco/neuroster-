// economy.js — per-tick simulation: environment, production, per-creature needs,
// breeding, loyalty, exploration, and threats.
import { BUILDINGS, NEEDS, NODE_TYPES, SPECIES } from './config.js';
import { addRes, population, logMsg, wellbeingMul, evoBonus } from './state.js';
import { makeRodent, stepRodent, combineRodents } from './entities.js';
import { stepEvents } from './events.js';
import { stepEnvironment, envMods } from './environment.js';
import { reveal } from './world.js';

// Run one simulation tick. dt is seconds per tick.
export function stepEconomy(state, dt) {
  // 0) Environment first; cache its modifiers for the rest of the tick.
  stepEnvironment(state, dt);
  const env = state._envMods = envMods(state);

  // 1) Rodent AI (gather/haul/sleep).
  for (const u of state.units) stepRodent(state, u, dt);

  // 2) Derived stats from buildings.
  recomputeBuildings(state);

  // 3) Building production / refining.
  const wb = wellbeingMul(state);
  const powerMul = powerMultiplier(state);
  // Weather can rain extra water into stores.
  if (env.waterGain) addRes(state, 'water', env.waterGain * dt * Math.max(1, population(state) * 0.4));
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def || b.active === false) continue;
    if (def.autoMine) { runAutoMine(state, b, def, dt, wb); continue; }
    if (def.belt) { runBelt(state, b, def, dt, wb); continue; }

    let rate = dt * wb * powerMul;
    if (def.category === 'Food') rate *= (1 + state.mods.foodMul + env.foodMul);
    if (def.category === 'Production') rate *= (1 + state.mods.prodMul);
    if (def.produces?.power) rate *= (1 + env.powerGain);
    if (def.produces?.research) rate *= (1 + (state.mods.researchMul || 0) + evoBonus(state, 'all', 'research'));

    if (def.consumes) {
      const ok = Object.entries(def.consumes).every(([k, v]) => (state.res[k] || 0) >= v * rate);
      if (!ok) continue;
      for (const [k, v] of Object.entries(def.consumes)) state.res[k] -= v * rate;
    }
    if (def.produces) for (const [k, v] of Object.entries(def.produces)) addRes(state, k, v * rate);
  }

  // 4) Per-creature needs (food, water, energy, fun, health).
  updatePerUnitNeeds(state, dt, env);

  // 5) Exploration: rodents & buildings reveal nearby fog.
  updateExploration(state, env);

  // 6) Breeding, 7) Loyalty, 8) Disasters.
  updateBreeding(state, dt);
  updateLoyalty(state, dt);
  stepEvents(state, dt);
}

function recomputeBuildings(state) {
  let popCap = 0, storage = 300, defense = 0, fun = 0, health = 0, feeders = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def) continue;
    popCap += def.popCap || 0;
    storage += def.storage || 0;
    defense += def.defense || 0;
    fun += def.curiosity || 0;
    health += def.health || 0;
    feeders += def.feeder || 0;
  }
  // Evolutions can add a flat defense bonus.
  defense = Math.round(defense * (1 + evoBonus(state, 'all', 'defense')));
  state.popCap = popCap; state.storageCap = storage; state.defense = defense;
  state._funBld = fun; state._healthBld = health; state._feeders = feeders;
}

function runAutoMine(state, b, def, dt, wb) {
  const r = def.radius || 3;
  for (const n of state.world.nodes) {
    if (n.amount <= 0) continue;
    if (Math.abs(n.x - b.x) > r || Math.abs(n.y - b.y) > r) continue;
    const got = Math.min(n.amount, 1.2 * dt * wb * (1 + state.mods.mineMul));
    n.amount -= got;
    addRes(state, NODE_TYPES[n.kind].resource, got);
    break;
  }
}

// Conveyor belts auto-transport from the nearest in-range node to storage.
function runBelt(state, b, def, dt, wb) {
  const r = def.radius || 2;
  let target = null, bd = Infinity;
  for (const n of state.world.nodes) {
    if (n.amount <= 0) continue;
    const d = Math.abs(n.x - b.x) + Math.abs(n.y - b.y);
    if (d <= r && d < bd) { bd = d; target = n; }
  }
  if (!target) { b._flow = 0; return; }
  const got = Math.min(target.amount, def.belt.rate * dt * wb);
  target.amount -= got;
  addRes(state, NODE_TYPES[target.kind].resource, got);
  b._flow = 1; // marks the belt as actively moving (for animation)
}

function powerMultiplier(state) {
  const p = state.res.power || 0;
  const boost = Math.min(1.0, p / 100);
  if (p > 0) state.res.power = Math.max(0, p - 0.2);
  return 1 + boost;
}

// Each rodent eats, drinks, gets bored, and ages its health independently.
function updatePerUnitNeeds(state, dt, env) {
  const feederFactor = Math.max(0.4, 1 - (state._feeders || 0) * 0.15);
  const funRecover = (state._funBld || 0) * 0.05 * dt;     // Playgrounds
  const healthRecover = (state._healthBld || 0) * 0.04 * dt; // Infirmaries
  const envDrain = 1 + (env.needDrain || 0);

  for (const u of state.units) {
    const n = u.needs;
    const retain = Math.max(0.4, 1 - evoBonus(state, u.species, 'needRetain'));

    // Food & water: drain, then eat/drink from colony stores if running low.
    for (const key of ['food', 'water']) {
      const def = NEEDS[key];
      let drain = def.drain * dt * envDrain * retain;
      if (key === 'food') drain *= feederFactor;
      n[key] = Math.max(0, n[key] - drain);
      if (n[key] < def.eatAt) {
        const want = dt * 0.9;
        const used = Math.min(state.res[def.from] || 0, want);
        state.res[def.from] -= used;
        n[key] = Math.min(100, n[key] + used * 7);
      }
    }
    // Energy: gentle base drain while awake (work/sleep handled in entities).
    if (u.phase !== 'sleep') n.energy = Math.max(0, n.energy - NEEDS.energy.drain * dt * retain);
    // Fun: boredom rises over time; Playgrounds & variety (entities) relieve it.
    n.fun = Math.max(0, Math.min(100, n.fun - NEEDS.fun.drain * dt + funRecover));
    // Health: drifts toward the average of the other needs; buildings heal;
    // humid weather hurts; starvation bottoms it out fast.
    const others = (n.food + n.water + n.energy + n.fun) / 4;
    n.health += (others - n.health) * 0.03 * dt;
    n.health += healthRecover - (env.healthDrain || 0) * dt;
    if (n.food <= 0 || n.water <= 0) n.health -= 1.5 * dt;
    n.health = Math.max(0, Math.min(100, n.health));
  }
}

function updateExploration(state, env) {
  const radius = Math.max(2, Math.round(3 * (1 + (env.revealMul || 0) + (state.mods.revealBonus || 0))));
  for (const u of state.units) reveal(state.world, Math.round(u.x), Math.round(u.y), radius);
  for (const b of state.buildings) reveal(state.world, b.x, b.y, 3);
}

function updateBreeding(state, dt) {
  const burrows = state.buildings.filter(b => BUILDINGS[b.type]?.breed).length;
  if (burrows === 0 || population(state) >= state.popCap) return;
  const wb = wellbeingMul(state);
  if (wb < 0.7 || (state.res.food || 0) < 5) return;
  state._breed = (state._breed || 0) + dt * burrows * wb * 0.04;
  if (state._breed >= 1) {
    state._breed = 0;
    state.res.food -= 5;
    const sp = state.world.spawn;
    const species = [...new Set(state.units.map(u => u.species))];
    let child;
    if (species.length >= 2 && Math.random() < 0.5) {
      const a = state.units.find(u => u.species === species[0]);
      const b = state.units.find(u => u.species === species[1]);
      if (a && b) { child = combineRodents(state, a, b); child.x = sp.x; child.y = sp.y; }
    }
    if (!child) child = makeRodent(state, 'hamster', sp.x, sp.y);
    state.units.push(child);
    logMsg(state, child.hybridOf ? `✨ A hybrid ${SPECIES[child.species].name} was born (blended traits)!` : '🐹 A new hamster was born!');
  }
}

function updateLoyalty(state, dt) {
  const wb = wellbeingMul(state);
  if (wb < 0.62 && population(state) > 1) {
    state._unrest = (state._unrest || 0) + dt * (0.62 - wb) * 2;
    if (state._unrest >= 1) {
      state._unrest = 0;
      const left = state.units.splice(Math.floor(Math.random() * state.units.length), 1)[0];
      logMsg(state, `💔 A ${SPECIES[left.species].name} deserted — keep rodents fed, watered, rested & entertained!`);
    }
  } else {
    state._unrest = Math.max(0, (state._unrest || 0) - dt * 0.5);
  }
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
