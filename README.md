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

### Deploy on a server / LAN / WAN (configurable IP & port)

A tiny zero-dependency Node server is included. **Host/IP and port are configurable**
via environment variables (`HOST`/`NEUROSTER_HOST`, `PORT`/`NEUROSTER_PORT`):

```bash
# all interfaces (reachable from other devices on your LAN/WAN) on port 8080
npm start
# or pick a specific bind IP and port:
HOST=192.168.1.50 PORT=80 node server.js
```

Then open `http://<server-ip>:<port>` from any device that can reach it.
There's a `/healthz` endpoint for load balancers/uptime checks.

### Docker

```bash
# build & run, exposed on all interfaces, port 8080
docker compose up -d --build
# or bind to a specific host IP / port via env:
BIND_IP=192.168.1.50 BIND_PORT=80 docker compose up -d --build
```

Or with plain Docker:
```bash
docker build -t neuroster .
docker run -d -p 8080:8080 -e HOST=0.0.0.0 -e PORT=8080 --name neuroster neuroster
```

### Controls
- **Click** a building in the Build panel, then **click the map** to place it.
- **Right-click** cancels placement. **Click an existing structure** to demolish it (50% refund).
- **Space** = pause/resume · **1 / 2 / 3** = game speed.
- The game **autosaves** to your browser and simulates **offline progress** when you return.

## Features

- **Living, pixel-art 3/4 view**: a textured top-angle map (grass tufts, pebbles,
  shorelines, mountain peaks, animated water & weather) with **procedurally animated
  rodents** (walk cycles, facing, sleep curls), a **spinning power wheel** with a running
  hamster, and **animated conveyor belts** that carry cargo from nodes to storage.
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
- **Surface vs underground resources**: rodents harvest **trees, rocks & bushes**
  directly (which **recede** as 2.5D sprites as they're used up); **iron ore & coal**
  are underground and need a placed **Mine**, which shows the **remaining** amount and
  **collapses** when the seam runs out.
- **Predators & natural disasters**: wolves, hawks, raiders, earthquakes, and
  **double-edged floods** — floods leave **seeds & fertile soil** (a temporary farm
  boost) but, if your **levees/irrigation** can't hold them, they damage stores, hurt
  rodents and **flood mines** (which must be **repaired** with materials + time).
  Threats scale by biome, weather, night, and your breed's difficulty.
- **Hands-on care**: select any rodent to **Feed / Water / Play / Pet** it for an instant
  need boost, reward feedback, and **bond** (affection) that lifts its productivity and
  loyalty. Cooldowns reward periodic check-ins; **caretaker huts & auto-waterers**
  automate care so big colonies stay manageable.
- **Alliances & trade**: build a **Trading Hut** to **gift, barter, or request aid** from
  four neighboring animal factions (Squirrels, Chipmunks, Field Mice, Pack Rats). Trades
  raise/lower **standing** — but **hoarding what a faction covets invites raids** that steal
  supplies and smash walls, houses, storage and facilities.
- **Morale & ethics — kindness vs preservation**: the colony has a conscience. **Unburied
  dead and untreated injuries crush morale**, and so does **violent killing by lethal
  defenses**. Low morale saps Fun, productivity and loyalty (deserters). Bury the fallen in
  tiered resting places — **Dirt Graves → Stone Crypts → Grand Mausoleum** — where grander
  tombs restore more morale through respect. And with a **Vet Clinic** you can **heal
  repelled raiders instead of killing them** — morale rises and the spared newcomer may even
  **join your colony** (the faction warms to you too).
- **Upgradeable tunnels**: covered runs that protect rodent travel and **bar other animals
  from crossing**. They have **HP** and take damage from attacks, raids and disasters, and
  you **upgrade each section wood → iron → steel** (steel is forged from iron at a
  **Steelworks**) — click a tunnel to upgrade or repair it.
- **Loyalty**: a thriving, well-bonded colony attracts wild joiners; a neglected one loses rodents.
- **Live alert bar**: a prioritized, colour-coded HUD banner that surfaces *what needs
  attention now* — starving/parched rodents, sickness, unburied dead, degraded burrows,
  flooded mines, low morale, full housing/storage, and **imminent raids & disasters**
  (defense-aware), plus nudges like unspent skill points. **Click an alert** to jump to the
  relevant panel; a new critical alert pings.
- **Megaprojects**: colony-defining **multi-session wonders** you build by **contributing
  surplus over time** (no up-front cost) — 🎡 **Grand Wheel** (+50% production & free power),
  🏰 **The Citadel** (+90 defense & +45 protection vs every threat), 🌾 **Great Granary**
  (+1800 storage & +60% food), 🗿 **Eternal Monument** (leadership, faster breeding, steady
  morale). Level-gated; each grants a permanent, colony-wide payoff. See the **Mega** tab.
- **Export / import saves**: back up or hand off a colony as a `.json` file (**⬆️ Export** /
  **⬇️ Import** in the top bar) — handy for moving between machines or sharing a test colony.
- **Built-in How-to-Play guide**: a concise onboarding overlay opens on your first visit
  (and any time from the **❓ Help** button) so new players know the loop at a glance.
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
  alerts.js      # live, derived HUD notifications ("what needs attention now")
  megaprojects.js# long-horizon wonders: contribute-over-time + permanent bonuses
  milestones.js  # achievements / goals with a reward drip
  render.js      # canvas rendering (fog, day/night, weather, sleep)
  ui.js          # HUD, character creation, build/skill/evolve/rodent/threat/mega panels
  save.js        # localStorage save/load + export/import (no offline progress)
  game.js        # main loop (fixed-timestep sim + rAF render)
```

The engine is **data-driven**: most new content (a building, resource, species, tech,
or disaster) is added by editing `src/config.js`, not the engine code.

### Tests / CI

```bash
npm test          # syntax-checks every module + runs the headless smoke suite
```

`test/smoke.mjs` drives the simulation across all 7 biomes and verifies alerts,
megaprojects and save export/import — no browser needed. GitHub Actions
(`.github/workflows/ci.yml`) runs it on every push and pull request.
