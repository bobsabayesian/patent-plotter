import type { XY } from '../vector/simplify';
import { GLYPHS } from './strokefont';

/**
 * The punctuation and symbols that patent text is full of (claims use : ; ( ) ' " & / all the time) but moire's
 * font leaves out. Same design units as there: baseline y = 0, x-height 4, tall letters and digits 6, y points up.
 * Kept in a file of its own so strokefont.ts stays a straight copy of moire's.
 */
const dot = (x: number, y: number): XY[] => [[x, y], [x, y + 0.15]];
const ring = (cx: number, cy: number, r: number): XY[] => [[cx, cy + r], [cx + r * 0.7, cy + r * 0.7], [cx + r, cy], [cx + r * 0.7, cy - r * 0.7], [cx, cy - r], [cx - r * 0.7, cy - r * 0.7], [cx - r, cy], [cx - r * 0.7, cy + r * 0.7], [cx, cy + r]];

const EXTRA: Record<string, XY[][]> = {
  ':': [dot(0.5, 4), dot(0.5, 0)],
  ';': [dot(0.5, 4), [[0.5, 0.3], [0.2, -0.8]]],
  "'": [[[0.5, 6], [0.5, 4.6]]],
  '"': [[[0.3, 6], [0.3, 4.6]], [[1.4, 6], [1.4, 4.6]]],
  '(': [[[1.6, 6.5], [0.8, 5.3], [0.5, 3], [0.8, 0.7], [1.6, -0.5]]],
  ')': [[[0, 6.5], [0.8, 5.3], [1.1, 3], [0.8, 0.7], [0, -0.5]]],
  '[': [[[1.3, 6.5], [0.2, 6.5], [0.2, -0.5], [1.3, -0.5]]],
  ']': [[[0, 6.5], [1.1, 6.5], [1.1, -0.5], [0, -0.5]]],
  '/': [[[0, -0.3], [2.5, 6.3]]],
  '&': [[[2.9, 0], [1, 2.4], [0.4, 3.8], [0.7, 5.3], [1.5, 6], [2.3, 5.4], [2.2, 4.3], [0.6, 2.3], [0.1, 1.2], [0.3, 0.3], [1.2, 0], [2, 0.4], [2.8, 2.2]]],
  '+': [[[0.2, 3], [2.8, 3]], [[1.5, 1.7], [1.5, 4.3]]],
  '=': [[[0.2, 2.4], [2.8, 2.4]], [[0.2, 3.8], [2.8, 3.8]]],
  '<': [[[2.6, 4.6], [0.2, 2.6], [2.6, 0.6]]],
  '>': [[[0.2, 4.6], [2.6, 2.6], [0.2, 0.6]]],
  '%': [ring(0.6, 5.2, 0.6), ring(2.6, 0.8, 0.6), [[0.2, 0], [3, 6]]],
  '_': [[[0, -0.8], [3, -0.8]]],
  '#': [[[0.9, 0], [1.3, 6]], [[2.1, 0], [2.5, 6]], [[0, 2], [3.3, 2]], [[0, 4], [3.3, 4]]],
  '°': [ring(0.8, 5.2, 0.8)],
};

let added = false;
/** Add the extra glyphs to the font (once). */
export function addExtraGlyphs(): void {
  if (added) return;
  added = true;
  for (const [ch, strokes] of Object.entries(EXTRA)) if (!GLYPHS[ch]) GLYPHS[ch] = strokes;
}
addExtraGlyphs();
