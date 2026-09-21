#!/usr/bin/env python3
"""assemble.py — builds the final marketing video from recorded footage.

Pipeline (run record.mjs first):
  1. Synthesize the voiceover per scene with Piper TTS (PIPER_MODEL env var
     points at a .onnx voice; default: en_US-ryan-high next to this script).
  2. Time each scene: long enough for its narration, clamped to the scene's
     min/max from narration.json, never longer than the footage (the last
     frame is cloned if footage runs short).
  3. Generate a gentle ambient music bed (numpy, no samples needed).
  4. ffmpeg: normalize every clip to 1280x720/30fps h264, fade in/out,
     concat, then mix narration + music underneath.

Output: tools/marketing_video/build/neuroster-trailer.mp4
Run:    python3 tools/marketing_video/assemble.py
"""
import json, math, os, subprocess, sys, wave

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
FOOTAGE = os.environ.get("FOOTAGE_DIR", os.path.join(BUILD, "footage"))
VO_DIR = os.path.join(BUILD, "vo")
TMP = os.path.join(BUILD, "clips")
OUT = os.environ.get("OUT_FILE", os.path.join(BUILD, "neuroster-trailer.mp4"))
MODEL = os.environ.get("PIPER_MODEL", os.path.join(HERE, "voices", "en_US-ryan-high.onnx"))
W, H, FPS = 1280, 720, 30
FADE = 0.35          # per-scene video fade in/out, seconds
VO_LEAD = 0.45       # narration starts this far into its scene

os.makedirs(VO_DIR, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.exit(f"FAILED: {' '.join(cmd[:8])}...\n{r.stderr[-2000:]}")
    return r

def duration(path):
    r = run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", path])
    return float(r.stdout.strip())

# --- 1) voiceover -----------------------------------------------------------
scenes = json.load(open(os.path.join(HERE, "narration.json")))["scenes"]
for s in scenes:
    wav = os.path.join(VO_DIR, s["id"] + ".wav")
    if not os.path.exists(wav):
        # `say` is the pronunciation-respelled text (see narration.json);
        # near-natural pace with short sentence gaps so it reads like speech.
        r = subprocess.run([sys.executable, "-m", "piper", "-m", MODEL,
                            "--length-scale", "1.02", "--sentence-silence", "0.28",
                            "-f", wav],
                           input=s.get("say", s["vo"]), capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"piper failed for {s['id']}:\n{r.stderr[-1500:]}")
    s["vo_wav"] = wav
    s["vo_dur"] = duration(wav)

# --- 2) scene timing --------------------------------------------------------
t = 0.0
for s in scenes:
    want = s["vo_dur"] + 1.3
    dur = min(max(want, s["min"]), s["max"])
    dur = max(dur, s["vo_dur"] + VO_LEAD + 0.5)   # narration must always fit
    s["dur"] = round(dur, 2)
    s["t0"] = round(t, 2)
    t += s["dur"]
TOTAL = round(t, 2)
print(f"Timeline: {TOTAL}s over {len(scenes)} scenes")
for s in scenes:
    print(f"  {s['t0']:6.2f}s  {s['id']:<16} {s['dur']:5.2f}s (vo {s['vo_dur']:.2f}s)")

# --- 3) ambient music bed (Am–F–C–G pad, soft partials) ---------------------
music = os.path.join(BUILD, "music.wav")
if not os.path.exists(music):
    import numpy as np
    SR = 44100
    n = int((TOTAL + 1.0) * SR)
    tt = np.arange(n) / SR
    A3, F3, C4, G3 = 220.0, 174.61, 261.63, 196.0
    chords = [(A3, A3 * 6/5, A3 * 3/2),   # Am
              (F3, F3 * 5/4, F3 * 3/2),   # F
              (C4, C4 * 5/4, C4 * 3/2),   # C
              (G3, G3 * 5/4, G3 * 3/2)]   # G
    BAR = 4.0                              # seconds per chord
    sig = np.zeros(n)
    for i, chord in enumerate(chords * int(math.ceil((TOTAL + 1) / (BAR * 4)))):
        a, b = int(i * BAR * SR), min(int((i + 1) * BAR * SR), n)
        if a >= n: break
        seg = tt[a:b]
        env = np.minimum(1, np.minimum((seg - seg[0]) / 0.8, (seg[-1] - seg) / 0.8 + 1e-9))
        for f in chord:
            for mult, amp in ((1, 1.0), (2, 0.28), (3, 0.10)):
                sig[a:b] += amp * env * np.sin(2 * np.pi * f * mult * seg)
    sig *= 0.9 + 0.1 * np.sin(2 * np.pi * 0.13 * tt)          # slow shimmer
    sig /= max(1e-9, np.abs(sig).max())
    fade_n = int(2.5 * SR)
    sig[-fade_n:] *= np.linspace(1, 0, fade_n)
    sig[:SR] *= np.linspace(0, 1, SR)
    pcm = (sig * 32767 * 0.85).astype(np.int16)
    with wave.open(music, "w") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes(pcm.tobytes())
    print("✓ music bed generated")

# --- 4) normalize + trim each clip, fade, then concat -----------------------
concat_list = os.path.join(TMP, "list.txt")
with open(concat_list, "w") as lst:
    for s in scenes:
        src = os.path.join(FOOTAGE, s["clip"])
        if not os.path.exists(src):
            # Externally produced takes (AI-generated, hand-edited) drop in as
            # .mp4 under the same scene name and win over a missing .webm.
            alt = os.path.splitext(src)[0] + ".mp4"
            if os.path.exists(alt): src = alt
            else: sys.exit(f"missing footage {src} — run record.mjs first")
        start = 0.3                        # skip the page-load flash
        avail = duration(src) - start
        pad = max(0.0, s["dur"] - avail)   # freeze last frame if footage is short
        clip = os.path.join(TMP, s["id"] + ".mp4")
        vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
              f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},"
              f"tpad=stop_mode=clone:stop_duration={pad + 1:.2f},"
              f"trim=duration={s['dur']:.2f},setpts=PTS-STARTPTS,"
              f"fade=t=in:st=0:d={FADE},fade=t=out:st={s['dur'] - FADE:.2f}:d={FADE}")
        run(["ffmpeg", "-y", "-ss", f"{start}", "-i", src, "-vf", vf,
             "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
             "-pix_fmt", "yuv420p", clip])
        lst.write(f"file '{clip}'\n")
        print(f"✓ clip {s['id']} ({s['dur']}s)")

silent = os.path.join(TMP, "video.mp4")
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
     "-c", "copy", silent])

# --- 5) mix narration onto the bed, mux, done -------------------------------
inputs, filters, labels = ["-i", silent, "-i", music], [], []
for i, s in enumerate(scenes):
    inputs += ["-i", s["vo_wav"]]
    delay = int((s["t0"] + VO_LEAD) * 1000)
    filters.append(f"[{i + 2}:a]adelay={delay}|{delay},volume=1.0[v{i}]")
    labels.append(f"[v{i}]")
filters.append(f"[1:a]volume=0.14[bed]")
filters.append(f"[bed]{''.join(labels)}amix=inputs={len(scenes) + 1}:"
               f"normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filters),
     "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
     "-c:a", "aac", "-b:a", "160k", "-t", f"{TOTAL}", OUT])
size = os.path.getsize(OUT) / 1e6
print(f"\n✅ {OUT} — {TOTAL}s, {size:.1f} MB")
