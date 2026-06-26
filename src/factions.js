// factions.js — gives the economic factions a PHYSICAL presence in the world:
// a camp on the map for each neighbour, and caravans that visibly travel between
// their camp and your colony when they trade with you or come to raid. This is
// what turns the faction system from a menu into living neighbours (Arc 15).
import { GRID_W, GRID_H, FACTIONS, NODE_TYPES } from './config.js';
import { getTile, TERRAIN, inBounds, reveal } from './world.js';
import { logMsg, addFx, addRes } from './state.js';

// ---- AI colonies competing for resource nodes ------------------------------
// Neighbour colonies don't only trade & raid from afar — they reach for the same
// resource SEAMS you do. A faction may CLAIM/CONTEST a node: while contested,
// that node yields far less to your colony (their foragers are working it too),
// until the dispute resolves. Standing drives every outcome deterministically:
//   high standing  → they trade the claim away / cede it back (a peaceful gift)
//   middling/low   → they contest a node (your yield there drops)
//   very low       → an outright raid (handled by the existing raid path)
export const CONTEST = {
  yieldMul: 0.35,      // your effective yield from a contested node while disputed
  duration: 90,        // seconds a contest holds before it naturally lapses
  interest: 200,       // base seconds between a faction eyeing a node (scaled by pace)
  cedeStanding: 30,    // standing at/above which a high-standing neighbour cedes/trades
  contestBelow: 15,    // standing below which a neighbour will actively contest
  tradeBonus: 12,      // resource the faction trades you when it cedes a claim peacefully
};

// The yield multiplier for a node, accounting for any active contest. 1 = clear.
export function nodeContestFactor(state, n) {
  if (!n || !n.contestedBy) return 1;
  return CONTEST.yieldMul;
}

// True if a faction currently contests any node.
export function hasContest(state, id) {
  return (state.world?.nodes || []).some(n => n.contestedBy === id);
}

// A faction lays claim to (contests) the richest revealed surface node not already
// contested — reducing your yield there until the dispute resolves. Deterministic
// pick (richest first) so it's smoke-testable. Returns the node, or null.
export function contestNode(state, id, lived) {
  const f = FACTIONS[id]; if (!f) return null;
  let pick = null, best = -1;
  for (const n of state.world.nodes) {
    if (n.amount <= 0 || n.contestedBy || n.claimedBy) continue;
    if (NODE_TYPES[n.kind]?.surface === false) continue; // underground seams need a Mine; leave those
    if (n.amount > best) { best = n.amount; pick = n; }
  }
  if (!pick) return null;
  pick.contestedBy = id;
  pick.contestUntil = (lived || 0) + CONTEST.duration;
  spawnCaravan(state, id, 'raid'); // a foraging party visibly marches out to the seam
  addFx(state, pick.x, pick.y, `${f.icon}⛏️`, 2.4);
  logMsg(state, `${f.icon} The ${f.name} are contesting a ${NODE_TYPES[pick.kind]?.resource || 'resource'} seam — your yield there drops until you win them over (trade/standing) or they move on.`);
  return pick;
}

// Standing-driven resolution of a faction's existing contest. High standing →
// they cede the seam (and often gift a little of what they offer). Returns true
// if a contest was resolved this call.
export function resolveContest(state, id) {
  const f = FACTIONS[id]; if (!f) return false;
  const st = state.factions?.[id]; if (!st) return false;
  let resolved = false;
  for (const n of state.world.nodes) {
    if (n.contestedBy !== id) continue;
    if ((st.standing || 0) >= CONTEST.cedeStanding) {
      n.contestedBy = null; n.contestUntil = null;
      addRes(state, f.offers, CONTEST.tradeBonus);
      addFx(state, n.x, n.y, '🤝', 2.2);
      logMsg(state, `${f.icon} On good terms, the ${f.name} ceded the contested seam and shared ${CONTEST.tradeBonus} ${f.offers} as a goodwill gesture.`);
      resolved = true;
    }
  }
  return resolved;
}

// Let any contests that have run their course lapse (called each tick).
export function expireContests(state, lived) {
  for (const n of state.world?.nodes || []) {
    if (n.contestedBy && (n.contestUntil == null || lived >= n.contestUntil)) {
      const fid = n.contestedBy;
      n.contestedBy = null; n.contestUntil = null;
      const f = FACTIONS[fid];
      if (f) logMsg(state, `${f.icon} The ${f.name} foragers moved off the contested seam — it's yours to work freely again.`);
    }
  }
}

// Candidate camp anchors — spread around the edges/corners so neighbours ring
// the map. Indexed by faction order; extra factions wrap around.
const ANCHORS = [
  [4, 4], [GRID_W - 5, 4], [4, GRID_H - 5], [GRID_W - 5, GRID_H - 5],
  [Math.floor(GRID_W / 2), 3], [Math.floor(GRID_W / 2), GRID_H - 4],
];

// Find the nearest buildable (non-water) tile to a target, spiralling outward.
function nearestLand(world, tx, ty) {
  for (let r = 0; r < Math.max(GRID_W, GRID_H); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (inBounds(x, y) && getTile(world.terrain, x, y) !== TERRAIN.water) return { x, y };
    }
  }
  return { x: Math.min(GRID_W - 2, Math.max(1, tx)), y: Math.min(GRID_H - 2, Math.max(1, ty)) };
}

// Assign a camp to every faction that lacks one (covers new games AND old saves
// loaded before camps existed). Newly-placed camps are revealed so you can see
// who your neighbours are from the outset.
export function ensureCamps(state) {
  if (!state.factions) return;
  const ids = Object.keys(FACTIONS);
  let assigned = false;
  ids.forEach((id, i) => {
    const f = state.factions[id] || (state.factions[id] = { standing: 0, raidTimer: 150 });
    if (f.camp && inBounds(f.camp.x, f.camp.y)) return;
    const [ax, ay] = ANCHORS[i % ANCHORS.length];
    f.camp = nearestLand(state.world, ax, ay);
    assigned = true;
  });
  if (assigned) for (const id of ids) { const c = state.factions[id].camp; reveal(state.world, c.x, c.y, 3); }
}

// Spawn a caravan travelling from a faction's camp to your colony (trade/aid =
// friendly delivery; raid = an approaching war party). Purely visual; it fades
// out after `life` seconds and is pruned by stepCaravans.
export function spawnCaravan(state, id, kind = 'trade') {
  ensureCamps(state);
  const f = state.factions?.[id]; if (!f?.camp) return;
  const sp = state.world.spawn;
  const life = kind === 'raid' ? 3.2 : 4.5;
  (state.caravans || (state.caravans = [])).push({
    id: (state._caravanId = (state._caravanId || 0) + 1),
    fac: id, kind,
    fromX: f.camp.x, fromY: f.camp.y, toX: sp.x, toY: sp.y,
    born: state.env?.lived || 0, life,
  });
  if (state.caravans.length > 24) state.caravans.shift();
}

// Age out finished caravans (called from the per-tick fx cleanup).
export function stepCaravans(state) {
  if (!state.caravans?.length) return;
  const now = state.env?.lived || 0;
  state.caravans = state.caravans.filter(c => now - c.born < c.life);
}
