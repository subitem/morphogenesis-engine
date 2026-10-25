/** Positive density is solid, negative density is empty. Coordinates are world units. */
export type DensityField = (x: number, y: number, z: number) => number;
export interface MorphologyField {
 density: DensityField;
 chemistry(x: number, z: number): number;
 bounds: { min: [number, number, number]; max: [number, number, number] };
}
export interface SurfaceData { positions: Float32Array; normals: Float32Array; }
