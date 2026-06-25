// world.js — tile grid + procedural placement of terrain & resource nodes.
import { GRID_W, GRID_H, NODE_TYPES } from './config.js';

// A tiny seeded RNG so worlds are reproducible from a seed.
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const TERRAIN = { grass: 0, dirt: 1, rock: 2, water: 3 };
const TERRAIN_COLORS = ['#6f9e4b', '#9c8158', '#7d7d82', '#3f78b0'];
export const terrainColor = (t) => TERRAIN_COLORS[t] || TERRAIN_COLORS[0];

// Generate a world: terrain array + a list of resource nodes.
export function generateWorld(seed = 12345) {
  const rng = makeRng(seed);
  const terrain = new Uint8Array(GRID_W * GRID_H);

  // Base grass, with a few dirt patches and a small pond.
  for (let i = 0; i < terrain.length; i++) {
    terrain[i] = rng() < 0.12 ? TERRAIN.dirt : TERRAIN.grass;
  }
  // a pond
  const px = 4 + Math.floor(rng() * (GRID_W - 8));
  const py = 4 + Math.floor(rng() * (GRID_H - 8));
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++)
      if (x * x + y * y <= 4) setTile(terrain, px + x, py + y, TERRAIN.water);

  // Resource nodes — clustered, avoiding the central spawn area.
  const nodes = [];
  const cx = Math.floor(GRID_W / 2), cy = Math.floor(GRID_H / 2);
  const kinds = Object.keys(NODE_TYPES);
  const clusterCounts = { trees: 5, rock: 3, orevein: 2, coalseam: 2, bush: 3 };

  for (const kind of kinds) {
    const clusters = clusterCounts[kind] || 2;
    for (let c = 0; c < clusters; c++) {
      const bx = 1 + Math.floor(rng() * (GRID_W - 2));
      const by = 1 + Math.floor(rng() * (GRID_H - 2));
      const size = 2 + Math.floor(rng() * 3);
      for (let n = 0; n < size; n++) {
        const nx = clamp(bx + Math.floor((rng() - 0.5) * 4), 1, GRID_W - 2);
        const ny = clamp(by + Math.floor((rng() - 0.5) * 4), 1, GRID_H - 2);
        // keep spawn clear
        if (Math.abs(nx - cx) < 3 && Math.abs(ny - cy) < 3) continue;
        if (getTile(terrain, nx, ny) === TERRAIN.water) continue;
        if (nodes.some(o => o.x === nx && o.y === ny)) continue;
        const def = NODE_TYPES[kind];
        nodes.push({ id: nodes.length, kind, x: nx, y: ny, amount: def.amount, max: def.amount });
        if (kind === 'orevein' || kind === 'rock') setTile(terrain, nx, ny, TERRAIN.rock);
      }
    }
  }

  return { terrain, nodes, spawn: { x: cx, y: cy }, seed };
}

export function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H; }
export function idx(x, y) { return y * GRID_W + x; }
export function getTile(t, x, y) { return inBounds(x, y) ? t[idx(x, y)] : -1; }
export function setTile(t, x, y, v) { if (inBounds(x, y)) t[idx(x, y)] = v; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
