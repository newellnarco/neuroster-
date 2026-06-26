// save.js — multi-slot persistence: one slot per hamster colony. The ACTIVE
// slot is what the running game autosaves to; the start screen lists all slots
// so you can keep several hamsters and jump back into any one's latest autosave.
// Time only advances while playing — there is NO offline progress.
const PREFIX = 'neuroster.';
const INDEX_KEY = PREFIX + 'slots';          // [{id,name,breed,biome,day,savedAt,version}]
const ACTIVE_KEY = PREFIX + 'activeSlot';    // id of the slot the game writes to
const SLOT_KEY = (id) => PREFIX + 'slot.' + id;
const LEGACY_KEY = PREFIX + 'save.v2';       // pre-slots single save (migrated once)

function readIndex() { try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch { return []; } }
function writeIndex(list) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch {} }
export function getActiveSlot() { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } }
export function selectSlot(id) { try { localStorage.setItem(ACTIVE_KEY, id); } catch {} return id; }
function genId() { return 'h' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36); }

function slotMeta(id, state) {
  return {
    id,
    name: state?.founder?.name || 'Colony',
    breed: state?.founder?.breed || 'syrian',
    biome: state?.biome || 'woodland',
    day: Math.floor((state?.env?.dayTime || 0) / 900) + 1,
    savedAt: Date.now(),
    version: state?.version,
  };
}

// Fold a pre-slots single save into a slot the first time we see it.
function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw || readIndex().length) return;
    const id = genId();
    localStorage.setItem(SLOT_KEY(id), raw);
    writeIndex([slotMeta(id, JSON.parse(raw))]);
    selectSlot(id);
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}

// ---- Public API ----
export function listSlots() { migrateLegacy(); return readIndex().slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); }
export function hasSave() { migrateLegacy(); return readIndex().length > 0; }

// Capture per-colony view preferences (zoom + pan center) into the save state so
// reloading restores the player's last camera. `view` is the live UI view object;
// the pan center is recorded as a 0..1 fraction of the map so it survives a
// differently-sized window on reload. No-ops gracefully if either is missing.
export function captureViewPrefs(state, view) {
  if (!state || !view) return;
  const vp = (state.viewPrefs = state.viewPrefs || {});
  if (typeof view.zoom === 'number') vp.zoom = view.zoom;
  if (typeof view.centerFracX === 'number') vp.centerFracX = view.centerFracX;
  if (typeof view.centerFracY === 'number') vp.centerFracY = view.centerFracY;
}

// Save the running state to the active slot (creating one if needed).
export function saveGame(state) {
  try {
    let id = getActiveSlot();
    if (!id) { id = selectSlot(genId()); }
    localStorage.setItem(SLOT_KEY(id), JSON.stringify({ ...state, savedAt: Date.now() }));
    const list = readIndex().filter(s => s.id !== id);
    list.push(slotMeta(id, state));
    writeIndex(list);
    return true;
  } catch (e) { console.warn('save failed', e); return false; }
}

// Load the active slot's state (or null).
export function loadGame() {
  migrateLegacy();
  return loadSlotState(getActiveSlot());
}
// Make a slot active and load it.
export function loadSlot(id) { selectSlot(id); return loadSlotState(id); }
function loadSlotState(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(SLOT_KEY(id));
    if (!raw) return null;
    const state = JSON.parse(raw);
    reattachTyped(state);
    return state;
  } catch (e) { console.warn('load failed', e); return null; }
}

// Begin a brand-new slot for a freshly-created colony, and persist it.
export function startNewSlot(state) { selectSlot(genId()); return saveGame(state); }

// Fork the current colony into a NEW named slot (Save As), and make it active.
export function saveAsNewSlot(state, name) {
  selectSlot(genId());
  const s = name ? { ...state, founder: { ...(state.founder || {}), name: String(name).slice(0, 16) } } : state;
  return saveGame(s);
}

export function deleteSlot(id) {
  try {
    localStorage.removeItem(SLOT_KEY(id));
    writeIndex(readIndex().filter(s => s.id !== id));
    if (getActiveSlot() === id) localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

// ---- Export / import (portable single-colony JSON) ----
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
  startNewSlot(state); // import lands as a new hamster slot, made active
  return { ok: true, state };
}

// JSON loses typed-array typing; restore terrain/fog/fertile/river (Uint8),
// flow (Int8, signed) & waste (Float32).
function reattachTyped(state) {
  if (!state.world) return;
  for (const field of ['terrain', 'seen', 'fertile', 'river']) {
    const v = state.world[field]; if (!v) continue;
    state.world[field] = Array.isArray(v) ? Uint8Array.from(v) : Uint8Array.from(Object.values(v));
  }
  const fl = state.world.flow;
  if (fl) state.world.flow = Array.isArray(fl) ? Int8Array.from(fl) : Int8Array.from(Object.values(fl));
  const w = state.world.waste;
  if (w) state.world.waste = Array.isArray(w) ? Float32Array.from(w) : Float32Array.from(Object.values(w));
}
