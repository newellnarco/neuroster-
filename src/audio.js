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
  };

  function play(name) {
    if (muted || !unlocked) return;
    const c = ensureCtx(); if (!c) return;
    if (c.state === 'suspended') { c.resume().catch(() => {}); }
    try { (CUES[name] || CUES.click)(); } catch {}
  }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
    return muted;
  }
  function toggle() { return setMuted(!muted); }
  function isMuted() { return muted; }

  return { play, setMuted, toggle, isMuted };
}
