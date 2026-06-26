#!/usr/bin/env python3
"""board_lifecycle.py — keep every wall ticket on a timeline loop, with
screenshots, all the way to Shipped.

The board (``<BOARD_DIR>/board_state.json`` -> ``PROJECT_STATUS.md`` +
``wall.html``) tracks WHAT each ticket is and its ``status``. This tool adds the
*lifecycle* discipline a board-manager agent enforces:

  * **timeline** — every status transition appends a ``{at, status, note}`` entry
    so a ticket has a real, dated history, not just a current state. A ticket
    that sits active with no recent timeline entry is *stale* — surfaced by the
    audit.
  * **screenshots** — a UI ticket (panel / view / modal / theme / wall) must
    carry a ``{at, path, caption}`` screenshot by the time it ships. The audit
    flags UI tickets that reached In Progress / Done / Shipped with none.
  * **audit** — the stale / undocumented / missing-screenshot / no-PR report the
    manager sweeps each run.

Writes are **fragments** (``<BOARD_DIR>/board_entries/<slug>.json``,
``op:update``) so concurrent PRs never collide — the on-main job compacts them
into ``board_state.json``. Never hand-edit ``board_state.json``.

Usage::

    python tools/board_lifecycle.py audit [--max-idle-days 5]
    python tools/board_lifecycle.py timeline --key my-arc:1 \\
        --status "In Progress" --note "opened PR #42" [--pr 42]
    python tools/board_lifecycle.py screenshot --key my-arc:1 \\
        --path docs/screenshots/my-panel.png --caption "My panel"

Stdlib only — no third-party deps. The pure helpers (``append_timeline`` /
``attach_screenshot`` / ``audit_items`` / ``is_ui_ticket``) take/return plain
dicts so they unit-test with no I/O.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------- #
# CONFIG — EDIT THIS (or fill wall.config.json at the kit/repo root).           #
# BOARD_DIR is where board_state.json + board_entries/ live, relative to the   #
# repo root. The docs/project default is replaced by the find/replace pass;   #
# at runtime wall.config.json repairs a missed replacement.                    #
# --------------------------------------------------------------------------- #
BOARD_DIR = "docs/project"  # e.g. "docs/project"

REPO_ROOT = Path(__file__).resolve().parents[1]


def _load_config() -> None:
    global BOARD_DIR
    for base in (REPO_ROOT, REPO_ROOT.parent, Path.cwd()):
        cfg = base / "wall.config.json"
        if cfg.is_file():
            try:
                data = json.loads(cfg.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return
            BOARD_DIR = data.get("BOARD_DIR", BOARD_DIR)
            return


_load_config()

BOARD_JSON = REPO_ROOT / BOARD_DIR / "board_state.json"
FRAG_DIR = REPO_ROOT / BOARD_DIR / "board_entries"

# Statuses that mean "work is actively in flight" — a stale timeline is a red
# flag for these.
ACTIVE_STATUSES = frozenset({"In Progress", "in CI", "Todo"})
# Statuses at/after which a UI ticket must carry a screenshot.
SHIPPING_OR_LATER = frozenset({"In Progress", "in CI", "Done", "Shipped"})

# Heuristic: does this ticket touch a user-visible surface? (drives the
# screenshot requirement). Matched case-insensitively against title/detail/area.
# EDIT these hints to match your project's UI vocabulary.
_UI_HINTS = (
    "panel",
    "view",
    "modal",
    "screen",
    "sub-tab",
    "subtab",
    "theme",
    "wall",
    "ui ",
    " ui",
    "frontend",
    "widget",
    "dashboard",
    "menu",
    "page",
)
_UI_AREAS = frozenset({"frontend", "ui", "ux", "design"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Pure helpers (no I/O — unit-tested)                                           #
# --------------------------------------------------------------------------- #


def is_ui_ticket(item: dict[str, Any]) -> bool:
    """True when a ticket touches a user-visible surface (so it owes a
    screenshot before it ships). Conservative OR of area + text hints."""
    if str(item.get("area", "")).strip().lower() in _UI_AREAS:
        return True
    blob = f"{item.get('title', '')} {item.get('detail', '')}".lower()
    return any(h in blob for h in _UI_HINTS)


def append_timeline(
    item: dict[str, Any], *, status: str, note: str, at: str
) -> dict[str, Any]:
    """Return a COPY of ``item`` with a timeline entry appended, its ``status``
    set, and ``updated`` stamped. Pure — never mutates the input."""
    out = deepcopy(item)
    timeline = list(out.get("timeline") or [])
    timeline.append({"at": at, "status": status, "note": note})
    out["timeline"] = timeline
    out["status"] = status
    out["updated"] = at
    return out


def attach_screenshot(
    item: dict[str, Any], *, path: str, caption: str, at: str
) -> dict[str, Any]:
    """Return a COPY of ``item`` with a screenshot entry appended + ``updated``
    stamped. Pure."""
    out = deepcopy(item)
    shots = list(out.get("screenshots") or [])
    shots.append({"at": at, "path": path, "caption": caption})
    out["screenshots"] = shots
    out["updated"] = at
    return out


def _days_since(iso: str | None, now_iso: str) -> float | None:
    """Days between an ISO timestamp and ``now``. None when ``iso`` is missing
    or unparseable (treated as 'no signal' by the audit)."""
    if not iso:
        return None
    try:
        then = datetime.fromisoformat(iso)
        now = datetime.fromisoformat(now_iso)
    except ValueError:
        return None
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return (now - then).total_seconds() / 86400.0


def _last_activity(item: dict[str, Any]) -> str | None:
    """The most recent timeline ``at`` if any, else the ``updated`` field."""
    timeline = item.get("timeline") or []
    if timeline:
        return str(timeline[-1].get("at") or "") or None
    return item.get("updated")


def audit_items(
    items: list[dict[str, Any]], *, now_iso: str, max_idle_days: float = 5.0
) -> dict[str, Any]:
    """The lifecycle audit the manager sweeps. Reports, by ticket key:

    - **stale** — active ticket (In Progress / in CI / Todo) whose last timeline
      activity is older than ``max_idle_days``, OR which has no timeline at all
      (undocumented — the timeline loop isn't being followed).
    - **ui_missing_screenshot** — a UI ticket at/after In Progress with zero
      screenshots.
    - **in_progress_no_pr** — In Progress with no recorded ``pr`` (a phantom
      'being worked' with nothing to show for it).
    """
    stale: list[dict[str, Any]] = []
    ui_missing: list[dict[str, Any]] = []
    no_pr: list[dict[str, Any]] = []

    for it in items:
        key = it.get("key", "?")
        status = it.get("status", "?")

        if status in ACTIVE_STATUSES:
            last = _last_activity(it)
            idle = _days_since(last, now_iso)
            if not (it.get("timeline") or []):
                stale.append({"key": key, "status": status, "why": "no timeline entries"})
            elif idle is not None and idle > max_idle_days:
                stale.append(
                    {"key": key, "status": status, "why": f"idle {idle:.1f}d (> {max_idle_days}d)"}
                )

        if status in SHIPPING_OR_LATER and is_ui_ticket(it) and not (it.get("screenshots") or []):
            ui_missing.append({"key": key, "status": status, "title": it.get("title", "")})

        if status == "In Progress" and not it.get("pr"):
            no_pr.append({"key": key, "title": it.get("title", "")})

    return {
        "now": now_iso,
        "max_idle_days": max_idle_days,
        "counts": {
            "stale": len(stale),
            "ui_missing_screenshot": len(ui_missing),
            "in_progress_no_pr": len(no_pr),
            "total_items": len(items),
        },
        "stale": stale,
        "ui_missing_screenshot": ui_missing,
        "in_progress_no_pr": no_pr,
    }


# --------------------------------------------------------------------------- #
# I/O layer (fragment writers + the CLI)                                        #
# --------------------------------------------------------------------------- #


def _load_board() -> dict[str, Any]:
    with BOARD_JSON.open(encoding="utf-8") as f:
        return json.load(f)


def _find_item(board: dict[str, Any], key: str) -> dict[str, Any] | None:
    return next((i for i in board.get("items", []) if i.get("key") == key), None)


def _slug(key: str, kind: str, at: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", f"{key}-{kind}-{at}".lower()).strip("-")
    return base


def _write_fragment(fields: dict[str, Any], *, key: str, kind: str, at: str) -> Path:
    FRAG_DIR.mkdir(parents=True, exist_ok=True)
    frag = {"op": "update", "key": key, **fields}
    path = FRAG_DIR / f"{_slug(key, kind, at)}.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(frag, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path


def cmd_timeline(args: argparse.Namespace) -> int:
    board = _load_board()
    item = _find_item(board, args.key)
    if item is None:
        print(f"error: no board item with key {args.key!r}", file=sys.stderr)
        return 1
    at = args.at or _now_iso()
    updated = append_timeline(item, status=args.status, note=args.note, at=at)
    fields: dict[str, Any] = {
        "status": updated["status"],
        "timeline": updated["timeline"],
        "updated": updated["updated"],
    }
    if args.pr:
        fields["pr"] = str(args.pr)
    if args.release:
        fields["release"] = args.release
    path = _write_fragment(fields, key=args.key, kind="timeline", at=at)
    print(f"wrote {path.relative_to(REPO_ROOT)} — {args.key} → {args.status}")
    return 0


def cmd_screenshot(args: argparse.Namespace) -> int:
    board = _load_board()
    item = _find_item(board, args.key)
    if item is None:
        print(f"error: no board item with key {args.key!r}", file=sys.stderr)
        return 1
    at = args.at or _now_iso()
    updated = attach_screenshot(item, path=args.path, caption=args.caption, at=at)
    fields = {"screenshots": updated["screenshots"], "updated": updated["updated"]}
    path = _write_fragment(fields, key=args.key, kind="screenshot", at=at)
    print(f"wrote {path.relative_to(REPO_ROOT)} — screenshot for {args.key}")
    return 0


def cmd_audit(args: argparse.Namespace) -> int:
    board = _load_board()
    report = audit_items(
        board.get("items", []), now_iso=_now_iso(), max_idle_days=args.max_idle_days
    )
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0
    c = report["counts"]
    print(f"# Board lifecycle audit ({report['now']})")
    print(
        f"  stale={c['stale']} · ui-missing-screenshot={c['ui_missing_screenshot']} "
        f"· in-progress-no-pr={c['in_progress_no_pr']} · total={c['total_items']}"
    )
    for label, rows in (
        ("STALE (timeline loop not followed)", report["stale"]),
        ("UI TICKETS MISSING A SCREENSHOT", report["ui_missing_screenshot"]),
        ("IN PROGRESS WITH NO PR", report["in_progress_no_pr"]),
    ):
        if rows:
            print(f"\n## {label}")
            for r in rows:
                extra = r.get("why") or r.get("title") or ""
                print(f"  - {r['key']}  [{r.get('status', '')}]  {extra}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Wall ticket lifecycle helper.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_tl = sub.add_parser("timeline", help="record a status transition + timeline note")
    p_tl.add_argument("--key", required=True)
    p_tl.add_argument("--status", required=True)
    p_tl.add_argument("--note", required=True)
    p_tl.add_argument("--pr", default=None)
    p_tl.add_argument("--release", default=None)
    p_tl.add_argument("--at", default=None, help="ISO timestamp (default now)")
    p_tl.set_defaults(func=cmd_timeline)

    p_ss = sub.add_parser("screenshot", help="attach a screenshot to a ticket")
    p_ss.add_argument("--key", required=True)
    p_ss.add_argument("--path", required=True)
    p_ss.add_argument("--caption", default="")
    p_ss.add_argument("--at", default=None)
    p_ss.set_defaults(func=cmd_screenshot)

    p_au = sub.add_parser("audit", help="report stale / undocumented / unscreenshotted tickets")
    p_au.add_argument("--max-idle-days", type=float, default=5.0)
    p_au.add_argument("--json", action="store_true")
    p_au.set_defaults(func=cmd_audit)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
