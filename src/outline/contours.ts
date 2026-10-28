import { contours } from 'd3-contour';
import { boxBlur } from '../image/blur';
import { simplifyXY, type XY } from '../vector/simplify';

export interface ContourOptions {
  /** how many brightness levels to draw a line at */
  levels: number;
  /** blur radius (px) applied before tracing: bigger gives smoother, simpler lines */
  smoothing: number;
}

/** Brightness values that split the picture into `n + 1` parts of equal area, so every line has something to trace. */
export function quantileLevels(values: Float32Array, n: number): number[] {
  const step = Math.max(1, Math.floor(values.length / 20000));
  const sample: number[] = [];
  for (let i = 0; i < values.length; i += step) sample.push(values[i]!);
  sample.sort((a, b) => a - b);
  const out: number[] = [];
  for (let k = 1; k <= n; k++) {
    const v = sample[Math.min(sample.length - 1, Math.floor((k / (n + 1)) * sample.length))]!;
    // a level at the very darkest or brightest value has no line to trace
    if (v <= sample[0]! + 1e-4 || v >= sample[sample.length - 1]! - 1e-4) continue;
    if (!out.length || v - out[out.length - 1]! > 1e-4) out.push(v);
  }
  // a picture of only two tones has all its area at the extremes: trace between them
  const lo = sample[0]!, hi = sample[sample.length - 1]!;
  if (!out.length && hi - lo > 1e-4) out.push((lo + hi) / 2);
  return out;
}

const PAD = 1;
const BORDER_EPS = 0.01;

/**
 * Lines of equal brightness through the photo, like the contours on a map. Each level is traced with
 * marching squares (d3-contour) and the pieces of its outline that just run along the picture's edge are
 * removed, leaving only real contour lines. Coordinates are in pixels (a pixel i is centred at i + 0.5).
 */
export function contourLines(luma: Float32Array, w: number, h: number, o: ContourOptions): XY[][] {
  const field = o.smoothing > 0 ? boxBlur(luma, w, h, Math.round(o.smoothing)) : luma;
  return traceLevels(field, w, h, quantileLevels(field, Math.max(1, Math.round(o.levels))));
}

/** Trace `field` at each level with marching squares, cutting out the pieces that just run along the picture's edge. */
export function traceLevels(field: Float32Array, w: number, h: number, levels: number[]): XY[][] {
  // pad with a value below every level, so regions touching the edge close just at the edge samples
  const W = w + 2 * PAD, H = h + 2 * PAD;
  const padded = new Array<number>(W * H).fill(-1000);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) padded[(y + PAD) * W + x + PAD] = field[y * w + x]!;
  const out: XY[][] = [];
  const onBorder = (p: XY, q: XY) =>
    (Math.abs(p[0] - 0.5) < BORDER_EPS && Math.abs(q[0] - 0.5) < BORDER_EPS) ||
    (Math.abs(p[0] - (w - 0.5)) < BORDER_EPS && Math.abs(q[0] - (w - 0.5)) < BORDER_EPS) ||
    (Math.abs(p[1] - 0.5) < BORDER_EPS && Math.abs(q[1] - 0.5) < BORDER_EPS) ||
    (Math.abs(p[1] - (h - 0.5)) < BORDER_EPS && Math.abs(q[1] - (h - 0.5)) < BORDER_EPS);
  for (const level of contours().size([W, H]).thresholds(levels)(padded)) {
    for (const polygon of level.coordinates) {
      for (const ring of polygon) {
        const pts = ring.map(([x, y]): XY => [x! - PAD, y! - PAD]);
        const n = pts.length - 1; // the ring repeats its first point at the end
        const border = Array.from({ length: n }, (_, i) => onBorder(pts[i]!, pts[i + 1]!));
        const start = border.findIndex((b) => b);
        if (start < 0) { out.push(pts); continue; } // a closed loop that never touches the edge
        // walk the ring from just after a border segment, cutting at every border segment
        let cur: XY[] = [];
        for (let k = 1; k <= n; k++) {
          const i = (start + k) % n;
          if (border[i]) { if (cur.length > 1) out.push(cur); cur = []; continue; }
          if (!cur.length) cur.push(pts[i]!);
          cur.push(pts[i + 1]!); // segment i runs from pts[i] to pts[i + 1]
        }
        if (cur.length > 1) out.push(cur);
      }
    }
  }
  return out;
}

export interface EdgeOptions {
  /** blur radius (px): the size of detail that counts as an edge (bigger finds only broad edges) */
  scale: number;
  /** 0 to 1: how strong an edge must be, as a share of the picture's strong edges (higher keeps fewer) */
  strength: number;
}

