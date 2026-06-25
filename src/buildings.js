// buildings.js — placement validation, cost handling, tech & evolution.
import { BUILDINGS, TECH, SPECIES, TRAITS, TRAIT_BASE_COST, EVOLUTIONS, DAY_SECONDS, NAME_CHANGE_DAYS } from './config.js';
import { canAfford, spend, logMsg } from './state.js';
import { getTile, TERRAIN, inBounds } from './world.js';
import { makeRodent } from './entities.js';

// The "main hamster" / player level = the highest level any rodent has reached.
// It gates access to advanced content, rewarding long-term colony management.
export function mainLevel(state) {
  let m = 1;
  for (const u of state.units) if (u.level > m) m = u.level;
  return m;
}

// Rename the founder hamster — allowed once every NAME_CHANGE_DAYS in-game days.
export function renameFounder(state, newName) {
  const day = Math.floor((state.env?.dayTime || 0) / DAY_SECONDS) + 1;
  const last = state.founder?.lastRenameDay || 0;
  if (day - last < NAME_CHANGE_DAYS && last !== 0 && state.env?.lived > 5)
    return { ok: false, reason: `Renaming is allowed once every ${NAME_CHANGE_DAYS} days (next on day ${last + NAME_CHANGE_DAYS}).` };
  const clean = (newName || '').trim().slice(0, 16);
  if (!clean) return { ok: false, reason: 'Enter a name' };
  state.founder.name = clean;
  state.founder.lastRenameDay = day;
  const f = state.units.find(u => u.founder);
  if (f) f.name = clean;
  logMsg(state, `📝 The founder is now named ${clean}.`);
  return { ok: true };
}

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
  // Wells need water nearby; mines need a depleting node in range.
  if (def.needsWater && !hasWaterNear(state, x, y, def.radius || 3))
    return { ok: false, reason: 'Place near water (a pond/river)' };
  if (def.autoMine && !hasNodeNear(state, x, y, def.radius || 3))
    return { ok: false, reason: 'Place near ore/coal/stone to mine' };
  if (def.needsNode && !hasNodeNear(state, x, y, def.radius || 2))
    return { ok: false, reason: 'Place near a resource node to feed the belt' };
  if (!canAfford(state, def.cost))
    return { ok: false, reason: 'Not enough resources' };
  return { ok: true };
}

function hasWaterNear(state, x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (getTile(state.world.terrain, x + dx, y + dy) === TERRAIN.water) return true;
  return false;
}
function hasNodeNear(state, x, y, r) {
  return state.world.nodes.some(n => n.amount > 0 && Math.abs(n.x - x) <= r && Math.abs(n.y - y) <= r);
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

// ---- Skill tree (colony tech) ------------------------------------------
export function researchTech(state, id) {
  const t = TECH[id];
  if (!t || state.tech[id]) return { ok: false, reason: 'Unavailable' };
  if (t.reqLevel && mainLevel(state) < t.reqLevel) return { ok: false, reason: `Needs main hamster Lv.${t.reqLevel}` };
  if (!canAfford(state, t.cost)) return { ok: false, reason: 'Not enough resources' };
  spend(state, t.cost);
  state.tech[id] = true;
  applyTechEffect(state, t.effect);
  logMsg(state, `🔬 Researched ${t.name}.`);
  return { ok: true };
}

// ---- Evolution tree (species-wide permanent upgrades) ------------------
export function evolve(state, id) {
  const e = EVOLUTIONS[id];
  if (!e || state.evolutions[id]) return { ok: false, reason: 'Unavailable' };
  if (e.req && !state.evolutions[e.req]) return { ok: false, reason: `Requires ${EVOLUTIONS[e.req].name}` };
  if (e.reqLevel && mainLevel(state) < e.reqLevel) return { ok: false, reason: `Needs main hamster Lv.${e.reqLevel}` };
  if (!canAfford(state, e.cost)) return { ok: false, reason: 'Not enough resources' };
  spend(state, e.cost);
  state.evolutions[id] = true;
  logMsg(state, `🧬 Evolution unlocked: ${e.name}!`);
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
  // A unit's earned skill points (from leveling) pay for trait upgrades for free.
  if ((unit.skillPoints || 0) > 0) {
    unit.skillPoints--;
    unit.traits[traitId] = lvl + 1;
    return { ok: true, paidWith: 'skillPoint' };
  }
  const cost = traitCost(lvl);
  if (!canAfford(state, cost)) return { ok: false, reason: 'Need a skill point or resources' };
  spend(state, cost);
  unit.traits[traitId] = lvl + 1;
  return { ok: true, paidWith: 'resources' };
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
