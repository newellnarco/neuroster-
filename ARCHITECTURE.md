# Neuroster — Architecture

A zero-dependency, no-build browser game. Plain ES modules + HTML5 Canvas, served
as static files. There is **no bundler, no framework, no package to install** to
run it — only Node (built-ins only) for the tiny static server and the headless
test. This document maps the code so a new session can get oriented fast.

## Tech & philosophy
- **Vanilla ES modules** (`src/*.js`), one `<canvas>`, one stylesheet. No deps.
- **Data-driven**: the vast majority of content (buildings, resources, species,
  disasters, seasons, virtues, decrees, doctrines, pollution, …) lives as plain
  objects in `src/config.js`. Engine code reads that data; adding content rarely
  needs engine changes.
- **Client-side everything**: rendering, procedural textures, audio synthesis —
  all generated on the player's machine. The server only ships files, so rich
  detail costs zero bandwidth (see `textures.js`, `audio.js`).
- **Determinism where it matters**: the sim avoids `Date.now()`/`Math.random()`
  in save-affecting paths; event RNG is state-seeded (`rand(state)` in
  `events.js`/`decrees.js`).

## Module map (`src/`)
| Module | Responsibility |
|---|---|
| `config.js` | **All data + tuning constants.** `VERSION`, `BUILDINGS`, `RESOURCES`, `SPECIES`, `BREEDS`, `BIOMES`, `DISASTERS`, `FACTIONS`, `SEASONS`, `MEGAPROJECTS`, `DOCTRINES`, `DECREES`, `JUSTICE`, `POLLUTION`, `STARTING`, fort tiers, etc. |
| `state.js` | `newGame()` builds the GameState; resource/derived helpers; virtue mutators (`addCompassion`, `addJustice`, `addValor`); `killUnit`, `addFx`, `logMsg`. |
| `world.js` | World/terrain generation, fog (`seen`), fertility, waste grid, tile helpers. |
| `entities.js` | `makeRodent`, names/families/coats, traits, `breedChild` (inheritance). |
| `environment.js` | Day/night clock, weather, seasons (`seasonKey`, `envMods`, `dayFraction`). |
| `economy.js` | **The per-tick simulation** (`stepEconomy`). Orchestrates everything below. |
| `events.js` | Disasters & predators, faction raids, protection/offense, truces, pacing (`GRACE_SECONDS`, `EVENT_PACE`). |
| `factions.js` | Neighbour camps + travelling caravans (trade/raid). |
| `megaprojects.js` | Contribute-over-time wonders; bonuses fold via `state._mega`. |
| `decrees.js` | Moral dilemmas (`stepDecrees`, `resolveDecree`, `dismissDecree`), delayed `pendingFates` (cub/herd), truce. |
| `doctrines.js` | Virtue-gated skill trees; bonuses fold via `state._doc`. |
| `milestones.js`, `alerts.js` | Goal tracking; derived HUD alert list (nothing persisted). |
| `palette.js` | The curated **64-colour palette** + quantise/ramp helpers. |
| `textures.js` | Procedural material patterns (fur, grass, bark, stone, brick, wood…) baked to `CanvasPattern`s at load. |
| `render.js` | Canvas renderer: HiDPI supersampling, baked terrain buffer, plush creatures, structures, weather/season FX, zoom. |
| `audio.js` | Web-Audio synth: UI cues + ambient beds (wind/rain/water/fire) + scheduled birds/crickets/chitter/scream. |
| `ui.js` | HUD bars, build/skill/evo/rodents/threats/trade/doctrine/mega panels, modals (settings, decree, menu, character-creation), canvas input (select/place/zoom/right-drag-pan), resource label toggle, pin tooltips. |
| `layout.js` | Resizable panel/log dividers (drag + collapse), click-to-pin tooltips. |
| `save.js` | Multi-slot save/load, export/import, typed-array reattach, legacy migration. |
| `game.js` | Boot: wires renderer/ui/audio, splash/start screen, fixed-timestep loop, autosave, in-game updater + version poll, menu Load. |

## Per-tick simulation order (`economy.js → stepEconomy`)
1. **Environment** first; cache `state._envMods`, `_mega` (megaprojects), `_doc` (doctrines).
2. **Rodent AI** (gather/haul/sleep) per unit.
3. **Construction** labour (`_laborFactor`), **burrow upkeep** (filth scales with
   crowding), **recompute** derived stats, **leadership**.
4. **Production/refining** (wellbeing × power × labour; food penalised by pollution;
   solar scaled by daylight; pollution sources accumulated).
5. **Per-creature needs**, **exploration**, **sanitation/disease**.
6. **Morale**, **breeding** (two-parent inheritance), **loyalty**, **events**,
   **factions**, **rescues**, **decrees**.
7. **Seasons/festivals**, **virtue drifts** (compassion/justice/valor),
   **almshouse/courthouse/statue/memorial** passives, **pollution** step.
8. **Milestones**, FX/caravan aging.

## Per-tick state caches (recomputed each tick — don't persist meaning)
`_envMods, _mega, _doc, _laborFactor, _leadership, _hygiene, _sanctuary, _courts,
_alms, _memorial, _statues, _pollSrc, _defendTowers, _watchTowers, _seasonKey`, …

## Virtues (the moral core)
Three colony stats in `state`: 💗 `compassion`, ⚖️ `justice`, 🦁 `valor` (martial,
morally neutral). They drift toward baselines, are moved by play (care, mercy,
fights, decrees), gate **doctrines**, and feed back into events (justice/compassion
affect raids & predators; valor lifts a proud colony).

## Rendering
- Canvas backing store rendered at `devicePixelRatio` (capped 3×) via a one-time
  `ctx.scale`; all drawing stays in logical `VW×VH` units. Terrain baked to an
  offscreen buffer, re-baked only when fog changes.
- **Procedural textures** (`textures.js`) clothe terrain, creatures (fur), trees
  (bark/leaf), forts and building bases — patterns scaled back to logical units
  via `pattern.setTransform`.
- Input mapping is resolution-independent (screen→tile via the logical grid).
- Zoom = CSS width on the canvas inside an inner `#viewport` scroller; overlays
  (zoom controls, hint, guide) live in the non-scrolling `#board` so they stay
  pinned. Right-drag pans; min zoom = fit-to-width.

## Save format
`save.js` serialises the whole `state` to JSON per slot
(`neuroster.slot.<id>`, indexed by `neuroster.slots`, `neuroster.activeSlot`).
Typed arrays (terrain/seen/fertile `Uint8Array`, waste `Float32Array`) are
reattached on load; older saves are migrated forward. Autosave every
`AUTOSAVE_SEC`; no offline progress (time only advances while open).

## Build / run / test
- **Run locally:** `node server.js` (env `HOST`/`PORT`, default `0.0.0.0:8080`).
- **Verify:** `npm run check` (`node --check` all sources) + `npm test`
  (`test/smoke.mjs`, a headless `stepEconomy` suite — 53 checks). CI runs both on
  every push/PR (`.github/workflows/ci.yml`).
- **Deploy:** see `README.md` (Docker on NAS) — LAN: `http://192.168.1.90:8080`.
