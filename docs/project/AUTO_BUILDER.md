# 🤖 Auto-builder — section-by-section backlog drain

An automated loop that, **once PR #44 is merged**, grabs open board items and ships them
**section by section** until the backlog is empty. It is the operational arm of the
[project wall](./README.md): the wall says *what* is open; the auto-builder *does* it.

> Driven by a durable cron (`neuroster-auto-builder`) created in-session. To stop it at any
> time, tell Claude "stop the auto-builder" (it runs `CronDelete`) or delete the job from
> `.claude/scheduled_tasks.json`.

## Trigger & gating

- **Gate:** PR #44 is **merged** (release `7f9ff2e`) — the loop is live.
- **Fully autonomous (no pausing).** Per the owner's standing rules ([`CLAUDE.md`](../../CLAUDE.md)):
  never wait for approval, always use CI, work until the backlog is empty. The loop opens a
  section PR, waits for **CI to go green**, **self-merges** (squash), drops `Shipped` fragments,
  and rolls straight into the next section — no human review step.
- **CI gates every merge.** Local `npm test` is a pre-check; the GitHub Actions `test` job must
  be green before a section PR merges. No green, no merge.

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
4. **One PR per section, CI-gated self-merge.** Each section lands as one PR on its own
   `claude/auto-<section>-<n>` branch, with a board fragment per item. The loop self-merges it
   once GitHub Actions is green, then sweeps the items to `Shipped`.
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
