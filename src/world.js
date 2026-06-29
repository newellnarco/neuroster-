// world.js — tile grid + procedural, biome-driven terrain & resource nodes,
// plus a persistent "seen" fog-of-war layer.
import { GRID_W, GRID_H, NODE_TYPES, BIOMES } from './config.js';

// A tiny seeded RNG so worlds are reproducible from a seed.
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const TERRAIN = { grass: 0, dirt: 1, rock: 2, water: 3, sand: 4, mountain: 5, marsh: 6 };
const TERRAIN_COLORS = ['#6f9e4b', '#9c8158', '#7d7d82', '#3f78b0', '#d8c98a', '#5d5a57', '#5f7355'];
export const terrainColor = (t) => TERRAIN_COLORS[t] ?? TERRAIN_COLORS[0];
export const isWater = (t) => t === TERRAIN.water;
export const isBuildable = (t) => t !== TERRAIN.water;
// A tile movers should avoid stepping into: water (can't swim) and mountains
// (impassable terrain). Cheap O(1) lookup used by local steering in entities.js.
export function isBlockedTile(world, x, y) {
  const t = getTile(world.terrain, Math.round(x), Math.round(y));
  return t === TERRAIN.water || t === TERRAIN.mountain;
}

// Pick a terrain type from a biome's weighted distribution.
function weightedTerrain(rng, weights) {
  let total = 0; for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return TERRAIN[k]; }
  return TERRAIN.grass;
}

export function generateWorld(seed = 12345, biomeKey = 'woodland', densityMul = 1) {
  const biome = BIOMES[biomeKey] || BIOMES.woodland;
  const rng = makeRng(seed);
  const terrain = new Uint8Array(GRID_W * GRID_H);

  // Base terrain from the biome's weighted mix.
  for (let i = 0; i < terrain.length; i++) terrain[i] = weightedTerrain(rng, biome.terrain);

  // Water features sized to the biome's `water` fraction (ponds/lakes).
  const waterFrac = biome.water || 0;
  const ponds = Math.round(waterFrac * 10);
  for (let p = 0; p < ponds; p++) {
    const px = 3 + Math.floor(rng() * (GRID_W - 6));
    const py = 3 + Math.floor(rng() * (GRID_H - 6));
    const r = 1 + Math.floor(rng() * 2 + waterFrac * 3);
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r) setTile(terrain, px + x, py + y, TERRAIN.water);
  }
  // River geography: real flow direction per water tile so dams mean something.
  //   river[i] = 1   → this tile is part of a flowing river (not a still pond)
  //   flow[i]  = dy  → its downstream step (+1 south as the channel runs top→bottom;
  //                    0 = source/still). Upstream is the opposite direction.
  // Deterministic from the seed (carved alongside the channel below).
  const river = new Uint8Array(GRID_W * GRID_H);
  const flow = new Int8Array(GRID_W * GRID_H); // downstream Δy per river tile
  // Rivers: snaking water channels for river biomes.
  if (biome.rivers) {
    let rx = Math.floor(rng() * GRID_W);
    for (let y = 0; y < GRID_H; y++) {
      setTile(terrain, rx, y, TERRAIN.water);
      setTile(terrain, rx + 1, y, TERRAIN.water);
      // Tag both channel tiles as a real river flowing downstream (south).
      for (const cx of [rx, rx + 1]) if (inBounds(cx, y)) {
        river[idx(cx, y)] = 1;
        flow[idx(cx, y)] = (y < GRID_H - 1) ? 1 : 0; // +1 south; 0 at the mouth
      }
      rx += Math.floor(rng() * 3) - 1;
      rx = clamp(rx, 1, GRID_W - 3);
    }
  }

  // Resource nodes — abundance scaled by the biome's nodeMul, avoiding spawn.
  const nodes = [];
  const cx = Math.floor(GRID_W / 2), cy = Math.floor(GRID_H / 2);
  // Trees seeded ~2.6× denser than the rest: the wood economy (storage,
  // wooden power/mills/lifts, fences, bridges, conveyances) leans on timber.
  // gemseam is the DEEP layer (Mine Shaft only) — kept sparse: a premium seam,
  // not a staple. Clusters are small so deep gems stay a sought-after find.
  const baseClusters = { trees: 13, pinewood: 4, berrybush: 3, wildflowers: 4, rock: 3, orevein: 2, coalseam: 2, oilseep: 1, gemseam: 1, bush: 3 };

  for (const kind of Object.keys(NODE_TYPES)) {
    const mul = ((biome.nodeMul && biome.nodeMul[kind]) || 1) * densityMul;
    const clusters = Math.max(1, Math.round((baseClusters[kind] || 2) * mul));
    for (let c = 0; c < clusters; c++) {
      const bx = 1 + Math.floor(rng() * (GRID_W - 2));
      const by = 1 + Math.floor(rng() * (GRID_H - 2));
      const size = 2 + Math.floor(rng() * 3);
      for (let n = 0; n < size; n++) {
        const nx = clamp(bx + Math.floor((rng() - 0.5) * 4), 1, GRID_W - 2);
        const ny = clamp(by + Math.floor((rng() - 0.5) * 4), 1, GRID_H - 2);
        if (Math.abs(nx - cx) < 3 && Math.abs(ny - cy) < 3) continue; // keep spawn clear
        if (getTile(terrain, nx, ny) === TERRAIN.water) continue;
        if (nodes.some(o => o.x === nx && o.y === ny)) continue;
        const def = NODE_TYPES[kind];
        const amount = Math.round(def.amount * (0.7 + rng() * 0.6) * Math.min(1.5, Math.max(0.6, mul)));
        nodes.push({ id: nodes.length, kind, x: nx, y: ny, amount, max: amount });
        if (kind === 'orevein' || kind === 'rock') setTile(terrain, nx, ny, TERRAIN.rock);
      }
    }
  }

  // Make sure spawn tile is buildable land (and drop any river flag it had).
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++)
    if (getTile(terrain, cx + x, cy + y) === TERRAIN.water) {
      setTile(terrain, cx + x, cy + y, TERRAIN.grass);
      if (inBounds(cx + x, cy + y)) { river[idx(cx + x, cy + y)] = 0; flow[idx(cx + x, cy + y)] = 0; }
    }

  // Fertility: richest growing soil sits next to water (lakes/rivers), plus a
  // few scattered patches. Farms thrive on fertile tiles.
  const fertile = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (getTile(terrain, x, y) === TERRAIN.water) continue;
    let nearWater = false;
    for (let dy = -1; dy <= 1 && !nearWater; dy++) for (let dx = -1; dx <= 1; dx++)
      if (getTile(terrain, x + dx, y + dy) === TERRAIN.water) { nearWater = true; break; }
    if (nearWater || rng() < 0.05) fertile[idx(x, y)] = 1;
  }

  const seen = new Uint8Array(GRID_W * GRID_H);   // fog of war
  const waste = new Float32Array(GRID_W * GRID_H); // droppings per tile

  return { terrain, seen, fertile, waste, river, flow, nodes, spawn: { x: cx, y: cy }, seed, biome: biomeKey };
}

