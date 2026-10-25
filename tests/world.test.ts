import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, Mesh, TubeGeometry } from 'three';
import { createWorld, seededRandom, voronoiCell } from '../src/world';

test('seed streams repeat and differ across seeds', () => {
  const a = seededRandom(42), b = seededRandom(42), c = seededRandom(43);
  const av = Array.from({ length: 10 }, a);
  assert.deepEqual(av, Array.from({ length: 10 }, b));
  assert.notDeepEqual(av, Array.from({ length: 10 }, c));
  assert.ok(av.every(value => value >= 0 && value < 1));
});

test('Voronoi clips the nearest-site halfplane exactly', () => {
  const polygon = voronoiCell([-1, 0], [[-1, 0], [1, 0]], 3);
  assert.equal(polygon.length, 4);
  assert.ok(polygon.every(([x, z]) => x <= 0 && x >= -3 && Math.abs(z) <= 3));
  assert.ok(polygon.some(([x]) => x === 0));
});

test('membrane remains on the western side of the rendered coastline in world coordinates', () => {
  for (const seed of [7, 42, 43]) {
    const world = createWorld(seed);
    try {
      const membrane = world.group.getObjectByName('Clipped Voronoi membrane') as Mesh;
      const bank = world.group.children.find(object => object instanceof Mesh
        && object.geometry instanceof TubeGeometry && object.geometry.parameters.radius === 0.55) as Mesh<TubeGeometry>;
      const coast = bank.geometry.parameters.path;
      const positions = membrane.geometry.getAttribute('position');
      let northSamples = 0, southSamples = 0;
      for (let i = 0; i < positions.count; i++) {
        const z = positions.getZ(i);
        if (Math.abs(z) > 8.8) continue; // Exclude cells beyond the ribbon's end caps.
        // Coast curve spans z=-9..9; compare against actual rendered geometry,
        // allowing local cell extent and bevel near the site-selection boundary.
        const shore = coast.getPoint((z + 9) / 18);
        assert.ok(positions.getX(i) <= shore.x + 0.8,
          `seed ${seed}: membrane crosses the coastline at world z=${z}`);
        if (z > 2) northSamples++;
        if (z < -2) southSamples++;
      }
      assert.ok(northSamples > 0 && southSamples > 0);
    } finally {
      world.dispose();
    }
  }
});

test('world geometry is deterministic, finite, bounded and seed-sensitive', () => {
  const a = createWorld(42), b = createWorld(42), c = createWorld(43);
  const positions = (world: ReturnType<typeof createWorld>) => {
    const mesh = world.group.getObjectByName('Clipped Voronoi membrane') as Mesh;
    return Array.from(mesh.geometry.getAttribute('position').array);
  };
  const av = positions(a);
  assert.deepEqual(av, positions(b));
  assert.notDeepEqual(av, positions(c));
  assert.ok(av.every(Number.isFinite));
  const bounds = new Box3().setFromObject(a.group);
  assert.ok(bounds.min.x > -15 && bounds.max.x < 15);
  assert.ok(bounds.min.y > -2 && bounds.max.y < 7);
  a.update(10, { intensity: 1, speed: 1, quality: 'low' });
  assert.equal(a.group.getObjectByName('Microgeometry')?.visible, false);
  a.update(Number.NaN, { intensity: Number.NaN, speed: 1, quality: 'high' });
  assert.ok(new Box3().setFromObject(a.group).max.toArray().every(Number.isFinite));
  a.dispose(); a.dispose(); b.dispose(); c.dispose();
  assert.equal(a.group.children.length, 0);
});
