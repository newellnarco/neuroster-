// economy.js — per-tick simulation: environment, production, per-creature needs,
// breeding, loyalty, exploration, and threats.
import { BUILDINGS, NEEDS, NODE_TYPES, SPECIES, BOND_DECAY, EDIBLES, RESOURCES, WASTE, WETTAIL, FERTILIZER_BOOST, FEEDER_SERVES, MINE_REPAIR, BURROW, BREEDING, GRID_W, GRID_H, RESCUE } from './config.js';
import { addRes, population, logMsg, wellbeingMul, evoBonus, addFx, canAfford, spend, killUnit, addCompassion, addJustice, traitMul } from './state.js';
import { stepDecrees } from './decrees.js';
import { doctrineBonuses } from './doctrines.js';
import { JUSTICE } from './config.js';
import { MORALE, TOWNHALL_TIERS, TUNNEL_TIERS, CONSTRUCTION, fortTiers } from './config.js';
import { makeRodent, stepRodent, breedChild, gainXp, randomGivenName, resetPathBudget, isMature } from './entities.js';
import { stepEvents, stepFactions, evoProtect } from './events.js';
import { checkMilestones } from './milestones.js';
import { stepEnvironment, envMods, seasonKey, currentSeason, dayFraction, currentWeather } from './environment.js';
import { SEASONS, POLLUTION, SQUIRREL, BEAVER, BALL, ARMOUR, DISEASE, DIFFICULTIES } from './config.js';
import { megaBonuses } from './megaprojects.js';
import { ensureCamps, stepCaravans, nodeContestFactor } from './factions.js';
import { reveal, isFertile, addWaste, wasteAt, riverNear } from './world.js';

// A dam on a REAL river tile (true flowing watercourse, not a still pond) taps
// the current and yields more water — and reads the flow geography to know it.
// Returns the dam's water-yield multiplier (1 off-river, >1 on a river).
export const RIVER_DAM_BONUS = 0.6; // +60% water yield when damming a real river
export function damRiverFactor(state, b) {
  return riverNear(state.world, b.x, b.y, BUILDINGS[b.type]?.radius || 2) ? 1 + RIVER_DAM_BONUS : 1;
}

// Difficulty doesn't only scale combat/events — it modulates the whole economy.
// yieldMul scales resource OUTPUT (production buildings, mines, belt hauling);
// breedMul scales BREEDING speed. Easier settings produce & breed faster, harder
// settings slower (see config.js DIFFICULTIES). Exported for the smoke test.
export function diffYieldMul(state) { return DIFFICULTIES[state?.difficulty]?.yieldMul ?? 1; }
export function diffBreedMul(state) { return DIFFICULTIES[state?.difficulty]?.breedMul ?? 1; }