// ---- River flow geography (for dams) ---------------------------------------
// A tile is a "real river" tile if generation tagged it as flowing water.
export const isRiverTile = (world, x, y) => inBounds(x, y) && world.river && world.river[idx(x, y)] === 1;
// Downstream Δy at a tile (+1 south as the channel runs; 0 = still/source). Upstream
// is the negation. Returns null for non-river tiles.
export function riverFlowAt(world, x, y) {
  if (!isRiverTile(world, x, y)) return null;
  const dy = world.flow ? world.flow[idx(x, y)] : 1;
  return { downstream: { dx: 0, dy }, upstream: { dx: 0, dy: -dy } };
}
// Is there a real river tile within radius r of (x,y)? Dams read this to know
// they sit on a true watercourse (vs a still pond) and earn the flow bonus.
export function riverNear(world, x, y, r = 1) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (isRiverTile(world, x + dx, y + dy)) return { x: x + dx, y: y + dy, flow: riverFlowAt(world, x + dx, y + dy) };
  return null;
}

export const isFertile = (world, x, y) => inBounds(x, y) && world.fertile && world.fertile[idx(x, y)] === 1;
export function setFertile(world, x, y, v = 1) { if (inBounds(x, y) && world.fertile) world.fertile[idx(x, y)] = v; }
export function addWaste(world, x, y, amt) { if (inBounds(x, y) && world.waste) world.waste[idx(x, y)] = Math.max(0, world.waste[idx(x, y)] + amt); }
export const wasteAt = (world, x, y) => (inBounds(x, y) && world.waste) ? world.waste[idx(x, y)] : 0;

// Reveal a circular area as permanently "seen".
export function reveal(world, cx, cy, radius) {
  const r2 = radius * radius;
  for (let y = -radius; y <= radius; y++)
    for (let x = -radius; x <= radius; x++)
      if (x * x + y * y <= r2) {
        const tx = cx + x, ty = cy + y;
        if (inBounds(tx, ty)) world.seen[idx(tx, ty)] = 1;
      }
}
export const isSeen = (world, x, y) => inBounds(x, y) && world.seen[idx(x, y)] === 1;

// Nearest still-fogged tile to (cx, cy) — the target for an exploring rodent.
// Returns {x, y} or null when the whole map has been revealed. Called only when
// an explorer needs a fresh target (on arrival / once its target clears), not
// every frame, so the full-grid scan is cheap.
export function nearestUnseen(world, cx, cy) {
  let best = null, bd = Infinity;
  for (let y = 0; y < GRID_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      if (world.seen[idx(x, y)]) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
  return best;
}

export function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H; }
export function idx(x, y) { return y * GRID_W + x; }
export function getTile(t, x, y) { return inBounds(x, y) ? t[idx(x, y)] : -1; }
export function setTile(t, x, y, v) { if (inBounds(x, y)) t[idx(x, y)] = v; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
