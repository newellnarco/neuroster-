// buildings.js — placement validation, cost handling, tech & evolution.
import { BUILDINGS, TECH, SPECIES, TRAITS, TRAIT_BASE_COST, EVOLUTIONS, CARE, NODE_TYPES, MINE_REPAIR, WASTE, FACTIONS, TRADE, TUNNEL_TIERS, BRIDGE_TIERS, WALL_TIERS, fortTiers, TOWNHALL_TIERS, CONSTRUCTION, DAY_SECONDS, NAME_CHANGE_DAYS, RESCUE } from './config.js';

// Labour-time for a project, from the total resources it costs (bigger = longer).
export function buildTimeFor(cost) {
  const sum = Object.values(cost || {}).reduce((a, b) => a + b, 0);
  return Math.max(CONSTRUCTION.minTime, sum * CONSTRUCTION.timePerCost);
}
import { canAfford, spend, logMsg, addFx, addCompassion } from './state.js';
import { getTile, TERRAIN, inBounds, wasteAt } from './world.js';
import { makeRodent, gainXp } from './entities.js';
import { spawnCaravan } from './factions.js';

// Hands-on care: tend a single rodent for an instant need boost + bond + XP.
// Cooldowns reward periodic check-ins (not frantic clicking). Returns ok/reason.
export function careFor(state, unit, kind) {
  const c = CARE[kind];
  if (!c || !unit) return { ok: false, reason: 'Unavailable' };
  const now = state.env?.lived || 0;
  const ready = (unit.careCd?.[kind] || 0);
  if (now < ready) return { ok: false, reason: `${c.name} again in ${Math.ceil(ready - now)}s` };
  if (!canAfford(state, c.cost)) return { ok: false, reason: 'Not enough resources' };
  spend(state, c.cost);
  unit.needs[c.need] = Math.min(100, (unit.needs[c.need] || 0) + c.amount);
  unit.bond = Math.min(100, (unit.bond ?? 45) + c.bond);
  gainXp(state, unit, c.xp);
  unit.careCd = unit.careCd || {}; unit.careCd[kind] = now + c.cd;
  addCompassion(state, 0.4); // hands-on care is kindness
  addFx(state, unit.x, unit.y, c.fx, 1.4);
  return { ok: true };
}

// Take in the lost/hurt animal currently waiting at the colony's edge.
export function takeInRescue(state) {
  const r = state.rescue;
  if (!r) return { ok: false, reason: 'No stray to take in right now' };
  state.rescue = null;
  addCompassion(state, RESCUE.compassionTakeIn);
  state.morale = Math.min(100, (state.morale ?? 100) + RESCUE.moraleTakeIn);
  addFx(state, r.x, r.y, '💗', 2.4);
  if (state.units.length < state.popCap) {
    const u = makeRodent(state, r.species, state.world.spawn.x, state.world.spawn.y);
    u.name = r.name || u.name; u.bond = 65; u.rescued = true;
    state.units.push(u);
    logMsg(state, `💗 You took in ${u.name} the ${SPECIES[r.species]?.name || 'stray'} — they join your colony, grateful and bonded.`);
    return { ok: true, joined: true };
  }
  logMsg(state, `💗 You sheltered a lost ${SPECIES[r.species]?.name || 'animal'} until it was well — it went on its way, grateful. (Build housing so strays can stay.)`);
  return { ok: true, joined: false };
}

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
  if (getTile(state.world.terrain, x, y) === TERRAIN.water && !def.bridge)
    return { ok: false, reason: 'Only bridges can be built on water' };
  if (wasteAt(state.world, x, y) >= WASTE.blockAt)
    return { ok: false, reason: 'Too soiled — compost the droppings here first' };
  if (state.buildings.some(b => b.x === x && b.y === y))
    return { ok: false, reason: 'Tile occupied' };
  if (state.world.nodes.some(n => n.x === x && n.y === y && n.amount > 0))
    return { ok: false, reason: 'A resource node is here' };
  // Wells need water nearby; mines need a depleting node in range.
  if (def.needsWater && !hasWaterNear(state, x, y, def.radius || 3))
    return { ok: false, reason: 'Place near water (a pond/river)' };
  if (def.mine && !undergroundNear(state, x, y, def.radius || 1))
    return { ok: false, reason: 'Place on an underground iron-ore or coal seam' };
  if (def.needsNode && !surfaceNodeNear(state, x, y, def.radius || 2))
    return { ok: false, reason: 'Place near trees/rocks to feed the belt' };
  if (def.requiresSpecies && !state.units.some(u => u.species === def.requiresSpecies))
    return { ok: false, reason: `Needs a ${SPECIES[def.requiresSpecies].name} in the colony to build` };
  if (!canAfford(state, def.cost))
    return { ok: false, reason: 'Not enough resources' };
  return { ok: true };
}

