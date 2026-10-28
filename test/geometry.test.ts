import { describe, expect, it } from 'vitest';
import { alignTo, fitInside, resizeBox, snapAxis, snapMove, targetsFor, type Box } from '../src/geometry';
import { rotateLocal, placeText, placeFigure } from '../src/layout';
import { reviveDoc, type FigureEl, type TextEl } from '../src/doc';

const area: Box = [10, 10, 190, 277]; // A4 inside a 10 mm margin

describe('align and fit', () => {
  const b: Box = [50, 60, 40, 20];
  it('lines a box up with the margins or centres it', () => {
    expect(alignTo(b, area, 'left')).toEqual({ x: 10 });
    expect(alignTo(b, area, 'right')).toEqual({ x: 160 });
    expect(alignTo(b, area, 'center')).toEqual({ x: 85 });
    expect(alignTo(b, area, 'top')).toEqual({ y: 10 });
    expect(alignTo(b, area, 'bottom')).toEqual({ y: 267 });
    expect(alignTo(b, area, 'middle')).toEqual({ y: 138.5 });
  });
  it('fits a box to the area, keeping its shape and centring it', () => {
    const wide = fitInside([0, 0, 100, 50], area); // limited by width
    expect(wide.w).toBe(190);
    expect(wide.x).toBe(10);
    expect(wide.y).toBeCloseTo(10 + (277 - 95) / 2);
    const tall = fitInside([0, 0, 50, 400], area); // limited by height
    expect(tall.w).toBeCloseTo(34.625);
    expect(tall.x).toBeCloseTo(10 + (190 - 34.625) / 2);
    expect(tall.y).toBe(10);
  });
});

describe('resizeBox', () => {
  const b: Box = [20, 30, 100, 50];
  it('drags a corner, keeping the shape and the opposite corner fixed', () => {
    expect(resizeBox(b, 'se', { x: 170, y: 999 })).toEqual({ x: 20, y: 30, w: 150 }); // y of the pointer is ignored
    expect(resizeBox(b, 'nw', { x: 70, y: 0 })).toEqual({ x: 70, y: 55, w: 50 }); // right 120, bottom 80 stay put
    expect(resizeBox(b, 'ne', { x: 80, y: 0 })).toEqual({ x: 20, y: 50, w: 60 }); // bottom 80 stays: height 30
    expect(resizeBox(b, 'sw', { x: 0, y: 0 })).toEqual({ x: 0, y: 30, w: 120 });
  });
  it('changes only the width from a side, and never below the minimum', () => {
    expect(resizeBox(b, 'e', { x: 90, y: 0 })).toEqual({ x: 20, y: 30, w: 70 });
    expect(resizeBox(b, 'w', { x: 60, y: 0 })).toEqual({ x: 60, y: 30, w: 60 });
    expect(resizeBox(b, 'se', { x: 21, y: 0 }).w).toBe(5);
    expect(resizeBox(b, 'w', { x: 500, y: 0 })).toEqual({ x: 115, y: 30, w: 5 });
  });
});

