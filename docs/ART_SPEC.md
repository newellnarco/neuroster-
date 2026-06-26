# 🎨 Neuroster — Art-Asset Specification

A precise brief for an artist producing **drop-in replacement art** for Neuroster's
current procedural vector renderer. Today every creature, building, terrain tile,
resource node and effect is drawn at runtime from code (`src/render.js`,
`src/textures.js`, `src/palette.js`) using the 64-colour palette. This document
says **exactly** what sprite sheets / hand-drawn assets to make so they slot into
that renderer with minimal code change.

Everything below is grounded in the real code. Source of truth for numbers:

- `src/config.js` — `TILE`, `GRID_W/H`, the `BUILDINGS`/`SPECIES`/`NODE_TYPES`/`COAT_*` content.
- `src/render.js` — how each thing is currently drawn (sizes, anchors, states).
- `src/textures.js` — the procedural material library (logical tile size `S = 48`).
- `src/palette.js` — the 64-colour palette (`RAMPS` + flat `PAL`).
- `styles.css` — the UI/CSS palette variables.

---

## 1. Canvas, tile metrics & device-pixel scaling

| Metric | Value | Source |
|---|---|---|
| **World tile size** | **32 × 32 px** (logical) | `TILE = 32` |
| World grid | 40 × 28 tiles | `GRID_W = 40`, `GRID_H = 28` |
| Logical canvas (`VW × VH`) | 1280 × 896 px | `GRID_W*TILE × GRID_H*TILE` |
| **Device-pixel scaling (DPR)** | `clamp(round(window.devicePixelRatio), 1, 3)` | `render.js` line ~24 |
| Backing store | `VW*DPR × VH*DPR` (up to 3840 × 2688) | `canvas.width/height` |
| Drawing space | always **logical** (a single `ctx.scale(DPR,DPR)`) | `render.js` |
| Procedural texture tile | 48 × 48 logical, baked at DPR | `textures.js` `S = 48` |

**Implication for art.** The game draws in **logical** units; the GPU handles
HiDPI. So author master sprites at **2× the logical size** (a 32 px tile → a
64 px master) and let the renderer down-draw to logical px — this gives crisp
art on 2× displays without per-asset DPR work. Provide `@1x` (32-based) and
`@2x` (64-based) sheets; the renderer picks by DPR.

**Per-category target sprite dimensions** (logical → author @2x):

| Category | On-tile footprint | Master frame (@2x) | Notes |
|---|---|---|---|
| Creatures | ~22–36 px wide (size 11–18, see §3) | **64 × 64** | centred, room for tail/ears |
| Buildings (1-tile) | 24 × 26 px (drawn `TILE-8` wide) | **64 × 64** | sits on a 1-tile footprint |
| Terrain tiles | 32 × 32, must tile seamlessly | **64 × 64** | edge-safe, no baked lighting |
| Resource nodes | clustered, ~22 px each | **64 × 64** | 1–3 instances per tile |
| FX / particles | 12–20 px | **32 × 32** | transparent, additive-friendly |

---

## 2. Sheet layout & delivery format

- **Grid sheets.** One sheet per category (or per creature). Uniform cells, **no
  bleed between cells**; add **2 px transparent padding** inside each cell to
  avoid filtering halos when the renderer up/down-scales.
- **Power-of-two sheets.** Keep sheet textures ≤ **2048 × 2048** (most fit in
  1024² or 2048²). Pad the sheet itself to a power-of-two (512 / 1024 / 2048).
- **Frame size:** fixed per sheet (e.g. 64 × 64 for creatures). Lay animation
  **frames left→right**, **states/variants top→bottom**.
- **Transparency:** 32-bit straight (non-premultiplied) PNG alpha. No baked drop
  shadows — the renderer draws its own soft contact shadow under creatures and
  buildings (stacked translucent ellipses; see `drawCreatureRaw` / `drawBuildings`).