function hasWaterNear(state, x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (getTile(state.world.terrain, x + dx, y + dy) === TERRAIN.water) return true;
  return false;
}
function surfaceNodeNear(state, x, y, r) {
  return state.world.nodes.some(n => n.amount > 0 && NODE_TYPES[n.kind].surface !== false && Math.abs(n.x - x) <= r && Math.abs(n.y - y) <= r);
}
function undergroundNear(state, x, y, r) {
  return state.world.nodes.some(n => n.amount > 0 && !n.claimedBy && NODE_TYPES[n.kind].surface === false && Math.abs(n.x - x) <= r && Math.abs(n.y - y) <= r);
}

export function placeBuilding(state, type, x, y) {
  const check = canPlace(state, type, x, y);
  if (!check.ok) return check;
  const def = BUILDINGS[type];
  spend(state, def.cost);
  const b = { id: state.nextId++, type, x, y, active: true };
  if (def.tunnel) { b.tier = 0; b.hp = TUNNEL_TIERS[0].hp; } // tunnels start at wood
  if (def.bridge) { b.tier = 0; b.hp = BRIDGE_TIERS[0].hp; } // bridges start at wood
  if (def.wall) { b.tier = 0; b.hp = WALL_TIERS[0].hp; }     // walls start at wood
  if (def.tower) b.mode = 'watch'; // towers start peaceful (vision), toggle to defend
  if (def.townhall) b.tier = 0;
  // Start as a construction site; rodents build it over time before it works.
  b.underConstruction = true; b.progress = 0; b.buildTime = buildTimeFor(def.cost);
  state.buildings.push(b);
  logMsg(state, `${def.icon} ${def.name} foundation laid — builders are on it (~${Math.round(b.buildTime)}s).`);
  return { ok: true };
}

// Begin repairing a flooded mine: pay materials, then it works again after a delay.
export function repairMine(state, b) {
  if (!b || !BUILDINGS[b.type]?.mine || !b.flooded) return { ok: false, reason: 'Not a flooded mine' };
  if (b.repairUntil != null) return { ok: false, reason: 'Already being repaired' };
  if (!canAfford(state, MINE_REPAIR.cost)) return { ok: false, reason: `Repair needs ${Object.entries(MINE_REPAIR.cost).map(([k, v]) => k + ' ' + v).join(', ')}` };
  spend(state, MINE_REPAIR.cost);
  // Gophers tunnel in and repair much faster.
  const gophers = state.units.filter(u => u.species === 'gopher').length;
  const secs = Math.round(MINE_REPAIR.seconds / (1 + 0.5 * gophers));
  b.repairUntil = (state.env?.lived || 0) + secs;
  logMsg(state, `🔧 Repairing a flooded mine (~${secs}s)${gophers ? ' — gophers digging in fast!' : ''}…`);
  return { ok: true };
}

// ---- Diplomacy / trade (needs a Trading Hut) ---------------------------
export const hasTradingHut = (state) => state.buildings.some(b => BUILDINGS[b.type]?.trading && !b.underConstruction);
const clampStanding = (v) => Math.max(-100, Math.min(100, v));

// Gift a coveted resource to strengthen the alliance.
export function giftFaction(state, id) {
  const f = FACTIONS[id]; if (!f || !hasTradingHut(state)) return { ok: false, reason: 'Build a Trading Hut' };
  const res = f.covets.find(r => (state.res[r] || 0) >= TRADE.giftAmount);
  if (!res) return { ok: false, reason: `Need ${TRADE.giftAmount} of ${f.covets.join('/')}` };
  state.res[res] -= TRADE.giftAmount;
  state.factions[id].standing = clampStanding(state.factions[id].standing + TRADE.giftStanding);
  addCompassion(state, 1); // generosity
  spawnCaravan(state, id, 'trade');
  logMsg(state, `${f.icon} Gifted ${TRADE.giftAmount} ${res} to the ${f.name} (+alliance).`);
  return { ok: true };
}
// Barter a coveted resource for their offered goods.
export function barterFaction(state, id) {
  const f = FACTIONS[id]; if (!f || !hasTradingHut(state)) return { ok: false, reason: 'Build a Trading Hut' };
  const res = f.covets.find(r => (state.res[r] || 0) >= TRADE.barterGive);
  if (!res) return { ok: false, reason: `Need ${TRADE.barterGive} of ${f.covets.join('/')}` };
  state.res[res] -= TRADE.barterGive;
  state.res[f.offers] = (state.res[f.offers] || 0) + TRADE.barterGet;
  state.factions[id].standing = clampStanding(state.factions[id].standing + TRADE.barterStanding);
  spawnCaravan(state, id, 'trade');
  logMsg(state, `${f.icon} Traded ${TRADE.barterGive} ${res} → ${TRADE.barterGet} ${f.offers} with the ${f.name}.`);
  return { ok: true };
}
// Call in a favour from an ally — costs standing, brings emergency supplies.
export function requestAid(state, id) {
  const f = FACTIONS[id]; if (!f || !hasTradingHut(state)) return { ok: false, reason: 'Build a Trading Hut' };
  const st = state.factions[id].standing;
  if (st < TRADE.aidStanding) return { ok: false, reason: `Need +${TRADE.aidStanding} standing (allied)` };
  state.factions[id].standing = clampStanding(st - TRADE.aidCost);
  state.res.food = (state.res.food || 0) + 40; state.res.water = (state.res.water || 0) + 40;
  state.res[f.offers] = (state.res[f.offers] || 0) + 25;
  spawnCaravan(state, id, 'aid');
  logMsg(state, `${f.icon} The ${f.name} sent aid! (+food, +water, +${f.offers})`);
  return { ok: true };
}

