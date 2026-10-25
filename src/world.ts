import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { WorldHandle, WorldSettings } from './contracts';
import type { SurfaceFrame } from './generation-contracts';

/** Presentation only: generation, meshing, welding and color baking live in the worker. */
export function createWorld(frame?: SurfaceFrame): WorldHandle {
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
  const mesh = new Mesh(new BufferGeometry(), material);
  mesh.name = 'Biochemical isosurface';
  mesh.visible = false;
  group.add(mesh);
  let disposed = false;
  function replaceFrame(next: SurfaceFrame): void {
    if (disposed) return;
    const geometry = new BufferGeometry();
    // Disposing GPU geometry never mutates buffers retained for export/recovery.
    geometry.setAttribute('position', new BufferAttribute(next.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(next.normals, 3));
    geometry.setAttribute('color', new BufferAttribute(next.colors, 3));
    geometry.setIndex(new BufferAttribute(next.indices, 1));
    geometry.computeBoundingSphere();
    // Three.js culls CPU bounds; include the maximum shader displacement.
    if (geometry.boundingSphere) geometry.boundingSphere.radius += Math.sqrt(3) * 0.2;
    const previous = mesh.geometry;
    mesh.geometry = geometry;
    mesh.userData.seed = next.seed;
    mesh.userData.frame = next.frame;
    mesh.visible = true;
    previous.dispose();
  }
  if (frame) replaceFrame(frame);
  return {
    group,
    replaceFrame,
    update(time: number, settings: WorldSettings) {
      if (disposed) return;
      uniforms.morphTime.value = Number.isFinite(time) ? time : 0;
      uniforms.morphIntensity.value = Math.max(0, Math.min(2, Number.isFinite(settings.intensity) ? settings.intensity : 0));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.geometry.dispose(); material.dispose(); group.clear(); group.removeFromParent();
    },
  };
}
