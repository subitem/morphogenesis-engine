import type { DensityField, SurfaceData } from './field-contracts';

type Triple = [number, number, number];
type Vertex = [number, number, number, number, number, number];
const CORNERS: Triple[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
// All cubes use the same body diagonal and compatible face diagonals.
const TETRAHEDRA = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];

/** Resolution specifies cell counts; the inclusive sampling grid has N+1 nodes. */
export function extractIsosurface(
  field: DensityField,
  bounds: { min: Triple; max: Triple },
  resolution: Triple,
): SurfaceData {
  const [rx, ry, rz] = resolution;
  if (resolution.length !== 3 || !resolution.every(n => Number.isInteger(n) && n >= 1 && n <= 1024)) {
    throw new RangeError('Isosurface resolution must contain three positive integer cell counts (maximum 1024).');
  }
  const count = (rx + 1) * (ry + 1) * (rz + 1);
  if (count > 8_000_000) throw new RangeError('Isosurface grid exceeds eight million nodes.');
  if (bounds.min.length !== 3 || bounds.max.length !== 3 || !bounds.min.every((n, axis) =>
    Number.isFinite(n) && Number.isFinite(bounds.max[axis]) && bounds.max[axis] > n
    && Number.isFinite(bounds.max[axis] - n) && Math.max(Math.abs(n), Math.abs(bounds.max[axis])) < 3.4e38)) {
    throw new RangeError('Isosurface bounds must be finite, ordered and representable as Float32 coordinates.');
  }
  const [minX, minY, minZ] = bounds.min;
  const dx = (bounds.max[0] - minX) / rx, dy = (bounds.max[1] - minY) / ry, dz = (bounds.max[2] - minZ) / rz;
  if (![dx, dy, dz].every(step => Number.isFinite(step) && step > 0)) {
    throw new RangeError('Isosurface grid spacing is not numerically representable.');
  }
  const sx = rx + 1, sy = ry + 1, plane = sx * sy;
  const values = new Float64Array(count);
  const gx = new Float64Array(count), gy = new Float64Array(count), gz = new Float64Array(count);
  const index = (x: number, y: number, z: number) => x + sx * y + plane * z;
  let densityScale = 0;
  for (let z = 0; z <= rz; z++) for (let y = 0; y <= ry; y++) for (let x = 0; x <= rx; x++) {
    const value = field(minX + x * dx, minY + y * dy, minZ + z * dz);
    if (!Number.isFinite(value)) throw new RangeError('Density field returned a nonfinite sample.');
    values[index(x, y, z)] = value;
    densityScale = Math.max(densityScale, Math.abs(value));
  }
  // Uniform positive scaling preserves zero crossings and avoids gradient overflow.
  if (densityScale > 0) for (let i = 0; i < count; i++) values[i] /= densityScale;
  const gradientScale = Math.min(dx, dy, dz);
  // Outward normals point toward decreasing density. Boundaries use one-sided differences.
  for (let z = 0; z <= rz; z++) for (let y = 0; y <= ry; y++) for (let x = 0; x <= rx; x++) {
    const i = index(x, y, z);
    const x0 = Math.max(0, x - 1), x1 = Math.min(rx, x + 1);
    const y0 = Math.max(0, y - 1), y1 = Math.min(ry, y + 1);
    const z0 = Math.max(0, z - 1), z1 = Math.min(rz, z + 1);
    gx[i] = -(values[index(x1, y, z)] - values[index(x0, y, z)]) * (gradientScale / ((x1 - x0) * dx));
    gy[i] = -(values[index(x, y1, z)] - values[index(x, y0, z)]) * (gradientScale / ((y1 - y0) * dy));
    gz[i] = -(values[index(x, y, z1)] - values[index(x, y, z0)]) * (gradientScale / ((z1 - z0) * dz));
  }

  let positions = new Float32Array(196_608), normals = new Float32Array(196_608), used = 0;
  const ids = new Int32Array(8);
  const densities = new Float64Array(8);
  const inside = new Int8Array(4), outside = new Int8Array(4);
  const vertices: Vertex[] = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0, 0]);
  let cellX = 0, cellY = 0, cellZ = 0;
  let outwardX = 0, outwardY = 0, outwardZ = 0;

  function crossing(a: number, b: number, out: Vertex): void {
    const u = densities[a] / (densities[a] - densities[b]);
    const ca = CORNERS[a], cb = CORNERS[b];
    const x = ca[0] + (cb[0] - ca[0]) * u;
    const y = ca[1] + (cb[1] - ca[1]) * u;
    const z = ca[2] + (cb[2] - ca[2]) * u;
    out[0] = Math.fround(minX + (cellX + x) * dx);
    out[1] = Math.fround(minY + (cellY + y) * dy);
    out[2] = Math.fround(minZ + (cellZ + z) * dz);
    let nx = 0, ny = 0, nz = 0;
    // Trilinear interpolation of cached grid gradients also covers tetra diagonals.
    for (let c = 0; c < 8; c++) {
      const corner = CORNERS[c];
      const weight = (corner[0] ? x : 1 - x) * (corner[1] ? y : 1 - y) * (corner[2] ? z : 1 - z);
      nx += gx[ids[c]] * weight; ny += gy[ids[c]] * weight; nz += gz[ids[c]] * weight;
    }
    const length = Math.hypot(nx, ny, nz);
    out[3] = length ? nx / length : 0; out[4] = length ? ny / length : 0; out[5] = length ? nz / length : 0;
  }

  function triangle(a: Vertex, b: Vertex, c: Vertex): void {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
    const bx = c[0] - a[0], by = c[1] - a[1], bz = c[2] - a[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const area = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(area) || area <= Math.min(dx * dy, dx * dz, dy * dz) * 1e-12) return;
    // Winding follows this tetrahedron's positive-to-negative separation,
    // never the smooth cached gradients, which may alias across thin sheets.
    if (nx * outwardX + ny * outwardY + nz * outwardZ < 0) {
      const swap = b; b = c; c = swap;
      nx = -nx; ny = -ny; nz = -nz;
    }
    if (used + 9 > positions.length) {
      const nextPositions = new Float32Array(positions.length * 2);
      const nextNormals = new Float32Array(normals.length * 2);
      nextPositions.set(positions); nextNormals.set(normals);
      positions = nextPositions; normals = nextNormals;
    }
    for (const vertex of [a, b, c]) {
      positions[used] = vertex[0]; positions[used + 1] = vertex[1]; positions[used + 2] = vertex[2];
      const hasGradient = vertex[3] !== 0 || vertex[4] !== 0 || vertex[5] !== 0;
      const normalSign = vertex[3] * nx + vertex[4] * ny + vertex[5] * nz < 0 ? -1 : 1;
      normals[used] = hasGradient ? vertex[3] * normalSign : nx / area;
      normals[used + 1] = hasGradient ? vertex[4] * normalSign : ny / area;
      normals[used + 2] = hasGradient ? vertex[5] * normalSign : nz / area;
      used += 3;
    }
  }

  for (cellZ = 0; cellZ < rz; cellZ++) for (cellY = 0; cellY < ry; cellY++) for (cellX = 0; cellX < rx; cellX++) {
    let solidCount = 0;
    for (let c = 0; c < 8; c++) {
      const corner = CORNERS[c];
      ids[c] = index(cellX + corner[0], cellY + corner[1], cellZ + corner[2]);
      densities[c] = values[ids[c]];
      if (densities[c] > 0) solidCount++;
    }
    if (solidCount === 0 || solidCount === 8) continue;
    for (const tetra of TETRAHEDRA) {
      let ni = 0, no = 0;
      for (const corner of tetra) {
        if (densities[corner] > 0) inside[ni++] = corner; else outside[no++] = corner;
      }
      if (ni === 0 || ni === 4) continue;
      outwardX = 0; outwardY = 0; outwardZ = 0;
      // For the tetra's affine density, grad·(outsideMean-insideMean)<0:
      // this direction therefore determines the exact outward half-space.
      for (let k = 0; k < no; k++) {
        const corner = CORNERS[outside[k]];
        outwardX += corner[0] * dx / no;
        outwardY += corner[1] * dy / no;
        outwardZ += corner[2] * dz / no;
      }
      for (let k = 0; k < ni; k++) {
        const corner = CORNERS[inside[k]];
        outwardX -= corner[0] * dx / ni;
        outwardY -= corner[1] * dy / ni;
        outwardZ -= corner[2] * dz / ni;
      }
      if (ni === 1 || ni === 3) {
        const singleton = ni === 1 ? inside[0] : outside[0];
        const others = ni === 1 ? outside : inside;
        for (let k = 0; k < 3; k++) crossing(singleton, others[k], vertices[k]);
        triangle(vertices[0], vertices[1], vertices[2]);
      } else {
        crossing(inside[0], outside[0], vertices[0]);
        crossing(inside[0], outside[1], vertices[1]);
        crossing(inside[1], outside[0], vertices[2]);
        crossing(inside[1], outside[1], vertices[3]);
        triangle(vertices[0], vertices[1], vertices[2]);
        triangle(vertices[1], vertices[3], vertices[2]);
      }
    }
  }
  return { positions: positions.slice(0, used), normals: normals.slice(0, used) };
}
