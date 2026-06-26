// select.js — pure helpers for the Animals / Buildings / Demolish tool modes and
// the click-drag marquee multi-select. DOM-free so the headless smoke suite can
// assert the selection + group-action logic directly (the UI in ui.js just wires
// these to pointer events + flashes).
import { NODE_TYPES, RESOURCES } from './config.js';
import { directToService, serviceNeedOf, demolish, cleanBurrow, buildingActionable } from './buildings.js';

export const TOOLS = ['animals', 'buildings', 'demolish'];
export const isSelectTool = (tool) => tool === 'animals' || tool === 'buildings';

// Normalise a drag rectangle (start/end tiles in any order) into inclusive
// integer min/max bounds, so "inside the rect" is a simple range test.
export function normRect(x0, y0, x1, y1) {
  return {
    x0: Math.min(x0, x1), y0: Math.min(y0, y1),
    x1: Math.max(x0, x1), y1: Math.max(y0, y1),
  };
}

// How far (in tiles) a drag must travel before it counts as a marquee rather
// than a plain click. Kept small so a deliberate drag is a marquee, a tap isn't.
export const DRAG_THRESHOLD = 0.6;
export function isDrag(x0, y0, x1, y1) {
  return Math.hypot(x1 - x0, y1 - y0) >= DRAG_THRESHOLD;
}

// A rodent is "inside" the rect if its drawn position falls within the inclusive
// tile bounds (with a half-tile of slack so an entity centred on an edge tile
// still counts).
export function unitsInRect(state, rect) {
  const r = normRect(rect.x0, rect.y0, rect.x1, rect.y1);
  const out = [];
  for (const u of state.units) {
    const ux = u._rx ?? u.x, uy = u._ry ?? u.y;
    if (ux >= r.x0 - 0.5 && ux <= r.x1 + 0.5 && uy >= r.y0 - 0.5 && uy <= r.y1 + 0.5) out.push(u);
  }
  return out;
}

// Buildings whose tile falls within the inclusive rect bounds.
export function buildingsInRect(state, rect) {
  const r = normRect(rect.x0, rect.y0, rect.x1, rect.y1);
  return (state.buildings || []).filter(b => b.x >= r.x0 && b.x <= r.x1 && b.y >= r.y0 && b.y <= r.y1);
}

// ---- Selection setters (keep selUnit = primary so the Rodents panel works) ----
export function selectUnits(view, units) {
  view.selUnits = units.map(u => u.id);
  view.selUnit = view.selUnits[0] ?? null;
  return view.selUnits;
}
export function selectBuildings(view, buildings) {
  view.selBuildings = buildings.slice();
  return view.selBuildings;
}
export function clearSelection(view) {
  view.selUnits = [];
  view.selBuildings = [];
  view.selUnit = null;
}

// The live array of selected unit objects (resolves ids → units, dropping any
// that have since died/left).
export function selectedUnits(state, view) {
  const ids = view.selUnits || (view.selUnit != null ? [view.selUnit] : []);
  return ids.map(id => state.units.find(u => u.id === id)).filter(Boolean);
}

// ---- Group actions on a multi-selection -------------------------------------
// Send EVERY selected rodent to gather a resource node: pin its job preference to
// the node kind and march it over. Returns a summary for the UI flash.
export function groupGather(state, units, node) {
  if (!node || !NODE_TYPES[node.kind]) return { ok: false };
  for (const u of units) {
    u.jobPref = node.kind;
    u.targetNode = null;
    u.order = { kind: 'goto', x: node.x, y: node.y };
    u._exTarget = null;
  }
  const resName = RESOURCES[NODE_TYPES[node.kind].resource]?.name || node.kind;
  return { ok: true, n: units.length, resource: resName };
}

// Send EVERY selected rodent to a feeder/well to eat/drink (a service order).
export function groupService(state, units, b) {
  const need = serviceNeedOf(b);
  if (!need) return { ok: false };
  for (const u of units) directToService(state, u, b);
  return { ok: true, n: units.length, need };
}

// Send EVERY selected rodent to a tile (goto), fanned out around it a little so
// they don't all pile onto one square.
export function groupGoto(state, units, x, y) {
  const n = units.length;
  units.forEach((u, i) => {
    // Spiral-ish fan: ring radius grows as the group does, kept small.
    const ang = (i / Math.max(1, n)) * Math.PI * 2;
    const rad = n > 1 ? 0.4 + Math.floor(i / 8) * 0.8 : 0;
    u.order = { kind: 'goto', x: x + Math.cos(ang) * rad, y: y + Math.sin(ang) * rad };
    u.targetNode = null; u._exTarget = null;
  });
  return { ok: true, n };
}

// Apply a pinned job kind to every selected rodent (the 🎯 Job buttons acting on
// a multi-selection). `kind` === null clears it back to Auto.
export function groupJob(state, units, kind) {
  for (const u of units) { u.jobPref = kind || null; u.targetNode = null; }
  return { ok: true, n: units.length, kind };
}

// ---- Group building actions --------------------------------------------------
// Demolish every building in a list (the drag-bulldoze / bulk-demolish). Returns
// the count actually removed.
export function groupDemolish(state, buildings) {
  let n = 0;
  for (const b of buildings.slice()) { if (state.buildings.includes(b)) { demolish(state, b); n++; } }
  return { ok: n > 0, n };
}

// Clean every dirty burrow in a building selection. Returns the count cleaned.
export function groupCleanBurrows(state, buildings) {
  let n = 0;
  for (const b of buildings) { if (buildingActionable(state, b) === 'clean') { const r = cleanBurrow(state, b); if (r.ok) n++; } }
  return { ok: n > 0, n };
}