// Run one simulation tick. dt is seconds per tick.
export function stepEconomy(state, dt) {
  // 0) Environment first; cache its modifiers for the rest of the tick.
  stepEnvironment(state, dt);
  const env = state._envMods = envMods(state);
  // Completed megaprojects grant permanent, colony-wide bonuses (cached per tick).
  const mega = state._mega = megaBonuses(state);
  const doc = state._doc = doctrineBonuses(state); // learned skill-tree perks
  if (mega.power) addRes(state, 'power', mega.power * dt);
  ensureCamps(state); // idempotent — also back-fills camps for pre-camp saves

  // 1) Rodent AI (gather/haul/sleep). Reset the per-tick A* recompute budget and
  // advance the pathing clock once before movers run, so path recomputes are
  // throttled colony-wide (see entities.js moveAlongPath).
  resetPathBudget(state);
  for (const u of state.units) {
    u.age = (u.age ?? BREEDING.maturityAge) + dt; // age advances with sim time (juveniles → adults)
    stepRodent(state, u, dt);
  }

  // 2) Construction labour (sets _laborFactor), burrow upkeep, derived stats.
  updateConstruction(state, dt);
  updateBurrows(state, dt); // before recompute so degraded burrows drop popCap now
  recomputeBuildings(state);
  updateLeadership(state, dt);

  // 3) Building production / refining.
  const wb = wellbeingMul(state);
  const powerMul = powerMultiplier(state);
  const diffY = diffYieldMul(state); // difficulty scales economic output (yields)
  // Dams hold back the river: each one cuts non-dam water sources' flow upstream.
  const dams = state.buildings.filter(b => BUILDINGS[b.type]?.upstreamPenalty).length;
  const upstreamMul = Math.max(0.3, 1 - 0.3 * dams);
  // Weather can rain extra water into stores; wooden Cisterns collect more of it.
  // Grumpy beavers (over-taxed wood store) slacken the dams — water flow suffers.
  const beaverFlow = 1 - (state._beaverSabotage || 0);
  if (env.waterGain) {
    const cisterns = state.buildings.filter(b => BUILDINGS[b.type]?.cistern && !b.underConstruction).length;
    addRes(state, 'water', env.waterGain * dt * Math.max(1, population(state) * 0.4) * (1 + cisterns * 0.5) * beaverFlow);
  }
  const sun = solarFactor(state); // 0..1 daylight×weather, for solar panels
  let pollSrc = 0;                 // pollution emitted by running industry this tick
  // Pollution above a threshold poisons farmland (cuts food yield).
  const poll = state.pollution || 0;
  const pollFarm = poll > POLLUTION.farmAt ? Math.min(POLLUTION.farmMax, (poll - POLLUTION.farmAt) / (100 - POLLUTION.farmAt) * POLLUTION.farmMax) : 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def || b.active === false || b.underConstruction) continue;
    if (def.mine) { runMine(state, b, def, dt, wb); continue; }
    if (def.belt) { continue; } // belts run as connected networks — see runBeltNetworks below

    let rate = dt * wb * powerMul * diffY * (1 + (state._leadership || 0) + (mega.leadership || 0)) * (state._laborFactor ?? 1) * (1 - (state._distract || 0)) * (state.quarantine ? (1 - DISEASE.quarantineOutput) : 1); // difficulty yield; leader inspires; builders divert labour; play distracts; a quarantine confines the colony
    if (def.category === 'Food') {
      // Fertile ground (this tile or recent-flood silt) + stored fertilizer boost crops.
      let bonus = state.mods.foodMul + env.foodMul + (mega.foodMul || 0) + (doc.foodMul || 0);
      if ((state.fertileUntil || 0) > (state.env.lived || 0)) bonus += 0.6;
      if (def.fertileBonus && isFertile(state.world, b.x, b.y)) bonus += 0.8;
      if ((state.res.fertilizer || 0) > 0) { bonus += FERTILIZER_BOOST; state.res.fertilizer = Math.max(0, state.res.fertilizer - 0.05 * dt); }
      bonus -= pollFarm; // smog poisons the crops
      rate *= Math.max(0.1, 1 + bonus);
    }
    if (def.category === 'Production') rate *= (1 + state.mods.prodMul + (mega.prodMul || 0) + (doc.prodMul || 0));
    if (def.solar) rate *= sun; // solar panels follow the sun (and clear skies)
    if (def.produces?.power) rate *= (1 + env.powerGain);
    if (def.produces?.research) rate *= (1 + (state.mods.researchMul || 0) + evoBonus(state, 'all', 'research'));

    if (def.consumes) {
      const ok = Object.entries(def.consumes).every(([k, v]) => (state.res[k] || 0) >= v * rate);
      if (!ok) continue;
      for (const [k, v] of Object.entries(def.consumes)) state.res[k] -= v * rate;
    }
    if (def.produces) for (const [k, v] of Object.entries(def.produces)) {
      let r = rate;
      if (k === 'water') {
        // Non-dam water sources lose flow when dams hold the river upstream.
        if (!def.upstreamPenalty) r *= upstreamMul * beaverFlow;
        // A dam (upstreamPenalty) built on a real river taps its current for more.
        else if (def.needsWater) r *= damRiverFactor(state, b);
      }
      addRes(state, k, v * r);
    }
    if (def.pollutes && rate > 0) pollSrc += def.pollutes; // running industry emits smog
  }
  state._pollSrc = pollSrc;
  // 3b) Conveyors haul as connected belt NETWORKS (multi-segment chaining).
  runBeltNetworks(state, dt, wb);
  // Remove any mines that collapsed this tick (deposit exhausted).
  if (state._collapse && state._collapse.length) {
    for (const b of state._collapse) { const i = state.buildings.indexOf(b); if (i >= 0) state.buildings.splice(i, 1); }
    state._collapse.length = 0;
  }

  // 4) Per-creature needs (food, water, energy, fun, health).
  updatePerUnitNeeds(state, dt, env);

  // 5) Exploration: rodents & buildings reveal nearby fog.
  updateExploration(state, env);

  // 5b) Sanitation: droppings, composting, fertilizer & wet-tail disease.
  updateWaste(state, dt);
  updateDisease(state, dt);
  updateOutbreak(state, dt);

  // 6) Morale (grief/ethics), Breeding, Loyalty, Disasters.
  updateMorale(state, dt);
  updateBreeding(state, dt);
  updateLoyalty(state, dt);
  stepEvents(state, dt);
  stepFactions(state, dt);
  updateSquirrels(state, dt); // oak → nut economy: squirrels trade or raid
  updateBeavers(state, dt);   // beaver wood store + take-too-much sabotage
  updateBalls(state, dt);     // hamster balls: joy → anxiety → pop out / heat death
  stepRescues(state, dt);
  stepDecrees(state, dt); // moral dilemmas: spend a virtue on purpose for the group
  // Seasons turn; each new season opens with a festival — a communal lift.
  {
    const sk = seasonKey(state);
    if (state._seasonKey && state._seasonKey !== sk) {
      const se = currentSeason(state);
      state.morale = Math.min(100, (state.morale ?? 100) + 8);
      addCompassion(state, 3);
      if (se.harvest) addRes(state, 'food', se.harvest);
      addFx(state, state.world.spawn.x, state.world.spawn.y, se.icon, 2.8);
      logMsg(state, `${se.icon} ${se.festival}! ${se.blurb} The colony gathers to celebrate — spirits lift.`);
    }
    state._seasonKey = sk;
  }
  // Compassion drifts gently toward 50; a Sanctuary's daily care keeps it high.
  { const c = state.compassion ?? 50; state.compassion = Math.max(0, Math.min(100, c + (50 - c) * 0.002 * dt + (state._sanctuary || 0) * 0.03 * dt)); }
  // Justice/Order drifts toward the middle; a Courthouse steadily upholds it.
  { const j = state.justice ?? 50; state.justice = Math.max(0, Math.min(100, j + (JUSTICE.driftTarget - j) * 0.002 * dt + (state._courts || 0) * JUSTICE.courtNudge * dt)); }
  // Almshouses share surplus Food → Compassion (generosity that buys goodwill).
  if ((state._alms || 0) > 0 && (state.res.food || 0) > 40) {
    const give = Math.min(state.res.food - 40, (state._alms) * 0.4 * dt);
    state.res.food -= give; addCompassion(state, give * 0.06);
  }
  // A Hall of Heroes lends steady morale recovery — the honoured dead inspire.
  if ((state._memorial || 0) > 0) state.morale = Math.min(100, (state.morale ?? 100) + (state._memorial) * 0.05 * dt);
  // Statues are a quiet, steady focus for the colony's spirit & better nature.
  if ((state._statues || 0) > 0) { state.morale = Math.min(100, (state.morale ?? 100) + state._statues * 0.04 * dt); addCompassion(state, state._statues * 0.012 * dt); }
  // Valor (martial pride) ebbs toward a low baseline; a proud, battle-hardened
  // colony (high Valor) takes a quiet, morally-neutral lift to spirits & spark.
  { const v = state.valor ?? 20; state.valor = Math.max(0, Math.min(100, v + (20 - v) * 0.0015 * dt)); }
  if ((state.valor ?? 20) > 65) {
    const pride = Math.min(0.18, ((state.valor - 65) / 35) * 0.18);
    state.morale = Math.min(100, (state.morale ?? 100) + pride * dt);
    for (const u of state.units) u.needs.fun = Math.min(100, u.needs.fun + pride * 0.5 * dt);
  }
  stepPollution(state, dt); // coal smog rises from industry, scrubbed by forests

  // 9) Milestones (throttled) — concrete goals + reward drip.
  state._mileT = (state._mileT || 0) + dt;
  if (state._mileT >= 2) {
    state._mileT = 0;
    for (const m of checkMilestones(state)) {
      if (m.reward) addRes(state, 'research', m.reward);
      addFx(state, state.world.spawn.x, state.world.spawn.y, '🏆', 2.4);
      logMsg(state, `🏆 Milestone: ${m.name} — ${m.desc}${m.reward ? ` (+${m.reward} research)` : ''}`);
    }
  }

  // 10) Age out floating reward feedback & finished caravans.
  if (state.fx && state.fx.length) {
    const t = state.env.lived;
    state.fx = state.fx.filter(f => t - f.born < f.life);
  }
  stepCaravans(state);
}

// Rodents build placed structures & upgrades over time. More awake builders =
// faster; builders tied up on jobs mean fewer hands gathering (other work slows).
function updateConstruction(state, dt) {
  const C = CONSTRUCTION;
  const jobs = [];
  for (const b of state.buildings) {
    if (b.underConstruction) jobs.push(b);
    else if (b.upgrading) jobs.push(b);
  }
  if (!jobs.length) { state._laborFactor = 1; state._jobs = 0; return; }
  // workforce: awake rodents weighted by build skill (beavers/gophers excel)
  let W = 0;
  for (const u of state.units) {
    if (u.phase === 'sleep') continue;
    const sp = SPECIES[u.species];
    W += (sp.build || 1) * (1 + evoBonus(state, u.species, 'build')) * (1 + (u.traits?.strength || 0) * 0.15);
  }
  W = Math.max(0.4, W);
  const perJob = Math.min(C.maxWorkersPerJob, W / jobs.length);
  // Helpful squirrels (a kind colony with oaks/nuts drawing them) lend paws on
  // TIMBER builds — wood structures rise ~35% faster while squirrels are friendly.
  const squirrelHelp = ((state.squirrelPressure || 0) > 0 && (state.compassion ?? 50) >= SQUIRREL.kindAt) ? 0.35 : 0;
  for (const b of jobs) {
    const woodBuild = (BUILDINGS[b.type]?.cost?.wood || 0) > 0;
    const inc = perJob * C.buildRate * dt * (1 + (woodBuild ? squirrelHelp : 0));
    if (b.underConstruction) {
      b.progress = (b.progress || 0) + inc;
      if (b.progress >= b.buildTime) {
        b.underConstruction = false; b.progress = b.buildTime;
        addFx(state, b.x, b.y, '✅', 1.8);
        logMsg(state, `${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name} construction complete!`);
      }
    } else if (b.upgrading) {
      b.upgrading.progress += inc;
      if (b.upgrading.progress >= b.upgrading.time) {
        b.tier = b.upgrading.toTier;
        const ft = fortTiers(b.type); if (ft) b.hp = ft[b.tier].hp;
        delete b.upgrading;
        addFx(state, b.x, b.y, '⬆️', 1.8);
        logMsg(state, `⬆️ ${BUILDINGS[b.type].name} upgrade complete!`);
      }
    }
  }
  // labour diverted from gathering/production
  const laborUsed = Math.min(W, jobs.length * C.idealWorkers);
  state._laborFactor = Math.max(C.minGatherFactor, (W - laborUsed) / W);
  state._jobs = jobs.length;
}

