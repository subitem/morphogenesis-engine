import type { FrameGenerator, FrameRequest, GenerationStatus, SurfaceFrame, WorkerRequest, WorkerResponse } from './generation-contracts';
import { FRAME_COUNT } from './generation-contracts';

export type GenerationWorker = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;
export type WorkerFactory = () => GenerationWorker;
const MAX_CACHE_FRAMES = 4;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const bytes = (frame: SurfaceFrame) => frame.positions.byteLength + frame.normals.byteLength + frame.colors.byteLength + frame.indices.byteLength;
const keyFor = (request: FrameRequest) => `${request.seed}:${request.quality}:${request.frame}`;
const abortError = () => new DOMException('Die Berechnung wurde abgebrochen.', 'AbortError');

/** Main-thread coordinator. CPU modules are deliberately absent from this import graph. */
export function createFrameGenerator(
  onStatus: (status: GenerationStatus) => void,
  workerFactory: WorkerFactory = () => new Worker(new URL('./morphogenesis.worker.ts', import.meta.url), { type: 'module' }),
): FrameGenerator {
  const cache = new Map<string, SurfaceFrame>();
  let cacheBytes = 0;
  let serial = 0;
  let disposed = false;
  let active: { id: number; worker: GenerationWorker; reject: (error: Error) => void } | undefined;

  function terminateCurrent(): boolean {
    const pending = active;
    active = undefined;
    if (!pending) return false;
    pending.worker.onmessage = null; pending.worker.onerror = null; pending.worker.onmessageerror = null;
    pending.worker.terminate();
    pending.reject(abortError());
    return true;
  }
  function remember(key: string, frame: SurfaceFrame): void {
    const size = bytes(frame);
    if (size > MAX_CACHE_BYTES) return;
    cache.set(key, frame); cacheBytes += size;
    while (cache.size > MAX_CACHE_FRAMES || cacheBytes > MAX_CACHE_BYTES) {
      const oldest = cache.keys().next().value!;
      cacheBytes -= bytes(cache.get(oldest)!);
      cache.delete(oldest);
    }
  }

  return {
    async generate(request) {
      if (disposed) throw abortError();
      if (!request || !Number.isInteger(request.seed) || request.seed < 0 || request.seed > 0xffffffff
        || (request.quality !== 'high' && request.quality !== 'low')
        || !Number.isInteger(request.frame) || request.frame < 0 || request.frame >= FRAME_COUNT) {
        throw new RangeError('Ungültiger Simulationsauftrag.');
      }
      terminateCurrent();
      const id = ++serial;
      const key = keyFor(request);
      const cached = cache.get(key);
      if (cached) {
        cache.delete(key); cache.set(key, cached);
        onStatus({ state: 'ready', message: 'Simulierter Zustand aus dem Cache.', progress: 1 });
        return cached;
      }
      return new Promise<SurfaceFrame>((resolve, reject) => {
        let worker: GenerationWorker;
        try { worker = workerFactory(); }
        catch (error) {
          onStatus({ state: 'error', message: 'Berechnungs-Worker konnte nicht gestartet werden.', progress: 0 });
          reject(error); return;
        }
        active = { id, worker, reject };
        const isCurrent = () => !disposed && active?.id === id && active.worker === worker;
        function finish(): void {
          active = undefined;
          worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
          worker.terminate();
        }
        function fail(message: string): void {
          if (!isCurrent()) return;
          finish();
          onStatus({ state: 'error', message, progress: 0 });
          reject(new Error(message));
        }
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (!isCurrent() || event.data.id !== id) return;
          const response = event.data;
          if (response.type === 'progress') onStatus(response.status);
          else if (response.type === 'error') fail(response.message);
          else if (response.type === 'result') {
            finish();
            remember(key, response.data);
            onStatus({ state: 'ready', message: 'Simulierter Zustand bereit.', progress: 1 });
            resolve(response.data);
          }
        };
        worker.onerror = event => { event.preventDefault(); fail(event.message || 'Berechnungs-Worker ist fehlgeschlagen.'); };
        worker.onmessageerror = () => fail('Berechnungsergebnis konnte nicht übertragen werden.');
        onStatus({ state: 'loading', message: 'Berechnungs-Worker wird gestartet …', progress: 0 });
        try { worker.postMessage({ id, request: { ...request } } satisfies WorkerRequest); }
        catch (error) { fail(error instanceof Error ? error.message : 'Berechnungsauftrag konnte nicht übertragen werden.'); }
      });
    },
    cancel() {
      if (terminateCurrent() && !disposed) onStatus({ state: 'ready', message: 'Berechnung abgebrochen.', progress: 0 });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      terminateCurrent();
      cache.clear(); cacheBytes = 0;
    },
  };
}
