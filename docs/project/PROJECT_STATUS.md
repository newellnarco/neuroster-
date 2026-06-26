# Neuroster — Project Status (zero-API mirror)

> **Generated from `docs/project/board_state.json` by `tools/render_board.py`.** Read this file to answer *what's todo / done / in-CI / deferred* without hitting the GitHub API. It is rewritten on every push to `main` by the on-main compaction job (`compact_board_fragments` re-runs this renderer).

_board_state.json updated: 2026-06-26T06:50:24Z · 73 items_

## Summary

| Status | Count |
|---|---|
| In Progress | 2 |
| in CI | 0 |
| Todo | 3 |
| Planned | 0 |
| Backlog | 19 |
| Done | 0 |
| Shipped | 45 |
| Deferred | 4 |
| Closed-No-Op | 0 |
| **TOTAL** | **73** |

**45 landed on `main`** · **24 open** (in-CI / todo / planned / backlog).

## Outstanding work

| Status | Priority | Arch | Item | Issue | PR |
|---|---|---|---|---|---|
| In Progress | P2 | ECON | Multi-segment conveyor belt networks | — | — |
| In Progress | P3 | None | Promote Threats panel → Defense & Military screen | — | [#43](https://github.com/newellnarco/neuroster-/pull/43) |
| Todo | P2 | RENDER | Animation & realism polish + seasonal atmosphere + audio | — | — |
| Todo | P2 | None | AI colonies compete for nodes + richer on-map diplomacy/combat | — | — |
| Todo | P3 | None | Job assignment UI (assign rodents to resources/buildings) | — | [#43](https://github.com/newellnarco/neuroster-/pull/43) |
| Backlog | P2 | PROD | Production chain: Furnace / Forge / Mason + brick + armour | — | — |
| Backlog | P2 | None | Validate EVENT_PACE/GRACE feel across biomes & difficulties | — | — |
| Backlog | P2 | None | True movement/pathfinding (gate tunnels, gopher travel, dams) | — | — |
| Backlog | P3 | None | More NPC animal events (merchant, predator parley, aid requests) | — | — |
| Backlog | P3 | None | Texture the remaining one-off building glyphs | — | — |
| Backlog | P3 | None | Persist zoom level per colony | — | — |
| Backlog | P3 | None | Scale feeder/waterer throughput with crowding | — | — |
| Backlog | P3 | None | Re-check starting economy after first-10-min playtests | — | — |
| Backlog | P3 | None | Extend BREEDS.difficulty to resource yields & breeding | — | — |
| Backlog | P3 | None | Workers path in straight lines (no obstacle/water avoidance) | — | — |
| Backlog | P3 | None | Balance pass once conveyors & more buildings land | — | — |
| Backlog | P3 | None | True isometric/dimetric camera + inverse picking | — | — |
| Backlog | P3 | None | Hand-drawn pixel sprite sheets (replace procedural vectors) | — | — |
| Backlog | P3 | None | Plastics & advanced refining (coal/oil → plastic) | — | — |
| Backlog | P3 | None | Tunnels / underground levels (vertical expansion) | — | — |
| Backlog | P3 | None | River geography for dams (real upstream tiles) | — | — |
| Backlog | P3 | None | Disease/health events + quarantine; Infirmary | — | — |
| Backlog | P3 | None | Species-specific evolution branches (beaver dams, rat swarms…) | — | — |
| Backlog | P3 | None | Tie Main Hamster level to more unlocks (buildings/species) | — | — |

## Deferred (intentional)

| Arch | Item | Issue | PR | Why |
|---|---|---|---|---|
| None | Left-drag marquee multi-select | — | — | Deferred: the auto-sim has no unit commands to apply to a selection |
| None | Selectable map size (world-dims refactor) | — | — | GRID_W×GRID_H are module constants; a per-world dimensions refactor is risky — deferred |
| None | Multiplayer / server-side state | — | — | No multiplayer; saves are per-browser localStorage (export/import to move machines) |
| None | Legacy Synology Docker can't import compose | — | — | Deploy is a hand-made container (see README |

## Shipped / Done — by arch

### (misc) (4)

| Phase | Item | PR | Release |
|---|---|---|---|
| None | Hamster balls — free-roam transport (heat + anxiety) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| None | Directable exploration: scout waypoint | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| None | More milestones/achievements (first hybrid, day 30, apex evolution…) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| None | Per-unit need decay modified by traits (Vigor) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |

### CREATURES (4)

| Phase | Item | PR | Release |
|---|---|---|---|
| 19b | Family lineage & names | — | `—` |
| 3 | Rodent species + recruiting + hybrids | — | `—` |
| 4 | Per-creature needs (food/water/energy/fun/health) | — | `—` |
| 5 | Sleep cycles per species/level | — | `—` |

### DEFENSE (1)

| Phase | Item | PR | Release |
|---|---|---|---|
| 15c | Upgradeable tunnels + steel | — | `—` |

### ECON (4)

| Phase | Item | PR | Release |
|---|---|---|---|
| 1 | Core loop: gather → store → refine → build | — | `—` |
| 2 | Buildings & power automation (conveyors, plastic tier, belt networks) | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| 2b | Wood economy: denser trees, sunflower seeds, wooden power & mills, cistern, fence | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| 2c | Fertility, food chain & sanitation | — | `—` |

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

### INFRA (2)

| Phase | Item | PR | Release |
|---|---|---|---|
| 17e | Deployment (zero-dep server, Docker, /healthz) | — | `—` |
| wall | Project board / wall (zero-API git-native tracker) | [#42](https://github.com/newellnarco/neuroster-/pull/42) | `3e058b1` |

### POWER (1)

| Phase | Item | PR | Release |
|---|---|---|---|
| 20 | ⚡ Power variety + 🏭 Pollution | — | `—` |

### PROGRESSION (5)

| Phase | Item | PR | Release |
|---|---|---|---|
| 12 | Levels + skill tree + evolution tree | — | `—` |
| 13 | Founder hamster (breed + name + coat) | — | `—` |
| 14 | Login-gated time (no offline progress) | — | `—` |
| 16 | Megaprojects & long-horizon goals | — | `—` |
| 7 | Loyalty (join / desert, no rebelling) | — | `—` |

### RENDER (3)

| Phase | Item | PR | Release |
|---|---|---|---|
| 18a | Map zoom + landscape scaling, center-on-town, event-log snap-to-top | [#43](https://github.com/newellnarco/neuroster-/pull/43) | `1546f53` |
| 2b | Animated pixel-art top-angle rendering + plush HiDPI creatures | — | `—` |
| 2d | Procedural client-side textures + 64-colour palette | — | `—` |

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