function recomputeBuildings(state) {
  let popCap = 0, storage = 700, defense = 0, /* base cap matches STARTING.storageCap */ fun = 0, health = 0, feeders = 0, waterers = 0, feederN = 0, watererN = 0, caretakers = 0, vets = 0, hygiene = 0, distract = 0, defendTowers = 0, watchTowers = 0, sanctuaries = 0, courts = 0, alms = 0, memorials = 0, statues = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def || b.underConstruction) continue;
    popCap += (b.degraded ? 0 : def.popCap || 0); // degraded burrows house no one
    hygiene += def.hygiene || 0;
    storage += def.storage || 0;
    // Towers: WATCH stance is gentler (×0.6 defense, wide vision); DEFEND is full + offense.
    if (def.tower) { const defend = b.mode === 'defend'; defense += Math.round((def.defense || 0) * (defend ? 1 : 0.6)); if (defend) defendTowers++; else watchTowers++; }
    else if (fortTiers(b.type)) { // tiered forts (walls/bridges): defense from tier, scaled by HP
      const tier = fortTiers(b.type)[b.tier || 0];
      defense += Math.round((tier.defense || 0) * Math.max(0, (b.hp ?? tier.hp) / tier.hp));
    }
    else defense += def.defense || 0;
    fun += def.curiosity || 0;
    distract += def.distract || 0;
    health += def.health || 0;
    feeders += def.feeder || 0;
    if (def.feeder) feederN++;   // count stations (for crowding throughput)
    waterers += def.waterer || 0;
    if (def.waterer) watererN++;
    caretakers += def.caretaker || 0;
    vets += def.vet || 0;
    if (def.sanctuary) sanctuaries++;
    if (def.court) courts++;
    if (def.almshouse) alms++;
    if (def.memorial) memorials++;
    if (def.statue) statues++;
  }
  state._sanctuary = sanctuaries;
  state._courts = courts;
  state._alms = alms;
  state._memorial = memorials;
  state._statues = statues;
  state._vets = vets;
  // Caretaker huts auto-tend energy, fun & health — easing larger settlements.
  fun += caretakers * 4; health += caretakers * 4;
  defense = Math.round(defense * (1 + evoBonus(state, 'all', 'defense'))) + (state._mega?.defense || 0) + (state._doc?.defense || 0);
  // Forged Armour in store hardens the colony's defense (capped — a steady edge).
  defense += Math.round(Math.min(ARMOUR.defCap, (state.res?.armour || 0) * ARMOUR.defPerSet));
  storage += state._mega?.storage || 0; // Great Granary expands the vaults
  state.popCap = popCap; state.storageCap = storage; state.defense = defense;
  state._funBld = fun; state._healthBld = health; state._feeders = feeders;
  state._waterers = waterers; state._feederN = feederN; state._watererN = watererN;
  state._caretakers = caretakers; state._hygiene = hygiene;
  state._distract = Math.min(0.2, distract); // enrichment-for-fun trades a little output (capped)
  state._defendTowers = defendTowers; state._watchTowers = watchTowers;
}

// A Mine attaches to one underground deposit, extracts it, and collapses when spent.
function runMine(state, b, def, dt, wb) {
  // Flooded mines are idle until repaired (materials paid + repair time elapses).
  if (b.flooded) {
    const lived = state.env.lived || 0;
    if (b.repairUntil != null && lived >= b.repairUntil) {
      b.flooded = false; b.repairUntil = null;
      addFx(state, b.x, b.y, '🔧', 1.6);
      logMsg(state, '🔧 A flooded mine was repaired and is working again.');
    } else if (b.repairUntil == null) {
      // Gophers tunnel in and auto-repair flooded mines (fast), if materials allow.
      const gophers = state.units.filter(u => u.species === 'gopher').length;
      if (gophers > 0 && canAfford(state, MINE_REPAIR.cost)) {
        spend(state, MINE_REPAIR.cost);
        b.repairUntil = lived + Math.round(MINE_REPAIR.seconds / (1 + 0.5 * gophers));
        addFx(state, b.x, b.y, '🦡', 1.6);
        logMsg(state, '🦡 Gophers tunnelled in to auto-repair a flooded mine.');
      }
    }
    return;
  }
  if (b.nodeId == null) {
    // claim the nearest unclaimed underground deposit in range
    const r = def.radius || 1;
    let pick = null, bd = Infinity;
    for (const n of state.world.nodes) {
      if (n.amount <= 0 || n.claimedBy || NODE_TYPES[n.kind].surface !== false) continue;
      const d = Math.abs(n.x - b.x) + Math.abs(n.y - b.y);
      if (d <= r && d < bd) { bd = d; pick = n; }
    }
    if (!pick) return;
    pick.claimedBy = b.id; b.nodeId = pick.id; b.resKind = pick.kind;
  }
  const n = state.world.nodes.find(o => o.id === b.nodeId);
  if (!n || n.amount <= 0) { collapseMine(state, b, n); return; }
  const got = Math.min(n.amount, (def.rate || 1.2) * dt * wb * diffYieldMul(state) * (1 + state.mods.mineMul + (state._mega?.mineMul || 0)));
  n.amount -= got;
  b._remaining = Math.ceil(n.amount);
  addRes(state, NODE_TYPES[n.kind].resource, got);
  if (n.amount <= 0) collapseMine(state, b, n);
}
function collapseMine(state, b, n) {
  (state._collapse || (state._collapse = [])).push(b);
  if (n) n.claimedBy = null;
  addFx(state, b.x, b.y, '💥', 1.8);
  logMsg(state, `⛏️ A mine collapsed — its ${n ? NODE_TYPES[n.kind].resource : 'ore'} seam ran out.`);
}

