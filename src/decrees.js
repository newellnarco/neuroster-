// decrees.js — moral dilemmas that fall to the player. Each decree forces a hard
// tradeoff: every choice SPENDS one virtue (or food, or rodents' comfort) to buy
// another. Letting one lapse unsettles the colony. A Courthouse unlocks the
// merciful verdicts. This is the "spend morale on purpose for the group" loop.
import { DECREES, JUSTICE } from './config.js';
import { addCompassion, addJustice, addValor, addRes, addFx, logMsg } from './state.js';
import { makeRodent } from './entities.js';
import { totalOffense } from './events.js';

// Can the player currently pick this choice? (Court-gated mercy needs a Courthouse.)
export function choiceAllowed(state, choice) {
  if (choice.requires === 'court') return (state._courts || 0) > 0;
  return true;
}

export function stepDecrees(state, dt) {
  const lived = state.env?.lived || 0;
  stepFates(state, lived); // delayed consequences (a raised cub, a sheltered herd) ripen here
  if (lived < (JUSTICE.decreeFirst || 360)) return;

  // A decree is pending: tick its patience; auto-resolve if the player dithers.
  if (state.decree) {
    state.decree.life -= dt;
    if (state.decree.life <= 0) autoResolve(state);
    return;
  }

  // Schedule the next decree.
  if (state._decreeT == null) state._decreeT = JUSTICE.decreeEvery[0] * 0.6;
  state._decreeT -= dt;
  if (state._decreeT > 0) return;
  const [base, jit] = JUSTICE.decreeEvery;
  state._decreeT = base + jit * hash(lived);

  const pool = Object.values(DECREES).filter(d => !d.eligible || d.eligible(state));
  if (!pool.length) return;
  const d = pool[Math.floor(rand(state) * pool.length)];
  const dec = { id: d.id, life: 75, born: lived };
  if (d.faction) {
    const ids = Object.keys(state.factions || {});
    if (ids.length) dec.faction = ids[Math.floor(rand(state) * ids.length)];
  }
  state.decree = dec;
  addFx(state, state.world.spawn.x, state.world.spawn.y, '⚖️', 2.6);
  logMsg(state, `⚖️ A decision falls to you — ${d.title}. Open it to choose.`);
}

// Player picks choice `idx`. Returns true if applied.
export function resolveDecree(state, idx) {
  if (!state.decree) return false;
  const d = DECREES[state.decree.id];
  if (!d) { state.decree = null; return false; }
  const choice = d.choices[idx];
  if (!choice || !choiceAllowed(state, choice)) return false;
  applyEffect(state, choice, state.decree);
  state.decree = null;
  return true;
}

// Player deliberately defers — the town council decides (its default course).
// A deliberate hand-off, so no indecision penalty (unlike letting it time out).
export function dismissDecree(state) {
  if (!state.decree) return false;
  const d = DECREES[state.decree.id];
  if (!d) { state.decree = null; return false; }
  let idx = d.choices.findIndex(c => c.default && choiceAllowed(state, c));
  if (idx < 0) idx = d.choices.findIndex(c => choiceAllowed(state, c));
  if (idx < 0) idx = 0;
  logMsg(state, '🏛️ You leave the decision to the town council.');
  applyEffect(state, d.choices[idx], state.decree);
  state.decree = null;
  return true;
}

function autoResolve(state) {
  const d = DECREES[state.decree?.id];
  if (!d) { state.decree = null; return; }
  let idx = d.choices.findIndex(c => c.default && choiceAllowed(state, c));
  if (idx < 0) idx = d.choices.findIndex(c => choiceAllowed(state, c));
  if (idx < 0) idx = 0;
  state.morale = Math.max(0, (state.morale ?? 100) - 3); // dithering unsettles the colony
  logMsg(state, '⌛ You let the moment pass — indecision unsettles the colony.');
  applyEffect(state, d.choices[idx], state.decree);
  state.decree = null;
}

function applyEffect(state, choice, dec) {
  const e = choice.effect || {};
  if (e.morale) state.morale = Math.max(0, Math.min(100, (state.morale ?? 100) + e.morale));
  if (e.compassion) addCompassion(state, e.compassion);
  if (e.justice) addJustice(state, e.justice);
  if (e.valor) addValor(state, e.valor);
  if (e.res) for (const [k, v] of Object.entries(e.res)) addRes(state, k, v);
  if (e.standing && dec?.faction && state.factions?.[dec.faction]) {
    const f = state.factions[dec.faction];
    f.standing = Math.max(-100, Math.min(100, (f.standing || 0) + e.standing));
  }
  if (e.recruit) {
    const sp = state.world.spawn;
    const u = makeRodent(state, 'hamster', sp.x, sp.y);
    u.bond = 55;
    state.units.push(u);
    addFx(state, sp.x, sp.y, '🤝', 2);
  }
  if (e.truce) { // spend goodwill to buy peace: raids & predators hold off for a while
    state.truceUntil = (state.env?.lived || 0) + e.truce;
    addFx(state, state.world.spawn.x, state.world.spawn.y, '🕊️', 2.4);
  }
  if (e.fate) { // a consequence that ripens later (a raised cub, a sheltered herd)
    const delay = e.fate === 'cub' ? 110 : 80;
    (state.pendingFates || (state.pendingFates = [])).push({ kind: e.fate, at: (state.env?.lived || 0) + delay });
  }
  addFx(state, state.world.spawn.x, state.world.spawn.y, choice.fx || '✅', 2.2);
  logMsg(state, `⚖️ ${choice.result || choice.label}`);
}

