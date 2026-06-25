// save.js — localStorage persistence + offline progress.
import { MAX_OFFLINE_HRS, TICKS_PER_SEC } from './config.js';
import { stepEconomy } from './economy.js';
import { logMsg } from './state.js';

const KEY = 'neuroster.save.v1';

export function saveGame(state) {
  try {
    const data = JSON.stringify({ ...state, savedAt: Date.now() });
    localStorage.setItem(KEY, data);
    return true;
  } catch (e) { console.warn('save failed', e); return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    // Reattach typed array for terrain (JSON loses Uint8Array type).
    if (state.world && Array.isArray(state.world.terrain)) {
      state.world.terrain = Uint8Array.from(state.world.terrain);
    } else if (state.world && state.world.terrain && state.world.terrain['0'] !== undefined) {
      state.world.terrain = Uint8Array.from(Object.values(state.world.terrain));
    }
    return state;
  } catch (e) { console.warn('load failed', e); return null; }
}

export function clearSave() { localStorage.removeItem(KEY); }

// Simulate elapsed offline time (capped) at a coarse step for a welcome-back reward.
export function applyOfflineProgress(state) {
  if (!state.savedAt) return 0;
  const elapsedMs = Date.now() - state.savedAt;
  const cappedMs = Math.min(elapsedMs, MAX_OFFLINE_HRS * 3600 * 1000);
  let seconds = Math.floor(cappedMs / 1000);
  if (seconds < 30) return 0;
  // Coarse simulation: 1-second steps, cap iterations for performance.
  const dt = 1;
  const steps = Math.min(seconds, 6 * 3600); // hard cap iterations
  for (let i = 0; i < steps; i++) stepEconomy(state, dt);
  logMsg(state, `🌙 Welcome back! Your colony worked for ${(seconds / 60 | 0)} min while away.`);
  return seconds;
}
