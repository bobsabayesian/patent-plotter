import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App';
import { CropDialog } from '../src/CropDialog';
import { TextDialog } from '../src/TextDialog';
import { emptyDoc, type FigureEl, type TextEl } from '../src/doc';
import { useStore } from '../src/store';

const text: TextEl = { id: 't1', kind: 'text', label: 'Abstract', text: 'A fluid sampling system (10); Ω is odd.', pen: 0, x: 12, y: 40, w: 150, sizeMm: 4, align: 'left', rot: 0 };
const fig: FigureEl = { id: 'f1', kind: 'figure', sheet: 0, pen: 0, x: 12, y: 12, w: 100, method: 'lineart', crop: [0.1, 0.2, 0.3, 0.1], cleanEdges: true, rot: 1 };
const patent = { id: 'US261A', title: 'Machine for hackling hemp', abstract: 'An abstract.', inventors: ['P. Rice'], assignee: '', filed: '', issued: '1837-07-11', claims: ['1. A claim.', '2. Another.'], drawings: ['https://patentimages.storage.googleapis.com/a/b-drawings-page-1.png'] };

/** Server rendering reads zustand's initial state, not the current one, so the test state goes into both. */
const arrange = (state: Partial<ReturnType<typeof useStore.getState>>) => { Object.assign(useStore.getInitialState(), state); useStore.setState(state); };

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'http://localhost', href: 'http://localhost/' });
  arrange({ doc: { ...emptyDoc(), patent: 'US261A', elements: [fig, text] }, patent, selected: null, editing: null, past: [], future: [], code: 'K7M2P-9QXAR' });
});

describe('rendering', () => {
  it('draws the whole app with a drawing and some text on the page', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Patent Plotter');
    expect(html).toContain('On the page');
    expect(html).toContain('K7M2P-9QXAR');
  });
  it('shows the editing tools for a selected drawing, with its crop and turn', () => {
    arrange({ selected: 'f1' });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Crop…');
    expect(html).toContain('Showing 70% × 60% of it');
    expect(html).toContain('(90° clockwise)');
    expect(html).toContain('Align to the margins');
  });
  it('shows the text tools for selected text', () => {
    arrange({ selected: 't1' });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Edit text…');
    expect(html).toContain('A fluid sampling system');
  });
  it('draws the text editor with a preview, the patent fields and a warning for what the font lacks', () => {
    const html = renderToStaticMarkup(<TextDialog el={text} onClose={() => {}} />);
    expect(html).toContain('Edit text: Abstract');
    expect(html).toContain('Insert from the patent');
    expect(html).toContain('Claim 1');
    expect(html).toContain('As the pen will draw it');
    expect(html).toContain('cannot draw “Ω”;'); // only the Greek letter
    for (const ch of ['(', ')', ';']) expect(html).not.toContain(`“${ch}”`); // punctuation is drawn now
    expect(html).toContain('<path d="M');
  });
  it('draws the crop editor over the sheet with the current crop', () => {
    const html = renderToStaticMarkup(<CropDialog el={fig} onClose={() => {}} />);
    expect(html).toContain('Crop sheet 1');
    expect(html).toContain('/api/img?u=');
    expect(html).toContain('Keeps 70% across and 60% down');
    expect(html.match(/data-handle=/g)).toHaveLength(8);
    expect(html).toContain('left:10.00%;top:10.00%;width:70.00%;height:60.00%');
  });
  it('says so, rather than failing, when the sheet is not there', () => {
    const html = renderToStaticMarkup(<CropDialog el={{ ...fig, sheet: 9 }} onClose={() => {}} />);
    expect(html).toContain('no drawing sheet 10');
  });
});
