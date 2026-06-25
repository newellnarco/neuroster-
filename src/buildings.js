// buildings.js — placement validation, cost handling, tech application.
import { BUILDINGS, TECH, SPECIES, TRAITS, TRAIT_BASE_COST } from './config.js';
import { canAfford, spend, logMsg } from './state.js';
import { getTile, TERRAIN, inBounds } from './world.js';
import { makeRodent } from './entities.js';

export function canPlace(state, type, x, y) {
  if (!inBounds(x, y)) return { ok: false, reason: 'Out of bounds' };
  const def = BUILDINGS[type];
  if (!def) return { ok: false, reason: 'Unknown building' };
  if (getTile(state.world.terrain, x, y) === TERRAIN.water)
    return { ok: false, reason: 'Cannot build on water' };
  if (state.buildings.some(b => b.x === x && b.y === y))
    return { ok: false, reason: 'Tile occupied' };
  if (state.world.nodes.some(n => n.x === x && n.y === y && n.amount > 0))
    return { ok: false, reason: 'A resource node is here' };
  if (!canAfford(state, def.cost))
    return { ok: false, reason: 'Not enough resources' };
  return { ok: true };
}

export function placeBuilding(state, type, x, y) {
  const check = canPlace(state, type, x, y);
  if (!check.ok) return check;
  const def = BUILDINGS[type];
  spend(state, def.cost);
  state.buildings.push({ id: state.nextId++, type, x, y, active: true });
  logMsg(state, `${def.icon} Built a ${def.name}.`);
  return { ok: true };
}

export function demolish(state, building) {
  const i = state.buildings.indexOf(building);
  if (i >= 0) {
    state.buildings.splice(i, 1);
    // refund half (rounded down)
    const def = BUILDINGS[building.type];
    for (const [k, v] of Object.entries(def.cost || {})) state.res[k] = (state.res[k] || 0) + Math.floor(v / 2);
    logMsg(state, `Demolished ${def.name} (50% refunded).`);
  }
}

// ---- Tech --------------------------------------------------------------
export function researchTech(state, id) {
  const t = TECH[id];
  if (!t || state.tech[id]) return { ok: false, reason: 'Unavailable' };
  if (!canAfford(state, t.cost)) return { ok: false, reason: 'Not enough resources' };
  spend(state, t.cost);
  state.tech[id] = true;
  applyTechEffect(state, t.effect);
  logMsg(state, `🔬 Researched ${t.name}.`);
  return { ok: true };
}

function applyTechEffect(state, effect) {
  if (!effect) return;
  for (const [k, v] of Object.entries(effect)) {
    if (k === 'unlock') { state.unlockedSpecies[v] = true; logMsg(state, `🎉 Unlocked ${SPECIES[v].name}s!`); }
    else state.mods[k] = (state.mods[k] || 0) + v;
  }
}

// ---- Per-unit trait upgrades -------------------------------------------
export function traitCost(level) {
  const out = {};
  for (const [k, v] of Object.entries(TRAIT_BASE_COST)) out[k] = Math.round(v * (level + 1) * 1.4);
  return out;
}
export function upgradeTrait(state, unit, traitId) {
  if (!TRAITS[traitId]) return { ok: false };
  const lvl = unit.traits[traitId] || 0;
  if (lvl >= 6) return { ok: false, reason: 'Maxed' };
  const cost = traitCost(lvl);
  if (!canAfford(state, cost)) return { ok: false, reason: 'Not enough resources' };
  spend(state, cost);
  unit.traits[traitId] = lvl + 1;
  return { ok: true };
}

// Recruit a new rodent of an unlocked species (costs food + research).
export function recruit(state, species) {
  if (!state.unlockedSpecies[species]) return { ok: false, reason: 'Locked' };
  if (state.units.length >= state.popCap) return { ok: false, reason: 'No housing space' };
  const cost = { food: 25, research: 10 };
  if (!canAfford(state, cost)) return { ok: false, reason: 'Not enough resources' };
  spend(state, cost);
  const sp = state.world.spawn;
  state.units.push(makeRodent(state, species, sp.x, sp.y));
  logMsg(state, `${SPECIES[species].icon} Recruited a ${SPECIES[species].name}.`);
  return { ok: true, species };
}
