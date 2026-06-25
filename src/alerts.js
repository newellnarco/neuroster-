// alerts.js — live, prioritized HUD notifications: the "what needs attention
// right now" retention hook (Arc 17). Everything here is PURELY DERIVED from the
// live state (nothing is persisted), so it costs nothing in the save file and
// stays correct after a load. The UI recomputes these a few times a second,
// shows the most pressing ones as a banner, and pings when a new critical one
// appears — the nudge that pulls a player back to a need before it cascades.
import { BUILDINGS, FACTIONS, DISASTERS, BIOMES, EDIBLES } from './config.js';
import { colonyNeeds, population, totalStored } from './state.js';
import { protectionAgainst, totalOffense } from './events.js';

// Lower rank = more urgent (sorts first, drives the banner colour & ping).
export const SEV_RANK = { critical: 0, warning: 1, info: 2 };

function foodStock(state) { return EDIBLES.reduce((a, k) => a + (state.res[k] || 0), 0); }

// Returns a prioritized list of active alerts: { sev, id, icon, msg, tab }.
// `tab` (if set) names the sidebar panel a click should jump to.
export function computeAlerts(state) {
  const out = [];
  const push = (sev, id, icon, msg, tab = null) => out.push({ sev, id, icon, msg, tab });
  const pop = population(state);
  if (pop <= 0) return out;
  const c = colonyNeeds(state);

  // ---- Survival needs (graduated: symptom first, empty stores as a heads-up) ----
  if (c.food < 20) push('critical', 'food', '🍽️', 'Rodents are starving — get food now!', 'build');
  else if (c.food < 40) push('warning', 'food', '🍽️', 'Food is running low — build or boost farms.', 'build');
  else if (foodStock(state) <= 0) push('info', 'food', '🍽️', 'Food stores are empty — set up farming before they go hungry.', 'build');

  if (c.water < 20) push('critical', 'water', '💧', 'Rodents are parched — get water now!', 'build');
  else if (c.water < 40) push('warning', 'water', '💧', 'Water is running low — build a Pond/Well.', 'build');
  else if ((state.res.water || 0) <= 0) push('info', 'water', '💧', 'Water stores are empty — secure a water source.', 'build');

  if (c.energy < 18) push('warning', 'energy', '😴', 'Rodents are exhausted — let them rest (caretakers ease it).', 'build');
  if (c.fun < 18) push('warning', 'fun', '🥱', 'Boredom is high — build enrichment (Playground).', 'build');
  if (c.health < 25) push('warning', 'health', '🩹', 'Colony health is poor — Infirmary & better food help.', 'build');

  // ---- Sickness & sanitation ----
  const sick = state.units.filter(u => u.sick).length;
  if (sick > 0) {
    const vets = state._vets || 0;
    push(vets ? 'warning' : 'critical', 'sick', '🤢',
      `${sick} rodent(s) have wet tail${vets ? ' (vet treating)' : ' — build a Vet Clinic!'}`, 'build');
  }
  const degraded = state.buildings.filter(b => b.degraded).length;
  if (degraded > 0) push('warning', 'burrow', '🪰', `${degraded} burrow(s) degraded by filth — click to clean.`, 'build');

  // ---- Morale & ethics ----
  const bodies = state.bodies?.length || 0;
  if (bodies > 0) push('warning', 'dead', '⚰️', `${bodies} fallen rodent(s) unburied — build a Graveyard (morale).`, 'build');
  if ((state.morale ?? 100) < 35) push('warning', 'morale', '😢', 'Morale is low — bury the dead, heal the sick, ease resentment.');
  if ((state._resent || 0) > 0) push('info', 'resent', '😤', 'Rodents resent a hall grander than their own comforts — build Housing & Wellbeing.', 'build');

  // ---- Population, housing & storage ----
  if (state.popCap <= 0) push('warning', 'house', '🏠', 'No housing — build a Burrow so your colony can grow.', 'build');
  else if (pop >= state.popCap) push('info', 'housefull', '🏠', 'Housing is full — build more Burrows to keep growing.', 'build');
  if (totalStored(state) >= state.storageCap * 0.98) push('info', 'storage', '📦', 'Storage is full — surplus is wasted. Build more Storage.', 'build');

  // ---- Hazards ----
  const flooded = state.buildings.filter(b => b.flooded).length;
  if (flooded > 0) push('warning', 'mine', '🌊', `${flooded} mine(s) flooded — click to repair (gophers auto-repair).`, 'build');

  // Imminent faction raid: an envious/hostile group whose raid timer is nearly up.
  for (const [id, f] of Object.entries(FACTIONS)) {
    const fs = state.factions?.[id];
    if (!fs) continue;
    const pressure = Math.max(0, -(fs.standing || 0)) + Math.min(45, (fs.hoard || 0) * 0.12);
    if (pressure > 14 && (fs.raidTimer ?? 999) < 30) {
      const prot = protectionAgainst(state, 'raid') + totalOffense(state);
      const sev = pressure * (1 + (state.env?.lived || 0) / 4000);
      const ready = prot >= sev;
      push(ready ? 'info' : 'critical', 'raid_' + id, f.icon,
        `${f.name} raid imminent${ready ? ' — defenses look ready.' : ' — bolster Walls or make peace!'}`,
        ready ? 'trade' : 'threats');
    }
  }

  // Imminent disaster with thin defenses for this biome.
  const biome = state.world?.biome;
  for (const [key, d] of Object.entries(DISASTERS)) {
    if (d.biomes && !d.biomes.includes(biome)) continue;
    const ev = state.events?.[key];
    if (!ev || (ev.timer ?? 999) >= 25) continue;
    const biomeMul = BIOMES[biome]?.hazardMul?.[key] ?? 1;
    const sev = d.baseSeverity * (1 + (state.env?.lived || 0) / 3000) * biomeMul;
    const prot = protectionAgainst(state, key) + (d.kind === 'predator' ? totalOffense(state) : 0);
    if (prot < sev * 0.7) push('warning', 'haz_' + key, d.icon, `${d.name} looms and defenses are thin — counter it now!`, 'threats');
  }

  // ---- Desertion risk (low wellbeing) ----
  if ((state._unrest || 0) > 0.4 && pop > 1) push('warning', 'unrest', '💔', 'Rodents are unhappy and may desert — meet their needs.', 'build');

  // ---- Engagement nudge (lowest priority) ----
  const sp = state.units.reduce((a, u) => a + (u.skillPoints || 0), 0);
  if (sp > 0) push('info', 'skill', '⭐', `${sp} unspent skill point(s) — upgrade rodent traits for free.`, 'rodents');

  out.sort((a, b) => SEV_RANK[a.sev] - SEV_RANK[b.sev]);
  return out;
}
