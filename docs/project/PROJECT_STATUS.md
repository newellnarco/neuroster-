# Neuroster — Project Status (zero-API mirror)

> **Generated from `docs/project/board_state.json` by `tools/render_board.py`.** Read this file to answer *what's todo / done / in-CI / deferred* without hitting the GitHub API. It is rewritten on every push to `main` by the on-main compaction job (`compact_board_fragments` re-runs this renderer).

_board_state.json updated: 2026-09-21T22:10:10Z · 104 items_

## Summary

| Status | Count |
|---|---|
| In Progress | 0 |
| in CI | 0 |
| Todo | 0 |
| Planned | 0 |
| Backlog | 3 |
| Done | 1 |
| Shipped | 97 |
| Deferred | 2 |
| Closed-No-Op | 1 |
| **TOTAL** | **104** |

**98 landed on `main`** · **3 open** (in-CI / todo / planned / backlog).

## Outstanding work

| Status | Priority | Arch | Item | Issue | PR |
|---|---|---|---|---|---|
| Backlog | P3 | None | True isometric/dimetric camera + inverse picking | — | — |
| Backlog | P3 | None | Hand-drawn pixel sprite sheets (replace procedural vectors) | — | — |
| Backlog | P3 | RENDER | Full multi-level underground world view (descend/ascend, separate grid + render) | — | — |

## Deferred (intentional)

| Arch | Item | Issue | PR | Why |
|---|---|---|---|---|
| None | Selectable map size (world-dims refactor) | — | — | GRID_W×GRID_H are module constants; a per-world dimensions refactor is risky — deferred |
| None | Multiplayer / server-side state | — | — | No multiplayer; saves are per-browser localStorage (export/import to move machines) |

## Shipped / Done — by arch

### (misc) (47)

