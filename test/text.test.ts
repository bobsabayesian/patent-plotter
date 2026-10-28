import { describe, expect, it } from 'vitest';
import { CAPS, layoutCased } from '../src/hatch/extraglyphs';
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

describe('capital letters', () => {
  const tops = (t: string) => Math.max(...layoutCased(t).glyphs.flatMap((g) => g.strokes.flat()).map((p) => p[1]));
  it('has all 26, each a well formed stroke, six units tall like the digits', () => {
    expect(Object.keys(CAPS).sort().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    for (const [ch, strokes] of Object.entries(CAPS)) {
      expect(strokes.length, ch).toBeGreaterThan(0);
      for (const stroke of strokes) {
        expect(stroke.length, ch).toBeGreaterThan(1);
        for (const [x, y] of stroke) { expect(Number.isFinite(x) && Number.isFinite(y), ch).toBe(true); expect(x).toBeGreaterThanOrEqual(-0.01); expect(x).toBeLessThanOrEqual(4.5); expect(y).toBeGreaterThanOrEqual(-1); expect(y).toBeLessThanOrEqual(6.01); }
      }
      expect(Math.max(...strokes.flat().map((p) => p[1])), ch).toBeGreaterThanOrEqual(5.9); // reaches cap height
    }
  });
  it('are drawn as capitals, not lowercased', () => {
    expect(tops('A')).toBe(6);
    expect(tops('a')).toBe(4);
    expect(layoutCased('Hello').glyphs).toHaveLength(5);
    expect(layoutCased('HELLO').glyphs[0]!.strokes).toEqual(CAPS['H']);
    expect(layoutCased('hello').glyphs[0]!.strokes).toEqual(GLYPHS['h']);
    expect(layoutCased('I <3 U').glyphs.length).toBe(3); // I, the heart, U
  });
  it('are measured as capitals when text wraps and sits', () => {
    const wide = (t: string) => layoutCased(t).width;
    expect(wide('MMMM')).toBeGreaterThan(wide('mmmm') * 0.9);
    expect(wide('WWW')).toBeGreaterThan(wide('III'));
    const high = (t: string) => Math.min(...placeText(text(t)).lines.flat().map((p) => p[1]));
    expect(high('Hello')).toBeCloseTo(0, 5); // the capital H reaches the top of its box
    expect(high('aeo')).toBeGreaterThan(0.5); // short lowercase letters stop well below the top
  });
  it('are no longer reported as missing, but other alphabets still are', () => {
    expect(unsupported('FIG. 1 Claims: A B C')).toEqual([]);
    expect(unsupported('ΩΔ')).toEqual(['Ω', 'Δ']);
  });
});
