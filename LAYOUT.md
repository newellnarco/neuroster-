# Neuroster — UI Layout

How the screen is composed (DOM in `index.html`, styles in `styles.css`, behaviour
wired in `ui.js` / `layout.js` / `game.js`). Vertical stack inside `#app`
(flex column, `100vh`):

```
#app
├─ #topbar ............ brand + version · #resbar (resources) · spacer · controls
│                       controls: 💾 Auto-saving… · ☰ Menu · 🔄 Update · ❓ Help · 🔊 · 🏷️
├─ #envbar ............ biome · day/clock · season · weather · level · pop · wellbeing
│                       · morale · 💗 Compassion · ⚖️ Justice · 🦁 Valor · 🏭 Pollution · 🛡️⚔️ · 🏆
├─ #needsbar .......... colony-average needs (food/water/energy/fun/health)
├─ #alertbar .......... derived alerts; collapsed = top few + "▾ +N more";
│                       expanded = all (scrolls); new items blink ~4s
└─ #stage (flex row)
   ├─ #board (position context; does NOT scroll)
   │   ├─ #viewport ... the SCROLLER; holds <canvas id="game"> (zoom = CSS width)
   │   ├─ #zoomctl .... − / ⤢ / + (pinned bottom-right; overlays don't scroll)
   │   ├─ #guide ...... getting-started checklist (top-left)
   │   ├─ #flash ...... transient toast
   │   └─ .hotkeys .... bottom hint line
   ├─ #vsplit ........ vertical divider: grip dots + ‹/› collapse (hide panel)
   └─ #sidebar (flex column)
      ├─ .tabs ........ Build · Skills · Evolve · Rodents · Threats · Trade · Doctrine · Mega
      ├─ .panes ....... active tab content (scrolls)
      ├─ #hsplit ...... horizontal divider: grip dots + ⌄/⌃ collapse (hide log)
      └─ #log ......... event log (resizable height)
```

Modals (`.modal.hidden`, toggled by class): `#help-modal`, `#settings-modal`,
`#menu-modal` (Settings/Save/Save-as/Load/New/Export/Import + Update/Help proxies),
`#decree-modal` (moral dilemma + "Let the town decide"), `#biome-modal`
(character creation). Plus the `#splash` start screen (Continue/Load/New).

## Key interactions
- **Zoom:** mouse wheel over the board, or `#zoomctl` buttons. Min zoom = fit the
  window width (no empty margins); max 3.5×. Implemented as CSS width on the canvas;
  `#viewport` scrolls when zoomed in.
- **Pan:** right-button drag (cursor → grabbing). A plain right-click cancels a held
  building (pan-drags don't).
- **Select:** left-click the nearest hamster (≈1.1-tile radius) → opens it in the
  Rodents tab to care for it. Click a building to act on it (upgrade/repair/clean/
  stance/demolish).
- **Place:** pick a Build card, click a tile. Esc / right-click / click the card
  again returns to the arrow cursor.
- **Resize/collapse:** drag the grips on `#vsplit`/`#hsplit`; click their collapse
  buttons to hide/show the panel or the log. Sizes & collapsed states persist in
  `localStorage`.
- **Labels (🏷️):** toggles inline names on resource chips *and* the env-bar virtue
  chips. **Click-to-pin:** clicking a resource / env / needs chip pins its hover
  text so it stays readable.

## Persistence keys (`localStorage`)
`neuroster.slots`, `neuroster.slot.<id>`, `neuroster.activeSlot`,
`neuroster.autobegin`, `neuroster.newstart`, `neuroster.seenHelp`,
`neuroster.resLabels`, `neuroster.sidebarW`, `neuroster.logH`,
`neuroster.sidebarHid`, `neuroster.logHid`.
