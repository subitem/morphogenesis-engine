import type { SurfaceFrame } from './generation-contracts';
import { FRAME_COUNT, STEPS_PER_FRAME, WARMUP_STEPS } from './generation-contracts';

/** MGE2 v1: 96-byte little-endian fixed header, then packed per-attribute blocks.
 * Header: magic[4], version:u16, bytes:u16, encoding:u32, vertices:u32,
 * indices:u32, seed:f64, frame:u32, steps:u32, quality:u32 (0 low/1 high),
 * generationMs:f64, min[3]:f64, max[3]:f64.
 * Body: positions:u16[3V], normals:i16[3V], colors:u8[3V], indices:u32[I].
 * Position endpoints map to 0/65535; zero-width axes encode as zero.
 */
export const MGE_HEADER_BYTES = 96;
export const MGE_MAX_BYTES = 64 * 1024 * 1024;
const MAX_VERTICES = 1_000_000, MAX_INDICES = 6_000_000;
const FLOAT32_MAX = 3.4028234663852886e38;

function invalid(reason: string): never { throw new RangeError(`Invalid MGE2 bake: ${reason}`); }

function validateMetadata(seed: number, quality: unknown, frame: number, steps: number, generationMs: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) invalid('seed must be an unsigned 32-bit integer');
  if (quality !== 'high' && quality !== 'low') invalid('unknown quality');
  if (!Number.isInteger(frame) || frame < 0 || frame >= FRAME_COUNT) invalid('frame outside timeline');
  if (steps !== WARMUP_STEPS + frame * STEPS_PER_FRAME) invalid('inconsistent chemical step count');
  if (!Number.isFinite(generationMs) || generationMs < 0) invalid('invalid generation duration');
}

function bodyLength(vertices: number, indices: number): number {
  if (!Number.isInteger(vertices) || vertices < 3 || vertices > MAX_VERTICES) invalid('vertex count outside limits');
  if (!Number.isInteger(indices) || indices < 3 || indices > MAX_INDICES || indices % 3 !== 0) invalid('triangle index count outside limits');
  const bytes = MGE_HEADER_BYTES + vertices * 15 + indices * 4;
  if (bytes > MGE_MAX_BYTES) invalid('file exceeds 64 MiB');
  return bytes;
}

export function encodeFrame(frame: SurfaceFrame): ArrayBuffer {
  validateMetadata(frame.seed, frame.quality, frame.frame, frame.steps, frame.generationMs);
  if (!(frame.positions instanceof Float32Array) || !(frame.normals instanceof Float32Array) || !(frame.colors instanceof Float32Array) || !(frame.indices instanceof Uint32Array)) invalid('incorrect attribute array types');
  if (frame.positions.length % 3 !== 0 || frame.normals.length !== frame.positions.length || frame.colors.length !== frame.positions.length) invalid('attribute lengths disagree');
  const vertices = frame.positions.length / 3;
  const length = bodyLength(vertices, frame.indices.length);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < frame.positions.length; i++) {
    const value = frame.positions[i];
    if (!Number.isFinite(value)) invalid('nonfinite position');
    min[i % 3] = Math.min(min[i % 3], value); max[i % 3] = Math.max(max[i % 3], value);
    if (!Number.isFinite(frame.colors[i]) || frame.colors[i] < 0 || frame.colors[i] > 1) invalid('color outside [0, 1]');
  }
  for (let i = 0; i < frame.normals.length; i += 3) {
    const normalLength = Math.hypot(frame.normals[i], frame.normals[i + 1], frame.normals[i + 2]);
    if (!Number.isFinite(normalLength) || Math.abs(normalLength - 1) > 0.001) invalid('normal must have unit length');
  }
  for (const index of frame.indices) if (index >= vertices) invalid('triangle index outside vertex array');
  // Allocate only after the source geometry and all metadata have passed validation.
  const buffer = new ArrayBuffer(length), view = new DataView(buffer);
  for (let i = 0; i < 4; i++) view.setUint8(i, 'MGE2'.charCodeAt(i));
  view.setUint16(4, 1, true); view.setUint16(6, MGE_HEADER_BYTES, true);
  view.setUint32(8, 1, true); view.setUint32(12, vertices, true); view.setUint32(16, frame.indices.length, true);
  view.setFloat64(20, frame.seed, true); view.setUint32(28, frame.frame, true); view.setUint32(32, frame.steps, true);
  view.setUint32(36, frame.quality === 'high' ? 1 : 0, true); view.setFloat64(40, frame.generationMs, true);
  for (let axis = 0; axis < 3; axis++) { view.setFloat64(48 + axis * 8, min[axis], true); view.setFloat64(72 + axis * 8, max[axis], true); }
  let offset = MGE_HEADER_BYTES;
  for (let i = 0; i < frame.positions.length; i++, offset += 2) {
    const axis = i % 3, range = max[axis] - min[axis];
    view.setUint16(offset, range === 0 ? 0 : Math.round((frame.positions[i] - min[axis]) / range * 65535), true);
  }
  for (let i = 0; i < frame.normals.length; i += 3) {
    const length = Math.hypot(frame.normals[i], frame.normals[i + 1], frame.normals[i + 2]);
    for (let axis = 0; axis < 3; axis++, offset += 2) view.setInt16(offset, Math.round(frame.normals[i + axis] / length * 32767), true);
  }
  for (const value of frame.colors) view.setUint8(offset++, Math.round(value * 255));
  for (const index of frame.indices) { view.setUint32(offset, index, true); offset += 4; }
  return buffer;
}

