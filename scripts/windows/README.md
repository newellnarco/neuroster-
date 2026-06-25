# Windows auto-update (keep your clone synced with GitHub)

A tiny, hidden background updater for the local clone at `C:\github\neuroster-`
(or wherever you cloned it). It runs `git` with **no visible window** and keeps the
working tree matched to the latest `main` on GitHub.

## Files
- **`update-neuroster.vbs`** — does one silent sync: `fetch` → `checkout -f main` →
  `reset --hard origin/main`. Finds the repo root automatically (two folders up), so
  there's nothing to edit. Logs to `update-log.txt` in the repo root.
- **`install-task.cmd`** — registers a Windows Scheduled Task that runs the VBS hidden
  **every 15 minutes** while you're logged on. Re-run it to change the interval (edit
  `INTERVAL` at the top first).

## Prerequisites
- **Git for Windows** installed and on `PATH` (open a fresh terminal and confirm
  `git --version` works). GitHub Desktop alone may not put `git` on PATH.
- You've cloned the repo at least once, so your credentials are cached (Git Credential
  Manager). Confirm a manual `git -C "C:\github\neuroster-" pull` works without
  prompting — then the hidden task will too. (Private repo: `gh auth setup-git` also
  works if you use the GitHub CLI.)

## Install
1. Make sure you have these files locally (e.g. `git pull` once).
2. Double-click **`install-task.cmd`** (or run it from a terminal).
3. That's it — it syncs every 15 minutes, silently.

Run on demand / inspect / remove:
```
schtasks /Run    /TN "Neuroster Auto-Update"
type  ..\..\update-log.txt
schtasks /Delete /TN "Neuroster Auto-Update" /F
```

## Notes
- `reset --hard` only overwrites **tracked** files, so a local untracked `.env`
  (e.g. `BIND_PORT=8888`) and `update-log.txt` are left alone.
- The task runs as you, only while logged on — that's intentional, so it can use your
  cached Git credentials for the private repo.
- This is a one-way mirror (web → local). Don't keep local edits to tracked files in
  this clone; they'll be reset on the next sync.
