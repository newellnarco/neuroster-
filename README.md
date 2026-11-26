# 🐹 Neuroster

A web-based, world-building colony game in the spirit of the original *Warcraft* /
*Settlers* lineage — but the workers are **hamsters**. Mine materials, store and refine
them, build an ever-larger settlement, automate the toil, recruit other rodents, keep
your colony fed, watered, curious and healthy, and defend it against predators and
natural disasters. It's a persistent world you keep building and maintaining.

> **Docs index:** [`DESIGN.md`](./DESIGN.md) (vision & systems) ·
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) (code map & sim order) ·
> [`LAYOUT.md`](./LAYOUT.md) (UI structure) ·
> [`DECISIONS.md`](./DECISIONS.md) (why it's built this way) ·
> [`TODO.md`](./TODO.md) (backlog) · [`ROADMAP.md`](./ROADMAP.md) (arcs & history) ·
> [`SYSTEMS.md`](./SYSTEMS.md) (🗺️ **systems & flow map** — resources/structures/animals/skills + balancing) ·
> [`docs/neuroster-systems-map.png`](./docs/neuroster-systems-map.png) (🖼️ **visual systems map** — the whole hierarchy in one PNG) ·
> [`docs/ART_SPEC.md`](./docs/ART_SPEC.md) (🎨 **art-asset spec** — sprite sheets to replace the procedural art) ·
> [`docs/project/`](./docs/project/) (📋 **project wall** — plan & track work).

## 📋 Project wall (plan & track progress)

A zero-API, git-native project board lives in [`docs/project/`](./docs/project/). It tracks
every arc/task through a status lifecycle and renders both a terminal page and a visual wall.

- **Browser wall:** run `npm start`, then open **`http://localhost:8080/docs/project/wall.html`**
  (swimlanes by status, search/hide toggles, click-through arc detail — no GitHub API).
- **Terminal view:** read [`docs/project/PROJECT_STATUS.md`](./docs/project/PROJECT_STATUS.md).
- **To change the board:** never hand-edit `board_state.json` — drop a fragment into
  `docs/project/board_entries/` (insert or `{op:update}`) and the on-main job folds it in.
  See [`docs/project/README.md`](./docs/project/README.md).

## 🌐 A web-hosted game

Neuroster is played in a browser. The whole game is a folder of static files and a
tiny zero-dependency Node server: host it anywhere, open the address, and play. Saves
live in the browser. The in-game **🔄 Update** button, or a browser refresh, loads the
newest served code.

## Play it (locally, for development)

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
HOST=<server-ip> PORT=80 node server.js
```

Then open `http://<server-ip>:<port>` from any device that can reach it.
There's a `/healthz` endpoint for load balancers/uptime checks.

### Docker

```bash
# build & run, exposed on all interfaces, port 8080
docker compose up -d --build
# or bind to a specific host IP / port via env:
BIND_IP=<server-ip> BIND_PORT=80 docker compose up -d --build
```

Or with plain Docker:
```bash
docker build -t neuroster .
docker run -d -p 8080:8080 -e HOST=0.0.0.0 -e PORT=8080 --name neuroster neuroster
```

#### Prebuilt image (GHCR) — for a server with no build step

CI can publish a **multi-arch** image (amd64 + arm64) to GitHub Container Registry so you
can pull and run — no cloning or building on the server. Publishing runs on a **version tag** (`git tag v0.1.0 && git
push --tags`) or a **manual run** of the *Publish Docker image* workflow. (To auto-publish
on every push to `main`, set **Settings → Actions → General → Workflow permissions** to
*Read and write*, then add `push: { branches: [main] }` back to `docker-publish.yml`.)

```bash
docker run -d -p 8080:8080 --restart unless-stopped \
  --name neuroster ghcr.io/newellnarco/neuroster-:latest
```

Map a host port to container port **8080** and enable auto-restart.
Saves live in the browser, so the container is stateless (no volumes needed).
The package must be **public** in GitHub (or log in to `ghcr.io` with a token) to pull
without auth.

### Keep a local clone auto-updated (Windows)

If you deploy from a local Windows clone, `scripts/windows/` has a hidden background
updater: `update-neuroster.vbs` runs `git` with no visible window to keep the clone
matched to `main`, and `install-task.cmd` registers a Scheduled Task to run it every
15 minutes. See [`scripts/windows/README.md`](scripts/windows/README.md). (Needs Git for
Windows on `PATH` and credentials cached from your initial clone.)

### Serve live from the source folder (no rebuilds)

`docker-compose.live.yml` runs the official Node image with the source folder mounted
read-only, so a `git pull` on the source shows up on the next browser refresh. No build
and no image to maintain:

```bash
docker compose -f docker-compose.live.yml up -d
```

To serve on a different host port, change only the left number in its `ports` mapping.
Health check: `http://<server-ip>:8080/healthz` → `ok`.

### Controls
- **Build:** click a building in the Build panel, then **click the map** to place it (it reverts
  to the select cursor after; hold **Shift** to place several). **Right-click** or **Esc** cancels.
- **Tools (top bar):** **🐹 Animals**, **🏠 Buildings**, **🎩 Demolish**. Demolition only happens in
  **Demolish** mode — click a building, or **drag a box** to bulldoze several at once (no pop-up).
- **Direct a rodent:** select it, then **click a resource node** to send it gathering, a **Feeder/Well**
  to eat/drink, or any tile (even fogged) to go there. **Left-drag a box** to multi-select a group and
  order them all at once.
- **Camera:** **right-drag** pans · **mouse-wheel** zooms · **🏷️ Labels** shows names on the map.
- **Space** = pause/resume · **1 / 2 / 3** = game speed.
- The game **autosaves** per browser. **Time only passes while you play** — there's **no offline
  progress** (the world is exactly as you left it).

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
- **Living neighbours on the map**: each faction has a **camp** at the world's edge
  (coloured by your standing — green allied, red hostile), and **caravans visibly travel**
  between their camp and your colony — friendly deliveries (🎁/🆘) when you trade or call
  for aid, and war parties (⚔️) when they raid.
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
- **Start screen**: every launch opens on a cinematic loading screen (with a progress bar
  and the **version number**) that then offers **▶ Continue** or **🆕 New Colony** — press
  any key or click to begin. Background art lives in `assets/` (ships with an SVG scene;
  swap in your own — see [`assets/README.md`](assets/README.md)).
- **Built-in game guide**: the top-right **❓** button opens a sectioned guide — *Story,
  How to play, What things are, Progression, Choices, Hamsters & saves* — with quick-nav
  chips. It also opens automatically on your first visit so new players aren't lost.
- **Getting-started checklist**: a small on-map checklist of first steps (build a burrow,
  farm, well…) that **auto-ticks as you play** and tucks itself away once you're set up.
- **Sound effects** (synthesised, no asset files): satisfying cues for caring for a rodent,
  placing/finishing buildings, level-ups, milestones, trades, births, and warnings (raids /
  critical needs). Toggle with the **🔊** button — your choice is remembered.
- **Enrichment & the boredom↔curiosity loop**: build a **🧸 Toy Box**, **🎡 Fun Wheel** or
  **🌀 Hedge Maze** to keep rodents happy — but the wheel and maze are *distracting*, trading
  a little colony output for big Fun (a deliberate, capped tradeoff).
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
  factions.js    # neighbour camps on the map + trade/raid caravans
  audio.js       # synthesised sound effects (Web Audio, no asset files)
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
