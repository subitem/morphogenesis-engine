import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ViewerHandle, ViewerStats, WorldSettings } from './contracts';
import { createWorld } from './world';

/** Owns the GPU lifecycle; world animation receives one shared time in seconds. */
export function createViewer(
  container: HTMLElement,
  onStats: (stats: ViewerStats) => void,
): ViewerHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  renderer.setClearColor(0x091514);
  renderer.domElement.setAttribute('aria-label', 'Interaktive 3D-Landschaft: Ziehen zum Drehen, Mausrad zum Zoomen.');
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  const scene = new Scene();
  scene.background = new Color(0x091514);
  scene.fog = new FogExp2(0x091514, 0.009);
  scene.add(new HemisphereLight(0xd5fff1, 0x253332, 2.9));
  const key = new DirectionalLight(0xffedcb, 5.2);
  key.position.set(-12, 24, 18);
  scene.add(key);
  const rim = new DirectionalLight(0x67ffe0, 3.4);
  rim.position.set(14, 12, -15);
  scene.add(rim);
  const gold = new PointLight(0xffb962, 35, 45, 1.4);
  gold.position.set(-9, 6, 2);
  scene.add(gold);
  const indigo = new PointLight(0x859bff, 26, 35, 1.4);
  indigo.position.set(9, 7, -5);
  scene.add(indigo);

  const camera = new PerspectiveCamera(40, 1, 0.1, 160);
  const home = new Vector3(20, 22, 26);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 12;
  controls.maxDistance = 66;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minPolarAngle = 0.15;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.update();
  function keyboardCamera(event: KeyboardEvent): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const offset = camera.position.clone().sub(controls.target);
    if (event.key === '+' || event.key === '=') offset.multiplyScalar(0.9);
    else if (event.key === '-' || event.key === '_') offset.multiplyScalar(1.1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      offset.applyAxisAngle(new Vector3(0, 1, 0), event.key === 'ArrowLeft' ? 0.1 : -0.1);
    } else {
      const radius = offset.length();
      const angle = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle,
        Math.acos(offset.y / radius) + (event.key === 'ArrowUp' ? -0.1 : 0.1)));
      const azimuth = Math.atan2(offset.x, offset.z);
      offset.set(radius * Math.sin(angle) * Math.sin(azimuth), radius * Math.cos(angle), radius * Math.sin(angle) * Math.cos(azimuth));
    }
    offset.clampLength(controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }
  renderer.domElement.addEventListener('keydown', keyboardCamera);

  let world: ReturnType<typeof createWorld>;
  try {
    world = createWorld(42);
  } catch (error) {
    controls.dispose();
    renderer.dispose();
    throw error;
  }
  scene.add(world.group);
  container.append(renderer.domElement);

  const contextNotice = document.createElement('div');
  contextNotice.setAttribute('role', 'status');
  contextNotice.style.cssText = 'position:absolute;inset:40% 8% auto;padding:20px;background:#122925;color:#f5f1df;border:1px solid #8fa89a;border-radius:8px;text-align:center;z-index:5';
  contextNotice.hidden = true;
  container.append(contextNotice);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !motion.matches;
  let contextLost = false;
  let disposed = false;
  let time = 0;
  let currentSeed = 42;
  let previous = performance.now();
  let fpsStart = previous;
  let frames = 0;
  let animationFrame = 0;
  const settings: WorldSettings = { intensity: 0.7, speed: 1, quality: 'high' };

  function resize(): void {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 1.75 : 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Retain the full world horizontally on portrait screens.
    camera.fov = 2 * Math.atan(Math.tan(20 * Math.PI / 180) / Math.min(1, camera.aspect)) * 180 / Math.PI;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);
  resize();

  function loseContext(event: Event): void {
    event.preventDefault();
    contextLost = true;
    // Release callbacks and stale GPU handles while the context is lost.
    // Rebuild from the current seed after Three.js restores its renderer state.
    world.dispose();
    contextNotice.textContent = 'Die Grafikverbindung wurde unterbrochen. Die Szene wird nach Wiederherstellung fortgesetzt.';
    contextNotice.hidden = false;
  }
  function restoreContext(): void {
    world.dispose();
    world = createWorld(currentSeed);
    scene.add(world.group);
    world.update(time, settings);
    contextLost = false;
    contextNotice.hidden = true;
    previous = performance.now();
    resize();
  }
  renderer.domElement.addEventListener('webglcontextlost', loseContext);
  renderer.domElement.addEventListener('webglcontextrestored', restoreContext);

  function animate(now: number): void {
    if (disposed) return;
    animationFrame = requestAnimationFrame(animate);
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (document.hidden || contextLost) {
      fpsStart = now;
      frames = 0;
      return;
    }
    if (playing) time += delta * settings.speed;
    world.update(time, settings);
    controls.update(delta);
    renderer.render(scene, camera);
    frames++;
    const duration = now - fpsStart;
    if (duration >= 750) {
      let objects = 0;
      world.group.traverse((object) => { if ('isMesh' in object || 'isPoints' in object) objects++; });
      onStats({ fps: Math.round(frames * 1000 / duration), objects, triangles: renderer.info.render.triangles, renderer: 'WebGL 2' });
      frames = 0;
      fpsStart = now;
    }
  }
  animationFrame = requestAnimationFrame(animate);

  return {
    setPlaying(value) { playing = value; },
    setSettings(next) {
      if (typeof next.intensity === 'number' && Number.isFinite(next.intensity)) settings.intensity = Math.max(0, Math.min(2, next.intensity));
      if (typeof next.speed === 'number' && Number.isFinite(next.speed)) settings.speed = Math.max(0, Math.min(3, next.speed));
      if (next.quality === 'low' || next.quality === 'high') settings.quality = next.quality;
      resize();
    },
    regenerate(seed) {
      if (disposed || !Number.isFinite(seed)) return;
      // Construct first, preserving the existing scene if generation fails.
      const replacement = createWorld(Math.trunc(seed));
      currentSeed = Math.trunc(seed);
      scene.remove(world.group);
      world.dispose();
      world = replacement;
      scene.add(world.group);
      time = 0;
      world.update(time, settings);
    },
    resetCamera() {
      camera.position.copy(home);
      controls.target.set(0, 0.5, 0);
      controls.update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('webglcontextlost', loseContext);
      renderer.domElement.removeEventListener('webglcontextrestored', restoreContext);
      controls.dispose();
      renderer.domElement.removeEventListener('keydown', keyboardCamera);
      world.dispose();
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
      contextNotice.remove();
    },
  };
}
