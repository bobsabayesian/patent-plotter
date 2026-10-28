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

  it('ignores the black bands and bars a scan leaves at the sheet edge, but keeps a drawn border joined to the drawing', () => {
    const g = page(120, 100, (ink) => { for (let x = 0; x < 120; x += 0.5) for (let y = 90; y < 100; y += 0.5) ink(x, y, 0.4); for (let y = 0; y < 60; y += 0.5) ink(0.5, y, 0.8); for (let a = 0; a < 6.3; a += 0.03) ink(60 + 20 * Math.cos(a), 40 + 20 * Math.sin(a), 1.5); });
    const lines = vectorizeLineArt(g, 120, 100);
    expect(lines).toHaveLength(1); // the ring only
    const frame = page(120, 100, (ink) => { for (let t = 1; t < 119; t += 0.5) { ink(t, 1, 1); ink(t, 98, 1); } for (let t = 1; t < 99; t += 0.5) { ink(1, t, 1); ink(118, t, 1); } for (let a = 0; a < 6.3; a += 0.03) ink(60 + 28 * Math.cos(a), 50 + 28 * Math.sin(a), 1.2); for (let t = 1; t < 22; t += 0.5) ink(60, t, 1); });
    const border = vectorizeLineArt(frame, 120, 100);
    expect(border.length).toBeGreaterThan(0);
    expect(border.reduce((n, l) => n + length(l), 0)).toBeGreaterThan(550); // the frame and the ring
  });

  it('drops the paper edge, a page curl and a binding shadow, but not drawing near them', () => {
    const g = page(200, 300, (ink) => {
      for (let y = 10; y < 290; y += 0.5) ink(176, y, 0.8); // the paper's edge, a long thin line near the right
      for (let x = 5; x < 150; x += 0.5) ink(x, 292, 0.8); // a line along the bottom
      for (let a = 0; a < 6.3; a += 0.03) ink(90 + 30 * Math.cos(a), 150 + 30 * Math.sin(a), 1.5); // the drawing
      for (let y = 120; y < 180; y += 0.5) ink(197, y, 0.8); // a short mark in the outer band: still scan debris
    });
    expect(vectorizeLineArt(g, 200, 300)).toHaveLength(1);
    expect(vectorizeLineArt(g, 200, 300, { cleanEdges: false }).length).toBeGreaterThan(1);
  });

  it('clears a ragged black band along the edge even when it is joined to a mark that runs up the page', () => {
    const g = page(200, 300, (ink) => {
      for (let x = 0; x < 200; x += 0.5) { const top = 275 + 3 * Math.sin(x / 4); for (let y = top; y < 300; y += 0.5) ink(x, y, 0.4); } // the band, with a wavy top edge
      for (let y = 100; y < 280; y += 0.5) ink(2, y, 0.8); // a bar at the left edge, joined to the band
      for (let a = 0; a < 6.3; a += 0.03) ink(100 + 30 * Math.cos(a), 150 + 30 * Math.sin(a), 1.5); // the drawing
    });
    const lines = vectorizeLineArt(g, 200, 300);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.every(([, y]) => y < 200)).toBe(true);
  });

  it('keeps a drawing that has solid areas, and a sheet with no band at all', () => {
    const g = page(200, 300, (ink) => { for (let x = 60; x < 140; x += 0.5) for (let y = 100; y < 130; y += 0.5) ink(x, y, 0.4); }); // a solid block in the middle
    expect(vectorizeLineArt(g, 200, 300).length).toBeGreaterThan(0);
    const frame = page(200, 300, (ink) => { for (let t = 0; t < 200; t += 0.5) { ink(t, 20, 1); ink(t, 280, 1); } for (let t = 20; t < 280; t += 0.5) { ink(20, t, 1); ink(180, t, 1); } for (let a = 0; a < 6.3; a += 0.03) ink(100 + 30 * Math.cos(a), 150 + 30 * Math.sin(a), 1.5); for (let t = 20; t < 120; t += 0.5) ink(100, t, 1); }); // a frame, joined to the ring by a spoke
    expect(vectorizeLineArt(frame, 200, 300).reduce((n, l) => n + length(l), 0)).toBeGreaterThan(900); // frame and ring both survive
  });

  it('orders the lines so the pen does not jump back and forth', () => {
    const g = page(200, 40, (ink) => { for (const x0 of [10, 60, 110, 160]) for (let x = x0; x <= x0 + 30; x += 0.5) ink(x, 20, 1.5); });
    const lines = vectorizeLineArt(g, 200, 40);
    expect(lines).toHaveLength(4);
    const starts = lines.map((l) => Math.min(l[0]![0], l[l.length - 1]![0]));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});
