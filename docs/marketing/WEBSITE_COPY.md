# Neuroster — website write-up (maxresearchcollective.com)

Ready-to-paste copy for the **project-neuroster** page. The image carousel uses the
six screenshots in [`carousel/`](./carousel/) (captions below, in slide order); the
marketing trailer (built by [`tools/marketing_video/`](../../tools/marketing_video/))
is added to the page separately.

---

## Hero

# Neuroster
**A world-building colony sim where the workers are hamsters.**

Found a burrow. Feed a family. Build a civilization — one paw at a time.

---

## Overview

Neuroster is a web-based colony simulation in the spirit of the classic *Settlers*
and *Warcraft* lineage, reimagined at rodent scale. You are the founder hamster of a
brand-new colony: explore a living map, mine and refine materials, raise an
ever-larger settlement, and automate the toil so your colony hums along even while
you're just watching the wheat grow.

There is no "game over." Raids, floods, and lost rodents are setbacks to recover
from, not fail states. The world autosaves and only moves while you play — it's a
persistent settlement you keep, tend, and grow across sessions.

## What makes it tick

- **A real economy.** Wood, stone, ore, seeds, and water flow through farms, mills,
  presses, and workshops into food, planks, iron, and power. Storage is finite;
  logistics matter.
- **Every rodent is a somebody.** Hamsters have names, families, levels, and traits.
  They breed, eat, drink, play, sleep — and pups grow up into the workforce.
- **Seven biomes, real seasons.** Woodland to marshland, each with its own
  resources and hazards. Day/night cycles, weather, and seasonal festivals shift
  what your colony needs.
- **More than hamsters.** Recruit guinea pigs, gophers, gerbils, mice, rats, and
  beavers — each species with its own strengths, from tunnel engineering to dam
  building.
- **Defend what you dig.** Predators, natural disasters, and envious rival factions
  test your walls. Muster a garrison, raise defensive works, or broker a truce.
- **Choices with weight.** Research skills, evolve your species, issue decrees, and
  set doctrines. Compassion, Justice, and Valor track the kind of colony you're
  building — and the world responds in kind.
- **Late-game wonders.** Megaprojects crown a mature colony with permanent,
  colony-wide marvels.

## Carousel captions (slide order)

1. **01-title** — Every colony starts with one hamster and a title screen.
2. **02-biome** — Pick your world: seven biomes, tunable scarcity, predators on or off.
3. **03-town** — A working town: burrows, farms, mills, and depots, all hauled into place by the colony itself.
4. **04-life** — Zoom in and every rodent has a name, a family, and a job to do.
5. **05-defense** — The wild is watching: garrison, defensive works, and standing orders.
6. **06-evolve** — Research, evolution, and species recruitment shape the colony's future.

## Under the hood

Neuroster is deliberately old-school in its engineering: **zero-dependency vanilla
JavaScript** on a single HTML5 canvas — no engine, no build step, no framework. All
art is generated procedurally at runtime. The whole game is a folder of static
files: serve it from anything (it currently runs off a Synology NAS in a Docker
container, playable from any device on the LAN) and it saves locally in the
browser.

Development itself is part of the experiment: the project runs on a **git-native
project wall** — a zero-API kanban board that lives in the repository, updated by
merge-safe JSON fragments and rendered as both a terminal page and a visual
swimlane wall — with every change shipped through CI-gated pull requests,
including real-browser smoke tests in headless Chromium. Even this page's trailer
and screenshots are reproducible artifacts: a scripted pipeline boots the real
game, plays it, and cuts the footage.

MIT licensed. Built to keep growing.

---

*Regenerate the carousel:* `node tools/marketing_video/screenshots.mjs` ·
*Regenerate the trailer:* see [`tools/marketing_video/README.md`](../../tools/marketing_video/README.md)
