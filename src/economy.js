// economy.js — per-tick simulation: environment, production, per-creature needs,
// breeding, loyalty, exploration, and threats.
import { BUILDINGS, NEEDS, NODE_TYPES, SPECIES, BOND_DECAY, EDIBLES, RESOURCES, WASTE, WETTAIL, FERTILIZER_BOOST, MINE_REPAIR } from './config.js';
import { addRes, population, logMsg, wellbeingMul, evoBonus, addFx, canAfford, spend, killUnit } from './state.js';
import { MORALE, TOWNHALL_TIERS, TUNNEL_TIERS, CONSTRUCTION } from './config.js';
import { makeRodent, stepRodent, combineRodents, gainXp } from './entities.js';
import { stepEvents, stepFactions } from './events.js';
import { checkMilestones } from './milestones.js';
import { stepEnvironment, envMods } from './environment.js';
import { reveal, isFertile, addWaste, wasteAt } from './world.js';

// Run one simulation tick. dt is seconds per tick.
export function stepEconomy(state, dt) {
  // 0) Environment first; cache its modifiers for the rest of the tick.
  stepEnvironment(state, dt);
  const env = state._envMods = envMods(state);

  // 1) Rodent AI (gather/haul/sleep).
  for (const u of state.units) stepRodent(state, u, dt);

  // 2) Construction labour (sets _laborFactor), derived stats, leadership.
  updateConstruction(state, dt);
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

    let rate = dt * wb * powerMul * (1 + (state._leadership || 0)) * (state._laborFactor ?? 1); // leader inspires; builders divert labour
    if (def.category === 'Food') {
      // Fertile ground (this tile or recent-flood silt) + stored fertilizer boost crops.
      let bonus = state.mods.foodMul + env.foodMul;
      if ((state.fertileUntil || 0) > (state.env.lived || 0)) bonus += 0.6;
      if (def.fertileBonus && isFertile(state.world, b.x, b.y)) bonus += 0.8;
      if ((state.res.fertilizer || 0) > 0) { bonus += FERTILIZER_BOOST; state.res.fertilizer = Math.max(0, state.res.fertilizer - 0.05 * dt); }
      rate *= (1 + bonus);
    }
    if (def.category === 'Production') rate *= (1 + state.mods.prodMul);
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

  // 5b) Sanitation: droppings, composting, fertilizer, and wet-tail disease.
  updateWaste(state, dt);
  updateDisease(state, dt);

  // 6) Morale (grief/ethics), Breeding, Loyalty, Disasters.
  updateMorale(state, dt);
  updateBreeding(state, dt);
  updateLoyalty(state, dt);
  stepEvents(state, dt);
  stepFactions(state, dt);

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

  // 10) Age out floating reward feedback.
  if (state.fx && state.fx.length) {
    const t = state.env.lived;
    state.fx = state.fx.filter(f => t - f.born < f.life);
  }
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
        if (BUILDINGS[b.type].tunnel) b.hp = TUNNEL_TIERS[b.tier].hp;
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
  let popCap = 0, storage = 300, defense = 0, fun = 0, health = 0, feeders = 0, waterers = 0, caretakers = 0, vets = 0;
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (!def || b.underConstruction) continue;
    popCap += def.popCap || 0;
    storage += def.storage || 0;
    defense += def.defense || 0;
    fun += def.curiosity || 0;
    health += def.health || 0;
    feeders += def.feeder || 0;
    waterers += def.waterer || 0;
    caretakers += def.caretaker || 0;
    vets += def.vet || 0;
  }
  state._vets = vets;
  // Caretaker huts auto-tend energy, fun & health — easing larger settlements.
  fun += caretakers * 4; health += caretakers * 4;
  defense = Math.round(defense * (1 + evoBonus(state, 'all', 'defense')));
  state.popCap = popCap; state.storageCap = storage; state.defense = defense;
  state._funBld = fun; state._healthBld = health; state._feeders = feeders;
  state._waterers = waterers; state._caretakers = caretakers;
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
  const got = Math.min(n.amount, (def.rate || 1.2) * dt * wb * (1 + state.mods.mineMul));
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
  for (const b of state.buildings) reveal(state.world, b.x, b.y, 3);
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
  // infection chance scales with filth (vets suppress it)
  const healthy = state.units.filter(u => !u.sick);
  if (healthy.length && filth > 1) {
    const risk = WETTAIL.riskPerFilth * filth * dt * (vets ? 0.4 : 1);
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
      addFx(state, b.x, b.y, '🕊️', 2);
      logMsg(state, `🕊️ A fallen rodent was laid to rest (+${bestRestore} morale). The colony grieves but heals.`);
    }
  }

  const injured = state.units.filter(u => u.sick || u.needs.health < 25).length;
  let drain = bodies.length * MORALE.bodyDrain + injured * MORALE.injuredDrain;
  if (drain > 0) state.morale = Math.max(0, state.morale - drain * dt);
  else state.morale = Math.min(100, state.morale + MORALE.recover * dt);

  // Low morale drips away everyone's Fun (sad colony).
  if (state.morale < 60) {
    const sap = (60 - state.morale) / 60 * 0.25 * dt;
    for (const u of state.units) u.needs.fun = Math.max(0, u.needs.fun - sap);
  }
}

function updateBreeding(state, dt) {
  const burrows = state.buildings.filter(b => BUILDINGS[b.type]?.breed && !b.underConstruction).length;
  if (burrows === 0 || population(state) >= state.popCap) return;
  const wb = wellbeingMul(state);
  if (wb < 0.7 || (state.res.food || 0) < 5) return;
  state._breed = (state._breed || 0) + dt * burrows * wb * 0.04 * (1 + (state._leadBreed || 0));
  if (state._breed >= 1) {
    state._breed = 0;
    state.res.food -= 5;
    const sp = state.world.spawn;
    const species = [...new Set(state.units.map(u => u.species))];
    let child;
    if (species.length >= 2 && Math.random() < 0.5) {
      const a = state.units.find(u => u.species === species[0]);
      const b = state.units.find(u => u.species === species[1]);
      if (a && b) { child = combineRodents(state, a, b); child.x = sp.x; child.y = sp.y; }
    }
    if (!child) child = makeRodent(state, 'hamster', sp.x, sp.y);
    state.units.push(child);
    addFx(state, child.x, child.y, '🐣', 2);
    logMsg(state, child.hybridOf ? `✨ A hybrid ${SPECIES[child.species].name} was born (blended traits)!` : '🐹 A new hamster was born!');
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
    state._join = (state._join || 0) + dt * 0.02;
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
