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
import { createFrameGenerator } from './generation';
import { decodeFrame, encodeFrame, MGE_MAX_BYTES } from './asset-format';
import { FRAME_COUNT, WARMUP_STEPS, type FrameRequest, type GenerationStatus, type SurfaceFrame } from './generation-contracts';

/** Owns the GPU lifecycle; world animation receives one shared time in seconds. */
export function createViewer(
  container: HTMLElement,
  onStats: (stats: ViewerStats) => void,
): ViewerHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
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
  scene.add(new HemisphereLight(0xd5fff1, 0x182124, 1.7));
  const key = new DirectionalLight(0xffedcb, 3.2);
  key.position.set(-12, 24, 18);
  scene.add(key);
  const rim = new DirectionalLight(0x67ffe0, 1.8);
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

  let world = createWorld();
  scene.add(world.group);
  container.append(renderer.domElement);

  const contextNotice = document.createElement('div');
  contextNotice.setAttribute('role', 'status');
  contextNotice.style.cssText = 'position:absolute;inset:40% 8% auto;padding:20px;background:#122925;color:#f5f1df;border:1px solid #8fa89a;border-radius:8px;text-align:center;z-index:5';
  contextNotice.hidden = true;
  container.append(contextNotice);

  type RequestKind = 'initial' | 'manual' | 'autoplay' | 'quality' | 'seed' | 'import';
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let contextLost = false;
  let disposed = false;
  let time = 0;
  let currentFrame: SurfaceFrame | undefined;
  let desired: FrameRequest = { seed: 42, quality: 'high', frame: 0 };
  let generation: GenerationStatus = { state: 'loading', message: 'Ausgangsfeld wird vorbereitet.', progress: 0 };
  let beforeContextLoss: GenerationStatus = generation;
  let requestSerial = 0;
  let pending: { serial: number; kind: RequestKind; request?: FrameRequest } | undefined;
  let resumeRequest: { request: FrameRequest; kind: Exclude<RequestKind, 'import'> } | undefined;
  let seekTimer: number | undefined;
  let previous = performance.now();
  let fpsStart = previous;
  let frames = 0;
  let measuredFps = 0;
  let measuredTriangles = 0;
  let autoplayElapsed = 0;
  let animationFrame = 0;
  const settings: WorldSettings = { intensity: 0.7, speed: 1, quality: 'high' };
  const objectUrls = new Map<string, number>();

  function publish(): void {
    if (disposed) return;
    const committed = currentFrame ?? desired;
    onStats({
      fps: contextLost ? 0 : measuredFps,
      objects: currentFrame && !contextLost ? 1 : 0,
      triangles: contextLost ? 0 : measuredTriangles,
      renderer: 'WebGL 2', frame: committed.frame,
      steps: currentFrame?.steps ?? WARMUP_STEPS,
      seed: committed.seed, quality: committed.quality, playing,
      generation: { ...generation },
    });
  }

  const generator = createFrameGenerator(status => {
    // The generator guards stale worker callbacks; the viewer also rejects
    // progress once its request was cancelled, replaced or suspended.
    if (disposed || contextLost || !pending || pending.kind === 'import' || status.state === 'ready') return;
    generation = status;
    publish();
  });

  function invalidateRequests(): void {
    requestSerial++;
    if (seekTimer !== undefined) window.clearTimeout(seekTimer);
    seekTimer = undefined;
    pending = undefined;
    generator.cancel();
  }

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Die Berechnung konnte nicht abgeschlossen werden.';
  }

  function commitFrame(frame: SurfaceFrame): void {
    if (!contextLost) world.replaceFrame(frame);
    if (!currentFrame || currentFrame.seed !== frame.seed) time = 0;
    currentFrame = frame;
    desired = { seed: frame.seed, quality: frame.quality, frame: frame.frame };
    settings.quality = frame.quality;
    measuredTriangles = 0;
    autoplayElapsed = 0;
    if (frame.frame === FRAME_COUNT - 1) playing = false;
    generation = contextLost
      ? { state: 'loading', message: 'Zustand gespeichert; die Grafikverbindung wird wiederhergestellt.', progress: 1 }
      : { state: 'ready', message: `Zustand ${frame.frame + 1}/${FRAME_COUNT} · ${frame.steps} chemische Schritte`, progress: 1 };
    if (!contextLost) world.update(time, settings);
    publish();
  }

  async function requestFrame(request: FrameRequest, kind: Exclude<RequestKind, 'import'>): Promise<void> {
    if (disposed) return;
    invalidateRequests();
    desired = { ...request };
    generation = { state: 'loading', message: `Zustand ${request.frame + 1}/${FRAME_COUNT} wird berechnet.`, progress: 0 };
    if (contextLost) {
      resumeRequest = { request: { ...request }, kind };
      generation.message = 'Berechnung wartet auf die Grafikverbindung.';
      publish();
      return;
    }
    resumeRequest = undefined;
    const serial = requestSerial;
    pending = { serial, kind, request: { ...request } };
    publish();
    try {
      const frame = await generator.generate(request);
      if (disposed || serial !== requestSerial || !pending || pending.serial !== serial) return;
      if (frame.seed !== request.seed || frame.frame !== request.frame || frame.quality !== request.quality) throw new Error('Der berechnete Zustand stimmt nicht mit dem Auftrag überein.');
      pending = undefined;
      commitFrame(frame);
    } catch (error) {
      if (disposed || serial !== requestSerial) return;
      pending = undefined;
      if (error instanceof Error && error.name === 'AbortError') return;
      playing = false;
      generation = { state: 'error', message: errorMessage(error), progress: 0 };
      publish();
    }
  }

  function resize(): void {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 1.75 : 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = 2 * Math.atan(Math.tan(20 * Math.PI / 180) / Math.min(1, camera.aspect)) * 180 / Math.PI;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);
  resize();

  function loseContext(event: Event): void {
    if (disposed) return;
    event.preventDefault();
    beforeContextLoss = { ...generation };
    contextLost = true;
    world.dispose();
    // A file read is CPU-only and may complete safely while WebGL is lost.
    // Worker requests are cancelled, but their latest intent survives recovery.
    if (pending?.kind !== 'import') {
      if (pending || seekTimer !== undefined || !currentFrame) resumeRequest = {
        request: { ...desired }, kind: pending?.kind ?? 'manual',
      };
      invalidateRequests();
    }
    generation = { state: 'loading', message: 'Grafikverbindung unterbrochen; der Zustand bleibt gespeichert.', progress: 0 };
    contextNotice.textContent = generation.message;
    contextNotice.hidden = false;
    publish();
  }

  function restoreContext(): void {
    if (disposed) return;
    try {
      world.dispose();
      world = createWorld(currentFrame);
      scene.add(world.group);
      world.update(time, settings);
      contextLost = false;
      contextNotice.hidden = true;
      previous = performance.now();
      autoplayElapsed = 0;
      resize();
      const resume = resumeRequest;
      resumeRequest = undefined;
      if (resume) void requestFrame(resume.request, resume.kind);
      else if (pending?.kind === 'import') {
        generation = { state: 'loading', message: 'Bake-Datei wird geprüft.', progress: 0 };
        publish();
      } else {
        generation = currentFrame
          ? { state: 'ready', message: `Zustand ${currentFrame.frame + 1}/${FRAME_COUNT} wiederhergestellt.`, progress: 1 }
          : beforeContextLoss;
        publish();
      }
    } catch (error) {
      contextLost = true;
      playing = false;
      generation = { state: 'error', message: `Grafik konnte nicht wiederhergestellt werden: ${errorMessage(error)}`, progress: 0 };
      contextNotice.textContent = generation.message;
      contextNotice.hidden = false;
      publish();
    }
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
    measuredTriangles = renderer.info.render.triangles;
    frames++;
    const duration = now - fpsStart;
    if (duration >= 750) {
      measuredFps = Math.round(frames * 1000 / duration);
      frames = 0;
      fpsStart = now;
      publish();
    }
    if (playing && currentFrame && !pending && seekTimer === undefined && generation.state === 'ready') {
      autoplayElapsed += delta * settings.speed;
      if (autoplayElapsed >= 2 && currentFrame.frame < FRAME_COUNT - 1) {
        autoplayElapsed = 0;
        void requestFrame({ seed: currentFrame.seed, quality: settings.quality, frame: currentFrame.frame + 1 }, 'autoplay');
      }
    }
  }
  animationFrame = requestAnimationFrame(animate);
  publish();
  void requestFrame(desired, 'initial');

  return {
    setPlaying(value) {
      if (disposed) return;
      playing = value;
      if (!value && pending?.kind === 'autoplay') {
        invalidateRequests();
        if (currentFrame) desired = { seed: currentFrame.seed, quality: currentFrame.quality, frame: currentFrame.frame };
        generation = { state: 'ready', message: 'Automatische Weiterentwicklung pausiert.', progress: 1 };
      }
      if (!value && resumeRequest?.kind === 'autoplay') {
        // A suspended autoplay request must not resume after Pause.
        resumeRequest = undefined;
      }
      autoplayElapsed = 0;
      if (value && currentFrame?.frame === FRAME_COUNT - 1 && !pending) playing = false;
      else if (value && generation.state === 'error') void requestFrame(desired, 'manual');
      publish();
    },
    setSettings(next) {
      if (disposed) return;
      if (typeof next.intensity === 'number' && Number.isFinite(next.intensity)) settings.intensity = Math.max(0, Math.min(2, next.intensity));
      if (typeof next.speed === 'number' && Number.isFinite(next.speed)) settings.speed = Math.max(0, Math.min(3, next.speed));
      const qualityChanged = (next.quality === 'low' || next.quality === 'high')
        && (next.quality !== desired.quality || generation.state === 'error');
      if (next.quality === 'low' || next.quality === 'high') settings.quality = next.quality;
      resize();
      if (qualityChanged) void requestFrame({ ...desired, quality: settings.quality }, 'quality');
      else publish();
    },
    regenerate(seed) {
      if (disposed || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return;
      void requestFrame({ seed, quality: settings.quality, frame: 0 }, 'seed');
    },
    seek(frame) {
      if (disposed || !Number.isFinite(frame)) return;
      playing = false;
      const request = { ...desired, frame: Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(frame))) };
      invalidateRequests();
      desired = request;
      generation = { state: 'loading', message: `Zustand ${request.frame + 1}/${FRAME_COUNT} wird vorbereitet.`, progress: 0 };
      publish();
      seekTimer = window.setTimeout(() => {
        seekTimer = undefined;
        void requestFrame(request, 'manual');
      }, 120);
    },
    exportFrame() {
      if (disposed || !currentFrame) return;
      try {
        const blob = new Blob([encodeFrame(currentFrame)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `morphogenesis-${currentFrame.seed}-f${String(currentFrame.frame).padStart(2, '0')}-${currentFrame.quality}.mge`;
        document.body.append(link);
        link.click(); link.remove();
        const timeout = window.setTimeout(() => { URL.revokeObjectURL(url); objectUrls.delete(url); }, 1000);
        objectUrls.set(url, timeout);
      } catch (error) {
        generation = { state: 'error', message: `Export fehlgeschlagen: ${errorMessage(error)}`, progress: 0 };
      }
      publish();
    },
    async importFrame(file) {
      if (disposed) return;
      playing = false;
      invalidateRequests();
      resumeRequest = undefined;
      if (currentFrame) desired = { seed: currentFrame.seed, quality: currentFrame.quality, frame: currentFrame.frame };
      const serial = requestSerial;
      pending = { serial, kind: 'import' };
      generation = { state: 'loading', message: 'Bake-Datei wird geprüft.', progress: 0 };
      publish();
      try {
        if (file.size > MGE_MAX_BYTES) throw new RangeError('Die Bake-Datei überschreitet 64 MiB.');
        const buffer = await file.arrayBuffer();
        if (disposed || serial !== requestSerial) return;
        const frame = decodeFrame(buffer);
        pending = undefined;
        time = 0;
        commitFrame(frame);
        resize();
      } catch (error) {
        if (disposed || serial !== requestSerial) return;
        pending = undefined;
        generation = { state: 'error', message: `Import fehlgeschlagen: ${errorMessage(error)}`, progress: 0 };
        publish();
      }
    },
    resetCamera() {
      if (disposed) return;
      camera.position.copy(home);
      controls.target.set(0, 0.5, 0);
      controls.update();
      publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidateRequests();
      generator.dispose();
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('webglcontextlost', loseContext);
      renderer.domElement.removeEventListener('webglcontextrestored', restoreContext);
      controls.dispose();
      renderer.domElement.removeEventListener('keydown', keyboardCamera);
      world.dispose();
      currentFrame = undefined;
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
      contextNotice.remove();
      for (const [url, timeout] of objectUrls) { window.clearTimeout(timeout); URL.revokeObjectURL(url); }
      objectUrls.clear();
    },
  };
}
