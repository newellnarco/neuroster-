# Neuroster — operating rules for Claude

Standing rules for every session (set by the project owner). These are not optional.

## Autonomy
- **Never wait for approval.** Don't ask the user to review, merge, or greenlight. Decide and act.
- **Work until the backlog is empty.** Keep pulling open board items and shipping them, section
  by section (see [`docs/project/AUTO_BUILDER.md`](./docs/project/AUTO_BUILDER.md)), until no
  buildable items remain. Don't stop after one item or one section.
- The only reasons to stop and ask: a genuine product decision with no sensible default, or a
  destructive/irreversible action outside the normal build flow.

## CI is mandatory
- **Always use CI.** Every change ships through a PR and must be **green in GitHub Actions**
  before it merges — local `npm test` is a pre-check, not a substitute. No green, no merge.
- Self-merge a PR once its required checks pass (squash). Don't leave green PRs sitting.

## Project wall
- **Sweep the wall at the start and end of every session** (enforced by the SessionStart/Stop
  hooks). Reconcile every status against its PR before and after working.
- Never hand-edit `board_state.json` — drop fragments via `tools/board_lifecycle.py`, then
  `python tools/compact_board_fragments.py`.

## Quality bar
- Every shipped item passes `npm test` (headless smoke) and, if it touches UI,
  `npm run verify:browser` (real Chromium, zero console errors). UI items get a screenshot.
- Skip risky/architectural refactors flagged in `AUTO_BUILDER.md` — leave those for manual review.
