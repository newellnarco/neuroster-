// game.js — wires the simulation, renderer, and UI into a running game.
import { TICKS_PER_SEC, AUTOSAVE_SEC, VERSION } from './config.js';
import { newGame } from './state.js';
import { stepEconomy } from './economy.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, clearSave, exportSave, importSaveString, hasSave } from './save.js';

const START_KEY = 'neuroster.newstart';

export function startGame(canvas) {
  // A pending character-creation choice forces a fresh world.
  let state;
  const pending = localStorage.getItem(START_KEY);
  const cameFromNewGame = !!pending;
  const savedColony = hasSave();
  if (pending) {
    localStorage.removeItem(START_KEY);
    clearSave();
    const opt = JSON.parse(pending);
    state = newGame(undefined, opt.biome || 'woodland', opt.breed || 'syrian', opt.name || null, { difficulty: opt.difficulty, density: opt.density });
  } else {
    state = loadGame() || newGame();
  }

  // Show the version everywhere it helps identify the build.
  for (const id of ['app-version', 'splash-version']) {
    const el = document.getElementById(id); if (el) el.textContent = VERSION;
  }

  const view = { placing: null, hover: null, canPlace: false, paused: false, speed: 1, selUnit: null };
  let started = false; // gameplay keys are inert until the start screen is dismissed

  const renderer = createRenderer(canvas, state, () => view);
  const audio = createAudio();
  const ui = createUI(state, {
    canvas, view, audio,
    onNewGame: (opt) => { localStorage.setItem(START_KEY, JSON.stringify(opt || {})); location.reload(); },
    onSave: () => saveGame(state),
    onExport: () => exportColony(state, ui),
    onImport: () => importColony(ui),
  });
  ui.init();
  ui.renderAll();

  // Start screen: animate a loading bar, then offer Continue / New Colony. The
  // sim stays paused (and gameplay keys inert) until the player begins.
  setupSplash(view, ui, { canResume: savedColony || cameFromNewGame }, () => { started = true; });

  // Fixed-timestep simulation; rAF rendering. NO offline progress — time only
  // advances while the page is open and unpaused.
  const tickDt = 1 / TICKS_PER_SEC;
  let lastTime = performance.now();
  let acc = 0, saveAcc = 0;

  function loop(now) {
    const frameDt = Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    if (!view.paused) {
      acc += frameDt * view.speed;
      let guard = 0;
      while (acc >= tickDt && guard++ < 240) { stepEconomy(state, tickDt); acc -= tickDt; }
      saveAcc += frameDt;
      if (saveAcc >= AUTOSAVE_SEC) { saveAcc = 0; saveGame(state); }
    }
    renderer.draw(now);
    ui.update(frameDt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener('keydown', (e) => {
    if (!started) return; // start screen still up
    if (e.code === 'Space') { e.preventDefault(); view.paused = !view.paused; ui.flash(view.paused ? '⏸ Paused' : '▶ Resumed'); }
    if (e.key === '1') view.speed = 1;
    if (e.key === '2') view.speed = 2;
    if (e.key === '3') view.speed = 4;
  });
  window.addEventListener('beforeunload', () => saveGame(state));

  return { state, view };
}

// The startup/loading screen. Fills a progress bar, then reveals the menu and
// waits for the player. `onBegin` flips the game's `started` flag.
function setupSplash(view, ui, opts, onBegin) {
  const splash = document.getElementById('splash');
  if (!splash) { view.paused = false; onBegin(); return; } // no splash markup → just play
  const canResume = !!opts.canResume;
  view.paused = true; // hold the sim while the splash is up

  const bar = document.getElementById('splash-bar');
  const loadText = document.getElementById('splash-loadtext');
  const menu = document.getElementById('splash-menu');
  const hint = document.getElementById('splash-hint');
  const btnContinue = document.getElementById('splash-continue');
  const btnNew = document.getElementById('splash-new');

  let ready = false, done = false;

  // Fill the bar in a few uneven steps for a natural "loading" feel.
  let p = 0;
  (function tick() {
    p = Math.min(1, p + 0.04 + Math.random() * 0.05);
    if (bar) bar.style.width = (p * 100).toFixed(0) + '%';
    if (p < 1) { setTimeout(tick, 60); return; }
    onReady();
  })();

  function onReady() {
    ready = true;
    if (loadText) loadText.style.display = 'none';
    if (btnContinue) btnContinue.style.display = canResume ? '' : 'none';
    if (menu) menu.classList.remove('hidden');
    if (hint) hint.textContent = canResume
      ? 'Press any key or click to begin'
      : 'Press any key or click New Colony to begin';
    window.addEventListener('keydown', onKey);
    splash.addEventListener('click', onClick);
  }
  // A bare key/click anywhere = the primary action (resume, or create if none).
  function onKey(e) { if (!ready) return; e.preventDefault(); primary(); }
  function onClick(e) { if (!ready || e.target.closest('.splash-btn')) return; primary(); }
  function primary() { canResume ? enterGame() : newColony(); }

  function enterGame() {
    if (done) return; done = true;
    cleanup();
    view.paused = false;
    onBegin();
    dismiss();
  }
  function newColony() {
    if (done) return; done = true;
    cleanup();
    dismiss();           // remove the splash so character creation is visible
    ui.newColony();      // reloads with the chosen options
  }
  function cleanup() {
    window.removeEventListener('keydown', onKey);
    splash.removeEventListener('click', onClick);
  }
  function dismiss() { splash.classList.add('gone'); setTimeout(() => splash.remove(), 600); }

  if (btnContinue) btnContinue.onclick = enterGame;
  if (btnNew) btnNew.onclick = newColony;
}

// Download the current colony as a timestamped JSON save file.
function exportColony(state, ui) {
  saveGame(state); // snapshot the very latest first
  try {
    const blob = new Blob([exportSave(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const day = Math.floor((state.env?.dayTime || 0) / 900) + 1;
    const name = (state.founder?.name || 'colony').replace(/[^a-z0-9]/gi, '') || 'colony';
    const a = document.createElement('a');
    a.href = url; a.download = `neuroster-${name}-day${day}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.flash('⬆️ Colony exported');
  } catch (e) { ui.flash('Export failed'); }
}

// Pick a save file, validate & load it, then restart the loop on it.
function importColony(ui) {
  const input = document.getElementById('import-file');
  if (!input) return;
  input.value = '';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = importSaveString(String(reader.result || ''));
      if (!r.ok) { ui.flash(r.reason || 'Import failed'); return; }
      ui.flash('⬇️ Colony imported — loading…');
      localStorage.removeItem(START_KEY); // don't override the import with a pending new game
      setTimeout(() => location.reload(), 500);
    };
    reader.onerror = () => ui.flash('Could not read that file');
    reader.readAsText(file);
  };
  input.click();
}
