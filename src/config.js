// config.js — all tunable game data lives here (data-driven design).
// Adding content (resources, buildings, species, tech) mostly means editing this file.

// Bump this whenever you ship a change you want to identify in-game.
export const VERSION = 'v0.3.9';

export const TILE = 32;          // pixel size of a world tile
export const GRID_W = 40;        // world width  in tiles
export const GRID_H = 28;        // world height in tiles
export const TICKS_PER_SEC = 4;  // simulation steps per second
export const AUTOSAVE_SEC = 10;  // autosave interval
export const DAY_SECONDS = 900;  // 1 in-game day = 15 real minutes at 1x speed
export const DAWN = 0.25, DUSK = 0.75; // fraction of day: night is < DAWN or > DUSK

// ---- Resources -------------------------------------------------------------
// kind: 'raw' (gathered from nodes), 'refined' (produced), 'abstract' (power/research)
export const RESOURCES = {
  wood:     { name: 'Wood',     icon: '🪵', kind: 'raw',     color: '#a9743b' },
  stone:    { name: 'Stone',    icon: '🪨', kind: 'raw',     color: '#9aa0a6' },
  ironore:  { name: 'Iron Ore', icon: '⛰️', kind: 'raw',     color: '#b08d77' },
  coal:     { name: 'Coal',     icon: '⚫', kind: 'raw',     color: '#444b52' },
  seeds:    { name: 'Seeds',    icon: '🌱', kind: 'raw',     color: '#7cb342' },
  water:    { name: 'Water',    icon: '💧', kind: 'raw',     color: '#42a5f5' },
  food:     { name: 'Food',     icon: '🌾', kind: 'refined', color: '#e6c34d', nourish: 1.0 },
  wheat:    { name: 'Wheat',    icon: '🌾', kind: 'refined', color: '#d9b44a' },
  grain:    { name: 'Grain',    icon: '🟡', kind: 'refined', color: '#e0c060', nourish: 1.5 },
  pellets:  { name: 'Pellets',  icon: '🟤', kind: 'refined', color: '#b9853f', nourish: 2.4 },
  fertilizer:{ name: 'Fertilizer', icon: '💩', kind: 'raw',  color: '#7a5a36' },
  planks:   { name: 'Planks',   icon: '🟫', kind: 'refined', color: '#caa05a' },
  iron:     { name: 'Iron',     icon: '🔩', kind: 'refined', color: '#cfd6dd' },
  steel:    { name: 'Steel',    icon: '⚙️', kind: 'refined', color: '#9fb0c4' },
  plastic:  { name: 'Plastic',  icon: '🟦', kind: 'refined', color: '#6fa8dc' },
  power:    { name: 'Power',    icon: '⚡', kind: 'abstract', color: '#ffd54f' },
  research: { name: 'Research', icon: '🔬', kind: 'abstract', color: '#7e9cff' },
};

// What rodents will eat, best first (premium foods nourish more per unit).
export const EDIBLES = ['pellets', 'grain', 'food'];

// Resource nodes scattered in the world.
//  surface:true  → harvested directly by roaming rodents; recede visually as used.
//  surface:false → underground: invisible deposit until you place a Mine on it,
//                  which extracts it (showing remaining) until the seam collapses.
export const NODE_TYPES = {
  trees:    { resource: 'wood',    icon: '🌳', amount: 400, color: '#2e7d32', surface: true },
  rock:     { resource: 'stone',   icon: '🪨', amount: 500, color: '#78838d', surface: true },
  bush:     { resource: 'seeds',   icon: '🌿', amount: 200, color: '#558b2f', surface: true },
  orevein:  { resource: 'ironore', icon: '⛰️', amount: 300, color: '#8d6e63', surface: false },
  coalseam: { resource: 'coal',    icon: '⚫', amount: 300, color: '#37474f', surface: false },
};

