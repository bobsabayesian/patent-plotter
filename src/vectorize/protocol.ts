import type { XY } from '../vector/simplify';

export type Method = 'lineart' | 'edges';

export interface VectorizeRequest {
  id: number;
  /** the sheet as grey pixels (0 black .. 255 white), `w` x `h` */
  gray: Uint8Array;
  w: number;
  h: number;
  method: Method;
  /** fractions of the sheet to trim off: top, right, bottom, left */
  crop: [number, number, number, number];
  /** drop what a scan leaves at the sheet's edge (line art only) */
  cleanEdges: boolean;
}
export type VectorizeResponse =
  | { id: number; ok: true; lines: XY[][]; width: number; height: number }
  | { id: number; ok: false; error: string };