describe('snapping', () => {
  it('picks the nearest target within the threshold, or none', () => {
    const near = snapAxis([10.8, 50], [0, 11, 40], 2);
    expect(near!.delta).toBeCloseTo(0.2);
    expect(near!.at).toBe(11);
    expect(snapAxis([10.8], [0, 40], 2)).toBeNull();
    expect(snapAxis([5], [3.5, 6.5, 5.5], 2)).toEqual({ delta: 0.5, at: 5.5 });
  });
  it('snaps a moved box by its edge or its middle, and says where the guides go', () => {
    const t = targetsFor({ w: 210, h: 297 }, 12, [[100, 100, 40, 40]]);
    // the box's middle (x = 104.2 + 0.5) is near the page middle (105)
    const s = snapMove([84.7, 20, 40, 20], t, 1.5);
    expect(s.dx).toBeCloseTo(0.3);
    expect(s.guides).toContainEqual({ axis: 'x', at: 105 });
    // its top is 0.4 below the margin line
    expect(snapMove([30, 12.4, 10, 10], t, 1.5).dy).toBeCloseTo(-0.4);
    // another box's edge pulls it, too
    expect(snapMove([60.5, 200, 40, 10], t, 1.5)).toMatchObject({ dx: -0.5, guides: [{ axis: 'x', at: 100 }] });
    expect(snapMove([30, 30, 10, 10], t, 1.5)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});

describe('rotation', () => {
  const local = { lines: [[[0, 0], [10, 0], [10, 4]] as [number, number][]], w: 10, h: 4 };
  it('turns a frame clockwise by quarter turns, keeping it at the origin', () => {
    const r1 = rotateLocal(local, 1);
    expect([r1.w, r1.h]).toEqual([4, 10]);
    expect(r1.lines[0]).toEqual([[4, 0], [4, 10], [0, 10]]); // the top edge became the right edge
    const r2 = rotateLocal(local, 2);
    expect([r2.w, r2.h]).toEqual([10, 4]);
    expect(r2.lines[0]).toEqual([[10, 4], [0, 4], [0, 0]]);
    const r3 = rotateLocal(local, 3);
    expect(r3.lines[0]).toEqual([[0, 10], [0, 0], [4, 0]]);
    expect(rotateLocal(rotateLocal(local, 1), 3).lines).toEqual(local.lines); // a quarter turn and back
    expect(rotateLocal(local, 4)).toBe(local);
    expect(rotateLocal(local, -1).lines).toEqual(r3.lines);
  });
  const text = (o: Partial<TextEl> = {}): TextEl => ({ id: 't', kind: 'text', label: 'T', text: 'hello', pen: 0, x: 10, y: 20, w: 100, sizeMm: 6, align: 'left', rot: 0, ...o });
  it('turns text and its box together', () => {
    const flat = placeText(text()), up = placeText(text({ rot: 3 }));
    expect(up.box[2]).toBeCloseTo(flat.box[3]);
    expect(up.box[3]).toBeCloseTo(flat.box[2]);
    expect(up.box[0]).toBe(10);
    expect(up.box[1]).toBe(20);
  });
  it('aligns the rows of text inside the box', () => {
    const xs = (a: TextEl['align']) => placeText(text({ align: a })).lines.flat().map((p) => p[0]);
    const [l, c, r] = (['left', 'center', 'right'] as const).map((a) => xs(a));
    expect(Math.min(...l!)).toBeCloseTo(10);
    expect(Math.max(...r!)).toBeLessThanOrEqual(110.01);
    expect(Math.min(...r!)).toBeGreaterThan(Math.min(...c!));
    expect(Math.min(...c!)).toBeGreaterThan(Math.min(...l!));
  });
  it('sizes a rotated drawing by its turned width', () => {
    const v = { lines: [[[0, 0], [200, 100]] as [number, number][]], width: 300, height: 300 };
    const fig = (rot: FigureEl['rot']): FigureEl => ({ id: 'f', kind: 'figure', sheet: 0, pen: 0, x: 5, y: 5, w: 50, method: 'lineart', crop: [0, 0, 0, 0], cleanEdges: true, rot });
    expect(placeFigure(fig(0), v).box).toEqual([5, 5, 50, 25]);
    expect(placeFigure(fig(1), v).box).toEqual([5, 5, 50, 100]); // turned: 100 wide by 200 tall, scaled to 50 wide
  });
});

describe('saved sessions', () => {
  it('give older elements a turn of 0 and left-aligned text', () => {
    const d = reviveDoc({ elements: [{ id: 'a', kind: 'figure', sheet: 0, x: 1, y: 2, w: 3 }, { id: 'b', kind: 'text', text: 'x', x: 1, y: 2, w: 3, rot: 7, align: 'weird' }] });
    expect(d.elements[0]).toMatchObject({ rot: 0 });
    expect(d.elements[1]).toMatchObject({ rot: 3, align: 'left' });
  });
});
