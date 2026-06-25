# 🐹 Neuroster

A web-based, world-building colony game in the spirit of the original *Warcraft* /
*Settlers* lineage — but the workers are **hamsters**. Mine materials, store and refine
them, build an ever-larger settlement, automate the toil, recruit other rodents, keep
your colony fed, watered, curious and healthy, and defend it against predators and
natural disasters. It's a persistent world you keep building and maintaining.

> Full vision: see [`DESIGN.md`](./DESIGN.md). Living arcs, backlog & recommendations: [`ROADMAP.md`](./ROADMAP.md).

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

## Features

- **Found your colony**: choose a hamster **breed** (Syrian, Russian Dwarf, Roborovski,
  Chinese) — each predisposes starting traits & a colony knack — and a random,
  renameable **founder** name.
- **7 selectable biomes** (Woodland, Prairie, Mountains, Lakes, Rivers, Marshlands,
  Beaches), each with its own terrain, resource abundance, and hazard profile.
- **Procedural world + fog of war**: maps generate on new game and reveal as your
  rodents explore; what's seen is saved and only regenerates on a new game.
- **Day/night cycle** (1 day = 15 real minutes) and **per-biome weather** that change
  productivity, visibility, power, and danger.
- **Hamster workers** auto-gather their assigned material and haul it to storage.
- **Resources & refining**: wood, stone, iron ore, coal, seeds, water → food, planks,
  iron, power, research.
- **Buildings**: burrows, storage, farms, wells, irrigation, sawmill, smelter, mines,
  wheel generators, lab, plus wellbeing (playground/infirmary/feeder) & defenses
  (walls, towers, barracks, levees, quake shelters).
- **Per-creature needs**: every rodent manages its own **food, water, energy
  (endurance), fun (curiosity↔boredom) and health**, driving its productivity — and
  **sleeps** on its species' schedule (hamsters are nocturnal!).
- **Levels & two trees**: rodents earn XP → levels → skill points; a colony **Skill
  tree** and a species **Evolution tree** grant permanent upgrades. Your highest
  rodent is your **Main Hamster level**, which gates advanced content.
- **Species & hybrids**: recruit guinea pigs, gerbils, mice, rats, beavers; some
  protect against specific threats. New rodents can be **hybrids** blending parents' best traits.
- **Predators & natural disasters**: wolves, hawks, raiders, floods, earthquakes —
  countered by defensive buildings and protective species; scaled by biome, weather,
  night, and your breed's difficulty.
- **Loyalty**: a thriving colony attracts wild joiners; a neglected one loses rodents.
- **Persistent, login-gated time**: autosaves; there is **no offline progress** — the
  world is exactly as you left it.

## Project layout

```
index.html · styles.css · main.js     # shell, styling, entry point
src/
  config.js      # all tunable game data (resources, buildings, species, tech,
                 #   evolutions, disasters, biomes, weather, breeds, needs, sleep)
  state.js       # GameState model + helpers (founder, evolutions, wellbeing)
  world.js       # procedural biome-driven tile/node generation + fog of war
  environment.js # day/night cycle + weather
  entities.js    # rodent units, per-creature needs, sleep, levels, AI, hybrids
  economy.js     # per-tick simulation (production, needs, breeding, loyalty, exploration)
  events.js      # predators & natural disasters
  buildings.js   # placement, costs, skill/evolution trees, traits, founder rename
  render.js      # canvas rendering (fog, day/night, weather, sleep)
  ui.js          # HUD, character creation, build/skill/evolve/rodent/threat panels
  save.js        # localStorage save/load (no offline progress)
  game.js        # main loop (fixed-timestep sim + rAF render)
```

The engine is **data-driven**: most new content (a building, resource, species, tech,
or disaster) is added by editing `src/config.js`, not the engine code.
