// events.js — disasters & predators: scheduling, protection, and consequences.
import { DISASTERS, BUILDINGS, SPECIES, BIOMES, BREEDS, FACTIONS, TRADE, MORALE, TUNNEL_TIERS, TICKS_PER_SEC, DAY_SECONDS } from './config.js';
import { logMsg, population, addRes, addFx } from './state.js';
import { makeRodent } from './entities.js';

// Repelling is a choice between kindness and preservation:
//  • With a Vet Clinic you HEAL the injured attacker — morale rises, and a
//    spared raider may even join your colony (and the faction warms to you).
//  • Otherwise lethal offense drives them off, but the bloodshed costs morale.
//  • Walls-only deterrence (no offense, no vet) is bloodless — no morale change.
function handleRepel(state, what, factionId = null) {
  const vets = state.buildings.reduce((s, b) => s + (BUILDINGS[b.type]?.vet || 0), 0);
  if (vets > 0) {
    state.morale = Math.min(100, (state.morale ?? 100) + 3);
    let joined = false;
    if (factionId) {
      state.factions[factionId].standing = Math.min(100, state.factions[factionId].standing + 6);
      if (Math.random() < 0.5 && state.units.length < state.popCap) { recruitMercy(state); joined = true; }
    } else if (Math.random() < 0.25 && state.units.length < state.popCap) { recruitMercy(state); joined = true; }
    logMsg(state, `🕊️ Your vets healed the injured ${what} instead of killing — morale rises${joined ? ', and a grateful newcomer joined the colony!' : '.'}`);
  } else if ((totalOffense(state) || 0) > 0) {
    state.morale = Math.max(0, (state.morale ?? 100) - MORALE.violenceCost);
    logMsg(state, `⚖️ Your defenders drove off the ${what}, but the bloodshed weighs on morale.`);
  }
}
function recruitMercy(state) {
  const sp = state.world.spawn;
  const u = makeRodent(state, 'hamster', sp.x, sp.y);
  u.bond = 60;
  state.units.push(u);
  addFx(state, sp.x, sp.y, '🤝', 2);
}

// Attacks, raids & disasters batter tunnel sections (HP); spent ones collapse.
function damageTunnels(state, amount) {
  const tunnels = state.buildings.filter(b => BUILDINGS[b.type]?.tunnel);
  if (!tunnels.length || amount <= 0) return;
  const hit = tunnels[Math.floor(rand(state) * tunnels.length)];
  const tier = TUNNEL_TIERS[hit.tier || 0];
  hit.hp = (hit.hp ?? tier.hp) - amount;
  if (hit.hp <= 0) {
    state.buildings.splice(state.buildings.indexOf(hit), 1);
    addFx(state, hit.x, hit.y, '💥', 1.6);
    logMsg(state, '💥 A tunnel section collapsed under the assault. Rebuild & upgrade to steel!');
  }
}

// Total protection the colony currently has against a given disaster key.
// Sums building `protect` values + per-species `protect` (scaled by count).
export function protectionAgainst(state, key) {
  let p = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (b.underConstruction) continue;
    if (def?.protect?.[key]) p += def.protect[key];
    // Tunnels bar other animals from crossing — protection scales with tier & HP.
    if (def?.tunnel) {
      const tier = TUNNEL_TIERS[b.tier || 0];
      const frac = (b.hp ?? tier.hp) / tier.hp;
      if (tier.protect[key]) p += tier.protect[key] * frac;
    }
  }
  for (const u of state.units) {
    const sp = SPECIES[u.species];
    if (sp?.protect?.[key]) p += sp.protect[key];
    if (sp?.def) p += sp.def; // guards (e.g. guinea pigs) defend against everything
  }
  return p;
}

export function totalOffense(state) {
  let o = 0;
  for (const b of state.buildings) if (!b.underConstruction) o += BUILDINGS[b.type]?.offense || 0;
  for (const u of state.units) o += SPECIES[u.species]?.atk || 0; // soldiers (guinea pigs)
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

  // Floods are double-edged: they always bring seeds & fertile soil, and only
  // damage/drown things when protection (levees/irrigation) can't hold them back.
  if (d.effect === 'flood') { handleFlood(state, d, net); return; }

  if (net <= 2) {
    logMsg(state, `${d.icon} ${d.name} approached but your defenses held! (def ${Math.round(protect)} ≥ ${Math.round(severity)})`);
    if (d.kind === 'predator') handleRepel(state, d.name); // kill or show mercy (with a Vet)
    return;
  }

  const sev = net; // leftover severity drives the damage
  switch (d.effect) {
    case 'takeUnits': {
      const taken = Math.max(1, Math.round(sev / 14));
      const lost = removeUnits(state, taken);
      logMsg(state, `${d.icon} ${d.name} struck! Lost ${lost} rodent(s). Build defenses & keep guardian species!`);
      hurtHealth(state, 8);
      state.morale = Math.max(0, (state.morale ?? 100) - lost * 4); // grief for the taken
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
      damageTunnels(state, sev);
      logMsg(state, `${d.icon} ${d.name}! ${gone} structure(s) collapsed. Build Quake Shelters.`);
      hurtHealth(state, 6);
      break;
    }
  }
}

