import { describe, expect, it } from 'vitest';
import { vectorizeLineArt } from '../src/vectorize/skeleton';

/** A white page with black ink drawn by `paint(set)`. */
function page(w: number, h: number, paint: (ink: (x: number, y: number, r?: number) => void) => void) {
  const g = new Uint8Array(w * h).fill(255);
  paint((cx, cy, r = 1.5) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (x >= 0 && y >= 0 && x < w && y < h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y * w + x] = 0;
  });
  return g;
}
const length = (l: [number, number][]) => l.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l[i - 1]![0], p[1] - l[i - 1]![1]) : 0), 0);

describe('vectorizeLineArt', () => {
  it('turns a thick horizontal stroke into one line down its middle', () => {
    const g = page(100, 40, (ink) => { for (let x = 10; x <= 90; x += 0.5) ink(x, 20, 3); });
    const lines = vectorizeLineArt(g, 100, 40);
    expect(lines).toHaveLength(1);
    const l = lines[0]!;
    expect(length(l)).toBeGreaterThan(70);
    for (const [, y] of l) expect(Math.abs(y - 20.5)).toBeLessThan(1.2);
  });

  it('keeps a ring as one closed line', () => {
    const g = page(100, 100, (ink) => { for (let a = 0; a < 6.3; a += 0.02) ink(50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a), 2); });
    const lines = vectorizeLineArt(g, 100, 100);
    expect(lines).toHaveLength(1);
    const l = lines[0]!;
    expect(Math.hypot(l[0]![0] - l[l.length - 1]![0], l[0]![1] - l[l.length - 1]![1])).toBeLessThan(2);
    expect(length(l)).toBeGreaterThan(2 * Math.PI * 30 * 0.9);
  });

  it('splits a cross into four arms that meet at one point', () => {
    const g = page(100, 100, (ink) => { for (let t = 10; t <= 90; t += 0.5) { ink(t, 50, 2); ink(50, t, 2); } });
    const lines = vectorizeLineArt(g, 100, 100);
    expect(lines).toHaveLength(4);
    const ends = lines.flatMap((l) => [l[0]!, l[l.length - 1]!]).filter(([x, y]) => Math.abs(x - 50) < 3 && Math.abs(y - 50) < 3);
    expect(ends).toHaveLength(4);
    const [c] = ends;
    for (const e of ends) expect(Math.hypot(e[0] - c![0], e[1] - c![1])).toBeLessThan(0.01);
  });

  it('drops dust and does not turn thinning burrs into branches', () => {
    const g = page(100, 40, (ink) => { for (let x = 10; x <= 90; x += 0.5) ink(x, 20, 3.5); ink(50, 5, 0.7); });
    const lines = vectorizeLineArt(g, 100, 40);
    expect(lines).toHaveLength(1);
  });

  it('orders the lines so the pen does not jump back and forth', () => {
    const g = page(200, 40, (ink) => { for (const x0 of [10, 60, 110, 160]) for (let x = x0; x <= x0 + 30; x += 0.5) ink(x, 20, 1.5); });
    const lines = vectorizeLineArt(g, 200, 40);
    expect(lines).toHaveLength(4);
    const starts = lines.map((l) => Math.min(l[0]![0], l[l.length - 1]![0]));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});
