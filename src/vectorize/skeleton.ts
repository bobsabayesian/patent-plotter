import type { XY } from '../vector/simplify';
import { simplifyXY } from '../vector/simplify';

/**
 * Patent drawings are black line art on white, so the lines are found the way a person would redraw them: take the
 * ink, thin every stroke to the single line down its middle, and follow those lines from end to end. (The photo edge
 * finder in ../outline/contours.ts would trace both sides of every stroke.)
 */

export interface SkeletonOptions {
  /** 0..255: pixels darker than this are ink; 0 picks it from the picture (Otsu) */
  threshold: number;
  /** ink specks smaller than this many pixels are dust and dropped */
  minBlob: number;
  /** a branch shorter than this many pixels, ending free at a junction, is a burr from thinning and is cut off */
  spur: number;
  /** drop what a scan leaves at the sheet's edge: solid bands, page curls, long thin lines near the border */
  cleanEdges: boolean;
  /** Douglas-Peucker tolerance, pixels */
  tolerance: number;
  /** lines shorter than this many pixels are dropped */
  minLength: number;
}

export const DEFAULT_SKELETON: SkeletonOptions = { threshold: 0, minBlob: 12, spur: 6, cleanEdges: true, tolerance: 0.8, minLength: 4 };

/** Otsu's threshold of 8-bit grey values. */
export function otsu(gray: Uint8Array | Uint8ClampedArray): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]!]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

/** 1 where there is ink. */
export function inkMask(gray: Uint8Array | Uint8ClampedArray, threshold: number): Uint8Array {
  const t = threshold > 0 ? threshold : otsu(gray);
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i]! <= t ? 1 : 0;
  return out;
}

const N8: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

/**
 * Drop 8-connected ink blobs that are not drawing: dust (fewer than `minBlob` pixels) and, with `cleanEdges`, what a
 * scan leaves at the sheet's edge: solid bands and bars touching it, anything lying wholly in the outer 4%, and long
 * thin lines (the paper's own edge, a binding shadow) in the outer 15%, and long sparse tangles of them that lie almost
 * wholly in that border (the paper's edge joined to a page curl). Header lettering and drawings are not long and sparse
 * in the border, so they stay; so does a frame that is joined to the drawing. Changes `m`.
 */
export function despeckle(m: Uint8Array, w: number, h: number, minBlob: number, cleanEdges = true): void {
  const seen = new Uint8Array(m.length);
  const stack: number[] = [];
  const EDGE = 2;
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || seen[s]) continue;
    const blob: number[] = [s];
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of N8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (m[q] && !seen[q]) { seen[q] = 1; stack.push(q); blob.push(q); }
      }
    }
    let drop = blob.length < minBlob;
    if (cleanEdges && !drop) {
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const touchesEdge = x0 < EDGE || y0 < EDGE || x1 >= w - EDGE || y1 >= h - EDGE;
      const solid = blob.length / (bw * bh) > 0.5;
      const inBand = x1 < 0.04 * w || x0 > 0.96 * w || y1 < 0.04 * h || y0 > 0.96 * h;
      const tallThin = bh >= 0.5 * h && bw <= 0.03 * w && (x1 < 0.15 * w || x0 > 0.85 * w);
      const wideThin = bw >= 0.5 * w && bh <= 0.03 * h && (y1 < 0.15 * h || y0 > 0.85 * h);
      const long = bw >= 0.5 * w || bh >= 0.5 * h;
      let borderTangle = false;
      if (long && !solid) {
        let inBorder = 0;
        for (const p of blob) { const x = p % w, y = (p - x) / w; if (x < 0.15 * w || x >= 0.85 * w || y < 0.15 * h || y >= 0.85 * h) inBorder++; }
        borderTangle = inBorder >= 0.9 * blob.length;
      }
      drop = (touchesEdge && solid && blob.length >= 30) || inBand || tallThin || wideThin || borderTangle;
    }
    if (drop) for (const p of blob) m[p] = 0;
  }
}

