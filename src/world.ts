import {
  BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Mesh, MeshStandardMaterial,
  Object3D, Points, PointsMaterial, Shape, ExtrudeGeometry, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector3, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldHandle, WorldSettings } from './contracts';

type Point = [number, number];

/** Small seeded PRNG: identical seeds produce byte-identical scene geometry. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact convex Voronoi cells, clipped by all perpendicular bisector halfplanes. */
export function voronoiCell(site: Point, sites: Point[], bounds: number): Point[] {
  let polygon: Point[] = [[-bounds, -bounds], [bounds, -bounds], [bounds, bounds], [-bounds, bounds]];
  for (const other of sites) {
    const nx = other[0] - site[0], nz = other[1] - site[1];
    if (nx === 0 && nz === 0) continue;
    const limit = (other[0] ** 2 + other[1] ** 2 - site[0] ** 2 - site[1] ** 2) / 2;
    const clipped: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = a[0] * nx + a[1] * nz - limit;
      const db = b[0] * nx + b[1] * nz - limit;
      if (da <= 0) clipped.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const u = da / (da - db);
        clipped.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      }
    }
    polygon = clipped;
    if (polygon.length === 0) break;
  }
  return polygon;
}

const coast = (z: number) => -0.8 + Math.sin(z * 0.58) * 1.7 + Math.sin(z * 1.31) * 0.42;
const inside = (x: number, z: number, inset = 0) => (x / (11.5 - inset)) ** 2 + (z / (9.5 - inset)) ** 2 < 1;