- **JSON atlas:** ship a TexturePacker-style JSON hash atlas alongside each
  sheet (`frames` keyed by `name.png`, each with `frame {x,y,w,h}`,
  `spriteSourceSize`, `pivot`). The renderer's loader (see §8) reads frame rects
  and pivots from this; a uniform grid is also fine if you instead provide a tiny
  `{cols, rows, frameW, frameH, names[]}` manifest.

---

## 3. Creatures (SPECIES + coat variants)

Current draw: `drawCreatureRaw()` builds each rodent from plush ellipses — body,
belly, head, ears, eyes, tail, feet — with a soft radial "volume" gradient, an
overlaid fur texture, idle breathing, a walk gait, sleep curl, and a carry box.

**Species & their current visual specs** (`VIS` in `render.js`, content in `SPECIES`):

| Species | icon | size | body | belly | ears | tail | role |
|---|---|---|---|---|---|---|---|
| Hamster | 🐹 | 15 | `#dcab68` | `#f4e2bd` | 4 | short (3) | all-round worker (the star) |
| Guinea Pig | 🐹 | 17 | `#b07d4f` | `#e8d3b0` | 3 | none (0) | burly guard/soldier |
| Gopher | 🦡 | 15 | `#a87f4e` | `#d8c193` | 3 | short (5) | digger/repairer |
| Gerbil | 🐭 | 13 | `#caa56c` | `#efe0c0` | 4 | long (12) | fast hauler |
| Mouse | 🐁 | 11 | `#bdbdc6` | `#e9e9f0` | 6 (big) | long (13) | lookout/researcher |
| Rat | 🐀 | 16 | `#9a9098` | `#cfc8cf` | 5 | long (16) | swarm defender |
| Beaver | 🦫 | 18 | `#6e4b32` | `#a98a66` | 3 | wide paddle (8, w6) | builder/dam |

> `size` is the logical body radius-ish in px (×2 ≈ on-tile pixel width). Keep
> the **silhouette differences** above — long-tailed mouse/rat/gerbil, tail-less
> guinea pig, paddle-tailed beaver — they're how players tell species apart at a
> glance.

**Per creature, deliver these animation states & frame counts:**

| State | Frames | When used | Notes |
|---|---|---|---|
| `idle` | 2–4 | standing still | gentle breathe/bob (renderer currently does ~0.5 Hz) |
| `walk` | 4–6 | moving (`moved > 0.0015`) | leg swing + vertical bob; loops |
| `work` | 4 | mining/building/gathering | small forward lean / paw action |
| `sleep` | 1–2 | `phase === 'sleep'` | curled body, "z" handled by renderer (or bake 2-frame breathe) |
| `carry` | reuse walk + overlay | `carrying` truthy | a small `#caa05a` crate rides the back — bake a `carry` overlay or a carry-walk row |

- **Facing:** the renderer **mirrors horizontally** for left/right (`face`). Draw
  every creature **facing right**; do not bake a left set.
- **Anchor / pivot:** **bottom-centre at the feet** (the contact-shadow point).
  In code the body centre sits at `cy`, feet ~`+6.4*s`, shadow at `cy + 7.5*s`.
  Set each frame's pivot so the **feet line up on the tile** across all frames.
- **Coat variants (hamster only).** The founder & offspring hamsters wear coats
  from `COAT_COLORS` × `COAT_PATTERNS`. Rather than a full sheet per coat, make
  the hamster sheet **tintable**: paint the body in neutral greyscale-with-form
  and let the renderer multiply the coat `body`/`belly` colour, **or** deliver
  one base + a separate **belly mask** + **patch mask** so the three patterns
  (`classic` lighter belly · `solid` uniform · `patched` contrasting patch) and
  9 colours combine procedurally. Coat colours (body/belly):

  `golden #dcab68/#f4e2bd · cream #e8d6a8/#f7eed5 · cinnamon #c8824e/#edd0ab ·
  chocolate #7a5230/#b88a5c · grey #b7b4bd/#e7e6ee · charcoal #595560/#8b8690 ·
  white #eef0f2/#ffffff · black #3c3940/#6b6770 · sable #8a6a3a/#d8c193`

- **Founder marker:** the founder gets a small crown ♛ above the head — leave
  headroom in the top of the frame; the renderer draws the crown, you needn't.
