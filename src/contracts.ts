import type { Group } from 'three';
import type { GenerationStatus, SurfaceFrame } from './generation-contracts';
export type Quality = 'low' | 'high';
export interface WorldSettings { intensity: number; speed: number; quality: Quality; }
export interface WorldHandle { group: Group; update(time: number, settings: WorldSettings): void; replaceFrame(frame: SurfaceFrame): void; dispose(): void; }
export interface ViewerStats { fps: number; objects: number; triangles: number; renderer: string; frame: number; steps: number; playing: boolean; seed: number; quality: Quality; generation: GenerationStatus; }
export interface ViewerHandle {
 setPlaying(value: boolean): void;
 setSettings(settings: Partial<WorldSettings>): void;
 regenerate(seed: number): void;
 resetCamera(): void;
 seek(frame: number): void;
 exportFrame(): void;
 importFrame(file: File): Promise<void>;
 dispose(): void;
}
export type UIAction = { type: 'play'; value: boolean } | { type: 'settings'; value: Partial<WorldSettings> } | { type: 'seed'; value: number } | { type: 'reset' } | { type: 'seek'; value: number } | { type: 'export' } | { type: 'import'; value: File };
export interface UIHandle { viewport: HTMLElement; onAction(callback: (action: UIAction) => void): void; setStats(stats: ViewerStats): void; showError(message: string): void; dispose(): void; }
