# 🐹 Neuroster — Project Wall

A portable, **zero-API, git-native** project board for Neuroster. The board tracks every
arc/task/PR through a status lifecycle, renders a human-readable status page **and** a
standalone visual wall, and lets many parallel PRs update the board **without ever
merge-conflicting**. No GitHub API, no database, no pip installs — just stdlib Python,
one static HTML file, and one CI job.

## Launch the visual wall

The repo's own static server serves this folder, so no extra tooling is needed:

```bash
npm start        # from the repo root (node server.js)
# then open:
#   http://localhost:8080/docs/project/wall.html
```

Or with any static server pointed at this directory:

```bash
python -m http.server -d docs/project 8011
# open http://localhost:8011/wall.html
```

> Serve it over `http://` — opening `wall.html` directly via `file://` won't work, because
> the page `fetch()`es `./board_state.json` (browsers block that on `file://`).

The wall reads `./board_state.json` client-side, lays items out in swimlanes by status, and
gives you search, hide-by-status toggles, and click-through arc detail. It refreshes on a
timer, so with the repo syncing on disk the wall stays live. **Zero GitHub API calls.**

For a terminal read of the same data, open [`PROJECT_STATUS.md`](./PROJECT_STATUS.md)
(regenerated from `board_state.json`).

## The one rule: never hand-edit `board_state.json`

`board_state.json` is the single source of truth. PRs **never edit it directly** (that's how
two concurrent PRs avoid conflicting). Instead, drop a small **fragment** file under
[`board_entries/`](./board_entries/) with a distinct filename:

**Insert a new item** — `board_entries/<slug>.json`:

```json
{
  "key": "gameplay:hamster-balls",
  "title": "Hamster balls — free-roam transport",
  "type": "New Feature", "area": "Gameplay",
  "priority": "P2", "status": "Todo"
}
```

**Patch an existing item** — flip a status, attach a PR:

```json
{ "op": "update", "key": "gameplay:hamster-balls", "status": "Shipped", "pr": "#42" }
```

**Or use the lifecycle CLI** (preferred — it also appends a dated `timeline` entry):

```bash
python tools/board_lifecycle.py timeline --key gameplay:hamster-balls \
    --status "In Progress" --note "opened PR #42" --pr 42
python tools/board_lifecycle.py screenshot --key gameplay:hamster-balls \
    --path docs/screenshots/balls.png --caption "Hamster ball"
python tools/board_lifecycle.py audit       # stale / missing-screenshot / no-PR report
```

Distinct fragment filenames never merge-conflict. The on-main
[`compact-board`](../../.github/workflows/compact-board.yml) workflow folds every pending
fragment into `board_state.json`, deletes the consumed files, re-renders
`PROJECT_STATUS.md`, and commits `[auto] …` — it is the **only writer of the derived files
on `main`**.

To fold + render **locally** (e.g. before pushing):

```bash
python tools/compact_board_fragments.py
```

## Standing rule: sweep the wall at the start AND end of every session

Reconciling the board is a **ritual, not an afterthought** — it runs twice per session:

- **At session start** — before any feature work, verify every `In Progress` item against its
  PR (merged PRs → `Shipped` with `pr`+`release`; aspirational/undelivered items → back to `Todo`;
  partially-delivered items → keep `In Progress` and ticket the remainder). Then `audit`, drop
  fragments, `compact`, and commit.
- **At session end** — record everything that changed during the session (new PRs, merges, partial
  progress) the same way, and commit, so the next session starts from an honest board.

This is enforced by the `SessionStart` + `Stop` hooks in
[`.claude/settings.json`](../../.claude/settings.json) (the SessionStart hook runs the audit and
injects a reminder; the Stop hook reminds once per session to sweep + commit before ending).

## Status lifecycle

```
Backlog → Planned → Todo → In Progress → (in CI) → Done → Shipped
                                              ↘ Deferred / Closed-No-Op
```

| Status | Meaning |
|---|---|
| **Backlog** | Not in any agreed plan (default resting state). |
| **Planned** | Agreed upcoming, not yet in the active queue. |
| **Todo** | In the active work queue. |
| **In Progress** | Being worked now — has an open PR (number recorded), not yet green. |
| **Done** | CI passed, not yet merged. |
| **Shipped** | Merged to `main` (record `pr` + `release`). |
| **Deferred** / **Closed-No-Op** | Intentionally parked / dropped without shipping. |

## Files

```
docs/project/
  board_state.json      ← single source of truth (committed JSON)
  PROJECT_STATUS.md     ← rendered terminal view (auto-generated — don't hand-edit)
  wall.html             ← the standalone visual wall (open in a browser)
  board_entries/        ← drop fragments here; the on-main job consumes them
tools/
  render_board.py             ← board_state.json → PROJECT_STATUS.md
  compact_board_fragments.py  ← fold fragments → board_state.json (the only writer on main)
  board_lifecycle.py          ← timeline + screenshots + staleness audit (writes fragments)
.github/workflows/compact-board.yml   ← on-main compaction job
.claude/agents/                       ← optional board-manager + lifecycle-driver agents
wall.config.json                      ← project name / GitHub owner+repo / board dir
```

The board was seeded from [`ROADMAP.md`](../../ROADMAP.md) (shipped arcs) and
[`TODO.md`](../../TODO.md) + the ROADMAP Backlog (open work).