- **Suggested sheet:** `creatures_<species>.png` — rows = states (idle/walk/work/sleep),
  cols = frames, 64 × 64 cells. Hamster additionally ships its belly/patch masks.

**Priority within creatures:** Hamster first (most on screen + coats), then
Gerbil/Mouse (common early recruits), then the rest.

---

## 4. Buildings (each category, with states)

Most buildings currently render as a **textured rounded base + emoji glyph**
(`drawBuildings`): a 1-tile rounded slab tinted by `BUILDING_TEX` (material +
base colour), a top highlight, then the building's emoji. A few have **bespoke**
vector routines: `townhall`, `mine`, `wheel`/`funwheel`, `conveyor*`, `wall`,
`tunnel`, `bridge`, `dam`, and construction `site`s.

**Deliver one sprite per building type** (65 in `BUILDINGS`, minus `noBuild`
entries like `taintedball`). Group the sheet by the same categories the build
menu uses:

| Category | Examples |
|---|---|
| **Housing** | Burrow 🕳️, Meeting/Town Hall 🏛️ (3 tiers) |
| **Food** | Farm 🌾, Wheat Field 🌾, Mill 🏯, Pellet Press 🟤, Well ⛲, Oak 🌰, Sunflower 🌻, Irrigation 🚿 |
| **Storage** | Storage Depot 📦, Water Cistern 🛢️ |
| **Production** | Sawmill 🪚, Smelter 🔥, Steelworks 🏭, Mason 🧱, Furnace 🔥, Forge ⚒️, Refinery 🛢️, Oil Refinery ⚗️, Lab 🔬, Fertilizer Mill ⚙️, Trading Hut 🏪 |
| **Extraction** | Mine ⛏️ |
| **Automation** | Wheel 🎡, Electric Wheel 🔌, Windmill 🌬️, Water Mill 🛞, Coal Plant 🏭, Solar 🔆, Hydro 🌀, Conveyors (wood/plastic/metal) |
| **Wellbeing** | Vet 💉, Infirmary 🏥, Graves/Crypts/Mausoleum/Hall of Heroes, Playground 🎠, Toy Box 🧸, Fun Wheel 🎡, Maze 🌀, Sand Bath 🏖️, Sanctuary 🏡, Statue 🗿, Courthouse ⚖️, Almshouse 🍞, Feeder 🍽️, Auto-Waterer 🚰, Caretaker 🏡, Ball Workshop 🫧 |
| **Defense** | Wood Fence 🚧, Wall 🧱, Watchtower 🗼, Tunnel 🛤️, Bridge 🌉, Beaver Dam 🦫, Barracks ⚔️, Levee 🌊, Quake Shelter 🏚️ |

**States to author per building** (only where the game uses them):

| State | Which buildings | Source signal |
|---|---|---|
| `site` (under construction) | all (generic scaffold is fine) | building not yet `built` — renderer shows a scaffold + progress bar |
| `active` (default/built) | all | the normal sprite |
| `working` (running) | producers (Farm, Smelter, Mill, Wheel, Lab, Mine…) | optional 2–4 frame loop (smoke, wheel spin, sparks) for buildings with `produces`/`consumes` |
| `degraded` / dirty | Burrow (`b.degraded`), flooded Mine | renderer currently tints; a dedicated frame reads better |
| **tier variants** | Wall/Tunnel/Bridge (wood→stone/iron→steel), Town Hall (3 tiers) | `WALL_TIERS`/`TUNNEL_TIERS`/`BRIDGE_TIERS`/`TOWNHALL_TIERS` — one sprite per tier |
| **tower stance** | Watchtower 👁️ WATCH vs 🗡️ DEFEND | a flag/banner swap is enough |

- **Footprint & anchor:** single 1-tile (32 × 32) footprint, drawn within
  `TILE-8` and offset up a few px so it "sits" on the tile; **pivot = bottom-centre**
  on the tile, matching the contact shadow the renderer adds. The Town Hall and a
  few others read as slightly taller — you may overhang the top of the cell (keep
  within 64 × 64 master) as long as the base stays on the tile.
