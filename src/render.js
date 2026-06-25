// render.js — smooth, top-angle rendering: soft-blurred terrain, 2.5D receding
// trees/rocks/bushes, mine entrances, animated rodents/wheels/conveyors, weather.
import { TILE, GRID_W, GRID_H, NODE_TYPES, BUILDINGS, SPECIES, TUNNEL_TIERS } from './config.js';
import { terrainColor, idx, isSeen, getTile, TERRAIN, isFertile, wasteAt } from './world.js';
import { dayFraction, currentWeather } from './environment.js';

const VIS = {
  hamster:   { body: '#dcab68', belly: '#f4e2bd', size: 15, ear: 4, tail: 3, tailW: 3 },
  guineapig: { body: '#b07d4f', belly: '#e8d3b0', size: 17, ear: 3, tail: 0, tailW: 0 },
  gerbil:    { body: '#caa56c', belly: '#efe0c0', size: 13, ear: 4, tail: 12, tailW: 2 },
  mouse:     { body: '#bdbdc6', belly: '#e9e9f0', size: 11, ear: 6, tail: 13, tailW: 1.5 },
  rat:       { body: '#9a9098', belly: '#cfc8cf', size: 16, ear: 5, tail: 16, tailW: 2 },
  beaver:    { body: '#6e4b32', belly: '#a98a66', size: 18, ear: 3, tail: 8, tailW: 6 },
  gopher:    { body: '#a87f4e', belly: '#d8c193', size: 15, ear: 3, tail: 5, tailW: 3 },
};