/** Zhang-Suen thinning: peel the outline off every stroke, two directions in turn, until only a one-pixel line is left. Changes `m`. */
export function thin(m: Uint8Array, w: number, h: number): void {
  // work on a copy with a one-pixel frame of zeros, so the neighbours never need a bounds check
  const W = w + 2, H = h + 2;
  const g = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[(y + 1) * W + x + 1] = m[y * w + x]!;
  const offs = [-W, -W + 1, 1, W + 1, W, W - 1, -1, -W - 1]; // P2..P9, clockwise from north
  const kill: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      kill.length = 0;
      for (let y = 1; y <= h; y++) {
        for (let x = 1; x <= w; x++) {
          const i = y * W + x;
          if (!g[i]) continue;
          const p2 = g[i + offs[0]!]!, p3 = g[i + offs[1]!]!, p4 = g[i + offs[2]!]!, p5 = g[i + offs[3]!]!;
          const p6 = g[i + offs[4]!]!, p7 = g[i + offs[5]!]!, p8 = g[i + offs[6]!]!, p9 = g[i + offs[7]!]!;
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) + (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (a !== 1) continue;
          if (step === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) kill.push(i);
        }
      }
      if (kill.length) changed = true;
      for (const i of kill) g[i] = 0;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = g[(y + 1) * W + x + 1]!;
}

/** Pixels the ring of 8 neighbours (clockwise from north) of `p` has set. */
function ring(m: Uint8Array, w: number, h: number, p: number): number[] {
  const x = p % w, y = (p - x) / w;
  return N8.map(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h ? m[ny * w + nx]! : 0; });
}

/** How many separate branches leave pixel `p`: runs of set neighbours round the ring, counting two sides of a corner as one. */
function branches(m: Uint8Array, w: number, h: number, p: number): number {
  const v = ring(m, w, h, p);
  for (let k = 1; k < 8; k += 2) if (v[(k + 7) % 8] && v[(k + 1) % 8]) v[k] = 1;
  let a = 0;
  for (let i = 0; i < 8; i++) if (!v[i] && v[(i + 1) % 8]) a++;
  return a;
}

/** Thinning leaves the odd corner pixel whose two neighbours already touch; take those out so a bend is not mistaken for a break. Changes `m`. */
function squareCorners(m: Uint8Array, w: number, h: number): void {
  for (let p = 0; p < m.length; p++) {
    if (!m[p]) continue;
    const x = p % w, y = (p - x) / w;
    const ns: [number, number][] = [];
    for (const [dx, dy] of N8) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && m[ny * w + nx]) ns.push([nx, ny]); }
    if (ns.length === 2 && Math.abs(ns[0]![0] - ns[1]![0]) <= 1 && Math.abs(ns[0]![1] - ns[1]![1]) <= 1) m[p] = 0;
  }
}

/**
 * Follow a one-pixel-wide skeleton into polylines. Pixels where a line ends or branches are nodes; each run of
 * pixels between nodes is one line. Touching node pixels are merged into one point (their centre) so lines meet
 * cleanly. Coordinates are pixel centres (x + 0.5).
 */
