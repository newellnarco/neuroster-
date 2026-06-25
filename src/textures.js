// textures.js — procedural, client-side material textures. At load we synthesise
// tileable patterns (fur, grass, bark, stone, brick, wood, leaves, sand, water…)
// onto small offscreen canvases using ONLY the 64-colour palette, then expose
// them as CanvasPatterns. Nothing is downloaded — the server ships this code and
// the player's machine renders all the per-pixel detail, so rich texture costs
// zero network bandwidth (exactly the "pass resolution & detail to the client"
// goal). Patterns are scaled back to logical units via setTransform so they stay
// crisp on HiDPI without tiling too large.
import { RAMPS } from './palette.js';

const S = 48; // logical pattern tile size (px)

// Small seeded RNG so textures are deterministic (stable across re-bakes).
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Make an offscreen canvas (HiDPI) and run a painter on its 2d context (in
// logical S×S coordinates). Returns the canvas.
function bake(dpr, paint) {
  const c = document.createElement('canvas');
  c.width = S * dpr; c.height = S * dpr;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  paint(x);
  return c;
}

// A short directional stroke (one "hair"/"blade"/"fibre").
function stroke(x, x0, y0, x1, y1, color, w) {
  x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round';
  x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
}
function speck(x, px, py, r, color) { x.fillStyle = color; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }

// ---- Material painters (draw one S×S logical tile) -------------------------
const MATERIALS = {
  // Fur: dense short strokes flowing down-right; transparent base so it overlays
  // a creature's body colour as texture.
  fur(x, seed) {
    const r = rng(seed); const ramp = RAMPS.fur;
    for (let i = 0; i < 230; i++) {
      const px = r() * S, py = r() * S, len = 2 + r() * 3, ang = 1.1 + (r() - 0.5) * 0.6;
      const c = ramp[(r() * ramp.length) | 0];
      x.globalAlpha = 0.12 + r() * 0.16;
      stroke(x, px, py, px + Math.cos(ang) * len, py + Math.sin(ang) * len, c, 0.8);
    }
    x.globalAlpha = 1;
  },
  feather(x, seed) {
    const r = rng(seed); const ramp = RAMPS.stone;
    for (let i = 0; i < 120; i++) {
      const px = r() * S, py = r() * S, len = 3 + r() * 4;
      x.globalAlpha = 0.10 + r() * 0.12;
      stroke(x, px, py, px - 1, py + len, ramp[(r() * ramp.length) | 0], 1.1);
    }
    x.globalAlpha = 1;
  },
  grass(x, seed) {
    const r = rng(seed); const ramp = RAMPS.grass;
    x.fillStyle = ramp[3]; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const px = r() * S, py = r() * S, h = 3 + r() * 5;
      const c = ramp[1 + ((r() * 4) | 0)];
      stroke(x, px, py, px + (r() - 0.5) * 2, py - h, c, 1);
    }
    for (let i = 0; i < 24; i++) speck(x, r() * S, r() * S, 0.7, ramp[5]);
  },
  dirt(x, seed) {
    const r = rng(seed); const ramp = RAMPS.dirt;
    x.fillStyle = ramp[2]; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 120; i++) speck(x, r() * S, r() * S, 0.6 + r() * 1.4, ramp[(r() * ramp.length) | 0]);
  },
  sand(x, seed) {
    const r = rng(seed); const ramp = RAMPS.sand;
    x.fillStyle = ramp[1]; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) speck(x, r() * S, r() * S, 0.5 + r() * 0.9, ramp[(r() * ramp.length) | 0]);
    for (let i = 0; i < 5; i++) { const y = r() * S; stroke(x, 0, y, S, y + (r() - 0.5) * 6, ramp[3], 0.6); }
  },
  stone(x, seed) {
    const r = rng(seed); const ramp = RAMPS.stone;
    x.fillStyle = ramp[2]; x.fillRect(0, 0, S, S);
    // mottled patches + a few cracks
    for (let i = 0; i < 20; i++) { x.globalAlpha = 0.5; speck(x, r() * S, r() * S, 3 + r() * 6, ramp[(r() * ramp.length) | 0]); }
    x.globalAlpha = 1;
    for (let i = 0; i < 4; i++) { const px = r() * S, py = r() * S; stroke(x, px, py, px + (r() - 0.5) * 16, py + (r() - 0.5) * 16, ramp[4], 0.8); }
  },
  brick(x, seed) {
    const r = rng(seed); const ramp = RAMPS.brick;
    x.fillStyle = ramp[3]; x.fillRect(0, 0, S, S); // mortar
    const bw = 16, bh = 8;
    for (let row = 0, y = 0; y < S; y += bh, row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let px = -bw; px < S + bw; px += bw) {
        x.fillStyle = ramp[1 + ((r() * 2) | 0)];
        x.fillRect(px + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
  },
  wood(x, seed) {
    const r = rng(seed); const ramp = RAMPS.wood;
    x.fillStyle = ramp[2]; x.fillRect(0, 0, S, S);
    // vertical planks with grain
    for (let px = 0; px < S; px += 12) {
      x.fillStyle = ramp[1 + ((r() * 3) | 0)]; x.fillRect(px, 0, 11, S);
      x.strokeStyle = ramp[4]; x.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) { const gx = px + 1 + r() * 9; stroke(x, gx, 0, gx + (r() - 0.5) * 2, S, ramp[4], 0.5); }
      x.globalAlpha = 1;
      x.fillStyle = ramp[4]; x.fillRect(px + 11, 0, 1, S); // seam
    }
  },
  bark(x, seed) {
    const r = rng(seed); const ramp = RAMPS.bark;
    x.fillStyle = ramp[2]; x.fillRect(0, 0, S, S);
    for (let px = 0; px < S; px += 5) {
      const c = ramp[(r() * ramp.length) | 0];
      x.strokeStyle = c; x.lineWidth = 2 + r() * 1.5; x.globalAlpha = 0.8;
      x.beginPath(); x.moveTo(px + (r() - 0.5) * 3, 0);
      for (let y = 0; y <= S; y += 8) x.lineTo(px + (r() - 0.5) * 4, y);
      x.stroke();
    }
    x.globalAlpha = 1;
  },
  leaf(x, seed) {
    const r = rng(seed); const ramp = RAMPS.leaf;
    x.fillStyle = ramp[3]; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      const px = r() * S, py = r() * S, a = r() * 7;
      x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = ramp[1 + ((r() * 4) | 0)];
      x.beginPath(); x.ellipse(0, 0, 2.6, 1.3, 0, 0, 7); x.fill(); x.restore();
    }
  },
  water(x, seed) {
    const r = rng(seed); const ramp = RAMPS.water;
    x.fillStyle = ramp[3]; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 6; i++) { const y = r() * S; x.strokeStyle = ramp[1]; x.globalAlpha = 0.3; stroke(x, 0, y, S, y + (r() - 0.5) * 4, ramp[1], 1.2); }
    x.globalAlpha = 1;
  },
  marsh(x, seed) {
    const r = rng(seed); const ramp = RAMPS.marsh;
    x.fillStyle = ramp[2]; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) speck(x, r() * S, r() * S, 0.6 + r() * 1.2, ramp[(r() * ramp.length) | 0]);
  },
};

// Build every material into a CanvasPattern (scaled to logical units). Call once
// with the main context. `dpr` keeps the source crisp on HiDPI.
export function buildTextures(ctx, dpr = 1) {
  const out = {};
  let seed = 1337;
  for (const [name, paint] of Object.entries(MATERIALS)) {
    const canvas = bake(dpr, (x) => paint(x, seed));
    seed += 9973;
    const pat = ctx.createPattern(canvas, 'repeat');
    // Map the HiDPI source back to logical S px so it tiles at the right scale.
    if (pat && pat.setTransform) { try { pat.setTransform(new DOMMatrix().scale(1 / dpr)); } catch {} }
    out[name] = pat;
  }
  return out;
}

export { S as TEX_SIZE };
