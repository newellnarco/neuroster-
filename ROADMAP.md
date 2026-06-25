# 🐹 Neuroster — Living Roadmap & Arcs

A session-to-session tracker. **Arcs** are big feature threads; the **Backlog** lists
concrete fix / add / change items; **Recommendations** are ideas to pull from freely
(no gating — grab whatever raises the fun/retention bar next).

> Update this file every session: tick off what shipped, append what's new, and
> leave a "Continue here" note at the bottom so the next session can resume fast.

_Last updated: 2026-06-25 — through the founder/breeds + world-systems expansion._

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
| 15 | Competing/cooperative AI factions (diplomacy) | ✅ Shipped | **Trading Hut**: gift/barter/request-aid with 4 animal factions; standing shifts alliances; **hoarding coveted goods invites raids** that steal supplies & smash walls/houses/storage |
| 15b | Morale & ethics ("kindness vs preservation") | ✅ Shipped | Unburied dead & untreated injuries crush **morale**; **lethal defenses cost morale** — but a **Vet Clinic lets you heal repelled raiders** (morale up, they may **join you**, faction warms); **tiered burials** (Dirt→Crypts→Mausoleum) restore morale by respect |
| 15c | Upgradeable tunnels + steel | ✅ Shipped | Tunnels protect travel & bar other animals; have **HP**, take damage from attacks/raids/disasters, and **upgrade wood→iron→steel** (new **Steel** from a **Steelworks**); click to upgrade/repair |
| 15d | Leader / Town Hall (equity) | ✅ Shipped | The leader rules by example — Town Hall (Meeting Burrow→Town Hall→Grand Hall) gives a colony-wide **leadership** boost (output, teaching XP, breeding), but a hall too lavish for everyone's **amenities breeds resentment** (morale/fun/output fall). Tunnels & conveyors now **visually connect** into networks (with a gap for the traveling hamster). |
| 16 | Megaprojects & long-horizon goals | 🔴 Planned | Grand Wheel, Citadel; retention anchors |
| 16b | Gamified care + engagement loop | ✅ Shipped | Hands-on Feed/Water/Play/Pet with reward FX, **bond** (affection→productivity+loyalty), caretaker/auto-waterer automation to ease scale |
| 17 | Quests / achievements / notifications | 🔴 Planned | The "neurotic check-in" hook |
| 17b | Construction & labour | ✅ Shipped | Buildings & upgrades take **time**, built by awake rodents; more builders = faster, diverting them slows gathering/production; higher tiers take longer; construction-site visuals + progress bars |
| 17c | Milestones / achievements | ✅ Shipped | 16 goals with reward drip + HUD tracker (retention) |
| 17d | Sand Bath + burrow upkeep | ✅ Shipped | Sand Bath cleans hamsters (health + anti-wet-tail hygiene); **burrows degrade if not cleaned** (lose housing/breeding) — caretakers auto-clean or click to clean |
| 17e | Deployment | ✅ Shipped | Zero-dep configurable server (HOST/IP/PORT), Docker + compose, /healthz |
| 18 | Animation & realism polish | 🟡 Ongoing | Swaying trees/crops, chimney smoke, water droplets, lab glow, fireflies/pollen, rodent ear-twitch/sniff. More to add (audio, more building anims). |

---

## Backlog

### 🛠️ Fix
- [ ] Conveyors exist only as concept — no placeable belt or logistics speed-up yet.
- [ ] `BREEDS.*.difficulty` now scales disasters ✅ — extend it to resource yields & breeding too.
- [ ] Workers path in straight lines (no obstacle/water avoidance) — acceptable, revisit if it reads odd.
- [ ] Long unit lists capped at 40 in the Rodents panel — add scrolling/grouping for big colonies.
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
- [ ] **AI colonies** — neighboring rodent settlements: predatory (raid you),
      competing (race for nodes), cooperative (alliances, trade caravans).
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
- [ ] **Distraction/entertainment objects** — toys, wheels-for-fun, mazes that trade a
      little productivity for big Fun (boredom relief) — deepen boredom↔curiosity loop.
- [ ] **Disease/health events** + quarantine; Infirmary becomes essential in marsh.
- [ ] **Notifications/alerts** when a need bottoms out or a raid looms (retention).
- [ ] **Save slots / multiple colonies**; export/import save.
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

- The game is fully playable end-to-end: character creation (breed + name + biome) →
  fog-revealed world → gather/build/refine → manage per-creature needs & sleep →
  level up, research skills, evolve species → survive weather, day/night, predators &
  disasters. Autosaves; no offline progress by design.
- **Best next step:** implement **Arc 2 — conveyor belt tiers** (placeable logistics that
  move resources automatically), since it's the keystone for the automation arc and is
  referenced throughout the original design. Data scaffold: add belt buildings to
  `BUILDINGS` with a `belt: { tier, throughput }` field and a transport pass in
  `economy.js` that ships from mines/nodes to nearest storage.
- After that, **Arc 15 — AI colonies** is the biggest fun multiplier.
- Keep verifying with the headless + Playwright smoke tests before each push.
