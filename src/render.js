// render.js — smooth, top-angle rendering: soft-blurred terrain, 2.5D receding
// trees/rocks/bushes, mine entrances, animated rodents/wheels/conveyors, weather.
import { TILE, GRID_W, GRID_H, NODE_TYPES, BUILDINGS, SPECIES, TUNNEL_TIERS, BRIDGE_TIERS, WALL_TIERS, FACTIONS, TRADE, COAT_COLORS } from './config.js';
import { terrainColor, idx, isSeen, getTile, TERRAIN, isFertile, wasteAt } from './world.js';
import { dayFraction, currentWeather, seasonKey } from './environment.js';

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
  // Logical world size (drawing coordinate space). The backing store is rendered
  // at devicePixelRatio for crisp, high-resolution output on retina/HiDPI screens;
  // all drawing stays in logical VW×VH units thanks to the ctx.scale below.
  const VW = GRID_W * TILE, VH = GRID_H * TILE;
  const DPR = Math.max(1, Math.min(3, Math.round((typeof window !== 'undefined' && window.devicePixelRatio) || 1)));
  canvas.width = VW * DPR; canvas.height = VH * DPR;
  ctx.scale(DPR, DPR);
  ctx.imageSmoothingEnabled = true;

  // Offscreen terrain buffer (also HiDPI), re-baked only when revealed area changes.
  const terr = document.createElement('canvas');
  terr.width = VW * DPR; terr.height = VH * DPR;
  const tg = terr.getContext('2d');
  tg.scale(DPR, DPR);
  let g = ctx;            // current drawing target for helpers
  let bakedSeen = -1;
  let bmap = new Map();   // "x,y" -> building, rebuilt each frame for adjacency
  let animT = 0;          // shared animation clock (seconds)

  function draw(now = 0) {
    const t = now / 1000; animT = t;
    const seenCount = countSeen();
    if (seenCount !== bakedSeen) { bakeTerrain(); bakedSeen = seenCount; }

    // crisp terrain blit (HiDPI source → logical size); feathered tile edges keep it smooth
    ctx.drawImage(terr, 0, 0, VW, VH);
    drawWaterShimmer(t);
    drawWaste();

    bmap.clear();
    for (const b of state.buildings) bmap.set(b.x + ',' + b.y, b);
    drawNodes(t);
    drawCamps(t);
    drawBuildings(t);
    drawBodies();
    drawRodents(t);
    drawCaravans();
    drawRescue(t);
    drawFx();
    drawHover(getView());
    drawDayNight();
    drawWeather(t);
    drawSeason(t);
    drawAmbient(t);
  }

  // Seasonal atmosphere: a gentle full-screen tint + signature drifting motes
  // (autumn leaves, winter snow, spring blossom petals) so the season is felt.
  function drawSeason(t) {
    const key = seasonKey(state);
    const W = VW, H = VH;
    const tint = { spring: 'rgba(150,210,140,0.05)', summer: 'rgba(255,224,130,0.05)', autumn: 'rgba(214,120,40,0.10)', winter: 'rgba(150,180,225,0.12)' }[key];
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H); }

    if (key === 'autumn') {
      const cols = ['#c8762e', '#b8531f', '#d89a3a', '#a8451c'];
      for (let i = 0; i < 26; i++) {
        const x = (i * 139 + Math.sin(t * 0.6 + i) * 42 + W) % W;
        const y = (i * 97 + t * 42) % H;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.4 + i);
        ctx.fillStyle = cols[i & 3]; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else if (key === 'winter') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 60; i++) {
        const x = (i * 131 + Math.sin(t * 0.8 + i) * 14 + W) % W;
        const y = (i * 71 + t * 60) % H;
        ctx.beginPath(); ctx.arc(x, y, 1.3 + (i % 3) * 0.4, 0, 7); ctx.fill();
      }
    } else if (key === 'spring') {
      for (let i = 0; i < 20; i++) {
        const x = (i * 151 + Math.sin(t * 0.9 + i) * 30 + W) % W;
        const y = (i * 101 + t * 28) % H;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t + i);
        ctx.fillStyle = i % 2 ? 'rgba(255,190,210,0.8)' : 'rgba(255,225,235,0.75)';
        ctx.beginPath(); ctx.ellipse(0, 0, 3, 1.6, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
    }
  }

  // Drifting fireflies at night; soft pollen motes by day.
  function drawAmbient(t) {
    const f = dayFraction(state);
    const night = f < 0.25 || f > 0.75;
    const n = 22;
    for (let i = 0; i < n; i++) {
      const bx = (i * 137.5) % VW;
      const by = (i * 89.3) % VH;
      const dx = Math.sin(t * 0.6 + i) * 14, dy = Math.cos(t * 0.5 + i * 1.3) * 10;
      const px = (bx + dx + VW) % VW, py = (by + dy + VH) % VH;
      if (night) {
        const glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + i));
        ctx.fillStyle = `rgba(190,230,120,${glow * 0.5})`;
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, 7); ctx.fill();
      } else if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,250,200,0.18)';
        ctx.beginPath(); ctx.arc(px, py, 1.1, 0, 7); ctx.fill();
      }
    }
  }

  function countSeen() { let c = 0; const s = state.world.seen; for (let i = 0; i < s.length; i++) c += s[i]; return c; }

  // ---------- Terrain (baked) ----------
  function bakeTerrain() {
    g = tg;
    tg.clearRect(0, 0, VW, VH);
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
    const sway = Math.sin(animT * 1.1 + x * 0.12 + y * 0.05) * 1.3 * sc; // wind sway (canopy only)
    ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 1.5 * sc, y, 3 * sc, 8 * sc);          // trunk
    const r = 7 * sc, cxp = x + sway, cyp = y - 2 * sc;
    ctx.fillStyle = '#2f6d2f'; ball(cxp, cyp, r); ball(cxp - r * 0.6, cyp + 3 * sc, r * 0.8); ball(cxp + r * 0.6, cyp + 3 * sc, r * 0.8);
    ctx.fillStyle = 'rgba(150,210,120,0.55)'; ball(cxp - r * 0.3, cyp - r * 0.5, r * 0.5);  // top-left highlight
    ctx.fillStyle = 'rgba(0,40,0,0.18)'; ball(cxp + r * 0.4, cyp + r * 0.3, r * 0.5);       // bottom-right shade
  }
  function drawBoulder(x, y, sc) {
    const r = 7 * sc;
    ctx.fillStyle = '#8a939b'; ball(x, y, r);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ball(x - r * 0.3, y - r * 0.35, r * 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ball(x + r * 0.35, y + r * 0.3, r * 0.45);
  }
  function drawBush(x, y, sc) {
    const sway = Math.sin(animT * 1.4 + x * 0.2) * 0.8 * sc;
    const r = 6 * sc; x += sway;
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
      if (b.underConstruction) { drawSite(cx, cy, b, t); continue; }
      if (b.type === 'wheel') { drawWheel(cx, cy - 3, t, b); continue; }
      if (b.type === 'conveyor' || b.type === 'conveyorPlastic' || b.type === 'conveyorMetal') { drawConveyor(cx, cy - 2, t, b); continue; }
      if (b.type === 'mine') { drawMine(cx, cy, b); continue; }
      if (b.type === 'bridge') { drawBridge(cx, cy, b); continue; }
      if (b.type === 'wall') { drawWall(cx, cy, b); continue; }
      if (BUILDINGS[b.type].tunnel) { drawTunnel(cx, cy, b); continue; }
      if (BUILDINGS[b.type].townhall) { drawTownhall(cx, cy, b); continue; }
      ctx.fillStyle = 'rgba(70,55,40,0.7)'; roundRect(b.x * TILE + 4, b.y * TILE + 10, TILE - 8, TILE - 11, 6); ctx.fill();
      ctx.fillStyle = '#bcab8b'; roundRect(b.x * TILE + 4, b.y * TILE + 6, TILE - 8, TILE - 11, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.20)'; roundRect(b.x * TILE + 4, b.y * TILE + 6, TILE - 8, 3, 3); ctx.fill();
      glyph(BUILDINGS[b.type].icon, cx, cy - 3, TILE * 0.78);
      if (BUILDINGS[b.type].tower) glyph(b.mode === 'defend' ? '🗡️' : '👁️', cx + 9, cy - 9, 11); // stance badge
      animateBuilding(cx, cy, b);
      // dirty / degraded burrow: buzzing flies and a grime tint
      if (BUILDINGS[b.type].breed && (b.dirt || 0) > 18) {
        if (b.degraded) { ctx.fillStyle = 'rgba(80,60,20,0.28)'; ctx.fillRect(b.x * TILE + 2, b.y * TILE + 2, TILE - 4, TILE - 4); }
        ctx.fillStyle = '#2c2418';
        for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.1; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 9, cy - 8 + Math.sin(a * 1.3) * 5, 1.1, 0, 7); ctx.fill(); }
      }
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
  const isBelt = (nb) => nb.type === 'conveyor' || nb.type === 'conveyorPlastic' || nb.type === 'conveyorMetal';
  const beltColor = (b) => b.type === 'conveyorMetal' ? '#6b7178' : b.type === 'conveyorPlastic' ? '#5a8fc2' : '#7a5a36';
  const beltRoller = (b) => b.type === 'conveyorMetal' ? '#aeb4bb' : b.type === 'conveyorPlastic' ? '#9fc4e8' : '#caa05a';
  const isFacility = (nb) => ['storage', 'burrow', 'townhall'].includes(nb.type);

  // Covered tunnel section: colour by tier (wood/iron/steel) with an HP bar.
  function drawTunnel(cx, cy, b) {
    drawUpgradeBar(b);
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

  // A crenellated wall block, tier-coloured (wood/stone/steel), with an HP bar.
  function drawWall(cx, cy, b) {
    drawUpgradeBar(b);
    const tier = WALL_TIERS[b.tier || 0];
    drawConnectors(cx, cy, b, shade(tier.color, -0.08), (nb) => nb.type === 'wall');
    const w = TILE - 8, h = TILE * 0.6, x0 = cx - w / 2, y0 = cy - h / 2 + 2;
    ctx.fillStyle = shade(tier.color, -0.2); roundRect(x0, y0 + 3, w, h, 3); ctx.fill();   // shadow
    ctx.fillStyle = tier.color; roundRect(x0, y0, w, h, 3); ctx.fill();                     // body
    ctx.fillStyle = shade(tier.color, 0.12);                                                // crenellations
    const merlons = 3, mw = w / (merlons * 2 - 1);
    for (let i = 0; i < merlons; i++) ctx.fillRect(x0 + i * mw * 2, y0 - 3, mw, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;                                 // brick lines
    ctx.beginPath(); ctx.moveTo(x0, y0 + h * 0.5); ctx.lineTo(x0 + w, y0 + h * 0.5); ctx.stroke();
    const frac = Math.max(0, (b.hp ?? tier.hp) / tier.hp);
    if (frac < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x0, y0 - 8, w, 3);
      ctx.fillStyle = frac > 0.5 ? '#7cdc6a' : frac > 0.25 ? '#e6c34d' : '#e06b6b'; ctx.fillRect(x0, y0 - 8, w * frac, 3);
    }
  }

  // A bridge deck spanning the tile (planks + rails), tier-coloured, with an HP bar.
  function drawBridge(cx, cy, b) {
    drawUpgradeBar(b);
    const tier = BRIDGE_TIERS[b.tier || 0];
    drawConnectors(cx, cy, b, shade(tier.color, -0.05), (nb) => isTunnel(nb) || isBelt(nb) || isFacility(nb) || nb.type === 'bridge');
    const w = TILE - 4, x0 = cx - w / 2, y0 = cy - 5;
    ctx.fillStyle = shade(tier.color, -0.18); roundRect(x0, y0 + 6, w, 7, 2); ctx.fill(); // under-beam shadow
    ctx.fillStyle = tier.color; roundRect(x0, y0, w, 10, 3); ctx.fill();                   // deck
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;                               // planks
    for (let i = 1; i < 6; i++) { const px = x0 + (w / 6) * i; ctx.beginPath(); ctx.moveTo(px, y0 + 1); ctx.lineTo(px, y0 + 9); ctx.stroke(); }
    ctx.strokeStyle = shade(tier.color, 0.18); ctx.lineWidth = 2;                          // hand-rail + posts
    ctx.beginPath(); ctx.moveTo(x0, y0 - 2); ctx.lineTo(x0 + w, y0 - 2); ctx.stroke();
    for (let i = 0; i <= 4; i++) { const px = x0 + (w / 4) * i; ctx.beginPath(); ctx.moveTo(px, y0 - 2); ctx.lineTo(px, y0 + 2); ctx.stroke(); }
    const frac = Math.max(0, (b.hp ?? tier.hp) / tier.hp);
    if (frac < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x0, y0 - 7, w, 3);
      ctx.fillStyle = frac > 0.5 ? '#7cdc6a' : frac > 0.25 ? '#e6c34d' : '#e06b6b'; ctx.fillRect(x0, y0 - 7, w * frac, 3);
    }
  }

  // Living touches on working buildings: chimney smoke, swaying crops, water.
  function animateBuilding(cx, cy, b) {
    const type = b.type;
    if (type === 'steelworks' || type === 'smelter') {
      for (let i = 0; i < 3; i++) {
        const p = (animT * 0.5 + i / 3) % 1;
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.fillStyle = '#cfd2d6';
        ctx.beginPath(); ctx.arc(cx + 5 + Math.sin(animT * 2 + i) * 2, cy - 8 - p * 16, 2 + p * 3, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (type === 'farm' || type === 'wheatfield') {
      ctx.strokeStyle = type === 'wheatfield' ? '#d9b44a' : '#7cb342'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const sx = cx - 9 + i * 6, sw = Math.sin(animT * 1.6 + i) * 1.6;
        ctx.beginPath(); ctx.moveTo(sx, cy + 8); ctx.lineTo(sx + sw, cy + 1); ctx.stroke();
        if (type === 'wheatfield') { ctx.fillStyle = '#e6c34d'; ctx.beginPath(); ctx.arc(sx + sw, cy, 1.3, 0, 7); ctx.fill(); }
      }
    } else if (type === 'well' || type === 'dam') {
      const p = (animT * 1.2) % 1;
      ctx.fillStyle = `rgba(120,180,230,${0.7 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(cx, cy + 2 - p * 6, 1.6, 0, 7); ctx.fill();
    } else if (type === 'lab') {
      ctx.fillStyle = `rgba(126,156,255,${0.3 + 0.2 * Math.sin(animT * 4)})`;
      ctx.beginPath(); ctx.arc(cx + 5, cy - 6, 2, 0, 7); ctx.fill();
    }
  }

  // A building under construction: scaffolding, a hammer, and a progress bar.
  function drawSite(cx, cy, b, t) {
    const x0 = b.x * TILE + 5, y0 = b.y * TILE + 7, w = TILE - 10, h = TILE - 12;
    ctx.fillStyle = 'rgba(180,160,120,0.35)'; roundRect(x0, y0, w, h, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,50,0.8)'; ctx.lineWidth = 1.5;          // scaffold
    ctx.strokeRect(x0, y0, w, h);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0 + h); ctx.moveTo(x0 + w, y0); ctx.lineTo(x0, y0 + h); ctx.stroke();
    const bob = Math.sin(t * 6 + b.id) * 2;
    glyph('🔨', cx, cy - 2 + bob, 13);
    const frac = Math.min(1, (b.progress || 0) / b.buildTime);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(b.x * TILE + 4, b.y * TILE + TILE - 5, TILE - 8, 3);
    ctx.fillStyle = '#f0c454'; ctx.fillRect(b.x * TILE + 4, b.y * TILE + TILE - 5, (TILE - 8) * frac, 3);
  }
  // Progress bar for an in-progress upgrade (drawn over a working building).
  function drawUpgradeBar(b) {
    if (!b.upgrading) return;
    const frac = Math.min(1, b.upgrading.progress / b.upgrading.time);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(b.x * TILE + 4, b.y * TILE + 2, TILE - 8, 3);
    ctx.fillStyle = '#7e9cff'; ctx.fillRect(b.x * TILE + 4, b.y * TILE + 2, (TILE - 8) * frac, 3);
  }

  // Town Hall: a civic building that grows grander (and more gilded) by tier.
  function drawTownhall(cx, cy, b) {
    drawUpgradeBar(b);
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
    const col = beltColor(b), roller = beltRoller(b);
    const speed = b.type === 'conveyorMetal' ? 1.8 : b.type === 'conveyorPlastic' ? 1.3 : 1;
    drawConnectors(cx, cy, b, col, (nb) => isBelt(nb) || isFacility(nb));
    const w = TILE - 4, h = TILE * 0.42, x0 = cx - w / 2, y0 = cy - h / 2;
    const flow = (b._flow ? 1 : 0.25) * speed;
    ctx.fillStyle = col; roundRect(x0, y0, w, h, 4); ctx.fill();
    ctx.fillStyle = roller;
    ctx.beginPath(); ctx.arc(x0 + 4, cy, h / 2 - 1, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + w - 4, cy, h / 2 - 1, 0, 7); ctx.fill();
    const gap = 7, off = (t * 26 * flow) % gap;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    for (let sx = x0 + 4 - gap; sx < x0 + w; sx += gap) { const ax = sx + off; ctx.beginPath(); ctx.moveTo(ax, cy - 3); ctx.lineTo(ax + 3, cy); ctx.lineTo(ax, cy + 3); ctx.stroke(); }
    if (b._flow) { const p = (t * 0.5) % 1; dot(x0 + 4 + p * (w - 8), cy - h / 2 - 2, 2.5, roller); }
  }

  // ---------- Neighbouring factions: camps + caravans ----------
  // Each faction has a camp at the map's edge. Colour reflects standing
  // (allied → green, hostile → red, else neutral) so the world reads at a glance.
  function drawCamps(t) {
    const facs = state.factions || {};
    for (const [id, fs] of Object.entries(facs)) {
      const camp = fs.camp; if (!camp || !isSeen(state.world, camp.x, camp.y)) continue;
      const def = FACTIONS[id]; if (!def) continue;
      const cx = camp.x * TILE + TILE / 2, cy = camp.y * TILE + TILE / 2;
      const st = fs.standing || 0;
      const tone = st >= TRADE.aidStanding ? '#7cdc6a' : st <= -30 ? '#e06b6b' : '#d9b46a';
      // ground + two little tents
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.30, 12, 5, 0, 0, 7); ctx.fill();
      drawTent(cx - 6, cy + 3, 9, shade(tone, -0.1));
      drawTent(cx + 6, cy + 4, 7, shade(tone, -0.2));
      // a tiny campfire flicker between them
      const fl = 0.5 + 0.5 * Math.sin(t * 6 + camp.x);
      ctx.fillStyle = `rgba(255,${150 + fl * 60 | 0},40,0.9)`;
      ctx.beginPath(); ctx.arc(cx, cy + 6, 1.6 + fl, 0, 7); ctx.fill();
      // faction banner: icon on a standing-coloured pennant
      ctx.fillStyle = tone; roundRect(cx - 9, cy - TILE * 0.42, 18, 11, 3); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(cx - 9, cy - TILE * 0.42 + 8, 18, 3, 2); ctx.fill();
      glyph(def.icon, cx, cy - TILE * 0.42 + 5, 12);
      // hoard-envy spark / raid mood
      if ((fs.hoard || 0) > 0) { glyph('💢', cx + 11, cy - TILE * 0.40, 11); }
    }
  }
  function drawTent(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y - r * 1.4); ctx.lineTo(x + r, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.4, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x, y); ctx.stroke();
  }

  // Caravans visibly travel camp → colony: friendly deliveries (🎁) and raid
  // war parties (the faction icon, tinted red). They interpolate by age.
  function drawCaravans() {
    const now = state.env?.lived || 0;
    for (const c of state.caravans || []) {
      const p = Math.max(0, Math.min(1, (now - c.born) / c.life));
      const x = c.fromX + (c.toX - c.fromX) * p, y = c.fromY + (c.toY - c.fromY) * p;
      if (!isSeen(state.world, Math.round(x), Math.round(y))) continue;
      const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2;
      // dotted trail back toward the camp
      ctx.fillStyle = c.kind === 'raid' ? 'rgba(224,107,107,0.35)' : 'rgba(230,200,120,0.4)';
      for (let i = 1; i <= 3; i++) {
        const tp = Math.max(0, p - i * 0.05);
        ctx.beginPath(); ctx.arc(c.fromX * TILE + TILE / 2 + (c.toX - c.fromX) * TILE * tp,
          c.fromY * TILE + TILE / 2 + (c.toY - c.fromY) * TILE * tp, 1.6, 0, 7); ctx.fill();
      }
      const bob = Math.sin(now * 6 + c.id) * 1.4;
      ctx.fillStyle = c.kind === 'raid' ? 'rgba(150,30,30,0.55)' : 'rgba(120,90,40,0.5)';
      ctx.beginPath(); ctx.ellipse(px, py + 6, 8, 3, 0, 0, 7); ctx.fill();
      glyph(FACTIONS[c.fac]?.icon || '🐾', px, py - 1 + bob, 14);
      glyph(c.kind === 'raid' ? '⚔️' : c.kind === 'aid' ? '🆘' : '🎁', px + 9, py - 6 + bob, 11);
    }
  }

  // A lost/hurt animal waiting at the edge to be taken in (click to rescue).
  function drawRescue(t) {
    const r = state.rescue; if (!r || !isSeen(state.world, r.x, r.y)) return;
    const cx = r.x * TILE + TILE / 2, cy = r.y * TILE + TILE / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.strokeStyle = `rgba(240,130,150,${0.35 + 0.45 * pulse})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 12 + pulse * 4, 0, 7); ctx.stroke();
    drawCreatureRaw(cx, cy, 1, VIS[r.species] || VIS.hamster, t * 6, false, false, false, t, null);
    glyph('💗', cx + 9, cy - 12, 13);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(cx - 27, cy + 9, 54, 11, 3); ctx.fill();
    ctx.fillStyle = '#ffd9e0'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('click: take in', cx, cy + 14.5);
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
      drawCreatureRaw(cx, cy, u._face || 1, coatFor(u), t * 12 + u.id * 1.7, moved > 0.0015 && u.phase !== 'sleep', u.phase === 'sleep', !!u.carrying, t, u);
      if (u.sick) glyph('🤢', cx + 9, cy - 11, 12); // wet tail
      if (view.selUnit === u.id) { ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, (VIS[u.species]?.size || 15) + 3, 0, 7); ctx.stroke(); }
    }
  }

  // Each hamster wears its own coat (chosen for the founder, inherited by
  // offspring); other species use their defaults.
  function coatFor(u) {
    const coat = u && (u.coat || (u.founder ? state.founder?.coat : null));
    if (u && u.species === 'hamster' && coat) {
      const c = COAT_COLORS[coat.color] || COAT_COLORS.golden;
      const belly = coat.pattern === 'solid' ? c.body : c.belly;
      const patch = coat.pattern === 'patched' ? (isLight(c.body) ? '#5a5560' : '#f0ead8') : null;
      return { ...VIS.hamster, body: c.body, belly, patch };
    }
    return VIS[u.species] || VIS.hamster;
  }

  // A plush, soft-3D radial gradient that gives a rounded body "volume": lit from
  // the upper-left, shading to a darker lower-right edge (ambient occlusion).
  // Cached by colour+radius — gradient coords are in the (translated) local space,
  // so the same object is reusable for every creature of that colour/size.
  const _gradCache = new Map();
  function plushGrad(color, r) {
    const key = color + '|' + r.toFixed(2);
    let gr = _gradCache.get(key);
    if (!gr) {
      gr = ctx.createRadialGradient(-r * 0.42, -r * 0.5, r * 0.12, 0, 0, r * 1.18);
      gr.addColorStop(0, shade(color, 0.34));
      gr.addColorStop(0.55, color);
      gr.addColorStop(1, shade(color, -0.26));
      _gradCache.set(key, gr);
    }
    return gr;
  }

  function drawCreatureRaw(cx, cy, face, vis, legPhase, walking, sleeping, carrying, t = 0, u = null) {
    const s = vis.size / 15;
    const bob = walking ? Math.abs(Math.sin(legPhase)) * 1.6 : Math.sin((t || 0) * 2 + (u ? u.id : 0)) * 0.5;
    // Soft, blurred contact shadow (stacked fading ellipses → an ambient-occlusion pool).
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + i * 0.045})`;
      ctx.beginPath(); ctx.ellipse(cx, cy + 7.5 * s, (6 + i * 1.6) * s, (2.2 + i * 0.7) * s, 0, 0, 7); ctx.fill();
    }
    ctx.save(); ctx.translate(cx, cy - bob); ctx.scale(face, 1);

    if (sleeping) {
      ctx.save(); ctx.translate(2 * s, 2 * s);
      ctx.fillStyle = plushGrad(vis.body, 8 * s); ctx.beginPath(); ctx.ellipse(0, 0, 9 * s, 6 * s, 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = vis.belly; ctx.beginPath(); ctx.arc(4 * s, 2 * s, 3 * s, 0, 7); ctx.fill();
      softHighlight(-3 * s, -1 * s, 4 * s);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '9px serif'; ctx.textAlign = 'center';
      ctx.fillText('z', cx + 8, cy - 8 - (((t || 0) % 2) / 2) * 6);
      return;
    }
    const swing = walking ? Math.sin(legPhase) * 3 * s : 0;
    if (vis.tail > 0) {
      ctx.strokeStyle = shade(vis.body, -0.12); ctx.lineWidth = vis.tailW; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-7 * s, 1 * s);
      ctx.quadraticCurveTo(-7 * s - vis.tail * 0.6, 1 * s - Math.sin(legPhase) * 2, -7 * s - vis.tail, -2 * s); ctx.stroke();
    }
    // little rounded feet
    ctx.fillStyle = shade(vis.body, -0.24);
    foot(-3 * s, 6.4 * s + swing, s); foot(3 * s, 6.4 * s - swing, s);

    // plush body (rounder), with belly, optional coat patch, and a glossy highlight
    ctx.fillStyle = plushGrad(vis.body, 8 * s);
    ctx.beginPath(); ctx.ellipse(0, 0, 8.2 * s, 6.4 * s, 0, 0, 7); ctx.fill();
    if (vis.patch) { ctx.fillStyle = vis.patch; ctx.beginPath(); ctx.ellipse(-2 * s, -1.5 * s, 3.4 * s, 2.6 * s, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = vis.belly; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.ellipse(1.6 * s, 2.2 * s, 4.6 * s, 3.4 * s, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    softHighlight(-3 * s, -2.4 * s, 4.2 * s);

    const hx = 6.6 * s;
    const sniff = walking ? 0 : Math.sin((t || 0) * 3 + (u ? u.id : 0)) * 0.6 * s;
    // ears (behind head), with an occasional twitch
    const twitch = Math.sin((t || 0) * 12 + (u ? u.id * 2 : 0)) > 0.96 ? -1 * s : 0;
    ctx.fillStyle = shade(vis.body, -0.05);
    ctx.beginPath(); ctx.arc(hx - 1 * s + sniff, -5.2 * s + twitch, vis.ear * 0.62 * s + 1, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3c2cb'; ctx.beginPath(); ctx.arc(hx - 1 * s + sniff, -5.2 * s + twitch, vis.ear * 0.32 * s + 0.5, 0, 7); ctx.fill();
    // plush head
    ctx.save(); ctx.translate(hx + sniff, -1.6 * s);
    ctx.fillStyle = plushGrad(vis.body, 4.8 * s); ctx.beginPath(); ctx.arc(0, 0, 4.8 * s, 0, 7); ctx.fill();
    softHighlight(-1.7 * s, -1.8 * s, 2.3 * s);
    // cheek
    ctx.fillStyle = 'rgba(243,180,170,0.35)'; ctx.beginPath(); ctx.arc(-1.2 * s, 1.6 * s, 1.5 * s, 0, 7); ctx.fill();
    // snout + nose
    ctx.fillStyle = '#2a201a'; ctx.beginPath(); ctx.arc(4.2 * s, 0.4 * s, 1 * s, 0, 7); ctx.fill();
    // big glossy eye with a catchlight
    glossyEye(1.8 * s, -0.4 * s, 1.4 * s);
    ctx.restore();

    if (carrying) {
      ctx.fillStyle = '#caa05a'; rrect(-5.5 * s, -7.5 * s, 5.5 * s, 4.5 * s, 1.4 * s); ctx.fill();
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    if (u && u.founder) { ctx.fillStyle = '#ffd54f'; ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.fillText('♛', cx, cy - 13 * s - bob); }
  }
  function foot(x, y, s) { ctx.beginPath(); ctx.ellipse(x, y, 2 * s, 1.4 * s, 0, 0, 7); ctx.fill(); }
  // A soft white specular highlight (radial → transparent) for a glossy plush sheen.
  function softHighlight(x, y, r) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.34)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, 7); ctx.fill();
  }
  // A big rounded eye with a white catchlight — reads as cute & modern.
  function glossyEye(x, y, r) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#241c16'; ctx.beginPath(); ctx.arc(x + r * 0.18, y, r * 0.72, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.35, r * 0.3, 0, 7); ctx.fill();
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

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
    if (dark > 0.01) { ctx.fillStyle = `rgba(12,20,50,${dark})`; ctx.fillRect(0, 0, VW, VH); }
    const tw = Math.max(0, 1 - Math.abs(Math.abs(f - 0.5) - 0.25) * 8) * 0.16;
    if (tw > 0.01) { ctx.fillStyle = `rgba(255,150,60,${tw})`; ctx.fillRect(0, 0, VW, VH); }
  }
  function drawWeather(t) {
    const w = state.env?.weather;
    const tint = { rain: 'rgba(60,90,140,0.12)', fog: 'rgba(200,200,210,0.18)', snow: 'rgba(230,238,255,0.10)', storm: 'rgba(30,40,70,0.18)', humid: 'rgba(120,160,90,0.09)', drought: 'rgba(200,160,80,0.09)' }[w];
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, VW, VH); }
    if (w === 'rain' || w === 'storm') {
      ctx.strokeStyle = 'rgba(170,200,235,0.4)'; ctx.lineWidth = 1;
      for (let i = 0; i < 140; i++) { const px = (i * 97 % VW), py = ((i * 53 + t * 700) % VH); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 3, py + 9); ctx.stroke(); }
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 90; i++) { const px = ((i * 131 + Math.sin(t + i) * 12) % VW), py = ((i * 71 + t * 120) % VH); ctx.beginPath(); ctx.arc(px, py, 1.4, 0, 7); ctx.fill(); }
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
function isLight(hex) { const c = hex.replace('#', ''); const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16); return (r * 0.299 + g * 0.587 + b * 0.114) > 150; }
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
