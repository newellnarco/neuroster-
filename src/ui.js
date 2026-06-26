// ui.js — HUD, build/skill/evolution/rodent/threat panels, biome picker.
import { RESOURCES, BUILDINGS, TECH, SPECIES, NEEDS, TRAITS, DISASTERS, EVOLUTIONS, BIOMES, BREEDS, HAMSTER_NAMES, CARE, SLEEP, FACTIONS, TRADE, DIFFICULTIES, DENSITIES, COAT_COLORS, COAT_PATTERNS, TILE, GRID_W, GRID_H, xpForLevel, GUARD_GEAR, NODE_TYPES } from './config.js';
import { totalStored, population, wellbeingMul, colonyNeeds } from './state.js';
import { placeBuilding, canPlace, researchTech, evolve, upgradeTrait, traitCost, recruit, demolish, mainLevel, renameFounder, careFor, repairMine, digDeeper, upgradeTunnel, upgradeTownhall, cleanBurrow, giftFaction, barterFaction, requestAid, hasTradingHut, takeInRescue, toggleGuard, equipGuard, toggleQuarantine } from './buildings.js';
import { protectionAgainst, totalOffense } from './events.js';
import { dayNumber, clockString, currentWeather, isNight, currentSeason } from './environment.js';
import { MILESTONES } from './milestones.js';
import { computeAlerts } from './alerts.js';
import { MEGAPROJECTS, DECREES } from './config.js';
import { contributeMega, remainingCost, megaProgress, isMegaUnlocked, megaCount, costText as megaCostText } from './megaprojects.js';
import { resolveDecree, choiceAllowed, dismissDecree } from './decrees.js';
import { DOCTRINES, DOCTRINE_BRANCHES } from './config.js';
import { learnDoctrine, doctrineStatus, hasDoctrine, doctrineCount } from './doctrines.js';
import { enterBall, exitBall, hasBallWorkshop } from './economy.js';
import { isMature } from './entities.js';

