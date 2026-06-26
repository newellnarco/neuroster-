#!/usr/bin/env python3
"""Compact ``<BOARD_DIR>/board_entries/*.json`` fragments into board_state.json.

THE CONFLICT-FREE SHARED-ARTIFACTS SYSTEM — the heart of why this board scales
across many parallel PRs:

When every concurrent PR commits derived state — a rewritten ``board_state.json``
and a re-rendered ``PROJECT_STATUS.md`` — any two PRs in flight collide on the
EXACT SAME LINES of those files. You pay for it with constant rebases and the
occasional conflict-marker JSON corruption that reaches ``main``.

The fix: PRs never edit the derived files. Instead each PR adds one or more
*fragment* files under ``<BOARD_DIR>/board_entries/`` — DISTINCT FILENAMES, so
concurrent PRs can't conflict (two different files never merge-conflict). This
tool — run by the on-main CI job — folds the fragments into ``board_state.json``,
DELETES the consumed fragment files, and re-renders ``PROJECT_STATUS.md``, making
the on-main job the ONLY writer of the derived files on ``main``.

Fragment shapes (filename is arbitrary but must be filesystem-safe — use a
hyphenated slug, NOT the item key verbatim, since keys often contain ``:``):

* **Insert** — a single board item, same schema as one element of
  ``board_state.json``'s ``items`` array (see ``_template`` there). Missing
  fields inherit the board's ``_template`` defaults. Optional
  ``"_after": "<existing-key>"`` inserts after that key's item (stable anchor);
  default is append. Inserting a key that already exists is an UPSERT (field
  patch) so re-runs are idempotent.
* **Update** — ``{"op": "update", "key": "<existing-key>", ...fields}`` patches
  the named fields of an existing item (e.g. a status flip
  ``"status": "Shipped"`` at merge time).

Failure containment: a corrupt / invalid fragment is SKIPPED with a loud stderr
log and its file is KEPT on disk — the board is never corrupted and the evidence
survives for the next session to triage.

Usage::

    python tools/compact_board_fragments.py            # compact + render
    python tools/compact_board_fragments.py --root DIR # other tree (tests)
    python tools/compact_board_fragments.py --no-render

Exit code is 0 even when fragments are skipped (the workflow must not wedge on
one bad file); skipped fragments are loudly reported.

No third-party deps — stdlib only.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# --------------------------------------------------------------------------- #
# CONFIG — EDIT THIS (or fill wall.config.json at the kit/repo root).           #
# BOARD_DIR is where board_state.json + board_entries/ live, relative to the   #
# repo root. The docs/project default is replaced by the BUILD_INSTRUCTIONS   #
# find/replace pass; at runtime wall.config.json repairs a missed replacement. #
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

FRAG_SUBDIR = Path(BOARD_DIR) / "board_entries"
BOARD_SUBDIR = Path(BOARD_DIR) / "board_state.json"

# Keys that steer the compactor and are never written into the board item.
_CONTROL_KEYS = frozenset({"op", "_after"})

VALID_OPS = frozenset({"insert", "update"})


def validate_fragment(frag: object) -> str | None:
    """Return an error string when ``frag`` can't be applied, else None.

    Share this with your PR-side CI test so the gate and the compactor agree on
    what "valid" means by construction.
    """
    if not isinstance(frag, dict):
        return "fragment is not a JSON object"
    key = frag.get("key")
    if not key or not isinstance(key, str):
        return "fragment missing string 'key'"
    op = frag.get("op", "insert")
    if op not in VALID_OPS:
        return f"unknown op {op!r} (expected 'insert' or 'update')"
    if op == "insert":
        title = frag.get("title")
        if not title or not isinstance(title, str):
            return "insert fragment missing string 'title'"
        if title.startswith("["):
            return "title must be plain — no leading [tag] (tags live in board fields)"
    after = frag.get("_after")
    if after is not None and not isinstance(after, str):
        return "'_after' anchor must be a string key"
    return None


def apply_fragment(board: dict, frag: dict) -> tuple[bool, str | None]:
    """Fold one fragment into ``board`` in place.

    Returns ``(changed, error)``. ``error`` is non-None when the fragment
    couldn't be applied (board untouched in that case). Applying the same
    fragment twice is a no-op the second time (idempotent): inserts upsert,
    updates re-set equal values.
    """
    err = validate_fragment(frag)
    if err:
        return False, err

    items: list[dict] = board.setdefault("items", [])
    index_of = {i.get("key"): idx for idx, i in enumerate(items)}
    key = frag["key"]
    op = frag.get("op", "insert")
    fields = {k: v for k, v in frag.items() if k not in _CONTROL_KEYS}

    if op == "update":
        if key not in index_of:
            return False, f"update fragment targets unknown key {key!r}"
        item = items[index_of[key]]
        changed = False
        for k, v in fields.items():
            if item.get(k) != v:
                item[k] = v
                changed = True
        return changed, None

    # insert — upsert when the key already exists (idempotent re-run).
    if key in index_of:
        item = items[index_of[key]]
        changed = False
        for k, v in fields.items():
            if item.get(k) != v:
                item[k] = v
                changed = True
        return changed, None

    # Brand-new item: inherit defaults from the board's _template so the item
    # shape stays consistent, then overlay the fragment.
    template = board.get("_template")
    new_item: dict = {}
    if isinstance(template, dict):
        new_item.update(template)
    new_item.update(fields)
    new_item["key"] = key

    after = frag.get("_after")
    if after is not None and after in index_of:
        items.insert(index_of[after] + 1, new_item)
    else:
        # Missing anchor degrades to append — stable + never fails.
        items.append(new_item)
    return True, None


def compact(root: Path, render_fn=None) -> dict:
    """Merge every pending fragment under ``root`` into board_state.json.

    Consumed fragment files are DELETED; invalid ones are kept + logged.
    Re-renders PROJECT_STATUS.md (via ``render_fn`` or the default subprocess
    call to tools/render_board.py) whenever the board was rewritten. Returns a
    summary dict for callers/tests.
    """
    frag_dir = root / FRAG_SUBDIR
    board_path = root / BOARD_SUBDIR
    summary = {"applied": 0, "skipped": 0, "deleted": 0, "board_changed": False, "errors": []}

    fragments = sorted(frag_dir.glob("*.json")) if frag_dir.is_dir() else []
    if not fragments:
        print("[compact_board_fragments] no pending fragments — nothing to do.")
        return summary

    board = json.loads(board_path.read_text(encoding="utf-8"))
    any_changed = False
    consumed: list[Path] = []

    for path in fragments:
        try:
            frag = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            # Corrupt fragment: skip LOUDLY, keep the file, never touch the
            # board. The next session triages it from the evidence.
            msg = f"CORRUPT fragment {path.name}: {exc}"
            print(f"[compact_board_fragments] SKIP — {msg}", file=sys.stderr)
            summary["skipped"] += 1
            summary["errors"].append(msg)
            continue

        changed, err = apply_fragment(board, frag)
        if err:
            msg = f"INVALID fragment {path.name}: {err}"
            print(f"[compact_board_fragments] SKIP — {msg}", file=sys.stderr)
            summary["skipped"] += 1
            summary["errors"].append(msg)
            continue

        summary["applied"] += 1
        any_changed = any_changed or changed
        consumed.append(path)
        print(f"[compact_board_fragments] applied {path.name} (key={frag.get('key')})")

    if any_changed:
        board["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        # LF + trailing newline so the rewrite is byte-stable cross-OS (same
        # rule as render_board.py — see its note).
        board_path.write_text(
            json.dumps(board, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        summary["board_changed"] = True
        print(f"[compact_board_fragments] rewrote {BOARD_SUBDIR.as_posix()}")

    # Delete consumed fragments only AFTER the board write succeeded.
    for path in consumed:
        path.unlink()
        summary["deleted"] += 1

    if summary["board_changed"]:
        if render_fn is None:
            render_fn = _default_render(root)
        rc = render_fn()
        if rc != 0:
            msg = f"render_board.py exited {rc} — PROJECT_STATUS.md may be stale"
            print(f"[compact_board_fragments] WARNING — {msg}", file=sys.stderr)
            summary["errors"].append(msg)

    print(
        f"[compact_board_fragments] done: applied={summary['applied']} "
        f"skipped={summary['skipped']} deleted={summary['deleted']} "
        f"board_changed={summary['board_changed']}"
    )
    return summary


def _default_render(root: Path):
    """Default renderer: run tools/render_board.py as a subprocess."""

    def _run() -> int:
        import subprocess

        return subprocess.run(
            [sys.executable, str(root / "tools" / "render_board.py")],
            cwd=root,
        ).returncode

    return _run


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Compact board fragments into board_state.json.")
    parser.add_argument("--root", default=None, help="project root (defaults to repo root)")
    parser.add_argument(
        "--no-render", action="store_true", help="skip re-rendering PROJECT_STATUS.md"
    )
    args = parser.parse_args(argv)
    root = Path(args.root).resolve() if args.root else REPO_ROOT
    board_path = root / BOARD_SUBDIR
    if not board_path.is_file():
        print(f"[compact_board_fragments] ERROR: {board_path} not found", file=sys.stderr)
        return 2
    render_fn = (lambda: 0) if args.no_render else None
    compact(root, render_fn=render_fn)
    # Exit 0 even with skipped fragments — the on-main job must not wedge on one
    # bad file; skips are loud + the file survives.
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
