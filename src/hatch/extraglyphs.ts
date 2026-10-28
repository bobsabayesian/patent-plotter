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

/** Points round part of an ellipse, from angle `a0` to `a1` in degrees (0 = right, 90 = up, y points up), every `step` degrees. */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, step = 15): XY[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([+(cx + rx * Math.cos(a)).toFixed(2), +(cy + ry * Math.sin(a)).toFixed(2)]);
  }
  return out;
}

/**
 * Capital letters, A to Z, 6 units tall (the height of the digits and the tall lowercase letters). Moire's font has
 * only lowercase and draws everything as lowercase; patent text needs capitals ("FIG. 1", claims, names).
 */
export const CAPS: Record<string, XY[][]> = {
  A: [[[0, 0], [1.7, 6], [3.4, 0]], [[0.55, 2], [2.85, 2]]],
  B: [[[0, 0], [0, 6]], [[0, 6], [1.9, 6], ...arc(1.9, 4.5, 1.5, 1.5, 90, -90), [0, 3]], [[0, 3], [2.1, 3], ...arc(2.1, 1.5, 1.5, 1.5, 90, -90), [0, 0]]],
  C: [arc(1.9, 3, 1.8, 3, 45, 315)],
  D: [[[0, 0], [0, 6]], [[0, 6], [1.2, 6], ...arc(1.2, 3, 2.2, 3, 90, -90), [0, 0]]],
  E: [[[3.2, 6], [0, 6], [0, 0], [3.2, 0]], [[0, 3], [2.6, 3]]],
  F: [[[3.2, 6], [0, 6], [0, 0]], [[0, 3], [2.6, 3]]],
  G: [arc(1.9, 3, 1.9, 3, 40, 360), [[3.8, 3], [2.1, 3]]],
  H: [[[0, 0], [0, 6]], [[3.4, 0], [3.4, 6]], [[0, 3], [3.4, 3]]],
  I: [[[0.5, 0], [0.5, 6]], [[0, 6], [1, 6]], [[0, 0], [1, 0]]],
  J: [[[3, 6], [3, 1.6], ...arc(1.6, 1.6, 1.4, 1.6, 0, -150)]],
  K: [[[0, 0], [0, 6]], [[3.2, 6], [0, 2.4]], [[1, 3.3], [3.4, 0]]],
  L: [[[0, 6], [0, 0], [3, 0]]],
  M: [[[0, 0], [0, 6], [2.2, 1.5], [4.4, 6], [4.4, 0]]],
  N: [[[0, 0], [0, 6], [3.4, 0], [3.4, 6]]],
  O: [arc(1.9, 3, 1.9, 3, 90, 450)],
  P: [[[0, 0], [0, 6]], [[0, 6], [1.9, 6], ...arc(1.9, 4.4, 1.6, 1.6, 90, -90), [0, 2.8]]],
  Q: [arc(1.9, 3, 1.9, 3, 90, 450), [[2.2, 1.6], [3.8, -0.6]]],
  R: [[[0, 0], [0, 6]], [[0, 6], [1.9, 6], ...arc(1.9, 4.4, 1.6, 1.6, 90, -90), [0, 2.8]], [[1.6, 2.8], [3.4, 0]]],
  S: [[[3.3, 5], [2.7, 5.8], [1.8, 6], [0.9, 5.8], [0.3, 5], [0.4, 4], [1, 3.4], [1.9, 3], [2.9, 2.5], [3.4, 1.8], [3.3, 0.9], [2.6, 0.2], [1.7, 0], [0.8, 0.2], [0.1, 1]]],
  T: [[[0, 6], [3.4, 6]], [[1.7, 6], [1.7, 0]]],
  U: [[[0, 6], [0, 2], ...arc(1.7, 2, 1.7, 2, 180, 360), [3.4, 6]]],
  V: [[[0, 6], [1.7, 0], [3.4, 6]]],
  W: [[[0, 6], [1.1, 0], [2.2, 4], [3.3, 0], [4.4, 6]]],
  X: [[[0, 6], [3.4, 0]], [[3.4, 6], [0, 0]]],
  Y: [[[0, 6], [1.7, 3], [3.4, 6]], [[1.7, 3], [1.7, 0]]],
  Z: [[[0, 6], [3.2, 6], [0, 0], [3.4, 0]]],
};

/** The same spacing moire's `layoutText` uses. */
const SPACE = 2, GAP = 1.2;

/**
 * Lay out `text` left to right in design units, capitals as capitals (moire's `layoutText` lowercases everything).
 * Characters the font lacks are skipped. Width includes the trailing gap, as in `layoutText`.
 */
export function layoutCased(text: string): { glyphs: { x: number; strokes: XY[][] }[]; width: number } {
  const glyphs: { x: number; strokes: XY[][] }[] = [];
  let x = 0;
  for (const ch of [...text.replace(/<3/g, '♥')]) {
    if (ch === ' ') { x += SPACE; continue; }
    const strokes = CAPS[ch] ?? GLYPHS[ch] ?? GLYPHS[ch.toLowerCase()];
    if (!strokes) continue;
    let maxX = 0;
    for (const s of strokes) for (const [px] of s) maxX = Math.max(maxX, px);
    glyphs.push({ x, strokes });
    x += maxX + GAP;
  }
  return { glyphs, width: x };
}
