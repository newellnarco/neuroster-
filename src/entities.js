// entities.js — rodent units: stats, per-creature needs, sleep, levels, AI,
// and trait combination (breeding).
import { SPECIES, TRAITS, NODE_TYPES, NEEDS, SLEEP, MAX_LEVEL, xpForLevel, GRID_W, GRID_H, HAMSTER_NAMES, FAMILY_NAMES, COAT_COLORS, COAT_PATTERNS } from './config.js';
import { traitMul, wellbeingMul, addRes, evoBonus, addFx, logMsg } from './state.js';
import { isNight } from './environment.js';
import { isSeen, nearestUnseen } from './world.js';
import { nodeContestFactor } from './factions.js';

let _id = 1;
// Worker assignment order, weighted toward the materials early colonies need most.
const PREF_ORDER = ['trees', 'rock', 'trees', 'bush', 'rock', 'trees', 'orevein', 'coalseam', 'bush', 'rock'];
const NODE_RES = Object.fromEntries(Object.entries(NODE_TYPES).map(([k, v]) => [k, v.resource]));
const nodeRes = (n) => NODE_RES[n.kind];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randomGivenName = () => pick(HAMSTER_NAMES);
export const randomFamily = () => pick(FAMILY_NAMES);

export function makeRodent(state, species, x, y) {
  const count = state ? state.units.length : 0;
  const u = {
    id: state ? state.nextId++ : _id++,
    species,
    name: randomGivenName(),       // every rodent has a name…
    family: randomFamily(),        // …and a family line
    x: x + (Math.random() - 0.5),
    y: y + (Math.random() - 0.5),
    job: 'gather',
    phase: 'seek',                // seek | work | deliver | sleep
    targetNode: null,
    targetDrop: null,
    carrying: null,
    progress: 0,
    // per-creature needs (0..100)
    needs: { food: 85, water: 85, energy: 90, fun: 75, health: 100 },
    bond: 45,          // affection toward the player; raised by hands-on care
    careCd: {},        // per-action cooldown timestamps (lived seconds)
    sick: false, sickT: 0, // wet tail illness
    pooT: 5 + Math.random() * 15, // countdown to next droppings
    level: 1, xp: 0, skillPoints: 0,
    traits: {},
    prefKind: PREF_ORDER[count % PREF_ORDER.length],
  };
  if (species === 'hamster') u.coat = { color: pick(Object.keys(COAT_COLORS)), pattern: pick(Object.keys(COAT_PATTERNS)) };
  return u;
}

// ---- Effective stats (species × traits × tech × evolution × productivity) --
export function productivity(state, u) {
  const n = u.needs;
  const sustenance = (n.food + n.water + n.energy + n.fun) / 4;   // 0..100
  const base = 0.3 + 0.7 * (sustenance / 100);
  const health = 0.5 + 0.5 * (n.health / 100);
  const bond = 1 + ((u.bond ?? 50) - 50) / 600; // affection gives a small lift
  const ill = u.sick ? 0.45 : 1;                // wet tail saps a rodent
  return Math.max(0.1, base * health * bond * ill);
}
// Day/night alignment with the species' natural active phase.
export function activityMul(state, u) {
  const night = isNight(state);
  const phase = SLEEP[u.species]?.phase || 'diurnal';
  if (phase === 'crepuscular') return 1.0;
  const aligned = (phase === 'nocturnal') === night;
  return aligned ? 1.08 : 0.82;
}
const levelMul = (u) => 1 + 0.02 * (u.level - 1);

export function speedOf(state, u) {
  return SPECIES[u.species].speed * traitMul(u, 'speed') * (1 + state.mods.speedMul + envSpeed(state))
    * (1 + evoBonus(state, u.species, 'speed')) * levelMul(u) * productivity(state, u);
}
export function carryOf(state, u) {
  return Math.max(1, Math.ceil(SPECIES[u.species].carry * traitMul(u, 'carry')
    * (1 + state.mods.carryMul) * (1 + evoBonus(state, u.species, 'carry')) * levelMul(u)));
}
export function mineOf(state, u) {
  return SPECIES[u.species].mine * traitMul(u, 'mine') * (1 + state.mods.mineMul + envMine(state))
    * (1 + evoBonus(state, u.species, 'mine')) * levelMul(u) * productivity(state, u) * activityMul(state, u)
    * (state._laborFactor ?? 1); // fewer hands gather when builders are busy
}
// environment hooks (filled by economy via state._env cache to avoid import cycle churn)
const envSpeed = (state) => state._envMods?.speedMul || 0;
const envMine = (state) => state._envMods?.mineMul || 0;

// ---- Leveling --------------------------------------------------------------
export function gainXp(state, u, amt) {
  u.xp += amt * (1 + evoBonus(state, u.species, 'xp'));
  while (u.level < MAX_LEVEL && u.xp >= xpForLevel(u.level)) {
    u.xp -= xpForLevel(u.level);
    u.level++;
    u.skillPoints++;
    addFx(state, u.x, u.y, `⭐Lv.${u.level}`, 1.8);
  }
}

