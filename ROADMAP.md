# 🐹 Neuroster — Living Roadmap & Arcs

A session-to-session tracker. **Arcs** are big feature threads; the **Backlog** lists
concrete fix / add / change items; **Recommendations** are ideas to pull from freely
(no gating — grab whatever raises the fun/retention bar next).

> Update this file every session: tick off what shipped, append what's new, and
> leave a "Continue here" note at the bottom so the next session can resume fast.

_Last updated: 2026-06-25 — added the alert/notification bar (Arc 17), megaprojects (Arc 16) & save export/import._

---

## How to work this roadmap (the feedback loop)

1. **Pick an arc or backlog item** (or a recommendation to promote into the backlog).
2. **Build it data-first** — most content lives in `src/config.js`; engine code only
   when a system is genuinely new.
3. **Verify**: headless smoke test (Node) for simulation logic + a Playwright load for
   the UI (zero console errors). Patterns already exist in scratchpad history.
4. **Tick it off here**, add any follow-ups discovered, update "Continue here".
5. **Commit & push**; the PR updates automatically.

This loop is meant to compound: each layer unlocks new adjacent layers (e.g. conveyors
→ logistics networks → factory planning → automation prestige).

---

## Arcs

| # | Arc | Status | Notes |
|---|-----|--------|-------|
| 1 | Core loop: gather → store → refine → build | ✅ Shipped | Workers auto-gather/haul; refining via Sawmill/Smelter |
| 2 | Buildings & power automation | 🟡 Partial | Wheel→Power done; **animated conveyor belts (wood + metal) ship & auto-haul from nodes**; plastic tier + belt networks pending |
| 2b | Animated, pixel-art top-angle rendering | ✅ Shipped | Animated rodents, wheel, conveyors; **blended/feathered terrain edges** (seamless, no hard squares); soft blur; fertile-soil tint; waste specks; sick markers |
| 2c | Fertility, food chain & sanitation | ✅ Shipped | **Fertile ground near water** boosts farms; food chain **wheat→grain→pellets** (premium nourishment); **droppings → wet tail disease + Vet Clinic**; **Composter → fertilizer** speeds/upgrades food; waste blocks building |
| 3 | Rodent species + recruiting + hybrids | ✅ Shipped | 7 species (+**gopher**), hybrid breeding; **guinea-pig guards/soldiers** (def/atk), **gophers auto-repair mines fast**, **beavers build Dams**; **Tunnels** shield movement |
| 4 | Per-creature needs (food/water/energy/fun/health) | ✅ Shipped | Drives per-unit productivity & loyalty |
| 5 | Sleep cycles per species/level | ✅ Shipped | Nocturnal/diurnal/crepuscular phases |
| 6 | Predators & natural disasters | ✅ Shipped | Wolf/Hawk/Raid/Flood/Quake + counters; **floods are double-edged** (seeds+fertility vs damage/drowned mines, gated by levees) |
| 6c | Surface vs underground resources | ✅ Shipped | Trees/rocks/bushes harvested by rodents & **recede visually** (2.5D sprites); iron/coal need a placed **Mine** showing remaining until it **collapses**; mines can **flood & need repair** |
| 7 | Loyalty (join / desert, no rebelling) | ✅ Shipped | Thriving → joiners; neglected → desertion |
| 8 | Biomes & selectable maps | ✅ Shipped | 7 biomes w/ terrain, resource & hazard profiles |
| 9 | Day/night cycle (1 day = 15 min) | ✅ Shipped | Tints world; shifts predator/species activity |
| 10 | Weather per biome | ✅ Shipped | 8 weathers with gameplay effects |
| 11 | Exploration / fog of war | ✅ Shipped | Persistent reveal, regenerates only on new game |
| 12 | Levels + Skill tree + Evolution tree | ✅ Shipped | XP→levels→skill points; species evolutions |
| 13 | Founder hamster (breeds + name) | ✅ Shipped | Syrian/Russian/Robo/Chinese; rename / 30 days |
| 14 | Login-gated time (no offline progress) | ✅ Shipped | World is exactly as left |
| 15 | Competing/cooperative AI factions (diplomacy) | ✅ Shipped | **Trading Hut**: gift/barter/request-aid with 4 animal factions; standing shifts alliances; **hoarding coveted goods invites raids** that steal supplies & smash walls/houses/storage. **Living neighbours (`factions.js`)**: each faction has a **camp on the map** (revealed from the start, coloured by standing), and **caravans visibly travel camp→colony** on trades/aid (🎁/🆘) and raids (⚔️) |
| 15b | Morale & ethics ("kindness vs preservation") | ✅ Shipped | Unburied dead & untreated injuries crush **morale**; **lethal defenses cost morale** — but a **Vet Clinic lets you heal repelled raiders** (morale up, they may **join you**, faction warms); **tiered burials** (Dirt→Crypts→Mausoleum) restore morale by respect |
| 15c | Upgradeable tunnels + steel | ✅ Shipped | Tunnels protect travel & bar other animals; have **HP**, take damage from attacks/raids/disasters, and **upgrade wood→iron→steel** (new **Steel** from a **Steelworks**); click to upgrade/repair |
| 15d | Leader / Town Hall (equity) | ✅ Shipped | The leader rules by example — Town Hall (Meeting Burrow→Town Hall→Grand Hall) gives a colony-wide **leadership** boost (output, teaching XP, breeding), but a hall too lavish for everyone's **amenities breeds resentment** (morale/fun/output fall). Tunnels & conveyors now **visually connect** into networks (with a gap for the traveling hamster). |
| 16 | Megaprojects & long-horizon goals | ✅ Shipped | **Contribute-over-many-sessions** wonders: 🎡 Grand Wheel (+50% production & free power), 🏰 Citadel (+90 defense, +45 protection vs every threat), 🌾 Great Granary (+1800 storage, +60% food), 🗿 Eternal Monument (leadership, faster breeding, steady morale). Level-gated; pour surplus into them via the **Mega** tab; permanent colony-wide payoff + milestone |
| 16b | Gamified care + engagement loop | ✅ Shipped | Hands-on Feed/Water/Play/Pet with reward FX, **bond** (affection→productivity+loyalty), caretaker/auto-waterer automation to ease scale |
| 17 | Quests / achievements / notifications | ✅ Shipped | **Live alert bar** (`src/alerts.js`): prioritized, colour-coded HUD banner surfacing critical needs, sickness, unburied dead, degraded burrows, flooded mines, low morale, full housing/storage, **imminent raids & disasters** (defense-aware), desertion risk + engagement nudges (unspent skill points). Click an alert to jump to the right panel; new criticals ping the flash. Pairs with milestones (17c) |
| 17b | Construction & labour | ✅ Shipped | Buildings & upgrades take **time**, built by awake rodents; more builders = faster, diverting them slows gathering/production; higher tiers take longer; construction-site visuals + progress bars |
| 17c | Milestones / achievements | ✅ Shipped | 16 goals with reward drip + HUD tracker (retention) |
| 17d | Sand Bath + burrow upkeep | ✅ Shipped | Sand Bath cleans hamsters (health + anti-wet-tail hygiene); **burrows degrade if not cleaned** (lose housing/breeding) — caretakers auto-clean or click to clean |
| 17e | Deployment | ✅ Shipped | Zero-dep configurable server (HOST/IP/PORT), Docker + compose, /healthz |
| 18 | Animation & realism polish | 🟡 Ongoing | Swaying trees/crops, chimney smoke, water droplets, lab glow, fireflies/pollen, rodent ear-twitch/sniff. **Synthesised audio** (`audio.js`): UI/action cues + a living **ambient soundscape** — wind, rain, running water & fire beds that follow weather/biome, plus scheduled **birds (day), crickets (night), happy chittering/purring (only when safe & content), nibbling, thunder**, and a **scared hamster scream** on raids. 🔊 mute toggle. |