// ---- Buildings -------------------------------------------------------------
// effect categories are interpreted by economy.js / state.js.
export const BUILDINGS = {
  burrow: {
    name: 'Burrow', icon: '🕳️', desc: '+3 population cap. Breeds hamsters (uses food).',
    cost: { wood: 20 }, category: 'Housing', popCap: 3, breed: true,
  },
  townhall: {
    name: 'Meeting Burrow', icon: '🏛️', desc: 'The leader rules by teaching, helping & raising hamsters — a colony-wide boost. But a hall too grand for everyone else\'s comforts breeds resentment. Click to upgrade.',
    cost: { wood: 35, planks: 15 }, category: 'Housing', townhall: true,
  },
  storage: {
    name: 'Storage Depot', icon: '📦', desc: '+200 storage. Haul drop-off point.',
    cost: { wood: 25 }, category: 'Storage', storage: 200,
  },
  farm: {
    name: 'Farm', icon: '🌾', desc: 'Turns Seeds into Food. Much better on fertile ground (near water).',
    cost: { wood: 30 }, category: 'Food', produces: { food: 0.5 }, consumes: { seeds: 0.25 }, fertileBonus: true,
  },
  wheatfield: {
    name: 'Wheat Field', icon: '🌾', desc: 'Grows Wheat from seeds & water. Loves fertile soil by lakes/rivers.',
    cost: { wood: 35, planks: 10 }, category: 'Food', produces: { wheat: 0.7 }, consumes: { seeds: 0.3, water: 0.2 }, fertileBonus: true,
  },
  mill: {
    name: 'Mill', icon: '🏯', desc: 'Mills Wheat into Grain (better food).',
    cost: { wood: 30, stone: 30 }, category: 'Food', produces: { grain: 0.5 }, consumes: { wheat: 0.7 },
  },
  pelletpress: {
    name: 'Pellet Press', icon: '🟤', desc: 'Presses Grain into nourishing Hamster Pellets (best food).',
    cost: { planks: 30, iron: 15 }, category: 'Food', produces: { pellets: 0.4 }, consumes: { grain: 0.6 },
  },
  composter: {
    name: 'Composter', icon: '♻️', desc: 'Collects droppings nearby and turns them into Fertilizer.',
    cost: { wood: 30, planks: 10 }, category: 'Food', composter: 1, radius: 5,
  },
  vet: {
    name: 'Vet Clinic', icon: '💉', desc: 'Treats wet tail & sickness; prevents deaths. Keep rodents healthy.',
    cost: { planks: 25, iron: 10 }, category: 'Wellbeing', vet: 1, health: 4,
  },
  graveyard: {
    name: 'Dirt Graves', icon: '✝️', desc: 'Simple graves with a cross. Buries the fallen and restores some morale.',
    cost: { wood: 20, stone: 10 }, category: 'Wellbeing', graveyard: 1, buryRestore: 6, buryInterval: 8,
  },
  cryptyard: {
    name: 'Stone Crypts', icon: '🪦', desc: 'Dignified stone crypts — a more respectful resting place restores more morale.',
    cost: { stone: 45, planks: 15 }, category: 'Wellbeing', graveyard: 1, buryRestore: 12, buryInterval: 6,
  },
  mausoleum: {
    name: 'Grand Mausoleum', icon: '🏛️', desc: 'An honoured tomb for the fallen. Deep respect — large morale recovery per burial.',
    cost: { stone: 80, iron: 30, planks: 30 }, category: 'Wellbeing', graveyard: 1, buryRestore: 22, buryInterval: 5,
  },
  well: {
    name: 'Well', icon: '⛲', desc: 'Draws Water for the colony (place near a pond).',
    cost: { wood: 20, stone: 20 }, category: 'Food', produces: { water: 0.6 }, needsWater: true, radius: 3,
  },
  playground: {
    name: 'Playground', icon: '🎠', desc: 'Enrichment: raises colony Curiosity & happiness.',
    cost: { wood: 30, planks: 10 }, category: 'Wellbeing', curiosity: 6,
  },
  toybox: {
    name: 'Toy Box', icon: '🧸', desc: 'Cheap enrichment — a few toys to nibble & shove. Small Curiosity boost.',
    cost: { wood: 14, seeds: 6 }, category: 'Wellbeing', curiosity: 4,
  },
  funwheel: {
    name: 'Fun Wheel', icon: '🎡', desc: 'A wheel just for play. Big Curiosity boost, but rodents at play work a little less (distraction).',
    cost: { wood: 24, planks: 10 }, category: 'Wellbeing', curiosity: 9, distract: 0.04,
  },
  maze: {
    name: 'Hedge Maze', icon: '🌀', desc: 'A puzzle to explore — huge Curiosity relief, but the most distracting (output dips).',
    cost: { wood: 30, planks: 16, seeds: 12 }, category: 'Wellbeing', curiosity: 14, distract: 0.07,
  },
  infirmary: {
    name: 'Infirmary', icon: '🏥', desc: 'Tends sick & injured rodents. Raises Health.',
    cost: { planks: 20, iron: 5 }, category: 'Wellbeing', health: 6,
  },
  sandbath: {
    name: 'Sand Bath', icon: '🏖️', desc: 'Hamsters roll in sand to clean themselves — boosts Health and cuts wet-tail risk.',
    cost: { wood: 12, stone: 18 }, category: 'Wellbeing', health: 5, hygiene: 1,
  },
  sanctuary: {
    name: 'Sanctuary', icon: '🏡', desc: 'A refuge for lost & hurt animals. Stray creatures arrive more often to be taken in, and caring for them steadily raises colony Compassion.',
    cost: { wood: 30, planks: 15, seeds: 10 }, category: 'Wellbeing', sanctuary: true, health: 3,
  },
  sapling: {
    name: 'Plant Tree', icon: '🌳', desc: 'Plant a tree. Growing forests SCRUB pollution from the air and green the colony — replant what industry burns. (Oak groves draw squirrels — coming soon.)',
    cost: { seeds: 10, water: 6 }, category: 'Wellbeing', tree: true,
  },
  statue: {
    name: 'Statue', icon: '🗿', desc: 'A proud monument. A steady, quiet lift to colony morale — and a focus for its better nature (Compassion).',
    cost: { stone: 40, planks: 10 }, category: 'Wellbeing', statue: true,
  },
  courthouse: {
    name: 'Courthouse', icon: '⚖️', desc: 'Where the colony weighs justice against mercy. Unlocks merciful verdicts in hard decisions and lends a steady sense of fair Order (Justice).',
    cost: { planks: 30, stone: 25 }, category: 'Wellbeing', court: true,
  },
  hallofheroes: {
    name: 'Hall of Heroes', icon: '🎖️', desc: 'Honours the hamsters who gave themselves for the colony. The fallen are remembered by name with dignity — a lasting lift to morale.',
    cost: { stone: 50, planks: 25, iron: 10 }, category: 'Wellbeing', graveyard: 1, buryRestore: 18, buryInterval: 5, memorial: true,
  },
  almshouse: {
    name: 'Almshouse', icon: '🍞', desc: 'Shares surplus food with the needy. Steadily turns spare Food into Compassion, and that generosity buys goodwill that softens raids.',
    cost: { wood: 25, planks: 12, seeds: 10 }, category: 'Wellbeing', almshouse: true,
  },
  autowater: {
    name: 'Auto-Waterer', icon: '🚰', desc: 'Pipes water to rodents; slows the Water need drain.',
    cost: { planks: 15, iron: 5 }, category: 'Wellbeing', waterer: 0.4,
  },
  caretaker: {
    name: "Caretaker's Hut", icon: '🏡', desc: 'A caretaker auto-tends rodents\' energy, fun & health — run big colonies hands-free.',
    cost: { planks: 30, iron: 10, food: 20 }, category: 'Wellbeing', caretaker: 1,
  },
  sawmill: {
    name: 'Sawmill', icon: '🪚', desc: 'Refines Wood into Planks.',
    cost: { wood: 40, stone: 10 }, category: 'Production',
    produces: { planks: 0.4 }, consumes: { wood: 0.6 },
  },
  smelter: {
    name: 'Smelter', icon: '🔥', desc: 'Smelts Iron Ore + Coal into Iron.',
    cost: { wood: 30, stone: 40 }, category: 'Production',
    produces: { iron: 0.3 }, consumes: { ironore: 0.5, coal: 0.3 }, pollutes: 0.8,
  },
  steelworks: {
    name: 'Steelworks', icon: '🏭', desc: 'Forges Iron + Coal into Steel for the toughest structures. Burning coal pollutes.',
    cost: { stone: 50, iron: 20 }, category: 'Production', pollutes: 1.0,
    produces: { steel: 0.25 }, consumes: { iron: 0.4, coal: 0.3 },
  },
  mine: {
    name: 'Mine', icon: '⛏️', desc: 'Digs an underground iron-ore or coal deposit. Shows remaining until it collapses. Can flood — repair with materials & time.',
    cost: { wood: 40, planks: 10 }, category: 'Extraction', mine: true, radius: 1, rate: 1.2,
  },
  wheel: {
    name: 'Wheel Generator', icon: '🎡', desc: 'Rodents run wheels: Food → Power. Clean, but modest.',
    cost: { wood: 35, planks: 5 }, category: 'Automation',
    produces: { power: 0.6 }, consumes: { food: 0.4 },
  },
  electricwheel: {
    name: 'Electric Wheel', icon: '🔌', desc: 'A dynamo wheel — far more Power per Food than a plain wheel, with only a faint exhaust.',
    cost: { planks: 20, iron: 15 }, category: 'Automation',
    produces: { power: 1.1 }, consumes: { food: 0.4 }, pollutes: 0.4,
  },
  coalplant: {
    name: 'Coal Plant', icon: '🏭', desc: 'Burns Coal for abundant Power — but belches Pollution that poisons farms & sickens rodents. Plant trees or go green (solar/hydro/wheels) to offset it.',
    cost: { stone: 50, iron: 20 }, category: 'Automation',
    produces: { power: 1.7 }, consumes: { coal: 0.5 }, pollutes: 2.2,
  },
  solar: {
    name: 'Solar Panel', icon: '🔆', desc: 'Clean Power from sunlight — strong at midday, NOTHING at night, and weak in fog, snow & storms. Reliable only when the sun cooperates.',
    cost: { planks: 20, iron: 15, plastic: 8 }, category: 'Automation',
    produces: { power: 1.3 }, solar: true,
  },
  hydro: {
    name: 'Water Turbine', icon: '🌀', desc: 'Clean Power from flowing water (place by a pond/river). But it chokes the flow: too many turbines (or beaver Dams) starve water sources upstream.',
    cost: { planks: 25, iron: 20 }, category: 'Automation',
    produces: { power: 1.2 }, needsWater: true, radius: 3, upstreamPenalty: true,
  },
  conveyor: {
    name: 'Conveyor (Wood)', icon: '🛞', desc: 'Animated belt: auto-moves a nearby node\'s output to storage.',
    cost: { wood: 30, planks: 10 }, category: 'Automation', belt: { rate: 1.0, tier: 1 }, radius: 2, needsNode: true,
  },
  conveyorPlastic: {
    name: 'Conveyor (Plastic)', icon: '🟦', desc: 'Faster plastic belt: better throughput than wood.',
    cost: { plastic: 20, planks: 10 }, category: 'Automation', belt: { rate: 1.6, tier: 2 }, radius: 2, needsNode: true,
  },
  conveyorMetal: {
    name: 'Conveyor (Metal)', icon: '⚙️', desc: 'Fastest metal belt: highest throughput from nearby nodes.',
    cost: { planks: 20, iron: 20 }, category: 'Automation', belt: { rate: 2.4, tier: 3 }, radius: 3, needsNode: true,
  },
  refinery: {
    name: 'Refinery', icon: '🛢️', desc: 'Refines Coal into Plastic for advanced belts & parts.',
    cost: { stone: 40, iron: 20 }, category: 'Production', produces: { plastic: 0.3 }, consumes: { coal: 0.4 }, pollutes: 0.9,
  },
  lab: {
    name: 'Research Lab', icon: '🔬', desc: 'Generates Research points.',
    cost: { planks: 30, iron: 10 }, category: 'Production', produces: { research: 0.3 },
  },
  tradinghut: {
    name: 'Trading Hut', icon: '🏪', desc: 'Trade, gift & request materials with neighbouring animal groups. Shapes alliances.',
    cost: { wood: 40, planks: 20 }, category: 'Production', trading: true,
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
    name: 'Wall (Wood)', icon: '🧱', desc: 'Palisade vs ground predators & raids. Wood can burn / wash away — upgrade wood→stone→steel for more HP & defense (click to upgrade/repair).',
    cost: { wood: 12 }, category: 'Defense', wall: true,
  },
  watchtower: {
    name: 'Watchtower', icon: '🗼', desc: 'Click to set its stance: 👁️ WATCH (wide vision / early warning, gentle) or 🗡️ DEFEND (stronger defense + offense, but a militarised stance costs morale).',
    cost: { wood: 20, stone: 30 }, category: 'Defense', defense: 8,
    protect: { wolf: 3, hawk: 4, raid: 4 }, tower: true, towerOffense: 6,
  },
  tunnel: {
    name: 'Tunnel (Wood)', icon: '🛤️', desc: 'Covered run: rodents travel protected; blocks other animals crossing. Has HP, takes damage, and upgrades wood→iron→steel (click to upgrade/repair).',
    cost: { wood: 15, planks: 8 }, category: 'Defense', tunnel: true,
  },
  bridge: {
    name: 'Bridge (Wood)', icon: '🌉', desc: 'Span water (or tunnels): eases crossings and helps hold back floods. Wood can BURN in wildfire or WASH AWAY in floods — upgrade wood→stone→steel (click to upgrade/repair).',
    cost: { wood: 18, planks: 10 }, category: 'Defense', bridge: true,
  },
  dam: {
    name: 'Beaver Dam', icon: '🦫', desc: 'Beavers dam the water to collect & hold it: lots of Water + strong flood protection (cuts flow upstream).',
    cost: { wood: 50, stone: 20 }, category: 'Defense', produces: { water: 1.0 }, needsWater: true, radius: 2,
    protect: { flood: 9 }, requiresSpecies: 'beaver', upstreamPenalty: true,
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

// ---- Tunnel tiers ----------------------------------------------------------
// Tunnels protect rodent travel and bar other animals from crossing. Each tier
// is tougher (more HP & protection); upgrade a section by spending materials —
// wood → iron → refined steel. Damaged sections protect less and can collapse.
export const TUNNEL_TIERS = [
  { name: 'Wood',  hp: 30,  protect: { wolf: 2, hawk: 2, raid: 1 }, color: '#7a5a36', upgradeCost: null,                    repairCost: { wood: 8 } },
  { name: 'Iron',  hp: 75,  protect: { wolf: 4, hawk: 4, raid: 3 }, color: '#8a929a', upgradeCost: { iron: 20, planks: 10 }, repairCost: { iron: 6 } },
  { name: 'Steel', hp: 150, protect: { wolf: 7, hawk: 7, raid: 5 }, color: '#aebfd0', upgradeCost: { steel: 25, iron: 10 }, repairCost: { steel: 6 } },
];

// Bridges span water/tunnels and help hold back floods. Wood burns/washes away;
// upgrade wood → stone → steel for far more HP and flood protection.
export const BRIDGE_TIERS = [
  { name: 'Wood',  hp: 22,  protect: { flood: 2 }, defense: 1, color: '#8a6a3a', upgradeCost: null,                     repairCost: { wood: 8 } },
  { name: 'Stone', hp: 70,  protect: { flood: 5 }, defense: 2, color: '#9aa0a6', upgradeCost: { stone: 30, planks: 10 }, repairCost: { stone: 8 } },
  { name: 'Steel', hp: 150, protect: { flood: 9 }, defense: 3, color: '#aebfd0', upgradeCost: { steel: 25, iron: 10 },   repairCost: { steel: 6 } },
];

// Walls: a palisade that tiers up wood → stone → steel (HP + defense + protection).
export const WALL_TIERS = [
  { name: 'Wood',  hp: 25,  defense: 2, protect: { wolf: 2, raid: 2 },          color: '#8a6a3a', upgradeCost: null,                     repairCost: { wood: 6 } },
  { name: 'Stone', hp: 70,  defense: 5, protect: { wolf: 4, raid: 4, hawk: 1 }, color: '#9aa0a6', upgradeCost: { stone: 25, planks: 6 }, repairCost: { stone: 6 } },
  { name: 'Steel', hp: 140, defense: 9, protect: { wolf: 7, raid: 7, hawk: 3 }, color: '#aebfd0', upgradeCost: { steel: 20, iron: 8 },  repairCost: { steel: 5 } },
];

// The tier ladder for a tiered "fortification" building (tunnel/bridge/wall), or null.
export function fortTiers(type) {
  if (BUILDINGS[type]?.tunnel) return TUNNEL_TIERS;
  if (BUILDINGS[type]?.bridge) return BRIDGE_TIERS;
  if (BUILDINGS[type]?.wall) return WALL_TIERS;
  return null;
}
export const TUNNEL_REPAIR = { steel: 0, iron: 0 }; // repair cost is a fraction of upgrade (computed)

// ---- Town Hall / leadership tiers ------------------------------------------
// The leader hamster rules by example — teaching (XP), helping, and raising more
// hamsters (breeding) for a colony-wide boost (`leadership`). But each tier is
// more lavish (`luxury`); if the hall outshines everyone's housing & comforts,
// resentment grows: morale, loyalty and output fall. Lift others as you rise.
export const TOWNHALL_TIERS = [
  { name: 'Meeting Burrow', leadership: 0.10, breed: 0.3, luxury: 0, upgradeCost: null },
  { name: 'Town Hall',      leadership: 0.20, breed: 0.6, luxury: 3, upgradeCost: { planks: 40, stone: 30 } },
  { name: 'Grand Hall',     leadership: 0.34, breed: 1.0, luxury: 6, upgradeCost: { planks: 60, iron: 30, steel: 10 } },
];

// ---- Rodent species --------------------------------------------------------
// `protect` = which disaster/predator this species helps defend against.
// `role` is shown in the UI to explain why a player wants them in the group.
export const SPECIES = {
  hamster:   { name: 'Hamster',   icon: '🐹', speed: 1.0, carry: 5,  mine: 1.0, locked: false,
               role: 'All-round worker' },
  guineapig: { name: 'Guinea Pig',icon: '🐹', speed: 0.8, carry: 4,  mine: 0.6, power: 2.0, locked: true,
               def: 3, atk: 3, role: 'Burly guard/soldier — runs wheels & fights off raiders' },
  gopher:    { name: 'Gopher',    icon: '🦡', speed: 1.0, carry: 6,  mine: 1.3, build: 1.6, repair: 2.0, locked: true,
               role: 'Tunnels underground to repair & dig fast' },
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
                  desc: 'Unlock Beavers (heavy builders; build Dams).', effect: { unlock: 'beaver' } },
  unlockGopher: { name: 'Recruit Gophers', icon: '🦡', cost: { research: 80, stone: 80 },
                  desc: 'Unlock Gophers (fast underground repairs & digging).', effect: { unlock: 'gopher' } },
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
    desc: 'Brings seeds & fertile soil — but unchecked it wrecks buildings, drowns mines & hurts rodents. Levees help.',
    effect: 'flood', seeds: 45, fertileSeconds: 150,
  },
  quake: {
    name: 'Earthquake', icon: '🌋', kind: 'disaster', baseSeverity: 16, interval: 200,
    desc: 'The ground shakes; structures collapse.', effect: 'destroy',
  },
  // ---- Biome-specific disasters (only fire in their listed biomes) ----
  tsunami: {
    name: 'Tsunami', icon: '🌊', kind: 'disaster', baseSeverity: 20, interval: 200,
    desc: 'A giant wave floods the coast — fertile silt, but devastating unchecked.',
    effect: 'flood', seeds: 60, fertileSeconds: 180, biomes: ['beach', 'lakes'],
  },
  avalanche: {
    name: 'Avalanche', icon: '🏔️', kind: 'disaster', baseSeverity: 19, interval: 220,
    desc: 'Snow & rock thunder down, crushing structures.', effect: 'destroy', biomes: ['mountains'],
  },
  blight: {
    name: 'Marsh Blight', icon: '🦠', kind: 'disaster', baseSeverity: 14, interval: 160,
    desc: 'Wetland rot sickens rodents and spoils food.', effect: 'blight', biomes: ['marsh', 'rivers'],
  },
  sandstorm: {
    name: 'Sandstorm', icon: '🌪️', kind: 'disaster', baseSeverity: 13, interval: 150,
    desc: 'Stinging sand buries supplies and blinds the colony.', effect: 'loot', biomes: ['beach', 'prairie'],
  },
  wildfire: {
    name: 'Wildfire', icon: '🔥', kind: 'disaster', baseSeverity: 17, interval: 190,
    desc: 'Flames sweep the dry land, burning structures & forests.', effect: 'burn', biomes: ['woodland', 'prairie'],
  },
};

