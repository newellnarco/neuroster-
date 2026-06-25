// ui.js — HUD, build/skill/evolution/rodent/threat panels, biome picker.
import { RESOURCES, BUILDINGS, TECH, SPECIES, NEEDS, TRAITS, DISASTERS, EVOLUTIONS, BIOMES, BREEDS, HAMSTER_NAMES, CARE, SLEEP, FACTIONS, TRADE, DIFFICULTIES, DENSITIES, TILE, xpForLevel } from './config.js';
import { totalStored, population, wellbeingMul, colonyNeeds } from './state.js';
import { placeBuilding, canPlace, researchTech, evolve, upgradeTrait, traitCost, recruit, demolish, mainLevel, renameFounder, careFor, repairMine, upgradeTunnel, upgradeTownhall, cleanBurrow, giftFaction, barterFaction, requestAid, hasTradingHut } from './buildings.js';
import { protectionAgainst, totalOffense } from './events.js';
import { dayNumber, clockString, currentWeather, isNight } from './environment.js';
import { MILESTONES } from './milestones.js';
import { computeAlerts } from './alerts.js';
import { MEGAPROJECTS } from './config.js';
import { contributeMega, remainingCost, megaProgress, isMegaUnlocked, megaCount, costText as megaCostText } from './megaprojects.js';