// ---- AI step ---------------------------------------------------------------
export function stepRodent(state, u, dt) {
  // Sleep takes priority: nap when exhausted, or during the species' rest phase.
  const sleepAt = NEEDS.energy.sleepAt * (1 - evoBonus(state, u.species, 'sleepNeed'));
  const restTime = isRestTime(state, u);
  if (u.phase === 'sleep') { runSleep(state, u, dt, restTime); return; }
  if (u.needs.energy <= sleepAt || (restTime && u.needs.energy < 55)) {
    u.phase = 'sleep'; u.carrying && deliverCarry(state, u); return;
  }

  const spd = speedOf(state, u) * 2.2;

  // A rodent in a hamster ball doesn't work or haul — it just rolls around for
  // travel & fun. Player orders (goto/explore) below steer it; with no order it
  // wanders idly. (It never gathers, so balls are useless for transporting.)
  if (u.inBall && !u.order) {
    u._wanderT = (u._wanderT || 0) - dt;
    if (u._wanderT <= 0 || u._wx == null) {
      u._wanderT = 1.5 + Math.random() * 2.5;
      u._wx = Math.max(1, Math.min(GRID_W - 2, u.x + (Math.random() - 0.5) * 6));
      u._wy = Math.max(1, Math.min(GRID_H - 2, u.y + (Math.random() - 0.5) * 6));
    }
    moveToward(u, u._wx, u._wy, spd, dt);
    return;
  }

  // ---- Player orders (the colony is mostly an auto-sim, but a selected rodent
  // can be told to go somewhere or to explore). An order overrides auto-work;
  // sleep/needs still take priority (handled above), and the order survives a
  // nap. Fog is revealed by the per-tick exploration pass as the rodent travels.
  if (u.order) {
    if (u.order.kind === 'goto') {
      if (moveToward(u, u.order.x, u.order.y, spd, dt)) {
        u.order = null; u.phase = 'seek'; u.targetNode = null; // arrived → resume work
      }
      return;
    }
    if (u.order.kind === 'explore') {
      // Aim for the nearest fogged tile; re-target once it (or the current
      // target) has been revealed, sweeping outward until none remain.
      if (!u._exTarget || isSeen(state.world, u._exTarget.x, u._exTarget.y)) {
        u._exTarget = nearestUnseen(state.world, Math.round(u.x), Math.round(u.y));
      }
      if (!u._exTarget) { // whole map revealed → done
        u.order = null; u._exTarget = null; u.phase = 'seek'; u.targetNode = null;
        logMsg(state, `🧭 ${u.name} finished exploring — the map is fully revealed.`);
        return;
      }
      if (moveToward(u, u._exTarget.x, u._exTarget.y, spd, dt)) u._exTarget = null;
      return;
    }
  }

  switch (u.phase) {
    case 'seek': {
      if (!u.targetNode || u.targetNode.amount <= 0) {
        u.targetNode = nearestNode(state, u);
        if (!u.targetNode) { u.phase = 'idle'; return; }
      }
      const n = u.targetNode;
      if (moveToward(u, n.x, n.y, spd, dt)) { u.phase = 'work'; u.progress = 0; }
      break;
    }
    case 'work': {
      const n = u.targetNode;
      if (!n || n.amount <= 0) { u.phase = 'seek'; u.targetNode = null; return; }
      u.progress += mineOf(state, u) * dt * 1.5;
      u.needs.energy = Math.max(0, u.needs.energy - NEEDS.energy.workDrain * dt);
      if (u.progress >= 1) {
        const cap = carryOf(state, u);
        // A neighbour AI colony contesting this seam cuts what you can take from it.
        const got = Math.min(cap, n.amount, Math.ceil(u.progress)) * nodeContestFactor(state, n);
        n.amount -= got;
        u.carrying = { res: nodeRes(n), amount: got };
        gainXp(state, u, got);
        // Variety relieves boredom (gathering a *different* resource than last time).
        if (u.lastRes && u.lastRes !== u.carrying.res) u.needs.fun = Math.min(100, u.needs.fun + 4);
        u.lastRes = u.carrying.res;
        u.phase = 'deliver';
        u.targetDrop = nearestStorage(state, u);
      }
      break;
    }
    case 'deliver': {
      const d = u.targetDrop;
      const dx = d ? d.x : state.world.spawn.x, dy = d ? d.y : state.world.spawn.y;
      if (moveToward(u, dx, dy, spd, dt)) { deliverCarry(state, u); u.phase = 'seek'; }
      break;
    }
    case 'idle': {
      if (Math.random() < 0.02) { u.phase = 'seek'; u.targetNode = null; }
      break;
    }
  }
}

function deliverCarry(state, u) {
  if (u.carrying) { addRes(state, u.carrying.res, u.carrying.amount); u.carrying = null; }
}

