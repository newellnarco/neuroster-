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
| 2b | Animated, pixel-art top-angle rendering | ✅ Shipped | Procedural animated rodents (walk cycle, facing, sleep), spinning wheel + runner, scrolling conveyors, textured 3/4 terrain w/ depth, weather particles |
| 3 | Rodent species + recruiting + hybrids | ✅ Shipped | 6 species, hybrid breeding blends traits |
| 4 | Per-creature needs (food/water/energy/fun/health) | ✅ Shipped | Drives per-unit productivity & loyalty |
| 5 | Sleep cycles per species/level | ✅ Shipped | Nocturnal/diurnal/crepuscular phases |
| 6 | Predators & natural disasters | ✅ Shipped | Wolf/Hawk/Raid/Flood/Quake + counters |
| 7 | Loyalty (join / desert, no rebelling) | ✅ Shipped | Thriving → joiners; neglected → desertion |
| 8 | Biomes & selectable maps | ✅ Shipped | 7 biomes w/ terrain, resource & hazard profiles |
| 9 | Day/night cycle (1 day = 15 min) | ✅ Shipped | Tints world; shifts predator/species activity |
| 10 | Weather per biome | ✅ Shipped | 8 weathers with gameplay effects |
| 11 | Exploration / fog of war | ✅ Shipped | Persistent reveal, regenerates only on new game |
| 12 | Levels + Skill tree + Evolution tree | ✅ Shipped | XP→levels→skill points; species evolutions |
| 13 | Founder hamster (breeds + name) | ✅ Shipped | Syrian/Russian/Robo/Chinese; rename / 30 days |
| 14 | Login-gated time (no offline progress) | ✅ Shipped | World is exactly as left |
| 15 | Competing/cooperative AI colonies (diplomacy) | 🔴 Planned | Alliances, rivals, raids, trade |
| 16 | Megaprojects & long-horizon goals | 🔴 Planned | Grand Wheel, Citadel; retention anchors |
| 17 | Quests / achievements / notifications | 🔴 Planned | The "neurotic check-in" hook |
| 18 | Art, audio & tutorial polish | 🔴 Planned | Sprites, SFX, onboarding |

---

## Backlog

### 🛠️ Fix
- [ ] Conveyors exist only as concept — no placeable belt or logistics speed-up yet.
- [ ] `BREEDS.*.difficulty` now scales disasters ✅ — extend it to resource yields & breeding too.
- [ ] Workers path in straight lines (no obstacle/water avoidance) — acceptable, revisit if it reads odd.
- [ ] Long unit lists capped at 40 in the Rodents panel — add scrolling/grouping for big colonies.
- [ ] Balance pass: tune drains/yields once conveyors & more buildings land.

### ➕ Add
- [x] **Conveyor belts** (wood + metal tiers) auto-move resources from nearby nodes to
      storage, animated. ↳ still to add: **plastic tier** + **multi-segment belt networks**
      (chain belts node→belt→belt→storage with direction).
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
- [ ] **New-game difficulty & density options** — sliders for resource density,
      disaster frequency, map size; surfaced in character creation.
- [ ] **Job assignment UI** — let players assign specific rodents to resources/buildings
      (currently auto by `prefKind`).
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
