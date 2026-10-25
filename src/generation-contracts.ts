import type { Quality } from './contracts';
export const FRAME_COUNT = 12;
export const WARMUP_STEPS = 480;
export const STEPS_PER_FRAME = 96;
export interface FrameRequest { seed: number; quality: Quality; frame: number; }
export interface SurfaceFrame extends FrameRequest {
 steps: number;
 positions: Float32Array;
 normals: Float32Array;
 colors: Float32Array;
 indices: Uint32Array;
 generationMs: number;
}
export interface GenerationStatus { state: 'loading' | 'ready' | 'error'; message: string; progress: number; }
export type WorkerRequest = { id: number; request: FrameRequest };
export type WorkerResponse = { type: 'progress'; id: number; status: GenerationStatus }
 | { type: 'result'; id: number; data: SurfaceFrame }
 | { type: 'error'; id: number; message: string };
export interface FrameGenerator {
 generate(request: FrameRequest): Promise<SurfaceFrame>;
 cancel(): void;
 dispose(): void;
}
