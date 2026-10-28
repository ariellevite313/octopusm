---
name: gltf-transform
description: Inspect, validate, optimize and compress glTF/GLB 3D models with glTF Transform (CLI and scripting API). Use when the user has a .glb/.gltf file to shrink, fix, convert, simplify, compress textures or inspect.
---

# glTF Transform

Source: https://github.com/donmccurdy/glTF-Transform (MIT, v4.x). The repo has no skill file, so this one summarizes the CLI (`packages/cli/src/cli.ts`) and the scripting API. Run `npx @gltf-transform/cli <command> --help` for exact options before relying on a flag.

Install: `npm i -g @gltf-transform/cli` (binary `gltf-transform`), or use `npx @gltf-transform/cli`. Scripting: `npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions`.

## Typical workflow
1. `gltf-transform inspect model.glb` : scenes, meshes, materials, textures, sizes. Add `--format csv|md` for other output.
2. `gltf-transform validate model.glb` : check against the glTF spec.
3. `gltf-transform optimize in.glb out.glb` : one-shot optimization (the default for web delivery).
4. Re-inspect, then open the result in a viewer (`gltf-transform` has a `view`-style package, or any glTF viewer) to check it visually.

Never overwrite the original file; always write to a new output path.

## optimize
`gltf-transform optimize <input> <output> [options]` combines dedup, prune, flatten, join, weld, simplify, resample, texture resize/compression and geometry compression.
- `--compress draco|meshopt|quantize|false` (default meshopt). Draco and Meshopt need the matching decoder in the viewer.
- `--texture-compress ktx2|webp|avif|auto|false` (default auto, recompress in the original format). KTX2 saves VRAM, WebP/AVIF save download size.
- `--texture-size <px>` max texture dimension (default 2048).
- `--simplify <bool>`, `--simplify-ratio <0-1>`, `--simplify-error <fraction>`, `--simplify-lock-border <bool>` (simplify needs weld).
- `--flatten`, `--join`, `--join-meshes`, `--join-named`, `--weld`, `--resample`, `--instance`, `--palette`, `--prune`, `--prune-attributes` (each takes a boolean).
- Example: `gltf-transform optimize in.glb out.glb --compress draco --texture-compress webp --texture-size 1024`.

## Individual commands
Structure: `copy` `merge` `partition` `dedup` `prune` `flatten` `join` `instance` `center` `reorder` `sparse` `gzip` `xmp`.
Geometry: `draco` `meshopt` `quantize` `dequantize` `weld` `unweld` `simplify` `tangents` `unwrap`.
Materials and textures: `metalrough` (spec/gloss to metal/rough) `unlit` `palette` `resize` `etc1s` `uastc` `avif` `webp` `png` `jpeg`.
Animation: `resample` `sequence`.
Most take `<input> <output>`. KTX2 commands (`etc1s`, `uastc`) need the KTX-Software `toktx` binary installed. Texture filters: `--pattern <glob>`, `--slots <glob>` (for example `--slots "baseColorTexture"`).

## Scripting API
```js
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, draco } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read('in.glb');
await doc.transform(
  dedup(), prune(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.001 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  draco(),
);
await io.write('out.glb', doc);
```
Other exports in `@gltf-transform/functions`: `center`, `flatten`, `join`, `instance`, `quantize`, `meshopt`, `resample`, `sparse`, `tangents`, `unlit`, `metalRough`, `getBounds`, `inspect`. Use `doc.getRoot().listMeshes()` / `listMaterials()` / `listTextures()` to read the model, and `doc.createXxx()` to build one.

## Tips
- Order matters: dedup, prune, flatten, join, weld, simplify, then compression last.
- Simplification changes the look: check visually and keep the ratio conservative for hero assets.
- For three.js or Babylon delivery, make sure the loader has DRACOLoader, MeshoptDecoder or KTX2Loader configured for the chosen compression.
- Large models: run with `NODE_OPTIONS=--max-old-space-size=8192`.
