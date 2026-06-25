// save.js — localStorage persistence. Time only advances while you're playing:
// there is NO offline progress — the world is exactly as you left it.
const KEY = 'neuroster.save.v2';

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    return true;
  } catch (e) { console.warn('save failed', e); return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    reattachTyped(state);
    return state;
  } catch (e) { console.warn('load failed', e); return null; }
}

export function clearSave() { localStorage.removeItem(KEY); }

// JSON loses Uint8Array typing; restore terrain & fog layers.
function reattachTyped(state) {
  if (!state.world) return;
  for (const field of ['terrain', 'seen']) {
    const v = state.world[field];
    if (!v) continue;
    state.world[field] = Array.isArray(v) ? Uint8Array.from(v) : Uint8Array.from(Object.values(v));
  }
}