export function createUI(state, ctx) {
  const el = (id) => document.getElementById(id);
  const view = ctx.view;
  const audio = ctx.audio || { play() {}, toggle() { return false; }, isMuted() { return false; } };
  const sfx = (name) => audio.play(name);

  // ---- Resource bar ----
  function renderResbar() {
    const order = ['wood', 'stone', 'ironore', 'coal', 'seeds', 'water', 'food', 'planks', 'iron', 'power', 'research'];
    const labels = !!view.showLabels;
    el('resbar').innerHTML = order.map(k => {
      const r = RESOURCES[k];
      const tip = `${r.icon} ${r.name} — ${RESDESC[k] || 'a colony resource'} (click to pin)`;
      const nm = labels ? `<span class="rnm">${escHtml(r.name)}</span>` : '';
      return `<span class="res" title="${escHtml(tip)}">${r.icon}${nm}<b>${fmt(state.res[k] || 0)}</b></span>`;
    }).join('') +
      `<span class="res storage" title="Storage used / cap — build Storage Depots to raise the cap; surplus over the cap is wasted (click to pin)">📦${labels ? '<span class="rnm">Storage</span>' : ''}<b>${fmt(totalStored(state))}/${state.storageCap}</b></span>`;
  }

  // ---- Environment bar (biome, day/clock, weather, level, defense) ----
  function renderEnv() {
    const biome = BIOMES[state.world.biome] || BIOMES.woodland;
    const w = currentWeather(state);
    const L = !!view.showLabels; // also label the virtue chips when labels are on
    const f = state.founder || { name: 'Founder', breed: 'syrian' };
    el('envbar').innerHTML =
      `<span class="env founder" id="founder-chip" title="Your founder hamster — click to rename (once every 30 days)">🐹 ${f.name} · ${BREEDS[f.breed]?.name || ''}</span>` +
      `<span class="env" title="Biome">${biome.icon} ${biome.name}</span>` +
      `<span class="env" title="In-game day & time (1 day = 15 min)">${isNight(state) ? '🌙' : '☀️'} Day ${dayNumber(state)} · ${clockString(state)}</span>` +
      `<span class="env" title="Season — shifts food, breeding & needs; each new season opens with a festival">${currentSeason(state).icon} ${currentSeason(state).name}</span>` +
      `<span class="env" title="${w.name}: ${w.desc}">${w.icon} ${w.name}</span>` +
      `<span class="env" title="Your highest rodent level — gates advanced content">🎖️ Main Lv.${mainLevel(state)}</span>` +
      `<span class="env" title="Population / cap">👥 ${population(state)}/${state.popCap}</span>` +
      `<span class="env" title="Overall wellbeing multiplier">😊 ×${wellbeingMul(state).toFixed(2)}</span>` +
      `<span class="env" title="Colony morale — falls from unburied dead, injuries & violence; bury & heal to restore it">${moraleIcon(state.morale)} Morale ${Math.round(state.morale ?? 100)}${(state.bodies?.length) ? ` · ⚰️${state.bodies.length} unburied` : ''}</span>` +
      `<span class="env" title="Compassion — kindness, generosity & care raise it; cruelty & neglect lower it. A kind colony calms predators and draws joiners.">💗 ${L ? 'Compassion ' : ''}${Math.round(state.compassion ?? 50)}</span>` +
      `<span class="env${state.decree ? ' decree-due' : ''}" title="Justice / Order — fair, firm rule raises it; wrongs left unanswered lower it. High Justice deters raiders. Decrees trade Justice against Compassion.">⚖️ ${L ? 'Justice ' : ''}${Math.round(state.justice ?? 50)}</span>` +
      (((state.truceUntil || 0) > (state.env?.lived || 0)) ? `<span class="env" title="A brokered truce — raiders & predators hold off until it lapses.">🕊️ Truce ${Math.max(0, Math.ceil((state.truceUntil - (state.env?.lived || 0)) / 60))}m</span>` : '') +
      `<span class="env" title="Valor — martial pride, morally neutral. Rises by standing and winning fights. A proud, battle-hardened colony is fierce & happy in its strength (the Spartan path).">🦁 ${L ? 'Valor ' : ''}${Math.round(state.valor ?? 20)}</span>` +
      (((state.pollution ?? 0) > 8) ? `<span class="env${(state.pollution > 45) ? ' decree-due' : ''}" title="Pollution — coal industry (coal plant, smelter, steelworks, refinery, electric wheel) emits smog. It poisons farm yield and, when high, sickens rodents. Forests scrub it; clean power (wheels, solar, hydro) emits none.">🏭 ${L ? 'Pollution ' : ''}${Math.round(state.pollution)}</span>` : '') +
      (((state.squirrelPressure ?? 0) > 5) ? `<span class="env${(state.squirrelPressure > 60) ? ' decree-due' : ''}" title="Squirrel pressure — oaks and a Nut hoard draw squirrels. A kind colony (Compassion) trades with them for seeds & lore; a big hoard behind weak defenses gets raided. Plant Oaks for Nuts; share or guard the hoard.">🐿️ ${L ? 'Squirrels ' : ''}${Math.round(state.squirrelPressure)}</span>` : '') +
      ((state.beaverMood != null) ? `<span class="env${(state.beaverMood < 35) ? ' decree-due' : ''}" title="Beavers — they harvest wood into their OWN store (hamsters tap it when colony wood is low). Take too much and they sour and sabotage the dams (water flow drops). Keep colony wood stocked so you don't over-tap them. Store: ${Math.round(state.beaverWood || 0)} wood · Mood ${Math.round(state.beaverMood)}/100.">🦫 ${L ? 'Beavers ' : ''}${Math.round(state.beaverWood || 0)}w·${Math.round(state.beaverMood)}%</span>` : '') +
      `<span class="env" title="Defense / Offense">${L ? 'Defense ' : ''}🛡️${state.defense} ⚔️${totalOffense(state)}</span>` +
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
    for (const [id, def] of Object.entries(BUILDINGS)) { if (def.noBuild) continue; (cats[def.category] ??= []).push([id, def]); }
    el('tab-build').innerHTML = Object.entries(cats).map(([cat, items]) => `
      <div class="cat">${cat}</div>
      <div class="grid">${items.map(([id, def]) => {
        const afford = canAffordCost(def.cost);
        const lvlLocked = def.reqLevel && mainLevel(state) < def.reqLevel;
        const active = view.placing === id;
        return `<button class="card ${active ? 'sel' : ''} ${afford && !lvlLocked ? '' : 'poor'} ${lvlLocked ? 'locked' : ''}" data-build="${id}" ${lvlLocked ? 'disabled' : ''}
          title="${active ? 'Placing — click the map to build, or click here again / right-click / Esc to cancel' : def.name}">
          <div class="ico">${def.icon}</div><div class="nm">${active ? '✕ ' : ''}${def.name}${lvlLocked ? ' 🔒' : ''}</div>
          <div class="cost">${active ? 'Placing… (click to cancel)' : costStr(def.cost) + (def.reqLevel ? ` · Lv.${def.reqLevel}` : '')}</div><div class="ds">${def.desc}</div>
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
      const spOk = !e.requiresSpecies || state.unlockedSpecies?.[e.requiresSpecies];
      const ok = done || (canAffordCost(e.cost) && reqOk && lvlOk && spOk);
      const tag = e.species === 'all' ? 'All rodents' : `${SPECIES[e.species].icon} ${SPECIES[e.species].name}`;
      const spTag = e.requiresSpecies ? ` · needs ${SPECIES[e.requiresSpecies].name}s` : '';
      return `<button class="card evo ${done ? 'done' : ''} ${ok ? '' : 'poor'}" data-evo="${id}" ${done ? 'disabled' : ''}>
        <div class="ico">${e.icon}</div><div class="nm">${e.name}</div>
        <div class="cost">${done ? '✓ Evolved' : costStr(e.cost)}</div>
        <div class="ds">${e.desc}<br><span class="helpers">${tag}${spTag}${e.req ? ` · needs ${EVOLUTIONS[e.req].name}` : ''}${e.reqLevel ? ` · Lv.${e.reqLevel}` : ''}</span></div>
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

    // Species summary so big colonies read at a glance even when the list is capped.
    const counts = {};
    for (const u of state.units) counts[u.species] = (counts[u.species] || 0) + 1;
    const sickN = state.units.filter(u => u.sick).length;
    const asleepN = state.units.filter(u => u.phase === 'sleep').length;
    const summary = `<div class="species">${Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `<span class="spc" title="${SPECIES[s]?.name || s}">${SPECIES[s]?.icon || '🐾'} ${n}</span>`).join('')}` +
      `<span class="spc" title="Sleeping">💤 ${asleepN}</span>${sickN ? `<span class="spc bad" title="Sick (wet tail)">🤢 ${sickN}</span>` : ''}</div>`;

    const CAP = 40;
    const units = [...state.units].sort((a, b) => (view.selUnit === a.id ? -1 : 0) - (view.selUnit === b.id ? -1 : 0) || b.level - a.level);
    const list = units.slice(0, CAP).map(u => {
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
      const gname = escHtml(u.name || `#${u.id}`);
      const fam = u.family ? ` <span class="fam">${escHtml(u.family)}</span>` : '';
      const sexIcon = u.sex === 'm' ? '♂' : u.sex === 'f' ? '♀' : '';
      const young = !isMature(u);
      const sexAge = sexIcon || young
        ? ` <span class="sexage" title="${u.sex === 'm' ? 'Male' : u.sex === 'f' ? 'Female' : ''}${young ? ' · juvenile (not yet old enough to breed)' : ' · adult'}">${sexIcon}${young ? ' 🍼' : ''}</span>`
        : '';
      const name = `${u.founder ? '♛ ' : ''}${gname}${fam}${sexAge}`;
      const lineage = u.parentNames ? `<span class="kin" title="Parents">👪 ${escHtml(u.parentNames[0])} &amp; ${escHtml(u.parentNames[1])}</span>` : '';
      const bond = Math.round(u.bond ?? 45);
      const now = state.env?.lived || 0;
      const care = view.selUnit === u.id ? `<div class="care">${Object.entries(CARE).map(([k, c]) => {
        const cd = (u.careCd?.[k] || 0) - now;
        const ready = cd <= 0;
        return `<button class="carebtn ${ready ? '' : 'cd'}" data-care="${k}" data-cu="${u.id}"
          title="${c.name}: +${c.amount} ${NEEDS[c.need].name}, +${c.bond} bond${Object.keys(c.cost).length ? ' · ' + costStr(c.cost) : ''}">
          ${c.icon}${ready ? '' : ` ${Math.ceil(cd)}s`}</button>`;
      }).join('')}</div>` : '';
      // Per-rodent task control (selected unit only): send it exploring or clear
      // its order. Click a fogged tile on the map to send it to a spot directly.
      const orderLabel = u.inBall ? `🫧 rolling · anxiety ${Math.round(u.anxiety || 0)}`
        : u.order?.kind === 'explore' ? '🧭 exploring…'
        : u.order?.kind === 'goto' ? '🐾 heading out…' : '';
      const taskRow = view.selUnit === u.id ? `<div class="care taskrow">
          <button class="carebtn ${u.order?.kind === 'explore' ? 'on' : ''}" data-task="explore" data-tu="${u.id}"
            title="Explore — roam toward the unknown, revealing the map until it's all found">🧭 Explore</button>
          <button class="carebtn ${u.inBall ? 'on' : ''} ${(u.inBall || hasBallWorkshop(state)) ? '' : 'cd'}" data-task="ball" data-tu="${u.id}"
            title="Hamster ball — roll the world SAFE from predators (fun & curiosity rise, but anxiety builds, so it pops out before long; on a HOT day get it out before it overheats & dies). Needs a Ball Workshop + plastic.">🫧 ${u.inBall ? 'Get out' : 'Ball'}</button>
          <button class="carebtn ${(u.order || u.inBall) ? '' : 'cd'}" data-task="stop" data-tu="${u.id}"
            title="Clear this rodent's order / get it out of its ball — back to auto work">✋ Stop</button>
          ${orderLabel ? `<span class="sub">${orderLabel}</span>` : ''}
          <span class="sub" title="Select a rodent, then click a tile (even fogged) to send it there">tip: click the map to send</span>
        </div>` : '';
      // Job assignment (selected unit): bias this rodent toward a preferred
      // resource. This is a soft preference over the auto-sim — "Auto" clears it
      // and lets the colony decide; a pinned kind makes the rodent prefer that
      // resource when one is available, falling back to the nearest otherwise.
      const jobRow = view.selUnit === u.id ? `<div class="care taskrow jobrow">
          <span class="sub" title="Bias this rodent toward gathering a resource. Soft preference: it prefers its assigned target when one's available, else takes the nearest.">🎯 Job:</span>
          <button class="carebtn ${!u.jobPref ? 'on' : ''}" data-job="auto" data-ju="${u.id}"
            title="Auto — let the colony decide what this rodent gathers">🤖 Auto</button>
          ${Object.entries(JOB_KINDS).map(([kind, j]) => `<button class="carebtn ${u.jobPref === kind ? 'on' : ''}" data-job="${kind}" data-ju="${u.id}"
            title="Prefer ${j.label} (${RESOURCES[NODE_TYPES[kind].resource]?.name || NODE_TYPES[kind].resource})${NODE_TYPES[kind].surface === false ? ' — needs a Mine on the seam' : ''}">${j.icon}</button>`).join('')}
        </div>` : '';
      // Guard / soldier skill + equipment tiers (selected unit).
      const nextGear = GUARD_GEAR[(u.gear || 0) + 1];
      const guardRow = view.selUnit === u.id ? `<div class="care taskrow">
          <button class="carebtn ${u.guard ? 'on' : ''}" data-guard="toggle" data-gu="${u.id}"
            title="Guard / Soldier — adds colony defense & offense. Reluctant to kill — it would rather capture & spare a beaten foe.">🛡️ ${u.guard ? 'Guard ✓' : 'Train guard'}</button>
          ${u.guard ? `<button class="carebtn ${nextGear && canAffordCost(nextGear.cost) ? '' : 'cd'}" data-guard="equip" data-gu="${u.id}"
            title="Equip the next tier of arms & armour — spends materials for more protection & damage">⚔️ Equip</button>
          <span class="sub">${GUARD_GEAR[u.gear || 0].icon} ${GUARD_GEAR[u.gear || 0].name}${nextGear ? ` → ${nextGear.name} (${costStr(nextGear.cost)})` : ' · max'}</span>` : ''}
        </div>` : '';
      return `<div class="unit ${sel}" data-selunit="${u.id}">
        <div class="uhead">${sp.icon} ${name} ${phase}${hybrid}
          <button class="rename" data-rename="${u.id}" title="Rename this rodent">✏️</button>
          <span class="lvl">Lv.${u.level}${u.skillPoints ? ` · ⭐${u.skillPoints}` : ''}</span>
          <span class="xpbar"><span style="width:${Math.min(100, 100 * u.xp / xpForLevel(u.level))}%"></span></span>
          <span class="sub">❤️${bond} · ${sleepInfo}</span></div>
        ${lineage ? `<div class="kinrow">${lineage}</div>` : ''}
        <div class="traits">${traits}</div>${care}${taskRow}${jobRow}${guardRow}</div>`;
    }).join('');

    const more = state.units.length > CAP ? `<div class="hint">Showing the top ${CAP} of ${population(state)} by level (select one to pin it to the top).</div>` : '';
    el('tab-rodents').innerHTML = recruitHtml +
      `<div class="cat">Colony (${population(state)}) — levels, sleep & traits</div>
       ${summary}
       <div class="hint">Rodents earn XP from work and level up, granting ⭐ skill points to spend on traits for free. Each gathers, eats, drinks and sleeps on its own — keep stores full and build enrichment. Hamsters are nocturnal; beavers & guinea pigs are diurnal.</div>
       ${more}<div class="units">${list}</div>`;
    bind('[data-recruit]', (btn) => { msg(recruit(state, btn.dataset.recruit)); renderRodents(); });
    bind('[data-trait]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.unit);
      if (!u) return;
      // Spending a trait point works for ANY rodent (founder or not) that earned
      // skill points by leveling. Also pin the unit as selected so its controls
      // surface — clicking a non-leader's trait shouldn't feel inert.
      view.selUnit = u.id;
      const r = upgradeTrait(state, u, btn.dataset.trait);
      if (r?.ok && r.paidWith === 'skillPoint') { sfx('level'); flash(`⭐ ${escHtml(u.name || 'Rodent')} → ${TRAITS[btn.dataset.trait]?.name || 'trait'} up!`); }
      else msg(r);
      renderRodents();
    });
    bind('[data-care]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.cu);
      if (u) { const r = careFor(state, u, btn.dataset.care); msg(r); if (r?.ok) sfx('care'); }
      renderRodents();
    });
    bind('[data-rename]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.rename);
      if (!u) return;
      const n = prompt('Name this rodent:', u.name || '');
      if (n != null && n.trim()) { u.name = n.trim().slice(0, 16); if (u.founder && state.founder) state.founder.name = u.name; sfx('care'); renderRodents(); }
    });
    bind('[data-task]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.tu);
      if (!u) return;
      const t = btn.dataset.task;
      if (t === 'explore') { u.order = { kind: 'explore' }; u._exTarget = null; sfx('click'); flash('🧭 Exploring — mapping the unknown'); }
      else if (t === 'ball') {
        if (u.inBall) { exitBall(state, u); flash('🫧 Out of the ball'); }
        else { const r = enterBall(state, u); if (r.ok) { sfx('care'); flash('🫧 Rolling out — safe from predators!'); } else flash(r.reason); }
      } else { u.order = null; u._exTarget = null; if (u.inBall) exitBall(state, u); flash('✋ Order cleared — back to work'); }
      renderRodents();
    });
    bind('[data-job]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.ju);
      if (!u) return;
      const k = btn.dataset.job;
      u.jobPref = k === 'auto' ? null : k;
      u.targetNode = null; // re-pick a target now so the new preference takes effect immediately
      sfx('click');
      flash(u.jobPref ? `🎯 ${escHtml(u.name || 'Rodent')} → prefers ${JOB_KINDS[u.jobPref]?.label || u.jobPref}` : `🤖 ${escHtml(u.name || 'Rodent')} → Auto`);
      renderRodents();
    });
    bind('[data-guard]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.gu);
      if (!u) return;
      if (btn.dataset.guard === 'toggle') { toggleGuard(state, u); sfx('click'); }
      else { const r = equipGuard(state, u); msg(r); if (r.ok) sfx('place'); }
      renderRodents(); renderEnv();
    });
    bind('[data-selunit]', (d) => { view.selUnit = +d.dataset.selunit; renderRodents(); });
  }

  // ---- Defense & Military screen (garrison + works + threat readiness) ----
  function renderThreats() {
    // 1) Garrison: the mustered guards, their gear tier, and quick equip/upgrade.
    const guards = state.units.filter(u => u.guard);
    const roster = guards.length ? guards.map(u => {
      const sp = SPECIES[u.species] || { icon: '🐹' };
      const gear = GUARD_GEAR[u.gear || 0];
      const nextGear = GUARD_GEAR[(u.gear || 0) + 1];
      const equip = nextGear
        ? `<button class="carebtn ${canAffordCost(nextGear.cost) ? '' : 'cd'}" data-guard="equip" data-gu="${u.id}"
             title="Equip ${nextGear.name} — more protection & damage">⚔️ ${nextGear.name} (${costStr(nextGear.cost)})</button>`
        : `<span class="sub">· fully equipped</span>`;
      return `<div class="threat">
        <div class="trow"><span>${sp.icon} <b>${escHtml(u.name || 'Guard')}</b> · ${gear.icon} ${gear.name}</span>
          <span class="gd">🛡️${gear.def} ⚔️${gear.atk}</span></div>
        <div class="ds taskrow">${equip}
          <button class="carebtn" data-guard="stand" data-gu="${u.id}" title="Stand down from guard duty">✋ Stand down</button></div>
      </div>`;
    }).join('') : `<div class="ds">No guards mustered yet. Promote your strongest rodents to defend the colony.</div>`;
    // A free, loyal rodent we could promote next (highest level wins).
    const recruit = state.units.filter(u => !u.guard).sort((a, b) => (b.level || 0) - (a.level || 0))[0];
    const muster = recruit
      ? `<div class="care taskrow"><button class="carebtn" data-guard="muster" data-gu="${recruit.id}"
           title="Train your highest-level free rodent as a guard">🛡️ Train a guard</button>
           <span class="sub">next: ${SPECIES[recruit.species]?.icon || '🐹'} ${escHtml(recruit.name || '')} (Lv.${recruit.level || 1})</span></div>`
      : '';

    // 2) Defensive works: every built structure that adds defense / protection.
    const works = Object.entries(BUILDINGS)
      .filter(([, b]) => b.defense || b.wall || b.protect)
      .map(([type, b]) => {
        const n = state.buildings.filter(x => x.type === type && !x.underConstruction).length;
        if (!n) return null;
        const d = b.defense ? ` · 🛡️${b.defense}` : '';
        return `<span class="helpers" title="${escHtml(b.desc || '')}">${b.icon} ${escHtml(b.name)} ×${n}${d}</span>`;
      }).filter(Boolean);
    const worksHtml = works.length ? `<div class="ds">${works.join('  ')}</div>` : `<div class="ds">— none built — raise walls, fences & towers in 🏗️ Build —</div>`;

    // 3) Threat readiness: per-hazard protection vs the scaling severity.
    const threats = Object.entries(DISASTERS).map(([key, d]) => {
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

    // 3b) Public health: infirmaries, outbreak status, and the quarantine toggle.
    const infirmaries = state.buildings.filter(x => BUILDINGS[x.type]?.infirmary && !x.underConstruction).length;
    const sickCount = state.units.filter(u => u.sick).length;
    const outbreakOn = !!state.outbreak;
    const healthHtml =
      `<div class="ds">🏥 Infirmaries ×${infirmaries} · ${outbreakOn ? `<b class="bd">🦠 OUTBREAK — ${sickCount} ill</b>` : (sickCount ? `${sickCount} ill` : 'no active outbreak')}</div>
       <div class="care taskrow"><button class="carebtn ${state.quarantine ? 'sel' : ''}" data-quarantine="1"
         title="Slow contagion spread hard, at the cost of colony output while it holds">${state.quarantine ? '🟢 Lift Quarantine' : '🚧 Declare Quarantine'}</button>
         <span class="sub">${state.quarantine ? 'in force — spread slowed, output reduced' : 'slows an outbreak; reduces output while active'}</span></div>`;

    el('tab-threats').innerHTML =
      `<div class="hint">Your colony's standing <b>defense &amp; garrison</b>. Predators snatch rodents; disasters wreck buildings &amp; stores. Muster &amp; equip guards, raise defensive works, and lean on protective species — biome, weather &amp; night all shift the danger.</div>
       <div class="cat">Standing — 🛡️ ${state.defense} defense · ⚔️ ${totalOffense(state)} offense</div>
       <div class="cat">🪖 Garrison (${guards.length} guard${guards.length === 1 ? '' : 's'})</div>
       ${roster}${muster}
       <div class="cat">🧱 Defensive works</div>
       ${worksHtml}
       <div class="cat">🏥 Public health</div>
       ${healthHtml}
       <div class="cat">⚠️ Threat readiness</div>
       ${threats}`;

    bind('#tab-threats [data-quarantine]', () => { toggleQuarantine(state); sfx('click'); renderThreats(); });

    bind('#tab-threats [data-guard]', (btn) => {
      const u = state.units.find(x => x.id == btn.dataset.gu);
      if (!u) return;
      const act = btn.dataset.guard;
      if (act === 'equip') { const r = equipGuard(state, u); msg(r); if (r.ok) sfx('place'); }
      else { toggleGuard(state, u); sfx('click'); } // muster (train) or stand down
      renderThreats(); renderEnv(); renderRodents();
    });
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

  function renderDoctrine() {
    const VIRT = { compassion: { icon: '💗', val: () => Math.round(state.compassion ?? 50) },
                   justice:    { icon: '⚖️', val: () => Math.round(state.justice ?? 50) },
                   valor:      { icon: '🦁', val: () => Math.round(state.valor ?? 20) } };
    const head = `<div class="hint">Your colony's three virtues — ${VIRT.compassion.icon} <b>${VIRT.compassion.val()}</b> Compassion · ${VIRT.justice.icon} <b>${VIRT.justice.val()}</b> Justice · ${VIRT.valor.icon} <b>${VIRT.valor.val()}</b> Valor — unlock <b>Doctrines</b>: permanent colony-wide perks. Each needs a virtue threshold and 🔬 Research to learn. ${doctrineCount(state)}/${Object.keys(DOCTRINES).length} learned.</div>`;
    const branches = Object.entries(DOCTRINE_BRANCHES).map(([bk, b]) => {
      const items = Object.entries(DOCTRINES).filter(([, d]) => d.branch === bk).map(([id, d]) => {
        const learned = hasDoctrine(state, id);
        const st = doctrineStatus(state, id);
        const reqStr = Object.entries(d.req).map(([v, n]) => `${VIRT[v]?.icon || v} ${n}`).join(' · ');
        const cls = learned ? 'done' : st.ok ? '' : 'bd';
        const cost = Object.entries(d.cost).map(([k, v]) => `${RESOURCES[k]?.icon || k}${v}`).join(' ');
        return `<div class="threat ${learned ? 'done' : ''}">
          <div class="trow"><span>${d.icon} <b>${escHtml(d.name)}</b></span>
            <span class="${cls}">${learned ? '✅ Learned' : st.ok ? 'Ready' : '🔒'}</span></div>
          <div class="ds">${escHtml(d.desc)}<br><span class="helpers">Needs ${reqStr} · ${cost}${d.prereq ? ` · after ${escHtml(DOCTRINES[d.prereq].name)}` : ''}</span></div>
          ${learned ? '' : `<div class="care"><button class="carebtn ${st.ok ? '' : 'cd'}" data-doctrine="${id}" title="${escHtml(st.reason)}">🎓 Learn (${cost})</button></div>`}
        </div>`;
      }).join('');
      return `<div class="cat">${b.icon} ${b.name} <span class="helpers">— ${escHtml(b.desc)}</span></div>${items}`;
    }).join('');
    el('tab-doctrine').innerHTML = head + branches;
    bind('[data-doctrine]', (btn) => {
      const r = learnDoctrine(state, btn.dataset.doctrine);
      if (r.ok) { sfx('milestone'); flash('🎓 Doctrine learned!'); } else msg(r);
      renderDoctrine(); renderResbar(); renderEnv();
    });
  }

  // The newest event is unshifted to state.log[0], so it renders at the TOP.
  // Track the current top entry: only rebuild when it actually changes, and when
  // a NEW item is reported snap the scroll to the top so the latest line is in
  // view. When nothing changed we leave the scroll alone, so you can read back
  // through the story without it yanking to the top every refresh.
  let lastLogTop = null;
  function renderLog() {
    const box = el('log');
    if (!box) return;
    const top = state.log[0];
    const sig = top ? `${top.t}|${top.msg}` : '';
    const isNew = sig !== lastLogTop;
    if (!isNew && box.childElementCount) return; // unchanged — preserve scroll
    box.innerHTML = state.log.slice(0, 12).map(l => `<div>${l.msg}</div>`).join('');
    lastLogTop = sig;
    if (isNew) box.scrollTop = 0; // snap the newest item into view at the top
  }

  // ---- Getting-started guide — a few first steps that auto-tick as you play ----
  const GUIDE_STEPS = [
    { icon: '🏠', label: 'Build a Burrow (housing + breeding)', done: (s) => s.buildings.some(b => b.type === 'burrow') },
    { icon: '🌾', label: 'Build a Farm for food', done: (s) => s.buildings.some(b => b.type === 'farm') },
    { icon: '💧', label: 'Build a Well for water', done: (s) => s.buildings.some(b => b.type === 'well') },
    { icon: '📦', label: 'Build Storage to hold more', done: (s) => s.buildings.some(b => b.type === 'storage') },
    { icon: '🐹', label: 'Grow to 8 rodents', done: (s) => population(s) >= 8 },
    { icon: '⚡', label: 'Build a Wheel for power', done: (s) => s.buildings.some(b => b.type === 'wheel') },
  ];
  let guideDone = -1;
  function guideDismissed() { try { return localStorage.getItem('neuroster.guideDone') === '1'; } catch { return false; } }
  function renderGuide() {
    const box = el('guide'); if (!box) return;
    const doneCount = GUIDE_STEPS.filter(st => { try { return st.done(state); } catch { return false; } }).length;
    if (guideDismissed() || doneCount >= GUIDE_STEPS.length) {
      box.classList.add('hidden');
      if (doneCount >= GUIDE_STEPS.length && !guideDismissed()) { try { localStorage.setItem('neuroster.guideDone', '1'); } catch {} }
      return;
    }
    box.classList.remove('hidden');
    if (guideDone >= 0 && doneCount > guideDone) sfx('complete'); // a step just ticked
    guideDone = doneCount;
    box.innerHTML = `<div class="ghead"><span>🚀 Getting started · ${doneCount}/${GUIDE_STEPS.length}</span><button class="gx" id="guide-x" title="Dismiss">✕</button></div>
      <ul>${GUIDE_STEPS.map(st => { let ok = false; try { ok = st.done(state); } catch {}
        return `<li class="${ok ? 'done' : ''}"><span class="gck">${ok ? '✅' : st.icon}</span><span>${st.label}</span></li>`; }).join('')}</ul>`;
    const x = el('guide-x'); if (x) x.onclick = () => { try { localStorage.setItem('neuroster.guideDone', '1'); } catch {} box.classList.add('hidden'); };
  }

  // ---- Alerts banner — the live "what needs attention now" retention hook ----
  const MAX_ALERTS = 5;
  let lastCritical = new Set();
  const alertSeen = new Map(); // alert id -> wall-clock ms first seen (for the new-item blink)
  function renderAlerts() {
    const bar = el('alertbar');
    const alerts = computeAlerts(state);
    if (!alerts.length) { bar.classList.add('hidden'); bar.innerHTML = ''; lastCritical = new Set(); alertSeen.clear(); return; }
    bar.classList.remove('hidden');
    // Track when each alert first appeared (for the ~4s blink) and prune gone ones.
    const now = performance.now();
    const ids = new Set(alerts.map(a => a.id));
    for (const a of alerts) if (!alertSeen.has(a.id)) alertSeen.set(a.id, now);
    for (const id of [...alertSeen.keys()]) if (!ids.has(id)) alertSeen.delete(id);

    const expanded = !!view.alertsExpanded;
    bar.classList.toggle('expanded', expanded);
    const shown = expanded ? alerts : alerts.slice(0, MAX_ALERTS);
    const chips = shown.map(a => {
      const fresh = (now - (alertSeen.get(a.id) ?? now)) < 4000 ? ' alert-new' : '';
      return `<span class="alert ${a.sev} ${a.tab ? 'clickable' : ''}${fresh}" ${a.tab ? `data-goto="${a.tab}"` : ''} title="${escHtml(a.msg)}">
        <span class="ico">${a.icon}</span><span class="ttl">${escHtml(a.msg)}</span></span>`;
    }).join('');
    const moreBtn = (!expanded && alerts.length > shown.length) ? `<span class="more" data-expand>▾ +${alerts.length - shown.length} more</span>`
      : (expanded && alerts.length > MAX_ALERTS) ? `<span class="more" data-expand>▴ collapse</span>` : '';
    bar.innerHTML = chips + moreBtn;
    bind('#alertbar [data-goto]', (n) => gotoTab(n.dataset.goto));
    bind('#alertbar [data-expand]', () => { view.alertsExpanded = !view.alertsExpanded; renderAlerts(); });
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
    if (el('btn-saveas')) el('btn-saveas').onclick = () => {
      const n = prompt('Save as a new hamster — name this copy:', state.founder?.name || 'Colony');
      if (n != null && n.trim()) ctx.onSaveAs?.(n.trim().slice(0, 16));
    };
    if (el('btn-help')) el('btn-help').onclick = showHelp;
    if (el('btn-settings')) el('btn-settings').onclick = showSettings;
    if (el('help-close')) el('help-close').onclick = hideHelp;
    document.querySelectorAll('#help-modal [data-help-jump]').forEach(b => b.onclick = () => {
      const t = el(b.dataset.helpJump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (el('btn-mute')) {
      const sync = () => { el('btn-mute').textContent = audio.isMuted() ? '🔇' : '🔊'; };
      sync();
      el('btn-mute').onclick = () => { audio.toggle(); sync(); if (!audio.isMuted()) sfx('click'); };
    }
    // Resource name labels toggle (persisted) — show names instead of relying on hover/click.
    try { view.showLabels = localStorage.getItem('neuroster.resLabels') === '1'; } catch {}
    if (el('btn-labels')) {
      const syncL = () => el('btn-labels').classList.toggle('on', !!view.showLabels);
      syncL();
      el('btn-labels').onclick = () => {
        view.showLabels = !view.showLabels;
        try { localStorage.setItem('neuroster.resLabels', view.showLabels ? '1' : '0'); } catch {}
        syncL(); renderResbar(); renderEnv(); sfx('click');
      };
    }
    // ☰ Menu: opens the moved Save/Load/Settings/etc.; header keeps the quick ones.
    const menuM = el('menu-modal');
    if (el('btn-menu') && menuM) el('btn-menu').onclick = () => menuM.classList.remove('hidden');
    if (el('menu-close') && menuM) el('menu-close').onclick = () => menuM.classList.add('hidden');
    if (menuM) {
      menuM.querySelectorAll('[data-click]').forEach(b => b.onclick = () => { document.getElementById(b.dataset.click)?.click(); menuM.classList.add('hidden'); });
      menuM.querySelectorAll('.menu-list button:not([data-click])').forEach(b => b.addEventListener('click', () => menuM.classList.add('hidden')));
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

  // ---- In-game Settings (adjust the challenge live; identity/world are fixed) ----
  function showSettings() {
    const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const card = el('settings-modal').querySelector('.modal-card');
    // Reuse the start/new-colony screens' themed framing so Settings feels part of
    // the game rather than a generic dialog.
    card.classList.add('settings-card');
    const f = state.founder || {};
    const DIS = {
      on:  { icon: '⚡', name: 'On',  desc: 'Predators, disasters & raids strike.' },
      off: { icon: '🕊️', name: 'Off', desc: 'Peaceful — none of the above.' },
    };
    const row = (group, data, current) => `<div class="grid" id="set-${group}">${Object.entries(data).map(([k, v]) =>
      `<button class="card opt ${k === current ? 'sel' : ''}" data-set${group}="${k}"><div class="ico">${v.icon}</div><div class="nm">${v.name}</div><div class="ds">${v.desc}</div></button>`).join('')}</div>`;
    const crestIcon = BREEDS[f.breed]?.icon || '🐹';
    card.innerHTML = `
      <div class="settings-head">
        <h2>⚙️ Settings</h2>
        <p>Adjust the challenge any time — changes save with this colony. Your hamster's identity, biome and map are fixed once founded.</p>
      </div>
      <div class="cat">Difficulty</div>${row('difficulty', DIFFICULTIES, state.difficulty)}
      <div class="cat">Predators &amp; disasters</div>${row('disasters', DIS, state.disasters === false ? 'off' : 'on')}
      <div class="cat">This colony — set at founding</div>
      <div class="colony-banner">
        <span class="crest">${crestIcon}</span>
        <span><b>${esc(f.name)}</b> · ${esc(BREEDS[f.breed]?.name || '')} · ${esc(COAT_COLORS[f.coat?.color]?.name || 'Golden')} coat<br>
        ${esc(BIOMES[state.biome]?.name || state.biome)} · ${esc(DENSITIES[state.density]?.name || '')} resources · ${esc(DIFFICULTIES[state.difficulty]?.name || '')} difficulty</span>
      </div>
      <button id="set-close" class="settings-done">🐹 Done</button>`;
    el('settings-modal').classList.remove('hidden');
    const remark = (group) => card.querySelectorAll(`[data-set${group}]`).forEach(x => x.classList.toggle('sel',
      group === 'disasters' ? (x.dataset['set' + group] === (state.disasters === false ? 'off' : 'on')) : (x.dataset['set' + group] === state.difficulty)));
    card.querySelectorAll('[data-setdifficulty]').forEach(b => b.onclick = () => { state.difficulty = b.dataset.setdifficulty; ctx.onSave?.(); flash('Difficulty: ' + (DIFFICULTIES[state.difficulty]?.name || state.difficulty)); remark('difficulty'); });
    card.querySelectorAll('[data-setdisasters]').forEach(b => b.onclick = () => { state.disasters = b.dataset.setdisasters === 'on'; ctx.onSave?.(); flash(state.disasters ? '⚡ Disasters ON' : '🕊️ Peaceful mode'); remark('disasters'); });
    card.querySelector('#set-close').onclick = () => el('settings-modal').classList.add('hidden');
  }

  // ---- Decree: a moral dilemma the player must judge ----
  let decreeOpen = false;
  function showDecree() {
    const dec = state.decree; if (!dec) return;
    const d = DECREES[dec.id]; if (!d) { state.decree = null; return; }
    const m = el('decree-modal'); if (!m) return;
    const card = m.querySelector('.modal-card');
    const fac = dec.faction && FACTIONS[dec.faction] ? `${FACTIONS[dec.faction].icon} ${FACTIONS[dec.faction].name}` : '';
    const tone = { kind: 'tone-kind', just: 'tone-just', hard: 'tone-hard' };
    const choices = d.choices.map((c, i) => {
      const locked = !choiceAllowed(state, c);
      return `<button class="card opt decree-choice ${tone[c.tone] || ''} ${locked ? 'locked' : ''}" data-choice="${i}" ${locked ? 'disabled' : ''}>
        <div class="nm">${c.fx || ''} ${escHtml(c.label)}${locked ? ' 🔒' : ''}</div>
        <div class="ds">${escHtml(c.desc)}${locked ? ' <i>(build a Courthouse to unlock)</i>' : ''}</div></button>`;
    }).join('');
    card.innerHTML = `
      <h2>${d.icon} ${escHtml(d.title)}</h2>
      ${fac ? `<div class="hint">Concerning the ${fac}.</div>` : ''}
      <p>${escHtml(d.prompt.replace('the neighbour', fac || 'a neighbour'))}</p>
      <div class="cat">Your judgement — there is no free answer</div>
      <div class="grid decree-grid">${choices}</div>
      <div class="hint">⚖️ Justice ${Math.round(state.justice ?? 50)} · 💗 Compassion ${Math.round(state.compassion ?? 50)} — don't want to choose? Leave it to the town and they'll decide.</div>
      <button id="decree-dismiss" class="modal-cancel">🏛️ Let the town decide</button>`;
    m.classList.remove('hidden');
    decreeOpen = true;
    const close = () => { m.classList.add('hidden'); decreeOpen = false; renderEnv(); renderResbar(); renderRodents(); renderLog(); };
    card.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => {
      if (resolveDecree(state, +b.dataset.choice)) { sfx('care'); close(); }
    });
    card.querySelector('#decree-dismiss').onclick = () => { if (dismissDecree(state)) { sfx('click'); close(); } };
  }

  // ---- How-to-Play overlay ----
  function showHelp() { el('help-modal').classList.remove('hidden'); }
  function hideHelp() {
    el('help-modal').classList.add('hidden');
    try { localStorage.setItem('neuroster.seenHelp', '1'); } catch {}
  }

  // ---- Character creation: breed + coat + name + options + biome ----
  function showCharacterCreation() {
    const rnd = (o) => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
    const sel = {
      breed: 'syrian', difficulty: 'normal', density: 'normal', disasters: 'on',
      coatcolor: 'golden', coatpattern: 'classic',
      name: HAMSTER_NAMES[Math.floor(Math.random() * HAMSTER_NAMES.length)],
    };
    const DISASTER_OPTS = {
      on:  { icon: '⚡', name: 'On',  desc: 'Predators, disasters & raids strike — the full challenge.' },
      off: { icon: '🕊️', name: 'Off', desc: 'Peaceful — build in calm, no predators/disasters/raids.' },
    };
    const card = el('biome-modal').querySelector('.modal-card');
    const optRow = (group, data) => `<div class="grid" id="cc-${group}">${Object.entries(data).map(([k, v]) =>
      `<button class="card opt" data-${group}="${k}"><div class="ico">${v.icon}</div><div class="nm">${v.name}</div><div class="ds">${v.desc}</div></button>`).join('')}</div>`;
    card.innerHTML = `
      <h2>🐹 Found a New Colony</h2>
      <p>Create your founder hamster, set the challenge, then choose a biome to begin.</p>
      <button id="cc-surprise" class="cc-surprise">🎲 Surprise me</button>
      <div class="cat">Breed</div>
      <div class="grid" id="cc-breed">${Object.entries(BREEDS).map(([k, b]) =>
        `<button class="card opt" data-breed="${k}"><div class="ico">${b.icon}</div>
          <div class="nm">${b.name}</div><div class="ds">${b.desc}</div></button>`).join('')}</div>
      <div class="cat">Coat colour</div>
      <div class="grid coats" id="cc-coatcolor">${Object.entries(COAT_COLORS).map(([k, c]) =>
        `<button class="card opt coat" data-coatcolor="${k}"><div class="swatch" style="background:${c.body}"></div><div class="nm">${c.name}</div></button>`).join('')}</div>
      <div class="cat">Coat pattern</div>${optRow('coatpattern', COAT_PATTERNS)}
      <div class="cat">Name</div>
      <div class="namerow"><input id="cc-name" value="${sel.name}" maxlength="16" />
        <button id="cc-roll" title="Random name">🎲</button></div>
      <div class="cat">Difficulty</div>${optRow('difficulty', DIFFICULTIES)}
      <div class="cat">Resource density</div>${optRow('density', DENSITIES)}
      <div class="cat">Predators &amp; disasters</div>${optRow('disasters', DISASTER_OPTS)}
      <div class="cat">Biome — pick to begin</div>
      <div class="grid" id="cc-biomes">${Object.entries(BIOMES).map(([k, b]) =>
        `<button class="card" data-biome="${k}"><div class="ico">${b.icon}</div>
          <div class="nm">${b.name}</div><div class="ds">${b.desc}</div></button>`).join('')}</div>
      <button id="cc-cancel" class="modal-cancel">Cancel</button>`;
    el('biome-modal').classList.remove('hidden');

    const marks = [];
    const wire = (group) => {
      const btns = card.querySelectorAll(`[data-${group}]`);
      const mark = () => btns.forEach(b => b.classList.toggle('sel', b.dataset[group] === sel[group]));
      btns.forEach(b => b.onclick = () => { sel[group] = b.dataset[group]; mark(); });
      marks.push(mark); mark();
    };
    wire('breed'); wire('coatcolor'); wire('coatpattern'); wire('difficulty'); wire('density'); wire('disasters');
    const nameInput = card.querySelector('#cc-name');
    card.querySelector('#cc-roll').onclick = () => { sel.name = HAMSTER_NAMES[Math.floor(Math.random() * HAMSTER_NAMES.length)]; nameInput.value = sel.name; };
    card.querySelector('#cc-surprise').onclick = () => {
      sel.breed = rnd(BREEDS); sel.coatcolor = rnd(COAT_COLORS); sel.coatpattern = rnd(COAT_PATTERNS);
      sel.name = HAMSTER_NAMES[Math.floor(Math.random() * HAMSTER_NAMES.length)]; nameInput.value = sel.name;
      marks.forEach(m => m());
    };
    card.querySelector('#cc-cancel').onclick = () => el('biome-modal').classList.add('hidden');
    card.querySelectorAll('[data-biome]').forEach(btn => {
      btn.onclick = () => ctx.onNewGame({
        biome: btn.dataset.biome, breed: sel.breed,
        name: nameInput.value.trim() || sel.name,
        difficulty: sel.difficulty, density: sel.density,
        disasters: sel.disasters === 'on',
        coat: { color: sel.coatcolor, pattern: sel.coatpattern },
      });
    });
  }

  // ---- Canvas interaction ----
  function setupCanvas() {
    const c = ctx.canvas;
    // Zoom model: at zoom 1 the WHOLE map is sized to CONTAIN within the board —
    // it fills the landscape area in both width AND height (preserving the map's
    // aspect ratio), centered. Zoom multiplies that base size and #viewport
    // scrolls to pan. We size the canvas in pixels (not width:100%) so it scales
    // to the available area on every layout/window change, not just the width.
    const board = c.parentElement; // #viewport (overflow:auto scroller)
    const MAP_ASPECT = GRID_W / GRID_H; // map native width:height (40:28)
    // Start focused ON THE TOWN, not zoomed all the way out: default to a closer
    // zoom and scroll-center on the colony spawn. The player can still zoom out
    // to 1 (whole map). 1 = whole map fits; >1 = zoomed in, #viewport pans.
    const START_ZOOM = 2;
    // A saved colony restores its last zoom (game.js seeds view.zoom from
    // state.viewPrefs); a first run with no saved value starts at START_ZOOM.
    if (view.zoom == null) view.zoom = START_ZOOM;
    const hasSavedCenter = typeof view.centerFracX === 'number' && typeof view.centerFracY === 'number';
    const applyZoom = () => {
      const cs = getComputedStyle(board);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = board.clientWidth - padX;
      const availH = board.clientHeight - padY;
      if (!(availW > 0 && availH > 0)) return; // not laid out yet
      // Largest size that shows the whole map inside the board (contain fit).
      const baseW = Math.min(availW, availH * MAP_ASPECT);
      const w = Math.max(1, Math.round(baseW * view.zoom));
      c.style.width = w + 'px';
      c.style.height = Math.round(w / MAP_ASPECT) + 'px';
    };
    // Min zoom 1 = the whole map always fits the board (never clipped when zoomed
    // out); zoom in up to 3.5×.
    const setZoom = (z) => { view.zoom = Math.max(1, Math.min(3.5, z)); applyZoom(); };
    applyZoom();
    // Center the viewport on the colony once the board has real dimensions
    // (retry across frames until laid out). Runs once, at game-view start.
    let centered = false;
    const centerOnTown = () => {
      if (centered) return;
      if (!(board.clientWidth > 0 && c.offsetWidth > 0)) { requestAnimationFrame(centerOnTown); return; }
      // Restore the saved pan center (a 0..1 fraction of the map) when this colony
      // has one; otherwise focus on the town spawn (first-run behaviour).
      const sp = state.world?.spawn || { x: GRID_W / 2, y: GRID_H / 2 };
      const fracX = hasSavedCenter ? view.centerFracX : (sp.x + 0.5) / GRID_W;
      const fracY = hasSavedCenter ? view.centerFracY : (sp.y + 0.5) / GRID_H;
      board.scrollLeft = Math.max(0, fracX * c.offsetWidth - board.clientWidth / 2);
      board.scrollTop = Math.max(0, fracY * c.offsetHeight - board.clientHeight / 2);
      centered = true;
    };
    requestAnimationFrame(centerOnTown);
    // Keep view.centerFracX/Y tracking the live pan center (fraction of the map),
    // so saves capture where the player is looking. Updated on scroll.
    const trackCenter = () => {
      if (!(c.offsetWidth > 0 && c.offsetHeight > 0)) return;
      view.centerFracX = (board.scrollLeft + board.clientWidth / 2) / c.offsetWidth;
      view.centerFracY = (board.scrollTop + board.clientHeight / 2) / c.offsetHeight;
    };
    board.addEventListener('scroll', trackCenter, { passive: true });
    // Re-fit whenever the board area changes — window resize, or the sidebar/log
    // dividers being dragged (which resize the board around the map).
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => applyZoom()).observe(board);
    window.addEventListener('resize', applyZoom);
    el('zoom-in') && (el('zoom-in').onclick = () => setZoom(view.zoom + 0.25));
    el('zoom-out') && (el('zoom-out').onclick = () => setZoom(view.zoom - 0.25));
    el('zoom-reset') && (el('zoom-reset').onclick = () => setZoom(1));
    board.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(view.zoom + (e.deltaY < 0 ? 0.2 : -0.2)); }, { passive: false });
    // Right-button drag pans the (zoomed) map; a plain right-click still cancels
    // a held building. `board` is the #viewport scroller.
    let panning = false, panMoved = false, psx = 0, psy = 0, pl = 0, pt = 0;
    board.addEventListener('pointerdown', (e) => {
      if (e.button !== 2) return;
      panning = true; panMoved = false; psx = e.clientX; psy = e.clientY; pl = board.scrollLeft; pt = board.scrollTop;
      try { board.setPointerCapture(e.pointerId); } catch {}
      board.classList.add('panning'); e.preventDefault();
    });
    board.addEventListener('pointermove', (e) => {
      if (!panning) return;
      const dx = e.clientX - psx, dy = e.clientY - psy;
      if (Math.abs(dx) + Math.abs(dy) > 3) panMoved = true;
      board.scrollLeft = pl - dx; board.scrollTop = pt - dy;
    });
    const endPan = () => { panning = false; board.classList.remove('panning'); };
    board.addEventListener('pointerup', endPan);
    board.addEventListener('pointercancel', endPan);
    const toTile = (e) => {
      // Map screen → tile via the LOGICAL world grid, independent of the canvas'
      // HiDPI backing resolution (c.width is devicePixelRatio-scaled).
      const r = c.getBoundingClientRect();
      return { x: Math.floor((e.clientX - r.left) / r.width * GRID_W), y: Math.floor((e.clientY - r.top) / r.height * GRID_H) };
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
        if (!r.ok) flash(r.reason);
        else {
          sfx('place');
          // Revert to the select (hand) cursor after a successful place so build
          // mode isn't sticky — unless Shift is held for rapid repeat-placement.
          if (!e.shiftKey) { view.placing = null; view.canPlace = false; flash('↩︎ Back to select'); }
          renderBuild(); renderResbar();
        }
        return;
      }
      // select a rodent under the cursor
      const px = (e.offsetX) / c.getBoundingClientRect().width * GRID_W;
      const py = (e.offsetY) / c.getBoundingClientRect().height * GRID_H;
      if (state.rescue && Math.hypot(state.rescue.x - px, state.rescue.y - py) < 0.85) {
        const r = takeInRescue(state); if (r.ok) sfx('care'); else flash(r.reason || '');
        renderResbar(); renderRodents(); return;
      }
      // Pick the NEAREST rodent within a generous radius (its drawn position),
      // so clicking near a moving hamster still selects it.
      let best = null, bestD = 1.1;
      for (const u of state.units) {
        const d = Math.hypot((u._rx ?? u.x) - px, (u._ry ?? u.y) - py);
        if (d < bestD) { bestD = d; best = u; }
      }
      if (best) { view.selUnit = best.id; sfx('click'); document.querySelector('[data-tab="rodents"]').click(); renderRodents(); return; }
      const b = state.buildings.find(b => b.x === t.x && b.y === t.y);
      if (b && b.flooded) { const r = repairMine(state, b); if (!r.ok) flash(r.reason); return; }
      if (b && BUILDINGS[b.type].deep && !b.underConstruction) { const r = digDeeper(state, b); flash(r.ok ? '⛏️ Digging deeper — richer gem yield' : r.reason || ''); return; }
      if (b && (BUILDINGS[b.type].tunnel || BUILDINGS[b.type].bridge || BUILDINGS[b.type].wall)) { const r = upgradeTunnel(state, b); flash(r.ok ? '🔧 Improved!' : r.reason || ''); return; }
      if (b && BUILDINGS[b.type].tower) { b.mode = b.mode === 'defend' ? 'watch' : 'defend'; sfx('click'); flash(b.mode === 'defend' ? '🗡️ Tower → DEFEND (stronger, but costs morale)' : '👁️ Tower → WATCH (wide vision, gentle)'); return; }
      if (b && BUILDINGS[b.type].townhall) { const r = upgradeTownhall(state, b); flash(r.ok ? 'Town Hall upgraded' : r.reason || ''); return; }
      if (b && BUILDINGS[b.type].breed && (b.dirt || 0) >= 1) { const r = cleanBurrow(state, b); flash(r.ok ? '🧹 Burrow cleaned' : r.reason || ''); return; }
      // A selected rodent + a click on the world. If the tile holds a RESOURCE
      // NODE, send the rodent to GATHER there: pin its job preference to the node's
      // kind (so it keeps working that resource) and march it over. Otherwise it's
      // a plain "go there" order that reveals fog en route.
      if (!b && view.selUnit) {
        const u = state.units.find(x => x.id === view.selUnit);
        if (u) {
          const node = state.world.nodes.find(n => n.x === t.x && n.y === t.y && n.amount > 0);
          if (node && JOB_KINDS[node.kind]) {
            u.jobPref = node.kind;
            u.targetNode = null;           // re-pick under the new preference
            u.order = { kind: 'goto', x: t.x, y: t.y }; u._exTarget = null;
            sfx('click');
            const resName = RESOURCES[NODE_TYPES[node.kind].resource]?.name || node.kind;
            flash(`🎯 → mining ${resName}`);
            renderRodents();
            return;
          }
          u.order = { kind: 'goto', x: t.x, y: t.y }; u._exTarget = null; sfx('click'); flash('🐾 On my way!'); renderRodents(); return;
        }
      }
      if (b && confirm(`Demolish ${BUILDINGS[b.type].name}? (50% refund)`)) { demolish(state, b); }
    });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!panMoved) { view.placing = null; renderBuild(); } });
    // Escape also drops the held building → back to the arrow/select cursor.
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && view.placing) { view.placing = null; renderBuild(); flash('↩︎ Back to select'); } });
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

  function init() { setupTabs(); setupCanvas(); renderBuild(); renderTech(); renderEvo(); renderRodents(); renderThreats(); renderTrade(); renderMega(); renderDoctrine(); }

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
      if (cur.raidId > prev.raidId) { sfx('raid'); sfx('scream'); } // attack — the colony panics
    }
    prev = cur;
  }

  let acc = 0;
  function update(dt) {
    renderResbar(); renderEnv(); renderNeeds();
    audioCues();
    // A pending decree pops the dilemma modal; if it auto-resolved, close it.
    if (state.decree && !decreeOpen) { sfx('milestone'); showDecree(); }
    else if (!state.decree && decreeOpen) { el('decree-modal')?.classList.add('hidden'); decreeOpen = false; }
    acc += dt;
    if (acc > 0.5) {
      acc = 0; renderLog(); renderAlerts(); renderGuide();
      audio.updateAmbient?.({
        weather: state.env?.weather,
        biome: state.world?.biome,
        night: isNight(state),
        hasUnits: state.units.length > 0,
        fire: (state._fireUntil || 0) > (state.env?.lived || 0),
        happy: (state.morale ?? 100) >= 55 && wellbeingMul(state) > 0.8, // chitter only when safe & content
      });
      const active = (tab) => el('tab-' + tab).classList.contains('active');
      if (active('rodents')) renderRodents();
      if (active('threats')) renderThreats();
      if (active('trade')) renderTrade();
      if (active('mega')) renderMega();
      if (active('doctrine')) renderDoctrine();
      if (active('evo')) renderEvo();
      if (active('build')) refreshAfford();
    }
  }
  function refreshAfford() {
    document.querySelectorAll('#tab-build [data-build]').forEach(btn => {
      btn.classList.toggle('poor', !canAffordCost(BUILDINGS[btn.dataset.build].cost));
    });
  }

  return { init, update, flash, newColony: showCharacterCreation,
    renderAll: () => { renderResbar(); renderEnv(); renderNeeds(); renderBuild(); renderTech(); renderEvo(); renderRodents(); renderThreats(); renderTrade(); renderMega(); renderDoctrine(); renderLog(); renderAlerts(); renderGuide(); } };
}

