import type { Method } from './vectorize/protocol';
import { DEFAULT_PEN_TYPE, penType } from './scene/pens';

/** What a visitor builds and what a session keeps: small, since drawings are re-fetched and re-vectorized by patent number. */
export interface PenDef { id: string; color: string; type: string; tipMm: number }

export interface FigureEl {
  id: string; kind: 'figure';
  /** which drawing sheet of the patent (0 = first) */
  sheet: number;
  pen: number;
  /** top-left on the page, mm; the width is set, the height follows from the drawing */
  x: number; y: number; w: number;
  method: Method;
  /** fractions of the sheet trimmed off: top, right, bottom, left */
  crop: [number, number, number, number];
  /** drop what a scan leaves at the sheet's edge (page curls, the paper's edge); line art only */
  cleanEdges: boolean;
}
export interface TextEl {
  id: string; kind: 'text';
  /** what it is ("Title", "Claim 1", ...), for the list */
  label: string;
  text: string;
  pen: number;
  x: number; y: number; w: number;
  /** height of tall letters, mm */
  sizeMm: number;
}
export type El = FigureEl | TextEl;

export interface PaperSize { id: string; label: string; wMm: number; hMm: number }
export const PAPERS: PaperSize[] = [
  { id: 'a5', label: 'A5', wMm: 148, hMm: 210 },
  { id: 'a4', label: 'A4', wMm: 210, hMm: 297 },
  { id: 'a3', label: 'A3', wMm: 297, hMm: 420 },
  { id: 'letter', label: 'US Letter', wMm: 215.9, hMm: 279.4 },
  { id: 'tabloid', label: 'Tabloid (11×17 in)', wMm: 279.4, hMm: 431.8 },
];

export interface Doc {
  /** the patent being drawn, e.g. "US7654321B2" (null before one is chosen) */
  patent: string | null;
  paper: string;
  landscape: boolean;
  marginMm: number;
  pens: PenDef[];
  elements: El[];
}

export const newPen = (n: number): PenDef => ({ id: `pen${n}`, color: '#111111', type: DEFAULT_PEN_TYPE, tipMm: penType(DEFAULT_PEN_TYPE).defaultTipMm });

export const emptyDoc = (): Doc => ({ patent: null, paper: 'a4', landscape: false, marginMm: 12, pens: [newPen(1)], elements: [] });

export function pageMm(d: Pick<Doc, 'paper' | 'landscape'>): { w: number; h: number } {
  const p = PAPERS.find((x) => x.id === d.paper) ?? PAPERS[1]!;
  return d.landscape ? { w: p.hMm, h: p.wMm } : { w: p.wMm, h: p.hMm };
}

/** Fill in anything missing from a saved doc (older or damaged sessions load with defaults). */
export function reviveDoc(raw: unknown): Doc {
  const base = emptyDoc();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<Doc>;
  const pens = Array.isArray(r.pens) && r.pens.length ? r.pens.filter((p) => p && typeof p.color === 'string').map((p, i) => ({ ...newPen(i + 1), ...p })) : base.pens;
  const clampPen = (n: unknown) => (typeof n === 'number' && n >= 0 && n < pens.length ? n : 0);
  const elements = (Array.isArray(r.elements) ? r.elements : []).flatMap((e): El[] => {
    if (e?.kind === 'figure') return [{ id: String(e.id), kind: 'figure', sheet: Math.max(0, e.sheet | 0), pen: clampPen(e.pen), x: +e.x || 0, y: +e.y || 0, w: +e.w > 0 ? +e.w : 100, method: e.method === 'edges' ? 'edges' : 'lineart', crop: Array.isArray(e.crop) && e.crop.length === 4 ? (e.crop.map((c) => Math.min(0.9, Math.max(0, +c || 0))) as FigureEl['crop']) : [0, 0, 0, 0], cleanEdges: e.cleanEdges !== false }];
    if (e?.kind === 'text') return [{ id: String(e.id), kind: 'text', label: String(e.label ?? 'Text'), text: String(e.text ?? ''), pen: clampPen(e.pen), x: +e.x || 0, y: +e.y || 0, w: +e.w > 0 ? +e.w : 100, sizeMm: +e.sizeMm > 0 ? +e.sizeMm : 5 }];
    return [];
  });
  return {
    patent: typeof r.patent === 'string' ? r.patent : null,
    paper: PAPERS.some((p) => p.id === r.paper) ? r.paper! : base.paper,
    landscape: !!r.landscape,
    marginMm: typeof r.marginMm === 'number' && r.marginMm >= 0 && r.marginMm < 60 ? r.marginMm : base.marginMm,
    pens,
    elements,
  };
}
