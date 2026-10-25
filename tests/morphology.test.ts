import assert from 'node:assert/strict';
import test from 'node:test';
import { createMorphology, simulateReactionDiffusion } from '../src/morphology';

test('Gray–Scott integrates chemicals rather than returning seeded decoration', () => {
  const initial = simulateReactionDiffusion(23, 40, 32, 0);
  const evolved = simulateReactionDiffusion(23, 40, 32, 360);
  const repeated = simulateReactionDiffusion(23, 40, 32, 360);
  assert.deepEqual(evolved.inhibitor, repeated.inhibitor);
  assert.notDeepEqual(evolved.inhibitor, initial.inhibitor);
  let difference = 0;
  for (let i = 0; i < evolved.inhibitor.length; i++) {
    assert.ok(Number.isFinite(evolved.activator[i]) && evolved.activator[i] >= 0 && evolved.activator[i] <= 1);
    assert.ok(Number.isFinite(evolved.inhibitor[i]) && evolved.inhibitor[i] >= 0 && evolved.inhibitor[i] <= 1);
    difference += Math.abs(evolved.inhibitor[i] - initial.inhibitor[i]);
  }
  assert.ok(difference > 25);
  assert.notDeepEqual(evolved.inhibitor, simulateReactionDiffusion(24, 40, 32, 360).inhibitor);
  assert.throws(() => simulateReactionDiffusion(1, 0, 40, 4), RangeError);
});

test('implicit morphology is continuous, seed-sensitive and padded on every boundary', () => {
  const a = createMorphology(42), b = createMorphology(42), c = createMorphology(43);
  let solids = 0, voids = 0, changed = 0, chemicalMin = 1, chemicalMax = 0;
  for (let z = -8; z <= 8; z += 0.9) for (let x = -10; x <= 10; x += 0.9) {
    const chemical = a.chemistry(x, z);
    chemicalMin = Math.min(chemicalMin, chemical); chemicalMax = Math.max(chemicalMax, chemical);
    assert.ok(chemical >= 0 && chemical <= 1.000001 && Number.isFinite(chemical));
    assert.equal(chemical, b.chemistry(x, z));
    assert.ok(Math.abs(chemical - a.chemistry(x + 1e-6, z)) < 0.0001);
    for (let y = 0; y <= 5; y += 0.6) {
      const density = a.density(x, y, z);
      assert.ok(Number.isFinite(density));
      if (density > 0) solids++; else voids++;
      if (Math.abs(density - c.density(x, y, z)) > 0.05) changed++;
      assert.ok(Math.abs(density - a.density(x + 1e-6, y, z)) < 0.0001);
    }
  }
  assert.ok(chemicalMax - chemicalMin > 0.3, 'chemistry has useful spatial contrast');
  assert.ok(solids > 100 && voids > solids, 'volume contains real solid sheets and pores');
  assert.ok(changed > 100, 'seeds alter the density field');
  for (let axis = 0; axis < 3; axis++) for (const side of ['min', 'max'] as const) {
    for (let u = 0; u <= 10; u++) for (let v = 0; v <= 10; v++) {
      const point: [number, number, number] = [0, 0, 0];
      point[axis] = a.bounds[side][axis];
      const axisU = (axis + 1) % 3, axisV = (axis + 2) % 3;
      point[axisU] = a.bounds.min[axisU] + (a.bounds.max[axisU] - a.bounds.min[axisU]) * u / 10;
      point[axisV] = a.bounds.min[axisV] + (a.bounds.max[axisV] - a.bounds.min[axisV]) * v / 10;
      assert.ok(a.density(...point) < 0, `boundary is empty: ${point}`);
    }
  }
});