export function traceSkeleton(m: Uint8Array, w: number, h: number, o: Pick<SkeletonOptions, 'spur' | 'tolerance' | 'minLength'>): XY[][] {
  squareCorners(m, w, h);
  const nbrs = (p: number): number[] => {
    const x = p % w, y = (p - x) / w, out: number[] = [];
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && m[ny * w + nx]) out.push(ny * w + nx);
    }
    return out;
  };
  const near = (a: number, b: number) => Math.abs((a % w) - (b % w)) <= 1 && Math.abs(Math.floor(a / w) - Math.floor(b / w)) <= 1;
  const isNode = new Uint8Array(m.length);
  for (let p = 0; p < m.length; p++) if (m[p] && branches(m, w, h, p) !== 2) isNode[p] = 1;

  // merge touching node pixels into clusters, each represented by its centre
  const cluster = new Int32Array(m.length).fill(-1);
  const centres: XY[] = [];
  for (let s = 0; s < m.length; s++) {
    if (!isNode[s] || cluster[s]! >= 0) continue;
    const id = centres.length, stack = [s], members: number[] = [];
    cluster[s] = id;
    while (stack.length) {
      const p = stack.pop()!;
      members.push(p);
      for (const q of nbrs(p)) if (isNode[q] && cluster[q]! < 0) { cluster[q] = id; stack.push(q); }
    }
    let cx = 0, cy = 0;
    for (const p of members) { cx += (p % w) + 0.5; cy += Math.floor(p / w) + 0.5; }
    centres.push([cx / members.length, cy / members.length]);
  }

  interface Run { pts: XY[]; a: number; b: number } // a, b: cluster ids at the ends, -1 when the end is free
  const runs: Run[] = [];
  const used = new Uint8Array(m.length);
  const pt = (p: number): XY => [(p % w) + 0.5, Math.floor(p / w) + 0.5];
  const walk = (from: number, first: number): Run | null => {
    if (!isNode[first] && used[first]) return null;
    const pts: XY[] = [pt(from)];
    const a = isNode[from] ? cluster[from]! : -1;
    let prev = from, cur = first;
    for (;;) {
      pts.push(pt(cur));
      if (isNode[cur]) return cluster[cur] === a && pts.length <= 2 ? null : { pts, a, b: cluster[cur]! };
      used[cur] = 1;
      let next = nbrs(cur).filter((q) => q !== prev && (isNode[q] || !used[q]));
      if (next.length > 1) { const apart = next.filter((q) => !near(q, prev)); if (apart.length) next = apart; }
      const pick = next.find((q) => isNode[q]) ?? next[0];
      if (pick === undefined) return { pts, a, b: -1 };
      prev = cur; cur = pick;
    }
  };
  for (let p = 0; p < m.length; p++) {
    if (!isNode[p]) continue;
    for (const q of nbrs(p)) {
      if (isNode[q]) continue; // side by side: the same cluster, nothing to draw
      const r = walk(p, q);
      if (r) runs.push(r);
    }
  }
  // what is left: loops with no node on them (and the odd stray pixel)
  for (let p = 0; p < m.length; p++) {
    if (!m[p] || used[p] || isNode[p]) continue;
    used[p] = 1;
    const ns = nbrs(p);
    if (!ns.length) continue;
    const r = walk(p, ns[0]!);
    if (!r) continue;
    const first = r.pts[0]!, last = r.pts[r.pts.length - 1]!;
    if (r.pts.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1.5) r.pts.push(first);
    runs.push({ pts: r.pts, a: -1, b: -1 });
  }

  // cut burrs: a short run with a free end and the other end on a junction
  const arity = new Map<number, number>();
  for (const r of runs) { if (r.a >= 0) arity.set(r.a, (arity.get(r.a) ?? 0) + 1); if (r.b >= 0) arity.set(r.b, (arity.get(r.b) ?? 0) + 1); }
  const joined = (c: number) => c >= 0 && (arity.get(c) ?? 0) >= 3;
  const free = (c: number) => c < 0 || (arity.get(c) ?? 0) === 1;
  const kept = runs.filter((r) => !(pathLength(r.pts) < o.spur && ((free(r.a) && joined(r.b)) || (joined(r.a) && free(r.b)))));

  for (const r of kept) {
    if (r.a >= 0) r.pts[0] = centres[r.a]!;
    if (r.b >= 0) r.pts[r.pts.length - 1] = centres[r.b]!;
  }

  const out: XY[][] = [];
  for (const pts of joinThrough(kept, (c) => (arity.get(c) ?? 0) === 2)) {
    const line = simplifyXY(smooth(pts), o.tolerance);
    if (line.length > 1 && pathLength(line) >= o.minLength) out.push(line);
  }
  return out;
}

