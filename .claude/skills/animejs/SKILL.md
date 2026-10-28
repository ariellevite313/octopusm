---
name: animejs
description: Write web animations with Anime.js v4 (animate, createTimeline, stagger, svg, text, scroll, draggable, waapi). Use when the user asks for DOM, SVG, canvas or JS-object animation with Anime.js.
---

# Anime.js v4

Source: https://github.com/juliangarnier/anime (MIT, v4.x). The repo has no skill file, so this one summarizes the v4 API as exported by `src/index.js`. Always import named functions, v4 has no default export.

```js
import { animate, createTimeline, stagger, utils, svg, text, createDraggable, onScroll, createTimer, createAnimatable, createScope, waapi } from 'animejs';
```
Install: `npm i animejs`. CDN ESM: `https://cdn.jsdelivr.net/npm/animejs/+esm`.

## Core
- `animate(targets, params)`: targets are a CSS selector, element, NodeList, array or plain object. Returns an animation with `play() pause() reverse() restart() seek(ms) revert()`.
- Params: `x y rotate scale opacity translateX ...` (CSS transforms are animated individually), any CSS property, any attribute, any object key. Values: `100`, `'50%'`, `'+=20'`, `[from, to]`, `{ from, to }`, functions `(el, i, total) => value`, keyframes as arrays of objects.
- Timing: `duration`, `delay`, `loop` (number or true), `alternate: true`, `reversed`, `autoplay`, `ease` (`'out(3)'`, `'inOut(2)'`, `'outElastic'`, `spring({...})`, `cubicBezier(...)`).
- Callbacks: `onBegin onUpdate onLoop onComplete`, and `.then()` on the animation.
- `utils.set(targets, props)` sets values at once, `utils.random(min, max, decimals)`, `utils.$('.sel')`, `utils.remove(targets)`.

## Stagger
`delay: stagger(100)`, `stagger(100, { from: 'center' | 'first' | 'last' | index, reversed: true, grid: [cols, rows], axis: 'x' })`, `stagger([0, 400])` for ranges.

## Timeline
```js
const tl = createTimeline({ defaults: { duration: 600, ease: 'out(3)' }, loop: true });
tl.add('.a', { x: 200 })
  .add('.b', { y: 100 }, '-=200')   // relative offset
  .add('.c', { opacity: [0, 1] }, 1000); // absolute time
```
Labels: `tl.label('name', time)`. Sync other animations with `tl.sync(anim)`.

## SVG
- Line drawing: `animate(svg.createDrawable('path'), { draw: ['0 0', '0 1', '1 1'] })`.
- Morph: `animate('path.a', { d: svg.morphTo('path.b') })`.
- Motion path: `const { translateX, translateY, rotate } = svg.createMotionPath('path'); animate('.dot', { translateX, translateY, rotate })`.

## Text
`const { chars, words, lines } = text.split('h1', { chars: true, words: true });` then `animate(chars, { y: [ '100%', 0 ], delay: stagger(30) })`. Call `.revert()` on the splitter to restore the DOM.

## Scroll, drag, others
- Scroll: `animate('.el', { x: 300, autoplay: onScroll({ target: '.section', enter: 'bottom top', leave: 'top bottom', sync: true }) })`.
- Draggable: `createDraggable('.box', { container: '.area', snap: 50, releaseEase: spring() })`.
- Animatable (fast, frequent updates, e.g. cursor follow): `const a = createAnimatable('.el', { x: 300, y: 300, ease: 'out(3)' }); a.x(value); a.y(value)`.
- Timer: `createTimer({ duration: 1000, loop: true, onUpdate })`.
- Scope for responsive and cleanup: `createScope({ mediaQueries: { sm: '(max-width: 640px)' } }).add(self => {...})`, `scope.revert()`.
- WAAPI (hardware accelerated, lighter): `waapi.animate('.el', { transform: 'translateX(100px)', opacity: 0.5 })`.
- Layout animations: `createLayout(root)` with `layout.record()` before a DOM change and `layout.animate(params)` after.

## Rules of thumb
- v3 syntax (`anime({ targets })`, `anime.timeline`, `easing: 'easeOutQuad'`, `direction`) is removed in v4. Use `animate(targets, { ease })` and `alternate`/`reversed`.
- Animate transforms and opacity for performance. For many elements prefer `stagger` over per-element delays in loops.
- In React or similar, create animations in an effect or `createScope`, and call `revert()` on cleanup.
- Check real examples in the repo `examples/` folder (stagger, svg-line-drawing, timeline-seamless-loop, onscroll-sticky, draggable-*, text, layout) before inventing patterns.
- For video output (MP4), drive animations by a seek-based loop with `animation.seek(ms)` per frame instead of real time.
