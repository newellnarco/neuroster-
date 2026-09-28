# CodeRabbit

This repository uses the standard newellnarco CodeRabbit setup, tuned to stay out of
CodeRabbit's **Fair Usage "slow lane"** (<https://docs.coderabbit.ai/management/rate-limits>).
The canonical kit lives in `newellnarco/AlienInterface` under `templates/coderabbit/`.

## How reviews are counted

- **One review per push, not per commit.** Batch fixes into one push.
- **Superseded reviews still cost.** A review takes about 5 minutes; a push during that window discards it, but it is still charged.
- **Also charged:** web-UI edits, **Update branch** / **Resolve conflicts**, force-push/rebase/reopen, marking a draft ready, and each `@coderabbitai review`.
- **A rate limit is a comment, not HTTP 429.** CodeRabbit posts a rate-limit comment and a passing **"Review rate limited"** check.
- **`@coderabbitai rate limit`** shows the remaining allowance for free.

## Configuration (`.coderabbit.yaml`)

- `reviews.auto_review.auto_incremental_review: false`: only the opening push is reviewed automatically.
- `reviews.auto_review.auto_pause_after_reviewed_commits: 1`: pause early if incremental review is turned back on.
- `reviews.auto_review.drafts: false`, and bot authors plus `WIP` / `[skip review]` / `[no review]` titles are skipped.
- `reviews.path_filters` excludes the lockfile, `node_modules`, minified/build output, and the board files that CI or tools regenerate (`docs/project/board_state.json`, `PROJECT_STATUS.md`, `wall.html`).

## Workflow

1. Iterate in a draft PR; mark it ready once.
2. Ask for re-reviews through the throttle-aware script, never a loop of raw comments:
   ```bash
   scripts/coderabbit-review.sh <pr>            # waits for a running review, honours rate-limit notices, then asks once
   scripts/coderabbit-review.sh <pr> --full     # full re-review
   scripts/coderabbit-review.sh <pr> --status   # "@coderabbitai rate limit" (free), at most once an hour
   ```
   Needs `gh` (authenticated) and `jq`. Tunables: `CR_MAX_WAIT` (1200 s; `0` = no cap), `CR_MAX_RETRIES` (4), `CR_BASE_DELAY` (120 s), `CR_MAX_DELAY` (3600 s).
   If CodeRabbit is rate limited, the script waits only when the limit clears within `CR_MAX_WAIT` (20 minutes, counting every rate-limit wait in the run). A longer limit, or a notice naming no time, exits 4 with nothing posted: not an error, proceed without a CodeRabbit review.
3. Agents and automation (Claude Code, CI bots) must use the script or the same logic: check first,
   back off with jitter, at most one request per push, a retry cap, and never re-request on a timer.
