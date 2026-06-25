// audio.js — tiny dependency-free sound system. All cues are synthesised with
// the Web Audio API (no asset files), so the project stays build-free. Audio is
// unlocked on the first user gesture (per browser autoplay policy) and every
// call is wrapped so a missing/blocked AudioContext can never throw or spam the
// console. Mute state persists in localStorage.
const MUTE_KEY = 'neuroster.muted';

export function createAudio() {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}

  // Create the context lazily, and only after a gesture (called from unlock()).
  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch { ctx = null; }
    return ctx;
  }

  // Wait for the first real user gesture before starting audio (avoids the
  // "AudioContext was not allowed to start" warning entirely).
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }
  try {
    const once = { once: true, passive: true };
    window.addEventListener('pointerdown', unlock, once);
    window.addEventListener('keydown', unlock, once);
  } catch {}

  // One simple voice: an oscillator through a short gain envelope.
  function tone(freq, dur, type = 'sine', gain = 0.12, when = 0, glideTo = null) {
    const c = ctx; if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // Soft filtered-noise burst (for thuds/raids).
  function noise(dur, gain = 0.12, when = 0) {
    const c = ctx; if (!c) return;
    const t0 = c.currentTime + when;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // Named cues — short, distinct, friendly.
  const CUES = {
    click:     () => tone(420, 0.05, 'triangle', 0.05),
    place:     () => { tone(300, 0.08, 'square', 0.06); tone(450, 0.10, 'square', 0.05, 0.05); },
    complete:  () => { tone(523, 0.10, 'sine', 0.10); tone(784, 0.16, 'sine', 0.09, 0.10); },
    care:      () => tone(660, 0.12, 'sine', 0.09, 0, 990),         // happy rising chirp
    born:      () => { tone(880, 0.07, 'triangle', 0.08); tone(1320, 0.10, 'triangle', 0.07, 0.06); },
    level:     () => { tone(523, 0.09, 'sine', 0.09); tone(659, 0.09, 'sine', 0.09, 0.08); tone(784, 0.14, 'sine', 0.10, 0.16); },
    milestone: () => { tone(523, 0.10, 'sine', 0.10); tone(659, 0.10, 'sine', 0.10, 0.10); tone(784, 0.10, 'sine', 0.10, 0.20); tone(1046, 0.22, 'sine', 0.11, 0.30); },
    trade:     () => { tone(700, 0.08, 'triangle', 0.07); tone(900, 0.10, 'triangle', 0.06, 0.07); },
    alarm:     () => { tone(330, 0.16, 'sawtooth', 0.10); tone(247, 0.20, 'sawtooth', 0.10, 0.16); },
    raid:      () => { noise(0.25, 0.14); tone(160, 0.22, 'sawtooth', 0.08); },
    // --- ambient one-shots (nature / life), softer than UI cues ---
    eat:       () => { tone(520, 0.04, 'triangle', 0.04, 0, 380); tone(440, 0.04, 'triangle', 0.035, 0.05, 320); },
    chitter:   () => { for (let i = 0; i < 3; i++) tone(1500 - i * 120, 0.045, 'sawtooth', 0.035, i * 0.05, 1100); },
    bird:      () => { tone(2300, 0.07, 'sine', 0.045, 0, 2700); tone(2650, 0.06, 'sine', 0.04, 0.08, 2200); tone(2400, 0.05, 'sine', 0.035, 0.15, 2900); },
    cricket:   () => { for (let i = 0; i < 4; i++) tone(4800, 0.022, 'square', 0.025, i * 0.05); },
    thunder:   () => { noise(0.9, 0.2); tone(58, 1.0, 'sine', 0.12); tone(42, 1.2, 'sine', 0.10, 0.1); },
    // content vs frightened hamster vocalisations
    purr:      () => { for (let i = 0; i < 3; i++) tone(900 + i * 60, 0.06, 'triangle', 0.04, i * 0.07, 760); }, // happy chitter
    scream:    () => { tone(1000, 0.10, 'sawtooth', 0.10, 0, 1900); tone(1900, 0.14, 'sawtooth', 0.09, 0.08, 700); }, // scared squeal
  };

  function play(name) {
    if (muted || !unlocked) return;
    const c = ensureCtx(); if (!c) return;
    if (c.state === 'suspended') { c.resume().catch(() => {}); }
    try { (CUES[name] || CUES.click)(); } catch {}
  }

  // ---- Ambient soundscape: continuous beds (wind / rain / water / fire) whose
  // volumes follow weather, biome & time, plus scheduled nature one-shots. All
  // synthesised; everything routes through one master gain that mute silences.
  let amb = null;       // { master, wind, rain, water, fire }
  let ambInfo = { weather: null, biome: null, night: false, hasUnits: false, fire: false };

  // A looping filtered-noise "bed" with its own gain we can fade.
  function makeBed(c, dest, type, freq, q = 0.7) {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0.0001;
    src.connect(f); f.connect(g); g.connect(dest);
    try { src.start(); } catch {}
    return g;
  }
  function fade(node, target, secs = 1.2) {
    try { node.gain.setTargetAtTime(Math.max(0.0001, target), ctx.currentTime, secs / 3); } catch {}
  }
  function startAmbient() {
    const c = ensureCtx(); if (!c || amb) return;
    const master = c.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(c.destination);
    amb = {
      master,
      wind:  makeBed(c, master, 'lowpass', 480, 0.5),
      rain:  makeBed(c, master, 'highpass', 1300, 0.4),
      water: makeBed(c, master, 'bandpass', 650, 1.1),
      fire:  makeBed(c, master, 'lowpass', 900, 0.6),
    };
    scheduleNature();
  }

  // Periodic, context-aware life: birds by day, crickets by night, the odd
  // rodent chitter, and thunder during storms. Self-reschedules with jitter.
  let natureTimer = null;
  function scheduleNature() {
    if (natureTimer) return;
    const loop = () => {
      natureTimer = setTimeout(loop, 2200 + Math.random() * 3800);
      if (muted || !unlocked || !amb) return;
      const i = ambInfo;
      const r = Math.random();
      if (i.weather === 'storm' && r < 0.3) { play('thunder'); return; }
      // Hamsters chitter/purr & nibble only when they feel safe and happy.
      const content = i.happy && i.hasUnits;
      if (i.night) {
        if (r < 0.55) play('cricket');
        else if (content && r < 0.8) play('purr');
      } else {
        const birdy = i.biome === 'woodland' || i.biome === 'prairie' || i.biome === 'rivers';
        if (birdy && r < 0.5) play('bird');
        else if (content && r < 0.9) { const k = Math.random(); play(k < 0.4 ? 'purr' : k < 0.7 ? 'chitter' : 'eat'); }
      }
    };
    natureTimer = setTimeout(loop, 1500);
  }

  // Called periodically by the UI with the current world conditions.
  function updateAmbient(info) {
    ambInfo = Object.assign(ambInfo, info || {});
    if (muted || !unlocked) { if (amb) for (const k of ['wind', 'rain', 'water', 'fire']) fade(amb[k], 0.0001, 0.5); return; }
    startAmbient(); if (!amb) return;
    const w = ambInfo.weather, biome = ambInfo.biome;
    const gust = 0.7 + Math.random() * 0.6; // wind gusts
    const wind = (w === 'storm' ? 0.34 : w === 'snow' ? 0.18 : w === 'fog' ? 0.10 : 0.07) * gust;
    const rain = w === 'storm' ? 0.5 : w === 'rain' ? 0.32 : 0.0001;
    const water = ['rivers', 'lakes', 'marsh', 'beach'].includes(biome) ? 0.16 : 0.0001;
    const fire = ambInfo.fire ? 0.22 : 0.0001;
    fade(amb.wind, wind, 2.2); fade(amb.rain, rain, 1.4); fade(amb.water, water, 2.5); fade(amb.fire, fire, 0.8);
  }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
    if (amb) fade(amb.master, muted ? 0.0001 : 0.85, 0.3);
    return muted;
  }
  function toggle() { return setMuted(!muted); }
  function isMuted() { return muted; }

  return { play, updateAmbient, setMuted, toggle, isMuted };
}
