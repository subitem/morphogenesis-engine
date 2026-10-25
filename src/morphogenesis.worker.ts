import { buildFrame } from './bake';
import type { WorkerRequest, WorkerResponse } from './generation-contracts';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};
scope.onmessage = ({ data }) => {
  const id = data?.id;
  if (!Number.isInteger(id)) return;
  try {
    const result = buildFrame(data.request, status => scope.postMessage({ type: 'progress', id, status }));
    scope.postMessage({ type: 'result', id, data: result }, [
      result.positions.buffer as ArrayBuffer, result.normals.buffer as ArrayBuffer,
      result.colors.buffer as ArrayBuffer, result.indices.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    scope.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Geometrie konnte nicht erzeugt werden.' });
  }
};
