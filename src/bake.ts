import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMorphology } from './morphology';
import { extractIsosurface } from './isosurface';
import { FRAME_COUNT, STEPS_PER_FRAME, WARMUP_STEPS, type FrameRequest, type GenerationStatus, type SurfaceFrame } from './generation-contracts';

export function validateFrameRequest(request: FrameRequest): void {
  if (!request || !Number.isInteger(request.seed) || request.seed < 0 || request.seed > 0xffffffff
    || (request.quality !== 'low' && request.quality !== 'high')
    || !Number.isInteger(request.frame) || request.frame < 0 || request.frame >= FRAME_COUNT) {
    throw new RangeError('Frame requires a uint32 seed, low/high quality and an integer timeline frame in [0, 11].');
  }
}

/** CPU-only baking entry point. Production invokes this exclusively in a module worker. */
export function buildFrame(request: FrameRequest, onProgress?: (status: GenerationStatus) => void): SurfaceFrame {
  validateFrameRequest(request);
  const started = performance.now();
  const steps = WARMUP_STEPS + request.frame * STEPS_PER_FRAME;
  const progress = (message: string, value: number) => onProgress?.({ state: 'loading', message, progress: value });
  progress('Chemische Simulation wird integriert …', 0);
  const field = createMorphology(request.seed, steps);
  progress('Chemischer Zustand integriert · Oberfläche wird abgetastet …', 0.3);
  const resolution: [number, number, number] = request.quality === 'high' ? [144, 56, 120] : [96, 40, 80];
  const surface = extractIsosurface(field.density, field.bounds, resolution);
  progress('Oberfläche extrahiert · Materialfelder werden gebacken …', 0.65);
  const geometry = new BufferGeometry();
  let indexed: BufferGeometry | undefined;
  try {
    geometry.setAttribute('position', new Float32BufferAttribute(surface.positions, 3));
    const colors = new Float32Array(surface.positions.length);
    const teal = new Color(0x138e7c), light = new Color(0x71cbb0), gold = new Color(0xc99c42), deep = new Color(0x1d3657);
    const color = new Color();
    for (let i = 0; i < surface.positions.length; i += 3) {
      const x = surface.positions[i], y = surface.positions[i + 1], z = surface.positions[i + 2];
      const chemical = field.chemistry(x, z);
      const ridge = Math.max(0, 1 - Math.abs(chemical - 0.48) * 7);
      color.copy(deep).lerp(teal, Math.min(1, 0.3 + chemical));
      color.lerp(light, Math.max(0, Math.min(0.6, y * 0.08)));
      color.lerp(gold, ridge * 0.82);
      colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    progress('Materialfelder gebacken · Netz wird verschweißt …', 0.78);
    indexed = mergeVertices(geometry, 0.00001);
    progress('Netz verschweißt · Geometrische Normalen werden berechnet …', 0.92);
    indexed.computeVertexNormals();
    const frame: SurfaceFrame = {
      ...request, steps,
      positions: new Float32Array(indexed.getAttribute('position').array),
      normals: new Float32Array(indexed.getAttribute('normal').array),
      colors: new Float32Array(indexed.getAttribute('color').array),
      indices: new Uint32Array(indexed.getIndex()!.array),
      generationMs: performance.now() - started,
    };
    onProgress?.({ state: 'ready', message: 'Simulierter Zustand bereit.', progress: 1 });
    return frame;
  } finally {
    geometry.dispose();
    indexed?.dispose();
  }
}