// Delayed consequences ripen. A raised cub's nature is revealed (weighted by how
// kind the colony is); a sheltered herd sends back a gift.
function stepFates(state, lived) {
  const fates = state.pendingFates;
  if (!fates || !fates.length) return;
  const due = fates.filter(f => lived >= f.at);
  if (!due.length) return;
  state.pendingFates = fates.filter(f => lived < f.at);
  for (const f of due) {
    if (f.kind === 'cub') resolveCub(state);
    else if (f.kind === 'herd') resolveHerd(state);
  }
}

function resolveCub(state) {
  const c = state.compassion ?? 50;
  const r = rand(state);
  // A kind colony is far likelier to win the cub's loyalty; a cold one risks betrayal.
  const guardChance = Math.max(0.15, Math.min(0.85, 0.45 + (c - 50) / 160));
  const sp = state.world.spawn;
  if (r < guardChance) {
    state.guardian = (state.guardian || 0) + 1;
    state.morale = Math.min(100, (state.morale ?? 100) + 7);
    addCompassion(state, 4);
    addFx(state, sp.x, sp.y, '🐾', 2.6);
    logMsg(state, '🐾 The cub you raised has grown into a devoted guardian — it now prowls the borders, keeping predators at bay. Kindness repaid.');
  } else if (r < guardChance + 0.30) {
    state.morale = Math.max(0, (state.morale ?? 100) - 3);
    addFx(state, sp.x, sp.y, '🌙', 2.2);
    logMsg(state, '🌙 The cub grew restless and, one night, slipped away to rejoin its kind. You wish it well — the meadow feels a little emptier.');
  } else {
    // Trojan horse: the cub was a lure. Its pack storms in.
    state.morale = Math.max(0, (state.morale ?? 100) - 12);
    addJustice(state, 3); // a hard lesson in vigilance
    let stolen = 0;
    for (const k of ['food', 'planks', 'iron', 'wood', 'stone']) {
      const take = Math.min(state.res[k] || 0, 40); if (take > 0) { state.res[k] -= take; stolen += take; }
    }
    for (const u of state.units) u.needs.health = Math.max(0, u.needs.health - 8);
    addFx(state, sp.x, sp.y, '🐺', 2.8);
    logMsg(state, `🐺 Betrayal! The cub was a lure — its pack stormed the stores and stole ${Math.round(stolen)} supplies before you drove them off. Mercy has its risks.`);
  }
}

function resolveHerd(state) {
  const sp = state.world.spawn;
  // The herd's predators sometimes track it to your meadows — a big-beast attack.
  if ((state.disasters !== false) && rand(state) < 0.4) { resolveBeast(state); return; }
  const gift = 35 + Math.floor(rand(state) * 25);
  addRes(state, 'food', gift);
  addRes(state, 'seeds', 15);
  state.morale = Math.min(100, (state.morale ?? 100) + 4);
  addCompassion(state, 3);
  // A grateful straggler sometimes stays on.
  if (rand(state) < 0.4 && state.units.length < (state.popCap || 0) + 1) {
    const u = makeRodent(state, 'hamster', sp.x, sp.y); u.bond = 50; state.units.push(u);
    addFx(state, sp.x, sp.y, '🤝', 2);
    logMsg(state, `🦌 The herd moved on, leaving a gift of food (+${gift}) — and one young straggler chose to stay and join your colony!`);
  } else {
    addFx(state, sp.x, sp.y, '🌿', 2.2);
    logMsg(state, `🦌 The rested herd moved on, leaving a parting gift of food & seeds (+${gift} food) in thanks for your shelter.`);
  }
}

// Big predators followed the herd. The colony must fight. Strength (defense +
// offense) decides whether they repel it with proud, morally-NEUTRAL Valor — or
// take real casualties. Either way, standing your ground hardens the colony.
function resolveBeast(state) {
  const sp = state.world.spawn;
  const strength = (state.defense || 0) + totalOffense(state);
  for (const u of state.units) u.needs.health = Math.max(0, u.needs.health - 10); // a hard, bloody fight
  if (strength >= 12) {
    // Repelled by force: a surge of martial pride, no compassion gained.
    addValor(state, 14);
    state.morale = Math.min(100, (state.morale ?? 100) + 6);
    addFx(state, sp.x, sp.y, '🦁', 2.8);
    logMsg(state, '🦁 Great beasts followed the herd — but your colony stood and fought them off! Bloodied but unbroken, the warren swells with fierce pride (+Valor).');
  } else {
    // Overwhelmed: casualties. The survivors are grimly hardened all the same.
    let lost = 0;
    for (let i = 0; i < 2 && state.units.length > 1; i++) {
      if (rand(state) < 0.75) { state.units.splice(Math.floor(rand(state) * state.units.length), 1); lost++; }
    }
    addValor(state, 6); // even in loss, the colony learns to fight
    state.morale = Math.max(0, (state.morale ?? 100) - 10);
    addFx(state, sp.x, sp.y, '🐻', 2.8);
    logMsg(state, `🐻 Great beasts followed the herd and fell on the colony! ${lost ? `${lost} rodent(s) were lost` : 'You barely held on'} — build defenses & guards before opening your gates to wanderers.`);
  }
}

function rand(state) { state._r = ((state._r || state.seed || 1) * 1103515245 + 12345) & 0x7fffffff; return state._r / 0x7fffffff; }
function hash(s) { s = '' + s; let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return (h % 1000) / 1000; }
