import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import type { WorldHandle, WorldSettings } from './contracts';
import { createMorphology } from './morphology';
import { extractIsosurface } from './isosurface';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** One biochemical volume, polygonized into real porous surfaces. */
export function createWorld(seed = 42): WorldHandle {
  const field = createMorphology(seed);
  const group = new Group();
  group.name = 'Reaction–diffusion / implicit morphology';
  const uniforms = { morphTime: { value: 0 }, morphIntensity: { value: 0.7 } };
  const material = new MeshStandardMaterial({ vertexColors: true, metalness: 0.34, roughness: 0.4, emissive: 0x082a24, emissiveIntensity: 0.18 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform float morphTime;\nuniform float morphIntensity;\n${shader.vertexShader}`;
    // Smooth volume-wide deformation with its analytic normal Jacobian.
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      float mt = morphTime * 0.45;
      float ma = morphIntensity * 0.10;
      float ax = position.y * 0.8 + position.z * 0.55 + mt;
      float ay = position.x * 0.65 + position.z * 0.4 + mt * 1.3;
      float az = position.x * 0.5 + position.y * 0.7 + mt * 0.8;
      mat3 j = mat3(
        vec3(1.0, ma * 0.65 * cos(ay), ma * 0.5 * cos(az)),
        vec3(ma * 0.8 * cos(ax), 1.0, ma * 0.7 * cos(az)),
        vec3(ma * 0.55 * cos(ax), ma * 0.4 * cos(ay), 1.0)
      );
      objectNormal = normalize(mat3(cross(j[1], j[2]), cross(j[2], j[0]), cross(j[0], j[1])) * objectNormal);
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = position + ma * vec3(sin(ax), sin(ay), sin(az));
    `);
  };
  material.customProgramCacheKey = () => 'implicit-volume-deformation-v1';
  const geometries = new Map<string, BufferGeometry>();
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.geometry.dispose();
  mesh.name = 'Biochemical isosurface';
  mesh.userData.seed = seed;
  group.add(mesh);
  const teal = new Color(0x138e7c), light = new Color(0x71cbb0);
  const gold = new Color(0xc99c42), deep = new Color(0x1d3657);
  const color = new Color();
  function geometryFor(quality: 'low' | 'high'): BufferGeometry {
    const cached = geometries.get(quality);
    if (cached) return cached;
    const resolution: [number, number, number] = quality === 'high' ? [144, 56, 120] : [96, 40, 80];
    const surface = extractIsosurface(field.density, field.bounds, resolution);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(surface.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(surface.normals, 3));
    const colors = new Float32Array(surface.positions.length);
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
    // Weld shared edge intersections into a connected indexed mesh. Derive
    // shading normals from the resolved geometry, avoiding opposing thin-sheet
    // gradient samples producing per-triangle shading discontinuities.
    geometry.deleteAttribute('normal');
    const indexed = mergeVertices(geometry, 0.00001);
    geometry.dispose();
    indexed.computeVertexNormals();
    indexed.computeBoundingSphere();
    // Three.js culls CPU bounds; include the maximum shader displacement.
    if (indexed.boundingSphere) indexed.boundingSphere.radius += Math.sqrt(3) * 0.2;
    geometries.set(quality, indexed);
    return indexed;
  }
  mesh.geometry = geometryFor('high');
  let disposed = false;
  return {
    group,
    update(time: number, settings: WorldSettings) {
      if (disposed) return;
      uniforms.morphTime.value = Number.isFinite(time) ? time : 0;
      uniforms.morphIntensity.value = Math.max(0, Math.min(2, Number.isFinite(settings.intensity) ? settings.intensity : 0));
      mesh.geometry = geometryFor(settings.quality === 'low' ? 'low' : 'high');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach(geometry => geometry.dispose());
      geometries.clear(); material.dispose(); group.clear(); group.removeFromParent();
    },
  };
}