// Belts that sit within BELT_LINK tiles of each other form a single conveyor
// NETWORK. A network reaches every surface node in range of ANY of its belts and
// hauls at the SUM of its belts' rates — so a relay belt placed away from nodes
// still extends reach and adds throughput. Build long chains to drain far seams.
export const BELT_LINK = 2;
function runBeltNetworks(state, dt, wb) {
  const belts = state.buildings.filter(b => {
    const def = BUILDINGS[b.type];
    return def?.belt && b.active !== false && !b.underConstruction;
  });
  if (!belts.length) return;

  // Union-find over belts linked within BELT_LINK (Manhattan) of one another.
  const parent = belts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < belts.length; i++) for (let j = i + 1; j < belts.length; j++) {
    if (Math.abs(belts[i].x - belts[j].x) + Math.abs(belts[i].y - belts[j].y) <= BELT_LINK)
      parent[find(i)] = find(j);
  }
  const nets = new Map();
  belts.forEach((b, i) => { const root = find(i); (nets.get(root) || nets.set(root, []).get(root)).push(b); });

  for (const net of nets.values()) {
    // Total haul this tick = sum of each belt's rate (higher tiers move more).
    let cap = 0;
    for (const b of net) { cap += BUILDINGS[b.type].belt.rate; b._flow = 0; }
    cap *= dt * wb * diffYieldMul(state); // difficulty scales haul yield
    // Every surface node within a belt's own radius of any belt in the network.
    const reach = state.world.nodes.filter(n => {
      if (n.amount <= 0 || NODE_TYPES[n.kind].surface === false) return false;
      return net.some(b => Math.abs(n.x - b.x) + Math.abs(n.y - b.y) <= (BUILDINGS[b.type].radius || 2));
    }).sort((a, b) => b.amount - a.amount); // drain the richest seams first
    if (!reach.length) continue;
    let hauled = 0;
    for (const n of reach) {
      if (cap <= 0) break;
      // A contested seam yields less to your belts while a neighbour works it too.
      const got = Math.min(n.amount, cap) * nodeContestFactor(state, n);
      n.amount -= got; cap -= got; hauled += got;
      addRes(state, NODE_TYPES[n.kind].resource, got);
    }
    if (hauled > 0) for (const b of net) b._flow = 1; // animate the whole live network
  }
}

function powerMultiplier(state) {
  const p = state.res.power || 0;
  const boost = Math.min(1.0, p / 100);
  if (p > 0) state.res.power = Math.max(0, p - 0.2);
  return 1 + boost;
}

// Each rodent eats, drinks, gets bored, and ages its health independently.
function updatePerUnitNeeds(state, dt, env) {
  // Feeder/waterer THROUGHPUT scales with crowding: each station serves a limited
  // number of rodents well, and its per-station effectiveness degrades as the
  // population it must feed/water rises (queueing). Like burrow filth, this means
  // you must build MORE feeders/waterers as the colony grows — one feeder can't
  // satisfy an ever-larger warren. crowdEff(stations) → 1 (well-served) … →0.3
  // (overwhelmed): each station's 15% drain-cut is scaled by how crowded it is.
  const pop = population(state);
  // crowdEff(stationCount): 1 (well-served) … 0.3 (overwhelmed) — full strength up
  // to FEEDER_SERVES rodents per station, then it falls off with the queue.
  const crowdEff = (stations) => {
    if (stations <= 0) return 0;
    const perStation = pop / stations; // rodents each station must serve
    return Math.max(0.3, Math.min(1, FEEDER_SERVES / Math.max(1, perStation)));
  };
  // Feeders/waterers cut need drain (the summed `feeder`/`waterer` value), but the
  // cut is SCALED by how crowded the stations are: a single feeder for a swollen
  // colony helps far less than one per handful of rodents — build more as you grow.
  const feederEff = state._feederEff = crowdEff(state._feederN || 0);
  const watererEff = state._watererEff = crowdEff(state._watererN || 0);
  const feederFactor = Math.max(0.4, 1 - (state._feeders || 0) * 0.15 * feederEff);
  const watererFactor = Math.max(0.4, 1 - (state._waterers || 0) * 0.15 * watererEff);
  const funRecover = (state._funBld || 0) * 0.05 * dt;     // Playgrounds + caretakers
  const healthRecover = (state._healthBld || 0) * 0.04 * dt; // Infirmaries + caretakers
  const energyRecover = (state._caretakers || 0) * 0.6 * dt; // caretakers ease rest needs
  const envDrain = 1 + (env.needDrain || 0);

  for (const u of state.units) {
    const n = u.needs;
    // Per-unit Vigor (a 🔋 stamina trait) makes a rodent's food/water/energy
    // drain slower — so investing skill points in Vigor visibly matters, not
    // just the species-wide evolution bonus.
    const retain = Math.max(0.4, 1 - evoBonus(state, u.species, 'needRetain')) / traitMul(u, 'stamina');
    u.bond = Math.max(0, (u.bond ?? 45) - BOND_DECAY * dt); // affection gently fades

    // Water: drain, then drink from stores if low.
    {
      const def = NEEDS.water;
      n.water = Math.max(0, n.water - def.drain * dt * envDrain * retain * watererFactor);
      if (n.water < def.eatAt) { const used = Math.min(state.res.water || 0, dt * 0.9); state.res.water -= used; n.water = Math.min(100, n.water + used * 7); }
    }
    // Food: drain, then eat the best available edible (pellets > grain > food).
    {
      const def = NEEDS.food;
      n.food = Math.max(0, n.food - def.drain * dt * envDrain * retain * feederFactor);
      if (n.food < def.eatAt) {
        let want = dt * 0.9;
        for (const ed of EDIBLES) {
          if (want <= 0) break;
          const used = Math.min(state.res[ed] || 0, want);
          if (used <= 0) continue;
          state.res[ed] -= used; want -= used;
          n.food = Math.min(100, n.food + used * 7 * (RESOURCES[ed].nourish || 1));
        }
      }
    }
    // Energy: gentle base drain while awake (work/sleep handled in entities);
    // caretakers passively top it up so big colonies need less hand-holding.
    if (u.phase !== 'sleep') n.energy = Math.max(0, Math.min(100, n.energy - NEEDS.energy.drain * dt * retain + energyRecover));
    // Fun: boredom rises over time; Playgrounds & variety (entities) relieve it.
    n.fun = Math.max(0, Math.min(100, n.fun - NEEDS.fun.drain * dt + funRecover));
    // Health: drifts toward the average of the other needs; buildings heal;
    // humid weather hurts; starvation bottoms it out fast.
    const others = (n.food + n.water + n.energy + n.fun) / 4;
    n.health += (others - n.health) * 0.03 * dt;
    n.health += healthRecover - (env.healthDrain || 0) * dt;
    if (n.food <= 0 || n.water <= 0) n.health -= 1.5 * dt;
    n.health = Math.max(0, Math.min(100, n.health));
  }
}

function updateExploration(state, env) {
  const radius = Math.max(2, Math.round(3 * (1 + (env.revealMul || 0) + (state.mods.revealBonus || 0))));
  for (const u of state.units) reveal(state.world, Math.round(u.x), Math.round(u.y), radius);
  // Watch-stance towers see far (early warning); other structures reveal a little.
  for (const b of state.buildings) reveal(state.world, b.x, b.y, (BUILDINGS[b.type]?.tower && b.mode !== 'defend' && !b.underConstruction) ? 7 : 3);
}