// ---- Factions: standing drift, hoard-envy, and raids -----------------------
export function stepFactions(state, dt) {
  if (!state.factions) return;
  const lived = state.env?.lived || 0;
  for (const [id, f] of Object.entries(FACTIONS)) {
    const st = state.factions[id] || (state.factions[id] = { standing: 0, raidTimer: 150 });
    // drift toward neutral
    if (st.standing !== 0) { const d = Math.min(Math.abs(st.standing), TRADE.standingDecay * dt); st.standing += st.standing > 0 ? -d : d; }
    // hoarding coveted goods breeds envy (lowers standing)
    let hoard = 0;
    for (const r of f.covets) { const over = (state.res[r] || 0) - TRADE.hoardThreshold; if (over > 0) hoard += over; }
    if (hoard > 0) st.standing = Math.max(-100, st.standing - (0.06 + hoard * 0.0010) * dt);
    st.hoard = hoard;
    // raid cadence
    st.raidTimer -= dt;
    if (st.raidTimer <= 0) {
      st.raidTimer = 150 + 120 * hash(id + Math.floor(lived));
      if (lived < GRACE_SECONDS) continue;
      const pressure = Math.max(0, -st.standing) + Math.min(45, hoard * 0.12);
      if (pressure > 14) fireFactionRaid(state, id, f, pressure);
    }
  }
}

function fireFactionRaid(state, id, f, pressure) {
  const severity = pressure * (1 + (state.env?.lived || 0) / 4000);
  const protect = protectionAgainst(state, 'raid') + totalOffense(state);
  if (severity - protect <= 2) {
    logMsg(state, `${f.icon} ${f.name} raiders probed your defenses but were driven off!`);
    handleRepel(state, `${f.name} raiders`, id); // heal them (Vet) to win them over, or fight
    return;
  }
  const net = severity - protect;
  let stolen = 0;
  for (const r of f.covets) { const take = Math.min(state.res[r] || 0, net * 1.6); if (take > 0) { state.res[r] -= take; stolen += take; } }
  const wrecked = destroyTargeted(state, Math.max(1, Math.round(net / 14)));
  damageTunnels(state, net);
  for (const u of state.units) u.needs.health = Math.max(0, u.needs.health - 5);
  state.factions[id].standing = Math.max(-100, state.factions[id].standing - 6);
  addFx(state, state.world.spawn.x, state.world.spawn.y, f.icon, 2);
  logMsg(state, `${f.icon} The ${f.name} RAIDED — stole ${Math.round(stolen)} supplies${wrecked ? ` & wrecked ${wrecked} structure(s)` : ''}! Build Walls or make peace.`);
}

// Raiders smash walls, housing, storage & facilities first.
function destroyTargeted(state, n) {
  const prefer = ['Defense', 'Housing', 'Storage', 'Production'];
  let gone = 0;
  for (let i = 0; i < n; i++) {
    const targets = state.buildings.filter(b => {
      const def = BUILDINGS[b.type];
      if (def?.breed && state.buildings.filter(x => BUILDINGS[x.type]?.breed).length <= 1) return false;
      return prefer.includes(def?.category);
    });
    if (!targets.length) break;
    const b = targets[Math.floor(rand(state) * targets.length)];
    if (b.nodeId != null) { const node = state.world.nodes.find(o => o.id === b.nodeId); if (node) node.claimedBy = null; }
    state.buildings.splice(state.buildings.indexOf(b), 1); gone++;
  }
  return gone;
}

// Flood: always deposits seeds + leaves fertile soil; damages & drowns mines only
// when it overwhelms your protection (levees, irrigation, beavers).
function handleFlood(state, d, net) {
  addRes(state, 'seeds', d.seeds || 40);
  state.fertileUntil = (state.env?.lived || 0) + (d.fertileSeconds || 120);
  addFx(state, state.world.spawn.x, state.world.spawn.y, '🌱', 2);
  if (net <= 2) {
    logMsg(state, `${d.icon} Floodwaters rose but your levees held — fertile silt left behind (+${d.seeds || 40} seeds, richer farms).`);
    return;
  }
  // Overwhelmed: damage stores, hurt rodents, and drown a working mine.
  lootResources(state, net * 2.5);
  hurtHealth(state, 9);
  damageTunnels(state, net);
  const drowned = floodAMine(state);
  logMsg(state, `${d.icon} Flood broke through! Stores damaged${drowned ? ', a mine flooded' : ''} — but it left fertile soil (+${d.seeds || 40} seeds). Build Levees/Irrigation.`);
}

// Disable a random working mine; it must be repaired before it works again.
function floodAMine(state) {
  const mines = state.buildings.filter(b => BUILDINGS[b.type]?.mine && !b.flooded);
  if (!mines.length) return false;
  const m = mines[Math.floor(rand(state) * mines.length)];
  m.flooded = true; m.repairUntil = null;
  addFx(state, m.x, m.y, '🌊', 2);
  return true;
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