/** Join runs end to end through every node that only two run ends meet at (a bend that thinning marked as a break). */
function joinThrough(runs: { pts: XY[]; a: number; b: number }[], through: (cluster: number) => boolean): XY[][] {
  type R = { pts: XY[]; a: number; b: number };
  const at = new Map<number, { r: R; end: 'a' | 'b' }[]>();
  for (const r of runs) for (const end of ['a', 'b'] as const) { const c = r[end]; if (c >= 0 && through(c)) at.set(c, [...(at.get(c) ?? []), { r, end }]); }
  const done = new Set<R>();
  const out: XY[][] = [];
  /** the run joined to `r` at its `end`, with the end of it that is NOT at the join */
  const across = (r: R, end: 'a' | 'b') => {
    const c = r[end];
    const mates = at.get(c)?.filter((e) => !(e.r === r && e.end === end));
    const mate = mates?.length === 1 ? mates[0]! : null;
    return mate && !done.has(mate.r) ? mate : null;
  };
  for (const r of runs) {
    if (done.has(r)) continue;
    done.add(r);
    let pts = r.pts.slice();
    for (const dir of ['b', 'a'] as const) {
      let cur: R = r, end: 'a' | 'b' = dir;
      if (dir === 'a') pts.reverse();
      for (;;) {
        const mate = across(cur, end);
        if (!mate) break;
        done.add(mate.r);
        const next = mate.end === 'a' ? mate.r.pts : mate.r.pts.slice().reverse();
        pts = pts.concat(next.slice(1));
        cur = mate.r; end = mate.end === 'a' ? 'b' : 'a';
      }
      if (dir === 'a') pts.reverse();
    }
    out.push(pts);
  }
  return out;
}

const pathLength = (pts: XY[]) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); return l; };

/** Round off the stair-steps of a thinned line (ends stay put). */
function smooth(pts: XY[]): XY[] {
  let cur = pts;
  for (let k = 0; k < 2; k++) {
    if (cur.length < 4) return cur;
    cur = cur.map((p, i): XY => {
      if (i === 0 || i === cur.length - 1) return p;
      const a = cur[i - 1]!, b = cur[i + 1]!;
      return [p[0] * 0.5 + (a[0] + b[0]) * 0.25, p[1] * 0.5 + (a[1] + b[1]) * 0.25];
    });
  }
  return cur;
}

/** Order lines to cut down on pen travel: always go next to the nearest end of what is left, flipping the line if need be. */
export function orderLines(lines: XY[][]): XY[][] {
  const left = lines.slice(), out: XY[][] = [];
  let at: XY = [0, 0];
  while (left.length) {
    let best = 0, rev = false, bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const l = left[i]!, s = l[0]!, e = l[l.length - 1]!;
      const ds = (s[0] - at[0]) ** 2 + (s[1] - at[1]) ** 2, de = (e[0] - at[0]) ** 2 + (e[1] - at[1]) ** 2;
      if (ds < bd) { bd = ds; best = i; rev = false; }
      if (de < bd) { bd = de; best = i; rev = true; }
    }
    const l = left.splice(best, 1)[0]!;
    if (rev) l.reverse();
    out.push(l);
    at = l[l.length - 1]!;
  }
  return out;
}

/** Gray picture -> pen lines, in pixels. */
export function vectorizeLineArt(gray: Uint8Array | Uint8ClampedArray, w: number, h: number, opts: Partial<SkeletonOptions> = {}): XY[][] {
  const o = { ...DEFAULT_SKELETON, ...opts };
  const m = inkMask(gray, o.threshold);
  despeckle(m, w, h, o.minBlob, o.cleanEdges);
  thin(m, w, h);
  return orderLines(traceSkeleton(m, w, h, o));
}
