# Neuroster — Decision Log

Why the project is built the way it is. Newest decisions first. Keep this as a
running log so future sessions understand the *intent* behind the code, not just
the code.

## Architecture & tooling
- **Zero dependencies, no build step.** Plain ES modules + Canvas. Rationale:
  trivial to serve (one static server), trivial to deploy (a `node:alpine`
  container mounting the source), nothing to compile over a network share, and
  the whole game is hackable by editing files. Cost: we hand-roll rendering,
  audio, and texturing instead of using libraries.
- **Data-driven content in `config.js`.** New buildings/disasters/seasons/decrees
  are data, not code. Keeps engine churn low and makes balance tweaks one-liners.
- **Push detail to the client.** Textures (`textures.js`) and audio (`audio.js`)
  are synthesised in the browser from a tiny amount of code + a 64-colour palette,
  so the server ships ~no assets and rich detail costs zero bandwidth.
- **Determinism in save-affecting paths.** Event/decree RNG is state-seeded; we
  avoid `Date.now()`/`Math.random()` where it would break replay/resume.

## Workflow
- **One branch, squash-merge to `main`.** Every change: build → `npm run check` +
  `npm test` + a Playwright smoke (zero console errors) → PR → CI green →
  **squash-merge** → reset the working branch to `main` and force-push so it never
  drifts. Squash keeps history clean and avoids unverified merge commits.
- **Verify in a real browser every UI change** (Playwright via the system Node),
  asserting zero console errors and the actual behaviour (selection maps, modal
  opens, drag resizes, etc.).

## Game design
- **It's an auto-colony sim, not an RTS.** Hamsters explore, gather, eat, sleep and
  bury the dead *on their own*. The player shapes the colony (build, care, decide),
  they do not issue move/attack orders. Consequence: clicking a hamster *cares for*
  it (Feed/Water/Play/Pet); there is no unit commanding, and marquee/multi-select
  has nothing to command (deferred). Burial is automatic once a Graveyard exists.
- **Kindness is mechanically central.** 💗 Compassion is a real stat that calms
  predators and draws joiners; rescues, mercy, an Almshouse and care raise it.
- **A moral triangle:** ⚖️ Justice/Order (deters raids) is Compassion's
  counterweight; 🦁 Valor (martial pride) is a deliberately *morally neutral* third
  pole (the "Spartan" path) so fighting is a valid, non-evil identity.
- **"Spend a virtue on purpose."** Decrees are hard dilemmas where every choice
  trades one virtue (or food/comfort) for another — the requested "spend morale for
  the group." Dithering auto-resolves (small penalty); "Let the town decide" defers
  cleanly. Some choices ripen later (`pendingFates`: raised cub → guardian / leaves
  / Trojan-horse; sheltered herd → gift, or its predators follow).
- **Doctrines turn virtues into skill trees** (War/Negotiation/Stoicism/Sacrifice),
  gated by virtue thresholds + research; effects fold like megaprojects.
- **Environmental tradeoffs:** coal power is strong but emits **Pollution** that
  poisons farms and sickens rodents; forests scrub it; solar/hydro/wheels are clean
  (hydro throttles upstream like beaver dams). Plant trees to offset industry.

## UX (from live playtesting)
- **Gentler onboarding:** more starting resources incl. planks; base storage 300→700
  so you don't start over the cap; nearest-rodent click selection (moving targets);
  slower event pacing (`EVENT_PACE`, longer grace) so a normal game breathes.
- **Modular, resizable UI:** draggable + collapsible panel/log dividers (grips +
  collapse buttons); zoom (wheel + buttons, min = fit-to-width) with right-drag pan;
  pinned overlays via an inner `#viewport` scroller.
- **Decluttered header → ☰ Menu** (Settings/Save/Save-as/Load/New/Export/Import),
  header keeps only Update/Help/Sound/Labels; autosave indicator; resource & virtue
  **label toggle**; click-to-pin tooltips; expandable alert bar with new-item blink.
- **In-game 🔄 Update button** (autosave + reload to latest served code) + a version
  poll that lights it up — so testers self-update without touching the NAS.

## Deployment
- **Target: Synology DS1517+, DSM 7.1.1** → only the legacy **Docker** package
  (no Container Manager / no compose UI). So the canonical path is a **manually
  created container** from `node:*-alpine`, command `node /app/server.js`, with the
  source bind-mounted read-only at `/app` and port `8080`. `docker-compose.nas.yml`
  is kept for Container-Manager-capable models (plain `8080:8080`, no `${VAR}`
  interpolation — Synology's validator rejects it; `.gitattributes` forces LF).
- **LAN URL: `http://192.168.1.90:8080`.** Source synced to the NAS from a Windows
  git checkout via `scripts/windows/update-neuroster.vbs`; the server serves files
  live with `Cache-Control: no-cache`, so a refresh (or the in-game Update button)
  shows the newest commit.
