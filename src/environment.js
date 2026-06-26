// environment.js — time-of-day (day/night) and weather.
import { DAY_SECONDS, DAWN, DUSK, WEATHERS, BIOMES, TICKS_PER_SEC, SEASONS, SEASON_ORDER, DAYS_PER_SEASON } from './config.js';

// Fraction through the current day, 0..1 (0 = midnight, 0.5 = noon).
export function dayFraction(state) {
  const secs = (state.env?.dayTime ?? 0);
  return (secs % DAY_SECONDS) / DAY_SECONDS;
}
export function dayNumber(state) { return Math.floor((state.env?.dayTime ?? 0) / DAY_SECONDS) + 1; }
export function isNight(state) { const f = dayFraction(state); return f < DAWN || f > DUSK; }

// "HH:MM" clock derived from the day fraction.
export function clockString(state) {
  const f = dayFraction(state);
  const mins = Math.floor(f * 24 * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function currentWeather(state) { return WEATHERS[state.env?.weather] || WEATHERS.clear; }

// The current season cycles every DAYS_PER_SEASON in-game days.
export function seasonKey(state) {
  return SEASON_ORDER[Math.floor((dayNumber(state) - 1) / DAYS_PER_SEASON) % SEASON_ORDER.length];
}
export function currentSeason(state) { return SEASONS[seasonKey(state)] || SEASONS.spring; }

// A gentle per-season colour wash painted over the whole map (one fill/frame).
// Each season returns a DISTINCT rgba tint so the time of year is felt without
// obscuring gameplay: a fresh green spring, warm golden summer, amber autumn,
// cool blue-white winter. Pure (takes a season key) so it's unit-testable.
const SEASON_TINTS = {
  spring: 'rgba(150,210,140,0.05)',
  summer: 'rgba(255,224,130,0.05)',
  autumn: 'rgba(214,120,40,0.10)',
  winter: 'rgba(150,180,225,0.12)',
};
export function seasonTint(key) { return SEASON_TINTS[key] || SEASON_TINTS.spring; }

export function initEnv(state) {
  // dayTime = clock position; lived = total seconds actually played (for pacing).
  state.env = { dayTime: DAY_SECONDS * 0.3, lived: 0, weather: defaultWeather(state), weatherTimer: 0 };
}
export const livedSeconds = (state) => state.env?.lived || 0;
function defaultWeather(state) {
  const biome = BIOMES[state.world?.biome] || BIOMES.woodland;
  return (biome.weathers && biome.weathers[0]) || 'clear';
}

// Advance time-of-day and rotate weather. Called each economy tick (dt seconds).
export function stepEnvironment(state, dt) {
  if (!state.env) initEnv(state);
  state.env.dayTime += dt;
  state.env.lived = (state.env.lived || 0) + dt;

  // Change weather every ~1/4 day.
  state.env.weatherTimer -= dt;
  if (state.env.weatherTimer <= 0) {
    const biome = BIOMES[state.world?.biome] || BIOMES.woodland;
    const pool = biome.weathers || ['clear'];
    // pseudo-random pick that doesn't rely on Math.random for replay stability
    const pick = pool[Math.floor(hash(state.env.dayTime + state.seed) * pool.length) % pool.length];
    state.env.weather = pick;
    state.env.weatherTimer = DAY_SECONDS * (0.2 + 0.15 * hash(pick + state.env.dayTime));
  }
}

// Combined environmental modifiers used by economy.js / events.js.
export function envMods(state) {
  const w = currentWeather(state).effects || {};
  const s = currentSeason(state); // seasonal shifts stack on top of weather
  const night = isNight(state);
  return {
    foodMul: (w.foodMul || 0) + (s.foodMul || 0),
    mineMul: w.mineMul || 0,
    speedMul: (w.speedMul || 0) + (night ? -0.0 : 0),
    powerGain: w.powerGain || 0,
    waterGain: w.waterGain || 0,
    needDrain: (w.needDrain || 0) + (s.needDrain || 0),
    healthDrain: (w.healthDrain || 0) + (s.healthDrain || 0),
    revealMul: (w.revealMul || 0) + (s.revealMul || 0),
    seasonBreed: s.breed || 0,
    // Predators are bolder at night; weather can help or hurt specific ones.
    hazardMul: {
      hawk: (w.hawkMul || 0) + (night ? 0.2 : -0.1),
      wolf: night ? 0.3 : -0.1,
      raid: night ? 0.2 : 0,
      flood: w.floodMul || 0,
      quake: 0,
    },
    night,
  };
}

function hash(s) { s = '' + s; let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return (h % 10000) / 10000; }
