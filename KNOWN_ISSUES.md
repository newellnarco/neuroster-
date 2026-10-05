# KNOWN_ISSUES.md - Neuroster's failure registry

Bug classes that already shipped here and failed. Check every change against this list before you
push. When you fix a new class of bug, add it here **in the same PR as the fix**: what happened,
why, and what now prevents it. Entries are append-only; a class that stops applying is marked
retired, not deleted.

Seeded 2026-10-05 from the fixes already in the history.

---

### NR-REVIEW-001 - paginated API output read as one page

- **Seen:** #96. `gh api --paginate` prints one JSON array per page. With more than 100 PR
  comments, `last_cr_comment` emitted several lines and broke its callers.
- **Prevention:** combine the pages (`jq -s add`) and flatten bodies to one line before reading.
  Any script that pages a GitHub list must combine pages first.

### NR-REVIEW-002 - only the latest comment checked for a running cooldown

- **Seen:** #96, #97. `rate_limit_wait` read only the latest CodeRabbit comment, so a newer ordinary
  comment hid a cooldown that was still running. CodeRabbit also edits its notices in place.
- **Prevention:** take the longest cooldown still running across all rate-limit notices. Time each
  cooldown from the notice's `updated_at`, with ties broken by comment id. Never back off for less
  than a cooldown still known to be running.

### NR-REVIEW-003 - a stated wait parsed without its hours, and a new notice wording missed

- **Seen:** #98. "Please wait 1 hour and 5 minutes" was read as 5 minutes. "Review limit reached ...
  Next included review available in N minutes" matched only through a hidden HTML marker.
- **Prevention:** parse every unit in a stated wait. Match the visible notice text directly, and
  use the same patterns for the pickup check.

### NR-REVIEW-004 - waiting out a long rate limit instead of proceeding

- **Seen:** #99. The requester could sleep for up to an hour on a throttled reviewer.
- **Prevention:** wait only when the limit clears within `CR_MAX_WAIT` (1200 s, 0 = no cap, counted
  across the run). Otherwise exit 4 with nothing posted, and the work proceeds without the review.

### NR-OPS-001 - Synology Container Manager rejects the compose file

- **Seen:** #33. Container Manager's validator rejects shell-style `${VAR:-default}` interpolation
  ("the format ... is invalid"), and a CRLF checkout causes the same error.
- **Prevention:** plain port mappings in `docker-compose.nas.yml`, a top-level `version`, and
  `.gitattributes` forcing LF on yml, web and server files.
