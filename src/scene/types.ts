import type { XY } from '../vector/simplify';

export type Line = XY[];

/** One pen's lines, in mm on the sheet. */
export interface Layer {
  index: number;
  color: string;
  widthMm: number;
  lines: Line[];
}

export interface Scene { widthMm: number; heightMm: number; layers: Layer[] }
