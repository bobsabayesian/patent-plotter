import { describe, expect, it } from 'vitest';
import { cropFromRect, drawRect, inkBounds, isWhole, MIN_SIDE, moveRect, rectFromCrop, resizeRect, type Rect } from '../src/crop';

describe('crop and rectangle', () => {
  it('convert both ways: a crop is what is trimmed off [top, right, bottom, left]', () => {
    expect(rectFromCrop([0.1, 0.2, 0.3, 0.4])).toEqual([0.4, 0.1, 0.8, 0.7]);
    const r: Rect = [0.25, 0.125, 0.75, 0.5];
    expect(cropFromRect(r)).toEqual([0.125, 0.25, 0.5, 0.25]);
    expect(rectFromCrop(cropFromRect(r))).toEqual(r);
    expect(isWhole(rectFromCrop([0, 0, 0, 0]))).toBe(true);
    expect(isWhole([0.1, 0, 1, 1])).toBe(false);
  });
});

describe('drawing, resizing and moving the rectangle', () => {
  it('draws from any corner to any corner, kept on the sheet', () => {
    expect(drawRect({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.9 })).toEqual([0.2, 0.3, 0.6, 0.9]);
    expect(drawRect({ x: 0.6, y: 0.9 }, { x: 0.2, y: 0.3 })).toEqual([0.2, 0.3, 0.6, 0.9]);
    expect(drawRect({ x: -0.5, y: 0.5 }, { x: 1.5, y: 2 })).toEqual([0, 0.5, 1, 1]);
  });
  it('never draws one smaller than the minimum, even at the sheet corner', () => {
    const r = drawRect({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    expect(r[2] - r[0]).toBeGreaterThanOrEqual(MIN_SIDE);
    expect(r[3] - r[1]).toBeGreaterThanOrEqual(MIN_SIDE);
    const corner = drawRect({ x: 1, y: 1 }, { x: 1, y: 1 });
    expect(corner[2]).toBeLessThanOrEqual(1);
    expect(corner[2] - corner[0]).toBeGreaterThanOrEqual(MIN_SIDE - 1e-9);
  });
  const r: Rect = [0.2, 0.2, 0.6, 0.6];
  it('moves only the edges a handle owns', () => {
    expect(resizeRect(r, 'e', { x: 0.9, y: 0.9 })).toEqual([0.2, 0.2, 0.9, 0.6]);
    expect(resizeRect(r, 'nw', { x: 0.1, y: 0.05 })).toEqual([0.1, 0.05, 0.6, 0.6]);
    expect(resizeRect(r, 's', { x: 0, y: 0.8 })).toEqual([0.2, 0.2, 0.6, 0.8]);
    expect(resizeRect(r, 'se', { x: 0.7, y: 0.75 })).toEqual([0.2, 0.2, 0.7, 0.75]);
  });
  it('cannot be dragged past the other edge or off the sheet', () => {
    expect(resizeRect(r, 'w', { x: 0.9, y: 0 })[0]).toBeCloseTo(0.6 - MIN_SIDE);
    expect(resizeRect(r, 'n', { x: 0, y: -3 })[1]).toBe(0);
    expect(resizeRect(r, 'e', { x: 5, y: 0 })[2]).toBe(1);
    expect(resizeRect(r, 'e', { x: 0, y: 0 })[2]).toBeCloseTo(0.2 + MIN_SIDE);
  });
  it('slides as a whole and stops at the edge', () => {
    expect(moveRect(r, 0.1, -0.1)).toEqual([0.3, 0.1, 0.7, 0.5].map((n) => expect.closeTo(n)));
    const far = moveRect(r, 5, 5);
    expect(far[2]).toBe(1); expect(far[3]).toBe(1);
    expect(far[2] - far[0]).toBeCloseTo(0.4);
    const back = moveRect(r, -5, -5);
    expect([back[0], back[1]]).toEqual([0, 0]);
  });
});

describe('inkBounds', () => {
  const sheet = (w: number, h: number, paint: (set: (x: number, y: number) => void) => void) => {
    const g = new Uint8Array(w * h).fill(255);
    paint((x, y) => { g[y * w + x] = 0; });
    return g;
  };
  it('finds the box round the drawing, with a little room', () => {
    const g = sheet(200, 300, (set) => { for (let x = 50; x < 150; x++) for (let y = 100; y < 200; y++) if (x === 50 || x === 149 || y === 100 || y === 199) set(x, y); });
    const b = inkBounds(g, 200, 300)!;
    expect(b[0]).toBeCloseTo(50 / 200 - 0.015); expect(b[2]).toBeCloseTo(150 / 200 + 0.015);
    expect(b[1]).toBeCloseTo(100 / 300 - 0.015); expect(b[3]).toBeCloseTo(200 / 300 + 0.015);
  });
  it('ignores specks, scan edges and thin stray marks', () => {
    const g = sheet(200, 300, (set) => {
      for (let x = 50; x < 150; x++) for (let y = 100; y < 200; y++) if (x === 50 || x === 149 || y === 100 || y === 199) set(x, y);
      set(10, 150); // a speck
      for (let y = 0; y < 300; y++) set(1, y); // the paper's edge, in the outer band
      for (let x = 0; x < 200; x++) set(x, 298);
    });
    const b = inkBounds(g, 200, 300)!;
    expect(b[0]).toBeGreaterThan(0.2); expect(b[2]).toBeLessThan(0.8);
    expect(b[1]).toBeGreaterThan(0.3); expect(b[3]).toBeLessThan(0.7);
  });
  it('says so for a blank sheet', () => {
    expect(inkBounds(new Uint8Array(100 * 100).fill(255), 100, 100)).toBeNull();
  });
});
