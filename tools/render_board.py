#!/usr/bin/env python3
"""Render <BOARD_DIR>/board_state.json -> a human-readable status page.

THE ZERO-API END-AROUND: GitHub Projects v2 REST/GraphQL has a rate limit
that is easy to exhaust if you poll a board all day. board_state.json is the
committed, git-native source of truth for every arc / PR / task state — but a
JSON file is not something a human reads at a glance. This tool renders the
committed JSON into ``<BOARD_DIR>/PROJECT_STATUS.md`` with ZERO network calls.

Read PROJECT_STATUS.md instead of a live GitHub Project board to answer
"what's todo / done / in-CI / deferred" — it's always current as of the last
fragment compaction (the on-main CI job rewrites board_state.json on every push
to main and re-runs this renderer).

Usage::

    python tools/render_board.py            # write PROJECT_STATUS.md
    python tools/render_board.py --check     # exit 1 if out of date (CI gate)
    python tools/render_board.py --stdout    # print, don't write

No third-party deps — stdlib only.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

# --------------------------------------------------------------------------- #
# CONFIG — EDIT THESE (or fill wall.config.json at the kit/repo root).          #
#                                                                              #
# The {{PLACEHOLDER}} defaults are replaced by the BUILD_INSTRUCTIONS.md       #
# find/replace pass. At runtime we also try to load wall.config.json so a      #
# missed replacement still works. Owner/repo drive the PR + issue links;       #
# BOARD_DIR is where board_state.json / board_entries/ / wall.html live,       #
# relative to the repo root.                                                   #
# --------------------------------------------------------------------------- #
PROJECT_NAME = "Neuroster"
GITHUB_OWNER = "newellnarco"
GITHUB_REPO = "neuroster-"
BOARD_DIR = "docs/project"  # e.g. "docs/project"

REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_config() -> None:
    """Overlay wall.config.json onto the module constants when present.

    Searches the repo root and the kit root. A find/replace miss (values still
    literally ``{{...}}``) is fully repaired this way; explicit edits to the
    constants above take precedence only when no config file is found.
    """
    global PROJECT_NAME, GITHUB_OWNER, GITHUB_REPO, BOARD_DIR
    for base in (REPO_ROOT, REPO_ROOT.parent, Path.cwd()):
        cfg = base / "wall.config.json"
        if cfg.is_file():
            try:
                data = json.loads(cfg.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return
            PROJECT_NAME = data.get("PROJECT_NAME", PROJECT_NAME)
            GITHUB_OWNER = data.get("GITHUB_OWNER", GITHUB_OWNER)
            GITHUB_REPO = data.get("GITHUB_REPO", GITHUB_REPO)
            BOARD_DIR = data.get("BOARD_DIR", BOARD_DIR)
            return


_load_config()

BOARD_JSON = REPO_ROOT / BOARD_DIR / "board_state.json"
OUT_MD = REPO_ROOT / BOARD_DIR / "PROJECT_STATUS.md"

# Status ordering for the summary table + section order. Active work first,
# terminal states last. EDIT this list if your project uses different statuses
# (keep the lifecycle generic — see README.md for the canonical ladder).
#   Backlog     — not in any agreed plan (default resting state)
#   Planned     — agreed upcoming, ahead of Backlog, but NOT in the active queue
#   Todo        — in the active work queue
#   In Progress — being worked RIGHT NOW: has an open PR (number recorded) not
#                 yet through CI
#   in CI       — legacy alias kept for back-compat with older items
#   Done        — CI passed but NOT yet merged
#   Shipped     — merged to main
#   Deferred / Closed-No-Op — intentionally parked / dropped
STATUS_ORDER = [
    "In Progress",
    "in CI",
    "Todo",
    "Planned",
    "Backlog",
    "Done",
    "Shipped",
    "Deferred",
    "Closed-No-Op",
]
# Statuses that mean "work remains" — surfaced in the OUTSTANDING section.
OPEN_STATUSES = {"In Progress", "in CI", "Todo", "Planned", "Backlog"}
# Statuses that mean "landed on main".
DONE_STATUSES = {"Shipped", "Done"}


def _load() -> dict:
    with BOARD_JSON.open(encoding="utf-8") as f:
        return json.load(f)


def _pr_link(pr: str | None) -> str:
    if not pr:
        return "—"
    n = str(pr).lstrip("#")
    if not n.isdigit():
        return str(pr)
    return f"[#{n}](https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/pull/{n})"


def _issue_link(issue) -> str:
    if issue in (None, "", 0):
        return "—"
    return f"[#{issue}](https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/issues/{issue})"


def _status_rank(status: str) -> int:
    try:
        return STATUS_ORDER.index(status)
    except ValueError:
        return len(STATUS_ORDER)


def render(data: dict) -> str:
    items = data.get("items", [])
    # Deterministic timestamp: use the JSON's own ``updated`` field so the
    # render is reproducible (the --check gate + the committed PROJECT_STATUS.md
    # stay byte-stable between runs). Falls back to "unknown" rather than
    # wall-clock now(), which would make every render differ and defeat the
    # staleness gate.
    rendered_from = str(data.get("updated") or "unknown")
    lines: list[str] = []

    lines.append(f"# {PROJECT_NAME} — Project Status (zero-API mirror)")
    lines.append("")
    lines.append(
        "> **Generated from `"
        f"{BOARD_DIR}/board_state.json` by "
        "`tools/render_board.py`.** Read this file to answer "
        "*what's todo / done / in-CI / deferred* without hitting the "
        "GitHub API. It is rewritten on every push to `main` by the on-main "
        "compaction job (`compact_board_fragments` re-runs this renderer)."
    )
    lines.append("")
    lines.append(f"_board_state.json updated: {rendered_from} · {len(items)} items_")
    lines.append("")

    # ---- Summary by status ------------------------------------------- #
    by_status = Counter(i.get("status", "?") for i in items)
    open_n = sum(by_status[s] for s in by_status if s in OPEN_STATUSES)
    done_n = sum(by_status[s] for s in by_status if s in DONE_STATUSES)
    lines.append("## Summary")
    lines.append("")
    lines.append("| Status | Count |")
    lines.append("|---|---|")
    # Show EVERY canonical status (0-inclusive) so the summary is a stable,
    # complete legend across the top — matching wall.html. Any out-of-order
    # status that has items is appended after.
    extras = [s for s in sorted(by_status) if s not in STATUS_ORDER]
    for status in [*STATUS_ORDER, *extras]:
        lines.append(f"| {status} | {by_status.get(status, 0)} |")
    lines.append(f"| **TOTAL** | **{len(items)}** |")
    lines.append("")
    lines.append(
        f"**{done_n} landed on `main`** · **{open_n} open** (in-CI / todo / planned / backlog)."
    )
    lines.append("")

    # ---- Outstanding (open work) ------------------------------------- #
    open_items = [i for i in items if i.get("status") in OPEN_STATUSES]
    lines.append("## Outstanding work")
    lines.append("")
    if not open_items:
        lines.append(
            "_Nothing open — every tracked item has landed on `main` or is intentionally deferred._"
        )
        lines.append("")
    else:
        lines.append("| Status | Priority | Arch | Item | Issue | PR |")
        lines.append("|---|---|---|---|---|---|")
        for i in sorted(
            open_items,
            key=lambda x: (_status_rank(x.get("status", "?")), str(x.get("priority", "P9"))),
        ):
            lines.append(
                f"| {i.get('status', '?')} | {i.get('priority', '—')} "
                f"| {i.get('arch', '—')} | {i.get('title', '(untitled)')} "
                f"| {_issue_link(i.get('issue'))} | {_pr_link(i.get('pr'))} |"
            )
        lines.append("")

    # ---- Deferred ---------------------------------------------------- #
    deferred = [i for i in items if i.get("status") == "Deferred"]
    if deferred:
        lines.append("## Deferred (intentional)")
        lines.append("")
        lines.append("| Arch | Item | Issue | PR | Why |")
        lines.append("|---|---|---|---|---|")
        for i in deferred:
            why = (i.get("detail", "") or "").split(".")[0][:120]
            lines.append(
                f"| {i.get('arch', '—')} | {i.get('title', '(untitled)')} "
                f"| {_issue_link(i.get('issue'))} | {_pr_link(i.get('pr'))} | {why} |"
            )
        lines.append("")

    # ---- Shipped, grouped by arch ------------------------------------ #
    lines.append("## Shipped / Done — by arch")
    lines.append("")
    by_arch: dict[str, list[dict]] = defaultdict(list)
    for i in items:
        if i.get("status") in DONE_STATUSES:
            by_arch[i.get("arch") or "(misc)"].append(i)
    for arch in sorted(by_arch):
        arch_items = sorted(by_arch[arch], key=lambda x: str(x.get("phase", "")))
        lines.append(f"### {arch} ({len(arch_items)})")
        lines.append("")
        lines.append("| Phase | Item | PR | Release |")
        lines.append("|---|---|---|---|")
        for i in arch_items:
            rel = (i.get("release") or "")[:9] or "—"
            lines.append(
                f"| {i.get('phase', '—')} | {i.get('title', '(untitled)')} "
                f"| {_pr_link(i.get('pr'))} | `{rel}` |"
            )
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(
        "_To update state: drop a fragment into `"
        f"{BOARD_DIR}/board_entries/` (NEVER hand-edit board_state.json — "
        "see README.md, the fragment-collision-avoidance trick) and let the "
        "on-main compaction job fold it in + re-render this file. To compact + "
        "render locally, run `python tools/compact_board_fragments.py`._"
    )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="exit 1 if PROJECT_STATUS.md is stale")
    ap.add_argument("--stdout", action="store_true", help="print instead of writing")
    args = ap.parse_args()

    if not BOARD_JSON.exists():
        print(f"[render_board] {BOARD_JSON} not found", file=sys.stderr)
        return 1

    rendered = render(_load())

    if args.stdout:
        print(rendered)
        return 0

    if args.check:
        current = OUT_MD.read_text(encoding="utf-8") if OUT_MD.exists() else ""
        if current.strip() != rendered.strip():
            print(
                "[render_board] PROJECT_STATUS.md is stale — run "
                "`python tools/render_board.py` and commit the result.",
                file=sys.stderr,
            )
            return 1
        print("[render_board] PROJECT_STATUS.md is current.")
        return 0

    # newline="\n" forces LF on every platform. Without it, Path.write_text
    # opens in text mode with newline=None, which on Windows translates the
    # rendered "\n" to "\r\n" — so a Windows render would mismatch an
    # LF-committed file and dirty the tree on every pull. Render must be
    # byte-identical cross-OS.
    OUT_MD.write_text(rendered, encoding="utf-8", newline="\n")
    print(f"[render_board] wrote {OUT_MD.relative_to(REPO_ROOT)} ({len(rendered)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
