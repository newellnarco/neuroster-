// state.js — the GameState model and core helpers.
import { RESOURCES, STARTING, NEEDS, TRAITS, EVOLUTIONS, NODE_TYPES, BREEDS, HAMSTER_NAMES, FACTIONS, DIFFICULTIES, DENSITIES } from './config.js';
import { generateWorld, reveal } from './world.js';
import { makeRodent } from './entities.js';
import { initEnv } from './environment.js';

export function newGame(seed = (Math.floor(Date.now() % 2147483647) || 12345), biome = 'woodland', breedKey = 'syrian', founderName = null, opts = {}) {
  const difficulty = DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'normal';
  const density = DENSITIES[opts.density] ? opts.density : 'normal';
  const world = generateWorld(seed, biome, DENSITIES[density].mul);
  const breed = BREEDS[breedKey] || BREEDS.syrian;
  const name = founderName || HAMSTER_NAMES[seed % HAMSTER_NAMES.length];
  const state = {
    version: 3,
    seed, biome, difficulty, density,
    founder: { breed: breedKey, name, lastRenameDay: 0 },
    world,
    res: {},
    storageCap: STARTING.storageCap,
    popCap: 0,
    buildings: [],
    units: [],
    defense: 0,
    tech: {},
    evolutions: {},
    unlockedSpecies: { hamster: true },
    mods: { mineMul: 0, speedMul: 0, carryMul: 0, prodMul: 0, foodMul: 0, researchMul: 0, revealBonus: 0 },
    nextId: 1,
    fx: [],
    factions: {},
    morale: 100,
    bodies: [],
    log: [],
  };
  for (const id of Object.keys(FACTIONS)) state.factions[id] = { standing: 0, raidTimer: 120 + Math.random() * 120 };

  // Breed predisposes a colony-wide knack.
  for (const [k, v] of Object.entries(breed.colonyMod || {})) state.mods[k] = (state.mods[k] || 0) + v;

  for (const k of Object.keys(RESOURCES)) state.res[k] = 0;
  const startMul = DIFFICULTIES[difficulty].startMul;
  for (const [k, v] of Object.entries(STARTING.resources)) state.res[k] = Math.round(v * startMul);
  initEnv(state);
  reveal(world, world.spawn.x, world.spawn.y, 6);

  for (let i = 0; i < STARTING.hamsters; i++) {
    const u = makeRodent(state, 'hamster', world.spawn.x, world.spawn.y);
    if (i === 0) { // the founder, with breed traits & name
      u.founder = true; u.name = name; u.breed = breedKey;
      for (const [t, lvl] of Object.entries(breed.startTraits || {})) u.traits[t] = lvl;
    }
    state.units.push(u);
  }
  logMsg(state, `${name} the ${breed.name} hamster founds a ${world.biome} colony! Explore, gather, and keep your rodents fed, watered, rested & curious.`);
  return state;
}

// ---- Resource helpers ------------------------------------------------------
export function totalStored(state) {
  let t = 0;
  for (const k of Object.keys(RESOURCES)) {
    if (RESOURCES[k].kind === 'abstract') continue;
    t += state.res[k] || 0;
  }
  return t;
}
export function addRes(state, key, amt) {
  const def = RESOURCES[key];
  if (!def) return 0;
  if (def.kind === 'abstract') { state.res[key] = Math.max(0, (state.res[key] || 0) + amt); return amt; }
  const room = state.storageCap - totalStored(state);
  const final = amt < 0 ? amt : Math.min(amt, Math.max(0, room));
  state.res[key] = Math.max(0, (state.res[key] || 0) + final);
  return final;
}
export function canAfford(state, cost) {
  return Object.entries(cost || {}).every(([k, v]) => (state.res[k] || 0) >= v);
}
export function spend(state, cost) {
  if (!canAfford(state, cost)) return false;
  for (const [k, v] of Object.entries(cost || {})) state.res[k] -= v;
  return true;
}

// ---- Derived stats ---------------------------------------------------------
export function population(state) { return state.units.length; }

// Colony-average of each per-creature need (for the HUD).
export function colonyNeeds(state) {
  const out = { food: 0, water: 0, energy: 0, fun: 0, health: 0 };
  const n = state.units.length || 1;
  for (const u of state.units) for (const k in out) out[k] += u.needs[k] || 0;
  for (const k in out) out[k] /= n;
  return out;
}

// Overall wellbeing multiplier from colony-average needs (0.5x .. 1.15x).
export function wellbeingMul(state) {
  if (!state.units.length) return 1;
  const c = colonyNeeds(state);
  const avg = (c.food + c.water + c.fun + c.health) / 4;
  return 0.5 + (avg / 100) * 0.65;
}

// Trait multiplier for a given aspect on a unit.
export function traitMul(unit, aspect) {
  let m = 1;
  for (const [tid, def] of Object.entries(TRAITS)) {
    if (def.affects.includes(aspect)) m += (unit.traits?.[tid] || 0) * def.perLevel;
  }
  return m;
}

// Sum of species-wide evolution bonuses for a stat key.
export function evoBonus(state, species, key) {
  let b = 0;
  for (const [id, e] of Object.entries(EVOLUTIONS)) {
    if (!state.evolutions?.[id]) continue;
    if (e.species !== 'all' && e.species !== species) continue;
    if (e.bonus?.[key]) b += e.bonus[key];
  }
  return b;
}

// Floating reward feedback (rising, fading text/emoji over the world).
export function addFx(state, x, y, text, life = 1.6) {
  if (!state.fx) state.fx = [];
  state.fx.push({ x, y, text, born: state.env?.lived || 0, life });
  if (state.fx.length > 80) state.fx.shift();
}

// A rodent dies: remove it and leave a body that must be buried (or morale rots).
export function killUnit(state, unit) {
  const i = state.units.indexOf(unit);
  if (i >= 0) state.units.splice(i, 1);
  (state.bodies || (state.bodies = [])).push({ x: unit.x, y: unit.y, species: unit.species, born: state.env?.lived || 0 });
  addFx(state, unit.x, unit.y, '💀', 2.2);
}

export function logMsg(state, msg) {
  state.log.unshift({ t: state.env?.dayTime | 0, msg });
  if (state.log.length > 40) state.log.pop();
}