// Click a tiered fortification (tunnel or bridge) to repair its damage or
// upgrade it a tier (wood→iron/stone→steel). Repair always comes first.
export function upgradeTunnel(state, b) {
  const tiers = fortTiers(b.type);
  if (!tiers) return { ok: false };
  const kind = BUILDINGS[b.type]?.bridge ? 'bridge' : BUILDINGS[b.type]?.wall ? 'wall' : 'tunnel';
  const tier = tiers[b.tier || 0];
  if ((b.hp ?? tier.hp) < tier.hp) {
    const repairCost = tier.repairCost || { wood: 8 };
    if (!canAfford(state, repairCost)) return { ok: false, reason: `Repair needs ${costText(repairCost)}` };
    spend(state, repairCost); b.hp = tier.hp;
    logMsg(state, `🛠️ Repaired a ${tier.name} ${kind} section.`);
    return { ok: true };
  }
  if (b.underConstruction) return { ok: false, reason: 'Still under construction' };
  if (b.upgrading) return { ok: false, reason: 'Already upgrading' };
  const next = tiers[(b.tier || 0) + 1];
  if (!next) return { ok: false, reason: 'Already steel (max tier)' };
  if (!canAfford(state, next.upgradeCost)) return { ok: false, reason: `Upgrade needs ${costText(next.upgradeCost)}` };
  spend(state, next.upgradeCost);
  b.upgrading = { toTier: (b.tier || 0) + 1, progress: 0, time: buildTimeFor(next.upgradeCost) };
  logMsg(state, `🔧 Upgrading a ${kind} section to ${next.name} (~${Math.round(b.upgrading.time)}s)…`);
  return { ok: true };
}
const costText = (c) => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ');

// Click the Town Hall to upgrade the leader's seat to the next tier.
export function upgradeTownhall(state, b) {
  if (!BUILDINGS[b.type]?.townhall) return { ok: false };
  if (b.underConstruction) return { ok: false, reason: 'Still under construction' };
  if (b.upgrading) return { ok: false, reason: 'Already upgrading' };
  const next = TOWNHALL_TIERS[(b.tier || 0) + 1];
  if (!next) return { ok: false, reason: 'Already the Grand Hall (max)' };
  if (!canAfford(state, next.upgradeCost)) return { ok: false, reason: `Upgrade needs ${costText(next.upgradeCost)}` };
  spend(state, next.upgradeCost);
  b.upgrading = { toTier: (b.tier || 0) + 1, progress: 0, time: buildTimeFor(next.upgradeCost) };
  logMsg(state, `🔧 Upgrading the leader's seat to ${next.name} (~${Math.round(b.upgrading.time)}s)…`);
  return { ok: true };
}

// Clean a dirty burrow (manual upkeep) — resets its filth so it houses & breeds again.
export function cleanBurrow(state, b) {
  if (!BUILDINGS[b.type]?.breed) return { ok: false };
  if ((b.dirt || 0) < 1) return { ok: false, reason: 'Already clean' };
  b.dirt = 0; b.degraded = false;
  addFx(state, b.x, b.y, '🧹', 1.4);
  logMsg(state, '🧹 Cleaned a burrow — fresh bedding all round.');
  return { ok: true };
}

export function demolish(state, building) {
  const i = state.buildings.indexOf(building);
  if (i >= 0) {
    state.buildings.splice(i, 1);
    // release any deposit this building had claimed (e.g. a mine)
    if (building.nodeId != null) { const n = state.world.nodes.find(o => o.id === building.nodeId); if (n) n.claimedBy = null; }
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