// Assignable gathering jobs — each biases a rodent toward one resource node kind.
// Icons read at a glance in the per-rodent Job row (the auto-sim honours the pick).
const JOB_KINDS = {
  trees:    { icon: '🌳', label: 'Wood (forage trees)' },
  rock:     { icon: '🪨', label: 'Stone (quarry rock)' },
  bush:     { icon: '🌿', label: 'Seeds (forage bushes)' },
  orevein:  { icon: '⛰️', label: 'Iron ore (mine)' },
  coalseam: { icon: '⚫', label: 'Coal (mine)' },
  gemseam:  { icon: '💎', label: 'Gems (deep — Mine Shaft)' },
};

// Short, plain-language notes shown when you click a resource chip.
const RESDESC = {
  wood: 'gathered from trees; the basic building material',
  stone: 'gathered from rock; sturdier builds & walls',
  ironore: 'mined underground; smelt it into Iron',
  coal: 'mined; fuels smelting & coal power (pollutes)',
  seeds: 'planted in Farms to grow Food',
  water: 'from wells/ponds; rodents must drink',
  food: 'feeds your colony — keep it stocked',
  planks: 'refined wood (Sawmill); for advanced builds',
  iron: 'refined ore (Smelter); for tough structures',
  gem: 'deep-mined by a Mine Shaft; cut into Jewellery',
  jewel: 'cut from gems (Jeweller); lifts morale & a coveted trade good',
  power: 'from wheels/solar/hydro/coal; runs machines',
  research: 'earned by labs & milestones; spend on Skills',
};
function moraleIcon(m) { m = m ?? 100; return m >= 70 ? '😊' : m >= 45 ? '😐' : m >= 25 ? '😟' : '😢'; }
function escHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmt(n) { n = Math.floor(n); return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : '' + n; }
function costStr(cost) { return Object.entries(cost || {}).map(([k, v]) => `${RESOURCES[k]?.icon || k}${v}`).join(' '); }