export function createWorld(seed = 42): WorldHandle {
  const random = seededRandom(seed);
  const group = new Group();
  group.name = 'Morphogenesis / Living Canvas';
  const detail = new Group();
  detail.name = 'Microgeometry';
  group.add(detail);
  const materials = new Set<Material>();
  const geometries = new Set<BufferGeometry>();
  const material = (color: number, metalness = 0.25, roughness = 0.35, emissive = 0x000000) => {
    const result = new MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity: 0.28 });
    materials.add(result);
    return result;
  };
  const track = <T extends BufferGeometry>(geometry: T) => { geometries.add(geometry); return geometry; };
  const gold = material(0xe9b659, 0.72, 0.26, 0x775017);
  const paleGold = material(0xffdf8c, 0.55, 0.28);
  const teal = material(0x22c0a5, 0.38, 0.24, 0x074b45);
  const darkTeal = material(0x113e3c, 0.3, 0.55);
  const coral = material(0xe69062, 0.25, 0.36, 0x572511);
  const indigo = material(0x253a69, 0.42, 0.24);

  const base = new Mesh(track(new CylinderGeometry(11.6, 11.3, 0.65, 100)), darkTeal);
  base.scale.z = 0.825;
  base.position.y = -0.43;
  group.add(base);

  // A dense tessellated membrane; the seam width exposes the dark substrate.
  const sites: Point[] = [];
  for (let row = -11; row <= 11; row++) for (let column = -14; column <= 14; column++) {
    const x = column * 0.79 + (row % 2) * 0.38 + (random() - 0.5) * 0.36;
    const z = row * 0.79 + (random() - 0.5) * 0.36;
    sites.push([x, z]);
  }
  const cellPieces: BufferGeometry[] = [];
  const cellColors: number[] = [];
  for (const site of sites) {
    const [x, z] = site;
    if (!inside(x, z, 0.7) || x > coast(z) - 0.75) continue;
    const polygon = voronoiCell(site, sites, 12);
    if (polygon.length < 3) continue;
    const shape = new Shape();
    polygon.forEach(([px, pz], i) => {
      const sx = x + (px - x) * 0.86, sz = z + (pz - z) * 0.86;
      // Extrusion rotates -90° around X: negate Shape Y so world Z remains sz.
      if (i === 0) shape.moveTo(sx, -sz); else shape.lineTo(sx, -sz);
    });
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth: 0.19 + random() * 0.5, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.045, bevelThickness: 0.07 });
    geometry.rotateX(-Math.PI / 2);
    const color = new Color().setHSL(0.43 + random() * 0.07, 0.4 + random() * 0.2, 0.17 + random() * 0.25);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    cellPieces.push(geometry);
    cellColors.push(color.getHex());
  }
  const membraneMaterial = material(0xffffff, 0.32, 0.3);
  membraneMaterial.vertexColors = true;
  const mergedCells = mergeGeometries(cellPieces, false)!;
  cellPieces.forEach(g => g.dispose());
  const membrane = new Mesh(track(mergedCells), membraneMaterial);
  membrane.name = 'Clipped Voronoi membrane';
  membrane.userData.cellCount = cellColors.length;
  group.add(membrane);

  // Two gold banks and a broader, lower ribbon create a sinuous coastline.
  for (const offset of [-0.52, 0, 0.52]) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 100; i++) {
      const z = -9 + i * 0.18;
      points.push(new Vector3(coast(z) + offset, offset === 0 ? 0.12 : 0.22, z));
    }
    group.add(new Mesh(track(new TubeGeometry(new CatmullRomCurve3(points), 150, offset === 0 ? 0.55 : 0.055, 8, false)), offset === 0 ? gold : paleGold));
  }

  const dummy = new Object3D();
  const beadGeometry = track(new IcosahedronGeometry(1, 1));
  const beads = new InstancedMesh(beadGeometry, teal, 760);
  beads.name = 'Instanced cellular organisms';
  const color = new Color();
  for (let i = 0; i < beads.count; i++) {
    let x = 0, z = 0;
    do { x = random() * 22 - 11; z = random() * 18 - 9; } while (!inside(x, z, 0.5) || x < coast(z) + 0.7);
    const radius = 0.06 + random() ** 3 * 0.34;
    dummy.position.set(x, radius * 0.7 + 0.12, z);
    dummy.scale.set(radius, radius * (0.7 + random()), radius);
    dummy.rotation.set(random(), random(), random());
    dummy.updateMatrix();
    beads.setMatrixAt(i, dummy.matrix);
    color.setHSL(random() > 0.78 ? 0.1 : 0.42 + random() * 0.2, 0.5, 0.23 + random() * 0.28);
    beads.setColorAt(i, color);
  }
  group.add(beads);

  // Flower-like polyps, rings and branching coral gather on the eastern bank.
  const rings: Mesh[] = [];
  const sphereGeometry = track(new SphereGeometry(1, 16, 10));
  const ringGeometry = track(new TorusGeometry(1, 0.13, 10, 48));
  const branchGeometry = track(new CylinderGeometry(0.055, 0.12, 1, 6));
  const branches = new InstancedMesh(branchGeometry, coral, 216);
  let branchIndex = 0;
  const polyps = new InstancedMesh(sphereGeometry, gold, 160);
  let polypIndex = 0;
  for (let i = 0; i < 18; i++) {
    let x = 0, z = 0;
    do { x = random() * 10; z = random() * 16 - 8; } while (!inside(x, z, 1.2) || x < coast(z) + 1.6);
    const radius = 0.45 + random() * 0.7;
    const ring = new Mesh(ringGeometry, i % 3 === 0 ? gold : teal);
    ring.rotation.x = -Math.PI / 2 + (random() - 0.5) * 0.4;
    ring.position.set(x, 0.55 + random() * 1.1, z);
    ring.scale.setScalar(radius);
    ring.userData.baseY = ring.position.y;
    group.add(ring);
    rings.push(ring);
    const center = new Mesh(sphereGeometry, i % 2 ? indigo : darkTeal);
    center.position.set(x, 0.25, z);
    center.scale.set(radius * 0.75, radius * 0.5, radius * 0.75);
    group.add(center);
    for (let p = 0; p < 8 && polypIndex < 160; p++) {
      const angle = p * Math.PI / 4;
      dummy.position.set(x + Math.cos(angle) * radius * 1.3, 0.25, z + Math.sin(angle) * radius * 1.3);
      dummy.scale.set(0.18, 0.2 + random() * 0.2, 0.18);
      dummy.rotation.set(0, angle, 0); dummy.updateMatrix();
      polyps.setMatrixAt(polypIndex++, dummy.matrix);
    }
    for (let b = 0; b < 12; b++) {
      const angle = b * 2.39996;
      const length = 0.5 + random() * 1.3;
      dummy.position.set(x + Math.cos(angle) * radius * 0.8, length / 2 + 0.2, z + Math.sin(angle) * radius * 0.8);
      dummy.scale.set(1, length, 1);
      dummy.rotation.set(Math.cos(angle) * 0.65, angle, Math.sin(angle) * 0.65);
      dummy.updateMatrix(); branches.setMatrixAt(branchIndex++, dummy.matrix);
    }
  }
  branches.count = branchIndex;
  polyps.count = polypIndex;
  detail.add(branches, polyps);

  const particlePositions = new Float32Array(450 * 3);
  for (let i = 0; i < particlePositions.length; i += 3) {
    particlePositions[i] = (random() - 0.5) * 24;
    particlePositions[i + 1] = 0.5 + random() * 5;
    particlePositions[i + 2] = (random() - 0.5) * 20;
  }
  const particleGeometry = track(new BufferGeometry());
  particleGeometry.setAttribute('position', new Float32BufferAttribute(particlePositions, 3));
  const particleMaterial = new PointsMaterial({ color: 0xa5f7d8, size: 0.045, transparent: true, opacity: 0.65, depthWrite: false });
  materials.add(particleMaterial);
  const particles = new Points(particleGeometry, particleMaterial);
  detail.add(particles);
  let disposed = false;
  return {
    group,
    update(time: number, settings: WorldSettings) {
      if (disposed) return;
      const t = Number.isFinite(time) ? time : 0;
      const amplitude = Math.max(0, Math.min(2, Number.isFinite(settings.intensity) ? settings.intensity : 1));
      membrane.scale.y = 1 + Math.sin(t * 0.85) * 0.13 * amplitude;
      rings.forEach((ring, i) => {
        ring.position.y = ring.userData.baseY + Math.sin(t * 0.7 + i * 0.9) * 0.22 * amplitude;
        ring.rotation.z = Math.sin(t * 0.35 + i) * 0.12 * amplitude;
      });
      particles.rotation.y = Math.sin(t * 0.08) * 0.1 * amplitude;
      particles.position.y = Math.sin(t * 0.4) * 0.2 * amplitude;
      detail.visible = settings.quality === 'high';
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse(object => { if (object instanceof InstancedMesh) object.dispose(); });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(value => value.dispose());
      group.clear();
      group.removeFromParent();
    },
  };
}
