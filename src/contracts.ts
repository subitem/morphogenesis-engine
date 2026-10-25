import type { Group } from 'three';
export type Quality = 'low' | 'high';
export interface WorldSettings { intensity: number; speed: number; quality: Quality; }
export interface WorldHandle { group: Group; update(time: number, settings: WorldSettings): void; dispose(): void; }
export interface ViewerStats { fps: number; objects: number; triangles: number; renderer: string; }
export interface ViewerHandle {
 setPlaying(value: boolean): void;
 setSettings(settings: Partial<WorldSettings>): void;
 regenerate(seed: number): void;
 resetCamera(): void;
 dispose(): void;
}
export type UIAction = { type: 'play'; value: boolean } | { type: 'settings'; value: Partial<WorldSettings> } | { type: 'seed'; value: number } | { type: 'reset' };
export interface UIHandle { viewport: HTMLElement; onAction(callback: (action: UIAction) => void): void; setStats(stats: ViewerStats): void; showError(message: string): void; dispose(): void; }
