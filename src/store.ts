import { create } from 'zustand';
import { emptyDoc, newPen, pageMm, reviveDoc, type Doc, type El, type FigureEl, type PenDef, type TextEl } from './doc';
import { loadSession, newSessionCode, remember, rememberedCode, saveSession, cleanCode } from './session';
import type { PatentRecord } from '../worker/patents';

export type Save = 'idle' | 'saving' | 'saved' | 'error';

interface State {
  doc: Doc;
  code: string | null;
  patent: PatentRecord | null;
  selected: string | null;
  busy: string | null;
  error: string | null;
  save: Save;

  boot(): Promise<void>;
  openSession(code: string): Promise<void>;
  loadPatent(number: string): Promise<void>;
  patch(fn: (d: Doc) => Doc): void;
  select(id: string | null): void;
  addFigure(sheet: number): void;
  addText(label: string, text: string, sizeMm?: number): void;
  updateEl(id: string, change: Partial<FigureEl> | Partial<TextEl>): void;
  removeEl(id: string): void;
  moveEl(id: string, dir: -1 | 1): void;
  setPen(i: number, change: Partial<PenDef>): void;
  addPen(): void;
  removePen(i: number): void;
}

let uid = 0;
const elId = () => `e${Date.now().toString(36)}${(uid++).toString(36)}`;

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => {
  /** Keep the session in step with edits, a moment after they stop. */
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { code, doc } = get();
      if (!code) return;
      set({ save: 'saving' });
      try { await saveSession(code, doc); set({ save: 'saved' }); } catch { set({ save: 'error' }); }
    }, 800);
  };
  const edit = (fn: (d: Doc) => Doc) => { set((s) => ({ doc: fn(s.doc) })); scheduleSave(); };

  const fetchPatent = async (id: string): Promise<PatentRecord> => {
    const r = await fetch(`/api/patent/${encodeURIComponent(id)}`);
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `could not get that patent (${r.status})`);
    return body as PatentRecord;
  };

  return {
    doc: emptyDoc(), code: null, patent: null, selected: null, busy: null, error: null, save: 'idle',

    async boot() {
      set({ busy: 'Starting…' });
      try {
        const known = rememberedCode();
        if (known) { await get().openSession(known); return; }
        const code = await newSessionCode();
        remember(code);
        set({ code, busy: null });
      } catch (e) { set({ busy: null, error: (e as Error).message }); }
    },

    async openSession(raw) {
      const code = cleanCode(raw);
      if (!code) { set({ error: 'That is not a session code (ten letters and numbers, like K7M2P-9QXAR).' }); return; }
      set({ busy: 'Opening session…', error: null });
      try {
        const saved = await loadSession(code);
        const doc = saved ? reviveDoc(saved) : emptyDoc();
        remember(code);
        set({ code, doc, patent: null, selected: null, save: saved ? 'saved' : 'idle' });
        if (doc.patent) set({ patent: await fetchPatent(doc.patent) });
        set({ busy: null });
      } catch (e) { set({ busy: null, error: (e as Error).message }); }
    },

    async loadPatent(number) {
      set({ busy: 'Fetching patent…', error: null });
      try {
        const rec = await fetchPatent(number);
        const fresh = get().doc.patent !== rec.id;
        set({ patent: rec, busy: null });
        edit((d) => ({ ...d, patent: rec.id, elements: fresh ? [] : d.elements }));
        if (fresh) {
          if (rec.drawings.length) get().addFigure(0);
          get().addText('Title', rec.title, 6);
        }
      } catch (e) { set({ busy: null, error: (e as Error).message }); }
    },

    patch: edit,
    select: (id) => set({ selected: id }),

    addFigure(sheet) {
      const d = get().doc, page = pageMm(d), inner = page.w - 2 * d.marginMm;
      const el: FigureEl = { id: elId(), kind: 'figure', sheet, pen: 0, x: d.marginMm, y: d.marginMm, w: inner, method: 'lineart', crop: [0, 0, 0, 0], cleanEdges: true };
      edit((d) => ({ ...d, elements: [...d.elements, el] }));
      set({ selected: el.id });
    },

    addText(label, text, sizeMm = 4) {
      const d = get().doc, page = pageMm(d), inner = page.w - 2 * d.marginMm;
      // below the last text so new blocks do not pile up on one spot (drag them wherever you like)
      const y = Math.min(page.h - d.marginMm - sizeMm, d.marginMm + d.elements.length * 14);
      const el: TextEl = { id: elId(), kind: 'text', label, text, pen: 0, x: d.marginMm, y, w: inner, sizeMm };
      edit((d) => ({ ...d, elements: [...d.elements, el] }));
      set({ selected: el.id });
    },

    updateEl: (id, change) => edit((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? ({ ...e, ...change } as El) : e)) })),
    removeEl(id) { edit((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) })); if (get().selected === id) set({ selected: null }); },
    moveEl: (id, dir) => edit((d) => {
      const i = d.elements.findIndex((e) => e.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= d.elements.length) return d;
      const els = d.elements.slice();
      [els[i], els[j]] = [els[j]!, els[i]!];
      return { ...d, elements: els };
    }),

    setPen: (i, change) => edit((d) => ({ ...d, pens: d.pens.map((p, k) => (k === i ? { ...p, ...change } : p)) })),
    addPen: () => edit((d) => (d.pens.length >= 8 ? d : { ...d, pens: [...d.pens, newPen(d.pens.length + 1)] })),
    removePen: (i) => edit((d) => (d.pens.length <= 1 ? d : { ...d, pens: d.pens.filter((_, k) => k !== i), elements: d.elements.map((e) => ({ ...e, pen: e.pen === i ? 0 : e.pen > i ? e.pen - 1 : e.pen })) })),
  };
});