/**
 * Edges of the photo: where the brightness changes fastest. The zero crossings of a difference of two blurs (the
 * Marr-Hildreth detector) are traced as thin closed-up lines, and the pieces where the brightness barely changes
 * (weak texture, noise) are dropped. Strength is relative to the picture's strongest edges, so one setting works
 * for flat and contrasty photos alike. Coordinates are in pixels.
 */
export function edgeLines(luma: Float32Array, w: number, h: number, o: EdgeOptions): XY[][] {
  const r = Math.max(1, Math.round(o.scale));
  const fine = boxBlur(boxBlur(luma, w, h, r), w, h, r), coarse = boxBlur(boxBlur(luma, w, h, Math.round(r * 1.6) + 1), w, h, Math.round(r * 1.6) + 1);
  const dog = new Float32Array(w * h);
  for (let i = 0; i < dog.length; i++) dog[i] = fine[i]! - coarse[i]!;
  // edge strength: the slope of the smoothed picture
  const mag = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = fine[y * w + Math.min(w - 1, x + 1)]! - fine[y * w + Math.max(0, x - 1)]!;
    const gy = fine[Math.min(h - 1, y + 1) * w + x]! - fine[Math.max(0, y - 1) * w + x]!;
    mag[y * w + x] = Math.hypot(gx, gy);
  }
  const sorted = Array.from(mag).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)]!;
  const min = ref * Math.min(1, Math.max(0, o.strength));
  const at = (p: XY) => mag[Math.min(h - 1, Math.max(0, Math.floor(p[1]))) * w + Math.min(w - 1, Math.max(0, Math.floor(p[0])))]!;
  const out: XY[][] = [];
  const GAP = 4; // a weak stretch of up to this many points inside a strong edge is bridged
  const STRONG = 1.7; // a stretch is kept only if some point on it is this much above the threshold (hysteresis: faint wiggles on their own go)
  const MIN_PTS = 6 + 3 * r;
  for (const line of traceLevels(dog, w, h, [0])) {
    const closed = line.length > 2 && line[0]![0] === line[line.length - 1]![0] && line[0]![1] === line[line.length - 1]![1];
    let cur: XY[] = [], weak = 0, peak = 0;
    const flush = () => {
      const kept = cur.slice(0, cur.length - weak);
      if (kept.length >= MIN_PTS && peak >= min * STRONG) out.push(smoothLine(kept, Math.max(2, r + 1), closed && kept.length === line.length));
      cur = []; weak = 0; peak = 0;
    };
    for (const p of line) {
      const m = at(p);
      if (m >= min) { cur.push(p); weak = 0; if (m > peak) peak = m; }
      else if (cur.length && weak < GAP) { cur.push(p); weak++; }
      else flush();
    }
    flush();
  }
  return out;
}

/** Round off the stair-steps of a traced line: each point moves toward the average of its neighbours (ends stay put on open lines). */
function smoothLine(pts: XY[], passes: number, closed: boolean): XY[] {
  let cur = pts;
  for (let k = 0; k < passes * 3; k++) {
    const n = cur.length;
    cur = cur.map((p, i): XY => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const a = cur[(i - 1 + n) % n]!, b = cur[(i + 1) % n]!;
      return [p[0] * 0.5 + (a[0] + b[0]) * 0.25, p[1] * 0.5 + (a[1] + b[1]) * 0.25];
    });
  }
  return cur;
}

/** Simplify, convert to mm with `toMm`, and drop lines shorter than `minLengthMm`. */
export function finishLines(lines: XY[][], toMm: (p: XY) => XY, tolMm: number, minLengthMm: number): XY[][] {
  const out: XY[][] = [];
  for (const l of lines) {
    const mm = simplifyXY(l.map(toMm), tolMm);
    let len = 0;
    for (let i = 1; i < mm.length; i++) len += Math.hypot(mm[i]![0] - mm[i - 1]![0], mm[i]![1] - mm[i - 1]![1]);
    if (mm.length > 1 && len >= minLengthMm) out.push(mm);
  }
  return out;
}

/**
 * Which picture pixels lie within `radiusMm` of any of `lines` (given in mm, on a picture drawn at `scale` mm per
 * pixel from `offset`): 1 where shading should be cleared away.
 */
export function clearanceMask(lines: XY[][], w: number, h: number, offsetX: number, offsetY: number, scale: number, radiusMm: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const r = radiusMm / scale, ri = Math.ceil(r);
  const stamp = (cx: number, cy: number) => {
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
    }
  };
  for (const l of lines) {
    for (let i = 1; i < l.length; i++) {
      const ax = (l[i - 1]![0] - offsetX) / scale, ay = (l[i - 1]![1] - offsetY) / scale, bx = (l[i]![0] - offsetX) / scale, by = (l[i]![1] - offsetY) / scale;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= n; k++) stamp(Math.floor(ax + ((bx - ax) * k) / n), Math.floor(ay + ((by - ay) * k) / n));
    }
  }
  return out;
}