- **Material continuity:** match the existing material reads so new art is
  consistent with anything still procedural — stone structures stony, brick
  kilns/furnaces bricky, timber huts wooden, dirt/botanical for farms (see
  `BUILDING_TEX` in `config.js`). Use the **stone/brick/wood/dirt** ramps (§6).
- **Connectors:** Walls/Tunnels/Bridges visually **join** to like neighbours
  (the renderer stubs out connectors toward matching adjacent tiles). Author them
  as a **centre piece**; the renderer handles the directional stubs, OR provide a
  small auto-tile set (straight / corner / T / cross / cap) per material tier if
  you want fully hand-drawn joins.

**Priority within buildings:** the early-game core first — **Burrow, Town Hall,
Farm, Well, Storage, Sawmill, Wheel, Wall, Watchtower** — these are on screen in
the first ten minutes of every colony.

---

## 5. Terrain tiles (per biome)

The world is a tile grid of 7 terrain types (`TERRAIN` in `world.js`):
**grass (0), dirt (1), rock (2), water (3), sand (4), mountain (5), marsh (6)**.
Currently each is a base colour + a clipped procedural material (`grass`, `dirt`,
`stone`, `water`, `sand`, `marsh`) with **feathered, blended edges** between
differing neighbours so transitions are seamless.

**Deliver, per terrain type:**

- A **seamless 32 × 32 ground tile** (author 64 × 64, must tile in all
  directions — no directional lighting baked in; the renderer applies day/night,
  weather and season tints on top).
- **2–4 colour variants** per type to break up repetition (the renderer
  currently varies via hashed speckle; pre-baked variants read cleaner).
- **Edge / transition tiles** (or a 47-tile blob auto-tile set) for the common
  borders: grass↔dirt, grass↔water (shoreline), sand↔water (beach), grass↔rock,
  marsh↔water. If you'd rather not hand-author every transition, deliver clean
  tiles + a soft **edge alpha mask** and the renderer keeps its feathered blend.

**Biomes** (`BIOMES`) mix these terrains in different ratios + water and have
distinct weather sets — they do **not** need unique tile art, but a few biome
**accent decals** lift them: woodland leaf litter, prairie grass tufts, mountain
scree, lakes/rivers reeds, marsh lily pads, beach shells. Deliver as optional
**transparent overlay decals** (16–24 px) scattered by the renderer.

| Biome | icon | dominant terrains |
|---|---|---|
| Woodland 🌳 / Prairie 🌾 | grass-heavy | grass, dirt |
| Mountains ⛰️ | rock/mountain | rock, mountain, grass |
| Lakes 🏞️ / Rivers 🌊 | watery | grass, water |
| Marshlands 🪷 | wetland | grass, marsh, water |
| Beaches 🏖️ | coastal | sand, grass, water |

**Animated water:** keep water as a base tile; the renderer overlays a **moving
shimmer** (sine-driven highlight bands). You may supply a 3–4 frame caustics
overlay if you want richer motion.

---

## 6. Palette, shading & outline conventions

All current art quantises to a **64-colour palette** (`PAL` in `palette.js`),
organised as hue-family **ramps** (light → dark). New art **must stay on these
ramps** so it blends with anything still procedural.

**Material ramps (`RAMPS`)** — use these for shading the matching surfaces:

```
grass  #dCE8a0 #b7d96a #8fc04a #6ba83a #4d8a2e #3a6e26 #2c561f
leaf   #cfe89a #9bd067 #6fb83f #4f9a2f #357a25 #265c1c
dirt   #c8a36e #a9763b #8a5c2e #6f4a26 #553820 #3f2a18
bark   #9a7a52 #7a5a36 #5e472b #46341f #332617
wood   #e0c084 #caa05a #a9743b #855a2d #624322
sand   #f1e3bd #e8d6a8 #d9c08a #c8a86a #b08d52
stone  #d6dae0 #b7bdc6 #9aa0a6 #7b828c #5c626b #42474f
brick  #cf7b5a #b85a3f #9a4530 #7a3424 #5a261a
water  #9fd6e8 #5fb6d6 #3f8fc0 #2f6fa0 #234f78 #173552
marsh  #7fae7a #5a8e6a #456e52 #33523f #24382c
snow   #ffffff #eef3fb #d8e2f0 #bcc8da
fur    #f4e2bd #dcab68 #c8824e #7a5230 #3c3940
flesh  #f6c9c1 #f3b4a8 #e89a8d #d98a7c
warm   #ffd27a #ffb24a #f08a3a #d96a2a
accent #e8d24a #e87ea0 #7e9cff #ff7eb6
ink    #6b6770 #4a4550 #332b28 #241c16 #100c0a
```