function runSleep(state, u, dt, restTime) {
  const regen = NEEDS.energy.sleepRegen * (1 + evoBonus(state, u.species, 'sleepRegen')) * (SLEEP[u.species]?.need ? 1 : 1);
  u.needs.energy = Math.min(100, u.needs.energy + regen * dt);
  // Wake fully rested (or earlier if it's no longer rest time and energy is decent).
  if (u.needs.energy >= 98 || (!restTime && u.needs.energy >= 88)) { u.phase = 'seek'; u.targetNode = null; }
}

// Is it the unit's natural sleeping time? Nocturnal rest by day, diurnal by night.
function isRestTime(state, u) {
  const phase = SLEEP[u.species]?.phase || 'diurnal';
  const night = isNight(state);
  if (phase === 'nocturnal') return !night;
  if (phase === 'diurnal') return night;
  return false; // crepuscular: only sleeps when exhausted
}

function moveToward(u, tx, ty, spd, dt) {
  const dx = tx - u.x, dy = ty - u.y, dist = Math.hypot(dx, dy);
  if (dist < 0.15) return true;
  const step = Math.min(dist, spd * dt);
  u.x += (dx / dist) * step; u.y += (dy / dist) * step;
  return false;
}

function nearestNode(state, u) {
  let best = null, bd = Infinity, bestPref = null, bdPref = Infinity;
  for (const n of state.world.nodes) {
    if (n.amount <= 0) continue;
    if (NODE_TYPES[n.kind].surface === false) continue; // underground needs a Mine
    if (n.claimedBy) continue;                            // belt/mine already on it
    const d = (n.x - u.x) ** 2 + (n.y - u.y) ** 2;
    if (d < bd) { bd = d; best = n; }
    if (n.kind === u.prefKind && d < bdPref) { bdPref = d; bestPref = n; }
  }
  return bestPref || best;
}
function nearestStorage(state, u) {
  let best = null, bd = Infinity;
  for (const b of state.buildings) {
    if (b.type !== 'storage' && b.type !== 'burrow') continue;
    const d = (b.x - u.x) ** 2 + (b.y - u.y) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best || { x: state.world.spawn.x, y: state.world.spawn.y };
}

// ---- Trait combination (breeding hybrids) ---------------------------------
export function combineRodents(state, a, b) {
  const child = makeRodent(state, a.species, a.x, a.y);
  for (const tid of Object.keys(TRAITS)) {
    const lvl = Math.max(a.traits[tid] || 0, b.traits[tid] || 0);
    child.traits[tid] = Math.min(6, lvl + (Math.random() < 0.15 && lvl > 0 ? 1 : 0));
  }
  child.hybridOf = [a.species, b.species];
  return child;
}

// Blend two coats: the child mostly takes a parent's colour & pattern (a clear
// inherited "hint"), with a small chance of the other parent's.
function blendCoat(ca, cb) {
  const a = ca || { color: 'golden', pattern: 'classic' };
  const b = cb || { color: 'golden', pattern: 'classic' };
  return { color: Math.random() < 0.5 ? a.color : b.color, pattern: Math.random() < 0.5 ? a.pattern : b.pattern };
}
// The strongest shared trait across the two parents (for a skill head-start).
function bestTrait(a, b) {
  let best = null, bv = 0;
  for (const t of Object.keys(TRAITS)) { const v = (a.traits[t] || 0) + (b.traits[t] || 0); if (v > bv) { bv = v; best = t; } }
  return best;
}

// A child born of two specific parents: inherits a family name, a hint of coat
// colour, blended traits, and a head-start in the family's strongest skill.
export function breedChild(state, a, b) {
  const sp = state.world.spawn;
  const hybrid = a.species !== b.species && Math.random() < 0.6;
  let child;
  if (hybrid) {
    child = combineRodents(state, a, b); // blends traits + sets hybridOf
  } else {
    child = makeRodent(state, a.species, sp.x, sp.y);
    for (const tid of Object.keys(TRAITS)) {
      const avg = ((a.traits[tid] || 0) + (b.traits[tid] || 0)) / 2;
      child.traits[tid] = Math.min(6, Math.round(avg) + (Math.random() < 0.12 && avg > 0 ? 1 : 0));
    }
  }
  child.x = sp.x + (Math.random() - 0.5); child.y = sp.y + (Math.random() - 0.5);
  child.parents = [a.id, b.id];
  child.parentNames = [a.name, b.name];
  child.family = (Math.random() < 0.5 ? a.family : b.family) || a.family || b.family || randomFamily();
  child.name = randomGivenName();
  if (child.species === 'hamster') child.coat = blendCoat(a.coat, b.coat);
  const best = bestTrait(a, b); // a little of the family's gift passes on
  if (best) child.traits[best] = Math.min(6, (child.traits[best] || 0) + 1);
  return child;
}
