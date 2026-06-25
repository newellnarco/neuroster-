// ui.js — HUD, build menu, tech tree, rodent/trait panel, event log.
import { RESOURCES, BUILDINGS, TECH, SPECIES, NEEDS, TRAITS, DISASTERS } from './config.js';
import { totalStored, population, wellbeingMul } from './state.js';
import { placeBuilding, canPlace, researchTech, upgradeTrait, traitCost, recruit, demolish } from './buildings.js';
import { protectionAgainst, totalOffense } from './events.js';

export function createUI(state, ctx) {
  // ctx: { canvas, view, onNewGame, onSave }
  const el = (id) => document.getElementById(id);
  const view = ctx.view;

  // ---- Resource & needs bar ----
  function renderTopbar() {
    const order = ['wood', 'stone', 'ironore', 'coal', 'seeds', 'water', 'food', 'planks', 'iron', 'power', 'research'];
    el('resbar').innerHTML = order.map(k => {
      const r = RESOURCES[k];
      return `<span class="res" title="${r.name}">${r.icon}<b>${fmt(state.res[k] || 0)}</b></span>`;
    }).join('') +
      `<span class="res storage" title="Storage used / cap">📦<b>${fmt(totalStored(state))}/${state.storageCap}</b></span>` +
      `<span class="res" title="Population / cap">👥<b>${population(state)}/${state.popCap}</b></span>`;

    el('needsbar').innerHTML = Object.entries(NEEDS).map(([k, def]) => {
      const v = Math.round(state.needs[k] || 0);
      const cls = v < 30 ? 'low' : v < 60 ? 'mid' : 'ok';
      return `<span class="need ${cls}" title="${def.name}: ${def.desc}">${def.icon}
        <span class="bar"><span style="width:${v}%"></span></span></span>`;
    }).join('') +
      `<span class="need wb" title="Overall wellbeing multiplier">😊 ×${wellbeingMul(state).toFixed(2)}</span>` +
      `<span class="need def" title="Defense / Offense rating">🛡️${state.defense} ⚔️${totalOffense(state)}</span>`;
  }

  // ---- Build menu ----
  function renderBuild() {
    const cats = {};
    for (const [id, def] of Object.entries(BUILDINGS)) (cats[def.category] ??= []).push([id, def]);
    el('tab-build').innerHTML = Object.entries(cats).map(([cat, items]) => `
      <div class="cat">${cat}</div>
      <div class="grid">${items.map(([id, def]) => {
        const afford = Object.entries(def.cost).every(([k, v]) => (state.res[k] || 0) >= v);
        return `<button class="card ${view.placing === id ? 'sel' : ''} ${afford ? '' : 'poor'}" data-build="${id}">
          <div class="ico">${def.icon}</div>
          <div class="nm">${def.name}</div>
          <div class="cost">${costStr(def.cost)}</div>
          <div class="ds">${def.desc}</div>
        </button>`;
      }).join('')}</div>`).join('');
    el('tab-build').querySelectorAll('[data-build]').forEach(btn => {
      btn.onclick = () => { view.placing = view.placing === btn.dataset.build ? null : btn.dataset.build; renderBuild(); };
    });
  }

  // ---- Tech tree ----
  function renderTech() {
    el('tab-tech').innerHTML = `<div class="grid">${Object.entries(TECH).map(([id, t]) => {
      const done = state.tech[id];
      const afford = Object.entries(t.cost).every(([k, v]) => (state.res[k] || 0) >= v);
      return `<button class="card tech ${done ? 'done' : ''} ${afford || done ? '' : 'poor'}" data-tech="${id}" ${done ? 'disabled' : ''}>
        <div class="ico">${t.icon}</div><div class="nm">${t.name}</div>
        <div class="cost">${done ? '✓ Researched' : costStr(t.cost)}</div>
        <div class="ds">${t.desc}</div>
      </button>`;
    }).join('')}</div>`;
    el('tab-tech').querySelectorAll('[data-tech]').forEach(btn => {
      btn.onclick = () => { researchTech(state, btn.dataset.tech); renderTech(); renderRodents(); };
    });
  }

  // ---- Rodents & traits ----
  function renderRodents() {
    const recruitables = Object.keys(SPECIES).filter(s => state.unlockedSpecies[s] && s !== 'hamster');
    const recruitHtml = recruitables.length ? `<div class="cat">Recruit</div><div class="grid">${
      recruitables.map(s => `<button class="card" data-recruit="${s}">
        <div class="ico">${SPECIES[s].icon}</div><div class="nm">${SPECIES[s].name}</div>
        <div class="cost">🌾25 🔬10</div><div class="ds">${SPECIES[s].role || ''}</div></button>`).join('')}</div>` : '';

    // group units by species, show one expandable per unit (cap list length)
    const list = state.units.slice(0, 40).map(u => {
      const sp = SPECIES[u.species];
      const hybrid = u.hybridOf ? ` <span class="hyb">hybrid</span>` : '';
      const traits = Object.entries(TRAITS).map(([tid, td]) => {
        const lvl = u.traits[tid] || 0;
        const cost = traitCost(lvl);
        const afford = Object.entries(cost).every(([k, v]) => (state.res[k] || 0) >= v);
        return `<button class="trait ${afford && lvl < 6 ? '' : 'poor'}" data-unit="${u.id}" data-trait="${tid}"
          title="${td.name}: ${td.desc}\nNext: ${costStr(cost)}">${td.icon}${'•'.repeat(lvl) || '–'}</button>`;
      }).join('');
      return `<div class="unit"><span class="uhead">${sp.icon} #${u.id}${hybrid}</span>${traits}</div>`;
    }).join('');

    el('tab-rodents').innerHTML = recruitHtml +
      `<div class="cat">Colony (${population(state)}) — upgrade traits</div>
       <div class="hint">Traits raise a rodent's mining, speed, carry, stamina or wit. New hamsters can be born as hybrids that blend parents' best traits.</div>
       <div class="units">${list}</div>`;

    el('tab-rodents').querySelectorAll('[data-recruit]').forEach(btn => {
      btn.onclick = () => { recruit(state, btn.dataset.recruit); renderRodents(); };
    });
    el('tab-rodents').querySelectorAll('[data-trait]').forEach(btn => {
      btn.onclick = () => {
        const u = state.units.find(x => x.id == btn.dataset.unit);
        if (u) upgradeTrait(state, u, btn.dataset.trait);
        renderRodents();
      };
    });
  }

  // ---- Threats panel ----
  function renderThreats() {
    el('tab-threats').innerHTML =
      `<div class="hint">Predators snatch rodents; disasters wreck buildings & stores. Raise protection with defensive buildings AND by keeping protective species in your colony. Barracks/Watchtowers also add ⚔️ offense to fight predators.</div>
       <div class="cat">Current — 🛡️ ${state.defense} defense · ⚔️ ${totalOffense(state)} offense</div>` +
      Object.entries(DISASTERS).map(([key, d]) => {
        const prot = protectionAgainst(state, key) + (d.kind === 'predator' ? totalOffense(state) : 0);
        const sev = Math.round(d.baseSeverity * (1 + state.time / 4 / 3000));
        const ratio = Math.min(1, prot / Math.max(1, sev));
        const cls = ratio >= 1 ? 'ok' : ratio >= 0.6 ? 'mid' : 'low';
        const helpers = [
          ...Object.entries(BUILDINGS).filter(([, b]) => b.protect?.[key]).map(([, b]) => b.icon),
          ...Object.entries(SPECIES).filter(([, s]) => s.protect?.[key]).map(([, s]) => s.icon),
        ];
        return `<div class="threat">
          <div class="trow"><span>${d.icon} <b>${d.name}</b></span>
            <span class="${cls === 'ok' ? 'gd' : cls === 'low' ? 'bd' : ''}">${Math.round(prot)} / ${sev}</span></div>
          <div class="need ${cls}"><span class="bar" style="width:100%"><span style="width:${ratio * 100}%"></span></span></div>
          <div class="ds">${d.desc} <span class="helpers">Counter: ${helpers.join(' ') || '—'}</span></div>
        </div>`;
      }).join('');
  }

  // ---- Log ----
  function renderLog() {
    el('log').innerHTML = state.log.slice(0, 12).map(l => `<div>${l.msg}</div>`).join('');
  }

  // ---- Tabs ----
  function setupTabs() {
    document.querySelectorAll('.tabbtn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.tabbtn').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tabpane').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        el('tab-' + b.dataset.tab).classList.add('active');
      };
    });
    el('btn-new').onclick = () => { if (confirm('Start a new colony? Current progress is lost.')) ctx.onNewGame(); };
    el('btn-save').onclick = () => { ctx.onSave(); flash('Saved!'); };
  }

  // ---- Canvas interaction ----
  function setupCanvas() {
    const c = ctx.canvas;
    const toTile = (e) => {
      const r = c.getBoundingClientRect();
      const sx = c.width / r.width, sy = c.height / r.height;
      return { x: Math.floor((e.clientX - r.left) * sx / TILE_), y: Math.floor((e.clientY - r.top) * sy / TILE_) };
    };
    c.addEventListener('mousemove', (e) => {
      const t = toTile(e);
      view.hover = t;
      if (view.placing) view.canPlace = canPlace(state, view.placing, t.x, t.y).ok;
    });
    c.addEventListener('mouseleave', () => view.hover = null);
    c.addEventListener('click', (e) => {
      const t = toTile(e);
      if (view.placing) {
        const r = placeBuilding(state, view.placing, t.x, t.y);
        if (!r.ok) flash(r.reason);
        else { renderBuild(); renderTopbar(); }
        return;
      }
      // click an existing building to demolish (with confirm)
      const b = state.buildings.find(b => b.x === t.x && b.y === t.y);
      if (b && confirm(`Demolish ${BUILDINGS[b.type].name}? (50% refund)`)) { demolish(state, b); }
    });
    // right-click cancels placement
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); view.placing = null; renderBuild(); });
  }

  let flashTimer;
  function flash(msg) {
    const f = el('flash'); f.textContent = msg; f.classList.add('show');
    clearTimeout(flashTimer); flashTimer = setTimeout(() => f.classList.remove('show'), 1600);
  }

  function init() { setupTabs(); setupCanvas(); renderBuild(); renderTech(); renderRodents(); renderThreats(); }

  // Called every frame (cheap parts) + periodically (expensive panels).
  let acc = 0;
  function update(dt) {
    renderTopbar();
    acc += dt;
    if (acc > 0.5) { acc = 0; renderLog();
      if (el('tab-rodents').classList.contains('active')) renderRodents();
      if (el('tab-threats').classList.contains('active')) renderThreats();
      if (el('tab-build').classList.contains('active')) refreshAfford();
    }
  }
  function refreshAfford() {
    el('tab-build').querySelectorAll('[data-build]').forEach(btn => {
      const def = BUILDINGS[btn.dataset.build];
      const afford = Object.entries(def.cost).every(([k, v]) => (state.res[k] || 0) >= v);
      btn.classList.toggle('poor', !afford);
    });
  }

  return { init, update, flash, renderAll: () => { renderTopbar(); renderBuild(); renderTech(); renderRodents(); renderThreats(); renderLog(); } };
}

// tile size imported lazily to avoid circular concerns
import { TILE } from './config.js';
const TILE_ = TILE;

function fmt(n) { n = Math.floor(n); return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : '' + n; }
function costStr(cost) {
  return Object.entries(cost).map(([k, v]) => `${RESOURCES[k]?.icon || k}${v}`).join(' ');
}
