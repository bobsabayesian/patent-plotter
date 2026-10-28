import { describe, expect, it } from 'vitest';
import { emptyDoc, reviveDoc } from '../src/doc';
import { useStore } from '../src/store';

describe('sources in a saved session', () => {
  const doc = { sources: [{ id: 'a1b2c3d4', name: 'US261', pages: 4 }], elements: [
    { id: 'f1', kind: 'figure', src: 'a1b2c3d4', page: 1, x: 5, y: 6, w: 100 },
    { id: 'f2', kind: 'figure', src: 'a1b2c3d4', page: 99, x: 5, y: 6, w: 100 },
    { id: 'f3', kind: 'figure', src: 'deadbeef', page: 0, x: 5, y: 6, w: 100 },
    { id: 'old', kind: 'figure', sheet: 2, x: 5, y: 6, w: 100 },
    { id: 't1', kind: 'text', text: 'hi', x: 1, y: 2, w: 50 },
  ] };
  it('keeps drawings whose PDF is still listed, and puts a stray page number back in range', () => {
    const d = reviveDoc(doc);
    expect(d.sources).toEqual([{ id: 'a1b2c3d4', name: 'US261', pages: 4 }]);
    expect(d.elements.map((e) => e.id)).toEqual(['f1', 'f2', 't1']);
    expect(d.elements[0]).toMatchObject({ src: 'a1b2c3d4', page: 1 });
    expect(d.elements[1]).toMatchObject({ page: 3 });
  });
  it('drops drawings that have no PDF to draw from, such as those from before uploads (text stays)', () => {
    const d = reviveDoc({ elements: doc.elements });
    expect(d.sources).toEqual([]);
    expect(d.elements.map((e) => e.id)).toEqual(['t1']);
  });
  it('ignores damaged sources', () => {
    const d = reviveDoc({ sources: [null, { id: 'nope' }, { id: 'a1b2c3d4', pages: 0 }, { id: 'a1b2c3d4', name: 'x'.repeat(500), pages: 2.7 }] });
    expect(d.sources).toHaveLength(1);
    expect(d.sources[0]!.name).toHaveLength(100);
    expect(d.sources[0]!.pages).toBe(2);
    expect(reviveDoc(undefined)).toEqual(emptyDoc());
  });
});

describe('removing a PDF', () => {
  it('takes its drawings off the page and leaves the rest', () => {
    useStore.setState({ ...useStore.getState(), doc: { ...emptyDoc(), sources: [{ id: 'a1b2c3d4', name: 'A', pages: 2 }, { id: '0badf00d', name: 'B', pages: 2 }] }, past: [], future: [], selected: null });
    useStore.getState().addFigure('a1b2c3d4', 0);
    useStore.getState().addFigure('0badf00d', 1);
    useStore.getState().addText('Note', 'keep me');
    useStore.getState().removeSource('a1b2c3d4');
    const d = useStore.getState().doc;
    expect(d.sources.map((s) => s.id)).toEqual(['0badf00d']);
    expect(d.elements.map((e) => (e.kind === 'figure' ? `fig:${e.src}` : e.label))).toEqual(['fig:0badf00d', 'Note']);
    useStore.getState().undo();
    expect(useStore.getState().doc.sources).toHaveLength(2); // undo brings it back
  });
});
