// game.js — wires the simulation, renderer, and UI into a running game.
import { TICKS_PER_SEC, AUTOSAVE_SEC } from './config.js';
import { newGame } from './state.js';
import { stepEconomy } from './economy.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { saveGame, loadGame, clearSave } from './save.js';

const START_KEY = 'neuroster.newstart';

export function startGame(canvas) {
  // A pending character-creation choice forces a fresh world.
  let state;
  const pending = localStorage.getItem(START_KEY);
  if (pending) {
    localStorage.removeItem(START_KEY);
    clearSave();
    const opt = JSON.parse(pending);
    state = newGame(undefined, opt.biome || 'woodland', opt.breed || 'syrian', opt.name || null);
  } else {
    state = loadGame() || newGame();
  }

  const view = { placing: null, hover: null, canPlace: false, paused: false, speed: 1, selUnit: null };

  const renderer = createRenderer(canvas, state, () => view);
  const ui = createUI(state, {
    canvas, view,
    onNewGame: (opt) => { localStorage.setItem(START_KEY, JSON.stringify(opt || {})); location.reload(); },
    onSave: () => saveGame(state),
  });
  ui.init();
  ui.renderAll();

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
    renderer.draw();
    ui.update(frameDt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); view.paused = !view.paused; ui.flash(view.paused ? '⏸ Paused' : '▶ Resumed'); }
    if (e.key === '1') view.speed = 1;
    if (e.key === '2') view.speed = 2;
    if (e.key === '3') view.speed = 4;
  });
  window.addEventListener('beforeunload', () => saveGame(state));

  return { state, view };
}
