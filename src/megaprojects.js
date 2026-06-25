// megaprojects.js — the long-horizon, multi-session goals (Arc 16). You pour
// surplus resources into a project over many sessions; when every requirement
// is met it completes and grants a permanent, powerful, colony-wide effect.
// State lives in state.megaprojects[id] = { contributed: {res: amt}, done: bool }.
import { MEGAPROJECTS, RESOURCES } from './config.js';
import { logMsg, addFx } from './state.js';
import { mainLevel } from './buildings.js';

function slot(state, id) {
  if (!state.megaprojects) state.megaprojects = {};
  return (state.megaprojects[id] ||= { contributed: {}, done: false });
}

// How much of each resource a project still needs.
export function remainingCost(state, id) {
  const def = MEGAPROJECTS[id]; if (!def) return {};
  const s = slot(state, id);
  const out = {};
  for (const [k, v] of Object.entries(def.cost)) {
    const left = v - (s.contributed[k] || 0);
    if (left > 0) out[k] = left;
  }
  return out;
}

// Fraction complete (0..1) by total resources contributed vs required.
export function megaProgress(state, id) {
  const def = MEGAPROJECTS[id]; if (!def) return 0;
  const s = slot(state, id);
  let need = 0, have = 0;
  for (const [k, v] of Object.entries(def.cost)) { need += v; have += Math.min(v, s.contributed[k] || 0); }
  return need ? have / need : 0;
}

export function isMegaUnlocked(state, id) {
  const def = MEGAPROJECTS[id]; if (!def) return false;
  return !def.reqLevel || mainLevel(state) >= def.reqLevel;
}

// Contribute surplus toward a project: pours as much of each still-needed
// resource as the stores allow (capped per click so it always feels deliberate).
const MAX_PER_CLICK = 120;
export function contributeMega(state, id) {
  const def = MEGAPROJECTS[id];
  if (!def) return { ok: false, reason: 'Unknown project' };
  const s = slot(state, id);
  if (s.done) return { ok: false, reason: 'Already complete' };
  if (!isMegaUnlocked(state, id)) return { ok: false, reason: `Needs Main Hamster Lv.${def.reqLevel}` };
  const remain = remainingCost(state, id);
  let moved = 0;
  for (const [k, left] of Object.entries(remain)) {
    const give = Math.min(left, state.res[k] || 0, MAX_PER_CLICK);
    if (give <= 0) continue;
    state.res[k] -= give;
    s.contributed[k] = (s.contributed[k] || 0) + give;
    moved += give;
  }
  if (moved <= 0) return { ok: false, reason: 'No matching resources to contribute' };
  addFx(state, state.world.spawn.x, state.world.spawn.y, def.icon, 1.6);
  if (!Object.keys(remainingCost(state, id)).length) completeMega(state, id);
  else logMsg(state, `${def.icon} Contributed to the ${def.name} (${Math.round(megaProgress(state, id) * 100)}% complete).`);
  return { ok: true };
}

function completeMega(state, id) {
  const def = MEGAPROJECTS[id];
  const s = slot(state, id);
  s.done = true;
  addFx(state, state.world.spawn.x, state.world.spawn.y, '🎉', 3);
  logMsg(state, `🎉 MEGAPROJECT COMPLETE: ${def.icon} ${def.name}! ${def.blurb}`);
  return { ok: true };
}

// Aggregate the effects of every COMPLETED megaproject. Cheap (few projects);
// cached on state._mega once per tick and read by economy/events/recompute.
export function megaBonuses(state) {
  const b = { prodMul: 0, foodMul: 0, mineMul: 0, storage: 0, defense: 0, protectAll: 0, power: 0, leadership: 0, breed: 0, moraleRecover: 0 };
  const mp = state.megaprojects;
  if (!mp) return b;
  for (const [id, s] of Object.entries(mp)) {
    if (!s.done) continue;
    const e = MEGAPROJECTS[id]?.effect || {};
    for (const k in b) if (e[k]) b[k] += e[k];
  }
  return b;
}

export function megaCount(state) {
  const mp = state.megaprojects; if (!mp) return 0;
  return Object.values(mp).filter(s => s.done).length;
}

export const costText = (c) => Object.entries(c).map(([k, v]) => `${RESOURCES[k]?.icon || k}${Math.ceil(v)}`).join(' ');
