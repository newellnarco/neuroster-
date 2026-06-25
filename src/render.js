// render.js — animated, textured rendering: living rodents, spinning wheels,
// scrolling conveyors, Warcraft-style terrain, weather particles, day/night.
import { TILE, GRID_W, GRID_H, NODE_TYPES, BUILDINGS, SPECIES } from './config.js';
import { terrainColor, idx, isSeen, getTile, TERRAIN } from './world.js';
import { dayFraction, currentWeather } from './environment.js';

// Per-species look (body colour, belly, size, ear & tail style).
const VIS = {
  hamster:   { body: '#d9a866', belly: '#f3e0bb', size: 15, ear: 4, tail: 3, tailW: 3 },
  guineapig: { body: '#b07d4f', belly: '#e8d3b0', size: 17, ear: 3, tail: 0, tailW: 0 },
  gerbil:    { body: '#caa56c', belly: '#efe0c0', size: 13, ear: 4, tail: 12, tailW: 2 },
  mouse:     { body: '#b9b9c2', belly: '#e6e6ee', size: 11, ear: 6, tail: 13, tailW: 1.5 },
  rat:       { body: '#9a9098', belly: '#cfc8cf', size: 16, ear: 5, tail: 16, tailW: 2 },
  beaver:    { body: '#6e4b32', belly: '#a98a66', size: 18, ear: 3, tail: 8, tailW: 6 },
};

