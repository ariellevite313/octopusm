---
name: clawd-animation
description: Make short hand-painted cartoon animations (MP4) of a character in p5.js and p5.brush, with storyboard, shot-by-shot build and contact-sheet checks. Use when the user asks for an animated video, a character animation, a mascot cartoon or an animated scene.
---

# Clawd animation kit

Source: https://github.com/JohnHeibel/ClaudeAnimationBase (MIT, copy in this folder, commit 0ac8bf2).

## How to use

1. Read `ANIMATION_GUIDE.md` in this folder completely before drawing anything. It holds the rules, the workflow and the API.
2. Work in a copy of this folder outside the repository (for example a scratch directory): `npm install`, then write the scene in `src/scenes/`, check it with contact sheets (`node render.mjs --sheet=...`) and render with `node render.mjs --clip --out=out/video.mp4`.
3. Needs Node.js, Google Chrome (or Chromium) and ffmpeg. Without a GPU add `--soft-gl` and avoid watercolour fills.
4. The person prompting decides what the video is about. The guide decides how it is made.

Do not run `npm install` or the renderer inside the repository itself.