export function decodeFrame(buffer: ArrayBuffer): SurfaceFrame {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < MGE_HEADER_BYTES || buffer.byteLength > MGE_MAX_BYTES) invalid('file size outside limits');
  const view = new DataView(buffer);
  for (let i = 0; i < 4; i++) if (view.getUint8(i) !== 'MGE2'.charCodeAt(i)) invalid('incorrect magic');
  if (view.getUint16(4, true) !== 1 || view.getUint16(6, true) !== MGE_HEADER_BYTES || view.getUint32(8, true) !== 1) invalid('unsupported version, header or encoding');
  const vertices = view.getUint32(12, true), indicesCount = view.getUint32(16, true);
  if (bodyLength(vertices, indicesCount) !== buffer.byteLength) invalid('body length mismatch');
  const seed = view.getFloat64(20, true), frame = view.getUint32(28, true), steps = view.getUint32(32, true);
  const qualityCode = view.getUint32(36, true);
  if (qualityCode > 1) invalid('unknown quality encoding');
  const quality = qualityCode === 1 ? 'high' : 'low', generationMs = view.getFloat64(40, true);
  validateMetadata(seed, quality, frame, steps, generationMs);
  const min = [0, 0, 0], max = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    min[axis] = view.getFloat64(48 + axis * 8, true); max[axis] = view.getFloat64(72 + axis * 8, true);
    if (!Number.isFinite(min[axis]) || !Number.isFinite(max[axis]) || min[axis] > max[axis] || Math.abs(min[axis]) > FLOAT32_MAX || Math.abs(max[axis]) > FLOAT32_MAX) invalid('invalid position bounds');
  }
  const components = vertices * 3, normalStart = MGE_HEADER_BYTES + components * 2;
  const colorStart = normalStart + components * 2, indexStart = colorStart + components;
  // Validate the entire packed body before allocating decoded attribute arrays.
  for (let i = 0; i < components; i += 3) {
    let squared = 0;
    for (let axis = 0; axis < 3; axis++) {
      const component = view.getInt16(normalStart + (i + axis) * 2, true);
      if (component === -32768) invalid('invalid normal encoding');
      squared += (component / 32767) ** 2;
      if (min[axis] === max[axis] && view.getUint16(MGE_HEADER_BYTES + (i + axis) * 2, true) !== 0) invalid('noncanonical constant-axis position');
    }
    if (Math.abs(Math.sqrt(squared) - 1) > 0.0001) invalid('non-unit packed normal');
  }
  for (let i = 0; i < indicesCount; i++) if (view.getUint32(indexStart + i * 4, true) >= vertices) invalid('triangle index outside vertex array');
  const positions = new Float32Array(components), normals = new Float32Array(components), colors = new Float32Array(components), indices = new Uint32Array(indicesCount);
  for (let i = 0; i < components; i++) {
    const axis = i % 3;
    positions[i] = min[axis] + view.getUint16(MGE_HEADER_BYTES + i * 2, true) / 65535 * (max[axis] - min[axis]);
    colors[i] = view.getUint8(colorStart + i) / 255;
  }
  for (let i = 0; i < components; i += 3) {
    const x = view.getInt16(normalStart + i * 2, true), y = view.getInt16(normalStart + (i + 1) * 2, true), z = view.getInt16(normalStart + (i + 2) * 2, true);
    const length = Math.hypot(x, y, z);
    normals[i] = x / length; normals[i + 1] = y / length; normals[i + 2] = z / length;
  }
  for (let i = 0; i < indicesCount; i++) indices[i] = view.getUint32(indexStart + i * 4, true);
  return { seed, quality, frame, steps, generationMs, positions, normals, colors, indices };
}