// Oak → squirrel / nut economy. Oaks grow Nuts (handled by the production loop);
// oaks + a nut hoard build "squirrel pressure" (state.squirrelPressure, 0..100).
// When it peaks a band of squirrels arrives — a KIND colony (or a small hoard)
// gets friendly foraging/barter (nuts ⇄ seeds + forest lore + goodwill); a big
// hoard behind weak defenses gets RAIDED for nuts (respects peaceful mode). So
// the nut balance tips the colony toward trade / cooperation / raids.
function updateSquirrels(state, dt) {
  const oaks = state.buildings.filter(b => BUILDINGS[b.type]?.produces?.nuts && !b.underConstruction).length;
  const nuts = state.res.nuts || 0;
  const pressure = Math.min(100, oaks * SQUIRREL.attractPerOak + nuts * SQUIRREL.attractPerNut);
  state.squirrelPressure = pressure;
  if (pressure <= 0) { state._squirrelT = 0; return; }
  // Higher pressure → squirrels come sooner.
  state._squirrelT = (state._squirrelT || 0) + dt * (pressure / 100);
  if (state._squirrelT < SQUIRREL.interval) return;
  state._squirrelT = 0;
  const sp = state.world.spawn;
  const friendly = (state.compassion ?? 50) >= SQUIRREL.kindAt || nuts < SQUIRREL.hoardAt;
  if (friendly) {
    // Cooperation: squirrels forage peacefully and barter nuts for seeds & lore.
    addCompassion(state, 2);
    if (nuts >= 10 && Math.random() < 0.5) {
      const take = Math.min(nuts, 8);
      state.res.nuts = nuts - take;
      addRes(state, 'seeds', take * 1.5);
      addRes(state, 'research', 4);
      logMsg(state, `🐿️ Squirrels bartered ${take} nuts for seeds & forest lore (+4 research). Goodwill grows.`);
    } else {
      addRes(state, 'food', 6);
      logMsg(state, '🐿️ Friendly squirrels foraged your oaks and shared a little food.');
    }
    addFx(state, sp.x, sp.y, '🐿️', 2.2);
  } else if (state.disasters !== false) {
    // Raid: a hoard behind weak defenses gets robbed. Defense & Justice blunt it.
    const guard = Math.max(0.15, 1 - (state.defense || 0) * 0.03 - Math.max(0, (state.justice ?? 50) - 50) * 0.004);
    const steal = Math.min(nuts, Math.round(nuts * 0.4 * guard) + 3);
    state.res.nuts = Math.max(0, nuts - steal);
    state.res.food = Math.max(0, (state.res.food || 0) - Math.round(steal * 0.5));
    state.morale = Math.max(0, (state.morale ?? 100) - 4);
    addFx(state, sp.x, sp.y, '🐿️💢', 2.2);
    logMsg(state, `🐿️ Squirrels raided your nut hoard and stole ${steal} nuts! Guard it (defense) or share it (Compassion) to keep the peace.`);
  }
}

// Beavers harvest wood for the colony's water works and keep their own wood
// store (state.beaverWood). Hamsters tap it when colony wood runs low — but
// over-take it and the beavers sour (state.beaverMood falls): a grumpy lodge
// slackens the dams (state._beaverSabotage cuts water flow) and spills wood in
// protest. Share fairly and their mood recovers. Self-contained social system.
function updateBeavers(state, dt) {
  const beavers = state.units.filter(u => u.species === 'beaver').length;
  if (beavers === 0) { state.beaverWood = 0; state._beaverSabotage = 0; return; }
  const cap = BEAVER.storeCap * beavers;
  // Beavers are tireless wood-cutters — they top up their own cache.
  state.beaverWood = Math.min(cap, (state.beaverWood || 0) + beavers * BEAVER.harvest * dt);
  // Hamsters draw from the beaver store when the colony's own wood is low.
  let took = 0;
  if ((state.res.wood || 0) < BEAVER.shareWhenBelow && (state.beaverWood || 0) > 0) {
    took = Math.min(state.beaverWood, beavers * BEAVER.giveRate * dt);
    state.beaverWood -= took;
    addRes(state, 'wood', took);
  }
  // Any sustained tapping wears on them; left alone (colony wood stocked, so the
  // store rebuilds) their mood recovers. Chronically leaning on them sours them.
  const wasGrumpy = (state.beaverMood ?? 70) < BEAVER.grumpyAt; // state BEFORE this tick
  let mood = state.beaverMood ?? 70;
  if (took > 0) mood -= took * BEAVER.upsetPerTake;
  else mood += BEAVER.calm * dt;
  state.beaverMood = Math.max(0, Math.min(100, mood));
  // Grumpy lodge → sabotage the water works, and occasionally spill wood.
  if (state.beaverMood < BEAVER.grumpyAt) {
    state._beaverSabotage = BEAVER.sabotageWater;
    if (!wasGrumpy) logMsg(state, '🦫 The beavers are unhappy — you\'ve been raiding their wood store. They\'re slackening the dams; water flow will suffer until they calm down.');
    if (Math.random() < BEAVER.spillChance * dt && (state.beaverWood || 0) > 0) {
      state.beaverWood = Math.max(0, state.beaverWood - 5);
    }
  } else {
    if ((state._beaverSabotage || 0) > 0) logMsg(state, '🦫 The beavers have settled down — the dams are holding and water flows freely again.');
    state._beaverSabotage = 0;
  }
}

// ---- Hamster balls --------------------------------------------------------
// A rodent in a ball rolls the world SAFE from predators (see events.js), gains
// fun & curiosity early, but anxiety climbs until it pops out — and on a hot day
// the ball overheats and can kill it. Made from plastic by a Ball Workshop.
export function hasBallWorkshop(state) {
  return state.buildings.some(b => b.type === 'ballworkshop' && !b.underConstruction);
}
export function enterBall(state, u) {
  if (u.inBall) return { ok: true };
  if (state.ballFear) return { ok: false, reason: 'The colony is too shaken — bury the lost hamster and destroy the broken ball first.' };
  if (!hasBallWorkshop(state)) return { ok: false, reason: 'Build a Ball Workshop first' };
  if (state.units.some(x => x.inBall)) return { ok: false, reason: 'Only one hamster can be in a ball at a time.' };
  if ((state.res.balls || 0) < 1) return { ok: false, reason: 'No hamster balls in stock yet (make Plastic → Ball Workshop)' };
  // Balls are for travel & fun, not hauling — drop whatever it's carrying first.
  if (u.carrying) { addRes(state, u.carrying.res, u.carrying.amount); u.carrying = null; }
  state.res.balls -= 1;           // check a ball out of the rack
  u.inBall = true; u.anxiety = 0; u.targetNode = null; u.phase = 'idle';
  return { ok: true };
}
export function exitBall(state, u) {
  if (!u.inBall) return;
  u.inBall = false; u.anxiety = 0;
  state.res.balls = (state.res.balls || 0) + 1; // ball returned to the rack
}
function isHotDay(state) {
  const w = currentWeather(state);
  return seasonKey(state) === 'summer' || w === 'drought' || w === 'humid';
}
function updateBalls(state, dt) {
  // The colony makes peace — and uses the balls again — once the lost hamster is
  // BURIED and the broken ball is DESTROYED (demolished). Checked every tick (a
  // death leaves nobody rolling, so this must run before the early-return below).
  if (state.ballFear) {
    const tainted = state.buildings.some(b => b.type === 'taintedball');
    const unburied = (state.bodies || []).some(b => b.ballDeath);
    if (!tainted && !unburied) {
      state.ballFear = false;
      logMsg(state, '🫧 The colony laid the lost one to rest and cleared away the broken ball — the hamster balls are in use again.');
    }
  }
  const anyInBall = state.units.some(u => u.inBall);
  if (!anyInBall) { state._ballHot = false; return; }
  const hot = state._ballHot = isHotDay(state);
  for (const u of state.units.slice()) { // slice: heat death may splice units
    if (!u.inBall) continue;
    u.anxiety = (u.anxiety || 0) + BALL.anxietyRise * dt;
    // Early joy: happiness & curiosity (fun) rise while anxiety is still low.
    if (u.anxiety < BALL.joyUntil) u.needs.fun = Math.min(100, u.needs.fun + BALL.funGain * dt);
    // A hot day cooks the ball — health drains; freed in time they're fine.
    if (hot) u.needs.health = Math.max(0, u.needs.health - BALL.heatDrain * dt);
    if (u.needs.health <= 0 && state.units.length > 1) {
      // Died inside: the ball is NOT returned — it becomes a broken/haunted ball
      // on the map that must be destroyed, and the colony is too shaken to roll
      // again until that ball is destroyed AND the hamster is buried.
      u.inBall = false;
      const bx = Math.round(u.x), by = Math.round(u.y);
      killUnit(state, u);
      const body = state.bodies[state.bodies.length - 1]; if (body) body.ballDeath = true;
      state.buildings.push({ id: state.nextId++, type: 'taintedball', x: bx, y: by, active: true });
      state.ballFear = true;
      logMsg(state, `🫧💀 ${u.name} overheated and died inside its ball! The colony is shaken — they won't touch the balls until ${u.name} is buried and the broken ball is destroyed.`);
      continue;
    }
    if (u.anxiety >= BALL.wantOut) { // too anxious — pops out for a break
      exitBall(state, u);
      addFx(state, u.x, u.y, '😵‍💫', 1.6);
      logMsg(state, `🫧 ${u.name} got out of its ball — too much rolling makes a rodent anxious.`);
    }
  }
}

