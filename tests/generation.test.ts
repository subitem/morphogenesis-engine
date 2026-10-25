import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameGenerator, type GenerationWorker } from '../src/generation';
import type { FrameRequest, SurfaceFrame, WorkerRequest, WorkerResponse } from '../src/generation-contracts';

class FakeWorker implements GenerationWorker {
  onmessage: GenerationWorker['onmessage'] = null;
  onerror: GenerationWorker['onerror'] = null;
  onmessageerror: GenerationWorker['onmessageerror'] = null;
  request!: WorkerRequest;
  terminated = false;
  postMessage(message: WorkerRequest): void { this.request = message; }
  terminate(): void { this.terminated = true; }
  send(response: WorkerResponse): void { this.onmessage?.call(this as unknown as Worker, new MessageEvent('message', { data: response })); }
  result(): SurfaceFrame {
    const data = frame(this.request.request);
    this.send({ type: 'result', id: this.request.id, data });
    return data;
  }
}
const request = (frame = 0): FrameRequest => ({ seed: 42, quality: 'low', frame });
const frame = (r: FrameRequest): SurfaceFrame => ({ ...r, steps: 480 + 96 * r.frame, positions: new Float32Array(9), normals: new Float32Array(9), colors: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), generationMs: 1 });
const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

test('latest request terminates previous worker and ignores stale and wrong-id results/progress', async () => {
  const workers: FakeWorker[] = [], statuses: string[] = [];
  const generator = createFrameGenerator(s => statuses.push(s.message), () => { const w = new FakeWorker(); workers.push(w); return w; });
  const a = generator.generate(request(0));
  const rejected = assert.rejects(a, isAbort);
  const staleHandler = workers[0].onmessage!;
  const oldId = workers[0].request.id;
  const b = generator.generate(request(1));
  assert.ok(workers[0].terminated);
  const statusCount = statuses.length;
  staleHandler.call(workers[0] as unknown as Worker, new MessageEvent('message', { data: { type: 'progress', id: oldId, status: { state: 'loading', message: 'STALE', progress: 0.9 } } }));
  staleHandler.call(workers[0] as unknown as Worker, new MessageEvent('message', { data: { type: 'result', id: oldId, data: frame(request(0)) } }));
  workers[1].send({ type: 'result', id: oldId, data: frame(request(0)) });
  assert.equal(statuses.length, statusCount);
  const result = workers[1].result();
  assert.equal(await b, result);
  await rejected;
  assert.ok(workers[1].terminated);
  generator.dispose();
});

test('cancel/dispose reject pending work, detach callbacks, and future disposed requests abort', async () => {
  const workers: FakeWorker[] = [];
  const generator = createFrameGenerator(() => {}, () => { const w = new FakeWorker(); workers.push(w); return w; });
  const a = generator.generate(request());
  const aRejected = assert.rejects(a, isAbort);
  generator.cancel(); generator.cancel();
  await aRejected;
  assert.equal(workers[0].onmessage, null);
  const b = generator.generate(request(1));
  const bRejected = assert.rejects(b, isAbort);
  generator.dispose(); generator.dispose();
  await bRejected;
  assert.ok(workers.every(w => w.terminated));
  await assert.rejects(generator.generate(request(2)), isAbort);
});

test('worker failure rejects cleanly and a later request can recover', async () => {
  const workers: FakeWorker[] = [];
  const generator = createFrameGenerator(() => {}, () => { const w = new FakeWorker(); workers.push(w); return w; });
  const a = generator.generate(request());
  workers[0].send({ type: 'error', id: workers[0].request.id, message: 'simulation failed' });
  await assert.rejects(a, /simulation failed/);
  const b = generator.generate(request(1));
  const data = workers[1].result();
  assert.equal(await b, data);
  generator.dispose();
});

test('worker browser errors and transfer errors preserve earlier cached states', async () => {
  const workers: FakeWorker[] = [];
  const generator = createFrameGenerator(() => {}, () => { const w = new FakeWorker(); workers.push(w); return w; });
  const initial = generator.generate(request(0));
  const saved = workers[0].result(); await initial;
  let pending = generator.generate(request(1));
  workers[1].onerror!.call(workers[1] as unknown as Worker, { message: 'module failed', preventDefault() {} } as ErrorEvent);
  await assert.rejects(pending, /module failed/);
  assert.equal(await generator.generate(request(0)), saved);
  pending = generator.generate(request(2));
  workers[2].onmessageerror!.call(workers[2] as unknown as Worker, new MessageEvent('messageerror'));
  await assert.rejects(pending, /übertragen/);
  assert.equal(await generator.generate(request(0)), saved);
  assert.equal(saved.positions.byteLength, 36);
  generator.dispose();
});

test('cache uses LRU eviction and cache hits supersede active workers', async () => {
  const workers: FakeWorker[] = [];
  const generator = createFrameGenerator(() => {}, () => { const w = new FakeWorker(); workers.push(w); return w; });
  for (let f = 0; f < 4; f++) { const pending = generator.generate(request(f)); workers.at(-1)!.result(); await pending; }
  await generator.generate(request(0)); // Touch oldest, so frame 1 becomes LRU.
  let pending = generator.generate(request(4)); workers.at(-1)!.result(); await pending;
  const count = workers.length;
  await generator.generate(request(0));
  assert.equal(workers.length, count);
  pending = generator.generate(request(1)); // Evicted.
  const rejected = assert.rejects(pending, isAbort);
  const cached = await generator.generate(request(0));
  await rejected;
  assert.equal(cached.frame, 0);
  assert.ok(workers.at(-1)!.terminated);
  generator.dispose();
});

test('cache byte budget evicts older frames before the four-frame limit', async () => {
  const workers: FakeWorker[] = [];
  const generator = createFrameGenerator(() => {}, () => { const w = new FakeWorker(); workers.push(w); return w; });
  for (let f = 0; f < 2; f++) {
    const pending = generator.generate(request(f));
    const w = workers.at(-1)!;
    const data = frame(request(f));
    data.positions = new Float32Array(9_000_000); // 36 MB per fake result.
    w.send({ type: 'result', id: w.request.id, data });
    await pending;
  }
  const count = workers.length;
  const pending = generator.generate(request(0));
  assert.equal(workers.length, count + 1);
  workers.at(-1)!.result(); await pending;
  generator.dispose();
});

test('invalid requests and startup failures reject without breaking future generation', async () => {
  let attempts = 0;
  const w = new FakeWorker();
  const generator = createFrameGenerator(() => {}, () => { if (++attempts === 1) throw new Error('unavailable'); return w; });
  for (const invalid of [{ ...request(), seed: -1 }, { ...request(), frame: 12 }, { ...request(), quality: 'invalid' }]) {
    await assert.rejects(generator.generate(invalid as FrameRequest), RangeError);
  }
  assert.equal(attempts, 0);
  await assert.rejects(generator.generate(request()), /unavailable/);
  const pending = generator.generate(request()); w.result(); await pending;
  generator.dispose();
});