// ---- Factions / alliances --------------------------------------------------
// Neighbouring animal groups you can trade with via a Trading Hut. Standing runs
// -100 (hostile) .. +100 (allied). Each group COVETS certain resources: gifting
// or trading those raises standing, but HOARDING a pile of them breeds envy and
// invites raids that steal supplies and smash structures.
export const FACTIONS = {
  squirrels: { name: 'Squirrels',  icon: '🐿️', covets: ['food', 'seeds', 'pellets'], offers: 'planks', desc: 'Nut-hoarders who covet your food & seeds.' },
  chipmunks: { name: 'Chipmunks',  icon: '🐿️', covets: ['seeds', 'grain', 'wheat'], offers: 'stone',  desc: 'Cheeky foragers; trade stone for grain.' },
  fieldmice: { name: 'Field Mice', icon: '🐭', covets: ['wheat', 'grain', 'food'],   offers: 'research', desc: 'Scholars who trade knowledge for grain.' },
  packrats:  { name: 'Pack Rats',  icon: '🐀', covets: ['iron', 'planks', 'pellets'], offers: 'coal',  desc: 'Scavengers who raid the rich for shiny loot.' },
  // (each faction also gets a camp on the map — see factions.js)
};
export const TRADE = {
  giftAmount: 20, giftStanding: 8,
  barterGive: 20, barterGet: 14, barterStanding: 3,
  aidStanding: 40, aidCost: 35,
  hoardThreshold: 130, standingDecay: 0.2,
};

