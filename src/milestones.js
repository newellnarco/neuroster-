// milestones.js — colony achievements that give players concrete goals and a
// steady drip of "well done" rewards (retention). Each milestone is checked
// against the live state; the first time it passes it's logged, celebrated, and
// (optionally) grants a small research reward.
import { SPECIES, EVOLUTIONS, DAY_SECONDS } from './config.js';
import { population, totalStored } from './state.js';
import { mainLevel } from './buildings.js';

export const MILESTONES = [
  { id: 'firstBuild',  name: 'Groundbreaking',   icon: '🏗️', desc: 'Construct your first building.',          reward: 5,  check: (s) => s.buildings.length >= 1 },
  { id: 'firstBurrow', name: 'Home Sweet Home',   icon: '🕳️', desc: 'Build a burrow to grow your colony.',     reward: 5,  check: (s) => s.buildings.some(b => b.type === 'burrow') },
  { id: 'pop10',       name: 'A Proper Colony',   icon: '👥', desc: 'Reach 10 rodents.',                        reward: 10, check: (s) => population(s) >= 10 },
  { id: 'pop20',       name: 'Bustling Warren',   icon: '👨‍👩‍👧‍👦', desc: 'Reach 20 rodents.',                  reward: 20, check: (s) => population(s) >= 20 },
  { id: 'firstHybrid', name: 'Best of Both',      icon: '✨', desc: 'Breed a hybrid rodent.',                   reward: 15, check: (s) => s.units.some(u => u.hybridOf) },
  { id: 'firstEvo',    name: 'Evolved',           icon: '🧬', desc: 'Unlock a species evolution.',              reward: 15, check: (s) => Object.keys(s.evolutions || {}).length >= 1 },
  { id: 'apex',        name: 'Apex Rodent',       icon: '👑', desc: 'Achieve the Apex Rodent evolution.',       reward: 50, check: (s) => s.evolutions?.apexRodent },
  { id: 'pellets',     name: 'Gourmet',           icon: '🟤', desc: 'Produce Hamster Pellets (best food).',     reward: 15, check: (s) => (s.res.pellets || 0) > 0 },
  { id: 'steel',       name: 'Age of Steel',      icon: '⚙️', desc: 'Forge Steel at a Steelworks.',             reward: 20, check: (s) => (s.res.steel || 0) > 0 },
  { id: 'ally',        name: 'Good Neighbours',   icon: '🤝', desc: 'Become allied with a faction (+40).',      reward: 20, check: (s) => Object.values(s.factions || {}).some(f => f.standing >= 40) },
  { id: 'day7',        name: 'A Week of Toil',    icon: '📅', desc: 'Survive to Day 7.',                        reward: 15, check: (s) => (s.env?.dayTime || 0) / DAY_SECONDS >= 6 },
  { id: 'day30',       name: 'A Lasting Legacy',  icon: '🏆', desc: 'Survive to Day 30.',                       reward: 60, check: (s) => (s.env?.dayTime || 0) / DAY_SECONDS >= 29 },
  { id: 'level10',     name: 'Seasoned Leader',   icon: '🎖️', desc: 'Reach Main Hamster level 10.',             reward: 30, check: (s) => mainLevel(s) >= 10 },
  { id: 'rich',        name: 'Flush with Goods',  icon: '📦', desc: 'Stockpile 800 resources.',                 reward: 20, check: (s) => totalStored(s) >= 800 },
  { id: 'allSpecies',  name: "Noah's Burrow",     icon: '🐾', desc: 'Unlock every rodent species.',             reward: 50, check: (s) => Object.keys(SPECIES).every(sp => s.unlockedSpecies?.[sp]) },
  { id: 'mausoleum',   name: 'Respect the Fallen',icon: '🏛️', desc: 'Build a Grand Mausoleum.',                 reward: 20, check: (s) => s.buildings.some(b => b.type === 'mausoleum') },
];

// Check milestones (throttled by the caller). Returns newly-achieved entries.
export function checkMilestones(state) {
  if (!state.milestones) state.milestones = {};
  const newly = [];
  for (const m of MILESTONES) {
    if (state.milestones[m.id]) continue;
    let ok = false; try { ok = !!m.check(state); } catch { ok = false; }
    if (ok) { state.milestones[m.id] = (state.env?.dayTime || 0); newly.push(m); }
  }
  return newly;
}
