// events.js — disasters & predators: scheduling, protection, and consequences.
import { DISASTERS, BUILDINGS, SPECIES, BIOMES, BREEDS, FACTIONS, TRADE, MORALE, TUNNEL_TIERS, BRIDGE_TIERS, fortTiers, DIFFICULTIES, TICKS_PER_SEC, DAY_SECONDS, JUSTICE } from './config.js';
import { logMsg, population, addRes, addFx, addCompassion, addValor } from './state.js';
import { makeRodent } from './entities.js';
import { spawnCaravan } from './factions.js';

// Repelling is a choice between kindness and preservation:
//  • With a Vet Clinic you HEAL the injured attacker — morale rises, and a
//    spared raider may even join your colony (and the faction warms to you).
//  • Otherwise lethal offense drives them off, but the bloodshed costs morale.
//  • Walls-only deterrence (no offense, no vet) is bloodless — no morale change.
function handleRepel(state, what, factionId = null) {
  const vets = state.buildings.reduce((s, b) => s + (BUILDINGS[b.type]?.vet || 0), 0);
  if (vets > 0) {
    state.morale = Math.min(100, (state.morale ?? 100) + 3);
    addCompassion(state, 2); // mercy & healing
    let joined = false;
    if (factionId) {
      state.factions[factionId].standing = Math.min(100, state.factions[factionId].standing + 6);
      if (Math.random() < 0.5 && state.units.length < state.popCap) { recruitMercy(state); joined = true; }
    } else if (Math.random() < 0.25 && state.units.length < state.popCap) { recruitMercy(state); joined = true; }
    logMsg(state, `🕊️ Your vets healed the injured ${what} instead of killing — morale rises${joined ? ', and a grateful newcomer joined the colony!' : '.'}`);
  } else if ((totalOffense(state) || 0) > 0) {
    state.morale = Math.max(0, (state.morale ?? 100) - MORALE.violenceCost);
    addCompassion(state, -1); // bloodshed weighs on the colony's conscience
    addValor(state, 3);       // …but victory in battle stokes martial pride (morally neutral)
    logMsg(state, `⚖️ Your defenders drove off the ${what} — bloodshed weighs on the conscience, but the colony takes fierce pride in the victory.`);
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

// Floods wash tiered forts away; wildfire burns wooden ones. Damages a random
// matching structure (wood-only when burning); destroys it if HP runs out.
function damageFort(state, amount, pred, noun, burning = false) {
  const list = state.buildings.filter(b => pred(b) && (!burning || (b.tier || 0) === 0));
  if (!list.length || amount <= 0) return;
  const hit = list[Math.floor(rand(state) * list.length)];
  const tiers = fortTiers(hit.type); if (!tiers) return;
  const tier = tiers[hit.tier || 0];
  hit.hp = (hit.hp ?? tier.hp) - amount;
  if (hit.hp <= 0) {
    state.buildings.splice(state.buildings.indexOf(hit), 1);
    addFx(state, hit.x, hit.y, burning ? '🔥' : '🌊', 1.8);
    logMsg(state, `${burning ? '🔥' : '🌊'} A ${tier.name.toLowerCase()} ${noun} was ${burning ? 'burned down' : 'washed away'} — upgrade to stone/steel to withstand it!`);
  }
}

// Total protection the colony currently has against a given disaster key.
// Sums building `protect` values + per-species `protect` (scaled by count).
export function protectionAgainst(state, key) {
  let p = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (b.underConstruction) continue;
    // Towers protect more in DEFEND stance, less while just on WATCH.
    if (def?.protect?.[key]) p += def.protect[key] * (def.tower ? (b.mode === 'defend' ? 1 : 0.6) : 1);
    // Tiered forts (tunnels bar crossings; bridges hold floods) — protection
    // scales with tier & remaining HP.
    const ft = fortTiers(b.type);
    if (ft) {
      const tier = ft[b.tier || 0];
      const frac = (b.hp ?? tier.hp) / tier.hp;
      if (tier.protect[key]) p += tier.protect[key] * frac;
    }
  }
  for (const u of state.units) {
    const sp = SPECIES[u.species];
    if (sp?.protect?.[key]) p += sp.protect[key];
    if (sp?.def) p += sp.def; // guards (e.g. guinea pigs) defend against everything
  }
  p += state._mega?.protectAll || 0; // the Citadel shields against every threat
  return p;
}

export function totalOffense(state) {
  let o = 0;
  for (const b of state.buildings) {
    if (b.underConstruction) continue;
    const def = BUILDINGS[b.type];
    o += def?.offense || 0;
    if (def?.tower && b.mode === 'defend') o += def.towerOffense || 0; // towers fight only when set to DEFEND
  }
  for (const u of state.units) o += SPECIES[u.species]?.atk || 0; // soldiers (guinea pigs)
  o += state._doc?.offense || 0; // War Strategy doctrine
  return o;
}

// Disasters don't begin until the colony has had time to find its feet.
const GRACE_SECONDS = 420;
// Global pacing: stretches the gaps between ALL events so a normal game breathes
// (raise for calmer, lower for busier). Difficulty still scales severity.
const EVENT_PACE = 1.7;

// Called each tick. Uses per-disaster countdown timers stored on state.events.
export function stepEvents(state, dt) {
  if (state.disasters === false) return; // peaceful mode: no predators/disasters
  if (!state.events) state.events = {};
  const pop = population(state);
  if (pop <= 0) return;
  const elapsed = state.env?.lived || 0; // seconds actually played
  if (elapsed < GRACE_SECONDS) return; // peaceful early game

  const biome = state.world?.biome;
  for (const [key, d] of Object.entries(DISASTERS)) {
    if (d.biomes && !d.biomes.includes(biome)) continue; // biome-specific events
    // First scheduled occurrence is offset past the grace period.
    const ev = state.events[key] || (state.events[key] = { timer: d.interval * EVENT_PACE * (0.6 + 0.8 * hash(key)) });
    ev.timer -= dt;
    if (ev.timer > 0) continue;

    // Reschedule next occurrence; they grow a little more frequent over time, but
    // gently (higher floor, slower ramp) so the late game stays playable.
    const ramp = Math.max(0.72, 1 - elapsed / 12000);
    ev.timer = d.interval * EVENT_PACE * ramp * (0.7 + 0.6 * hash(key + elapsed));

    // A brokered truce holds predators (not natural disasters) at bay for a while.
    if (d.kind === 'predator' && (state.truceUntil || 0) > elapsed) continue;

    fireDisaster(state, key, d, elapsed);
  }
}

function fireDisaster(state, key, d, elapsed) {
  const grow = 1 + elapsed / 3000; // disasters get tougher over time
  // Biome + weather/night modifiers scale how severe each event is here.
  const biome = BIOMES[state.world?.biome];
  const biomeMul = (biome?.hazardMul?.[key]) ?? 1;
  const envMul = 1 + (state._envMods?.hazardMul?.[key] || 0);
  const breedDiff = BREEDS[state.founder?.breed]?.difficulty ?? 1; // founder breed sets the stakes
  const gameDiff = DIFFICULTIES[state.difficulty]?.disasterMul ?? 1; // chosen difficulty
  let severity = d.baseSeverity * grow * biomeMul * Math.max(0.2, envMul) * breedDiff * gameDiff;
  if (d.kind === 'predator') severity *= (1 - Math.min(0.2, Math.max(0, (state.compassion ?? 50) - 50) / 250)); // a gentle, kind colony unsettles predators less
  const offenseBonus = (d.kind === 'predator') ? totalOffense(state) : 0;
  let protect = protectionAgainst(state, key) + offenseBonus;
  // Firm, fair Order deters raiders; a raised predator cub guards against beasts.
  if (key === 'raid') protect += Math.max(0, (state.justice ?? 50) - 50) * JUSTICE.raidDeter + (state._doc?.raidDeter || 0);
  if (d.kind === 'predator') protect += (state.guardian || 0) * 2;
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
    case 'burn': {
      state._fireUntil = (state.env?.lived || 0) + 18; // crackling fire ambience for a while
      const gone = destroyRandomBuilding(state, Math.max(1, Math.round(sev / 14)));
      damageTunnels(state, sev);
      damageFort(state, sev, b => BUILDINGS[b.type]?.bridge, 'bridge', true); // wildfire burns wood
      damageFort(state, sev, b => BUILDINGS[b.type]?.wall, 'wall', true);
      // wildfire also scorches nearby forests/bushes
      let burned = 0;
      for (const n of state.world.nodes) {
        if ((n.kind === 'trees' || n.kind === 'bush') && n.amount > 0 && rand(state) < 0.4) { n.amount = Math.max(0, n.amount - sev * 4); burned++; }
      }
      hurtHealth(state, 8);
      logMsg(state, `${d.icon} ${d.name}! ${gone} structure(s) burned, ${burned} groves scorched. Walls & water help.`);
      break;
    }
    case 'blight': {
      lootResources(state, sev * 1.5); // spoils food/stores
      hurtHealth(state, 6);
      // sickens some rodents (wet tail) unless vets/hygiene resist
      const vets = state.buildings.reduce((s, b) => s + (BUILDINGS[b.type]?.vet || 0), 0);
      const n = Math.max(1, Math.round(sev / 12));
      let infected = 0;
      const healthy = state.units.filter(u => !u.sick);
      for (let i = 0; i < n && healthy.length; i++) {
        if (vets > 0 && rand(state) < 0.5) continue;
        const u = healthy[Math.floor(rand(state) * healthy.length)];
        if (!u.sick) { u.sick = true; u.sickT = 0; infected++; }
      }
      logMsg(state, `${d.icon} ${d.name}! Food spoiled${infected ? ` and ${infected} rodent(s) fell ill` : ''}. Build Vet Clinics, Sand Baths & drain the filth.`);
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
      st.raidTimer = (150 + 120 * hash(id + Math.floor(lived))) * EVENT_PACE;
      if (lived < GRACE_SECONDS || state.disasters === false) continue; // peaceful mode: no raids
      if ((state.truceUntil || 0) > lived) continue; // a brokered truce stays the raiders' paws
      const pressure = Math.max(0, -st.standing) + Math.min(45, hoard * 0.12);
      if (pressure > 14) fireFactionRaid(state, id, f, pressure);
    }
  }
}

function fireFactionRaid(state, id, f, pressure) {
  spawnCaravan(state, id, 'raid'); // a war party visibly marches from their camp
  const severity = pressure * (1 + (state.env?.lived || 0) / 4000);
  let protect = protectionAgainst(state, 'raid') + totalOffense(state);
  protect += Math.max(0, (state.justice ?? 50) - 50) * JUSTICE.raidDeter + (state._doc?.raidDeter || 0); // Order + Negotiation on the gates
  protect += (state.guardian || 0) * 2;
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
  damageFort(state, net, b => BUILDINGS[b.type]?.bridge, 'bridge'); // floods wash bridges
  damageFort(state, net, b => BUILDINGS[b.type]?.wall, 'wall');     // …and wooden walls
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
  for (let i = 0; i < n; i++) {
    // A rodent rolling in a hamster ball is SAFE — predators can't snatch it.
    const exposed = state.units.filter(u => !u.inBall);
    if (exposed.length <= 1) break; // keep at least one rodent; the rest are protected
    const victim = exposed[Math.floor(rand(state) * exposed.length)];
    const idx = state.units.indexOf(victim);
    if (idx >= 0) { state.units.splice(idx, 1); lost++; }
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
