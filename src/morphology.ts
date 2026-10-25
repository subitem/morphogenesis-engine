import type { MorphologyField } from './field-contracts';

interface ChemicalGrid {
  width: number;
  height: number;
  activator: Float32Array;
  inhibitor: Float32Array;
}

function randomStream(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothIntersection(a: number, b: number, k: number): number {
  const h = Math.max(0, k - Math.abs(a - b)) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Explicit Gray–Scott integration with periodic boundaries and a nine-point Laplacian.
 * A is consumed by A*B²; B grows through the same reaction and decays through feed+kill.
 * dt=1, Da=1, Db=.5 with this Laplacian keeps diffusion stable.
 */
export function simulateReactionDiffusion(seed: number, width = 112, height = 96, steps = 480): ChemicalGrid {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8 || width > 512 || height > 512) throw new RangeError('Grid dimensions must be integers in [8, 512].');
  if (!Number.isInteger(steps) || steps < 0 || steps > 10000) throw new RangeError('Integration steps must be an integer in [0, 10000].');
  const random = randomStream(seed);
  const count = width * height;
  let a = new Float32Array(count).fill(1), b = new Float32Array(count);
  let nextA = new Float32Array(count), nextB = new Float32Array(count);
  // Chemical perturbations seed the PDE; no geometry primitives are placed.
  const patches = 28;
  for (let patch = 0; patch < patches; patch++) {
    const cx = random() * width, cz = random() * height;
    const radius = 2.2 + random() * Math.min(width, height) * 0.035;
    for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if ((x - cx) ** 2 + (z - cz) ** 2 > radius ** 2) continue;
      const i = ((z + height) % height) * width + (x + width) % width;
      a[i] = 0.45 + random() * 0.08;
      b[i] = 0.22 + random() * 0.08;
    }
  }
  const west = new Int32Array(width), east = new Int32Array(width);
  const north = new Int32Array(height), south = new Int32Array(height);
  for (let x = 0; x < width; x++) { west[x] = (x + width - 1) % width; east[x] = (x + 1) % width; }
  for (let z = 0; z < height; z++) { north[z] = ((z + height - 1) % height) * width; south[z] = ((z + 1) % height) * width; }
  const feed = new Float32Array(count);
  const phase = random() * Math.PI * 2;
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    feed[z * width + x] = 0.034 + 0.004 * Math.sin(x / width * Math.PI * 2 + phase) * Math.cos(z / height * Math.PI * 2);
  }
  for (let step = 0; step < steps; step++) {
    for (let z = 0; z < height; z++) {
      const row = z * width, up = north[z], down = south[z];
      for (let x = 0; x < width; x++) {
        const i = row + x, left = west[x], right = east[x];
        const lapA = -a[i] + 0.2 * (a[row + left] + a[row + right] + a[up + x] + a[down + x]) + 0.05 * (a[up + left] + a[up + right] + a[down + left] + a[down + right]);
        const lapB = -b[i] + 0.2 * (b[row + left] + b[row + right] + b[up + x] + b[down + x]) + 0.05 * (b[up + left] + b[up + right] + b[down + left] + b[down + right]);
        const reaction = a[i] * b[i] * b[i];
        nextA[i] = Math.max(0, Math.min(1, a[i] + lapA - reaction + feed[i] * (1 - a[i])));
        nextB[i] = Math.max(0, Math.min(1, b[i] + 0.5 * lapB + reaction - (0.061 + feed[i]) * b[i]));
      }
    }
    [a, nextA] = [nextA, a];
    [b, nextB] = [nextB, b];
  }
  return { width, height, activator: a, inhibitor: b };
}

/** Continuous implicit reef: chemistry modulates a warped, thickened gyroid membrane.
 * Pores and connected branching sheets are zero sets of the field itself, rather than
 * collections of decorative rings, spheres or cylinders. This is mathematical
 * generative geometry, not a claim of a biological or fluid simulation.
 */
export function createMorphology(seed: number, steps = 480): MorphologyField {
  const grid = simulateReactionDiffusion(seed, 112, 96, steps);
  const random = randomStream(seed ^ 0x53c5a3);
  const p = Array.from({ length: 8 }, () => random() * Math.PI * 2);
  let maxConcentration = 0;
  for (const value of grid.inhibitor) maxConcentration = Math.max(maxConcentration, value);
  const inverseRange = 1 / Math.max(0.05, maxConcentration);
  const chemistry = (x: number, z: number) => {
    // Clamped, bilinear sampling preserves continuity at cell and domain boundaries.
    const u = Math.max(0, Math.min(grid.width - 1.000001, (x + 12) / 24 * (grid.width - 1)));
    const v = Math.max(0, Math.min(grid.height - 1.000001, (z + 10) / 20 * (grid.height - 1)));
    const ix = Math.floor(u), iz = Math.floor(v), tx = u - ix, tz = v - iz;
    const index = iz * grid.width + ix;
    const top = grid.inhibitor[index] * (1 - tx) + grid.inhibitor[index + 1] * tx;
    const bottom = grid.inhibitor[index + grid.width] * (1 - tx) + grid.inhibitor[index + grid.width + 1] * tx;
    return (top * (1 - tz) + bottom * tz) * inverseRange;
  };
  return {
    bounds: { min: [-12, -1.5, -10], max: [12, 7, 10] },
    chemistry,
    density(x: number, y: number, z: number): number {
      const chemical = chemistry(x, z);
      const nx = x + 0.62 * Math.sin(z * 0.47 + p[0]) + 0.35 * Math.sin(y * 0.83 + p[1]);
      const nz = z + 0.65 * Math.sin(x * 0.41 + p[2]) + 0.3 * Math.sin(y * 0.77 + p[3]);
      const ny = y + 0.34 * Math.sin(x * 0.57 + z * 0.43 + p[4]);
      const frequency = 1.76;
      const gx = nx * frequency, gy = ny * frequency, gz = nz * frequency;
      const gyroid = Math.sin(gx) * Math.cos(gy) + Math.sin(gy) * Math.cos(gz) + Math.sin(gz) * Math.cos(gx);
      const fine = Math.sin(gx * 2.07 + p[5]) * Math.cos(gy * 1.93) * Math.sin(gz * 2.11 + p[6]);
      const membrane = (0.25 + 0.23 * chemical - Math.abs(gyroid + 0.13 * fine)) / frequency;
      // Irregular tapered support avoids a cuboid or constant-height gyroid brick.
      const radial = Math.sqrt((x / 10.8) ** 2 + (z / 8.7) ** 2);
      const edge = (1 - radial) * 5 + 0.25 * Math.sin(x * 0.62 + z * 0.39 + p[7]);
      const hill = 2.1 + 2.0 * chemical + 0.7 * Math.sin(x * 0.32 + p[1]) * Math.cos(z * 0.38 + p[2]);
      const top = hill * Math.max(0, Math.min(1, (1.1 - radial) * 3)) - y;
      const bottom = y + 0.25 + 0.12 * Math.sin(x * 0.4 + z * 0.6);
      // Smooth intersection rounds the silhouette and closes sheets at their caps.
      return smoothIntersection(smoothIntersection(membrane, edge, 0.18), smoothIntersection(top, bottom, 0.3), 0.15);
    },
  };
}
