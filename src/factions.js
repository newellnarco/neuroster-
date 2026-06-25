// factions.js — gives the economic factions a PHYSICAL presence in the world:
// a camp on the map for each neighbour, and caravans that visibly travel between
// their camp and your colony when they trade with you or come to raid. This is
// what turns the faction system from a menu into living neighbours (Arc 15).
import { GRID_W, GRID_H, FACTIONS } from './config.js';
import { getTile, TERRAIN, inBounds, reveal } from './world.js';

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
