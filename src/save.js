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

// Is there a saved colony to resume? (Used by the start screen.)
export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }

// ---- Export / import -------------------------------------------------------
// Lets players back up or move a colony (and hand a save to a tester). Export
// returns a portable JSON string; import validates it, persists it as the live
// save, and returns the parsed state (caller typically reloads to start it).
export function exportSave(state) {
  return JSON.stringify({ ...state, savedAt: Date.now(), _neuroster: 'save-v1' });
}

export function importSaveString(raw) {
  let state;
  try { state = JSON.parse(raw); }
  catch { return { ok: false, reason: 'Not valid save data (could not parse).' }; }
  if (!state || !state.world || !Array.isArray(state.units))
    return { ok: false, reason: 'This file is not a Neuroster colony save.' };
  reattachTyped(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { return { ok: false, reason: 'Could not store the imported save.' }; }
  return { ok: true, state };
}

// JSON loses typed-array typing; restore terrain/fog/fertile (Uint8) & waste (Float32).
function reattachTyped(state) {
  if (!state.world) return;
  for (const field of ['terrain', 'seen', 'fertile']) {
    const v = state.world[field]; if (!v) continue;
    state.world[field] = Array.isArray(v) ? Uint8Array.from(v) : Uint8Array.from(Object.values(v));
  }
  const w = state.world.waste;
  if (w) state.world.waste = Array.isArray(w) ? Float32Array.from(w) : Float32Array.from(Object.values(w));
}