export function createUI(state, ctx) {
  const el = (id) => document.getElementById(id);
  const view = ctx.view;
  const audio = ctx.audio || { play() {}, toggle() { return false; }, isMuted() { return false; } };
  const sfx = (name) => audio.play(name);

  // ---- Resource bar ----
  function renderResbar() {
    const order = ['wood', 'stone', 'ironore', 'coal', 'seeds', 'water', 'food', 'planks', 'iron', 'power', 'research'];
    el('resbar').innerHTML = order.map(k => {
      const r = RESOURCES[k];
      return `<span class="res" title="${r.name}">${r.icon}<b>${fmt(state.res[k] || 0)}</b></span>`;
    }).join('') +
      `<span class="res storage" title="Storage used / cap">📦<b>${fmt(totalStored(state))}/${state.storageCap}</b></span>`;
  }

  // ---- Environment bar (biome, day/clock, weather, level, defense) ----
  function renderEnv() {
    const biome = BIOMES[state.world.biome] || BIOMES.woodland;
    const w = currentWeather(state);
    const f = state.founder || { name: 'Founder', breed: 'syrian' };
    el('envbar').innerHTML =
      `<span class="env founder" id="founder-chip" title="Your founder hamster — click to rename (once every 30 days)">🐹 ${f.name} · ${BREEDS[f.breed]?.name || ''}</span>` +
      `<span class="env" title="Biome">${biome.icon} ${biome.name}</span>` +
      `<span class="env" title="In-game day & time (1 day = 15 min)">${isNight(state) ? '🌙' : '☀️'} Day ${dayNumber(state)} · ${clockString(state)}</span>` +
      `<span class="env" title="${w.name}: ${w.desc}">${w.icon} ${w.name}</span>` +
      `<span class="env" title="Your highest rodent level — gates advanced content">🎖️ Main Lv.${mainLevel(state)}</span>` +
      `<span class="env" title="Population / cap">👥 ${population(state)}/${state.popCap}</span>` +
      `<span class="env" title="Overall wellbeing multiplier">😊 ×${wellbeingMul(state).toFixed(2)}</span>` +
      `<span class="env" title="Colony morale — falls from unburied dead, injuries & violence; bury & heal to restore it">${moraleIcon(state.morale)} Morale ${Math.round(state.morale ?? 100)}${(state.bodies?.length) ? ` · ⚰️${state.bodies.length} unburied` : ''}</span>` +
      `<span class="env" title="Defense / Offense">🛡️${state.defense} ⚔️${totalOffense(state)}</span>` +
      `<span class="env" title="${milestoneTip(state)}">🏆 ${Object.keys(state.milestones || {}).length}/${MILESTONES.length}</span>` +
      (megaCount(state) ? `<span class="env" title="Megaprojects completed — permanent colony-wide wonders">🏛️ ${megaCount(state)}</span>` : '');
  }
  function milestoneTip(state) {
    const done = state.milestones || {};
    const next = MILESTONES.filter(m => !done[m.id]).slice(0, 4).map(m => `${m.icon} ${m.name}: ${m.desc}`);
    return 'Milestones achieved.' + (next.length ? '\nNext goals:\n' + next.join('\n') : ' All done!');
  }

  // ---- Needs bar (colony averages of per-creature needs) ----
  function renderNeeds() {
    const c = colonyNeeds(state);
    el('needsbar').innerHTML = ['food', 'water', 'energy', 'fun', 'health'].map(k => {
      const def = NEEDS[k];
      const v = Math.round(c[k] || 0);
      const cls = v < 30 ? 'low' : v < 60 ? 'mid' : 'ok';
      return `<span class="need ${cls}" title="${def.name}: ${def.desc}">${def.icon}
        <span class="bar"><span style="width:${v}%"></span></span></span>`;
    }).join('') +
      `<span class="need" title="Sleeping rodents">💤 ${state.units.filter(u => u.phase === 'sleep').length}</span>`;
  }

  // ---- Build menu ----
  function renderBuild() {
    const cats = {};
    for (const [id, def] of Object.entries(BUILDINGS)) (cats[def.category] ??= []).push([id, def]);
    el('tab-build').innerHTML = Object.entries(cats).map(([cat, items]) => `
      <div class="cat">${cat}</div>
      <div class="grid">${items.map(([id, def]) => {
        const afford = canAffordCost(def.cost);
        return `<button class="card ${view.placing === id ? 'sel' : ''} ${afford ? '' : 'poor'}" data-build="${id}">
          <div class="ico">${def.icon}</div><div class="nm">${def.name}</div>
          <div class="cost">${costStr(def.cost)}</div><div class="ds">${def.desc}</div>
        </button>`;
      }).join('')}</div>`).join('');
    bind('[data-build]', (btn) => { view.placing = view.placing === btn.dataset.build ? null : btn.dataset.build; renderBuild(); });
  }

  // ---- Skill tree (tech) ----
  function renderTech() {
    el('tab-tech').innerHTML = `<div class="hint">Colony-wide skills: spend Research to permanently boost the whole settlement and unlock new species.</div>
      <div class="grid">${Object.entries(TECH).map(([id, t]) => {
      const done = state.tech[id];
      const ok = done || (canAffordCost(t.cost) && (!t.reqLevel || mainLevel(state) >= t.reqLevel));
      return `<button class="card tech ${done ? 'done' : ''} ${ok ? '' : 'poor'}" data-tech="${id}" ${done ? 'disabled' : ''}>
        <div class="ico">${t.icon}</div><div class="nm">${t.name}</div>
        <div class="cost">${done ? '✓ Researched' : costStr(t.cost)}${t.reqLevel ? ` · Lv.${t.reqLevel}` : ''}</div>
        <div class="ds">${t.desc}</div></button>`;
    }).join('')}</div>`;
    bind('[data-tech]', (btn) => { msg(researchTech(state, btn.dataset.tech)); renderTech(); renderRodents(); });
  }

  // ---- Evolution tree ----
  function renderEvo() {
    el('tab-evo').innerHTML = `<div class="hint">Evolution permanently upgrades whole species (unlike per-rodent traits). Some branches need prerequisites or a higher Main Hamster level.</div>
      <div class="grid">${Object.entries(EVOLUTIONS).map(([id, e]) => {
      const done = state.evolutions[id];
      const reqOk = !e.req || state.evolutions[e.req];
      const lvlOk = !e.reqLevel || mainLevel(state) >= e.reqLevel;
      const ok = done || (canAffordCost(e.cost) && reqOk && lvlOk);
      const tag = e.species === 'all' ? 'All rodents' : `${SPECIES[e.species].icon} ${SPECIES[e.species].name}`;
      return `<button class="card evo ${done ? 'done' : ''} ${ok ? '' : 'poor'}" data-evo="${id}" ${done ? 'disabled' : ''}>
        <div class="ico">${e.icon}</div><div class="nm">${e.name}</div>
        <div class="cost">${done ? '✓ Evolved' : costStr(e.cost)}</div>
        <div class="ds">${e.desc}<br><span class="helpers">${tag}${e.req ? ` · needs ${EVOLUTIONS[e.req].name}` : ''}${e.reqLevel ? ` · Lv.${e.reqLevel}` : ''}</span></div>
      </button>`;
    }).join('')}</div>`;
    bind('[data-evo]', (btn) => { msg(evolve(state, btn.dataset.evo)); renderEvo(); });
  }

  // ---- Rodents & traits ----
  function renderRodents() {
    const recruitables = Object.keys(SPECIES).filter(s => state.unlockedSpecies[s] && s !== 'hamster');
    const recruitHtml = recruitables.length ? `<div class="cat">Recruit</div><div class="grid">${
      recruitables.map(s => `<button class="card" data-recruit="${s}">
        <div class="ico">${SPECIES[s].icon}</div><div class="nm">${SPECIES[s].name}</div>
        <div class="cost">🌾25 🔬10</div><div class="ds">${SPECIES[s].role || ''}</div></button>`).join('')}</div>` : '';

    const units = [...state.units].sort((a, b) => (view.selUnit === a.id ? -1 : 0) - (view.selUnit === b.id ? -1 : 0) || b.level - a.level);
    const list = units.slice(0, 40).map(u => {
      const sp = SPECIES[u.species];
      const sel = view.selUnit === u.id ? 'sel' : '';
      const phase = u.phase === 'sleep' ? '💤' : '';
      const hybrid = u.hybridOf ? ` <span class="hyb">hybrid</span>` : '';
      const sleepInfo = SLEEP[u.species]?.phase || '';
      const traits = Object.entries(TRAITS).map(([tid, td]) => {
        const lvl = u.traits[tid] || 0;
        const free = (u.skillPoints || 0) > 0;
        const cost = traitCost(lvl);
        const can = lvl < 6 && (free || canAffordCost(cost));
        return `<button class="trait ${can ? '' : 'poor'}" data-unit="${u.id}" data-trait="${tid}"
          title="${td.name}: ${td.desc}\n${free ? 'Free with a skill point' : 'Next: ' + costStr(cost)}">${td.icon}${'•'.repeat(lvl) || '–'}</button>`;
      }).join('');
      const name = u.founder ? `♛ ${u.name}` : `#${u.id}`;
      const bond = Math.round(u.bond ?? 45);
      const now = state.env?.lived || 0;
      const care = view.selUnit === u.id ? `<div class="care">${Object.entries(CARE).map(([k, c]) => {
        const cd = (u.careCd?.[k] || 0) - now;
        const ready = cd <= 0;
        return `<button class="carebtn ${ready ? '' : 'cd'}" data-care="${k}" data-cu="${u.id}"
          title="${c.name}: +${c.amount} ${NEEDS[c.need].name}, +${c.bond} bond${Object.keys(c.cost).length ? ' · ' + costStr(c.cost) : ''}">
          ${c.icon}${ready ? '' : ` ${Math.ceil(cd)}s`}</button>`;
      }).join('')}</div>` : '';
      return `<div class="unit ${sel}" data-selunit="${u.id}">
        <div class="uhead">${sp.icon} ${name} ${phase}${hybrid}
          <span class="lvl">Lv.${u.level}${u.skillPoints ? ` · ⭐${u.skillPoints}` : ''}</span>
          <span class="xpbar"><span style="width:${Math.min(100, 100 * u.xp / xpForLevel(u.level))}%"></span></span>
          <span class="sub">❤️${bond} · ${sleepInfo}</span></div>
        <div class="traits">${traits}</div>${care}</div>`;
    }).join('');

    el('tab-rodents').innerHTML = recruitHtml +
      `<div class="cat">Colony (${population(state)}) — levels, sleep & traits</div>
       <div class="hint">Rodents earn XP from work and level up, granting ⭐ skill points to spend on traits for free. Each gathers, eats, drinks and sleeps on its own — keep stores full and build enrichment. Hamsters are nocturnal; beavers & guinea pigs are diurnal.</div>
       <div class="units">${list}</div>`;
    bind('[data-recruit]', (btn) => { msg(recruit(state, btn.dataset.recruit)); renderRodents(); });
    bind('[data-trait]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.unit);
      if (u) msg(upgradeTrait(state, u, btn.dataset.trait));
      renderRodents();
    });
    bind('[data-care]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.cu);
      if (u) { const r = careFor(state, u, btn.dataset.care); msg(r); if (r?.ok) sfx('care'); }
      renderRodents();
    });
    bind('[data-selunit]', (d) => { view.selUnit = +d.dataset.selunit; renderRodents(); });
  }

  // ---- Threats panel ----
  function renderThreats() {
    el('tab-threats').innerHTML =
      `<div class="hint">Predators snatch rodents; disasters wreck buildings & stores. Raise protection with defensive buildings AND protective species. Your biome and the weather/night change how dangerous each threat is.</div>
       <div class="cat">Now — 🛡️ ${state.defense} defense · ⚔️ ${totalOffense(state)} offense</div>` +
      Object.entries(DISASTERS).map(([key, d]) => {
        const biomeMul = BIOMES[state.world.biome]?.hazardMul?.[key] ?? 1;
        const prot = protectionAgainst(state, key) + (d.kind === 'predator' ? totalOffense(state) : 0);
        const sev = Math.round(d.baseSeverity * (1 + (state.env?.lived || 0) / 3000) * biomeMul);
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

  // ---- Trade / alliances ----
  function renderTrade() {
    if (!hasTradingHut(state)) {
      el('tab-trade').innerHTML = `<div class="hint">Build a 🏪 <b>Trading Hut</b> (Production) to trade, gift and request aid from neighbouring animal groups — and shape alliances. Beware: hoarding what they covet invites raids!</div>`;
      return;
    }
    el('tab-trade').innerHTML = `<div class="hint">Gift or trade what they covet to build alliances. Allies (≥${TRADE.aidStanding}) will send aid. Hoarding their coveted goods (>${TRADE.hoardThreshold}) breeds envy and raids.</div>` +
      Object.entries(FACTIONS).map(([id, f]) => {
        const st = Math.round(state.factions[id]?.standing || 0);
        const hoard = Math.round(state.factions[id]?.hoard || 0);
        const cls = st >= TRADE.aidStanding ? 'gd' : st <= -30 ? 'bd' : '';
        const mood = st >= TRADE.aidStanding ? 'Allied' : st <= -30 ? 'Hostile' : st <= -1 ? 'Wary' : 'Neutral';
        const pct = (st + 100) / 2;
        return `<div class="threat">
          <div class="trow"><span>${f.icon} <b>${f.name}</b></span><span class="${cls}">${mood} ${st > 0 ? '+' : ''}${st}</span></div>
          <div class="need ${st >= 40 ? 'ok' : st <= -30 ? 'low' : 'mid'}"><span class="bar" style="width:100%"><span style="width:${pct}%"></span></span></div>
          <div class="ds">Covets ${f.covets.map(r => RESOURCES[r]?.icon || r).join(' ')} · offers ${RESOURCES[f.offers]?.icon || f.offers}${hoard > 0 ? ` · <span class="bd">envious of your hoard!</span>` : ''}</div>
          <div class="care">
            <button class="carebtn" data-tf="gift" data-fid="${id}" title="Gift ${TRADE.giftAmount} coveted → +standing">🎁 Gift</button>
            <button class="carebtn" data-tf="barter" data-fid="${id}" title="Trade ${TRADE.barterGive} coveted → ${TRADE.barterGet} ${f.offers}">🔄 Trade</button>
            <button class="carebtn ${st >= TRADE.aidStanding ? '' : 'cd'}" data-tf="aid" data-fid="${id}" title="Request aid (needs +${TRADE.aidStanding})">🆘 Aid</button>
          </div></div>`;
      }).join('');
    bind('[data-tf]', (btn) => {
      const id = btn.dataset.fid, k = btn.dataset.tf;
      const r = k === 'gift' ? giftFaction(state, id) : k === 'barter' ? barterFaction(state, id) : requestAid(state, id);
      msg(r); if (r?.ok) sfx('trade');
      renderTrade(); renderResbar();
    });
  }

  // ---- Megaprojects: long-horizon, contribute-over-time goals ----
  function renderMega() {
    const done = megaCount(state);
    el('tab-mega').innerHTML = `<div class="hint">Megaprojects are colony-defining goals built over many sessions. Pour your <b>surplus</b> resources into one a little at a time; when every requirement is met it completes and grants a permanent, powerful boost. ${done}/${Object.keys(MEGAPROJECTS).length} complete.</div>` +
      Object.entries(MEGAPROJECTS).map(([id, def]) => {
        const s = state.megaprojects?.[id];
        const isDone = s?.done;
        const unlocked = isMegaUnlocked(state, id);
        const pct = Math.round(megaProgress(state, id) * 100);
        const remain = remainingCost(state, id);
        const remainStr = Object.keys(remain).length ? megaCostText(remain) : '—';
        const cls = isDone ? 'gd' : !unlocked ? 'bd' : '';
        const canContribute = unlocked && !isDone && Object.keys(remain).some(k => (state.res[k] || 0) > 0);
        return `<div class="threat mega ${isDone ? 'done' : ''}">
          <div class="trow"><span>${def.icon} <b>${def.name}</b></span>
            <span class="${cls}">${isDone ? '✅ Complete' : unlocked ? pct + '%' : `🔒 Lv.${def.reqLevel}`}</span></div>
          <div class="need ${isDone ? 'ok' : pct >= 50 ? 'mid' : 'low'}"><span class="bar" style="width:100%"><span style="width:${pct}%"></span></span></div>
          <div class="ds">${def.desc}<br><span class="helpers">🎁 ${def.blurb}</span>${isDone ? '' : `<br>Still needs: ${remainStr}`}</div>
          ${isDone ? '' : `<div class="care"><button class="carebtn ${canContribute ? '' : 'cd'}" data-mega="${id}" title="Contribute surplus resources toward this project">🤝 Contribute surplus</button></div>`}
        </div>`;
      }).join('');
    bind('[data-mega]', (btn) => {
      const wasDone = megaCount(state);
      const r = contributeMega(state, btn.dataset.mega); msg(r);
      if (r?.ok) sfx(megaCount(state) > wasDone ? 'milestone' : 'complete');
      renderMega(); renderResbar();
    });
  }

  function renderLog() { el('log').innerHTML = state.log.slice(0, 12).map(l => `<div>${l.msg}</div>`).join(''); }

  // ---- Alerts banner — the live "what needs attention now" retention hook ----
  const MAX_ALERTS = 5;
  let lastCritical = new Set();
  function renderAlerts() {
    const bar = el('alertbar');
    const alerts = computeAlerts(state);
    if (!alerts.length) { bar.classList.add('hidden'); bar.innerHTML = ''; lastCritical = new Set(); return; }
    bar.classList.remove('hidden');
    const shown = alerts.slice(0, MAX_ALERTS);
    bar.innerHTML = shown.map(a =>
      `<span class="alert ${a.sev} ${a.tab ? 'clickable' : ''}" ${a.tab ? `data-goto="${a.tab}"` : ''} title="${a.msg}">
        <span class="ico">${a.icon}</span><span class="ttl">${a.msg}</span></span>`).join('') +
      (alerts.length > shown.length ? `<span class="more">+${alerts.length - shown.length} more</span>` : '');
    bind('#alertbar [data-goto]', (n) => gotoTab(n.dataset.goto));
    // Ping (flash) the first time a NEW critical alert appears, then remember it.
    const crit = new Set(alerts.filter(a => a.sev === 'critical').map(a => a.id));
    for (const a of alerts) {
      if (a.sev === 'critical' && !lastCritical.has(a.id)) { flash(`${a.icon} ${a.msg}`); sfx('alarm'); break; }
    }
    lastCritical = crit;
  }
  function gotoTab(tab) {
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    if (btn) btn.click();
  }

  // ---- Tabs & controls ----
  function setupTabs() {
    document.querySelectorAll('.tabbtn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.tabbtn').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tabpane').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        el('tab-' + b.dataset.tab).classList.add('active');
      };
    });
    el('btn-new').onclick = showCharacterCreation;
    el('btn-save').onclick = () => { ctx.onSave(); flash('Saved!'); };
    if (el('btn-export')) el('btn-export').onclick = () => ctx.onExport?.();
    if (el('btn-import')) el('btn-import').onclick = () => ctx.onImport?.();
    if (el('btn-help')) el('btn-help').onclick = showHelp;
    if (el('help-close')) el('help-close').onclick = hideHelp;
    if (el('btn-mute')) {
      const sync = () => { el('btn-mute').textContent = audio.isMuted() ? '🔇' : '🔊'; };
      sync();
      el('btn-mute').onclick = () => { audio.toggle(); sync(); if (!audio.isMuted()) sfx('click'); };
    }
    // Auto-open the guide on a player's very first visit.
    try { if (!localStorage.getItem('neuroster.seenHelp')) showHelp(); } catch {}
    // Founder rename (delegated click on the env bar chip).
    el('envbar').onclick = (e) => {
      if (!e.target.closest('#founder-chip')) return;
      const n = prompt('Rename your founder hamster (once every 30 days):', state.founder?.name || '');
      if (n != null) msg(renameFounder(state, n));
    };
  }

  // ---- How-to-Play overlay ----
  function showHelp() { el('help-modal').classList.remove('hidden'); }
  function hideHelp() {
    el('help-modal').classList.add('hidden');
    try { localStorage.setItem('neuroster.seenHelp', '1'); } catch {}
  }

  // ---- Character creation: breed + name + biome ----
  function showCharacterCreation() {
    const sel = { breed: 'syrian', difficulty: 'normal', density: 'normal', name: HAMSTER_NAMES[Math.floor(Math.random() * HAMSTER_NAMES.length)] };
    const card = el('biome-modal').querySelector('.modal-card');
    const optRow = (group, data) => `<div class="grid" id="cc-${group}">${Object.entries(data).map(([k, v]) =>
      `<button class="card opt" data-${group}="${k}"><div class="ico">${v.icon}</div><div class="nm">${v.name}</div><div class="ds">${v.desc}</div></button>`).join('')}</div>`;
    card.innerHTML = `
      <h2>🐹 Found a New Colony</h2>
      <p>Create your founder hamster, set the challenge, then choose a biome to begin.</p>
      <div class="cat">Breed</div>
      <div class="grid" id="cc-breed">${Object.entries(BREEDS).map(([k, b]) =>
        `<button class="card opt" data-breed="${k}"><div class="ico">${b.icon}</div>
          <div class="nm">${b.name}</div><div class="ds">${b.desc}</div></button>`).join('')}</div>
      <div class="cat">Difficulty</div>${optRow('difficulty', DIFFICULTIES)}
      <div class="cat">Resource density</div>${optRow('density', DENSITIES)}
      <div class="cat">Name</div>
      <div class="namerow"><input id="cc-name" value="${sel.name}" maxlength="16" />
        <button id="cc-roll" title="Random name">🎲</button></div>
      <div class="cat">Biome — pick to begin</div>
      <div class="grid" id="cc-biomes">${Object.entries(BIOMES).map(([k, b]) =>
        `<button class="card" data-biome="${k}"><div class="ico">${b.icon}</div>
          <div class="nm">${b.name}</div><div class="ds">${b.desc}</div></button>`).join('')}</div>
      <button id="cc-cancel" class="modal-cancel">Cancel</button>`;
    el('biome-modal').classList.remove('hidden');

    const wire = (group) => {
      const btns = card.querySelectorAll(`[data-${group}]`);
      const mark = () => btns.forEach(b => b.classList.toggle('sel', b.dataset[group] === sel[group]));
      btns.forEach(b => b.onclick = () => { sel[group] = b.dataset[group]; mark(); });
      mark();
    };
    wire('breed'); wire('difficulty'); wire('density');
    card.querySelector('#cc-roll').onclick = () => { sel.name = HAMSTER_NAMES[Math.floor(Math.random() * HAMSTER_NAMES.length)]; card.querySelector('#cc-name').value = sel.name; };
    card.querySelector('#cc-cancel').onclick = () => el('biome-modal').classList.add('hidden');
    card.querySelectorAll('[data-biome]').forEach(btn => {
      btn.onclick = () => ctx.onNewGame({ biome: btn.dataset.biome, breed: sel.breed, name: card.querySelector('#cc-name').value.trim() || sel.name, difficulty: sel.difficulty, density: sel.density });
    });
  }

  // ---- Canvas interaction ----
  function setupCanvas() {
    const c = ctx.canvas;
    const toTile = (e) => {
      const r = c.getBoundingClientRect();
      const sx = c.width / r.width, sy = c.height / r.height;
      return { x: Math.floor((e.clientX - r.left) * sx / TILE), y: Math.floor((e.clientY - r.top) * sy / TILE) };
    };
    c.addEventListener('mousemove', (e) => {
      const t = toTile(e); view.hover = t;
      if (view.placing) view.canPlace = canPlace(state, view.placing, t.x, t.y).ok;
    });
    c.addEventListener('mouseleave', () => view.hover = null);
    c.addEventListener('click', (e) => {
      const t = toTile(e);
      if (view.placing) {
        const r = placeBuilding(state, view.placing, t.x, t.y);
        if (!r.ok) flash(r.reason); else { sfx('place'); renderBuild(); renderResbar(); }
        return;
      }
      // select a rodent under the cursor
      const px = (e.offsetX) / c.getBoundingClientRect().width * c.width / TILE;
      const py = (e.offsetY) / c.getBoundingClientRect().height * c.height / TILE;
      const u = state.units.find(u => Math.hypot(u.x - px, u.y - py) < 0.6);
      if (u) { view.selUnit = u.id; document.querySelector('[data-tab="rodents"]').click(); renderRodents(); return; }
      const b = state.buildings.find(b => b.x === t.x && b.y === t.y);
      if (b && b.flooded) { const r = repairMine(state, b); if (!r.ok) flash(r.reason); return; }
      if (b && BUILDINGS[b.type].tunnel) { const r = upgradeTunnel(state, b); flash(r.ok ? 'Tunnel improved' : r.reason || ''); return; }
      if (b && BUILDINGS[b.type].townhall) { const r = upgradeTownhall(state, b); flash(r.ok ? 'Town Hall upgraded' : r.reason || ''); return; }
      if (b && BUILDINGS[b.type].breed && (b.dirt || 0) >= 1) { const r = cleanBurrow(state, b); flash(r.ok ? '🧹 Burrow cleaned' : r.reason || ''); return; }
      if (b && confirm(`Demolish ${BUILDINGS[b.type].name}? (50% refund)`)) { demolish(state, b); }
    });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); view.placing = null; renderBuild(); });
  }

  // ---- helpers ----
  function canAffordCost(cost) { return Object.entries(cost || {}).every(([k, v]) => (state.res[k] || 0) >= v); }
  function bind(sel, fn) { document.querySelectorAll(sel).forEach(n => n.onclick = () => fn(n)); }
  function msg(r) { if (r && !r.ok && r.reason) flash(r.reason); }

  let flashTimer;
  function flash(text) {
    const f = el('flash'); f.textContent = text; f.classList.add('show');
    clearTimeout(flashTimer); flashTimer = setTimeout(() => f.classList.remove('show'), 1600);
  }

  function init() { setupTabs(); setupCanvas(); renderBuild(); renderTech(); renderEvo(); renderRodents(); renderThreats(); renderTrade(); renderMega(); }

  // Track a few sim values to fire celebratory/warning cues on change.
  let prev = null;
  function audioCues() {
    const cur = {
      miles: Object.keys(state.milestones || {}).length,
      lvl: mainLevel(state),
      pop: population(state),
      raidId: Math.max(0, ...(state.caravans || []).filter(c => c.kind === 'raid').map(c => c.id)),
    };
    if (prev) {
      if (cur.miles > prev.miles) sfx('milestone');
      else if (cur.lvl > prev.lvl) sfx('level');
      else if (cur.pop > prev.pop) sfx('born');
      if (cur.raidId > prev.raidId) sfx('raid');
    }
    prev = cur;
  }

  let acc = 0;
  function update(dt) {
    renderResbar(); renderEnv(); renderNeeds();
    audioCues();
    acc += dt;
    if (acc > 0.5) {
      acc = 0; renderLog(); renderAlerts();
      const active = (tab) => el('tab-' + tab).classList.contains('active');
      if (active('rodents')) renderRodents();
      if (active('threats')) renderThreats();
      if (active('trade')) renderTrade();
      if (active('mega')) renderMega();
      if (active('evo')) renderEvo();
      if (active('build')) refreshAfford();
    }
  }
  function refreshAfford() {
    document.querySelectorAll('#tab-build [data-build]').forEach(btn => {
      btn.classList.toggle('poor', !canAffordCost(BUILDINGS[btn.dataset.build].cost));
    });
  }

  return { init, update, flash,
    renderAll: () => { renderResbar(); renderEnv(); renderNeeds(); renderBuild(); renderTech(); renderEvo(); renderRodents(); renderThreats(); renderTrade(); renderMega(); renderLog(); renderAlerts(); } };
}

function moraleIcon(m) { m = m ?? 100; return m >= 70 ? '😊' : m >= 45 ? '😐' : m >= 25 ? '😟' : '😢'; }
function fmt(n) { n = Math.floor(n); return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : '' + n; }
function costStr(cost) { return Object.entries(cost || {}).map(([k, v]) => `${RESOURCES[k]?.icon || k}${v}`).join(' '); }
