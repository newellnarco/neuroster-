// layout.js — resizable UI: a draggable vertical divider to widen/narrow the
// side panel (so you can favour the menu or the gameplay), a horizontal divider
// to resize the event log, and click-to-pin tooltips (the hover popup, but it
// sticks so you can read it). Sizes persist in localStorage.

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function setupLayout() {
  const sidebar = document.getElementById('sidebar');
  const log = document.getElementById('log');
  const vsplit = document.getElementById('vsplit');
  const hsplit = document.getElementById('hsplit');

  // Restore saved sizes.
  const sw = parseInt(get('neuroster.sidebarW'), 10);
  if (sidebar && sw) sidebar.style.width = clamp(sw, 240, window.innerWidth - 220) + 'px';
  const lh = parseInt(get('neuroster.logH'), 10);
  if (log && lh) log.style.height = clamp(lh, 60, 560) + 'px';

  // Vertical divider: drag left/right to resize the side panel.
  if (vsplit && sidebar) drag(vsplit, (dx) => {
    const w = clamp(sidebar.getBoundingClientRect().width - dx, 240, window.innerWidth - 220);
    sidebar.style.width = w + 'px'; set('neuroster.sidebarW', Math.round(w));
  });

  // Horizontal divider: drag up/down to resize the event log.
  if (hsplit && log && sidebar) drag(hsplit, (_dx, dy) => {
    const max = Math.max(80, sidebar.getBoundingClientRect().height - 160);
    const h = clamp(log.getBoundingClientRect().height - dy, 60, max);
    log.style.height = h + 'px'; set('neuroster.logH', Math.round(h));
  });

  setupPinTooltips();
}

// Generic pointer-drag helper: calls onMove(dx, dy) with per-move deltas.
function drag(handle, onMove) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    let lx = e.clientX, ly = e.clientY;
    try { handle.setPointerCapture(e.pointerId); } catch {}
    handle.classList.add('dragging');
    const move = (ev) => { onMove(ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; };
    const up = () => {
      handle.classList.remove('dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

// Click-to-pin tooltips: click a resource / env chip (anything with a title) to
// pin its hover text so you can actually read it; click again or elsewhere to
// dismiss. We stash the title in data-tip so the native hover still works too.
function setupPinTooltips() {
  let pop = document.getElementById('pin-tip');
  if (!pop) { pop = document.createElement('div'); pop.id = 'pin-tip'; pop.className = 'pin-tip hidden'; document.body.appendChild(pop); }
  const hide = () => { pop.classList.add('hidden'); pop.dataset.tip = ''; };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('#resbar .res, #envbar .env, #needsbar .need');
    if (!el) { if (!e.target.closest('#pin-tip')) hide(); return; }
    const text = el.getAttribute('title') || el.getAttribute('data-tip');
    if (!text) return;
    // Toggle off if the same text is already pinned (the chips re-render each
    // frame, so compare by text, not element identity).
    if (!pop.classList.contains('hidden') && pop.dataset.tip === text) { hide(); return; }
    pop.textContent = text;
    pop.dataset.tip = text;
    pop.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    pop.style.left = clamp(r.left, 8, window.innerWidth - pop.offsetWidth - 8) + 'px';
    pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6) + 'px';
    e.stopPropagation();
  });
}
