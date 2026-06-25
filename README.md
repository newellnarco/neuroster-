# 🐹 Neuroster

A web-based, world-building colony game in the spirit of the original *Warcraft* /
*Settlers* lineage — but the workers are **hamsters**. Mine materials, store and refine
them, build an ever-larger settlement, automate the toil, recruit other rodents, keep
your colony fed, watered, curious and healthy, and defend it against predators and
natural disasters. It's a persistent world you keep building and maintaining.

> Full vision & roadmap: see [`DESIGN.md`](./DESIGN.md).

## Play it

No build step, no dependencies — just serve the folder and open it in a browser:

```bash
# from the repo root
python3 -m http.server 8099
# then open http://localhost:8099/index.html
```

(Any static server works, e.g. `npx serve`. It must be served over `http://` —
opening `index.html` directly via `file://` won't work because it uses ES modules.)

### Controls
- **Click** a building in the Build panel, then **click the map** to place it.
- **Right-click** cancels placement. **Click an existing structure** to demolish it (50% refund).
- **Space** = pause/resume · **1 / 2 / 3** = game speed.
- The game **autosaves** to your browser and simulates **offline progress** when you return.

## What's in the MVP

- **Procedural world** of terrain + resource nodes (trees, rock, ore, coal, bushes, ponds).
- **Hamster workers** that auto-gather their assigned material and haul it to storage.
- **Resources & refining**: wood, stone, iron ore, coal, seeds, water → food, planks,
  iron, power, research.
- **Buildings**: burrows (housing/breeding), storage, farms, wells, sawmill, smelter,
  mines, wheel generators, research lab, plus wellbeing & defensive structures.
- **Wellbeing** you must manage: **food, water, curiosity, health** — neglect lowers
  productivity and makes rodents desert.
- **Per-unit traits** (strength, swiftness, capacity, vigor, wit) you upgrade
  individually; new hamsters can be born as **hybrids** that blend parents' best traits.
- **Other rodent species** — guinea pigs, gerbils, mice, rats, beavers — each with a
  specialty, recruited via the tech tree, some of which **protect against specific threats**.
- **Predators & disasters**: wolves, hawks, raiders, floods, earthquakes — countered by
  defensive buildings (walls, towers, barracks, levees, shelters) and protective species.
- **Loyalty**: a thriving colony attracts wild joiners; a neglected one loses rodents.
- **Tech tree** for mining/logistics/refining/agriculture upgrades and species unlocks.

## Project layout

```
index.html · styles.css · main.js     # shell, styling, entry point
src/
  config.js    # all tunable game data (resources, buildings, species, tech, disasters)
  state.js     # GameState model + helpers
  world.js     # procedural tile/node generation
  entities.js  # rodent units, AI, trait combination
  economy.js   # per-tick simulation (production, needs, breeding, loyalty)
  events.js    # predators & natural disasters
  buildings.js # placement, costs, tech & trait upgrades
  render.js    # canvas rendering
  ui.js        # HUD, build/tech/rodent/threat panels
  save.js      # localStorage save/load + offline progress
  game.js      # main loop (fixed-timestep sim + rAF render)
```

The engine is **data-driven**: most new content (a building, resource, species, tech,
or disaster) is added by editing `src/config.js`, not the engine code.
