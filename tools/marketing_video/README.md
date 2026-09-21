# Marketing video & screenshot pipeline

Fully automated trailer production: boots the real game in headless Chromium,
plays it (founding, a staged build-boom, colony life, defense), records each
scene, renders animated hero cut-scenes, synthesizes a voiceover, generates an
ambient music bed, and cuts everything into a ~60s 720p MP4.

## One-time setup

```bash
sudo apt-get install -y ffmpeg          # assembly
pip3 install piper-tts                  # neural TTS
python3 -m piper.download_voices en_US-lessac-high --data-dir tools/marketing_video/voices
```

(`voices/` and `build/` are gitignored — the voice model is ~120 MB.)

## Produce the trailer

```bash
node tools/marketing_video/record.mjs        # → build/footage/*.webm
python3 tools/marketing_video/assemble.py    # → build/neuroster-trailer.mp4
```

`assemble.py` reads `narration.json` (script + per-scene min/max lengths),
synthesizes each line with Piper (`PIPER_MODEL` env overrides the voice path),
times every scene to its narration, and mixes narration over a generated
Am–F–C–G ambient pad.

## Produce website / store screenshots

```bash
node tools/marketing_video/screenshots.mjs   # → build/shots/*.png (1600×900)
```

Six slides: title, biome picker, town overview, colony-life close-up, Defense,
Evolve. The committed copies live in `docs/marketing/carousel/`; the website
copy that goes with them is `docs/marketing/WEBSITE_COPY.md`.

## Files

| file | role |
| --- | --- |
| `lib.mjs` | shared staging helpers (server boot, Chromium discovery, build-boom scripting) |
| `record.mjs` | records the gameplay + cut-scene footage |
| `cutscene.html` | parameterized animated hero cards (`?title=…&sub=…&variant=intro\|build\|defend\|outro`) |
| `screenshots.mjs` | carousel/store still captures |
| `narration.json` | voiceover script + scene timing bounds |
| `assemble.py` | TTS, music bed, ffmpeg assembly |

Everything is deterministic-ish but the sim is alive — re-record until you like
the take. Footage staging grants a modest resource boost and insta-finishes the
first storage depots so the boom fits on camera; everything else is the real
game playing itself.
