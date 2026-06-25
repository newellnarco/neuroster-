// events.js — disasters & predators: scheduling, protection, and consequences.
import { DISASTERS, BUILDINGS, SPECIES, BIOMES, BREEDS, TICKS_PER_SEC, DAY_SECONDS } from './config.js';
import { logMsg, population } from './state.js';

// Total protection the colony currently has against a given disaster key.
// Sums building `protect` values + per-species `protect` (scaled by count).
export function protectionAgainst(state, key) {
  let p = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (def?.protect?.[key]) p += def.protect[key];
  }
  for (const u of state.units) {
    const sp = SPECIES[u.species];
    if (sp?.protect?.[key]) p += sp.protect[key];
  }
  // Barracks/towers also contribute generic offense to fight predators.
  return p;
}

export function totalOffense(state) {
  let o = 0;
  for (const b of state.buildings) o += BUILDINGS[b.type]?.offense || 0;
  return o;
}

// Disasters don't begin until the colony has had time to find its feet.
const GRACE_SECONDS = 300;

// Called each tick. Uses per-disaster countdown timers stored on state.events.
export function stepEvents(state, dt) {
  if (!state.events) state.events = {};
  const pop = population(state);
  if (pop <= 0) return;
  const elapsed = state.env?.lived || 0; // seconds actually played
  if (elapsed < GRACE_SECONDS) return; // peaceful early game

  for (const [key, d] of Object.entries(DISASTERS)) {
    // First scheduled occurrence is offset past the grace period.
    const ev = state.events[key] || (state.events[key] = { timer: d.interval * (0.6 + 0.8 * hash(key)) });
    ev.timer -= dt;
    if (ev.timer > 0) continue;

    // Reschedule next occurrence; they grow slightly more frequent over time.
    const ramp = Math.max(0.55, 1 - elapsed / 6000);
    ev.timer = d.interval * ramp * (0.7 + 0.6 * hash(key + elapsed));

    fireDisaster(state, key, d, elapsed);
  }
}

function fireDisaster(state, key, d, elapsed) {
  const grow = 1 + elapsed / 3000; // disasters get tougher over time
  // Biome + weather/night modifiers scale how severe each event is here.
  const biome = BIOMES[state.world?.biome];
  const biomeMul = (biome?.hazardMul?.[key]) ?? 1;
  const envMul = 1 + (state._envMods?.hazardMul?.[key] || 0);
  const difficulty = BREEDS[state.founder?.breed]?.difficulty ?? 1; // founder breed sets the stakes
  const severity = d.baseSeverity * grow * biomeMul * Math.max(0.2, envMul) * difficulty;
  const offenseBonus = (d.kind === 'predator') ? totalOffense(state) : 0;
  const protect = protectionAgainst(state, key) + offenseBonus;
  const net = severity - protect;

  if (net <= 2) {
    logMsg(state, `${d.icon} ${d.name} approached but your defenses held! (def ${Math.round(protect)} ≥ ${Math.round(severity)})`);
    return;
  }

  const sev = net; // leftover severity drives the damage
  switch (d.effect) {
    case 'takeUnits': {
      const taken = Math.max(1, Math.round(sev / 14));
      const lost = removeUnits(state, taken);
      logMsg(state, `${d.icon} ${d.name} struck! Lost ${lost} rodent(s). Build defenses & keep guardian species!`);
      hurtHealth(state, 8);
      break;
    }
    case 'loot': {
      const stolen = lootResources(state, sev * 4);
      logMsg(state, `${d.icon} ${d.name} looted ${stolen} resources! Build Walls/Barracks.`);
      break;
    }
    case 'damage': {
      lootResources(state, sev * 3);
      hurtHealth(state, 10);
      logMsg(state, `${d.icon} ${d.name}! Food/stores damaged. Build Levees & Irrigation.`);
      break;
    }
    case 'destroy': {
      const gone = destroyRandomBuilding(state, Math.max(1, Math.round(sev / 12)));
      logMsg(state, `${d.icon} ${d.name}! ${gone} structure(s) collapsed. Build Quake Shelters.`);
      hurtHealth(state, 6);
      break;
    }
  }
}

// Reduce every rodent's health (disasters are stressful & injurious).
function hurtHealth(state, amt) {
  for (const u of state.units) u.needs.health = Math.max(0, u.needs.health - amt);
}

function removeUnits(state, n) {
  let lost = 0;
  for (let i = 0; i < n && state.units.length > 1; i++) {
    const idx = Math.floor(rand(state) * state.units.length);
    state.units.splice(idx, 1); lost++;
  }
  return lost;
}

function lootResources(state, amount) {
  let remaining = amount, stolen = 0;
  const keys = ['food', 'planks', 'iron', 'wood', 'stone'];
  for (const k of keys) {
    if (remaining <= 0) break;
    const take = Math.min(state.res[k] || 0, remaining);
    state.res[k] -= take; remaining -= take; stolen += take;
  }
  return Math.round(stolen);
}

function destroyRandomBuilding(state, n) {
  let gone = 0;
  for (let i = 0; i < n && state.buildings.length > 0; i++) {
    const idx = Math.floor(rand(state) * state.buildings.length);
    // never destroy the very last burrow to avoid soft-locks
    const b = state.buildings[idx];
    if (BUILDINGS[b.type]?.breed && state.buildings.filter(x => BUILDINGS[x.type]?.breed).length <= 1) continue;
    state.buildings.splice(idx, 1); gone++;
  }
  return gone;
}

// Deterministic-ish helpers (avoid Math.random for save/replay friendliness here
// it's fine, but keep a tiny state-seeded jitter).
function rand(state) { state._r = ((state._r || state.seed || 1) * 1103515245 + 12345) & 0x7fffffff; return state._r / 0x7fffffff; }
function hash(s) { s = '' + s; let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return (h % 1000) / 1000; }