---

## Backlog

### 🛠️ Fix
- [ ] Conveyors exist only as concept — no placeable belt or logistics speed-up yet.
- [ ] `BREEDS.*.difficulty` now scales disasters ✅ — extend it to resource yields & breeding too.
- [ ] Workers path in straight lines (no obstacle/water avoidance) — acceptable, revisit if it reads odd.
- [~] Long unit lists still cap at 40 (perf), but the Rodents panel now shows a **per-species
      count summary** (+ sleeping/sick) and a "showing top 40 of N" note, so big colonies read
      at a glance. Full per-species grouping/scrolling still optional.
- [ ] Balance pass: tune drains/yields once conveyors & more buildings land.

### ➕ Add
- [x] **Conveyor belts** — all three tiers now shipped: **wood → plastic → metal**
      (plastic from a new Refinery: coal → plastic). Still to add: **multi-segment belt
      networks** (chain belts node→belt→belt→storage with direction).
- [ ] **True isometric/dimetric camera** — current view is a faux-3D 3/4 angle (depth via
      tile bevels, shadows & raised objects) that keeps the grid 1:1 for exact clicking.
      A real iso projection (+ inverse picking) would deepen the WC2/WC3 feel; larger refactor.
- [ ] **Hand-drawn pixel sprite sheets** to replace the procedural vector creatures/tiles
      once the style is locked (keep the smooth animation, swap the art).
