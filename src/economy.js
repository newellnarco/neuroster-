// economy.js — per-tick simulation: environment, production, per-creature needs,
// breeding, loyalty, exploration, and threats.
import { BUILDINGS, NEEDS, NODE_TYPES, SPECIES, BOND_DECAY, EDIBLES, RESOURCES, WASTE, WETTAIL, FERTILIZER_BOOST, MINE_REPAIR, BURROW, GRID_W, GRID_H, RESCUE } from './config.js';
import { addRes, population, logMsg, wellbeingMul, evoBonus, addFx, canAfford, spend, killUnit, addCompassion, addJustice } from './state.js';
import { stepDecrees } from './decrees.js';
import { JUSTICE } from './config.js';
import { MORALE, TOWNHALL_TIERS, TUNNEL_TIERS, CONSTRUCTION, fortTiers } from './config.js';
import { makeRodent, stepRodent, breedChild, gainXp, randomGivenName } from './entities.js';
import { stepEvents, stepFactions } from './events.js';
import { checkMilestones } from './milestones.js';
import { stepEnvironment, envMods, seasonKey, currentSeason } from './environment.js';
import { SEASONS } from './config.js';
import { megaBonuses } from './megaprojects.js';
import { ensureCamps, stepCaravans } from './factions.js';
import { reveal, isFertile, addWaste, wasteAt } from './world.js';

// Run one simulation tick. dt is seconds per tick.
export function stepEconomy(state, dt) {
  // 0) Environment first; cache its modifiers for the rest of the tick.
  stepEnvironment(state, dt);
  const env = state._envMods = envMods(state);
  // Completed megaprojects grant permanent, colony-wide bonuses (cached per tick).
  const mega = state._mega = megaBonuses(state);
  if (mega.power) addRes(state, 'power', mega.power * dt);
  ensureCamps(state); // idempotent — also back-fills camps for pre-camp saves

  // 1) Rodent AI (gather/haul/sleep).
  for (const u of state.units) stepRodent(state, u, dt);

  // 2) Construction labour (sets _laborFactor), burrow upkeep, derived stats.
  updateConstruction(state, dt);
  updateBurrows(state, dt); // before recompute so degraded burrows drop popCap now
  recomputeBuildings(state);
  updateLeadership(state, dt);

  // 3) Building production / refining.
  const wb = wellbeingMul(state);
  const powerMul = powerMultiplier(state);
  // Dams hold back the river: each one cuts non-dam water sources' flow upstream.
  const dams = state.buildings.filter(b => BUILDINGS[b.type]?.upstreamPenalty).length;
  const upstreamMul = Math.max(0.3, 1 - 0.3 * dams);
  // Weather can rain extra water into stores.
  if (env.waterGain) addRes(state, 'water', env.waterGain * dt * Math.max(1, population(state) * 0.4));
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def || b.active === false || b.underConstruction) continue;
    if (def.mine) { runMine(state, b, def, dt, wb); continue; }
    if (def.belt) { runBelt(state, b, def, dt, wb); continue; }

    let rate = dt * wb * powerMul * (1 + (state._leadership || 0) + (mega.leadership || 0)) * (state._laborFactor ?? 1) * (1 - (state._distract || 0)); // leader inspires; builders divert labour; play-enrichment distracts a little
    if (def.category === 'Food') {
      // Fertile ground (this tile or recent-flood silt) + stored fertilizer boost crops.
      let bonus = state.mods.foodMul + env.foodMul + (mega.foodMul || 0);
      if ((state.fertileUntil || 0) > (state.env.lived || 0)) bonus += 0.6;
      if (def.fertileBonus && isFertile(state.world, b.x, b.y)) bonus += 0.8;
      if ((state.res.fertilizer || 0) > 0) { bonus += FERTILIZER_BOOST; state.res.fertilizer = Math.max(0, state.res.fertilizer - 0.05 * dt); }
      rate *= (1 + bonus);
    }
    if (def.category === 'Production') rate *= (1 + state.mods.prodMul + (mega.prodMul || 0));
    if (def.produces?.power) rate *= (1 + env.powerGain);
    if (def.produces?.research) rate *= (1 + (state.mods.researchMul || 0) + evoBonus(state, 'all', 'research'));

    if (def.consumes) {
      const ok = Object.entries(def.consumes).every(([k, v]) => (state.res[k] || 0) >= v * rate);
      if (!ok) continue;
      for (const [k, v] of Object.entries(def.consumes)) state.res[k] -= v * rate;
    }
    if (def.produces) for (const [k, v] of Object.entries(def.produces)) {
      // Non-dam water sources lose flow when dams hold the river upstream.
      const r = (k === 'water' && !def.upstreamPenalty) ? rate * upstreamMul : rate;
      addRes(state, k, v * r);
    }
  }
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

  // 6) Morale (grief/ethics), Breeding, Loyalty, Disasters.
  updateMorale(state, dt);
  updateBreeding(state, dt);
  updateLoyalty(state, dt);
  stepEvents(state, dt);
  stepFactions(state, dt);
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
  for (const b of jobs) {
    const inc = perJob * C.buildRate * dt;
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
  let popCap = 0, storage = 300, defense = 0, fun = 0, health = 0, feeders = 0, waterers = 0, caretakers = 0, vets = 0, hygiene = 0, distract = 0, defendTowers = 0, watchTowers = 0, sanctuaries = 0, courts = 0, alms = 0, memorials = 0;
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
    waterers += def.waterer || 0;
    caretakers += def.caretaker || 0;
    vets += def.vet || 0;
    if (def.sanctuary) sanctuaries++;
    if (def.court) courts++;
    if (def.almshouse) alms++;
    if (def.memorial) memorials++;
  }
  state._sanctuary = sanctuaries;
  state._courts = courts;
  state._alms = alms;
  state._memorial = memorials;
  state._vets = vets;
  // Caretaker huts auto-tend energy, fun & health — easing larger settlements.
  fun += caretakers * 4; health += caretakers * 4;
  defense = Math.round(defense * (1 + evoBonus(state, 'all', 'defense'))) + (state._mega?.defense || 0);
  storage += state._mega?.storage || 0; // Great Granary expands the vaults
  state.popCap = popCap; state.storageCap = storage; state.defense = defense;
  state._funBld = fun; state._healthBld = health; state._feeders = feeders;
  state._waterers = waterers; state._caretakers = caretakers; state._hygiene = hygiene;
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
  const got = Math.min(n.amount, (def.rate || 1.2) * dt * wb * (1 + state.mods.mineMul + (state._mega?.mineMul || 0)));
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

