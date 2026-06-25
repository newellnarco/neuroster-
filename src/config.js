// config.js — all tunable game data lives here (data-driven design).
// Adding content (resources, buildings, species, tech) mostly means editing this file.

export const TILE = 32;          // pixel size of a world tile
export const GRID_W = 40;        // world width  in tiles
export const GRID_H = 28;        // world height in tiles
export const TICKS_PER_SEC = 4;  // simulation steps per second
export const AUTOSAVE_SEC = 10;  // autosave interval
export const MAX_OFFLINE_HRS = 8; // cap on offline progress

// ---- Resources -------------------------------------------------------------
// kind: 'raw' (gathered from nodes), 'refined' (produced), 'abstract' (power/research)
export const RESOURCES = {
  wood:     { name: 'Wood',     icon: '🪵', kind: 'raw',     color: '#a9743b' },
  stone:    { name: 'Stone',    icon: '🪨', kind: 'raw',     color: '#9aa0a6' },
  ironore:  { name: 'Iron Ore', icon: '⛰️', kind: 'raw',     color: '#b08d77' },
  coal:     { name: 'Coal',     icon: '⚫', kind: 'raw',     color: '#444b52' },
  seeds:    { name: 'Seeds',    icon: '🌱', kind: 'raw',     color: '#7cb342' },
  water:    { name: 'Water',    icon: '💧', kind: 'raw',     color: '#42a5f5' },
  food:     { name: 'Food',     icon: '🌾', kind: 'refined', color: '#e6c34d' },
  planks:   { name: 'Planks',   icon: '🟫', kind: 'refined', color: '#caa05a' },
  iron:     { name: 'Iron',     icon: '🔩', kind: 'refined', color: '#cfd6dd' },
  power:    { name: 'Power',    icon: '⚡', kind: 'abstract', color: '#ffd54f' },
  research: { name: 'Research', icon: '🔬', kind: 'abstract', color: '#7e9cff' },
};

// Resource nodes scattered in the world (raw materials a hamster can mine).
export const NODE_TYPES = {
  trees:    { resource: 'wood',    icon: '🌳', amount: 400, color: '#2e7d32' },
  rock:     { resource: 'stone',   icon: '🪨', amount: 500, color: '#78838d' },
  orevein:  { resource: 'ironore', icon: '⛰️', amount: 300, color: '#8d6e63' },
  coalseam: { resource: 'coal',    icon: '⚫', amount: 300, color: '#37474f' },
  bush:     { resource: 'seeds',   icon: '🌿', amount: 200, color: '#558b2f' },
};

