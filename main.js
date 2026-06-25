// main.js — entry point. Boots the game once the DOM is ready.
import { startGame } from './src/game.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  try {
    window.NEUROSTER = startGame(canvas);
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend',
      `<pre style="color:#e06b6b;padding:16px;white-space:pre-wrap">Failed to start: ${err.message}\n${err.stack}</pre>`);
  }
});
