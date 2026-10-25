import assert from 'node:assert/strict';
import test from 'node:test';
import { extractIsosurface } from '../src/isosurface';

const bounds = { min: [-1.7, -1.4, -1.6] as [number, number, number], max: [1.4, 1.7, 1.5] as [number, number, number] };

test('sphere has finite near-radius vertices and outward unit normals/winding', () => {
  const surface = extractIsosurface((x, y, z) => 1 - Math.hypot(x, y, z), bounds, [23, 25, 27]);
  assert.ok(surface.positions instanceof Float32Array && surface.normals instanceof Float32Array);
  assert.ok(surface.positions.length > 1000 && surface.positions.length % 9 === 0);
  assert.equal(surface.positions.length, surface.normals.length);
  for (let i = 0; i < surface.positions.length; i += 3) {
    const [x, y, z] = surface.positions.subarray(i, i + 3);
    const [nx, ny, nz] = surface.normals.subarray(i, i + 3);
    assert.ok([x, y, z, nx, ny, nz].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 0.025);
    assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-5);
    assert.ok(x * nx + y * ny + z * nz > 0.98);
  }
  for (let i = 0; i < surface.positions.length; i += 9) {
    const p = surface.positions;
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    assert.ok(cx * p[i] + cy * p[i + 1] + cz * p[i + 2] > 0);
  }
});

test('samples each grid node once and returns empty data for constant fields', () => {
  for (const density of [-1, 1]) {
    let calls = 0;
    const surface = extractIsosurface(() => { calls++; return density; }, bounds, [7, 4, 9]);
    assert.equal(calls, 8 * 5 * 10);
    assert.equal(surface.positions.length, 0);
    assert.equal(surface.normals.length, 0);
  }
});

test('closed sphere has exactly two triangles at each shared edge', () => {
  const { positions } = extractIsosurface((x, y, z) => 1 - x * x - y * y - z * z, bounds, [15, 17, 19]);
  const edges = new Map<string, number>();
  const key = (i: number) => Array.from(positions.subarray(i, i + 3), n => n.toFixed(6)).join(',');
  for (let i = 0; i < positions.length; i += 9) {
    const vertices = [key(i), key(i + 3), key(i + 6)];
    for (let j = 0; j < 3; j++) {
      const edge = [vertices[j], vertices[(j + 1) % 3]].sort().join('|');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.ok(edges.size > 100);
  assert.ok([...edges.values()].every(count => count === 2));
});

test('non-divisible bounds and exact grid zeros preserve planar surface and outward normals', () => {
  const surface = extractIsosurface((x) => 0.3 - x,
    { min: [-0.7, -0.31, -0.89], max: [1.3, 0.92, 0.67] }, [10, 7, 9]);
  assert.ok(surface.positions.length > 0);
  for (let i = 0; i < surface.positions.length; i += 3) {
    assert.ok(Math.abs(surface.positions[i] - 0.3) < 1e-6);
    assert.ok(surface.normals[i] > 0.99999);
    assert.ok(Math.abs(surface.normals[i + 1]) < 1e-6 && Math.abs(surface.normals[i + 2]) < 1e-6);
  }
});

test('rejects invalid bounds, resolution and nonfinite density with RangeError', () => {
  for (const resolution of [[0, 3, 3], [2.5, 3, 3], [3, Infinity, 3], [1024, 1024, 1024]]) {
    assert.throws(() => extractIsosurface(() => 1, bounds, resolution as [number, number, number]), RangeError);
  }
  assert.throws(() => extractIsosurface(() => 1, { min: [0, 0, 0], max: [0, 1, 1] }, [2, 2, 2]), RangeError);
  assert.throws(() => extractIsosurface(() => 1, { min: [0, 0, 0], max: [1, NaN, 1] }, [2, 2, 2]), RangeError);
  assert.throws(() => extractIsosurface(() => NaN, bounds, [2, 2, 2]), RangeError);
});

test('finite extreme density magnitudes do not overflow interpolation or normals', () => {
  const surface = extractIsosurface(x => x < 0 ? 1e308 : -1e308,
    { min: [-1, -1, -1], max: [1, 1, 1] }, [3, 3, 3]);
  assert.ok(surface.positions.length > 0);
  assert.ok(surface.positions.every(Number.isFinite) && surface.normals.every(Number.isFinite));
  for (let i = 0; i < surface.normals.length; i += 3) assert.ok(surface.normals[i] > 0.99999);
});

test('thin offset slab keeps outward faces when cached gradients alias opposite sheet sides', () => {
  const { positions: p, normals } = extractIsosurface(x => 0.08 - Math.abs(x + 0.06),
    { min: [-0.4, -0.3, -0.3], max: [0.4, 0.3, 0.3] }, [4, 3, 3]);
  assert.ok(p.length > 0);
  let leftFaces = 0, rightFaces = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const crossX = ay * bz - az * by;
    // Grid samples retain one solid node at x=0; its two neighboring cells
    // must point in opposite directions even though cached gradients alias.
    const outward = p[i] < 0 ? -1 : 1;
    assert.ok(crossX * outward > 0, 'face must point from positive to negative local tetra density');
    for (let v = i; v < i + 9; v += 3) assert.ok(normals[v] * outward >= 0, 'smooth normal must share the oriented face hemisphere');
    if (outward < 0) leftFaces++; else rightFaces++;
  }
  assert.ok(leftFaces > 0 && rightFaces > 0);
});