// ---- Buildings -------------------------------------------------------------
// effect categories are interpreted by economy.js / state.js.
export const BUILDINGS = {
  burrow: {
    name: 'Burrow', icon: '🕳️', desc: '+3 population cap. Breeds hamsters (uses food).',
    cost: { wood: 20 }, category: 'Housing', popCap: 3, breed: true,
  },
  storage: {
    name: 'Storage Depot', icon: '📦', desc: '+200 storage. Haul drop-off point.',
    cost: { wood: 25 }, category: 'Storage', storage: 200,
  },
  farm: {
    name: 'Farm', icon: '🌾', desc: 'Turns Seeds into Food over time.',
    cost: { wood: 30 }, category: 'Food', produces: { food: 0.5 }, consumes: { seeds: 0.25 },
  },
  well: {
    name: 'Well', icon: '⛲', desc: 'Draws Water for the colony (place near a pond).',
    cost: { wood: 20, stone: 20 }, category: 'Food', produces: { water: 0.6 }, needsWater: true, radius: 3,
  },
  playground: {
    name: 'Playground', icon: '🎠', desc: 'Enrichment: raises colony Curiosity & happiness.',
    cost: { wood: 30, planks: 10 }, category: 'Wellbeing', curiosity: 6,
  },
  infirmary: {
    name: 'Infirmary', icon: '🏥', desc: 'Tends sick & injured rodents. Raises Health.',
    cost: { planks: 20, iron: 5 }, category: 'Wellbeing', health: 6,
  },
  sawmill: {
    name: 'Sawmill', icon: '🪚', desc: 'Refines Wood into Planks.',
    cost: { wood: 40, stone: 10 }, category: 'Production',
    produces: { planks: 0.4 }, consumes: { wood: 0.6 },
  },
  smelter: {
    name: 'Smelter', icon: '🔥', desc: 'Smelts Iron Ore + Coal into Iron.',
    cost: { wood: 30, stone: 40 }, category: 'Production',
    produces: { iron: 0.3 }, consumes: { ironore: 0.5, coal: 0.3 },
  },
  mine: {
    name: 'Mine', icon: '⛏️', desc: 'Automated extraction; place near ore/coal/stone.',
    cost: { wood: 40, planks: 10 }, category: 'Extraction', autoMine: true, radius: 3,
  },
  wheel: {
    name: 'Wheel Generator', icon: '🎡', desc: 'Rodents run wheels: Food → Power.',
    cost: { wood: 35, planks: 5 }, category: 'Automation',
    produces: { power: 0.6 }, consumes: { food: 0.4 },
  },
  lab: {
    name: 'Research Lab', icon: '🔬', desc: 'Generates Research points.',
    cost: { planks: 30, iron: 10 }, category: 'Production', produces: { research: 0.3 },
  },
  irrigation: {
    name: 'Irrigation', icon: '🚿', desc: 'Channels water to farms; +food, +flood resistance.',
    cost: { planks: 15, stone: 15 }, category: 'Food', produces: { food: 0.3 }, consumes: { water: 0.3 },
    protect: { flood: 3 },
  },
  feeder: {
    name: 'Feeder', icon: '🍽️', desc: 'Auto-distributes food; slows the Food need drain.',
    cost: { wood: 20, planks: 8 }, category: 'Wellbeing', feeder: 0.4,
  },
  wall: {
    name: 'Wall', icon: '🧱', desc: 'Defensive structure vs ground predators & raids.',
    cost: { stone: 15 }, category: 'Defense', defense: 2, protect: { wolf: 2, raid: 2 },
  },
  watchtower: {
    name: 'Watchtower', icon: '🗼', desc: 'Ranged defense; spots threats; hits flyers.',
    cost: { wood: 20, stone: 30 }, category: 'Defense', defense: 8,
    protect: { wolf: 3, hawk: 4, raid: 4 },
  },
  barracks: {
    name: 'Barracks', icon: '⚔️', desc: 'Trains defenders. Offensive + defensive power.',
    cost: { planks: 40, iron: 20 }, category: 'Defense', defense: 12, offense: 8,
    protect: { wolf: 4, hawk: 3, raid: 6 },
  },
  levee: {
    name: 'Levee', icon: '🌊', desc: 'Holds back floodwater. Strong flood protection.',
    cost: { stone: 40, planks: 10 }, category: 'Defense', protect: { flood: 8 },
  },
  shelter: {
    name: 'Quake Shelter', icon: '🏚️', desc: 'Reinforced burrow; reduces earthquake losses.',
    cost: { stone: 35, planks: 20 }, category: 'Defense', protect: { quake: 8 },
  },
};

// ---- Rodent species --------------------------------------------------------
// `protect` = which disaster/predator this species helps defend against.
// `role` is shown in the UI to explain why a player wants them in the group.
export const SPECIES = {
  hamster:   { name: 'Hamster',   icon: '🐹', speed: 1.0, carry: 5,  mine: 1.0, locked: false,
               role: 'All-round worker' },
  guineapig: { name: 'Guinea Pig',icon: '🐹', speed: 0.8, carry: 4,  mine: 0.6, power: 2.0, locked: true,
               role: 'Runs wheels → Power', protect: { flood: 0 } },
  gerbil:    { name: 'Gerbil',    icon: '🐭', speed: 1.6, carry: 8,  mine: 0.8, locked: true,
               role: 'Fast hauler; speeds conveyors' },
  mouse:     { name: 'Mouse',     icon: '🐁', speed: 1.4, carry: 3,  mine: 0.7, research: 1.5, locked: true,
               role: 'Lookout: warns of flying predators', protect: { hawk: 0.5 } },
  rat:       { name: 'Rat',       icon: '🐀', speed: 1.1, carry: 9,  mine: 0.9, locked: true,
               role: 'Swarm defense vs ground predators', protect: { wolf: 0.5 } },
  beaver:    { name: 'Beaver',    icon: '🦫', speed: 0.7, carry: 6,  mine: 1.4, build: 2.0, locked: true,
               role: 'Builds dams; speeds building; flood defense', protect: { flood: 0.6 } },
};

