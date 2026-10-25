import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFrame } from '../src/bake';
import { STEPS_PER_FRAME, WARMUP_STEPS } from '../src/generation-contracts';

test('pure worker bake produces deterministic indexed low-resolution chemical state', () => {
  const statuses: number[] = [];
  const request = { seed: 42, quality: 'low' as const, frame: 1 };
  const a = buildFrame(request, s => statuses.push(s.progress));
  const b = buildFrame(request);
  assert.equal(a.steps, WARMUP_STEPS + STEPS_PER_FRAME);
  assert.ok(a.generationMs > 0 && Number.isFinite(a.generationMs));
  assert.ok(a.positions.length > 1000 && a.positions.length % 3 === 0);
  assert.equal(a.positions.length, a.normals.length);
  assert.equal(a.positions.length, a.colors.length);
  assert.ok(a.indices.length > 1000 && a.indices.length % 3 === 0);
  assert.ok(a.positions.every(Number.isFinite) && a.normals.every(Number.isFinite) && a.colors.every(Number.isFinite));
  assert.ok(a.indices.every(index => index < a.positions.length / 3));
  assert.deepEqual(a.positions, b.positions);
  assert.deepEqual(a.normals, b.normals);
  assert.deepEqual(a.colors, b.colors);
  assert.deepEqual(a.indices, b.indices);
  assert.equal(statuses[0], 0); assert.equal(statuses.at(-1), 1);
  assert.ok(statuses.every((value, index) => index === 0 || value >= statuses[index - 1]));
});

test('bake rejects invalid frame requests before expensive allocation', () => {
  for (const request of [{ seed: NaN, quality: 'low', frame: 0 }, { seed: 0, quality: 'invalid', frame: 0 }, { seed: 0, quality: 'low', frame: -1 }]) {
    assert.throws(() => buildFrame(request as Parameters<typeof buildFrame>[0]), RangeError);
  }
});
