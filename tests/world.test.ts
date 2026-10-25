import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferGeometry, Mesh } from 'three';
import { createWorld } from '../src/world';
import type { SurfaceFrame } from '../src/generation-contracts';

function fixture(frame = 0): SurfaceFrame {
  return { seed: 42, frame, steps: 480 + frame * 96, quality: 'low', generationMs: 12,
    positions: new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    colors: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]) };
}

test('world starts empty and presents worker buffers without generating or changing them', () => {
  const world = createWorld();
  const mesh = world.group.children[0] as Mesh<BufferGeometry>;
  assert.equal(world.group.children.length, 1);
  assert.equal(mesh.visible, false);
  assert.equal(mesh.geometry.getAttribute('position'), undefined);
  const empty = mesh.geometry;
  let disposedEmpty = 0;
  empty.addEventListener('dispose', () => disposedEmpty++);
  const frame = fixture();
  world.replaceFrame(frame);
  assert.equal(disposedEmpty, 1);
  assert.equal(mesh.visible, true);
  assert.equal(mesh.geometry.getAttribute('position').array, frame.positions);
  assert.equal(mesh.geometry.getAttribute('normal').array, frame.normals);
  assert.equal(mesh.geometry.getAttribute('color').array, frame.colors);
  assert.equal(mesh.geometry.index!.array, frame.indices);
  assert.ok(mesh.geometry.boundingSphere!.radius >= Math.sqrt(2) + Math.sqrt(3) * 0.2);
  const geometry = mesh.geometry;
  world.update(25, { intensity: 1, speed: 1, quality: 'high' });
  assert.equal(mesh.geometry, geometry, 'quality changes do not run a main-thread pipeline');
  assert.deepEqual(frame.positions, new Float32Array([-1, 0, 0, 1, 0, 0, 0, 2, 0]));
  world.dispose();
});

test('replacement and teardown dispose every geometry exactly once with no GPU cache', () => {
  const first = fixture(), next = fixture(1);
  const world = createWorld(first);
  const mesh = world.group.children[0] as Mesh<BufferGeometry>;
  const previous = mesh.geometry;
  let previousDisposals = 0, currentDisposals = 0, materialDisposals = 0;
  previous.addEventListener('dispose', () => previousDisposals++);
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  material.addEventListener('dispose', () => materialDisposals++);
  world.replaceFrame(next);
  assert.notEqual(mesh.geometry, previous);
  assert.equal(previousDisposals, 1);
  assert.equal(mesh.userData.frame, 1);
  mesh.geometry.addEventListener('dispose', () => currentDisposals++);
  world.dispose(); world.dispose(); world.replaceFrame(first);
  assert.equal(previousDisposals, 1);
  assert.equal(currentDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(world.group.children.length, 0);
  assert.equal(first.positions.length, 9, 'CPU frame survives GPU disposal for export/recovery');
});