// ---- Tech tree -------------------------------------------------------------
// effect is applied to GameState.mods (multipliers / unlocks).
export const TECH = {
  mining1:    { name: 'Mining I',     icon: '⛏️', cost: { research: 20 }, desc: '+25% mining speed.',
                effect: { mineMul: 0.25 } },
  logistics1: { name: 'Logistics I',  icon: '🛒', cost: { research: 25 }, desc: '+25% hauler speed.',
                effect: { speedMul: 0.25 } },
  carry1:     { name: 'Big Pouches',  icon: '🎒', cost: { research: 25 }, desc: '+50% carry capacity.',
                effect: { carryMul: 0.5 } },
  refining1:  { name: 'Refining I',   icon: '🏭', cost: { research: 40 }, desc: '+30% production speed.',
                effect: { prodMul: 0.3 } },
  agri1:      { name: 'Agriculture I',icon: '🌻', cost: { research: 30 }, desc: '+40% food production.',
                effect: { foodMul: 0.4 } },
  // Species unlocks
  unlockGuinea: { name: 'Recruit Guinea Pigs', icon: '🐹', cost: { research: 50, food: 100 },
                  desc: 'Unlock Guinea Pigs (power on wheels).', effect: { unlock: 'guineapig' } },
  unlockGerbil: { name: 'Recruit Gerbils', icon: '🐭', cost: { research: 60, food: 120 },
                  desc: 'Unlock Gerbils (fast haulers).', effect: { unlock: 'gerbil' } },
  unlockMouse:  { name: 'Recruit Mice', icon: '🐁', cost: { research: 60, food: 120 },
                  desc: 'Unlock Mice (boost research).', effect: { unlock: 'mouse' } },
  unlockBeaver: { name: 'Recruit Beavers', icon: '🦫', cost: { research: 90, planks: 80 },
                  desc: 'Unlock Beavers (heavy builders).', effect: { unlock: 'beaver' } },
};

// ---- Disasters & predators -------------------------------------------------
// Each event periodically threatens the colony. `mitigatedBy` lists the
// protect-keys (from buildings/species) that reduce its severity. Players build
// defenses and recruit protective species to survive.
// severity is reduced by total protection; leftover severity causes the effect.
export const DISASTERS = {
  wolf: {
    name: 'Wolf Pack', icon: '🐺', kind: 'predator', baseSeverity: 12, interval: 90,
    desc: 'Ground predators try to snatch rodents.', effect: 'takeUnits',
  },
  hawk: {
    name: 'Hawk', icon: '🦅', kind: 'predator', baseSeverity: 10, interval: 75,
    desc: 'Flying predator swoops on exposed rodents.', effect: 'takeUnits',
  },
  raid: {
    name: 'Raider Rodents', icon: '🏴', kind: 'predator', baseSeverity: 14, interval: 120,
    desc: 'Rival rodents raid your stores.', effect: 'loot',
  },
  flood: {
    name: 'Flood', icon: '🌊', kind: 'disaster', baseSeverity: 14, interval: 140,
    desc: 'Rising water damages buildings & food.', effect: 'damage',
  },
  quake: {
    name: 'Earthquake', icon: '🌋', kind: 'disaster', baseSeverity: 16, interval: 200,
    desc: 'The ground shakes; structures collapse.', effect: 'destroy',
  },
};

// ---- Wellbeing needs -------------------------------------------------------
// Colony-level meters (0..100). Low meters reduce the colony productivity
// multiplier; high meters give a small bonus. The player is responsible for
// keeping them satisfied via resources (food, water) and buildings.
export const NEEDS = {
  food:      { name: 'Food',      icon: '🌾', drainPerPop: 0.025, from: 'food',  desc: 'Rodents must eat.' },
  water:     { name: 'Water',     icon: '💧', drainPerPop: 0.025, from: 'water', desc: 'Rodents must drink.' },
  curiosity: { name: 'Curiosity', icon: '🧩', drainPerPop: 0.012, from: null,    desc: 'Enrichment keeps them happy (Playgrounds).' },
  health:    { name: 'Health',    icon: '❤️', drainPerPop: 0.010, from: null,    desc: 'Sickness spreads if neglected (Infirmaries).' },
};

// ---- Traits ----------------------------------------------------------------
// Per-unit upgradable traits. Traits can be "bred"/combined: when two rodents
// of different species share the colony, their best trait levels can blend into
// hybrids (see entities.js). Each level grants a small multiplier.
export const TRAITS = {
  strength:  { name: 'Strength',  icon: '💪', desc: 'Mining yield & build speed.',  affects: ['mine', 'build'], perLevel: 0.15 },
  swiftness: { name: 'Swiftness', icon: '💨', desc: 'Movement speed.',              affects: ['speed'],          perLevel: 0.15 },
  capacity:  { name: 'Capacity',  icon: '🎒', desc: 'Carry capacity.',             affects: ['carry'],          perLevel: 0.20 },
  vigor:     { name: 'Vigor',     icon: '🔋', desc: 'Stamina: needs drain slower.',affects: ['stamina'],        perLevel: 0.10 },
  wit:       { name: 'Wit',       icon: '🧠', desc: 'Research & curiosity output.',affects: ['research'],       perLevel: 0.15 },
};
export const TRAIT_BASE_COST = { research: 8, food: 10 }; // scales with level

export const STARTING = {
  resources: { wood: 90, stone: 45, food: 80, seeds: 50, water: 80 },
  hamsters: 5,
  storageCap: 300,
};