| Phase | Item | PR | Release |
|---|---|---|---|
| None | Hamster balls — free-roam transport (heat + anxiety) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| None | Directable exploration: scout waypoint | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| None | More NPC animal events (merchant, predator parley, aid requests) | [#46](https://github.com/newellnarco/neuroster-/pull/46) | `88e01b2` |
| None | Left-drag marquee multi-select | [#60](https://github.com/newellnarco/neuroster-/pull/60) | `4f7b06a` |
| None | Texture the remaining one-off building glyphs | [#45](https://github.com/newellnarco/neuroster-/pull/45) | `656ab96` |
| None | Persist zoom level per colony | [#50](https://github.com/newellnarco/neuroster-/pull/50) | `b4293ba` |
| None | Validate EVENT_PACE/GRACE feel across biomes & difficulties | [#48](https://github.com/newellnarco/neuroster-/pull/48) | `a27154b` |
| None | Scale feeder/waterer throughput with crowding | [#48](https://github.com/newellnarco/neuroster-/pull/48) | `a27154b` |
| None | Re-check starting economy after first-10-min playtests | [#48](https://github.com/newellnarco/neuroster-/pull/48) | `a27154b` |
| None | Extend BREEDS.difficulty to resource yields & breeding | [#48](https://github.com/newellnarco/neuroster-/pull/48) | `a27154b` |
| None | Workers path in straight lines (no obstacle/water avoidance) | [#49](https://github.com/newellnarco/neuroster-/pull/49) | `2c8095b` |
| None | Balance pass once conveyors & more buildings land | [#48](https://github.com/newellnarco/neuroster-/pull/48) | `a27154b` |
| None | Plastics & advanced refining (coal/oil → plastic) | [#47](https://github.com/newellnarco/neuroster-/pull/47) | `7a4e749` |
| None | Tunnels / underground levels (vertical expansion) | [#57](https://github.com/newellnarco/neuroster-/pull/57) | `3785819` |
| None | AI colonies compete for nodes + richer on-map diplomacy/combat | [#46](https://github.com/newellnarco/neuroster-/pull/46) | `88e01b2` |
| None | Job assignment UI (assign rodents to resources/buildings) | [#50](https://github.com/newellnarco/neuroster-/pull/50) | `b4293ba` |
| None | True movement/pathfinding (gate tunnels, gopher travel, dams) | [#52](https://github.com/newellnarco/neuroster-/pull/52) | `72a1348` |
| None | River geography for dams (real upstream tiles) | [#49](https://github.com/newellnarco/neuroster-/pull/49) | `2c8095b` |
| None | Disease/health events + quarantine; Infirmary | [#47](https://github.com/newellnarco/neuroster-/pull/47) | `7a4e749` |
| None | More milestones/achievements (first hybrid, day 30, apex evolution…) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| None | Promote Threats panel → Defense & Military screen | [#44](https://github.com/newellnarco/neuroster-/pull/44) | `7f9ff2e` |
| None | Species-specific evolution branches (beaver dams, rat swarms…) | [#47](https://github.com/newellnarco/neuroster-/pull/47) | `7a4e749` |
| None | Per-unit need decay modified by traits (Vigor) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| None | Tie Main Hamster level to more unlocks (buildings/species) | [#47](https://github.com/newellnarco/neuroster-/pull/47) | `7a4e749` |
| None | Build mode reverts to select after placing; re-click cancels | [#53](https://github.com/newellnarco/neuroster-/pull/53) | `3d89078` |
| None | Click a resource node with a rodent selected to send it gathering | [#53](https://github.com/newellnarco/neuroster-/pull/53) | `3d89078` |
| None | Calmer normal speed + roomier event cadence | [#53](https://github.com/newellnarco/neuroster-/pull/53) | `3d89078` |
| None | Any selected hamster can spend skill points (not just leader) | [#53](https://github.com/newellnarco/neuroster-/pull/53) | `3d89078` |
| None | Themed Settings window (matches start/hamster screens); drop import/export | [#55](https://github.com/newellnarco/neuroster-/pull/55) | `e5945f1` |
| None | Persistent on-map labels via the 🏷️ toggle (not hover-only) | [#55](https://github.com/newellnarco/neuroster-/pull/55) | `e5945f1` |
| None | Art-asset specification (docs/ART_SPEC.md) for sprite-sheet replacement art | [#56](https://github.com/newellnarco/neuroster-/pull/56) | `3101150` |
| None | Data-driven systems-map PNG diagram + generator (tools/gen_diagram.mjs) | [#56](https://github.com/newellnarco/neuroster-/pull/56) | `3101150` |
| None | Top-bar tool modes (👆 Select / 🎩 Demolish); building-click priority; direct-to-needs | [#59](https://github.com/newellnarco/neuroster-/pull/59) | `1d804ff` |
| None | Embed the systems-map PNG as a 🗺️ tab in the in-game Help guide | [#61](https://github.com/newellnarco/neuroster-/pull/61) | `ebde584` |
| None | Plant trees by species; oaks draw squirrels (over-plant → swarm raids food & water) | [#66](https://github.com/newellnarco/neuroster-/pull/66) | `d329e1f` |
| None | Crops, trees & animals take time to grow in before they're useful | [#67](https://github.com/newellnarco/neuroster-/pull/67) | `d0b8892` |
| None | Rabbits: carrot/cabbage gardens → manure → fertilizer, and predator bait | [#69](https://github.com/newellnarco/neuroster-/pull/69) | `cb00689` |
| None | Grain Silo (off-book grain storage) + Mill saves back seed grain | [#70](https://github.com/newellnarco/neuroster-/pull/70) | `c7d0209` |
| None | NPC animal communities: factions trade, war & form pacts with each other | [#71](https://github.com/newellnarco/neuroster-/pull/71) | `dd87333` |
| None | Varied wild flora — pine stands, berry bushes & wildflower meadows | [#73](https://github.com/newellnarco/neuroster-/pull/73) | `43b6a3c` |
| None | Richer terrain — hills (slow but passable), rocky cliff faces & raging rivers | [#74](https://github.com/newellnarco/neuroster-/pull/74) | `e184e76` |
| None | Living ecology — wild flora regrows & spreads (with a replant-only toggle) | [#75](https://github.com/newellnarco/neuroster-/pull/75) | `fedf110` |
| None | Beaver fishery — dams thin the downstream river, starving the beavers' fish | [#77](https://github.com/newellnarco/neuroster-/pull/77) | `a437308` |
| None | Ocean earthquakes → tsunami: sea recedes, then surges inland destroying all it reaches | [#78](https://github.com/newellnarco/neuroster-/pull/78) | `9f70935` |
| None | Coastal wading, salt water (undrinkable) & the undertow (click to rescue) | [#79](https://github.com/newellnarco/neuroster-/pull/79) | `5afed84` |
| None | Home NAS/Docker environment doc (specs, current use, other uses) | — | `—` |
| None | Automated marketing trailer (VO + hero cut-scenes) & website write-up with carousel | [#86](https://github.com/newellnarco/neuroster-/pull/86) | `—` |

### CREATURES (5)

| Phase | Item | PR | Release |
|---|---|---|---|
| 19b | Family lineage & names | — | `—` |
| 3 | Rodent species + recruiting + hybrids | — | `—` |
| 4 | Per-creature needs (food/water/energy/fun/health) | — | `—` |
| 5 | Sleep cycles per species/level | — | `—` |
| None | Breeding overhaul: sexes + maturity, burrow-based slower breeding, gentler wet tail, starting housing | [#54](https://github.com/newellnarco/neuroster-/pull/54) | `8c187b1` |

### DEFENSE (1)

| Phase | Item | PR | Release |
|---|---|---|---|
| 15c | Upgradeable tunnels + steel | — | `—` |

### ECON (7)

| Phase | Item | PR | Release |
|---|---|---|---|
| 1 | Core loop: gather → store → refine → build | — | `—` |
| 2 | Buildings & power automation (conveyors, plastic tier, belt networks) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| 2a | Multi-segment conveyor belt networks | [#44](https://github.com/newellnarco/neuroster-/pull/44) | `7f9ff2e` |
| 2b | Wood economy: denser trees, sunflower seeds, wooden power & mills, cistern, fence | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| 2c | Fertility, food chain & sanitation | — | `—` |
| None | Storage Depot capacity +200 → +1500 | [#44](https://github.com/newellnarco/neuroster-/pull/44) | `7f9ff2e` |
| None | Mine Shaft → deep underground resources (vertical expansion slice) | [#57](https://github.com/newellnarco/neuroster-/pull/57) | `3785819` |

### ECON-OAK (1)

| Phase | Item | PR | Release |
|---|---|---|---|
| 1 | Oak → squirrel / nut economy | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |

### ENGAGEMENT (5)

| Phase | Item | PR | Release |
|---|---|---|---|
| 16b | Gamified care + engagement loop | — | `—` |
| 17 | Quests / achievements / notifications (alert bar) | — | `—` |
| 17b | Construction & labour | — | `—` |
| 17c | Milestones / achievements | — | `—` |
| 17d | Sand Bath + burrow upkeep | — | `—` |

### ENGINE (2)

| Phase | Item | PR | Release |
|---|---|---|---|
| None | A* grid pathfinder core (pure module + tests) | [#52](https://github.com/newellnarco/neuroster-/pull/52) | `72a1348` |
| None | Movers follow cached A* paths (fallback to steering) | [#52](https://github.com/newellnarco/neuroster-/pull/52) | `72a1348` |

### INFRA (3)

| Phase | Item | PR | Release |
|---|---|---|---|
| 17e | Deployment (zero-dep server, Docker, /healthz) | — | `—` |
| None | Always-on Playwright + committed browser smoke | [#44](https://github.com/newellnarco/neuroster-/pull/44) | `7f9ff2e` |
| wall | Project board / wall (zero-API git-native tracker) | [#42](https://github.com/newellnarco/neuroster-/pull/42) | `3e058b1` |

### POWER (1)

| Phase | Item | PR | Release |
|---|---|---|---|
| 20 | ⚡ Power variety + 🏭 Pollution | — | `—` |

### PROD (1)

| Phase | Item | PR | Release |
|---|---|---|---|
| 1 | Production chain: Furnace / Forge / Mason + brick + armour | [#46](https://github.com/newellnarco/neuroster-/pull/46) | `88e01b2` |

### PROGRESSION (5)

| Phase | Item | PR | Release |
|---|---|---|---|
| 12 | Levels + skill tree + evolution tree | — | `—` |
| 13 | Founder hamster (breed + name + coat) | — | `—` |
| 14 | Login-gated time (no offline progress) | — | `—` |
| 16 | Megaprojects & long-horizon goals | — | `—` |
| 7 | Loyalty (join / desert, no rebelling) | — | `—` |

### RENDER (5)

| Phase | Item | PR | Release |
|---|---|---|---|
| 18 | Animation & realism polish + seasonal atmosphere + audio | [#45](https://github.com/newellnarco/neuroster-/pull/45) | `656ab96` |
| 18a | Map zoom + landscape scaling, center-on-town, event-log snap-to-top | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| 2b | Animated pixel-art top-angle rendering + plush HiDPI creatures | — | `—` |
| 2d | Procedural client-side textures + 64-colour palette | — | `—` |
| None | Double-stacked 4×2 folder-style section tabs | [#44](https://github.com/newellnarco/neuroster-/pull/44) | `7f9ff2e` |

### SOCIAL (8)

| Phase | Item | PR | Release |
|---|---|---|---|
| 15 | Competing/cooperative AI factions (diplomacy) | — | `—` |
| 15b | Morale & ethics (kindness vs preservation) | — | `—` |
| 15d | Leader / Town Hall (equity vs resentment) | — | `—` |
| 19 | 💗 Compassion & kindness | — | `—` |
| 19d | ⚖️ Justice/Order + moral Decrees | — | `—` |
| 19e | 🐾 NPC animal events + 🦁 Valor | — | `—` |
| 19f | 🎓 Doctrines (virtue-gated skill trees) | — | `—` |
| 19g | Beaver wood store + take-too-much sabotage | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |

### WORLD (7)

| Phase | Item | PR | Release |
|---|---|---|---|
| 10 | Weather per biome | — | `—` |
| 11 | Exploration / fog of war | — | `—` |
| 19c | Seasons & festivals | — | `—` |
| 6 | Predators & natural disasters | — | `—` |
| 6c | Surface vs underground resources | — | `—` |
| 8 | Biomes & selectable maps | — | `—` |
| 9 | Day/night cycle (1 day = 15 min) | — | `—` |

---

_To update state: drop a fragment into `docs/project/board_entries/` (NEVER hand-edit board_state.json — see README.md, the fragment-collision-avoidance trick) and let the on-main compaction job fold it in + re-render this file. To compact + render locally, run `python tools/compact_board_fragments.py`._
