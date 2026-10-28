import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store';
import { emptyDoc } from '../src/doc';

const s = () => useStore.getState();
const els = () => s().doc.elements;

beforeEach(() => useStore.setState({ doc: emptyDoc(), past: [], future: [], selected: null, code: null }));

describe('undo and redo', () => {
  it('undoes and redoes adding and removing', () => {
    s().addText('Custom', 'hello');
    s().addText('Custom', 'world');
    expect(els()).toHaveLength(2);
    s().undo();
    expect(els()).toHaveLength(1);
    s().undo();
    expect(els()).toHaveLength(0);
    s().undo(); // nothing left: no harm
    expect(els()).toHaveLength(0);
    s().redo(); s().redo(); s().redo();
    expect(els().map((e) => (e.kind === 'text' ? e.text : ''))).toEqual(['hello', 'world']);
    s().removeEl(els()[0]!.id);
    expect(els()).toHaveLength(1);
    s().undo();
    expect(els()).toHaveLength(2);
  });
  it('makes one undo step of a drag, or of typing in one box', () => {
    s().addText('Custom', 'hello');
    const id = els()[0]!.id;
    for (let x = 1; x <= 30; x++) s().updateEl(id, { x });
    expect(els()[0]!.x).toBe(30);
    s().undo(); // the whole drag
    expect(els()[0]!.x).toBe(12);
    for (const text of ['a', 'ab', 'abc']) s().updateEl(id, { text });
    s().undo();
    expect((els()[0] as { text: string }).text).toBe('hello');
  });
  it('keeps separate steps for different changes, and a new edit forgets what was undone', () => {
    s().addText('Custom', 'hello');
    const id = els()[0]!.id;
    s().updateEl(id, { x: 50 });
    s().updateEl(id, { rot: 1 });
    s().undo();
    expect(els()[0]).toMatchObject({ x: 50, rot: 0 });
    s().undo();
    expect(els()[0]!.x).toBe(12);
    s().updateEl(id, { x: 99 });
    expect(s().future).toHaveLength(0);
    s().redo(); // nothing to redo
    expect(els()[0]!.x).toBe(99);
  });
  it('duplicates an element a little offset, as its own thing', () => {
    s().addText('Title', 'hello');
    const a = els()[0]!;
    s().duplicateEl(a.id);
    expect(els()).toHaveLength(2);
    const b = els()[1]!;
    expect(b.id).not.toBe(a.id);
    expect([b.x, b.y]).toEqual([a.x + 5, a.y + 5]);
    expect(s().selected).toBe(b.id);
    s().updateEl(b.id, { x: 0 });
    expect(els()[0]!.x).toBe(a.x);
    s().duplicateEl('nope'); // no such element: nothing happens
    expect(els()).toHaveLength(2);
  });
});
