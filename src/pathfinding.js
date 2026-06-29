// pathfinding.js — a pure, allocation-light A* grid pathfinder.
//
// This module is deliberately self-contained: it knows only about the world's
// tile grid (passability via `isBlockedTile`) and integer coordinates. It holds
// NO game state and imports nothing from the simulation, so it stays cheap to
// test in isolation and safe to call from the movement loop.
//
// `findPath` returns an array of {x,y} waypoints (start-EXCLUSIVE, target
// inclusive) the mover should walk through, or `null` when the target is
// unreachable, blocked, or the search blows its node-expansion budget. A budget
// cap guarantees a single call can never stall a frame — over budget just means
// "fall back to local steering", which the caller already handles.
import { GRID_W, GRID_H } from './config.js';
import { inBounds, isBlockedTile, tileMoveCost } from './world.js';

// 8-connected neighbour offsets. The first four are orthogonal (cost 1), the
// last four diagonal (cost √2). Diagonals are only allowed when BOTH orthogonal
// tiles they "cut" past are open — no squeezing through a blocked corner.
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const SQRT2 = Math.SQRT2;

// Octile distance: the exact cost of moving on an 8-connected grid where
// diagonal steps cost √2. Admissible (never over-estimates) so A* stays optimal.
function octile(dx, dy) {
  dx = Math.abs(dx); dy = Math.abs(dy);
  const lo = Math.min(dx, dy), hi = Math.max(dx, dy);
  return (hi - lo) + SQRT2 * lo;
}

const cellIdx = (x, y) => y * GRID_W + x;

/**
 * Find a walkable path from (sx,sy) to (tx,ty) on the world grid.
 *
 * @param {object} world  the world (used read-only via isBlockedTile)
 * @param {number} sx,sy  start tile (rounded to ints)
 * @param {number} tx,ty  target tile (rounded to ints)
 * @param {object} [opts]
 *   @param {number} [opts.budget=400]   max nodes expanded before giving up → null
 *   @param {boolean} [opts.diagonal=true] allow 8-connected movement
 * @returns {Array<{x:number,y:number}>|null}
 *   start-exclusive waypoints to the target, [] if already there, or null if
 *   unreachable / blocked / over budget.
 */
export function findPath(world, sx, sy, tx, ty, opts = {}) {
  const budget = opts.budget ?? 400;
  const diagonal = opts.diagonal !== false;

  sx = Math.round(sx); sy = Math.round(sy);
  tx = Math.round(tx); ty = Math.round(ty);

  if (!inBounds(sx, sy) || !inBounds(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  // A blocked target is unreachable by definition — bail rather than burn budget.
  if (isBlockedTile(world, tx, ty)) return null;

  const N = GRID_W * GRID_H;
  // Flat typed-array bookkeeping keyed by cell index — allocation-light and
  // avoids per-node object churn. gScore defaults to +Infinity.
  const g = new Float64Array(N).fill(Infinity);
  const cameFrom = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);

  // A tiny binary min-heap over cell indices, ordered by fScore.
  const heapIdx = [];      // cell indices
  const heapF = [];        // parallel fScore for the cell at this heap slot
  const push = (cell, f) => {
    let i = heapIdx.length;
    heapIdx.push(cell); heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= heapF[i]) break;
      [heapF[p], heapF[i]] = [heapF[i], heapF[p]];
      [heapIdx[p], heapIdx[i]] = [heapIdx[i], heapIdx[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heapIdx[0];
    const lastCell = heapIdx.pop(), lastF = heapF.pop();
    if (heapIdx.length) {
      heapIdx[0] = lastCell; heapF[0] = lastF;
      let i = 0;
      const n = heapIdx.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < n && heapF[l] < heapF[m]) m = l;
        if (r < n && heapF[r] < heapF[m]) m = r;
        if (m === i) break;
        [heapF[m], heapF[i]] = [heapF[i], heapF[m]];
        [heapIdx[m], heapIdx[i]] = [heapIdx[i], heapIdx[m]];
        i = m;
      }
    }
    return top;
  };

  const startCell = cellIdx(sx, sy), goalCell = cellIdx(tx, ty);
  g[startCell] = 0;
  push(startCell, octile(tx - sx, ty - sy));

  let expanded = 0;
  while (heapIdx.length) {
    const cell = pop();
    if (cell === goalCell) return reconstruct(cameFrom, goalCell);
    if (closed[cell]) continue; // a stale heap entry (we found a cheaper route)
    closed[cell] = 1;

    if (++expanded > budget) return null; // safety cap — never stall the frame

    const cx = cell % GRID_W, cy = (cell - (cell % GRID_W)) / GRID_W;

    // Orthogonal neighbours. Entering a tile costs its terrain move-cost (hills
    // cost more), so A* prefers flat routes but still climbs when it must.
    for (const [dx, dy] of ORTHO) {
      relax(cx + dx, cy + dy, cell, g[cell] + tileMoveCost(world, cx + dx, cy + dy));
    }
    // Diagonal neighbours, corner-cutting disallowed.
    if (diagonal) {
      for (const [dx, dy] of DIAG) {
        const nx = cx + dx, ny = cy + dy;
        // Both shared orthogonal tiles must be open, else the diagonal would
        // clip through a blocked corner.
        if (isBlockedTile(world, cx + dx, cy) || isBlockedTile(world, cx, cy + dy)) continue;
        relax(nx, ny, cell, g[cell] + SQRT2 * tileMoveCost(world, nx, ny));
      }
    }
  }
  return null; // open set drained without reaching the goal → unreachable

  function relax(nx, ny, fromCell, tentative) {
    if (!inBounds(nx, ny)) return;
    const nCell = cellIdx(nx, ny);
    if (closed[nCell]) return;
    if (isBlockedTile(world, nx, ny)) return;
    if (tentative >= g[nCell]) return; // not an improvement
    g[nCell] = tentative;
    cameFrom[nCell] = fromCell;
    push(nCell, tentative + octile(tx - nx, ty - ny));
  }
}

// Walk the cameFrom chain back from the goal, emitting start-exclusive {x,y}
// waypoints in travel order.
function reconstruct(cameFrom, goalCell) {
  const out = [];
  let c = goalCell;
  while (c !== -1) {
    out.push({ x: c % GRID_W, y: (c - (c % GRID_W)) / GRID_W });
    c = cameFrom[c];
  }
  out.reverse();
  out.shift(); // drop the start tile — callers want where to GO, not where they are
  return out;
}