export function createRenderer(canvas, state, getView) {
  const ctx = canvas.getContext('2d');
  canvas.width = GRID_W * TILE;
  canvas.height = GRID_H * TILE;

  function draw(now = 0) {
    const t = now / 1000;
    const view = getView();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawTerrain(t);
    drawNodes();
    drawBuildings(t);
    drawRodents(t);
    drawHover(view);
    drawDayNight();
    drawWeather(t);
  }

  // ---------- Terrain ----------
  function drawTerrain(t) {
    const ter = state.world.terrain;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const px = x * TILE, py = y * TILE;
        if (!isSeen(state.world, x, y)) { ctx.fillStyle = '#0c0b09'; ctx.fillRect(px, py, TILE, TILE); continue; }
        const type = ter[idx(x, y)];
        const h = hash(x, y);
        paintTile(px, py, type, h, x, y, t);
      }
    }
    // soft grid
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) { ctx.beginPath(); ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, GRID_H * TILE); ctx.stroke(); }
    for (let y = 0; y <= GRID_H; y++) { ctx.beginPath(); ctx.moveTo(0, y * TILE); ctx.lineTo(GRID_W * TILE, y * TILE); ctx.stroke(); }
  }

  function paintTile(px, py, type, h, x, y, t) {
    // base colour with subtle per-tile variation
    const base = terrainColor(type);
    const water = type === TERRAIN.water;
    ctx.fillStyle = shade(base, (rnd(h, 1) - 0.5) * 0.14);
    ctx.fillRect(px, py, TILE, TILE);

    // 3/4 "top-angle" depth: a soft top-light highlight and a darker front face
    // at the bottom of each tile so rows read as stacked blocks viewed from above.
    if (water) {
      // water sits recessed: shaded inset + a bright top rim (the bank above it)
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px, py, TILE, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px, py + TILE - 2, TILE, 2);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(px, py, TILE, 2);          // top light
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(px, py + TILE - 3, TILE, 3);     // front face
    }

    if (type === TERRAIN.water) {
      // animated ripples
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      const yo = (Math.sin(t * 1.5 + x * 0.6 + y) * 0.5 + 0.5) * (TILE * 0.35);
      ctx.fillRect(px + 3, py + 6 + yo, TILE - 6, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      const yo2 = (Math.sin(t * 1.1 + x + y * 0.5 + 2) * 0.5 + 0.5) * (TILE * 0.4);
      ctx.fillRect(px + 5, py + 4 + yo2, TILE - 12, 2);
    } else if (type === TERRAIN.grass) {
      // grass tufts
      ctx.strokeStyle = shade(base, -0.22); ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const gx = px + 4 + rnd(h, 10 + i) * (TILE - 8);
        const gy = py + 8 + rnd(h, 20 + i) * (TILE - 12);
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 1.5, gy - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - 1.5, gy - 4); ctx.stroke();
      }
      if (rnd(h, 5) > 0.92) { dot(px + rnd(h, 6) * TILE, py + rnd(h, 7) * TILE, 2, ['#e8d24a', '#e87ea0', '#fff'][h % 3]); }
    } else if (type === TERRAIN.dirt) {
      for (let i = 0; i < 3; i++) dot(px + rnd(h, 30 + i) * TILE, py + rnd(h, 40 + i) * TILE, 1.5, shade(base, -0.18));
    } else if (type === TERRAIN.sand) {
      for (let i = 0; i < 4; i++) dot(px + rnd(h, 50 + i) * TILE, py + rnd(h, 60 + i) * TILE, 1, shade(base, -0.12));
    } else if (type === TERRAIN.rock) {
      // a couple of angular stones
      ctx.fillStyle = shade(base, 0.12);
      poly(px + 6, py + TILE - 8, [[0, 0], [8, -3], [12, 4], [4, 7]]);
      ctx.fillStyle = shade(base, -0.16);
      poly(px + TILE - 14, py + 7, [[0, 0], [7, -2], [10, 5], [2, 7]]);
    } else if (type === TERRAIN.mountain) {
      // peak with snow cap
      ctx.fillStyle = shade(base, -0.1);
      poly(px + 4, py + TILE - 4, [[0, 0], [TILE / 2 - 4, -(TILE - 8)], [TILE - 8, 0]]);
      ctx.fillStyle = '#eef3fb';
      poly(px + TILE / 2 - 5, py + 5, [[0, 0], [5, -1], [9, 6], [-4, 6]]);
    } else if (type === TERRAIN.marsh) {
      // reeds + water specks
      ctx.strokeStyle = shade('#3f78b0', 0.1); ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const rx = px + 6 + rnd(h, 70 + i) * (TILE - 12), ry = py + TILE - 5;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 9 - rnd(h, 80 + i) * 4); ctx.stroke();
      }
      dot(px + rnd(h, 9) * TILE, py + rnd(h, 8) * TILE, 2, 'rgba(80,140,180,0.6)');
    }

    // shoreline: lighten land edges that touch water
    if (type !== TERRAIN.water) {
      const n = [[0, -1, 0, 0, TILE, 1], [0, 1, 0, TILE - 1, TILE, 1], [-1, 0, 0, 0, 1, TILE], [1, 0, TILE - 1, 0, 1, TILE]];
      for (const [dx, dy, ex, ey, ew, eh] of n) {
        if (getTile(state.world.terrain, x + dx, y + dy) === TERRAIN.water && isSeen(state.world, x + dx, y + dy)) {
          ctx.fillStyle = 'rgba(225,205,150,0.5)';
          ctx.fillRect(px + ex, py + ey, ew, eh);
        }
      }
    }
  }

  // ---------- Resource nodes ----------
  function drawNodes() {
    for (const n of state.world.nodes) {
      if (n.amount <= 0 || !isSeen(state.world, n.x, n.y)) continue;
      const cx = n.x * TILE + TILE / 2, cy = n.y * TILE + TILE / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.30, 10, 4.5, 0, 0, 7); ctx.fill();
      glyph(NODE_TYPES[n.kind].icon, cx, cy - 4, TILE * 0.82); // lifted to read as standing up
      const w = TILE - 6, pct = n.amount / n.max;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(n.x * TILE + 3, n.y * TILE + TILE - 5, w, 3);
      ctx.fillStyle = '#7cdc6a'; ctx.fillRect(n.x * TILE + 3, n.y * TILE + TILE - 5, w * pct, 3);
    }
  }

  // ---------- Buildings ----------
  function drawBuildings(t) {
    for (const b of state.buildings) {
      if (!isSeen(state.world, b.x, b.y)) continue;
      const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
      // ground shadow so structures read as raised in the top-angle view
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.30, 11, 4.5, 0, 0, 7); ctx.fill();
      if (b.type === 'wheel') { drawWheel(cx, cy - 3, t, b); continue; }
      if (b.type === 'conveyor' || b.type === 'conveyorMetal') { drawConveyor(cx, cy - 2, t, b); continue; }
      // raised stone base (front face darker) + lifted icon for a 3/4 look
      ctx.fillStyle = 'rgba(70,55,40,0.7)';
      roundRect(b.x * TILE + 4, b.y * TILE + 10, TILE - 8, TILE - 11, 5); ctx.fill();
      ctx.fillStyle = '#b9a888';
      roundRect(b.x * TILE + 4, b.y * TILE + 6, TILE - 8, TILE - 11, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(b.x * TILE + 4, b.y * TILE + 6, TILE - 8, 3, 3); ctx.fill();
      glyph(BUILDINGS[b.type].icon, cx, cy - 4, TILE * 0.78);
    }
  }

  // Spinning power wheel with a little runner inside.
  function drawWheel(cx, cy, t, b) {
    const R = TILE * 0.42;
    const spin = t * 4.2; // rotation
    ctx.save(); ctx.translate(cx, cy);
    // frame base
    ctx.fillStyle = '#5a4632'; ctx.fillRect(-R - 2, R - 1, (R + 2) * 2, 4);
    // rim
    ctx.strokeStyle = '#caa05a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    // spokes
    ctx.strokeStyle = 'rgba(202,160,90,0.8)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = spin + i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
    }
    ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill();
    ctx.restore();
    // runner at the bottom of the wheel, legs pumping
    const lp = t * 14;
    drawCreatureRaw(cx, cy + R - 5, 1, VIS.hamster, lp, true, false, false);
  }

  // Scrolling conveyor belt with travelling cargo pips.
  function drawConveyor(cx, cy, t, b) {
    const metal = b.type === 'conveyorMetal';
    const w = TILE - 4, h = TILE * 0.42, x0 = cx - w / 2, y0 = cy - h / 2;
    const flow = (b._flow ? 1 : 0.25) * (metal ? 1.8 : 1);
    ctx.fillStyle = metal ? '#6b7178' : '#7a5a36';
    roundRect(x0, y0, w, h, 4); ctx.fill();
    // rollers
    ctx.fillStyle = metal ? '#aeb4bb' : '#caa05a';
    ctx.beginPath(); ctx.arc(x0 + 4, cy, h / 2 - 1, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + w - 4, cy, h / 2 - 1, 0, 7); ctx.fill();
    // scrolling chevrons
    const gap = 7, off = (t * 26 * flow) % gap;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    for (let sx = x0 + 4 - gap; sx < x0 + w; sx += gap) {
      const ax = sx + off;
      ctx.beginPath(); ctx.moveTo(ax, cy - 3); ctx.lineTo(ax + 3, cy); ctx.lineTo(ax, cy + 3); ctx.stroke();
    }
    // a cargo pip riding the belt when flowing
    if (b._flow) {
      const p = ((t * 0.5) % 1);
      dot(x0 + 4 + p * (w - 8), cy - h / 2 - 2, 2.5, metal ? '#cfd6dd' : '#caa05a');
    }
  }

  // ---------- Rodents ----------
  function drawRodents(t) {
    const view = getView();
    for (const u of state.units) {
      // movement & facing from frame-to-frame delta
      const lx = u._rx ?? u.x, ly = u._ry ?? u.y;
      const dx = u.x - lx, dy = u.y - ly;
      const moved = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.0006) u._face = dx > 0 ? 1 : -1;
      u._rx = u.x; u._ry = u.y;
      const cx = u.x * TILE + TILE / 2, cy = u.y * TILE + TILE / 2;
      const vis = VIS[u.species] || VIS.hamster;
      const sleeping = u.phase === 'sleep';
      const legPhase = t * 12 + u.id * 1.7;
      drawCreatureRaw(cx, cy, u._face || 1, vis, legPhase, moved > 0.0015 && !sleeping, sleeping, !!u.carrying, t, u);
      if (view.selUnit === u.id) {
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, vis.size + 3, 0, 7); ctx.stroke();
      }
    }
  }

  // Procedurally draw a creature with a walk cycle. Used for rodents & wheel runner.
  function drawCreatureRaw(cx, cy, face, vis, legPhase, walking, sleeping, carrying, t = 0, u = null) {
    const s = vis.size / 15; // scale factor
    const bob = walking ? Math.abs(Math.sin(legPhase)) * 1.6 : Math.sin((t || 0) * 2 + (u ? u.id : 0)) * 0.5;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 7 * s, 8 * s, 3.2 * s, 0, 0, 7); ctx.fill();

    ctx.save();
    ctx.translate(cx, cy - bob);
    ctx.scale(face, 1);

    if (sleeping) {
      // curled up
      ctx.fillStyle = vis.body;
      ctx.beginPath(); ctx.ellipse(0, 2 * s, 9 * s, 6 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = vis.belly;
      ctx.beginPath(); ctx.arc(4 * s, 2 * s, 3 * s, 0, 7); ctx.fill();
      ctx.restore();
      // zzz
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `${9}px serif`; ctx.textAlign = 'center';
      const zb = ((t || 0) % 2) / 2;
      ctx.fillText('z', cx + 8, cy - 8 - zb * 6);
      return;
    }

    const swing = walking ? Math.sin(legPhase) * 3 * s : 0;
    // tail (behind body)
    if (vis.tail > 0) {
      ctx.strokeStyle = shade(vis.body, -0.1); ctx.lineWidth = vis.tailW;
      ctx.beginPath(); ctx.moveTo(-7 * s, 1 * s);
      ctx.quadraticCurveTo(-7 * s - vis.tail * 0.6, 1 * s - Math.sin(legPhase) * 2, -7 * s - vis.tail, -2 * s);
      ctx.stroke();
    }
    // back legs / front legs (little feet)
    ctx.fillStyle = shade(vis.body, -0.2);
    foot(-3 * s, 6 * s + swing, s); foot(3 * s, 6 * s - swing, s);
    // body
    ctx.fillStyle = vis.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 8 * s, 6 * s, 0, 0, 7); ctx.fill();
    // belly
    ctx.fillStyle = vis.belly;
    ctx.beginPath(); ctx.ellipse(1.5 * s, 2 * s, 4.5 * s, 3.2 * s, 0, 0, 7); ctx.fill();
    // head
    ctx.fillStyle = vis.body;
    const hx = 6.5 * s;
    ctx.beginPath(); ctx.arc(hx, -1.5 * s, 4.6 * s, 0, 7); ctx.fill();
    // ear
    ctx.beginPath(); ctx.arc(hx - 1 * s, -5 * s, vis.ear * 0.6 * s + 1, 0, 7); ctx.fill();
    ctx.fillStyle = '#f1c0c8';
    ctx.beginPath(); ctx.arc(hx - 1 * s, -5 * s, vis.ear * 0.3 * s + 0.5, 0, 7); ctx.fill();
    // eye + nose
    ctx.fillStyle = '#241c16';
    ctx.beginPath(); ctx.arc(hx + 1.5 * s, -2 * s, 1.1 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath(); ctx.arc(hx + 4.2 * s, -1 * s, 1 * s, 0, 7); ctx.fill();

    // carried cargo on the back
    if (carrying) { ctx.fillStyle = '#caa05a'; ctx.fillRect(-5 * s, -7 * s, 5 * s, 4 * s); ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1; ctx.strokeRect(-5 * s, -7 * s, 5 * s, 4 * s); }
    ctx.restore();

    // founder gets a tiny crown
    if (u && u.founder) { ctx.fillStyle = '#ffd54f'; ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.fillText('♛', cx, cy - 12 * s - bob); }
  }

  function foot(x, y, s) { ctx.beginPath(); ctx.ellipse(x, y, 2 * s, 1.4 * s, 0, 0, 7); ctx.fill(); }

  // ---------- Overlays ----------
  function drawHover(view) {
    if (view.hover && view.placing) {
      const { x, y } = view.hover;
      ctx.fillStyle = view.canPlace ? 'rgba(120,220,120,0.4)' : 'rgba(220,90,90,0.4)';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      glyph(BUILDINGS[view.placing].icon, x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.7);
    } else if (view.hover) {
      const { x, y } = view.hover;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  function drawDayNight() {
    const f = dayFraction(state);
    const dark = Math.max(0, Math.cos(f * Math.PI * 2)) * 0.45;
    if (dark > 0.01) { ctx.fillStyle = `rgba(10,18,48,${dark})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    const tw = Math.max(0, 1 - Math.abs(Math.abs(f - 0.5) - 0.25) * 8) * 0.18;
    if (tw > 0.01) { ctx.fillStyle = `rgba(255,150,60,${tw})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  function drawWeather(t) {
    const w = state.env?.weather;
    const tint = { rain: 'rgba(60,90,140,0.14)', fog: 'rgba(200,200,210,0.20)', snow: 'rgba(230,238,255,0.12)',
      storm: 'rgba(30,40,70,0.20)', humid: 'rgba(120,160,90,0.10)', drought: 'rgba(200,160,80,0.10)' }[w];
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (w === 'rain' || w === 'storm') {
      ctx.strokeStyle = 'rgba(160,190,230,0.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < 140; i++) {
        const px = (i * 97 % canvas.width);
        const py = ((i * 53 + t * 700) % canvas.height);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 3, py + 9); ctx.stroke();
      }
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 90; i++) {
        const px = ((i * 131 + Math.sin(t + i) * 12) % canvas.width);
        const py = ((i * 71 + t * 120) % canvas.height);
        ctx.beginPath(); ctx.arc(px, py, 1.4, 0, 7); ctx.fill();
      }
    }
  }

  // ---------- helpers ----------
  function glyph(ch, px, py, size) { ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, px, py); }
  function dot(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  function poly(ox, oy, pts) { ctx.beginPath(); ctx.moveTo(ox + pts[0][0], oy + pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(ox + pts[i][0], oy + pts[i][1]); ctx.closePath(); ctx.fill(); }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  return { draw };
}

// deterministic per-tile hash + pseudo-random
function hash(x, y) { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) >>> 0; return h; }
function rnd(h, salt) { let v = (h ^ (salt * 2654435761)) >>> 0; v = (v ^ (v >>> 15)) >>> 0; return (v % 10000) / 10000; }
function shade(hex, amt) {
  const c = hex.replace('#', '');
  let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const f = amt < 0 ? (1 + amt) : 1, add = amt > 0 ? amt * 255 : 0;
  r = Math.max(0, Math.min(255, r * f + add)); g = Math.max(0, Math.min(255, g * f + add)); b = Math.max(0, Math.min(255, b * f + add));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
