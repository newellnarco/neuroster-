// state.js — the GameState model and core helpers.
import { RESOURCES, STARTING, NEEDS, TRAITS, SPECIES, GRID_W, GRID_H } from './config.js';
import { generateWorld } from './world.js';
import { makeRodent } from './entities.js';

export function newGame(seed = (Math.floor(Date.now() % 2147483647) || 12345)) {
  const world = generateWorld(seed);
  const state = {
    version: 1,
    seed,
    time: 0,                 // total ticks elapsed
    world,                   // { terrain, nodes, spawn }
    res: {},                 // resource amounts
    storageCap: STARTING.storageCap,
    popCap: 0,
    buildings: [],           // { id, type, x, y, active }
    units: [],               // rodents
    needs: {},               // wellbeing meters 0..100
    defense: 0,
    threat: 0,
    tech: {},                // unlocked tech ids -> true
    unlockedSpecies: { hamster: true },
    mods: { mineMul: 0, speedMul: 0, carryMul: 0, prodMul: 0, foodMul: 0 },
    nextId: 1,
    log: [],
  };

  for (const k of Object.keys(RESOURCES)) state.res[k] = 0;
  Object.assign(state.res, STARTING.resources);
  for (const k of Object.keys(NEEDS)) state.needs[k] = 80; // start content

  // Starting hamsters around spawn.
  for (let i = 0; i < STARTING.hamsters; i++) {
    state.units.push(makeRodent(state, 'hamster', world.spawn.x, world.spawn.y));
  }
  logMsg(state, 'Welcome to your hamster colony! Build burrows and gather to grow.');
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
  // capped by storage
  const room = state.storageCap - totalStored(state);
  const added = Math.max(0, Math.min(amt, room < 0 ? 0 : room + Math.min(0, amt)));
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

// Wellbeing multiplier: average of needs scaled around 1.0 (0.5x .. 1.15x).
export function wellbeingMul(state) {
  const vals = Object.keys(NEEDS).map(k => state.needs[k] ?? 0);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return 0.5 + (avg / 100) * 0.65; // 0% -> 0.5, 100% -> 1.15
}

// Trait multiplier for a given aspect on a unit (e.g. 'mine', 'speed').
export function traitMul(unit, aspect) {
  let m = 1;
  for (const [tid, def] of Object.entries(TRAITS)) {
    if (def.affects.includes(aspect)) m += (unit.traits?.[tid] || 0) * def.perLevel;
  }
  return m;
}

export function logMsg(state, msg) {
  state.log.unshift({ t: state.time, msg });
  if (state.log.length > 40) state.log.pop();
}

export const nextId = (state) => state.nextId++;