**UI / frame palette (`styles.css` :root)** — for HUD-adjacent or selection art:

```
--bg #1c1a17   --panel #2a2722   --panel2 #332f29   --ink #f3ead9
--muted #b8ad99 --accent #e6b450  --good #7cdc6a    --bad #e06b6b   --line #44403a
```

**Shading conventions to match the existing look:**

- **Soft 3D "plush" volume.** Creatures use a radial gradient lit from the
  **upper-left** (highlight `shade(+0.34)`), mid body colour, dark lower-right
  edge (`shade(-0.26)`) — a gentle ambient-occlusion. Echo this: a single soft
  top-left highlight, a darker lower-right rim. Avoid harsh cel banding.
- **Specular sheen.** A small soft white highlight (`rgba(255,255,255,0.34)` →
  transparent) on rounded forms; **glossy eyes** = white sclera, dark `#241c16`
  pupil, tiny upper-left catchlight.
- **Outlines.** The current art is **outline-light** (forms read by shading, not
  black keylines). If you outline, use a **dark on-ramp tone** (`ink #241c16`
  or a darkened version of the local ramp), **never pure black**, at 1 logical px.
- **Shadows are the engine's job.** Don't bake contact shadows — the renderer
  draws stacked translucent ellipses under creatures/buildings.
- Quantise final art with `quantize()`'s palette in mind (nearest of the 64).

---

## 7. Resource nodes & FX

**Resource nodes** (`NODE_TYPES`) — gathered/mined points in the world. The
renderer clusters 1–3 instances per tile that **recede as depleted** (a
`drawCluster` with a depletion progress bar). Deliver each at 2–3 "fullness"
stages or a single sprite the renderer scales/fades:

| Node | icon | resource | surface? | current draw |
|---|---|---|---|---|
| Trees | 🌳 | wood | yes | layered conifer/round tree, cluster of up to ~4 |
| Rock | 🪨 | stone | yes | boulders, cluster of 3 |
| Bush | 🌿 | seeds | yes | small leafy bush |
| Ore vein | ⛰️ | iron ore | **no (mined)** | underground hint until a Mine is placed |
| Coal seam | ⚫ | coal | **no (mined)** | underground hint |
| Oil seep | 🛢️ | oil | **no (mined)** | underground hint |

- Anchor **bottom-centre**; provide a **depleted/stump** variant for trees/rock.
- Underground nodes (ore/coal/oil) only need a subtle **surface hint** decal +
  the Mine building (§4) sits on them.

**FX / particles** — `drawFx()` floats a short-lived **glyph** (emoji) upward,
fading out (used for care actions, gather pops, etc.). Care FX glyphs in config:
`feed 🍖 · water 💧 · play ✨ · pet ❤️`. Also rendered: rain streaks, snow dots,
day/night & weather tints, season overlays, water shimmer.

Deliver a small **particle sheet** (32 × 32 cells, transparent, additive-friendly)
for replacements/upgrades:
- **care/emote pops** (heart, sparkle, food, water droplet, "z" sleep, "!" alert)
- **work motes** (wood chips, stone dust, sparks for smelting, smoke puffs for
  pollution-emitting buildings)
- **weather** (rain streak, snowflake, fog wisp) — optional; the renderer's
  procedural weather is serviceable.

Pivot = **centre**; design to read at 12–20 logical px. Keep 2–4 frames for any
that animate (sparkle twinkle, smoke rise).

---

