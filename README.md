# Morphogenesis Engine

A dependency-free, browser-based generative art prototype. The Living Canvas renders a small 3D micro-landscape in WebGL 2, with animated Voronoi cells, luminous coastlines, procedural coral, floating toroidal organisms, and bioluminescent particles. Render resolution adapts to measured frame rate, lowering detail when the scene falls below its performance threshold and recovering resolution when performance allows.

## Run

Open `index.html` in a WebGL 2-capable browser, or serve the repository directory:

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. No install, build, external assets, or network connection is required.

## Interaction

- Drag to orbit; use the wheel or trackpad to zoom.
- Use the stage selector to preview MVP, Enhanced, and Advanced visual detail.
- Pause or resume with the button or Space; press `1`, `2`, or `3` to select a stage.
- Use Reset view to restore the initial camera; the fullscreen button expands the canvas.

## Progressive releases

| Release | Canvas implementation | Next release gate |
| --- | --- | --- |
| V1 · Living Canvas | Interactive, animated 3D terrain with a recognizable cellular composition | Preserve the scene and add stable baked assets |
| V2 · Morphogenesis System | UI preview for interpolated morphogenesis detail | Deterministic loops, documented VAT/manifest format, and validation |
| V3 · Hypercomplex Ecosystem | UI preview for dense details and richer motion | Adaptive quality and profiling on defined reference hardware |

V2/V3 controls currently tune the real-time procedural preview; they do not claim to bake VATs, use WebGPU, or provide hardware-validated performance. Those are follow-on release gates rather than simulated capabilities.

## Agent contracts and workflow

Keep the first playable scene independent from later experiments. Before parallel work begins, agree on a versioned `world.json` contract (world units, stable object IDs, coordinate system, global time, and seed), and define fixed topology and frame layout before producing VATs. Branches or worktrees should deliver small changes against those contracts; integrate only changes that build, validate, and preserve the previous release gate.

Suggested ownership: geometry and coordinate contracts; animation and global-time behavior; materials; baking and manifest validation; rendering and fallback behavior; performance measurements and budgets; orchestration and integration. Prioritize composition and a working scene before offline simulation and advanced GPU optimization.