- [ ] **Plastics & advanced refining** (Refinery: coal/oil → plastic) feeding belts & T3 buildings.
- [ ] **Tunnels / underground levels** — dig burrow networks; vertical expansion.
- [ ] **Biome-unique disasters** — beach tsunami, mountain avalanche, marsh disease
      (marsh already flags `hazardMul` hooks; add the event types).
- [~] **AI colonies** — neighboring settlements now have **camps on the map + caravans**
      (predatory raids & cooperative trade/aid deliveries are visible). Still to add:
      **competing** for nodes (race you to resources) and richer on-map diplomacy/combat.
- [x] **New-game difficulty & density options** — Relaxed/Normal/Harsh (scales danger &
      starting stock) and Sparse/Normal/Rich resource density, in character creation.
- [x] **Biome-unique disasters** — tsunami/avalanche/blight/sandstorm/wildfire per biome.
- [ ] **Job assignment UI** — let players assign specific rodents to resources/buildings
      (currently auto by `prefKind`).
- [ ] **True movement/pathfinding** — so Tunnels can physically gate/route movement and
      block other animals, and gophers literally travel underground between holes
      (currently abstracted as protection + faster repairs).
- [ ] **River geography for dams** — model real upstream tiles so a dam visibly dries the
      flow above it and irrigates below (currently a global upstream-flow penalty).
- [x] **Distraction/entertainment objects** — 🧸 Toy Box, 🎡 Fun Wheel & 🌀 Hedge Maze:
      big Curiosity relief, and the wheel/maze add a colony-wide **distraction** that trades
      a little output for fun (capped at −20%). Deepens the boredom↔curiosity loop.
- [ ] **Disease/health events** + quarantine; Infirmary becomes essential in marsh.
- [x] **Notifications/alerts** when a need bottoms out or a raid looms (retention) — shipped as the live alert bar (`src/alerts.js`).
- [x] **Export/import save** (file download + file load, with validation & typed-array reattach).
- [x] **Multiple save slots** — one slot per hamster colony; the start screen lists them
      (📂 Load) and jumps into any one's latest autosave; **Save As** forks a new named
      hamster; legacy single-save auto-migrates. Plus a versioned start/loading screen.
- [ ] **Milestones & achievements** (first hybrid, day 30 survived, apex evolution…).

### 🔁 Change
- [ ] Promote "Threats" panel into a fuller **Defense & Military** screen (offense raids vs AI colonies).
- [ ] Expand the Evolution tree into species-specific branches (beaver dams, rat swarms…).
- [ ] Per-unit need decay modified by traits (Vigor) — partially via evolutions; make per-unit Vigor matter.
- [ ] Tie **Main Hamster level** to more unlocks (buildings/species), not just a few evolutions.

---

## Recommendations (pull from freely — no gate)

Ranked by impact on the "build, maintain, keep coming back" fantasy:

1. **Conveyors + plastics** — the automation power-fantasy the original pitch centered on.
   Highest payoff; everything else (factory planning, prestige) builds on it.
2. **AI colonies & alliances** — adds strategy, stakes, and social texture; turns a
   builder into a *world*. Predatory/competing/cooperative as requested.
3. **Notifications + milestones + offline "report"** (without offline *progress*) —
   the retention engine. Tell returning players what needs attention.
4. **Megaprojects** — multi-session goals (Grand Wheel powers the whole colony; Citadel
   is the ultimate defense) so there's always a distant carrot.
5. **Difficulty/density options + biome-unique disasters** — replayability; each start
   feels distinct (ties to the founder-breed variety already in place).
6. **Tunnels/underground** — spatial novelty and a reason to keep expanding.
7. **Art & audio + tutorial** — once systems settle, polish converts curiosity to retention.

---

## Engagement & pacing philosophy

The game should **reward interaction without punishing absence-for-a-few-minutes**:
- **Needs drain over minutes, not seconds** (tuned so a stocked colony is fine for a
  while). 1 day = 15 min sets the rhythm.
- **Hands-on care (Feed/Play/Pet/Water)** gives an instant boost + reward FX + **bond**
  — the satisfying micro-interaction ("serotonin hit"). Cooldowns reward *periodic*
  check-ins over frantic clicking.
- **Bond → productivity & loyalty**: caring visibly pays off, but decays slowly so you
  come back. Things **take time** (gather/build/level) so progress feels earned.
