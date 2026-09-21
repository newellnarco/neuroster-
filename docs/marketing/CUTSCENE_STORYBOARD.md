# Neuroster — cut-scene storyboard & production spec

A written spec of the four hero cut-scenes in the marketing trailer, detailed
enough to rebuild each one in a video tool (After Effects, Blender, or an AI
video generator) instead of the in-repo HTML/canvas renderer
([`tools/marketing_video/cutscene.html`](../../tools/marketing_video/README.md)).
Reference renders of all four live alongside the trailer (`cut_*.mp4`); the
canvas renderer is the ground truth for timing and layout.

**Shared format** — 1280×720 (render at 4K for production), ~24–30 fps.
Flat, soft, rounded "storybook" shapes; no outlines; everything sits on
layered parallax hills. A soft radial vignette (~40% black at corners) keeps
the type readable. Style keywords for AI generation: *flat vector storybook
illustration, soft rounded shapes, cozy children's-book palette, gentle
parallax, no text* (type is composited separately).

**Shared typography** (composited over every scene, centered, ~42% from top):

| element | spec |
| --- | --- |
| Eyebrow | 16px caps, letterspacing 0.42em, bold, accent color, fades up at 0.3s |
| Title | Georgia/serif bold ≈88px, cream `#f6ecd8`, last word in the accent color; words rise in one by one (40px rise + slight 2° rotation settling), starting 0.55s, one word every 0.16s |
| Rule | 2px gradient hairline growing to 380px wide, ~0.25s after the last word |
| Subtitle | italic serif 30px, `#e8dcc2`, fades up ~0.45s after the last word |
| Shadows | all type carries a soft dark drop shadow so it reads over any scene |

**Timing note** — scenes are recorded ~7–10s and trimmed to fit narration
(intro ≈6.7s, build ≈3.9s, defend ≈3.5s, outro ≈6.1s in the current cut), with
0.35s fade-in/out to black on every scene.

---

## 1 · `cut_intro` — Dawn meadow (≈6.7s)

**Copy** — eyebrow `A COLONY SIM` · title `Neuroster` (accented) ·
subtitle `A hamster colony world-builder` · accent `#ffd27d` (warm amber).
**VO** — "This is Neuroster — a world-building colony game where all of your
workers happen to be hamsters."

**Scene** — sunrise over rolling meadow. Sky graded deep violet `#2c2140` at
top through burnt orange to warm gold `#f0b45e` at the horizon. A large cream
sun (`#ffe9b8`, ~46px at 72% right / 62% down) **rises slowly** through the
shot (~170px over 6s) with a big soft glow. Three parallax hill bands in warm
browns (`#7a5a3a` → `#8c6a42` → `#a07a4c`, back to front) drift at different
speeds. Seven simple round-canopy trees (dark trunks `#5c4630`, moss green
canopies `#4c6b35`) scattered on the hills.

**Action beats**
- 0.0s — scene fades in; sun already glowing low.
- 1.2–2.6s — at 30% left on the front hill, a **hamster pops up out of a dirt
  burrow mound** (brown mound `#6b4c2e` with a dark hole): round amber body
  `#d9a05e`, cream belly `#f2dbb8`, round ears, bead eyes with catchlights,
  tiny nose, four whiskers. It rises ~26px, then idles and **blinks**
  occasionally.
- Throughout — ~26 tiny cream seeds/motes drift slowly left-to-right across
  the sky, bobbing gently.

---

## 2 · `cut_build` — A town raising itself (≈3.9s)

**Copy** — eyebrow `DIG · HAUL · CRAFT` · title `Build. Automate. Thrive.`
("Thrive." accented) · subtitle `From first burrow to bustling town` ·
accent `#b7f28e` (leaf green).
**VO** — "Then you build, you automate, and you thrive."

**Scene** — bright day. Sky `#8fc4e8` fading to warm cream at the horizon;
3–4 puffy white clouds drift right slowly. Three green parallax hill bands
(`#79a052` → `#8fb45e` → `#a3c46c`). A wooden **windmill** at 82% right
(tapered brown tower, four cream blades **rotating** ~0.9 rad/s).