// ---- Per-creature needs ----------------------------------------------------
// Every rodent carries its OWN meters (0..100). They drive that unit's personal
// productivity and behaviour (eat / drink / sleep). The HUD shows colony
// averages. Players provision Food & Water (resources) and build enrichment.
//   food   = hunger      (eats stored Food)
//   water  = thirst      (drinks stored Water)
//   energy = endurance   (spent working, restored by SLEEP)
//   fun    = curiosity vs boredom (raised by Playgrounds & doing varied work)
//   health = derived wellbeing (sinks when other needs bottom out; Infirmaries heal)
export const NEEDS = {
  food:   { name: 'Food',   icon: '🌾', drain: 0.45, from: 'food',  eatAt: 55, desc: 'Hunger — rodents eat stored Food.' },
  water:  { name: 'Water',  icon: '💧', drain: 0.45, from: 'water', eatAt: 55, desc: 'Thirst — rodents drink stored Water.' },
  energy: { name: 'Energy', icon: '🔋', drain: 0.35, workDrain: 0.7, sleepRegen: 6, sleepAt: 22, desc: 'Endurance — restored by sleep.' },
  fun:    { name: 'Fun',    icon: '🧩', drain: 0.30, desc: 'Curiosity vs boredom — Playgrounds & variety raise it.' },
  health: { name: 'Health', icon: '❤️', desc: 'Derived from sustained needs; Infirmaries heal.' },
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

// ---- Hands-on care actions -------------------------------------------------
// The player can directly tend an individual rodent for an instant need boost,
// a little XP, and a big jump in BOND (affection). Cooldowns (seconds) keep it
// from being spammed and reward periodic check-ins rather than constant clicking.
// Bond raises productivity a touch and makes rodents loyal — caring pays off.
export const CARE = {
  feed:  { name: 'Feed',  icon: '🍽️', need: 'food',   amount: 35, cost: { food: 4 },  xp: 3, bond: 7,  cd: 8,  fx: '🍖' },
  water: { name: 'Water', icon: '💧', need: 'water',  amount: 35, cost: { water: 4 }, xp: 3, bond: 7,  cd: 8,  fx: '💧' },
  play:  { name: 'Play',  icon: '🪀', need: 'fun',    amount: 40, cost: {},            xp: 6, bond: 11, cd: 18, fx: '✨' },
  pet:   { name: 'Pet',   icon: '❤️', need: 'health', amount: 18, cost: {},            xp: 2, bond: 16, cd: 14, fx: '❤️' },
};
export const BOND_DECAY = 0.04;   // per second; gentle, so daily care keeps it up

// Flooded mines must be repaired (materials + time) before they work again.
export const MINE_REPAIR = { cost: { planks: 15, wood: 15 }, seconds: 35 };

// Construction & labour: buildings and upgrades take TIME, worked by your awake
// rodents (beavers/gophers build faster). More builders finish sooner, but
// builders pulled onto jobs mean fewer hands gathering — other work slows.
// Bigger/higher-tier projects cost more labour and take longer.
export const CONSTRUCTION = {
  timePerCost: 0.5,      // seconds of labour per unit of resource cost
  minTime: 4,            // floor on build time
  buildRate: 1.0,        // labour applied per worker per second
  maxWorkersPerJob: 4,   // diminishing returns past this many on one job
  idealWorkers: 3,       // workers a job ties up (for the gather penalty)
  minGatherFactor: 0.25, // gathering/production never fully stops
};

// Sanitation: healthy rodents poop/pee. Droppings pile up, spoil food, block
// building, and — near burrows/food — risk WET TAIL, which kills if untreated.
// Composters turn droppings into fertilizer; Vet Clinics cure & prevent deaths.
export const WASTE = {
  interval: 20,      // seconds between a healthy rodent's droppings
  decay: 0.02,       // droppings slowly break down on their own
  blockAt: 4,        // tile too soiled to build on
  composterRate: 0.5,// droppings -> fertilizer per second per composter
};
export const WETTAIL = {
  riskPerFilth: 0.0009, // infection chance per tick per unit of nearby filth
  healthDrain: 5,       // health lost per second while sick
  dieAfter: 55,         // seconds sick & untreated before it's fatal
  vetCureRate: 1.6,     // recovery per second per vet clinic
};
// Fertilizer auto-feeds Food buildings for a big yield boost.
export const FERTILIZER_BOOST = 0.7;

// ---- Pollution -------------------------------------------------------------
// Coal-burning industry (coal plant, smelter, steelworks, refinery, electric
// wheel) emits Pollution (0..100). It drifts down on its own and is scrubbed by
// living TREES, so planting/keeping forests offsets dirty power. High pollution
// poisons the land — farms yield less — and sickens rodents (health drains).
// Clean power (wheels, solar, hydro) emits none. The classic green tradeoff.
export const POLLUTION = {
  rise: 0.05,         // per second per unit of a running building's `pollutes`
  treeScrub: 0.012,   // per second per living tree node (forests clean the air)
  decay: 0.03,        // natural dispersal per second
  farmAt: 25,         // above this, farm yield starts to suffer
  farmMax: 0.5,       // up to −50% food output at 100 pollution
  sickAt: 45,         // above this, rodents' health drains
  healthDrain: 0.05,  // per second at full pollution, scaled above sickAt
};

// Burrows get dirty as hamsters live in them. Left uncleaned they leak filth
// (wet-tail risk) and eventually DEGRADE — losing their housing & breeding value
// until cleaned. Caretakers clean automatically; click a burrow to clean it.
export const BURROW = {
  dirtRate: 0.10,   // dirt gained per second (scaled by occupants)
  cleanRate: 1.2,   // dirt removed per second per caretaker
  filthAt: 35,      // above this, a burrow leaks droppings onto its tile
  degradeAt: 70,    // above this, the burrow degrades (no housing/breeding)
};

// ---- Morale ----------------------------------------------------------------
// The colony has a conscience. Unburied dead and untreated injuries crush
// morale; so does violent killing of other animals by lethal defenses. Low
// morale drags happiness & productivity and breeds deserters; graves & vets heal it.
export const MORALE = {
  bodyDrain: 0.16,    // morale lost per second per UNBURIED body
  injuredDrain: 0.04, // per second per sick/badly-injured rodent
  violenceCost: 3,    // morale lost each time a lethal defense kills attackers
  recover: 0.4,       // morale regained per second when at peace & all buried
  buryRestore: 6,     // morale regained when a body is laid to rest
  buryInterval: 7,    // seconds a Graveyard takes to bury one body
};

// ---- Founder hamster: breeds & names ---------------------------------------
// Players begin as a single "founder" hamster of a chosen breed. The breed
// predisposes starting traits and a colony-wide knack, giving every save a
// distinct starting point. The founder has a random name (changeable at start,
// then once every 30 in-game days).
export const BREEDS = {
  syrian: {
    name: 'Syrian', icon: '🐹', desc: 'Big, strong & solitary — born miners and builders. Starts with extra Strength.',
    startTraits: { strength: 2, capacity: 1 }, colonyMod: { mineMul: 0.1 }, difficulty: 0.95,
  },
  russian: {
    name: 'Russian Dwarf', icon: '🐹', desc: 'Small, fast & social — nimble haulers that breed readily. Starts with extra Swiftness.',
    startTraits: { swiftness: 2, vigor: 1 }, colonyMod: { speedMul: 0.1 }, difficulty: 1.0,
  },
  roborovski: {
    name: 'Roborovski', icon: '🐹', desc: 'Tiny, hyperactive & curious — tireless explorers that resist boredom. Starts with extra Vigor & Wit.',
    startTraits: { vigor: 2, wit: 1 }, colonyMod: { revealBonus: 0.3 }, difficulty: 1.05,
  },
  chinese: {
    name: 'Chinese', icon: '🐹', desc: 'Clever, agile climbers — keen learners with a research bent. Starts with extra Wit.',
    startTraits: { wit: 2, swiftness: 1 }, colonyMod: { researchMul: 0.15 }, difficulty: 1.0,
  },
};
export const HAMSTER_NAMES = [
  'Nibbles', 'Biscuit', 'Pip', 'Hammy', 'Waffles', 'Mochi', 'Peanut', 'Tofu', 'Cinnamon',
  'Buttercup', 'Gizmo', 'Noodle', 'Pumpkin', 'Sprocket', 'Clover', 'Marble', 'Pretzel',
  'Sunny', 'Acorn', 'Hazel', 'Cookie', 'Bandit', 'Maple', 'Ziggy', 'Dustin', 'Fuzz',
];
export const NAME_CHANGE_DAYS = 30; // founder may be renamed once every 30 in-game days

// Family surnames — every rodent belongs to a family line; offspring inherit a
// parent's surname, so you can trace lineages across the colony.
export const FAMILY_NAMES = [
  'Whiskerton', 'Nibbleby', 'Pawsworth', 'Tuftley', 'Burrows', 'Acornfield', 'Hazelnut',
  'Thistledown', 'Dandelion', 'Cloverleaf', 'Barleycorn', 'Snugglesworth', 'Cheekfull',
  'Pebblebrook', 'Meadowsweet', 'Brambleton', 'Wheatley', 'Mossfoot', 'Cobblewick', 'Honeydew',
];

// Start-of-game options for replayability: difficulty scales danger & starting
// stock; density scales how abundant resource nodes are in the generated world.
export const DIFFICULTIES = {
  relaxed: { name: 'Relaxed', icon: '😌', disasterMul: 0.55, startMul: 1.4, desc: 'Gentle threats, generous start. Build & relax.' },
  normal:  { name: 'Normal',  icon: '⚖️', disasterMul: 1.0,  startMul: 1.0, desc: 'The intended balance.' },
  harsh:   { name: 'Harsh',   icon: '🔥', disasterMul: 1.6,  startMul: 0.8, desc: 'Frequent, fierce dangers and a lean start.' },
};
export const DENSITIES = {
  sparse: { name: 'Sparse', icon: '🍂', mul: 0.6, desc: 'Scarce resources — expand & explore to survive.' },
  normal: { name: 'Normal', icon: '🌿', mul: 1.0, desc: 'A balanced spread of resources.' },
  rich:   { name: 'Rich',   icon: '🌳', mul: 1.6, desc: 'Abundant resources for a builder\'s paradise.' },
};

// ---- Biomes ----------------------------------------------------------------
// Each biome shapes the procedurally generated world: terrain mix, how much
// water, resource-node abundance (nodeMul), and hazard modifiers (hazardMul).
// Players choose a biome when starting a new colony — each is a different game.
export const BIOMES = {
  woodland: {
    name: 'Woodland', icon: '🌳', desc: 'Balanced forests — plentiful wood, gentle hazards. Great first colony.',
    terrain: { grass: 0.70, dirt: 0.25, rock: 0.05 }, water: 0.03,
    nodeMul: { trees: 1.8, rock: 0.9, orevein: 0.8, coalseam: 0.8, bush: 1.0 },
    hazardMul: { wolf: 1.2, hawk: 1.0, raid: 1.0, flood: 1.0, quake: 1.0 },
    weathers: ['clear', 'rain', 'fog', 'wind'],
  },
  prairie: {
    name: 'Prairie', icon: '🌾', desc: 'Open grassland — rich food & seeds, but stone & ore are scarce.',
    terrain: { grass: 0.82, dirt: 0.16, rock: 0.02 }, water: 0.01,
    nodeMul: { trees: 0.6, rock: 0.4, orevein: 0.3, coalseam: 0.3, bush: 2.0 },
    hazardMul: { wolf: 1.1, hawk: 1.4, raid: 1.0, flood: 0.7, quake: 0.6 },
    weathers: ['clear', 'rain', 'drought', 'wind'],
  },
  mountains: {
    name: 'Mountains', icon: '⛰️', desc: 'Rocky highlands — ore, coal & stone galore; little food, frequent quakes.',
    terrain: { grass: 0.22, dirt: 0.2, rock: 0.43, mountain: 0.15 }, water: 0.01,
    nodeMul: { trees: 0.5, rock: 1.8, orevein: 2.0, coalseam: 2.0, bush: 0.3 },
    hazardMul: { wolf: 1.3, hawk: 1.4, raid: 0.9, flood: 0.4, quake: 1.9 },
    weathers: ['clear', 'snow', 'storm', 'wind'],
  },
  lakes: {
    name: 'Lakes', icon: '🏞️', desc: 'Lake country — water everywhere, but less land to build on.',
    terrain: { grass: 0.55, dirt: 0.15, rock: 0.05 }, water: 0.25,
    nodeMul: { trees: 1.1, rock: 0.7, orevein: 0.6, coalseam: 0.6, bush: 1.1 },
    hazardMul: { wolf: 0.9, hawk: 1.0, raid: 1.0, flood: 1.6, quake: 0.8 },
    weathers: ['clear', 'rain', 'fog'],
  },
  rivers: {
    name: 'Rivers', icon: '🌊', desc: 'River valleys — fertile & well-watered, but prone to floods.',
    terrain: { grass: 0.62, dirt: 0.2, rock: 0.05 }, water: 0.08, rivers: true,
    nodeMul: { trees: 1.2, rock: 0.8, orevein: 0.7, coalseam: 0.7, bush: 1.3 },
    hazardMul: { wolf: 1.0, hawk: 1.0, raid: 1.0, flood: 2.0, quake: 0.7 },
    weathers: ['clear', 'rain', 'storm', 'fog'],
  },
  marsh: {
    name: 'Marshlands', icon: '🪷', desc: 'Wetlands — seeds & water aplenty, but disease and floods.',
    terrain: { grass: 0.4, dirt: 0.2, marsh: 0.25, water: 0.0 }, water: 0.15,
    nodeMul: { trees: 0.9, rock: 0.5, orevein: 0.5, coalseam: 0.6, bush: 1.6 },
    hazardMul: { wolf: 0.9, hawk: 0.9, raid: 1.0, flood: 1.6, quake: 0.6 },
    weathers: ['fog', 'rain', 'humid', 'clear'],
  },
  beach: {
    name: 'Beaches', icon: '🏖️', desc: 'Coastline — open & breezy; scarce wood/stone, stormy with hawks.',
    terrain: { grass: 0.35, sand: 0.42, dirt: 0.1, rock: 0.05 }, water: 0.1,
    nodeMul: { trees: 0.5, rock: 0.5, orevein: 0.5, coalseam: 0.4, bush: 0.9 },
    hazardMul: { wolf: 0.8, hawk: 1.6, raid: 1.0, flood: 1.4, quake: 0.8 },
    weathers: ['clear', 'storm', 'wind', 'fog'],
  },
};

// ---- Weather ---------------------------------------------------------------
// Weather rotates over the day within a biome's allowed set. Effects are applied
// as additive multipliers / flags interpreted by economy.js & events.js.
export const WEATHERS = {
  clear:   { name: 'Clear',   icon: '☀️', desc: 'Pleasant — no modifiers.', effects: {} },
  rain:    { name: 'Rain',    icon: '🌧️', desc: 'Crops & water thrive; mining slows.', effects: { foodMul: 0.2, waterGain: 0.5, mineMul: -0.1 } },
  drought: { name: 'Drought', icon: '🌵', desc: 'Food & water suffer.', effects: { foodMul: -0.3, needDrain: 0.3 } },
  fog:     { name: 'Fog',     icon: '🌫️', desc: 'Hard to see; hawks struggle.', effects: { revealMul: -0.5, hawkMul: -0.3 } },
  snow:    { name: 'Snow',    icon: '❄️', desc: 'Cold slows everyone.', effects: { speedMul: -0.25, foodMul: -0.2, needDrain: 0.2 } },
  storm:   { name: 'Storm',   icon: '⛈️', desc: 'Floods likelier; wheels spin faster.', effects: { floodMul: 0.6, speedMul: -0.15, powerGain: 0.4 } },
  wind:    { name: 'Wind',    icon: '💨', desc: 'Great for power; hawks ride the gusts.', effects: { powerGain: 0.5, hawkMul: 0.25 } },
  humid:   { name: 'Humid',   icon: '🥵', desc: 'Muggy — health drains faster.', effects: { healthDrain: 0.4, foodMul: 0.1 } },
};

// ---- Sleep schedules -------------------------------------------------------
// Each species has an active phase. Working against your phase is less
// productive, and rodents nap when energy runs low regardless of phase.
// hamsters are famously nocturnal/crepuscular — they thrive at night.
export const SLEEP = {
  hamster:   { phase: 'nocturnal', need: 1.0 },
  guineapig: { phase: 'diurnal',   need: 1.1 },
  gerbil:    { phase: 'crepuscular', need: 0.9 },
  mouse:     { phase: 'nocturnal', need: 1.0 },
  rat:       { phase: 'nocturnal', need: 1.0 },
  beaver:    { phase: 'diurnal',   need: 1.2 },
  gopher:    { phase: 'diurnal',   need: 1.0 },
};

// ---- Levels ----------------------------------------------------------------
// Units earn XP from work and level up, gaining skill points the player spends
// on traits, plus a small permanent stat bump per level.
export const MAX_LEVEL = 20;
export const xpForLevel = (lvl) => Math.round(40 * Math.pow(1.35, lvl - 1));

// ---- Evolution tree --------------------------------------------------------
// Species-wide PERMANENT upgrades (unlike per-unit traits). Each evolution may
// require a prior one (`req`). Applied to state.evolutions and read as
// multipliers on a whole species via SPECIES_EVO_BONUS.
export const EVOLUTIONS = {
  thickFur:   { name: 'Thick Fur',     icon: '🧥', species: 'all', cost: { research: 40, food: 60 },
                desc: 'All rodents resist cold & predators (+needs retention, +defense).', bonus: { needRetain: 0.15, defense: 0.1 } },
  strongPaws: { name: 'Strong Paws',   icon: '🐾', species: 'all', cost: { research: 50, stone: 60 },
                desc: 'All rodents mine & build faster.', bonus: { mine: 0.2, build: 0.2 } },
  bigCheeks:  { name: 'Bigger Cheeks', icon: '🐹', species: 'hamster', cost: { research: 45, food: 50 },
                desc: 'Hamsters carry much more.', bonus: { carry: 0.4 } },
  longSleep:  { name: 'Efficient Sleep', icon: '😴', species: 'all', req: 'thickFur', cost: { research: 70, planks: 40 },
                desc: 'Sleep restores energy faster; rodents need less rest.', bonus: { sleepRegen: 0.4, sleepNeed: -0.2 } },
  keenMind:   { name: 'Keen Mind',     icon: '🧠', species: 'all', req: 'strongPaws', reqLevel: 5, cost: { research: 90, iron: 30 },
                desc: 'Faster learning (XP) and research output.', bonus: { xp: 0.3, research: 0.3 } },
  apexRodent: { name: 'Apex Rodent',   icon: '👑', species: 'all', req: 'keenMind', reqLevel: 10, cost: { research: 160, iron: 80 },
                desc: 'The pinnacle of rodent evolution: everything improves.', bonus: { mine: 0.25, speed: 0.2, carry: 0.2, needRetain: 0.2, defense: 0.2 } },
};

export const STARTING = {
  // Generous starting stock so the first guided builds (Burrow, Farm, Well,
  // Storage, Sawmill, Wheel) all land with margin to spare — including a few
  // planks so the Wheel is buildable before a Sawmill exists.
  resources: { wood: 140, stone: 75, food: 120, seeds: 60, water: 100, planks: 12 },
  hamsters: 5,
  storageCap: 700,
};

// ---- Seasons & festivals ---------------------------------------------------
// The year turns spring → summer → autumn → winter; each season shifts food,
// needs & breeding, and opens with a festival (a communal lift to morale &
// compassion). A gentle calendar of reasons to come back.
export const DAYS_PER_SEASON = 3; // four seasons → a 12-day year
export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
export const SEASONS = {
  spring: { name: 'Spring', icon: '🌸', foodMul: 0.30, breed: 0.5, needDrain: -0.05, festival: 'Bloom Festival',   blurb: 'New life stirs — crops flourish and families grow.' },
  summer: { name: 'Summer', icon: '☀️', foodMul: 0.15, breed: 0.1, needDrain: 0.06, revealMul: 0.1, festival: 'Sun Festival', blurb: 'Long bright days — far sight, but thirsty work.' },
  autumn: { name: 'Autumn', icon: '🍂', foodMul: 0.40, breed: 0.2, festival: 'Harvest Festival', harvest: 35,       blurb: 'The great harvest — stores brim before the cold.' },
  winter: { name: 'Winter', icon: '❄️', foodMul: -0.30, breed: -0.2, needDrain: 0.12, healthDrain: 0.02, festival: 'Winter Gathering', blurb: 'Lean and cold — the colony huddles close and shares.' },
};

// ---- Rescues (kindness) ----------------------------------------------------
// Lost / hurt animals wander to the edge of your colony; take them in for a
// Compassion & morale boost. A Sanctuary makes them arrive far more often.
export const RESCUE = {
  baseInterval: 240,     // seconds between chances when you have no Sanctuary
  sanctuaryFactor: 0.4,  // ×interval per Sanctuary (faster arrivals)
  life: 70,              // seconds a stray waits before wandering off
  species: ['mouse', 'gerbil', 'hamster', 'gopher', 'guineapig'], // who might need help
  compassionTakeIn: 6,   // Compassion gained for taking one in
  moraleTakeIn: 4,
};

// ---- Founder coat (cosmetic) ----------------------------------------------
// The founder hamster's colour & pattern, chosen at creation (or randomised).
export const COAT_COLORS = {
  golden:    { name: 'Golden',    body: '#dcab68', belly: '#f4e2bd' },
  cream:     { name: 'Cream',     body: '#e8d6a8', belly: '#f7eed5' },
  cinnamon:  { name: 'Cinnamon',  body: '#c8824e', belly: '#edd0ab' },
  chocolate: { name: 'Chocolate', body: '#7a5230', belly: '#b88a5c' },
  grey:      { name: 'Grey',      body: '#b7b4bd', belly: '#e7e6ee' },
  charcoal:  { name: 'Charcoal',  body: '#595560', belly: '#8b8690' },
  white:     { name: 'White',     body: '#eef0f2', belly: '#ffffff' },
  black:     { name: 'Black',     body: '#3c3940', belly: '#6b6770' },
  sable:     { name: 'Sable',     body: '#8a6a3a', belly: '#d8c193' },
};
export const COAT_PATTERNS = {
  classic: { icon: '🎨', name: 'Classic', desc: 'Soft lighter belly.' },
  solid:   { icon: '⬤', name: 'Solid',   desc: 'One uniform colour.' },
  patched: { icon: '🐾', name: 'Patched', desc: 'A contrasting patch.' },
};

// ---- Megaprojects ----------------------------------------------------------
// The long-horizon, multi-session carrots (Arc 16). Unlike normal buildings you
// don't pay their cost up front: you CONTRIBUTE surplus toward each project's
// running tally over many sessions. When every resource requirement is met the
// project completes and grants a powerful, permanent, colony-wide effect.
//   effect keys (summed across completed projects in megaBonuses):
//     prodMul/foodMul/mineMul → production multipliers (added to state.mods-style)
//     storage   → flat storage cap bonus       defense → flat defense bonus
//     protectAll→ protection vs EVERY disaster  power  → passive power per second
//     leadership→ colony-wide output boost      breed  → faster breeding
//     moraleRecover → extra morale regen per second
export const MEGAPROJECTS = {
  grandWheel: {
    name: 'Grand Wheel', icon: '🎡', reqLevel: 8,
    desc: 'A colossal communal wheel that powers the whole colony — a permanent surge of productivity and power.',
    cost: { planks: 400, iron: 220, steel: 80, power: 200, research: 150 },
    effect: { prodMul: 0.5, power: 2.0 },
    blurb: '+50% production · steady free power',
  },
  citadel: {
    name: 'The Citadel', icon: '🏰', reqLevel: 10,
    desc: 'An impregnable fortress-burrow. Towers, walls and steel gates make the colony a stronghold against any threat.',
    cost: { stone: 600, planks: 300, steel: 160, iron: 200, research: 180 },
    effect: { defense: 90, protectAll: 45 },
    blurb: '+90 defense · +45 protection vs every threat',
  },
  greatGranary: {
    name: 'Great Granary', icon: '🌾', reqLevel: 6,
    desc: 'A vast vaulted store. Food never spoils and the colony can hoard far more of everything.',
    cost: { planks: 350, stone: 300, pellets: 120, grain: 150, research: 120 },
    effect: { storage: 1800, foodMul: 0.6 },
    blurb: '+1800 storage · +60% food output',
  },
  monument: {
    name: 'Eternal Monument', icon: '🗿', reqLevel: 12,
    desc: 'A towering monument to the colony\'s legend. It inspires unity, lifts spirits, and quickens new generations.',
    cost: { stone: 700, steel: 200, plastic: 150, pellets: 150, research: 220 },
    effect: { leadership: 0.4, breed: 0.6, moraleRecover: 0.4 },
    blurb: '+leadership · faster breeding · steady morale',
  },
};

// ---- Doctrines (virtue-gated skill trees) ----------------------------------
// The three colony virtues (💗 Compassion, ⚖️ Justice, 🦁 Valor) don't just sit
// in the HUD — they unlock DOCTRINES: permanent, colony-wide perks arranged in
// four branches. Each doctrine needs a virtue threshold (`req`) AND research to
// learn (`cost`), and some need a prerequisite (`prereq`). This is the player's
// "skills in war strategy, negotiation, stoicism & sacrifice" idea — Valor leads
// the martial lines, Compassion the gentle ones, Justice the steady middle.
// Effects fold (summed) into `state._doc` and read by economy/events/recompute,
// exactly like megaproject bonuses. `honoredSacrifice` is a special flag.
export const DOCTRINE_BRANCHES = {
  war:        { name: 'War Strategy', icon: '⚔️', virtue: 'valor',      desc: 'The Spartan path — drilled defenders and fierce offense.' },
  negotiation:{ name: 'Negotiation',  icon: '🤝', virtue: 'compassion', desc: 'Win with words — peace, goodwill and steady spirits.' },
  stoicism:   { name: 'Stoicism',     icon: '🪨', virtue: 'justice',    desc: 'Endure — resilient, frugal, unshaken by hardship.' },
  sacrifice:  { name: 'Sacrifice',    icon: '🕯️', virtue: 'compassion', desc: 'Give for the group — turn loss into resolve and new life.' },
};
export const DOCTRINES = {
  // War (Valor)
  phalanx:  { name: 'Phalanx Drill',  icon: '🛡️', branch: 'war', req: { valor: 35 }, cost: { research: 60 },
              desc: 'Drilled ranks: +15 colony defense.', effect: { defense: 15 } },
  warstrat: { name: 'War Strategy',   icon: '⚔️', branch: 'war', req: { valor: 55 }, prereq: 'phalanx', cost: { research: 130 },
              desc: 'Cunning tactics: +10 defense, +8 offense.', effect: { defense: 10, offense: 8 } },
  // Negotiation (Compassion)
  silvertongue: { name: 'Silver Tongue', icon: '💬', branch: 'negotiation', req: { compassion: 45 }, cost: { research: 60 },
              desc: 'Smooth talk softens raiders: +6 raid deterrence.', effect: { raidDeter: 6 } },
  accord:   { name: 'Grand Accord',   icon: '📜', branch: 'negotiation', req: { compassion: 60, justice: 45 }, prereq: 'silvertongue', cost: { research: 140 },
              desc: 'Lasting peace: +10 raid deterrence, steady morale.', effect: { raidDeter: 10, moraleRecover: 0.15 } },
  // Stoicism (Justice)
  resolve:  { name: 'Stoic Resolve',  icon: '🪨', branch: 'stoicism', req: { justice: 45, valor: 40 }, cost: { research: 80 },
              desc: 'Frugal endurance: +20% food output, steady morale.', effect: { foodMul: 0.2, moraleRecover: 0.1 } },
  unbroken: { name: 'Unbroken',       icon: '🗿', branch: 'stoicism', req: { justice: 60 }, prereq: 'resolve', cost: { research: 150 },
              desc: 'Nothing shakes them: strong steady morale recovery.', effect: { moraleRecover: 0.3 } },
  // Sacrifice (Compassion)
  selfless: { name: 'Selfless Hearts', icon: '💗', branch: 'sacrifice', req: { compassion: 55 }, cost: { research: 90 },
              desc: 'Living for each other: faster breeding, steady morale.', effect: { breed: 0.25, moraleRecover: 0.15 } },
  honored:  { name: 'Honoured Sacrifice', icon: '🕯️', branch: 'sacrifice', req: { compassion: 65, valor: 40 }, prereq: 'selfless', cost: { research: 170 },
              desc: 'The fallen inspire: a rodent\'s death steels the colony (a surge of morale & Valor) instead of only grief.', effect: { honoredSacrifice: true } },
};

// ---- Justice & Decrees (the moral counterweight to Compassion) --------------
// A second colony virtue, Justice/Order (0..100), rises with fair, firm rule and
// falls when wrongs go unanswered. High Justice deters raids; high Compassion
// converts foes. Periodically a DECREE falls to the player: a hard dilemma with
// no free answer — each choice SPENDS one virtue (or resources, or rodents'
// comfort) to buy another. This is "spend morale on purpose for the group."
// A Courthouse unlocks the merciful verdicts (choices marked requires:'court').
export const JUSTICE = {
  start: 50,
  driftTarget: 50,      // drifts back toward the middle without decrees
  courtNudge: 0.02,     // Courthouse steadily lifts Order
  raidDeter: 0.2,       // raid severity reduced per point of Justice over 50
  decreeFirst: 480,     // seconds before the first decree can fall
  decreeEvery: [320, 200], // base + jittered seconds between decrees (calmer pacing)
};

// Each decree: an eligibility test, a prompt, and 2–3 choices. A choice carries
// a declarative `effect` (deltas to morale / compassion / justice / res, an
// optional `recruit`, and `standing` toward the decree's chosen faction). One
// choice may be flagged `default:true` (auto-picked, with a small unease
// penalty, if the player lets the moment pass). `requires:'court'` choices need
// a Courthouse built. `faction:true` decrees pick a neighbouring group to target.
export const DECREES = {
  triage: {
    id: 'triage', icon: '🤒', title: 'Triage in hard times',
    prompt: 'Sickness and short stores press the colony. The weak and ill cannot keep up. Do you drive everyone to labour through it, or let the frail rest and shoulder the loss?',
    eligible: (s) => (s.res?.food ?? 0) < 90 || s._seasonKey === 'winter' || s.units?.some(u => u.sick),
    choices: [
      { label: 'Let the frail rest', desc: 'Kind, but food keeps draining with fewer hands. +Compassion, +Morale, −Food, −Justice.', tone: 'kind', fx: '💗',
        result: 'You let the frail rest and be cared for — a tender choice that costs the stores.',
        effect: { compassion: 8, morale: 6, justice: -3, res: { food: -25 } } },
      { label: 'All must labour', desc: 'Order and output now, but it is harsh on the suffering. +Food, +Justice, −Compassion, −Morale.', tone: 'hard', fx: '⚒️', default: true,
        result: 'You set every paw to work — the stores hold, but the suffering are not forgotten.',
        effect: { justice: 7, morale: -6, compassion: -6, res: { food: 18 } } },
    ],
  },
  raider: {
    id: 'raider', icon: '🏴', title: 'A captured raider', faction: true,
    prompt: 'Your guards drag in a raider caught at the stores. The colony watches to see what kind of place this is. What is their fate?',
    eligible: (s) => Object.values(s.factions || {}).some(f => (f.standing ?? 0) < 0),
    choices: [
      { label: 'Banish them', desc: 'Firm and bloodless. +Justice, a little −Compassion.', tone: 'just', fx: '🚪', default: true,
        result: 'You banish the raider to the wilds — order is kept, mercy withheld.',
        effect: { justice: 6, compassion: -3 } },
      { label: 'Imprison & feed them', desc: 'Just, but another mouth to feed. +Justice, +Morale, −Food.', tone: 'just', fx: '🔒',
        result: 'You hold the raider fed and fairly — costly, but no blood is spilt.',
        effect: { justice: 4, morale: 3, res: { food: -15 } } },
      { label: 'Show mercy — let them join', desc: 'Needs a Courthouse. Turns a foe into a friend. +Compassion, +Morale, +Standing, +1 rodent.', tone: 'kind', fx: '🤝', requires: 'court',
        result: 'The court hears them out and offers a home — a grateful newcomer joins, and their kin take note.',
        effect: { compassion: 10, morale: 6, standing: 14, recruit: true } },
    ],
  },
  rationing: {
    id: 'rationing', icon: '🍲', title: 'How to share the stores',
    prompt: 'The winter share must be set. Do you ration the food equally so none go without, or reward your hardest workers to spur the colony on?',
    eligible: (s) => (s.units?.length ?? 0) >= 6,
    choices: [
      { label: 'Ration equally', desc: 'Fair to all. +Compassion, +Morale, +Justice, a little −Food (waste in fairness).', tone: 'kind', fx: '⚖️', default: true,
        result: 'Every rodent gets an equal share — none go hungry, and the colony feels cared for.',
        effect: { compassion: 6, morale: 5, justice: 4, res: { food: -10 } } },
      { label: 'Reward the strongest', desc: 'Spurs output, but the weak resent it. +Food, +Research, −Compassion, −Morale.', tone: 'hard', fx: '🏅',
        result: 'You feed the strongest first — they work harder, but the rest grumble.',
        effect: { morale: -5, compassion: -5, res: { food: 14, research: 10 } } },
    ],
  },
  neighbor: {
    id: 'neighbor', icon: '🆘', title: 'A neighbour in need', faction: true,
    prompt: 'A neighbouring colony is starving and begs your aid. Your own stores are not endless. Do you share what you have, or look to your own first?',
    eligible: (s) => (s.res?.food ?? 0) > 60 && Object.values(s.factions || {}).some(f => (f.standing ?? 0) > -20),
    choices: [
      { label: 'Send food to help', desc: 'Generous and remembered. −Food, +Compassion, +Morale, +Standing.', tone: 'kind', fx: '💝',
        result: 'You send a caravan of food to the starving neighbour — they will not forget it.',
        effect: { compassion: 10, morale: 6, standing: 18, res: { food: -30 } } },
      { label: 'Keep it for our own', desc: 'Safe, but cold. +Food kept, −Compassion, −Standing.', tone: 'hard', fx: '🚫', default: true,
        result: 'You turn the beggars away to guard your own — the stores hold, but goodwill sours.',
        effect: { compassion: -6, standing: -12 } },
    ],
  },
  cub: {
    id: 'cub', icon: '🐾', title: 'A lost predator cub',
    prompt: 'A whimpering predator cub has strayed to your gates, alone and starving. Its kind has hunted your colony before. Do you take it in, or drive it away?',
    eligible: (s) => (s.compassion ?? 50) >= 45,
    choices: [
      { label: 'Raise it with kindness', desc: 'A gamble of the heart. −Food, +Compassion. In time it may grow into a guardian… or slip back to its pack… or have lured them to you.', tone: 'kind', fx: '🐾',
        result: 'You take the cub in and feed it — a soft heart in a hard world. Only time will tell what it becomes.',
        effect: { compassion: 9, morale: 4, res: { food: -12 }, fate: 'cub' } },
      { label: 'Drive it off', desc: 'Cautious and firm. +Justice, −Compassion.', tone: 'just', fx: '🚪', default: true,
        result: 'You drive the cub back to the wilds — wise, perhaps, but the colony feels the chill of it.',
        effect: { justice: 4, compassion: -5 } },
    ],
  },
  herd: {
    id: 'herd', icon: '🦌', title: 'A migrating herd passes through',
    prompt: 'A weary herd of grazers is migrating through your lands, footsore and hungry. They ask leave to rest and feed a while. Do you shelter them, or send them on their way?',
    eligible: (s) => (s.res?.food ?? 0) > 40,
    choices: [
      { label: 'Shelter & feed them', desc: 'Costs food now; grateful guests repay kindness later. −Food, +Compassion, +Morale; a gift comes in time.', tone: 'kind', fx: '🌿',
        result: 'You open your meadows to the herd — they graze gratefully and bed down under your watch. They will not forget it.',
        effect: { compassion: 8, morale: 5, res: { food: -20 }, fate: 'herd' } },
      { label: 'Send them on', desc: 'Your stores are your own. Bloodless, but cool. +Justice, a little −Compassion.', tone: 'just', fx: '🚶', default: true,
        result: 'You point the herd onward to other pastures — prudent, if a little cold.',
        effect: { justice: 3, compassion: -3 } },
    ],
  },
  parley: {
    id: 'parley', icon: '🕊️', title: 'An uneasy emissary', faction: true,
    prompt: 'Tensions are high — an emissary arrives under a fraying flag of truce, testing whether there is peace to be had. Do you spend goodwill to broker a truce, or stand firm and let your defenses speak?',
    eligible: (s) => Object.values(s.factions || {}).some(f => (f.standing ?? 0) < -10),
    choices: [
      { label: 'Broker a truce', desc: 'Spend Compassion to buy peace — raids & predators hold off for a while. −Compassion, +Morale, +Standing, 🕊️ truce.', tone: 'kind', fx: '🕊️',
        result: 'You spend hard-won goodwill to broker an uneasy peace — the wilds and rivals hold back, for now.',
        effect: { compassion: -6, morale: 4, standing: 12, truce: 200 } },
      { label: 'Stand firm', desc: 'No concessions; let order and walls answer. +Justice; tensions remain.', tone: 'just', fx: '🛡️', default: true,
        result: 'You give no ground — the emissary leaves empty-pawed, and the colony trusts in its own strength.',
        effect: { justice: 6 } },
    ],
  },
};
