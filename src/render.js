// render.js — draws the world, nodes, buildings, and rodents to the canvas.
import { TILE, GRID_W, GRID_H, NODE_TYPES, BUILDINGS, SPECIES } from './config.js';
import { terrainColor, idx } from './world.js';

export function createRenderer(canvas, state, getView) {
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = GRID_W * TILE;
    canvas.height = GRID_H * TILE;
  }
  resize();

  function draw() {
    const view = getView();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Terrain
    const t = state.world.terrain;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        ctx.fillStyle = terrainColor(t[idx(x, y)]);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    // subtle grid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) line(x * TILE, 0, x * TILE, GRID_H * TILE);
    for (let y = 0; y <= GRID_H; y++) line(0, y * TILE, GRID_W * TILE, y * TILE);

    // Resource nodes
    for (const n of state.world.nodes) {
      if (n.amount <= 0) continue;
      const def = NODE_TYPES[n.kind];
      emoji(def.icon, n.x, n.y, TILE * 0.8);
      // depletion bar
      const w = TILE - 6, pct = n.amount / n.max;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(n.x * TILE + 3, n.y * TILE + TILE - 5, w, 3);
      ctx.fillStyle = '#7cdc6a';
      ctx.fillRect(n.x * TILE + 3, n.y * TILE + TILE - 5, w * pct, 3);
    }

    // Buildings
    for (const b of state.buildings) {
      const def = BUILDINGS[b.type];
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(b.x * TILE + 2, b.y * TILE + 2, TILE - 4, TILE - 4, 5);
      ctx.fill();
      emoji(def.icon, b.x, b.y, TILE * 0.72);
    }

    // Rodents
    for (const u of state.units) {
      const sp = SPECIES[u.species];
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(u.x * TILE + TILE / 2, u.y * TILE + TILE * 0.72, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      emojiAt(sp.icon, u.x * TILE + TILE / 2, u.y * TILE + TILE / 2, TILE * 0.62);
      if (u.carrying) emojiAt('•', u.x * TILE + TILE / 2 + 8, u.y * TILE + TILE / 2 - 8, 14);
    }

    // Hover highlight + placement preview
    if (view.hover && view.placing) {
      const { x, y } = view.hover;
      ctx.fillStyle = view.canPlace ? 'rgba(120,220,120,0.4)' : 'rgba(220,90,90,0.4)';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      emoji(BUILDINGS[view.placing].icon, x, y, TILE * 0.7);
    } else if (view.hover) {
      const { x, y } = view.hover;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  function line(a, b, c, d) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  function emoji(ch, tx, ty, size) { emojiAt(ch, tx * TILE + TILE / 2, ty * TILE + TILE / 2, size); }
  function emojiAt(ch, px, py, size) {
    ctx.font = `${size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, px, py);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { draw, resize };
}