// Burrows accumulate filth; caretakers clean them; neglected ones degrade and
// stop housing/breeding until cleaned (click a burrow to clean it).
function updateBurrows(state, dt) {
  const caretakers = state._caretakers || 0;
  // Filth scales with how CROWDED each burrow is: spread the colony across its
  // breeding burrows and compare to each burrow's capacity. An empty burrow
  // barely needs cleaning; a packed/over-capacity one gets filthy fast.
  const breedBurrows = state.buildings.filter(b => BUILDINGS[b.type]?.breed && !b.underConstruction);
  const perBurrow = population(state) / (breedBurrows.length || 1);
  for (const b of state.buildings) {
    if (!BUILDINGS[b.type]?.breed || b.underConstruction) continue;
    const cap = BUILDINGS[b.type].popCap || 3;
    const fullness = Math.min(2.2, perBurrow / cap); // 0 (empty) … 1 (full) … 2.2 (jammed)
    b.dirt = (b.dirt || 0) + BURROW.dirtRate * dt * (0.35 + fullness);
    if (caretakers > 0) b.dirt = Math.max(0, b.dirt - caretakers * BURROW.cleanRate * dt);
    if (b.dirt > BURROW.filthAt) addWaste(state.world, b.x, b.y, BURROW.dirtRate * dt * 0.6);
    const wasDeg = b.degraded;
    b.degraded = b.dirt >= BURROW.degradeAt;
    if (b.degraded && !wasDeg) logMsg(state, '🪰 A burrow degraded from filth — clean it (click) or it won\'t house or breed!');
  }
}

// Healthy rodents poop; droppings decay slowly; composters turn them to fertilizer.
function updateWaste(state, dt) {
  const world = state.world;
  // rodents leave droppings on a timer (only when reasonably healthy)
  for (const u of state.units) {
    u.pooT -= dt;
    if (u.pooT <= 0) {
      u.pooT = WASTE.interval * (0.7 + Math.random() * 0.6);
      if (u.needs.health > 35 && u.phase !== 'sleep') addWaste(world, Math.round(u.x), Math.round(u.y), 1);
    }
  }
  // Composters gather nearby droppings into stored MANURE (poop storage). A
  // powered Fertilizer Mill later turns manure → fertilizer (which boosts farms).
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def?.composter || b.underConstruction) continue;
    const r = def.radius || 5;
    let want = WASTE.composterRate * dt;
    for (let dy = -r; dy <= r && want > 0; dy++) for (let dx = -r; dx <= r && want > 0; dx++) {
      const wx = b.x + dx, wy = b.y + dy, have = wasteAt(world, wx, wy);
      if (have <= 0) continue;
      const take = Math.min(have, want);
      addWaste(world, wx, wy, -take); want -= take;
      addRes(state, 'manure', take * 1.5);
    }
  }
  // natural decay (sparse scan for performance)
  if (world.waste) {
    const dec = WASTE.decay * dt;
    const off = (state._wscan = ((state._wscan || 0) + 1) % 4);
    for (let i = off; i < world.waste.length; i += 4)
      if (world.waste[i] > 0) world.waste[i] = Math.max(0, world.waste[i] - dec);
  }
}

// Wet tail: filth near burrows/food infects rodents; vets cure & prevent death.
function updateDisease(state, dt) {
  const world = state.world;
  // total filth adjacent to burrows & food buildings
  let filth = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def?.breed && def?.category !== 'Food') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) filth += wasteAt(world, b.x + dx, b.y + dy);
  }
  const vets = state._vets || 0;
  // infection chance scales with filth; vets and sand-bath hygiene suppress it
  const hygieneMul = 1 / (1 + (state._hygiene || 0) * 0.5);
  const healthy = state.units.filter(u => !u.sick);
  if (healthy.length && filth > 1) {
    const risk = WETTAIL.riskPerFilth * filth * dt * (vets ? 0.4 : 1) * hygieneMul;
    if (Math.random() < risk) {
      const u = healthy[Math.floor(Math.random() * healthy.length)];
      u.sick = true; u.sickT = 0;
      addFx(state, u.x, u.y, '🤢', 2);
      logMsg(state, `🤢 A rodent caught wet tail from filth! ${vets ? 'The vet is treating it.' : 'Build a Vet Clinic & a Composter!'}`);
    }
  }
  // progress illnesses: vets heal; without care it worsens and can be fatal
  for (let i = state.units.length - 1; i >= 0; i--) {
    const u = state.units[i];
    if (!u.sick) continue;
    u.needs.health = Math.max(0, u.needs.health - WETTAIL.healthDrain * dt);
    if (vets > 0) {
      u.sickT -= WETTAIL.vetCureRate * vets * dt;
      if (u.sickT <= 0) { u.sick = false; u.sickT = 0; u.needs.health = Math.max(u.needs.health, 40); addFx(state, u.x, u.y, '❤️', 1.6); logMsg(state, '💉 The vet cured a rodent of wet tail.'); }
    } else {
      u.sickT += dt;
      if (u.sickT > WETTAIL.dieAfter && state.units.length > 1) {
        killUnit(state, u);
        logMsg(state, '💀 A rodent died of untreated wet tail. Bury it (Graveyard) & build a Vet Clinic!');
      }
    }
  }
}