export function createRenderer(canvas, state, getView) {
  const ctx = canvas.getContext('2d');
  canvas.width = GRID_W * TILE;
  canvas.height = GRID_H * TILE;
  ctx.imageSmoothingEnabled = true;

  // Offscreen terrain buffer, re-baked only when the revealed area changes.
  const terr = document.createElement('canvas');
  terr.width = canvas.width; terr.height = canvas.height;
  const tg = terr.getContext('2d');
  let g = ctx;            // current drawing target for helpers
  let bakedSeen = -1;
  let bmap = new Map();   // "x,y" -> building, rebuilt each frame for adjacency

  function draw(now = 0) {
    const t = now / 1000;
    const seenCount = countSeen();
    if (seenCount !== bakedSeen) { bakeTerrain(); bakedSeen = seenCount; }

    // soft, less-blocky terrain via a gentle blur on the blit
    ctx.save(); ctx.filter = 'blur(0.5px)'; ctx.drawImage(terr, 0, 0); ctx.restore();
    drawWaterShimmer(t);
    drawWaste();

    bmap.clear();
    for (const b of state.buildings) bmap.set(b.x + ',' + b.y, b);
    drawNodes(t);
    drawBuildings(t);
    drawBodies();
    drawRodents(t);
    drawFx();
    drawHover(getView());
    drawDayNight();
    drawWeather(t);
  }

  function countSeen() { let c = 0; const s = state.world.seen; for (let i = 0; i < s.length; i++) c += s[i]; return c; }

  // ---------- Terrain (baked) ----------
  function bakeTerrain() {
    g = tg;
    tg.clearRect(0, 0, terr.width, terr.height);
    const ter = state.world.terrain;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const px = x * TILE, py = y * TILE;
        if (!isSeen(state.world, x, y)) { tg.fillStyle = '#0c0b09'; tg.fillRect(px, py, TILE, TILE); continue; }
        paintTile(px, py, ter[idx(x, y)], hash(x, y), x, y);
      }
    }
    g = ctx;
  }

  function paintTile(px, py, type, h, x, y) {
    const base = terrainColor(type);
    const water = type === TERRAIN.water;
    // base with smooth top-to-bottom shading (implies a high angle, not a hard block)
    const grad = g.createLinearGradient(0, py, 0, py + TILE);
    grad.addColorStop(0, shade(base, 0.03 + (rnd(h, 1) - 0.5) * 0.08));
    grad.addColorStop(1, shade(base, -0.05));
    g.fillStyle = grad;
    g.fillRect(px - 1, py - 1, TILE + 2, TILE + 2); // slight overlap so blur hides seams

    // Blend toward differing neighbours so terrain transitions are seamless.
    blendEdges(px, py, type, x, y);

    // Fertile soil reads as a richer, darker loam (best for farming).
    if (!water && isFertile(state.world, x, y)) {
      g.fillStyle = 'rgba(70,45,20,0.20)'; g.fillRect(px, py, TILE, TILE);
      g.fillStyle = 'rgba(120,90,40,0.18)';
      for (let i = 0; i < 4; i++) dot(px + rnd(h, 90 + i) * TILE, py + rnd(h, 95 + i) * TILE, 1.4);
    }

    if (water) {
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(px, py, TILE, 3);
    } else if (type === TERRAIN.grass) {
      g.strokeStyle = shade(base, -0.22); g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const gx = px + 4 + rnd(h, 10 + i) * (TILE - 8), gy = py + 9 + rnd(h, 20 + i) * (TILE - 14);
        g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + 1.5, gy - 4); g.stroke();
        g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx - 1.5, gy - 4); g.stroke();
      }
      if (rnd(h, 5) > 0.93) dot(px + rnd(h, 6) * TILE, py + rnd(h, 7) * TILE, 2, ['#e8d24a', '#e87ea0', '#fff'][h % 3]);
    } else if (type === TERRAIN.dirt) {
      for (let i = 0; i < 3; i++) dot(px + rnd(h, 30 + i) * TILE, py + rnd(h, 40 + i) * TILE, 1.5, shade(base, -0.18));
    } else if (type === TERRAIN.sand) {
      for (let i = 0; i < 4; i++) dot(px + rnd(h, 50 + i) * TILE, py + rnd(h, 60 + i) * TILE, 1, shade(base, -0.12));
    } else if (type === TERRAIN.rock) {
      g.fillStyle = shade(base, 0.10); blob(px + 9, py + TILE - 9, 7, h, 1);
      g.fillStyle = shade(base, -0.16); blob(px + TILE - 10, py + 9, 6, h, 2);
    } else if (type === TERRAIN.mountain) {
      g.fillStyle = shade(base, -0.1); poly(px + 4, py + TILE - 4, [[0, 0], [TILE / 2 - 4, -(TILE - 8)], [TILE - 8, 0]]);
      g.fillStyle = '#eef3fb'; poly(px + TILE / 2 - 5, py + 5, [[0, 0], [5, -1], [9, 6], [-4, 6]]);
    } else if (type === TERRAIN.marsh) {
      g.strokeStyle = shade('#3f78b0', 0.1); g.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) { const rx = px + 6 + rnd(h, 70 + i) * (TILE - 12), ry = py + TILE - 5; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx, ry - 9 - rnd(h, 80 + i) * 4); g.stroke(); }
      dot(px + rnd(h, 9) * TILE, py + rnd(h, 8) * TILE, 2, 'rgba(80,140,180,0.6)');
    }
    // soft shoreline on land tiles touching water
    if (!water) {
      const n = [[0, -1, 0, 0, TILE, 2], [0, 1, 0, TILE - 2, TILE, 2], [-1, 0, 0, 0, 2, TILE], [1, 0, TILE - 2, 0, 2, TILE]];
      for (const [dx, dy, ex, ey, ew, eh] of n)
        if (getTile(state.world.terrain, x + dx, y + dy) === TERRAIN.water) { g.fillStyle = 'rgba(228,208,150,0.55)'; g.fillRect(px + ex, py + ey, ew, eh); }
    }
  }

  // Feather a neighbouring terrain's colour inward from each shared edge.
  function blendEdges(px, py, type, x, y) {
    const F = TILE * 0.55;
    const edges = [
      [0, -1, px, py, TILE, F, 0, 1],     // top
      [0, 1, px, py + TILE - F, TILE, F, 0, -1], // bottom
      [-1, 0, px, py, F, TILE, 1, 0],     // left
      [1, 0, px + TILE - F, py, F, TILE, -1, 0], // right
    ];
    for (const [dx, dy, rx, ry, rw, rh, gx, gy] of edges) {
      const nt = getTile(state.world.terrain, x + dx, y + dy);
      if (nt < 0 || nt === type || !isSeen(state.world, x + dx, y + dy)) continue;
      const nc = terrainColor(nt);
      const x0 = dx < 0 ? px : dx > 0 ? px + TILE : px, y0 = dy < 0 ? py : dy > 0 ? py + TILE : py;
      const grad = g.createLinearGradient(x0, y0, x0 + gx * F, y0 + gy * F);
      grad.addColorStop(0, rgba(nc, 0.55)); grad.addColorStop(1, rgba(nc, 0));
      g.fillStyle = grad; g.fillRect(rx, ry, rw, rh);
    }
  }

  // Droppings: brown specks that pile up (dynamic — drawn over the baked terrain).
  function drawWaste() {
    const w = state.world.waste; if (!w) return;
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const amt = w[idx(x, y)]; if (amt <= 0.2 || !isSeen(state.world, x, y)) continue;
      const px = x * TILE, py = y * TILE, h = hash(x, y);
      const n = Math.min(6, Math.ceil(amt));
      ctx.fillStyle = 'rgba(60,40,20,0.5)';
      for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(px + 5 + rnd(h, 200 + i) * (TILE - 10), py + 6 + rnd(h, 210 + i) * (TILE - 12), 1.8, 0, 7); ctx.fill(); }
      if (amt >= 4) { ctx.fillStyle = 'rgba(90,70,30,0.18)'; ctx.fillRect(px, py, TILE, TILE); } // soiled
    }
  }

  // crisp animated water highlights drawn over the blurred base
  function drawWaterShimmer(t) {
    const ter = state.world.terrain;
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      if (ter[idx(x, y)] !== TERRAIN.water || !isSeen(state.world, x, y)) continue;
      const px = x * TILE, py = y * TILE;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(px + 3, py + 6 + (Math.sin(t * 1.5 + x * 0.6 + y) * 0.5 + 0.5) * (TILE * 0.35), TILE - 6, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(px + 5, py + 4 + (Math.sin(t * 1.1 + x + y * 0.5 + 2) * 0.5 + 0.5) * (TILE * 0.4), TILE - 12, 2);
    }
  }

  // ---------- Resource nodes (2.5D, receding) ----------
  function drawNodes(t) {
    for (const n of state.world.nodes) {
      if (!isSeen(state.world, n.x, n.y)) continue;
      const kind = NODE_TYPES[n.kind];
      const cx = n.x * TILE + TILE / 2, cy = n.y * TILE + TILE / 2;
      if (kind.surface === false) {
        if (n.claimedBy || n.amount <= 0) continue;        // a Mine draws claimed seams
        drawOreHint(cx, cy, n);                            // unclaimed deposit hint
        continue;
      }
      if (n.amount <= 0) continue;
      const frac = n.amount / n.max;
      if (n.kind === 'trees') drawCluster(cx, cy, n, frac, 3, drawTree);
      else if (n.kind === 'rock') drawCluster(cx, cy, n, frac, 3, drawBoulder);
      else drawCluster(cx, cy, n, frac, 3, drawBush);
      depletionBar(n);
    }
  }

  function drawCluster(cx, cy, n, frac, max, drawOne) {
    const count = Math.max(1, Math.round(frac * max));
    const seed = n.id * 2654435761;
    // shared ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.30, 11, 4.5, 0, 0, 7); ctx.fill();
    const slots = [[-6, 2], [6, 1], [0, -5], [-3, 6], [5, -4]];
    for (let i = 0; i < count; i++) {
      const s = slots[i % slots.length];
      const sc = (0.8 + ((seed >> (i * 3)) & 7) / 24) * (0.7 + 0.3 * frac);
      drawOne(cx + s[0], cy + s[1], sc);
    }
  }

  function drawTree(x, y, sc) {
    ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 1.5 * sc, y, 3 * sc, 8 * sc);          // trunk
    const r = 7 * sc;
    ctx.fillStyle = '#2f6d2f'; ball(x, y - 2 * sc, r); ball(x - r * 0.6, y + 1 * sc, r * 0.8); ball(x + r * 0.6, y + 1 * sc, r * 0.8);
    ctx.fillStyle = 'rgba(150,210,120,0.55)'; ball(x - r * 0.3, y - r * 0.5, r * 0.5);  // top-left highlight
    ctx.fillStyle = 'rgba(0,40,0,0.18)'; ball(x + r * 0.4, y + r * 0.3, r * 0.5);       // bottom-right shade
  }
  function drawBoulder(x, y, sc) {
    const r = 7 * sc;
    ctx.fillStyle = '#8a939b'; ball(x, y, r);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ball(x - r * 0.3, y - r * 0.35, r * 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ball(x + r * 0.35, y + r * 0.3, r * 0.45);
  }
  function drawBush(x, y, sc) {
    const r = 6 * sc;
    ctx.fillStyle = '#4e8a3a'; ball(x, y, r); ball(x - r * 0.6, y + 1, r * 0.7); ball(x + r * 0.6, y + 1, r * 0.7);
    ctx.fillStyle = 'rgba(180,220,120,0.5)'; ball(x - r * 0.2, y - r * 0.4, r * 0.4);
    ctx.fillStyle = '#caa33a'; dot(x + 1, y + 1, 1.4, '#caa33a'); // seeds
  }
  function drawOreHint(cx, cy, n) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 9, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = n.kind === 'coalseam' ? '#3b4248' : '#8d6e63';
    blob(cx, cy + 2, 7, n.id, 1);
    ctx.fillStyle = n.kind === 'coalseam' ? '#20262b' : '#caa07a';
    dot(cx - 2, cy, 1.6); dot(cx + 3, cy + 2, 1.4); dot(cx + 1, cy - 3, 1.3);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⛏ place mine', cx, cy - 11);
  }
  function depletionBar(n) {
    const w = TILE - 8, pct = n.amount / n.max;
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(n.x * TILE + 4, n.y * TILE + TILE - 4, w, 3);
    ctx.fillStyle = '#7cdc6a'; ctx.fillRect(n.x * TILE + 4, n.y * TILE + TILE - 4, w * pct, 3);
  }

  // ---------- Buildings ----------
  function drawBuildings(t) {
    for (const b of state.buildings) {
      if (!isSeen(state.world, b.x, b.y)) continue;
      const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.30, 11, 4.5, 0, 0, 7); ctx.fill();
      if (b.type === 'wheel') { drawWheel(cx, cy - 3, t, b); continue; }
      if (b.type === 'conveyor' || b.type === 'conveyorMetal') { drawConveyor(cx, cy - 2, t, b); continue; }
      if (b.type === 'mine') { drawMine(cx, cy, b); continue; }
      if (BUILDINGS[b.type].tunnel) { drawTunnel(cx, cy, b); continue; }
      if (BUILDINGS[b.type].townhall) { drawTownhall(cx, cy, b); continue; }
      ctx.fillStyle = 'rgba(70,55,40,0.7)'; roundRect(b.x * TILE + 4, b.y * TILE + 10, TILE - 8, TILE - 11, 6); ctx.fill();
      ctx.fillStyle = '#bcab8b'; roundRect(b.x * TILE + 4, b.y * TILE + 6, TILE - 8, TILE - 11, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.20)'; roundRect(b.x * TILE + 4, b.y * TILE + 6, TILE - 8, 3, 3); ctx.fill();
      glyph(BUILDINGS[b.type].icon, cx, cy - 3, TILE * 0.78);
    }
  }

  // Draw short connector stubs toward matching neighbours, leaving a centre gap
  // so a hamster travelling along the network stays visible.
  function drawConnectors(cx, cy, b, color, match) {
    const gap = 7;
    g2().fillStyle = color;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = bmap.get((b.x + dx) + ',' + (b.y + dy));
      if (!nb || !match(nb)) continue;
      const len = TILE / 2 - gap;
      if (dx) ctx.fillRect(dx > 0 ? cx + gap : cx - gap - len, cy - 4, len, 8);
      else ctx.fillRect(cx - 4, dy > 0 ? cy + gap : cy - gap - len, 8, len);
    }
  }
  function g2() { return ctx; }
  const isTunnel = (nb) => !!BUILDINGS[nb.type]?.tunnel;
  const isBelt = (nb) => nb.type === 'conveyor' || nb.type === 'conveyorMetal';
  const isFacility = (nb) => ['storage', 'burrow', 'townhall'].includes(nb.type);

  // Covered tunnel section: colour by tier (wood/iron/steel) with an HP bar.
  function drawTunnel(cx, cy, b) {
    const tier = TUNNEL_TIERS[b.tier || 0];
    drawConnectors(cx, cy, b, shade(tier.color, -0.05), (nb) => isTunnel(nb) || isFacility(nb));
    const w = TILE - 4, h = TILE * 0.5, x0 = cx - w / 2, y0 = cy - h / 2;
    ctx.fillStyle = shade(tier.color, -0.18); roundRect(x0, y0 + h * 0.5, w, h * 0.6, 4); ctx.fill();
    ctx.fillStyle = tier.color; roundRect(x0, y0, w, h, 6); ctx.fill();           // arched roof
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(x0, y0, w, 3, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;                       // ribs
    for (let i = 1; i < 4; i++) { const rx = x0 + (w / 4) * i; ctx.beginPath(); ctx.moveTo(rx, y0 + 2); ctx.lineTo(rx, y0 + h - 2); ctx.stroke(); }
    // HP bar
    const frac = Math.max(0, (b.hp ?? tier.hp) / tier.hp);
    if (frac < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x0, y0 - 5, w, 3);
      ctx.fillStyle = frac > 0.5 ? '#7cdc6a' : frac > 0.25 ? '#e6c34d' : '#e06b6b'; ctx.fillRect(x0, y0 - 5, w * frac, 3);
    }
  }

  // Town Hall: a civic building that grows grander (and more gilded) by tier.
  function drawTownhall(cx, cy, b) {
    const tier = b.tier || 0;
    const w = TILE - 4, x0 = cx - w / 2, y0 = cy - TILE * 0.32;
    ctx.fillStyle = 'rgba(70,55,40,0.7)'; roundRect(x0, y0 + TILE * 0.4, w, TILE * 0.28, 4); ctx.fill();
    ctx.fillStyle = ['#cdbb94', '#d8c9a0', '#e7d8a6'][tier]; roundRect(x0, y0, w, TILE * 0.6, 4); ctx.fill();
    // pediment roof + columns, gilded at higher tiers
    ctx.fillStyle = ['#b09a6a', '#c9a94e', '#e6c34d'][tier];
    poly(x0, y0 + 4, [[0, 0], [w / 2, -6], [w, 0]]);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 3 + tier; i++) { const lx = x0 + 3 + (w - 6) * i / (3 + tier); ctx.fillRect(lx, y0 + 6, 1.6, TILE * 0.5); }
    glyph(tier >= 2 ? '👑' : '🏛️', cx, cy - 2, TILE * 0.5);
    // tier pips
    ctx.fillStyle = '#ffd54f'; for (let i = 0; i <= tier; i++) { ctx.beginPath(); ctx.arc(cx - 6 + i * 6, cy + TILE * 0.36, 1.8, 0, 7); ctx.fill(); }
  }

  // Mine entrance: timbered shaft in a mound, with a remaining-resource readout.
  function drawMine(cx, cy, b) {
    const w = TILE - 8;
    ctx.fillStyle = '#6b5742'; roundRect(cx - w / 2, cy - 4, w, w * 0.7, 5); ctx.fill();          // mound
    ctx.fillStyle = '#1c1712'; roundRect(cx - 7, cy - 1, 14, 12, 4); ctx.fill();                  // dark shaft
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;                                                // timber frame
    ctx.strokeRect(cx - 7, cy - 1, 14, 12);
    ctx.beginPath(); ctx.moveTo(cx - 8, cy - 2); ctx.lineTo(cx + 8, cy - 2); ctx.stroke();
    if (b.flooded) {
      // floodwater filling the shaft + repair status
      ctx.fillStyle = 'rgba(60,120,180,0.55)'; roundRect(cx - 7, cy + 1, 14, 10, 3); ctx.fill();
      glyph('🌊', cx, cy - 11, 13);
      const now = state.env?.lived || 0;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(cx - 16, cy + 12, 32, 9, 3); ctx.fill();
      if (b.repairUntil != null) {
        const total = 35, left = Math.max(0, b.repairUntil - now);
        ctx.fillStyle = '#7cdc6a'; roundRect(cx - 15, cy + 13, 30 * (1 - left / total), 7, 3); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔧 repairing', cx, cy + 16.5);
      } else {
        ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('click: repair', cx, cy + 16.5);
      }
      return;
    }
    glyph('⛏️', cx, cy - 11, 13);
    if (b._remaining != null) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(cx - 13, cy + 12, 26, 9, 3); ctx.fill();
      ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${b._remaining}`, cx, cy + 17);
    }
  }

  function drawWheel(cx, cy, t, b) {
    const R = TILE * 0.42, spin = t * 4.2;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#5a4632'; ctx.fillRect(-R - 2, R - 1, (R + 2) * 2, 4);
    ctx.strokeStyle = '#caa05a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(202,160,90,0.8)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const a = spin + i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
    ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill();
    ctx.restore();
    drawCreatureRaw(cx, cy + R - 5, 1, VIS.hamster, t * 14, true, false, false);
  }

  function drawConveyor(cx, cy, t, b) {
    const metal = b.type === 'conveyorMetal';
    drawConnectors(cx, cy, b, metal ? '#6b7178' : '#7a5a36', (nb) => isBelt(nb) || isFacility(nb));
    const w = TILE - 4, h = TILE * 0.42, x0 = cx - w / 2, y0 = cy - h / 2;
    const flow = (b._flow ? 1 : 0.25) * (metal ? 1.8 : 1);
    ctx.fillStyle = metal ? '#6b7178' : '#7a5a36'; roundRect(x0, y0, w, h, 4); ctx.fill();
    ctx.fillStyle = metal ? '#aeb4bb' : '#caa05a';
    ctx.beginPath(); ctx.arc(x0 + 4, cy, h / 2 - 1, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + w - 4, cy, h / 2 - 1, 0, 7); ctx.fill();
    const gap = 7, off = (t * 26 * flow) % gap;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    for (let sx = x0 + 4 - gap; sx < x0 + w; sx += gap) { const ax = sx + off; ctx.beginPath(); ctx.moveTo(ax, cy - 3); ctx.lineTo(ax + 3, cy); ctx.lineTo(ax, cy + 3); ctx.stroke(); }
    if (b._flow) { const p = (t * 0.5) % 1; dot(x0 + 4 + p * (w - 8), cy - h / 2 - 2, 2.5, metal ? '#cfd6dd' : '#caa05a'); }
  }

  // Unburied dead — a sombre marker until a Graveyard lays them to rest.
  function drawBodies() {
    for (const b of state.bodies || []) {
      if (!isSeen(state.world, Math.round(b.x), Math.round(b.y))) continue;
      const cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 8, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a8a8a'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 7, 4, 0, 0, 7); ctx.fill();
      glyph('✝️', cx, cy - 7, 12);
    }
  }

  // ---------- Rodents ----------
  function drawRodents(t) {
    const view = getView();
    for (const u of state.units) {
      const lx = u._rx ?? u.x, ly = u._ry ?? u.y;
      const dx = u.x - lx;
      if (Math.abs(dx) > 0.0006) u._face = dx > 0 ? 1 : -1;
      const moved = Math.hypot(dx, u.y - ly);
      u._rx = u.x; u._ry = u.y;
      const cx = u.x * TILE + TILE / 2, cy = u.y * TILE + TILE / 2;
      drawCreatureRaw(cx, cy, u._face || 1, VIS[u.species] || VIS.hamster, t * 12 + u.id * 1.7, moved > 0.0015 && u.phase !== 'sleep', u.phase === 'sleep', !!u.carrying, t, u);
      if (u.sick) glyph('🤢', cx + 9, cy - 11, 12); // wet tail
      if (view.selUnit === u.id) { ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, (VIS[u.species]?.size || 15) + 3, 0, 7); ctx.stroke(); }
    }
  }

  function drawCreatureRaw(cx, cy, face, vis, legPhase, walking, sleeping, carrying, t = 0, u = null) {
    const s = vis.size / 15;
    const bob = walking ? Math.abs(Math.sin(legPhase)) * 1.6 : Math.sin((t || 0) * 2 + (u ? u.id : 0)) * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 7 * s, 9 * s, 3.4 * s, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(cx, cy - bob); ctx.scale(face, 1);

    if (sleeping) {
      ctx.fillStyle = vis.body; ctx.beginPath(); ctx.ellipse(0, 2 * s, 9 * s, 6 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = vis.belly; ctx.beginPath(); ctx.arc(4 * s, 2 * s, 3 * s, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '9px serif'; ctx.textAlign = 'center';
      ctx.fillText('z', cx + 8, cy - 8 - (((t || 0) % 2) / 2) * 6);
      return;
    }
    const swing = walking ? Math.sin(legPhase) * 3 * s : 0;
    if (vis.tail > 0) {
      ctx.strokeStyle = shade(vis.body, -0.1); ctx.lineWidth = vis.tailW; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-7 * s, 1 * s);
      ctx.quadraticCurveTo(-7 * s - vis.tail * 0.6, 1 * s - Math.sin(legPhase) * 2, -7 * s - vis.tail, -2 * s); ctx.stroke();
    }
    ctx.fillStyle = shade(vis.body, -0.2);
    foot(-3 * s, 6 * s + swing, s); foot(3 * s, 6 * s - swing, s);
    ctx.fillStyle = vis.body; ctx.beginPath(); ctx.ellipse(0, 0, 8 * s, 6 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = vis.belly; ctx.beginPath(); ctx.ellipse(1.5 * s, 2 * s, 4.5 * s, 3.2 * s, 0, 0, 7); ctx.fill();
    const hx = 6.5 * s;
    ctx.fillStyle = vis.body; ctx.beginPath(); ctx.arc(hx, -1.5 * s, 4.6 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - 1 * s, -5 * s, vis.ear * 0.6 * s + 1, 0, 7); ctx.fill();
    ctx.fillStyle = '#f1c0c8'; ctx.beginPath(); ctx.arc(hx - 1 * s, -5 * s, vis.ear * 0.3 * s + 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#241c16'; ctx.beginPath(); ctx.arc(hx + 1.5 * s, -2 * s, 1.1 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2a22'; ctx.beginPath(); ctx.arc(hx + 4.2 * s, -1 * s, 1 * s, 0, 7); ctx.fill();
    if (carrying) { ctx.fillStyle = '#caa05a'; ctx.fillRect(-5 * s, -7 * s, 5 * s, 4 * s); ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1; ctx.strokeRect(-5 * s, -7 * s, 5 * s, 4 * s); }
    ctx.restore();
    if (u && u.founder) { ctx.fillStyle = '#ffd54f'; ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.fillText('♛', cx, cy - 12 * s - bob); }
  }
  function foot(x, y, s) { ctx.beginPath(); ctx.ellipse(x, y, 2 * s, 1.4 * s, 0, 0, 7); ctx.fill(); }

  // ---------- Overlays ----------
  function drawFx() {
    const now = state.env?.lived || 0;
    for (const f of state.fx || []) {
      const age = now - f.born; if (age < 0 || age > f.life) continue;
      const k = age / f.life;
      ctx.globalAlpha = 1 - k; glyph(f.text, f.x * TILE + TILE / 2, f.y * TILE + TILE / 2 - 14 - k * 22, 15); ctx.globalAlpha = 1;
    }
  }
  function drawHover(view) {
    if (view.hover && view.placing) {
      const { x, y } = view.hover;
      ctx.fillStyle = view.canPlace ? 'rgba(120,220,120,0.4)' : 'rgba(220,90,90,0.4)';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      glyph(BUILDINGS[view.placing].icon, x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.7);
    } else if (view.hover) {
      const { x, y } = view.hover; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
      ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    }
  }
  function drawDayNight() {
    const f = dayFraction(state);
    const dark = Math.max(0, Math.cos(f * Math.PI * 2)) * 0.42;
    if (dark > 0.01) { ctx.fillStyle = `rgba(12,20,50,${dark})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    const tw = Math.max(0, 1 - Math.abs(Math.abs(f - 0.5) - 0.25) * 8) * 0.16;
    if (tw > 0.01) { ctx.fillStyle = `rgba(255,150,60,${tw})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }
  function drawWeather(t) {
    const w = state.env?.weather;
    const tint = { rain: 'rgba(60,90,140,0.12)', fog: 'rgba(200,200,210,0.18)', snow: 'rgba(230,238,255,0.10)', storm: 'rgba(30,40,70,0.18)', humid: 'rgba(120,160,90,0.09)', drought: 'rgba(200,160,80,0.09)' }[w];
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    if (w === 'rain' || w === 'storm') {
      ctx.strokeStyle = 'rgba(170,200,235,0.4)'; ctx.lineWidth = 1;
      for (let i = 0; i < 140; i++) { const px = (i * 97 % canvas.width), py = ((i * 53 + t * 700) % canvas.height); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 3, py + 9); ctx.stroke(); }
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 90; i++) { const px = ((i * 131 + Math.sin(t + i) * 12) % canvas.width), py = ((i * 71 + t * 120) % canvas.height); ctx.beginPath(); ctx.arc(px, py, 1.4, 0, 7); ctx.fill(); }
    }
  }

  // ---------- helpers (use `g`, the current target) ----------
  function glyph(ch, px, py, size) { ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, px, py); }
  function dot(x, y, r, c) { if (c) g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  function ball(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  function blob(x, y, r, h, salt) { g.beginPath(); for (let a = 0; a < 7; a++) { const ang = a / 7 * Math.PI * 2, rr = r * (0.8 + rnd(h, salt * 10 + a) * 0.4); const xx = x + Math.cos(ang) * rr, yy = y + Math.sin(ang) * rr * 0.8; a ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.closePath(); g.fill(); }
  function poly(ox, oy, pts) { g.beginPath(); g.moveTo(ox + pts[0][0], oy + pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(ox + pts[i][0], oy + pts[i][1]); g.closePath(); g.fill(); }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  return { draw };
}

// Add an alpha to a "#rrggbb" or "rgb(...)" colour string.
function rgba(c, a) {
  if (c[0] === '#') { const n = c.slice(1); return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`; }
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  return c;
}
function hash(x, y) { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) >>> 0; return h; }
function rnd(h, salt) { let v = (h ^ (salt * 2654435761)) >>> 0; v = (v ^ (v >>> 15)) >>> 0; return (v % 10000) / 10000; }
function shade(hex, amt) {
  if (hex[0] !== '#') return hex;
  const c = hex.replace('#', '');
  let r = parseInt(c.slice(0, 2), 16), gg = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const f = amt < 0 ? (1 + amt) : 1, add = amt > 0 ? amt * 255 : 0;
  r = Math.max(0, Math.min(255, r * f + add)); gg = Math.max(0, Math.min(255, gg * f + add)); b = Math.max(0, Math.min(255, b * f + add));
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}