## 8. Naming, atlas & how it slots into the renderer

**File naming** (lowercase, hyphenless keys matching config keys):

```
creatures_<species>.png         e.g. creatures_hamster.png, creatures_beaver.png
creatures_hamster_belly.png     (tint mask) + creatures_hamster_patch.png
buildings_<category>.png        e.g. buildings_food.png, buildings_defense.png
   ...or buildings/<key>.png    one sprite per building key (burrow.png, sawmill.png, …)
terrain_<type>.png              terrain_grass.png … terrain_marsh.png (+ _edges variant)
nodes.png                       trees / rock / bush / ore / coal / oil (+ depleted stages)
fx.png                          particle/emote sheet
<sheet>.json                    matching atlas (frames + pivots) per sheet
```

Each sheet ships a **JSON atlas** (TexturePacker hash format) with, per frame:
`frame {x,y,w,h}`, `spriteSourceSize`, and a `pivot {x,y}` in 0..1 (use
**0.5, 1.0** = bottom-centre for creatures/buildings/nodes; **0.5, 0.5** for FX).

**Where the renderer would load it.** `src/render.js` `createRenderer()` already
bakes procedural textures at startup (`const TEX = buildTextures(ctx, DPR)`).
A sprite-sheet path replaces/augments that:

1. Add a `loadAtlas(url)` step in `createRenderer` (alongside `buildTextures`)
   that loads each PNG into an `Image`/`ImageBitmap` and parses its JSON into a
   `{ name → {img, sx, sy, sw, sh, pivot} }` map.
2. In the draw routines, swap the procedural body for a frame blit:
   - **Creatures:** in `drawCreatureRaw`, replace the ellipse-stack with
     `ctx.drawImage(frame, sx,sy,sw,sh, cx - pivotX*w, cy - pivotY*h, w, h)`,
     picking the row by state (`walking`/`sleeping`/`carrying`) and the frame by
     `legPhase`/time. Keep the existing `face` mirror (`ctx.scale(face,1)`),
     contact shadow, and founder-crown overlay.
   - **Buildings:** in `drawBuildings`, replace the rounded-base + glyph with the
     building's sprite (by `b.type`, `state`, and tier where relevant); keep the
     shadow, construction `site`, progress and upgrade bars.
   - **Terrain:** in the terrain bake (`bakeTerrain`/material clip), blit the tile
     sprite instead of (or under) the procedural material; keep edge feathering or
     switch to supplied edge tiles.
   - **Nodes/FX:** in `drawNodes`/`drawFx`, blit node/particle frames in place of
     the vector clusters/glyphs.
3. **Fallback:** if a sprite for a given key is missing, fall back to the current
   procedural draw — so the migration can land category-by-category without
   breaking anything.

Logical sizing stays as-is (draw in 32-px tile units); DPR handles crispness.

---

## 9. Priority order (most visual lift first)

1. **Hamster creature sheet (+ coat masks).** The hamster is on screen constantly
   and wears player-chosen coats — biggest, most personal upgrade.
2. **Core early buildings:** Burrow, Town Hall, Farm, Well, Storage, Sawmill,
   Wheel, Wall, Watchtower — the first-ten-minutes skyline of every colony.
3. **Terrain tiles for the starter biomes** (Woodland/Prairie): grass, dirt,
   water, rock + their transitions — the whole backdrop.
4. **Resource nodes:** trees, rock, bush (surface, always visible) with depleted
   stages.
5. **Remaining recruitable species:** gerbil, mouse, rat, beaver, gopher,
   guinea pig (distinct silhouettes).
6. **Production / Automation / Defense buildings** with `working` loops (smelter
   smoke, wheel spin, mine) and **tier variants** (wall/tunnel/bridge, town hall).
7. **Remaining biome terrains & decals** (mountains, lakes, rivers, marsh, beach).
8. **FX / particle sheet** (care emotes, work motes, weather) — polish layer.

---

_This spec tracks the renderer as built. If `src/render.js`, `src/config.js` or
the palette change materially, update the metrics and content lists above (the
counts and per-entity tables are the parts that drift)._
