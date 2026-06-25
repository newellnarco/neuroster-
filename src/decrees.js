// decrees.js — moral dilemmas that fall to the player. Each decree forces a hard
// tradeoff: every choice SPENDS one virtue (or food, or rodents' comfort) to buy
// another. Letting one lapse unsettles the colony. A Courthouse unlocks the
// merciful verdicts. This is the "spend morale on purpose for the group" loop.
import { DECREES, JUSTICE } from './config.js';
import { addCompassion, addJustice, addRes, addFx, logMsg } from './state.js';
import { makeRodent } from './entities.js';

// Can the player currently pick this choice? (Court-gated mercy needs a Courthouse.)
export function choiceAllowed(state, choice) {
  if (choice.requires === 'court') return (state._courts || 0) > 0;
  return true;
}

export function stepDecrees(state, dt) {
  const lived = state.env?.lived || 0;
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
  if (e.guardian) state.guardian = (state.guardian || 0) + 1; // a raised cub becomes a watchful friend
  addFx(state, state.world.spawn.x, state.world.spawn.y, choice.fx || '✅', 2.2);
  logMsg(state, `⚖️ ${choice.result || choice.label}`);
}

function rand(state) { state._r = ((state._r || state.seed || 1) * 1103515245 + 12345) & 0x7fffffff; return state._r / 0x7fffffff; }
function hash(s) { s = '' + s; let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return (h % 1000) / 1000; }
