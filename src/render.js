// render.js — draws world, fog, nodes, buildings, rodents, and day/night/weather.
import { TILE, GRID_W, GRID_H, NODE_TYPES, BUILDINGS, SPECIES } from './config.js';
import { terrainColor, idx, isSeen } from './world.js';
import { dayFraction, isNight, currentWeather } from './environment.js';

export function createRenderer(canvas, state, getView) {
  const ctx = canvas.getContext('2d');
  canvas.width = GRID_W * TILE;
  canvas.height = GRID_H * TILE;

  function draw() {
    const view = getView();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = state.world.terrain;

    // Terrain (only where seen; unseen stays dark fog).
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!isSeen(state.world, x, y)) { ctx.fillStyle = '#0d0c0a'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); continue; }
        ctx.fillStyle = terrainColor(t[idx(x, y)]);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    // subtle grid on seen tiles
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) line(x * TILE, 0, x * TILE, GRID_H * TILE);
    for (let y = 0; y <= GRID_H; y++) line(0, y * TILE, GRID_W * TILE, y * TILE);

    // Resource nodes (seen only)
    for (const n of state.world.nodes) {
      if (n.amount <= 0 || !isSeen(state.world, n.x, n.y)) continue;
      emoji(NODE_TYPES[n.kind].icon, n.x, n.y, TILE * 0.8);
      const w = TILE - 6, pct = n.amount / n.max;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(n.x * TILE + 3, n.y * TILE + TILE - 5, w, 3);
      ctx.fillStyle = '#7cdc6a';
      ctx.fillRect(n.x * TILE + 3, n.y * TILE + TILE - 5, w * pct, 3);
    }

    // Buildings
    for (const b of state.buildings) {
      if (!isSeen(state.world, b.x, b.y)) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(b.x * TILE + 2, b.y * TILE + 2, TILE - 4, TILE - 4, 5); ctx.fill();
      emoji(BUILDINGS[b.type].icon, b.x, b.y, TILE * 0.72);
    }

    // Rodents
    for (const u of state.units) {
      const sp = SPECIES[u.species];
      const cx = u.x * TILE + TILE / 2, cy = u.y * TILE + TILE / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.22, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      emojiAt(sp.icon, cx, cy, TILE * 0.6);
      if (u.phase === 'sleep') emojiAt('💤', cx + 9, cy - 9, 13);
      else if (u.carrying) emojiAt('•', cx + 8, cy - 8, 14);
      // selection ring
      if (view.selUnit === u.id) { ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke(); }
    }

    // Placement preview / hover
    if (view.hover && view.placing) {
      const { x, y } = view.hover;
      ctx.fillStyle = view.canPlace ? 'rgba(120,220,120,0.4)' : 'rgba(220,90,90,0.4)';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      emoji(BUILDINGS[view.placing].icon, x, y, TILE * 0.7);
    } else if (view.hover) {
      const { x, y } = view.hover;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }

    drawDayNight();
    drawWeather();
  }

  // Day/night colour wash over the whole map.
  function drawDayNight() {
    const f = dayFraction(state);
    // darkness peaks at midnight (f=0/1), zero at noon (f=0.5)
    const night = Math.cos(f * Math.PI * 2); // 1 at midnight, -1 at noon
    const dark = Math.max(0, night) * 0.45;
    if (dark > 0.01) { ctx.fillStyle = `rgba(10,18,48,${dark})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    // warm dawn/dusk tint
    const tw = Math.max(0, 1 - Math.abs(Math.abs(f - 0.5) - 0.25) * 8) * 0.18;
    if (tw > 0.01) { ctx.fillStyle = `rgba(255,150,60,${tw})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  function drawWeather() {
    const w = currentWeather(state);
    const tint = { rain: 'rgba(60,90,140,0.16)', fog: 'rgba(200,200,210,0.22)', snow: 'rgba(230,238,255,0.16)',
      storm: 'rgba(30,40,70,0.22)', humid: 'rgba(120,160,90,0.12)', drought: 'rgba(200,160,80,0.12)' }[state.env?.weather];
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  function line(a, b, c, d) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  function emoji(ch, tx, ty, size) { emojiAt(ch, tx * TILE + TILE / 2, ty * TILE + TILE / 2, size); }
  function emojiAt(ch, px, py, size) {
    ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, px, py);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  return { draw };
}
