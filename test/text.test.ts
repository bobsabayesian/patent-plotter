import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../src/hatch/strokefont';
import { prepareText, unsupported } from '../src/text';
import { placeText, wrap } from '../src/layout';
import type { TextEl } from '../src/doc';

const text = (t: string, o: Partial<TextEl> = {}): TextEl => ({ id: 't', kind: 'text', label: 'T', text: t, pen: 0, x: 0, y: 0, w: 200, sizeMm: 5, align: 'left', rot: 0, ...o });
const points = (el: TextEl) => placeText(el).lines.flat();

describe('the font now draws patent punctuation', () => {
  it('has the marks claims use, each well formed', () => {
    for (const ch of ': ; \' " ( ) [ ] / & + = % < > _ # °'.split(' ')) {
      const strokes = GLYPHS[ch];
      expect(strokes, ch).toBeDefined();
      for (const stroke of strokes!) {
        expect(stroke.length).toBeGreaterThan(1);
        for (const [x, y] of stroke) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(3.4); expect(y).toBeGreaterThanOrEqual(-1); expect(y).toBeLessThanOrEqual(6.6); }
      }
    }
  });
  it('does not replace a glyph the font already had', () => {
    expect(GLYPHS['a']!.length).toBe(2);
    expect(GLYPHS['-']).toEqual([[[0, 2], [2.5, 2]]]);
  });
  it('draws them instead of dropping them', () => {
    expect(points(text('a;b'))).not.toEqual(points(text('ab')));
    const right = (t: string) => Math.max(...points(text(t)).map((p) => p[0]));
    expect(right('(x)')).toBeGreaterThan(right('x'));
  });
});

describe('prepareText', () => {
  it('turns typographic marks into plain ones and strips accents', () => {
    expect(prepareText('“Hello,” she said — it’s 5 × 3… ok')).toBe('"Hello," she said - it\'s 5 x 3... ok');
    expect(prepareText('Müller café · naïve')).toBe('Muller cafe - naive');
    expect(prepareText('a b\tc')).toBe('a b c');
  });
  it('keeps what it has no rule for', () => {
    expect(prepareText('Ω ≥ 3')).toBe('Ω ≥ 3');
  });
});

describe('unsupported', () => {
  it('lists what cannot be drawn, once each, and ignores what can', () => {
    expect(unsupported('Ω ≥ 3 and Ω; (fine) “quotes” — café')).toEqual(['Ω', '≥']);
    expect(unsupported('Claim 1: A fluid sampling system (10); see FIG. 2.')).toEqual([]);
    expect(unsupported('I <3 plotters')).toEqual([]);
    expect(unsupported('')).toEqual([]);
  });
});

describe('wrapping', () => {
  it('breaks text on words, keeps blank lines, and never splits a word', () => {
    const rows = wrap(prepareText('one two three four five six seven'), 40);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.join(' ')).toBe('one two three four five six seven');
    expect(wrap('a\n\nb', 100)).toEqual(['a', '', 'b']);
  });
});
