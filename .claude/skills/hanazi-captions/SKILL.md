---
name: hanazi-captions
description: Make a 10-second vertical motion-design film in the Chinese variety-show "hanazi" kinetic caption style (multi-layer stroked rounded text, spring pop-ins, burst frames, sweat drops, sparkles, synced sound effects). Use when the user asks for hanazi, variety-show captions or a captioned pet or vlog style video.
---

# Hanazi (variety show kinetic captions)

Source: https://github.com/Vincentwei1021/mg-styles-15, file `prompts/18-hanazi.md` (MIT, kept in `PROMPT.md` in this folder).

## How to use

1. Read `PROMPT.md`. The block under "提示词" is the full production brief: output spec (1080x1920, 30 fps, 10 s, H.264 + AAC, -14 LUFS), the style's signature features, the working method (treatment, key frames, motion, sound, final checks) and the self-critique.
2. Follow that brief as written. Change the "Creative seed" (story, copy, brand names, colours) to the user's content, and keep the "Signature features" section untouched.
3. Work outside the repository (scratch directory). Needs Node.js, Chrome or Chromium and ffmpeg. Render frame by frame from a deterministic page, encode with ffmpeg, and check duration, resolution, fps and loudness.
4. Use only CC0, public domain, OFL or free-for-commercial assets, record them in `CREDITS.md`, and invent brand names.
5. Deliver `video.mp4` and the short report the brief asks for.
