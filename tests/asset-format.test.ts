import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFrame, encodeFrame, MGE_HEADER_BYTES, MGE_MAX_BYTES } from '../src/asset-format';
import type { SurfaceFrame } from '../src/generation-contracts';

function fixture(): SurfaceFrame {
  const normal = [0.31, -0.72, 0.62];
  const length = Math.hypot(...normal);
  return {
    seed: 321, quality: 'high', frame: 5, steps: 960, generationMs: 123.75,
    positions: new Float32Array([-12, -0.3, 2, 8.2, 6, -9, 0.123456, 1.734, 5, -3.17, 2.711, -4]),
    normals: new Float32Array([1, 0, 0, 0, -1, 0, 0, 0, 1, ...normal.map(value => value / length)]),
    colors: new Float32Array([0, 0.1234, 1, 0.7, 0.8, 0.9, 0.14, 0.32, 0.67, 1, 0.5, 0.9]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
  };
}

test('MGE2 deterministically roundtrips metadata, quantized positions, normals, colors and indices', () => {
  const source = fixture(), bytes = encodeFrame(source), result = decodeFrame(bytes);
  assert.deepEqual(new Uint8Array(bytes), new Uint8Array(encodeFrame(source)));
  for (const key of ['seed', 'quality', 'frame', 'steps', 'generationMs'] as const) assert.equal(result[key], source[key]);
  assert.deepEqual(result.indices, source.indices);
  for (let axis = 0; axis < 3; axis++) {
    const values = Array.from(source.positions).filter((_, i) => i % 3 === axis);
    const bound = (Math.max(...values) - Math.min(...values)) / 65535 / 2 + 1e-6;
    for (let i = axis; i < source.positions.length; i += 3) assert.ok(Math.abs(source.positions[i] - result.positions[i]) <= bound);
  }
  for (let i = 0; i < source.colors.length; i++) assert.ok(Math.abs(source.colors[i] - result.colors[i]) <= 1 / 255);
  for (let i = 0; i < source.normals.length; i += 3) {
    const a = source.normals.slice(i, i + 3), b = result.normals.slice(i, i + 3);
    assert.ok(Math.abs(Math.hypot(...b) - 1) < 1e-7);
    const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
    assert.ok(cross < 0.00005, 'normal angular error is below 0.003 degrees');
    assert.ok(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0);
  }
  assert.equal(bytes.byteLength, MGE_HEADER_BYTES + 4 * 15 + 6 * 4);
});

test('constant axes and negative unit normals roundtrip without zero-range division', () => {
  const source = fixture();
  for (let i = 2; i < source.positions.length; i += 3) source.positions[i] = 4;
  source.normals.fill(0);
  for (let i = 0; i < source.normals.length; i += 3) source.normals[i] = -1;
  source.quality = 'low'; source.frame = 0; source.steps = 480;
  const result = decodeFrame(encodeFrame(source));
  assert.ok(Array.from(result.positions).every((value, i) => i % 3 !== 2 || value === 4));
  assert.deepEqual(result.normals, source.normals);
  assert.equal(result.quality, 'low');
});

test('encoder rejects invalid metadata, lengths, coordinates, colors, normals and indices', () => {
  const mutations: ((frame: SurfaceFrame) => void)[] = [
    frame => { frame.seed = Number.NaN; }, frame => { frame.seed = 1.5; },
    frame => { frame.seed = -1; }, frame => { frame.seed = 2 ** 32; },
    frame => { frame.frame = 12; }, frame => { frame.steps = 480; },
    frame => { frame.generationMs = Infinity; }, frame => { frame.generationMs = -1; },
    frame => { frame.normals = new Float32Array(3); },
    frame => { frame.positions[0] = Infinity; }, frame => { frame.colors[0] = 1.01; },
    frame => { frame.colors[0] = Number.NaN; }, frame => { frame.normals.fill(0); },
    frame => { frame.normals[0] = 2; }, frame => { frame.indices[0] = 4; },
    frame => { frame.indices = new Uint32Array([0, 1]); },
  ];
  for (const mutate of mutations) { const source = fixture(); mutate(source); assert.throws(() => encodeFrame(source), RangeError); }
});

test('decoder rejects malformed headers and dangerous counts before decoded allocations', () => {
  const source = encodeFrame(fixture());
  assert.throws(() => decodeFrame(source.slice(0, 95)), RangeError);
  assert.throws(() => decodeFrame(source.slice(0, source.byteLength - 1)), RangeError);
  const appended = new ArrayBuffer(source.byteLength + 1);
  new Uint8Array(appended).set(new Uint8Array(source));
  assert.throws(() => decodeFrame(appended), RangeError);
  assert.throws(() => decodeFrame(new ArrayBuffer(MGE_MAX_BYTES + 1)), RangeError);
  const mutations: ((view: DataView) => void)[] = [
    view => view.setUint8(0, 0), view => view.setUint16(4, 2, true),
    view => view.setUint16(6, 65535, true), view => view.setUint32(8, 4, true),
    view => view.setUint32(12, 0xffffffff, true), view => view.setUint32(16, 0xffffffff, true),
    view => view.setFloat64(20, Number.NaN, true), view => view.setFloat64(20, -1, true),
    view => view.setFloat64(20, 2 ** 32, true), view => view.setUint32(28, 12, true),
    view => view.setUint32(32, 480, true), view => view.setUint32(36, 9, true),
    view => view.setFloat64(40, Infinity, true), view => view.setFloat64(48, Number.NaN, true),
    view => view.setFloat64(48, 100, true), view => view.setFloat64(72, 1e300, true),
  ];
  for (const mutate of mutations) { const copy = source.slice(0); mutate(new DataView(copy)); assert.throws(() => decodeFrame(copy), RangeError); }
});

test('decoder rejects malformed packed normals and triangle indices', () => {
  const source = encodeFrame(fixture()), vertices = 4;
  const normalOffset = MGE_HEADER_BYTES + vertices * 6;
  const indexOffset = MGE_HEADER_BYTES + vertices * 15;
  for (const packed of [[0, 0, 0], [-32768, 0, 0], [32767, 32767, 32767]]) {
    const copy = source.slice(0), view = new DataView(copy);
    packed.forEach((value, axis) => view.setInt16(normalOffset + axis * 2, value, true));
    assert.throws(() => decodeFrame(copy), RangeError);
  }
  const badIndex = source.slice(0);
  new DataView(badIndex).setUint32(indexOffset, vertices, true);
  assert.throws(() => decodeFrame(badIndex), RangeError);
});