// ---- Disease outbreaks -----------------------------------------------------
// A contagious outbreak (fired as an event) spreads rodent-to-rodent, worse the
// more CROWDED the warren is. The sick lose health; Infirmaries heal them and
// (as clinics) slow contagion; a QUARANTINE toggle clamps spread hard at the
// cost of colony output. Distinct from filth-driven wet-tail in updateDisease.
function updateOutbreak(state, dt) {
  const D = DISEASE;
  const lived = state.env?.lived || 0;
  const ob = state.outbreak;
  // Quarantine output penalty applies whenever the player has it on (it's a
  // standing public-health measure — useful to keep on through an outbreak).
  state._quarantineMul = state.quarantine ? (1 - D.quarantineOutput) : 1;

  const infirmaries = state.buildings.reduce((s, b) => s + (BUILDINGS[b.type]?.infirmary || 0), 0);

  // Treat the ill regardless of outbreak status: infirmaries clear illness and
  // restore health; the sick slowly self-recover without care.
  for (const u of state.units) {
    if (!u.sick) continue;
    if (infirmaries > 0) {
      u.sickT = (u.sickT || 0) - D.cureRate * infirmaries * dt;
      u.needs.health = Math.min(100, u.needs.health + D.recover * 0.4 * infirmaries * dt);
      if (u.sickT <= 0 && u.outbreak) { u.sick = false; u.outbreak = false; u.sickT = 0; addFx(state, u.x, u.y, '❤️', 1.4); }
    } else if (u.outbreak) {
      u.sickT = (u.sickT || 0) - D.selfCure * dt;
      if (u.sickT <= -8) { u.sick = false; u.outbreak = false; u.sickT = 0; }
    }
  }

  if (!ob) return;
  // Active outbreak: the sick lose health and infect the healthy.
  const sick = state.units.filter(u => u.sick);
  for (const u of sick) u.needs.health = Math.max(0, u.needs.health - D.healthDrain * dt);

  // Crowding amplifies spread (population over housing capacity).
  const crowd = Math.min(2, (population(state) / Math.max(1, state.popCap || 1)) / D.crowdRef);
  // Containment: infirmaries (clinics) and quarantine cut the spread rate.
  let spreadMul = Math.pow(D.infirmarySpreadCut, infirmaries);
  if (state.quarantine) spreadMul *= D.quarantineSpreadCut;
  const pressure = sick.length * D.spreadPerSick * crowd * spreadMul * dt;
  const healthy = state.units.filter(u => !u.sick);
  if (healthy.length && pressure > 0) {
    let chance = pressure;
    while (chance > 0 && healthy.length) {
      if (Math.random() < Math.min(1, chance)) {
        const idx = Math.floor(Math.random() * healthy.length);
        const u = healthy.splice(idx, 1)[0];
        u.sick = true; u.sickT = 0; u.outbreak = true;
        addFx(state, u.x, u.y, '🦠', 1.6);
      }
      chance -= 1;
    }
  }

  // The outbreak ends once its window passes AND nobody is still ill from it.
  if (lived >= ob.until && !state.units.some(u => u.outbreak)) {
    state.outbreak = null;
    logMsg(state, '🦠 The outbreak has run its course — the colony recovers.');
  }
}

// Morale: the colony's conscience. Unburied dead & untreated injuries erode it;
// graveyards bury the fallen to heal grief. Low morale saps fun & breeds deserters.
// The leader rules by example: teaching (XP), helping & raising hamsters (a
// colony-wide boost) — but a hall more lavish than everyone's comforts breeds
// resentment that erodes morale, fun and the very boost it was meant to give.
function updateLeadership(state, dt) {
  let tier = -1;
  for (const b of state.buildings) if (BUILDINGS[b.type]?.townhall && !b.underConstruction) tier = Math.max(tier, b.tier || 0);
  if (tier < 0) { state._leadership = 0; state._leadBreed = 0; state._resent = 0; return; }
  const T = TOWNHALL_TIERS[tier];
  // amenities for everyone else = housing (burrows) + wellbeing buildings
  const amenities = state.buildings.filter(b => { const d = BUILDINGS[b.type]; return (d?.breed) || d?.category === 'Wellbeing'; }).length;
  const resent = Math.max(0, T.luxury - amenities);
  const fairMul = Math.max(0.2, 1 - resent * 0.18);
  state._resent = resent;
  state._leadership = T.leadership * fairMul;
  state._leadBreed = T.breed * fairMul;
  // teaching: a trickle of XP to every rodent
  for (const u of state.units) gainXp(state, u, state._leadership * 0.4 * dt);
  // resentment bites
  if (resent > 0) {
    state.morale = Math.max(0, (state.morale ?? 100) - resent * 0.05 * dt);
    for (const u of state.units) u.needs.fun = Math.max(0, u.needs.fun - resent * 0.025 * dt);
    if (!state._resentLog || (state.env.lived - state._resentLog) > 35) {
      state._resentLog = state.env.lived;
      logMsg(state, `😤 Rodents resent the lavish ${T.name} while their own burrows & comforts lag — build more Housing & Wellbeing!`);
    }
  }
}

function updateMorale(state, dt) {
  if (state.morale == null) state.morale = 100;
  const bodies = state.bodies || (state.bodies = []);
  // The grandest resting place sets how fast & how respectfully we bury (tombs >
  // crypts > dirt graves restore more morale through respect).
  let graves = 0, bestRestore = 0, bestInterval = Infinity;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def?.graveyard) continue;
    graves++;
    bestRestore = Math.max(bestRestore, def.buryRestore || MORALE.buryRestore);
    bestInterval = Math.min(bestInterval, def.buryInterval || MORALE.buryInterval);
  }
  if (graves > 0 && bodies.length) {
    state._buryT = (state._buryT || 0) + dt * graves;
    if (state._buryT >= bestInterval) {
      state._buryT = 0;
      const b = bodies.shift();
      state.morale = Math.min(100, state.morale + bestRestore);
      addCompassion(state, 1); // honouring the fallen is an act of love
      addFx(state, b.x, b.y, '🕊️', 2);
      // A Hall of Heroes remembers the fallen by name (most recent first).
      const memorial = state.buildings.some(x => BUILDINGS[x.type]?.memorial);
      if (memorial && b.name) {
        (state.honored || (state.honored = [])).unshift({ name: b.name, species: b.species });
        if (state.honored.length > 24) state.honored.pop();
      }
      logMsg(state, memorial && b.name
        ? `🎖️ ${b.name} was laid to rest with honour in the Hall of Heroes (+${bestRestore} morale). They will be remembered.`
        : `🕊️ A fallen rodent was laid to rest (+${bestRestore} morale). The colony grieves but heals.`);
    }
  }

  const injured = state.units.filter(u => u.sick || u.needs.health < 25).length;
  let drain = bodies.length * MORALE.bodyDrain + injured * MORALE.injuredDrain;
  const docMorale = state._doc?.moraleRecover || 0; // Negotiation/Stoicism/Sacrifice doctrines
  const moraleRecover = MORALE.recover + (state._mega?.moraleRecover || 0) + docMorale; // Monument & doctrines lift spirits
  if (drain > 0) state.morale = Math.max(0, state.morale - drain * dt + ((state._mega?.moraleRecover || 0) + docMorale) * dt);
  else state.morale = Math.min(100, state.morale + moraleRecover * dt);

  // A militarised stance (towers set to DEFEND) weighs on the colony's spirit.
  const defendTowers = state._defendTowers || 0;
  if (defendTowers > 0) {
    state.morale = Math.max(0, state.morale - Math.min(0.18, defendTowers * 0.04) * dt);
    for (const u of state.units) u.needs.fun = Math.max(0, u.needs.fun - Math.min(0.12, defendTowers * 0.02) * dt);
  }

  // Low morale drips away everyone's Fun (sad colony).
  if (state.morale < 60) {
    const sap = (60 - state.morale) / 60 * 0.25 * dt;
    for (const u of state.units) u.needs.fun = Math.max(0, u.needs.fun - sap);
  }
}

