# 🤖 Auto-builder — section-by-section backlog drain

An automated loop that, **once PR #44 is merged**, grabs open board items and ships them
**section by section** until the backlog is empty. It is the operational arm of the
[project wall](./README.md): the wall says *what* is open; the auto-builder *does* it.

> Driven by a durable cron (`neuroster-auto-builder`) created in-session. To stop it at any
> time, tell Claude "stop the auto-builder" (it runs `CronDelete`) or delete the job from
> `.claude/scheduled_tasks.json`.

## Trigger & gating

- **Gate:** nothing runs until **PR #44 is merged** to `main`. While #44 is open, each cron
  firing just checks and exits.
- **Pause between sections (default):** after a section's PR is opened with green CI, the loop
  **stops and waits** for you to review/merge before starting the next section. While an
  auto-build PR is open and unmerged, firings no-op.
- **On a section PR merge:** the loop drops `Shipped` fragments for that section's items
  (`board_lifecycle.py`), compacts, then proceeds to the next section.

## Section order (highest priority first)

Items are grouped by `area` and sections are ordered by their best contained priority.
Within a section, items build in **P1 → P3** order. Current plan:

| # | Section | Buildable items (P-order) | Auto-deferred (risky) |
|---|---|---|---|
| 1 | **Graphics** | `render:18`, `ux:texture-glyphs` | `add:true-iso-camera`, `add:sprite-sheets` |
| 2 | **Gameplay** | `gameplay:production-chain`, `add:ai-colonies-compete`, `gameplay:npc-events-more`, `add:plastics-refining`, `add:disease-events`, `change:evolution-branches`, `change:level-unlocks` | `add:tunnels-underground` |
| 3 | **Balance** | `balance:pacing`, `balance:feeder-throughput`, `balance:starting-economy`, `fix:difficulty-scale`, `fix:balance-pass` | — |
| 4 | **Engine** | `fix:worker-pathing`, `add:river-dams` | `add:true-pathfinding` |
| 5 | **UI/UX** | `ux:persist-zoom`, `add:job-assignment` | — |

## Guardrails

1. **Skip risky refactors.** Architectural/large-surface items (isometric camera, sprite
   sheets, true pathfinding, underground tunnels — anything matching the risk list, or
   `Deferred`) are **left for manual review**, never auto-built.
2. **Priority order.** Always grab the highest-priority item available in the active section.
3. **Tests gate every ship.** Each item must pass `npm test` (88+ headless checks) — and
   `npm run verify:browser` for UI-affecting items — **before** its commit. No green, no ship.
4. **One PR per section.** Each section lands as one reviewable draft PR on its own
   `claude/auto-<section>-<n>` branch, with a board fragment per item (`Done` + PR number).
5. **Honest board.** Every item gets a `timeline` entry; UI items get a screenshot. The
   start/end **wall sweep** (see README) reconciles state each session.

## Lifecycle per item

```
pick item → implement (+ tests) → npm test (+ verify:browser if UI) → green?
   ├─ yes → board fragment (Done, pr) → commit
   └─ no  → revert item, mark Blocked with the failure note, move on
```

## Done condition

When no buildable items remain in any section, the loop posts a final summary
("backlog emptied — N risky items deferred for manual review") and **deletes its own cron**.
The deferred risky items stay on the wall as `Backlog` for you to drive by hand.
