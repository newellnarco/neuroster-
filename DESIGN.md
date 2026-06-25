# Neuroster — Game Design Document

> A web-based, world-building resource & colony game in the spirit of the original
> *Warcraft*/*Settlers* lineage — but the workers are **hamsters**, and the world is
> a sprawling rodent civilization you build, automate, defend, and grow forever.

---

## 1. High-Concept

You are the unseen steward of a **hamster colony**. Hamsters mine and gather raw
materials, haul them back to storage, refine them into better materials, and use
those materials to build an ever-larger, ever-more-automated settlement.

Over time you reduce manual labor (hamsters running on wheels, hand-hauling) by
unlocking **automation** (rolling logs → wood conveyors → plastic conveyors → metal
conveyors) and by recruiting **other rodents** — guinea pigs, gerbils, mice, rats,
beavers — each species specialized to make the colony more efficient.

It is an **ongoing, persistent** game: there is no "win screen." Players are
enticed to keep returning to expand, optimize, defend, and beautify their world.

### Pillars
1. **Gather → Store → Refine → Build → Automate** — a satisfying core loop.
2. **From manual to automatic** — the fantasy of replacing toil with machines & helpers.
3. **A living rodent society** — many species, each meaningful.
4. **Persistent world-building** — long-horizon progression, always something next.
5. **Light conflict** — predators/raiders create stakes for walls & defenses without
   making the game stressful.

---

## 2. Core Loop

```
        ┌─────────────────────────────────────────────┐
        │                                             │
   MINE raw materials  ──►  HAUL to STORAGE  ──►  REFINE materials
        ▲                                             │
        │                                             ▼
   UPGRADE skills/tech  ◄──  BUILD structures  ◄──  SPEND materials
        ▲                                             │
        │                                             ▼
   RECRUIT rodents  ──►  AUTOMATE (wheels, conveyors)  ──►  more output
```

Each cycle the colony produces more, faster, with less manual input — funding the
next tier of buildings, research, and species.

---

## 3. Resources

### Raw (gathered from the world)
| Resource | Source node | Notes |
|----------|-------------|-------|
| Wood     | Trees       | First building material & first conveyor tier |
| Stone    | Rock outcrops | Walls, foundations |
| Iron ore | Ore veins   | Refined into iron |
| Coal     | Coal seams  | Fuel for smelting & refining |
| Seeds    | Wild plants | Planted on farms → grain |
| Grain/Food | Farms      | Feeds population, fuels wheels |

### Refined (produced by buildings)
| Resource | Building | Inputs |
|----------|----------|--------|
| Planks   | Sawmill  | Wood |
| Iron     | Smelter  | Iron ore + Coal |
| Plastic  | Refinery | (late) Coal/oil byproducts |
| Power    | Wheel Generators | Food (rodents run wheels) |

### Abstract
- **Power** — drives automation speed (conveyors, refineries, automated mines).
- **Research points** — earned passively + from special buildings; spent on the tech tree.

---

## 4. Units (Rodents)

Each species is a "worker class" with a specialty. Hamsters are the backbone; the
others are recruited later to specialize and de-manualize labor.

| Species   | Role / Specialty | Why you want them |
|-----------|------------------|-------------------|
| 🐹 Hamster | All-rounder: mine, haul, build | The default worker |
| 🐹 Guinea pig | Power: runs wheels efficiently | Food → Power, drives automation |
| 🐭 Gerbil | Hauling: fast, big cheek pouches | Faster logistics |
| 🐁 Mouse  | Scouting & precision | Reveals map, boosts research |
| 🐀 Rat    | Scavenging & storage | Extra storage, salvages materials |
| 🦫 Beaver | Heavy construction & wood | Faster builds, better lumber yield |

Each rodent has: **position, job, skill level, carry capacity, speed**. Skills
improve via upgrades and via on-the-job experience.

---

## 5. Buildings

### Housing & Population
- **Burrow** — population cap + slowly breeds new hamsters (costs food).

### Storage
- **Storage Depot** — raises global storage cap; acts as a haul drop-off point.
- **Granary** — dedicated food storage (food spoils slower).

### Extraction
- **Mine** — placed on/near ore, coal, stone; automated extraction (faster than hand-mining).
- **Lumber Camp** — boosts nearby wood gathering.

### Refining / Production
- **Sawmill** — Wood → Planks.
- **Smelter** — Iron ore + Coal → Iron.
- **Refinery** — late-game plastics & advanced materials.

### Food
- **Farm** — Seeds → Grain/Food over time.

### Automation
- **Wheel Generator** — rodents run wheels → Power.
- **Conveyor** — auto-hauls materials along a path. Tiers:
  - T1 **Rolling logs** (wood) — the "Egyptian" trick, slow but cheap.
  - T2 **Wood belt** — steady.
  - T3 **Plastic belt** — fast.
  - T4 **Metal belt** — fastest, high throughput.

### Defense / Offense
- **Wall** — blocks/slows attackers.
- **Watchtower** — ranged defense; spots threats early.
- **Barracks** (late) — trains defender rodents for active defense/offense.

---

## 6. Upgrades & Tech Tree

Spend resources + research points to unlock and improve:
- **Mining I/II/III** — faster extraction, more yield per hit.
- **Logistics I/II/III** — carry capacity, movement speed, conveyor tiers.
- **Refining I/II/III** — faster/cheaper refining, better ratios.
- **Agriculture** — faster farms, more food, less spoilage.
- **Automation** — unlock conveyor tiers, automated mines, power efficiency.
- **Species unlocks** — recruit guinea pigs, gerbils, mice, rats, beavers.
- **Fortification** — stronger walls, towers, defender training.

The tree is intentionally deep and long so the colony always has a "next goal."

---

## 7. Conflict (light)

Periodic **threats** approach the colony: predators (cats, snakes, hawks) and rival
raider rodents. A simple **threat meter** rises over time and during raid events.
The colony's **defense rating** (walls + towers + defenders) determines whether a
raid is repelled. Losing a raid costs some resources/population — never a full reset.
This creates stakes and a reason to build defenses without punishing idle players.

---

## 8. Persistence & Retention

- **Autosave** to `localStorage`; the world persists between sessions.
- **Offline progress** — when the player returns, the colony has produced/gathered
  while away (capped), giving a "welcome back" reward.
- **Long-horizon goals** — tech tiers, species, megaprojects (e.g., a Grand Wheel,
  a Citadel) that take many sessions.
- **Always something next** — the loop and tree are tuned so there's always a clear,
  affordable next upgrade plus a distant aspirational one.

---

## 9. Technical Architecture

A **dependency-free, build-free** web app so it runs anywhere (just serve the folder):

```
index.html          # canvas + HUD shell
styles.css          # HUD / panels styling
src/
  config.js         # all tunable data: resources, buildings, species, tech
  state.js          # the GameState model + helpers
  world.js          # tile grid, terrain & resource-node generation
  entities.js       # rodent units + their simple AI/behaviour
  economy.js        # per-tick production, refining, power, food, threats
  buildings.js      # placement rules, build costs, effects
  render.js         # canvas rendering of world + entities
  ui.js             # HUD, build menu, tech panel, tooltips
  save.js           # localStorage save/load + offline progress
  game.js           # main loop: fixed-timestep tick + rAF render
main.js             # bootstraps the game
```

### Key technical choices
- **Fixed-timestep simulation** (e.g. 4 ticks/sec) decoupled from rendering (rAF).
- **Data-driven**: buildings, resources, species, and tech are declared as data in
  `config.js`, so adding content rarely requires touching engine code.
- **Tile grid world** rendered on a single `<canvas>`; entities are lightweight
  objects with timer-based behaviour (not heavy pathfinding) for performance and
  scalability to hundreds of rodents.
- **Pure functions where possible** for the economy step → easy to test & balance.

### Roadmap (incremental)
1. **MVP (this commit)** — world gen, hamsters auto-gathering, storage, core buildings
   (burrow, storage, sawmill, farm, wheel, wall), resources, build menu, save/load,
   offline progress, basic tech upgrades. ✅
2. **Refining depth** — smelter/iron/coal chains, plastics, conveyor tiers.
3. **Species** — recruit & specialize guinea pigs, gerbils, mice, rats, beavers.
4. **Conflict** — threat waves, towers, defenders.
5. **Megaprojects & prestige-style long goals.**
6. **Art & audio polish, juice, tutorial.**

---

## 10. Visual Style (target)

Cozy, warm, "cute industrial." Soft earthy palette (burrow browns, grass greens,
warm wood). Readable top-down tiles. Rodents are simple, charming sprites/emoji at
MVP, upgradable to pixel art. UI is clean and game-y with chunky panels.