// Conveyor belts auto-transport from the nearest in-range SURFACE node to storage.
function runBelt(state, b, def, dt, wb) {
  const r = def.radius || 2;
  let target = null, bd = Infinity;
  for (const n of state.world.nodes) {
    if (n.amount <= 0 || NODE_TYPES[n.kind].surface === false) continue;
    const d = Math.abs(n.x - b.x) + Math.abs(n.y - b.y);
    if (d <= r && d < bd) { bd = d; target = n; }
  }
  if (!target) { b._flow = 0; return; }
  const got = Math.min(target.amount, def.belt.rate * dt * wb);
  target.amount -= got;
  addRes(state, NODE_TYPES[target.kind].resource, got);
  b._flow = 1;
}

function powerMultiplier(state) {
  const p = state.res.power || 0;
  const boost = Math.min(1.0, p / 100);
  if (p > 0) state.res.power = Math.max(0, p - 0.2);
  return 1 + boost;
}

// Each rodent eats, drinks, gets bored, and ages its health independently.
function updatePerUnitNeeds(state, dt, env) {
  const feederFactor = Math.max(0.4, 1 - (state._feeders || 0) * 0.15);
  const watererFactor = Math.max(0.4, 1 - (state._waterers || 0) * 0.15);
  const funRecover = (state._funBld || 0) * 0.05 * dt;     // Playgrounds + caretakers
  const healthRecover = (state._healthBld || 0) * 0.04 * dt; // Infirmaries + caretakers
  const energyRecover = (state._caretakers || 0) * 0.6 * dt; // caretakers ease rest needs
  const envDrain = 1 + (env.needDrain || 0);

  for (const u of state.units) {
    const n = u.needs;
    const retain = Math.max(0.4, 1 - evoBonus(state, u.species, 'needRetain'));
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

// Burrows accumulate filth; caretakers clean them; neglected ones degrade and
// stop housing/breeding until cleaned (click a burrow to clean it).
function updateBurrows(state, dt) {
  const caretakers = state._caretakers || 0;
  const occ = Math.max(1, population(state));
  for (const b of state.buildings) {
    if (!BUILDINGS[b.type]?.breed || b.underConstruction) continue;
    b.dirt = (b.dirt || 0) + BURROW.dirtRate * dt * (0.5 + occ * 0.02);
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
  // composters convert nearby droppings into fertilizer
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
      addRes(state, 'fertilizer', take * 1.5);
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
  const moraleRecover = MORALE.recover + (state._mega?.moraleRecover || 0); // Monument lifts spirits
  if (drain > 0) state.morale = Math.max(0, state.morale - drain * dt + (state._mega?.moraleRecover || 0) * dt);
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
  const burrows = state.buildings.filter(b => BUILDINGS[b.type]?.breed && !b.underConstruction && !b.degraded).length;
  if (burrows === 0 || population(state) >= state.popCap) return;
  const wb = wellbeingMul(state);
  if (wb < 0.7 || (state.res.food || 0) < 5) return;
  state._breed = (state._breed || 0) + dt * burrows * wb * 0.04 * (1 + (state._leadBreed || 0) + (state._mega?.breed || 0)) * Math.max(0, 1 + (state._envMods?.seasonBreed || 0));
  if (state._breed >= 1) {
    state._breed = 0;
    state.res.food -= 5;
    const sp = state.world.spawn;
    let child;
    if (state.units.length >= 2) {
      // Two specific parents — the child inherits their family, coat & traits.
      const a = state.units[Math.floor(Math.random() * state.units.length)];
      let b = a, guard = 0;
      while (b === a && guard++ < 6) b = state.units[Math.floor(Math.random() * state.units.length)];
      child = breedChild(state, a, b);
    } else {
      child = makeRodent(state, 'hamster', sp.x, sp.y);
    }
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
