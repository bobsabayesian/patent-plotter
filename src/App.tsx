import { useEffect, useRef, useState } from 'react';
import { PAPERS, pageMm, type El, type FigureEl, type Rot, type TextEl } from './doc';
import { alignTo, fitInside, type Align, type Box } from './geometry';
import { buildScene, placeEl } from './layout';
import { CropDialog } from './CropDialog';
import { isWhole, rectFromCrop } from './crop';
import { Preview } from './Preview';
import { TextDialog } from './TextDialog';
import { PEN_TYPES, penType, nearestTip } from './scene/pens';
import { pagePng } from './pdfStore';
import { cleanCode } from './session';
import { useStore } from './store';
import type { Vectorized } from './vectorize/client';
import { sceneToSvg } from './svg';
import { useVectors } from './useVectors';

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');

export function App() {
  const s = useStore();
  const { doc } = s;
  const vec = useVectors(doc, s.code);
  const [over, setOver] = useState(false);
  useEffect(() => { void s.boot(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const zoomBy = (f: number) => setZoom((z) => Math.min(5, Math.max(0.5, +(z * f).toFixed(3))));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      const st = useStore.getState();
      if (st.editing) return; // a dialog is open: its own keys apply
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); st.redo(); return; }
      const el = st.doc.elements.find((x) => x.id === st.selected);
      if (!el) return;
      if (mod && key === 'd') { e.preventDefault(); st.duplicateEl(el.id); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.removeEl(el.id); return; }
      if (e.key === 'Escape') { st.select(null); return; }
      const step = e.shiftKey ? 10 : 1;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (move) { e.preventDefault(); st.updateEl(el.id, { x: +(el.x + move[0]!).toFixed(1), y: +(el.y + move[1]!).toFixed(1) }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const exportSvg = () => {
    const scene = buildScene(doc, vec.vecs);
    const meta = JSON.stringify({ app: 'patent-plotter', version: __APP_VERSION__, commit: __APP_COMMIT__, session: s.code, doc }).replace(/</g, '\\u003c');
    const svg = sceneToSvg(scene, { metadata: `<metadata id="patent-plotter">${meta}</metadata>` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `${(doc.sources[0]?.name ?? 'patent').replace(/[^\w.-]+/g, '_').slice(0, 60)}-${stamp()}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const waiting = vec.loading.size > 0;

  return (
    <div className="app">
      <aside
        className={`panel${over ? ' over' : ''}`}
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); for (const f of e.dataTransfer.files) void s.addPdf(f); }}
      >
        <header>
          <h1>Patent Plotter</h1>
          <p className="sub">Patent drawings, for pen plotters</p>
        </header>
        <SessionBox />
        <PdfBox />
        <PaperBox />
        <PensBox />
        <Elements vec={vec} />
        <div className="export">
          <button className="primary" onClick={exportSvg} disabled={!doc.elements.length || waiting}>{waiting ? 'Tracing…' : '↓ SVG'}</button>
          <span className="hint">One layer per pen, in mm, ready for vpype or Inkscape.</span>
        </div>
      </aside>
      <main className="stage">
        {s.busy && <div className="toast">{s.busy}</div>}
        {s.error && <div className="toast bad" role="alert">{s.error} <button onClick={() => useStore.setState({ error: null })}>Dismiss</button></div>}
        <div className="bar">
          <button onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
          <button onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
          <span className="sep" />
          <button onClick={() => zoomBy(1 / 1.25)} disabled={zoom <= 0.5} aria-label="Zoom out">−</button>
          <button className="zoom" onClick={() => setZoom(1)} title="Fit the page in the window">{zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}</button>
          <button onClick={() => zoomBy(1.25)} disabled={zoom >= 5} aria-label="Zoom in">+</button>
          <span className="sep" />
          <label className="check" title="Snap to margins, the page middle and other things; hold Alt to place freely"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap</label>
        </div>
        <Preview doc={doc} vec={vec} zoom={zoom} snap={snap} />
        <Dialogs />
      </main>
    </div>
  );
}

function Dialogs() {
  const { doc, editing, setEditing } = useStore();
  const el = editing && doc.elements.find((e) => e.id === editing.id);
  if (!editing || !el) return null;
  const close = () => setEditing(null);
  if (editing.kind === 'text' && el.kind === 'text') return <TextDialog key={el.id} el={el} onClose={close} />;
  if (editing.kind === 'crop' && el.kind === 'figure') return <CropDialog key={el.id} el={el} onClose={close} />;
  return null;
}

function SessionBox() {
  const { code, save, openSession } = useStore();
  const [typed, setTyped] = useState('');
  const [copied, setCopied] = useState(false);
  const link = code ? `${location.origin}/?s=${code}` : '';
  return (
    <section>
      <h2>Session</h2>
      <div className="row">
        <code className="code" aria-label="Session code">{code ?? '…'}</code>
        <button disabled={!code} onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <p className="hint">{save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved. Use this code on any device to come back.' : save === 'error' ? 'Could not save; will retry on your next change.' : 'Your work is saved under this code.'}</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (cleanCode(typed) || typed) void openSession(typed); setTyped(''); }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Return with a code" aria-label="Session code to open" spellCheck={false} autoCapitalize="characters" />
        <button type="submit" disabled={!typed.trim()}>Open</button>
      </form>
    </section>
  );
}

function PdfBox() {
  const { doc, busy, addPdf, removeSource, addFigure, addTextFromPage } = useStore();
  const input = useRef<HTMLInputElement>(null);
  return (
    <section>
      <h2>Patent PDFs</h2>
      <div className="row">
        <button className="primary" onClick={() => input.current?.click()} disabled={!!busy}>Upload a PDF…</button>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { for (const f of e.target.files ?? []) void addPdf(f); e.target.value = ''; }} />
        <span className="hint">or drop one anywhere here</span>
      </div>
      <p className="hint">Download a patent as a PDF from the patent office or Google Patents. Up to 30 MB each.</p>
      {doc.sources.map((src) => (
        <div className="source" key={src.id}>
          <div className="row">
            <strong className="grow" title={src.name}>{src.name}</strong>
            <small>{src.pages} {src.pages === 1 ? 'page' : 'pages'}</small>
            <button onClick={() => { if (!doc.elements.some((e) => e.kind === 'figure' && e.src === src.id) || confirm(`Remove ${src.name}? Drawings from it are taken off the page too.`)) removeSource(src.id); }} aria-label={`Remove ${src.name}`}>×</button>
          </div>
          <p className="hint">Click a page to draw it. <b>Aa</b> takes the text from a page instead.</p>
          <div className="sheets">
            {Array.from({ length: src.pages }, (_, i) => <PageThumb key={i} src={src.id} page={i} onPlace={() => addFigure(src.id, i)} onText={() => void addTextFromPage(src.id, i)} />)}
          </div>
        </div>
      ))}
      {!doc.sources.length && <p className="hint">Nothing uploaded yet.</p>}
    </section>
  );
}

/** One page of a PDF as a button: drawn when it scrolls into view, so a long patent does not render all at once. */
function PageThumb({ src, page, onPlace, onText }: { src: string; page: number; onPlace: () => void; onText: () => void }) {
  const code = useStore((s) => s.code);
  const box = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || !code || url) return;
    let live = true;
    const io = new IntersectionObserver((hits) => {
      if (!hits.some((h) => h.isIntersecting)) return;
      io.disconnect();
      pagePng(code, src, page, 260).then((u) => { if (live) setUrl(u); }, () => { if (live) setBad(true); });
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [code, src, page, url]);
  return (
    <div className="sheet" ref={box}>
      <button onClick={onPlace} title={`Draw page ${page + 1}`} aria-label={`Draw page ${page + 1}`}>
        {url ? <img src={url} alt={`Page ${page + 1}`} /> : <span className="ph">{bad ? '!' : ''}</span>}
      </button>
      <span className="n">{page + 1}</span>
      <button className="aa" onClick={onText} title={`Take the text from page ${page + 1}`} aria-label={`Take the text from page ${page + 1}`}>Aa</button>
    </div>
  );
}

function PaperBox() {
  const { doc, patch } = useStore();
  const p = pageMm(doc);
  return (
    <section>
      <h2>Paper</h2>
      <div className="row">
        <select value={doc.paper} onChange={(e) => patch((d) => ({ ...d, paper: e.target.value }))} aria-label="Paper size">
          {PAPERS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select value={doc.landscape ? 'l' : 'p'} onChange={(e) => patch((d) => ({ ...d, landscape: e.target.value === 'l' }))} aria-label="Orientation">
          <option value="p">Portrait</option>
          <option value="l">Landscape</option>
        </select>
      </div>
      <div className="row">
        <label className="grow">Margin <input type="number" min={0} max={59} step={1} value={doc.marginMm} onChange={(e) => patch((d) => ({ ...d, marginMm: Math.max(0, +e.target.value || 0) }))} /> mm</label>
        <span className="hint">{p.w.toFixed(0)} × {p.h.toFixed(0)} mm</span>
      </div>
    </section>
  );
}

function PensBox() {
  const { doc, setPen, addPen, removePen } = useStore();
  return (
    <section>
      <h2>Pens <small>in the order you swap them in</small></h2>
      {doc.pens.map((pen, i) => {
        const t = penType(pen.type);
        const tips = t.tipsMm.includes(pen.tipMm) || !t.tipsMm.length ? t.tipsMm : [...t.tipsMm, pen.tipMm].sort((a, b) => a - b);
        return (
          <div className="pen" key={pen.id}>
            <span className="n">{i + 1}</span>
            <input type="color" value={pen.color} onChange={(e) => setPen(i, { color: e.target.value })} aria-label={`Pen ${i + 1} colour`} />
            <select value={pen.type} onChange={(e) => setPen(i, { type: e.target.value, tipMm: penType(e.target.value).defaultTipMm })} aria-label={`Pen ${i + 1} type`}>
              {PEN_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            {tips.length ? (
              <select value={nearestTip(t, pen.tipMm)} onChange={(e) => setPen(i, { tipMm: +e.target.value })} aria-label={`Pen ${i + 1} tip`}>
                {tips.map((w) => <option key={w} value={w}>{w} mm</option>)}
              </select>
            ) : (
              <input type="number" min={0.05} step={0.05} value={pen.tipMm} onChange={(e) => setPen(i, { tipMm: Math.max(0.05, +e.target.value || 0.4) })} aria-label={`Pen ${i + 1} tip, mm`} />
            )}
            <button onClick={() => removePen(i)} disabled={doc.pens.length <= 1} aria-label={`Remove pen ${i + 1}`}>×</button>
          </div>
        );
      })}
      <button onClick={addPen} disabled={doc.pens.length >= 8}>+ Add pen</button>
    </section>
  );
}

function Elements({ vec }: { vec: ReturnType<typeof useVectors> }) {
  const { doc, selected, select } = useStore();
  const el = doc.elements.find((e) => e.id === selected);
  const name = (e: El) => (e.kind === 'figure' ? `Drawing: ${doc.sources.find((x) => x.id === e.src)?.name ?? 'PDF'}, page ${e.page + 1}` : e.label);
  return (
    <section>
      <h2>On the page</h2>
      {!doc.elements.length && <p className="hint">Nothing yet. Place a drawing sheet or some text.</p>}
      <ul className="els">
        {doc.elements.map((e) => (
          <li key={e.id}><button className={e.id === selected ? 'on' : ''} onClick={() => select(e.id === selected ? null : e.id)}><i style={{ background: doc.pens[e.pen]?.color }} />{name(e)}</button></li>
        ))}
      </ul>
      {el && <Editor key={el.id} el={el} err={vec.errors.get(el.id)} vecs={vec.vecs} />}
    </section>
  );
}

function Num({ label, value, onChange, step = 1, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return <label>{label}<input type="number" step={step} min={min} value={+value.toFixed(2)} onChange={(e) => { const v = +e.target.value; if (Number.isFinite(v)) onChange(v); }} /></label>;
}

const ALIGNS: { how: Align; glyph: string; label: string }[] = [
  { how: 'left', glyph: '⇤', label: 'Align to left margin' }, { how: 'center', glyph: '↔', label: 'Centre across the page' }, { how: 'right', glyph: '⇥', label: 'Align to right margin' },
  { how: 'top', glyph: '⤒', label: 'Align to top margin' }, { how: 'middle', glyph: '↕', label: 'Centre down the page' }, { how: 'bottom', glyph: '⤓', label: 'Align to bottom margin' },
];

function Editor({ el, err, vecs }: { el: El; err?: string; vecs: ReadonlyMap<string, Vectorized> }) {
  const { doc, updateEl, removeEl, moveEl, duplicateEl } = useStore();
  const page = pageMm(doc);
  const inner: Box = [doc.marginMm, doc.marginMm, page.w - 2 * doc.marginMm, page.h - 2 * doc.marginMm];
  const box = placeEl(el, vecs).box;
  const turn = (by: number) => updateEl(el.id, { rot: ((((el.rot + by) % 4) + 4) % 4) as Rot });
  return (
    <div className="editor">
      <div className="row">
        <label className="grow">Pen
          <select value={el.pen} onChange={(e) => updateEl(el.id, { pen: +e.target.value })}>
            {doc.pens.map((p, i) => <option key={p.id} value={i}>{i + 1} · {penType(p.type).label.split(' (')[0]} {p.tipMm} mm</option>)}
          </select>
        </label>
      </div>
      <div className="grid">
        <Num label="X mm" value={el.x} onChange={(x) => updateEl(el.id, { x })} />
        <Num label="Y mm" value={el.y} onChange={(y) => updateEl(el.id, { y })} />
        <Num label="Width mm" value={el.w} min={5} onChange={(w) => updateEl(el.id, { w })} />
      </div>
      <div className="tools" role="group" aria-label="Align">
        <span className="lab">Align to the margins</span>
        {ALIGNS.map((a) => <button key={a.how} title={a.label} aria-label={a.label} onClick={() => updateEl(el.id, alignTo(box, inner, a.how))}>{a.glyph}</button>)}
        <button title="Centre on the page" onClick={() => updateEl(el.id, { ...alignTo(box, inner, 'center'), ...alignTo(box, inner, 'middle') })}>Centre</button>
        {el.kind === 'figure' && <button title="Largest size that fits inside the margins, centred" onClick={() => updateEl(el.id, fitInside(box, inner))}>Fit page</button>}
      </div>
      <div className="tools" role="group" aria-label="Turn">
        <span className="lab">Turn {el.rot ? `(${el.rot * 90}° clockwise)` : ''}</span>
        <button title="Turn a quarter anticlockwise" aria-label="Turn anticlockwise" onClick={() => turn(-1)}>↺</button>
        <button title="Turn a quarter clockwise" aria-label="Turn clockwise" onClick={() => turn(1)}>↻</button>
        <button title="Turn upside down" onClick={() => turn(2)}>180°</button>
        <button title="Back upright" onClick={() => updateEl(el.id, { rot: 0 })} disabled={!el.rot}>Upright</button>
      </div>
      {el.kind === 'text' ? <TextFields el={el} /> : <FigureFields el={el} err={err} />}
      <div className="row">
        <button onClick={() => updateEl(el.id, { x: doc.marginMm, w: page.w - 2 * doc.marginMm })}>Fit width</button>
        <button onClick={() => duplicateEl(el.id)} title="Duplicate (Ctrl+D)">Duplicate</button>
        <button onClick={() => moveEl(el.id, -1)} aria-label="Move earlier in the list">↑</button>
        <button onClick={() => moveEl(el.id, 1)} aria-label="Move later in the list">↓</button>
        <button className="danger" onClick={() => removeEl(el.id)}>Remove</button>
      </div>
    </div>
  );
}

function TextFields({ el }: { el: TextEl }) {
  const { updateEl, setEditing } = useStore();
  return (
    <>
      <p className="excerpt">{el.text.length > 140 ? `${el.text.slice(0, 140)}…` : el.text || <em>(empty)</em>}</p>
      <div className="row"><button onClick={() => setEditing({ kind: 'text', id: el.id })} title="Or double-click it on the page">Edit text…</button></div>
      <div className="tools" role="group" aria-label="Text alignment">
        <span className="lab">Text alignment</span>
        {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={el.align === a ? 'on' : ''} onClick={() => updateEl(el.id, { align: a })}>{a[0]!.toUpperCase() + a.slice(1)}</button>)}
      </div>
      <Num label="Letter height mm" value={el.sizeMm} step={0.2} min={1} onChange={(sizeMm) => updateEl(el.id, { sizeMm: Math.max(1, sizeMm) })} />
    </>
  );
}

function FigureFields({ el, err }: { el: FigureEl; err?: string }) {
  const { doc, updateEl, setEditing } = useStore();
  const source = doc.sources.find((x) => x.id === el.src);
  return (
    <>
      <div className="row">
        <label className="grow">Page
          <select value={el.page} onChange={(e) => updateEl(el.id, { page: +e.target.value })}>
            {Array.from({ length: source?.pages ?? 1 }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
          </select>
        </label>
        <label className="grow">Trace
          <select value={el.method} onChange={(e) => updateEl(el.id, { method: e.target.value as FigureEl['method'] })}>
            <option value="lineart">Line art (centre lines)</option>
            <option value="edges">Edges (shaded or photo)</option>
          </select>
        </label>
      </div>
      <div className="row">
        <button onClick={() => setEditing({ kind: 'crop', id: el.id })} title="Or double-click it on the page">Crop…</button>
        {!isWhole(rectFromCrop(el.crop)) && <button onClick={() => updateEl(el.id, { crop: [0, 0, 0, 0] })}>Whole sheet</button>}
        <span className="hint">{isWhole(rectFromCrop(el.crop)) ? 'Showing the whole sheet' : `Showing ${Math.round((1 - el.crop[1] - el.crop[3]) * 100)}% × ${Math.round((1 - el.crop[0] - el.crop[2]) * 100)}% of it`}</span>
      </div>
      <label className="check"><input type="checkbox" checked={el.cleanEdges} disabled={el.method !== 'lineart'} onChange={(e) => updateEl(el.id, { cleanEdges: e.target.checked })} /> Clean scan edges (page curls, paper edge)</label>
      {err && <p className="err">{err}</p>}
    </>
  );
}
