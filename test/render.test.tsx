import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../src/App';
import { CropDialog } from '../src/CropDialog';
import { TextDialog } from '../src/TextDialog';
import { emptyDoc, type FigureEl, type TextEl } from '../src/doc';
import { useStore } from '../src/store';

const text: TextEl = { id: 't1', kind: 'text', label: 'Abstract', text: 'A fluid sampling system (10); Ω is odd.', pen: 0, x: 12, y: 40, w: 150, sizeMm: 4, align: 'left', rot: 0 };
const fig: FigureEl = { id: 'f1', kind: 'figure', src: 'a1b2c3d4', page: 0, pen: 0, x: 12, y: 12, w: 100, method: 'lineart', crop: [0.1, 0.2, 0.3, 0.1], cleanEdges: true, rot: 1 };
const sources = [{ id: 'a1b2c3d4', name: 'US261', pages: 4 }];

/** Server rendering reads zustand's initial state, not the current one, so the test state goes into both. */
const arrange = (state: Partial<ReturnType<typeof useStore.getState>>) => { Object.assign(useStore.getInitialState(), state); useStore.setState(state); };

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'http://localhost', href: 'http://localhost/' });
  arrange({ doc: { ...emptyDoc(), sources, elements: [fig, text] }, selected: null, editing: null, past: [], future: [], code: 'K7M2P-9QXAR' });
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
    expect(html).toContain('<select><option value="0" selected="">1</option><option value="1">2</option><option value="2">3</option><option value="3">4</option></select>'); // the page picker, from the PDF's 4 pages
    expect(html).toContain('(90° clockwise)');
    expect(html).toContain('Align to the margins');
  });
  it('shows the text tools for selected text', () => {
    arrange({ selected: 't1' });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Edit text…');
    expect(html).toContain('A fluid sampling system');
  });
  it('draws the upload panel with each PDF and its pages', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Patent PDFs');
    expect(html).toContain('Upload a PDF…');
    expect(html).toContain('US261');
    expect(html).toContain('4 pages');
    expect(html.match(/aria-label="Draw page \d"/g)).toHaveLength(4);
    expect(html.match(/aria-label="Take the text from page \d"/g)).toHaveLength(4);
    expect(html).toContain('Drawing: US261, page 1');
    arrange({ doc: emptyDoc() });
    const empty = renderToStaticMarkup(<App />);
    expect(empty).toContain('Nothing uploaded yet.');
    expect(empty).not.toContain('search');
  });
  it('draws the text editor with a preview, a way to bring in a PDF page\'s text, and a warning for what the font lacks', () => {
    const html = renderToStaticMarkup(<TextDialog el={text} onClose={() => {}} />);
    expect(html).toContain('Edit text: Abstract');
    expect(html).toContain('Insert the text of a PDF page');
    expect(html).toContain('Insert page 1');
    expect(html).toContain('As the pen will draw it');
    expect(html).toContain('cannot draw “Ω”;'); // only the Greek letter
    for (const ch of ['(', ')', ';']) expect(html).not.toContain(`“${ch}”`); // punctuation is drawn now
    expect(html).toContain('<path d="M');
    arrange({ doc: emptyDoc() });
    expect(renderToStaticMarkup(<TextDialog el={text} onClose={() => {}} />)).not.toContain('Insert the text of a PDF page');
  });
  it('draws the crop editor, waiting for the page to be read', () => {
    const html = renderToStaticMarkup(<CropDialog el={fig} onClose={() => {}} />);
    expect(html).toContain('Crop page 1 of US261');
    expect(html).toContain('Reading the page…');
    expect(html).toContain('Keeps 70% across and 60% down');
    expect(html).toContain('Trim to drawing');
  });
});
