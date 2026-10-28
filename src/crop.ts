/**
 * The arithmetic of cropping a drawing sheet. A crop rectangle is [x0, y0, x1, y1] as fractions of the sheet (0 to 1);
 * a figure stores its crop as the fractions trimmed off [top, right, bottom, left].
 */
export type Rect = [number, number, number, number];
export type Crop = [number, number, number, number];
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/** The smallest crop, as a fraction of the sheet in each direction. */
export const MIN_SIDE = 0.03;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const rectFromCrop = (c: Crop): Rect => [c[3], c[0], 1 - c[1], 1 - c[2]];
export const cropFromRect = (r: Rect): Crop => [r[1], 1 - r[2], 1 - r[3], r[0]];
export const isWhole = (r: Rect) => r[0] <= 0 && r[1] <= 0 && r[2] >= 1 && r[3] >= 1;

/** The rectangle dragged out from corner `a` to corner `b`, kept on the sheet and no smaller than the minimum. */
export function drawRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x0 = clamp(Math.min(a.x, b.x), 0, 1), x1 = clamp(Math.max(a.x, b.x), 0, 1);
  const y0 = clamp(Math.min(a.y, b.y), 0, 1), y1 = clamp(Math.max(a.y, b.y), 0, 1);
  return [Math.min(x0, 1 - MIN_SIDE), Math.min(y0, 1 - MIN_SIDE), Math.max(x1, Math.min(x0, 1 - MIN_SIDE) + MIN_SIDE), Math.max(y1, Math.min(y0, 1 - MIN_SIDE) + MIN_SIDE)];
}

/** Drag a handle of `r` to `p`: the edges that handle owns follow the pointer, the others stay put. */
export function resizeRect(r: Rect, handle: CropHandle, p: { x: number; y: number }): Rect {
  let [x0, y0, x1, y1] = r;
  if (handle.includes('w')) x0 = clamp(p.x, 0, x1 - MIN_SIDE);
  if (handle.includes('e')) x1 = clamp(p.x, x0 + MIN_SIDE, 1);
  if (handle.includes('n')) y0 = clamp(p.y, 0, y1 - MIN_SIDE);
  if (handle.includes('s')) y1 = clamp(p.y, y0 + MIN_SIDE, 1);
  return [x0, y0, x1, y1];
}

/** Slide `r` by (dx, dy), stopping at the sheet's edge without changing its size. */
export function moveRect(r: Rect, dx: number, dy: number): Rect {
  const w = r[2] - r[0], h = r[3] - r[1];
  const x0 = clamp(r[0] + dx, 0, 1 - w), y0 = clamp(r[1] + dy, 0, 1 - h);
  return [x0, y0, x0 + w, y0 + h];
}

/**
 * Where the drawing is on a sheet: the box round the rows and columns that have real ink in them, ignoring the outer
 * `edge` of the sheet (scan edges and page curls), specks, and anything thinner than `minInk` pixels in a row or column.
 * `gray` is 0..255 with ink dark. Returns null for a blank sheet.
 */
export function inkBounds(gray: Uint8Array | Uint8ClampedArray, w: number, h: number, { edge = 0.04, minInk = 2, pad = 0.015, threshold = 128 } = {}): Rect | null {
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  const ex = Math.floor(w * edge), ey = Math.floor(h * edge);
  for (let y = ey; y < h - ey; y++) for (let x = ex; x < w - ex; x++) if (gray[y * w + x]! < threshold) { rows[y]!++; cols[x]!++; }
  const span = (counts: Uint32Array) => {
    let lo = -1, hi = -1;
    for (let i = 0; i < counts.length; i++) if (counts[i]! >= minInk) { if (lo < 0) lo = i; hi = i; }
    return lo < 0 ? null : [lo, hi + 1] as const;
  };
  const sy = span(rows), sx = span(cols);
  if (!sx || !sy) return null;
  return [clamp(sx[0] / w - pad, 0, 1), clamp(sy[0] / h - pad, 0, 1), clamp(sx[1] / w + pad, 0, 1), clamp(sy[1] / h + pad, 0, 1)];
}