function updateBreeding(state, dt) {
  // A child needs a HEALTHY breeding burrow with capacity headroom to be born in.
  const breedBurrows = state.buildings.filter(b => BUILDINGS[b.type]?.breed && !b.underConstruction && !b.degraded);
  if (breedBurrows.length === 0 || population(state) >= state.popCap) return;
  // …and a MATURE MALE + MATURE FEMALE in the colony. No mixed mature pair → none.
  const matureMales = state.units.filter(u => u.sex === 'm' && isMature(u));
  const matureFemales = state.units.filter(u => u.sex === 'f' && isMature(u));
  if (matureMales.length === 0 || matureFemales.length === 0) return;
  const wb = wellbeingMul(state);
  if (wb < 0.7 || (state.res.food || 0) < BREEDING.foodFloor) return;
  // Gentle base rate (BREEDING.baseRate, far below the old 0.04) flexed by the
  // same leadership / mega / doctrine / season / difficulty modifiers as before.
  state._breed = (state._breed || 0) + dt * breedBurrows.length * wb * BREEDING.baseRate * diffBreedMul(state) * (1 + (state._leadBreed || 0) + (state._mega?.breed || 0) + (state._doc?.breed || 0) + evoProtect(state, 'breed')) * Math.max(0, 1 + (state._envMods?.seasonBreed || 0));
  if (state._breed >= 1) {
    state._breed = 0;
    state.res.food -= BREEDING.foodCost;
    // Parents: a mature male + a mature female. Newborn spawns AT a breeding
    // burrow with capacity (not the world spawn point).
    const a = matureMales[Math.floor(Math.random() * matureMales.length)];
    const b = matureFemales[Math.floor(Math.random() * matureFemales.length)];
    const child = breedChild(state, a, b);
    const burrow = breedBurrows[Math.floor(Math.random() * breedBurrows.length)];
    child.x = burrow.x + (Math.random() - 0.5);
    child.y = burrow.y + (Math.random() - 0.5);
    state.units.push(child);
    addFx(state, child.x, child.y, '🐣', 2);
    const fam = child.family ? ` ${child.family}` : '';
    const par = child.parentNames ? ` to ${child.parentNames[0]} & ${child.parentNames[1]}` : '';
    logMsg(state, child.hybridOf
      ? `✨ ${child.name}${fam} — a hybrid ${SPECIES[child.species].name} — was born${par}!`
      : `🐣 ${child.name}${fam} was born${par}!`);
  }
}

// Lost / hurt animals wander to the colony's edge; the player clicks one to take
// it in (handled in ui/buildings). One at a time; a Sanctuary speeds arrivals.
function stepRescues(state, dt) {
  const lived = state.env?.lived || 0;
  if (state.rescue) {
    if (lived - state.rescue.born > RESCUE.life) {
      logMsg(state, `🐾 The lost ${SPECIES[state.rescue.species]?.name || 'animal'} wandered off before you could help it.`);
      state.rescue = null;
    }
    return;
  }
  const interval = RESCUE.baseInterval * ((state._sanctuary || 0) > 0 ? Math.pow(RESCUE.sanctuaryFactor, state._sanctuary) : 1);
  state._rescueT = (state._rescueT || 0) + dt;
  if (state._rescueT < Math.max(40, interval)) return;
  state._rescueT = 0;
  const sp = state.world.spawn;
  const ang = Math.random() * Math.PI * 2, dist = 5 + Math.random() * 4;
  const x = Math.max(1, Math.min(GRID_W - 2, Math.round(sp.x + Math.cos(ang) * dist)));
  const y = Math.max(1, Math.min(GRID_H - 2, Math.round(sp.y + Math.sin(ang) * dist)));
  const species = RESCUE.species[Math.floor(Math.random() * RESCUE.species.length)];
  state.rescue = { species, x, y, born: lived, name: randomGivenName() };
  reveal(state.world, x, y, 2);
  addFx(state, x, y, '💗', 2.2);
  logMsg(state, `🐾 A lost ${SPECIES[species]?.name || 'animal'} appeared nearby — click it to take it in and give it a home.`);
}

// Solar output factor (0..1): follows daylight (peaks at noon, zero at night)
// and the weather (clear skies best; fog/snow/storm dim the panels).
function solarFactor(state) {
  const f = dayFraction(state);
  let day = 0;
  if (f > 0.25 && f < 0.75) day = Math.sin((f - 0.25) / 0.5 * Math.PI); // 0 → 1 → 0
  const wk = { clear: 1, wind: 0.9, humid: 0.85, drought: 1, rain: 0.5, fog: 0.4, snow: 0.45, storm: 0.3 };
  return Math.max(0, day * (wk[state.env?.weather] ?? 0.8));
}

// Coal smog rises from running industry, disperses on its own, and is scrubbed
// by living forests. High pollution poisons crops (handled in production) and
// drains rodents' health here.
function stepPollution(state, dt) {
  let trees = 0;
  for (const n of state.world.nodes) if (n.kind === 'trees' && n.amount > 0) trees++;
  for (const b of state.buildings) if (BUILDINGS[b.type]?.tree && !b.underConstruction) trees++; // planted trees scrub too
  const rise = (state._pollSrc || 0) * POLLUTION.rise;
  const fall = trees * POLLUTION.treeScrub + POLLUTION.decay;
  state.pollution = Math.max(0, Math.min(100, (state.pollution || 0) + (rise - fall) * dt));
  const p = state.pollution;
  if (p > POLLUTION.sickAt) {
    const d = (p - POLLUTION.sickAt) / (100 - POLLUTION.sickAt) * POLLUTION.healthDrain * dt;
    for (const u of state.units) u.needs.health = Math.max(0, u.needs.health - d);
  }
}

function updateLoyalty(state, dt) {
  // Bond (affection from hands-on care) makes rodents more loyal.
  const avgBond = state.units.length ? state.units.reduce((a, u) => a + (u.bond ?? 45), 0) / state.units.length : 45;
  // Low morale (grief, neglect, violence) makes rodents far likelier to desert.
  const moralePenalty = (100 - (state.morale ?? 100)) / 280;
  const wb = wellbeingMul(state) + (avgBond - 45) / 220 - moralePenalty;
  if (wb < 0.62 && population(state) > 1) {
    state._unrest = (state._unrest || 0) + dt * (0.62 - wb) * 2;
    if (state._unrest >= 1) {
      state._unrest = 0;
      const left = state.units.splice(Math.floor(Math.random() * state.units.length), 1)[0];
      logMsg(state, `💔 A ${SPECIES[left.species].name} deserted — keep rodents fed, watered, rested & entertained!`);
    }
  } else {
    state._unrest = Math.max(0, (state._unrest || 0) - dt * 0.5);
  }
  if (wb > 0.95 && population(state) < state.popCap && (state.res.food || 0) > 30) {
    const harmony = 1 + Math.max(0, (state.compassion ?? 50) - 60) / 40; // kindness draws wanderers (1×..2×)
    state._join = (state._join || 0) + dt * 0.02 * harmony;
    if (state._join >= 1) {
      state._join = 0;
      const unlocked = Object.keys(SPECIES).filter(s => state.unlockedSpecies[s]);
      const sp = unlocked[Math.floor(Math.random() * unlocked.length)] || 'hamster';
      const s = state.world.spawn;
      state.units.push(makeRodent(state, sp, s.x, s.y));
      logMsg(state, `🤝 A wild ${SPECIES[sp].name} joined your thriving colony!`);
    }
  }
}
