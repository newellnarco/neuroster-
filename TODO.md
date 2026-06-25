# Neuroster — TODO / Backlog

Living backlog. Pull from freely; keep it honest about what's deferred and why.
(Big feature *arcs* and shipped history live in `ROADMAP.md`; design rationale in
`DECISIONS.md`.)

## Queued gameplay (player-requested, not yet built)
- [ ] **Oak → squirrel / nut economy.** Planting oaks (tree-planting exists) raises
      squirrel pressure; the nut balance tips toward trade / cooperation / raids.
      *Highest-value next feature — builds on trees + factions + pollution.*
- [ ] **Hamster balls** — free-roam transport that speeds a rodent but builds heat
      + anxiety the longer it's inside (pull them out in time).
- [ ] **Production chain:** Furnace, Forge (armour → defense), Mason (clay→brick),
      plus a **brick** resource and **armour** mechanic.
- [ ] **Directable exploration.** Players keep asking to send hamsters to explore a
      direction. Implement a **scout waypoint**: click a fogged tile → bias some
      rodents toward it (reveal fog), marker shows, clears when reached. (The sim is
      auto-driven, so this is a *bias*, not a move order.)
- [ ] **NPC animal events, more:** wandering merchant, predator parley to stall an
      attack, neighbour-colony aid requests (some exist as decrees; expand).

## Queued UI/UX
- [ ] **Left-drag marquee multi-select.** Deferred: the auto-sim has no unit
      commands to apply to a selection. If we add directable units (scout waypoint),
      revisit as "select a group to send."
- [ ] Texture the remaining one-off building glyphs (most are emoji on a textured
      timber base now).
- [ ] Optional: persist zoom level per colony.

## Balance / tuning to watch
- [ ] Validate `EVENT_PACE = 1.7` + `GRACE_SECONDS = 420` feel right across biomes
      and difficulties during user testing; expose as a difficulty knob if needed.
- [ ] Burrow filth now scales with crowding (per-burrow fullness). Consider doing
      the same for **feeder/waterer throughput** (currently per-unit needs already
      scale total consumption with population).
- [ ] Re-check starting economy (140 wood / 75 stone / 120 food / 60 seeds /
      100 water / 12 planks, cap 700) after testers play the first 10 minutes.

## Known limitations
- **Map size is fixed** (`GRID_W×GRID_H`). Selectable map size needs a world-dims
  refactor (currently module constants) — risky; deferred.
- **Legacy Synology Docker** can't import compose; deploy is a hand-made container
  (see `README.md` / `DECISIONS.md`).
- **No multiplayer / no server-side state.** Saves are per-browser `localStorage`
  (export/import to move between machines).

## Done this session (high level — see ROADMAP for detail)
Morality system (Compassion/Justice/Valor + Decrees + civic buildings),
Doctrines, NPC fates, Power variety + Pollution, plant-trees + statues; full
graphics overhaul (plush HiDPI creatures, 64-colour palette + procedural
textures across terrain/objects/structures); large UX pass (zoom + pan,
resizable/collapsible panels, ☰ menu, expandable alert bar, labels toggle,
pin tooltips, in-game updater, favicon); onboarding & pacing tuning; Synology
deployment.
