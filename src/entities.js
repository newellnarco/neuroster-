// entities.js — rodent units, their stats, simple AI, and trait combination.
import { SPECIES, TRAITS, NODE_TYPES } from './config.js';

let _id = 1;
// Worker assignment order, weighted toward the materials early colonies need most
// (wood & stone) while still covering food and ores.
const PREF_ORDER = ['trees', 'rock', 'trees', 'bush', 'rock', 'trees', 'orevein', 'coalseam', 'bush', 'rock'];

export function makeRodent(state, species, x, y) {
  const def = SPECIES[species] || SPECIES.hamster;
  const count = state ? state.units.length : 0;
  return {
    id: state ? state.nextId++ : _id++,
    species,
    x: x + (Math.random() - 0.5), // tile coords (float)
    y: y + (Math.random() - 0.5),
    tx: null, ty: null,           // movement target tile
    job: 'gather',                // gather | haul | idle
    phase: 'seek',                // seek | work | deliver
    targetNode: null,
    carrying: null,               // { res, amount }
    progress: 0,
    traits: {},                   // traitId -> level
    xp: 0,
    prefKind: PREF_ORDER[count % PREF_ORDER.length], // spread workers, weighted to wood/stone
  };
}

// Effective stat = species base × trait multiplier × wellbeing × tech mods.
import { traitMul, wellbeingMul } from './state.js';

export function speedOf(state, u) {
  return SPECIES[u.species].speed * traitMul(u, 'speed') * (1 + state.mods.speedMul) * lerpWell(state);
}
export function carryOf(state, u) {
  return Math.ceil(SPECIES[u.species].carry * traitMul(u, 'carry') * (1 + state.mods.carryMul));
}
export function mineOf(state, u) {
  return SPECIES[u.species].mine * traitMul(u, 'mine') * (1 + state.mods.mineMul) * lerpWell(state);
}
// Wellbeing affects work rate but never fully stops it.
function lerpWell(state) { return 0.6 + 0.4 * (wellbeingMul(state) - 0.5) / 0.65; }

// ---- AI step (called per simulation tick) ---------------------------------
import { addRes } from './state.js';
import { GRID_W, GRID_H } from './config.js';

export function stepRodent(state, u, dt) {
  const spd = speedOf(state, u) * 2.2; // tiles/sec
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
      if (u.progress >= 1) {
        const cap = carryOf(state, u);
        const got = Math.min(cap, n.amount, Math.ceil(u.progress));
        n.amount -= got;
        u.carrying = { res: nodeRes(n), amount: got };
        u.xp += got;
        maybeLevelTrait(u);
        u.phase = 'deliver';
        u.targetDrop = nearestStorage(state, u);
      }
      break;
    }
    case 'deliver': {
      const d = u.targetDrop;
      const dx = d ? d.x : state.world.spawn.x;
      const dy = d ? d.y : state.world.spawn.y;
      if (moveToward(u, dx, dy, spd, dt)) {
        if (u.carrying) { addRes(state, u.carrying.res, u.carrying.amount); u.carrying = null; }
        u.phase = 'seek';
      }
      break;
    }
    case 'idle': {
      // wander a little, retry finding work occasionally
      if (Math.random() < 0.02) { u.phase = 'seek'; u.targetNode = null; }
      break;
    }
  }
}

function moveToward(u, tx, ty, spd, dt) {
  const dx = tx - u.x, dy = ty - u.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.15) return true;
  const step = Math.min(dist, spd * dt);
  u.x += (dx / dist) * step;
  u.y += (dy / dist) * step;
  return false;
}

const NODE_RES = Object.fromEntries(Object.entries(NODE_TYPES).map(([k, v]) => [k, v.resource]));
function nodeRes(n) { return NODE_RES[n.kind]; }

function nearestNode(state, u) {
  // Prefer the worker's assigned resource kind; fall back to nearest of any.
  let best = null, bd = Infinity, bestPref = null, bdPref = Infinity;
  for (const n of state.world.nodes) {
    if (n.amount <= 0) continue;
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

// On-the-job experience can raise a random relevant trait occasionally.
function maybeLevelTrait(u) {
  if (u.xp < 60) return;
  u.xp = 0;
  if (Math.random() < 0.5) {
    const pool = ['strength', 'capacity', 'swiftness'];
    const t = pool[Math.floor(Math.random() * pool.length)];
    u.traits[t] = Math.min(5, (u.traits[t] || 0) + 1);
  }
}

// ---- Trait combination (breeding hybrids) ---------------------------------
// Combine two parent rodents into an offspring whose traits are the best of
// both parents (with a chance to inherit the other parent's species "knack").
export function combineRodents(state, a, b) {
  const child = makeRodent(state, a.species, a.x, a.y);
  for (const tid of Object.keys(TRAITS)) {
    const lvl = Math.max(a.traits[tid] || 0, b.traits[tid] || 0);
    // small chance the blend pushes one level higher (hybrid vigor)
    child.traits[tid] = Math.min(6, lvl + (Math.random() < 0.15 && lvl > 0 ? 1 : 0));
  }
  child.hybridOf = [a.species, b.species];
  return child;
}