**Action beats**
- From 0.7s, every ~0.8s — six little houses (tan walls `#c8a06a`, terracotta
  roofs `#8a4f34`) **pop into existence** one at a time across the hills, each
  with a squash-and-stretch overshoot (~22%) and a burst of **dust puffs** that
  expand and fade; the window lights up warm once the house settles.
- Throughout — a **hamster hauler** (slightly darker fur `#b98a55`) walks
  left-to-right across the very front, carrying a wooden plank on its back
  (~65 px/s; loops off-screen).

---

## 3 · `cut_defend` — Storm watch (≈3.5s)

**Copy** — eyebrow `HOLD THE LINE` · title `The wild is watching`
("watching" accented) · subtitle `Defend what you dig` · accent `#ffab91`
(ember salmon).
**VO** — "But out here, the wild is always watching." *(plays over the
following gameplay scene; this card is a quick stinger)*

**Scene** — stormy night. Sky graded near-black navy `#0b0d1e` →
`#171a30` → dark plum `#25182a`. A pale moon (`#e8ecff`, ~38px, 22% left /
22% down) with craters and a tight soft glow; 5 lumpy dark cloud banks
(`rgba(16,18,38,.75)`) **scud past quickly** at different speeds, crossing
the moon. Black silhouette forest (big round-canopy trees, near-black
`#0c0a16`) along the mid hills; near-black front hills.

**Action beats**
- Roughly every ~4s (once per stinger) — a **lightning flash**: 1–2 frame
  full-frame white wash at ~60–75% opacity.
- Two pairs of **owl eyes** (glowing gold `#ffd76e` dots with dark pupils)
  sit deep in the treeline (62% and 87% right), **blinking** out of sync.
- Bottom-left — a small wooden **watchtower** silhouette with a **lantern**
  swinging gently on a pole (warm glow pulsing), and a guard hamster
  silhouette on the platform.
- Throughout — steady diagonal **rain streaks** (thin, ~35% opacity blue-grey)
  falling fast.

---

## 4 · `cut_outro` — Starlit night (≈6.1s)

**Copy** — eyebrow `PLAY IT` · title `Neuroster` (accented) · subtitle
`Your colony. Your world. Start digging.` · accent `#cfc4ff` (moonlit lilac).
**VO** — "Neuroster. It's your colony, and your world — so grab a shovel, and
start digging."

**Scene** — calm starry night over the sleeping colony. Sky deep indigo
`#0d0a24` → `#1c1436` → violet `#31204a`. ~90 stars **twinkling** at
different rates; a big cream **moon** (`#f7ecd2`, ~42px) upper right with
craters and soft glow. One **shooting star** streaks down-left across the top
once (~1s, thin white gradient trail). Two indigo parallax hill bands
(`#1a1230`, `#241940`).

**Action beats**
- The town sleeps mid-frame: five house silhouettes (walls `#332457`, roofs
  `#1e1538`) with **warm windows flickering** like candlelight; the windmill
  turns very slowly at 88% right.
- ~16 **fireflies** (soft yellow-green glows) wander the lower third, pulsing
  bright and dim.
- Bottom-left — a **stargazing hamster silhouette** (dusky purple `#3a2b55`)
  sits on the front hill facing the sky, blinking now and then.

---

## Rebuild notes

- **Motion feel**: everything eases (no linear moves); pops use a single
  overshoot; ambient loops (clouds, fireflies, blades, rain) never sync with
  each other.
- **The hamster** is the mascot across all four scenes: a circle-based body
  (2:1.7 ellipse), round ears with inner-ear dots, cream belly ellipse, bead
  eyes with white catchlights, small terracotta nose, four thin whiskers.
- **Audio**: VO lines above (see `narration.json` for the TTS-ready text);
  music is a soft Am–F–C–G pad, ~4s per chord, mixed ~-17 dB under the VO.
- To re-render the canvas originals at any length: serve the repo
  (`npm start`) and open
  `tools/marketing_video/cutscene.html?title=…&sub=…&variant=intro|build|defend|outro`,
  or run `SCENES=cut_intro,… node tools/marketing_video/record.mjs`.
