// palette.js — a curated 64-colour palette. Every procedural texture & shade in
// the game quantises to THIS set, so the whole world shares one cohesive,
// art-directed look (like a hand-picked pixel-art ramp). Organised into hue
// families with light→dark ramps; `PAL` is the flat 64 for quantisation.
//
// The textures are generated on the CLIENT from code (see textures.js), so the
// server ships only this tiny palette + generators — all the rich per-pixel
// detail is synthesised on the player's machine, costing zero network bandwidth.

// Hue-family ramps (light → dark). Names are referenced by textures.js.
export const RAMPS = {
  grass:  ['#dCE8a0', '#b7d96a', '#8fc04a', '#6ba83a', '#4d8a2e', '#3a6e26', '#2c561f'],
  leaf:   ['#cfe89a', '#9bd067', '#6fb83f', '#4f9a2f', '#357a25', '#265c1c'],
  dirt:   ['#c8a36e', '#a9763b', '#8a5c2e', '#6f4a26', '#553820', '#3f2a18'],
  bark:   ['#9a7a52', '#7a5a36', '#5e472b', '#46341f', '#332617'],
  wood:   ['#e0c084', '#caa05a', '#a9743b', '#855a2d', '#624322'],
  sand:   ['#f1e3bd', '#e8d6a8', '#d9c08a', '#c8a86a', '#b08d52'],
  stone:  ['#d6dae0', '#b7bdc6', '#9aa0a6', '#7b828c', '#5c626b', '#42474f'],
  brick:  ['#cf7b5a', '#b85a3f', '#9a4530', '#7a3424', '#5a261a'],
  water:  ['#9fd6e8', '#5fb6d6', '#3f8fc0', '#2f6fa0', '#234f78', '#173552'],
  marsh:  ['#7fae7a', '#5a8e6a', '#456e52', '#33523f', '#24382c'],
  snow:   ['#ffffff', '#eef3fb', '#d8e2f0', '#bcc8da'],
  fur:    ['#f4e2bd', '#dcab68', '#c8824e', '#7a5230', '#3c3940'],
  flesh:  ['#f6c9c1', '#f3b4a8', '#e89a8d', '#d98a7c'],
  warm:   ['#ffd27a', '#ffb24a', '#f08a3a', '#d96a2a'],
  accent: ['#e8d24a', '#e87ea0', '#7e9cff', '#ff7eb6'],
  ink:    ['#6b6770', '#4a4550', '#332b28', '#241c16', '#100c0a'],
};

// Flat 64-colour palette (deduped union of the ramps, padded to 64) used for
// quantisation. Anything drawn can snap to the nearest entry for cohesion.
export const PAL = (() => {
  const seen = [];
  for (const ramp of Object.values(RAMPS)) for (const c of ramp) if (!seen.includes(c)) seen.push(c);
  // Pad/trim to exactly 64 (extra neutral mid-tones if short).
  const pad = ['#8a8590', '#aab0b8', '#cdd3da', '#766b5e', '#9b8a6a', '#5e6b52', '#b0c08a', '#e6efd2'];
  let i = 0;
  while (seen.length < 64) seen.push(pad[i++ % pad.length]);
  return seen.slice(0, 64);
})();

// Parse '#rrggbb' → [r,g,b].
export function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const _rgb = PAL.map(hex2rgb);

// Snap an arbitrary colour to the nearest palette entry (keeps everything on-ramp).
export function quantize(hex) {
  const [r, g, b] = hex2rgb(hex);
  let best = 0, bd = Infinity;
  for (let i = 0; i < _rgb.length; i++) {
    const [pr, pg, pb] = _rgb[i];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return PAL[best];
}

// Pick a ramp colour by 0..1 depth (0 = lightest). Handy for shading on-palette.
export function rampAt(name, t) {
  const r = RAMPS[name] || RAMPS.stone;
  return r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];
}
