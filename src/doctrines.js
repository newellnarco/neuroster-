// doctrines.js — virtue-gated skill trees. The three colony virtues (Compassion,
// Justice, Valor) unlock permanent colony-wide perks across four branches (War,
// Negotiation, Stoicism, Sacrifice). Learning one costs research and needs a
// virtue threshold (and sometimes a prerequisite). Effects fold into state._doc
// and are read by economy/events/recompute, mirroring the megaproject pattern.
import { DOCTRINES } from './config.js';
import { logMsg, addFx, spend, canAfford } from './state.js';

const VIRTUE = { compassion: 50, justice: 50, valor: 20 };
function virtueVal(state, key) { return state[key] ?? VIRTUE[key] ?? 50; }

export function hasDoctrine(state, id) { return !!state.doctrines?.[id]; }

// Why (if at all) a doctrine can't be learned right now — for UI hints.
export function doctrineStatus(state, id) {
  const d = DOCTRINES[id]; if (!d) return { ok: false, reason: 'Unknown' };
  if (hasDoctrine(state, id)) return { ok: false, learned: true, reason: 'Learned' };
  if (d.prereq && !hasDoctrine(state, d.prereq)) return { ok: false, reason: `Needs ${DOCTRINES[d.prereq]?.name || d.prereq}` };
  for (const [v, n] of Object.entries(d.req || {})) {
    if (virtueVal(state, v) < n) return { ok: false, reason: `Needs ${v} ${n}` };
  }
  if (!canAfford(state, d.cost)) return { ok: false, reason: 'Need more research' };
  return { ok: true, reason: 'Ready to learn' };
}

export function learnDoctrine(state, id) {
  const st = doctrineStatus(state, id);
  if (!st.ok) return { ok: false, reason: st.reason };
  const d = DOCTRINES[id];
  if (!spend(state, d.cost)) return { ok: false, reason: 'Need more research' };
  (state.doctrines || (state.doctrines = {}))[id] = true;
  addFx(state, state.world.spawn.x, state.world.spawn.y, d.icon, 2.4);
  logMsg(state, `${d.icon} Doctrine learned: ${d.name} — ${d.desc}`);
  return { ok: true };
}

// Sum the effects of every learned doctrine. Cheap; cached on state._doc per tick.
export function doctrineBonuses(state) {
  const b = { defense: 0, offense: 0, prodMul: 0, foodMul: 0, moraleRecover: 0, breed: 0, raidDeter: 0, honoredSacrifice: 0 };
  const have = state.doctrines;
  if (!have) return b;
  for (const id of Object.keys(have)) {
    if (!have[id]) continue;
    const e = DOCTRINES[id]?.effect || {};
    for (const k in b) if (e[k]) b[k] += (k === 'honoredSacrifice' ? 1 : e[k]);
  }
  return b;
}

export function doctrineCount(state) {
  const have = state.doctrines; if (!have) return 0;
  return Object.values(have).filter(Boolean).length;
}