- **Automation eases scale, never removes the player**: feeders, auto-waterers, caretaker
  huts, conveyors, mines reduce micromanagement as colonies grow — but optimizing,
  expanding, evolving and defending always invite more interaction.
- **Next for retention:** notifications/milestones (Arc 17) and megaprojects (Arc 16),
  plus a "while-you-were-away report" (status only — still no offline *progress*).

## Continue here (next session)

**Current state (all verified, on branch `claude/hamster-game-design-jz3j0f`, PR #1):**
The game is a deep, fully-playable colony sim. End-to-end loop:
character creation (breed + name + **difficulty** + **density** + biome) → fog-revealed,
biome-shaped world → rodents gather **surface** resources (receding 2.5D trees/rocks/
bushes) & **mine** underground seams → **timed construction** (workers build; more = faster)
→ refine (**wheat→grain→pellets**, **wood/iron/steel/plastic**, food chain) → automate
(wheels, **wood→plastic→metal conveyors**, mines, caretakers) → manage **per-creature
needs/sleep/bond**, **sanitation** (poop → wet tail → vet, **burrow upkeep**, **sand baths**,
compost→fertilizer) → **lead** (Town Hall equity vs resentment) → **diplomacy** (Trading Hut,
alliances, faction raids) → **morale/ethics** (bury the dead in tiered graves, heal raiders
for mercy vs kill) → survive **day/night, weather, predators, biome-unique disasters,
floods (floodable mines)** with tunnels/walls/towers/levees/species guards. Milestones,
autosave (no offline progress), and a **deployable server (Docker, configurable IP/port)**.

**Architecture reminders:**
- Data-driven: most content lives in `src/config.js`. Engine in `src/*.js` (ESM).
- Per-tick sim order in `economy.js`: environment → AI → construction/burrows → recompute
  → leadership → production → needs → exploration → sanitation/disease → breeding/loyalty/
  morale → events/factions → milestones/fx.
- `state._laborFactor`, `_leadership`, `_envMods`, `_hygiene` etc. are per-tick caches.
- Verify every change with: `node --check` all files, a headless `stepEconomy` smoke
  (see scratchpad history), and a Playwright load (zero console errors).

**Shipped this session:** the live **alert bar** (Arc 17, `src/alerts.js` — purely derived,
nothing persisted), **megaprojects** (Arc 16, `src/megaprojects.js` + `MEGAPROJECTS` in
config; contribute-over-time, bonuses folded into economy/events/recompute via the
`state._mega` per-tick cache), **save export/import** (`save.js` + topbar buttons +
`game.js` download/upload handlers), a first-run **How-to-Play overlay** (`#help-modal`,
auto-opens once via a `neuroster.seenHelp` flag), **CI** (`.github/workflows/ci.yml`
running `npm test` → `test/smoke.mjs`, the committed headless verification), and
**living-neighbour factions** (`factions.js` — camps on the map + trade/raid caravans,
back-filled onto old saves via `ensureCamps`).

**Best next steps (highest value first):**
1. **Deepen AI colonies** — camps & caravans now exist (`factions.js`); next give camps
   real behaviour: **compete for resource nodes**, grow/shrink with their standing, and
   let players send their own caravans (trade missions) or war parties back.
2. **True pathfinding** (bigger refactor) — makes tunnels physically gate movement,
   gophers travel underground, and dams use real river geography (currently abstracted).
3. **Audio + tutorial/onboarding** — ✅ shipped: synthesised `audio.js` cues + 🔊 toggle,
   a first-run How-to-Play overlay, AND a **Getting-started checklist** that auto-ticks
   first steps. Next polish: an ambient day/night soundscape and contextual tips.
4. **Multiple named save slots** — export/import landed; per-slot management is the
   remaining piece (UI for naming/listing/switching colonies).
5. **More megaprojects & a megaproject site on the map** — currently abstract (contribute
   from anywhere); placing a wonder footprint that builds up visually would deepen them.

**Megaproject integration notes (for whoever extends them):**
- `megaBonuses(state)` is summed each tick into `state._mega`; read it where bonuses apply
  (economy production/mine/storage/defense/morale/breeding; `protectionAgainst` in events).
- Effects are additive across completed projects; add a new project by editing
  `MEGAPROJECTS` in config — only add engine code if it introduces a NEW effect key.
- Contribution is capped per click (`MAX_PER_CLICK`) so progress always feels deliberate.

**Known abstractions (logged, not bugs):** tunnel movement-gating, gopher underground
travel, dam upstream geography, and belt "networks" are approximated (no pathfinding).
