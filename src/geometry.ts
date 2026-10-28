/** The arithmetic behind the layout tools: boxes are [x, y, width, height] in mm on the page. */
export type Box = [number, number, number, number];
export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Handle = 'nw' | 'ne' | 'se' | 'sw' | 'e' | 'w';

/** Where to put `b`'s corner so it lines up with `how` of `area`; only the axis that `how` is about is returned. */
export function alignTo(b: Box, area: Box, how: Align): { x?: number; y?: number } {
  switch (how) {
    case 'left': return { x: area[0] };
    case 'center': return { x: area[0] + (area[2] - b[2]) / 2 };
    case 'right': return { x: area[0] + area[2] - b[2] };
    case 'top': return { y: area[1] };
    case 'middle': return { y: area[1] + (area[3] - b[3]) / 2 };
    case 'bottom': return { y: area[1] + area[3] - b[3] };
  }
}

/** The largest size of `b` (same shape) that fits in `area`, centred in it: the new corner and width. */
export function fitInside(b: Box, area: Box): { x: number; y: number; w: number } {
  const s = Math.min(area[2] / b[2], area[3] / b[3]);
  const w = b[2] * s, h = b[3] * s;
  return { x: area[0] + (area[2] - w) / 2, y: area[1] + (area[3] - h) / 2, w };
}

/**
 * Drag a handle of `b` to `p`. Corner handles keep the shape (the width follows the pointer's x, the height follows the
 * width) and hold the opposite corner still; the side handles of text change only the width. The width never goes below `minW`.
 */
export function resizeBox(b: Box, handle: Handle, p: { x: number; y: number }, minW = 5): { x: number; y: number; w: number } {
  const [x, y, w0, h0] = b;
  const right = x + w0, bottom = y + h0;
  const west = handle === 'nw' || handle === 'sw' || handle === 'w';
  const w = Math.max(minW, west ? right - p.x : p.x - x);
  const nx = west ? right - w : x;
  const corner = handle.length === 2;
  const h = corner ? (w * h0) / w0 : h0;
  return { x: nx, y: corner && handle[0] === 'n' ? bottom - h : y, w };
}

export interface Targets { xs: number[]; ys: number[] }

/** The closest target to any of `values` within `threshold`: how far to move, and the target it lands on. */
export function snapAxis(values: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const v of values) for (const t of targets) {
    const d = t - v;
    if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
  }
  return best;
}

/** What things snap to: the page edges and middle, the margin lines, and the edges and middles of the other boxes. */
export function targetsFor(page: { w: number; h: number }, margin: number, others: Box[]): Targets {
  const xs = [0, margin, page.w / 2, page.w - margin, page.w];
  const ys = [0, margin, page.h / 2, page.h - margin, page.h];
  for (const [x, y, w, h] of others) { xs.push(x, x + w / 2, x + w); ys.push(y, y + h / 2, y + h); }
  return { xs, ys };
}

/** Snap a box being moved: its left, middle and right edges against the x targets, its top, middle and bottom against y. */
export function snapMove(b: Box, t: Targets, threshold: number): { dx: number; dy: number; guides: { axis: 'x' | 'y'; at: number }[] } {
  const sx = snapAxis([b[0], b[0] + b[2] / 2, b[0] + b[2]], t.xs, threshold);
  const sy = snapAxis([b[1], b[1] + b[3] / 2, b[1] + b[3]], t.ys, threshold);
  const guides: { axis: 'x' | 'y'; at: number }[] = [];
  if (sx) guides.push({ axis: 'x', at: sx.at });
  if (sy) guides.push({ axis: 'y', at: sy.at });
  return { dx: sx?.delta ?? 0, dy: sy?.delta ?? 0, guides };
}
