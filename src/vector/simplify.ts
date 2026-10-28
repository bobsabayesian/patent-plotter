export type XY = [number, number];

/** Douglas-Peucker; closed rings (first == last) are split at the farthest point first. */
export function simplifyXY(pts: XY[], tol: number): XY[] {
  if (pts.length < 3) return pts;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) {
    let k = 1;
    let far = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i]![0] - first[0], pts[i]![1] - first[1]);
      if (d > far) { far = d; k = i; }
    }
    return [...simplifyXY(pts.slice(0, k + 1), tol), ...simplifyXY(pts.slice(k), tol).slice(1)];
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i]![0] - ax) * dy - (pts[i]![1] - ay) * dx) / len;
      if (d > worst) { worst = d; idx = i; }
    }
    if (worst > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
