import { useEffect, useState } from 'react';
import { PAPERS, pageMm, type El, type FigureEl, type TextEl } from './doc';
import { buildScene } from './layout';
import { Preview } from './Preview';
import { PEN_TYPES, penType, nearestTip } from './scene/pens';
import { cleanCode } from './session';
import { useStore } from './store';
import { sceneToSvg } from './svg';
import { useVectors } from './useVectors';

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');

export function App() {
  const s = useStore();
  const { doc, patent } = s;
  const vec = useVectors(doc, patent);
  useEffect(() => { void s.boot(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exportSvg = () => {
    const scene = buildScene(doc, vec.vecs);
    const meta = JSON.stringify({ app: 'patent-plotter', version: __APP_VERSION__, commit: __APP_COMMIT__, session: s.code, doc }).replace(/</g, '\\u003c');
    const svg = sceneToSvg(scene, { metadata: `<metadata id="patent-plotter">${meta}</metadata>` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `${doc.patent ?? 'patent'}-${stamp()}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const waiting = vec.loading.size > 0;

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Patent Plotter</h1>
          <p className="sub">US patent drawings, for pen plotters</p>
        </header>
        <SessionBox />
        <PatentBox />
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
        <Preview doc={doc} vec={vec} />
      </main>
    </div>
  );
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

function PatentBox() {
  const { patent, doc, loadPatent, addFigure, addText } = useStore();
  const [num, setNum] = useState('');
  const [claim, setClaim] = useState(1);
  return (
    <section>
      <h2>Patent</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (num.trim()) void loadPatent(num); }}>
        <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="US patent number, e.g. 7,654,321" aria-label="US patent number" spellCheck={false} />
        <button type="submit" disabled={!num.trim()}>Load</button>
      </form>
      {patent ? (
        <>
          <p className="title"><strong>{patent.id}</strong> {patent.title}</p>
          <p className="hint">{[patent.inventors.slice(0, 3).join(', '), patent.issued].filter(Boolean).join(' · ')}</p>
          <h3>Drawing sheets <small>click to place</small></h3>
          <div className="sheets">
            {patent.drawings.map((u, i) => (
              <button key={u} className="sheet" onClick={() => addFigure(i)} title={`Place sheet ${i + 1}`}>
                <img src={`/api/img?u=${encodeURIComponent(u)}`} alt={`Drawing sheet ${i + 1}`} loading="lazy" />
                <span>{i + 1}</span>
              </button>
            ))}
            {!patent.drawings.length && <p className="hint">This patent has no drawings.</p>}
          </div>
          <h3>Text <small>click to add</small></h3>
          <div className="chips">
            <button onClick={() => addText('Title', patent.title, 6)}>Title</button>
            <button onClick={() => addText('Number & date', `${patent.id}${patent.issued ? ` · granted ${patent.issued}` : ''}`, 3)}>Number & date</button>
            {!!patent.inventors.length && <button onClick={() => addText('Inventors', patent.inventors.join(', '), 3)}>Inventors</button>}
            {!!patent.assignee && <button onClick={() => addText('Assignee', patent.assignee, 3)}>Assignee</button>}
            {!!patent.abstract && <button onClick={() => addText('Abstract', patent.abstract, 2.6)}>Abstract</button>}
            <button onClick={() => addText('Custom text', 'Your words here', 5)}>Custom text</button>
          </div>
          {!!patent.claims.length && (
            <div className="row">
              <label className="grow">Claim <input type="number" min={1} max={patent.claims.length} value={claim} onChange={(e) => setClaim(Math.min(patent.claims.length, Math.max(1, +e.target.value || 1)))} /> of {patent.claims.length}</label>
              <button onClick={() => addText(`Claim ${claim}`, patent.claims[claim - 1]!, 2.6)}>Add claim</button>
            </div>
          )}
        </>
      ) : (
        <p className="hint">{doc.patent ? `Loading ${doc.patent}…` : 'Type a US patent number to begin. Grants and design patents work; applications do not yet.'}</p>
      )}
    </section>
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
  const name = (e: El) => (e.kind === 'figure' ? `Drawing, sheet ${e.sheet + 1}` : e.label);
  return (
    <section>
      <h2>On the page</h2>
      {!doc.elements.length && <p className="hint">Nothing yet. Place a drawing sheet or some text.</p>}
      <ul className="els">
        {doc.elements.map((e) => (
          <li key={e.id}><button className={e.id === selected ? 'on' : ''} onClick={() => select(e.id === selected ? null : e.id)}><i style={{ background: doc.pens[e.pen]?.color }} />{name(e)}</button></li>
        ))}
      </ul>
      {el && <Editor key={el.id} el={el} err={vec.errors.get(el.id)} />}
    </section>
  );
}

function Num({ label, value, onChange, step = 1, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return <label>{label}<input type="number" step={step} min={min} value={+value.toFixed(2)} onChange={(e) => { const v = +e.target.value; if (Number.isFinite(v)) onChange(v); }} /></label>;
}

function Editor({ el, err }: { el: El; err?: string }) {
  const { doc, updateEl, removeEl, moveEl } = useStore();
  const page = pageMm(doc);
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
      {el.kind === 'text' ? <TextFields el={el} /> : <FigureFields el={el} err={err} />}
      <div className="row">
        <button onClick={() => updateEl(el.id, { x: doc.marginMm, w: page.w - 2 * doc.marginMm })}>Fit width</button>
        <button onClick={() => moveEl(el.id, -1)} aria-label="Move earlier in the list">↑</button>
        <button onClick={() => moveEl(el.id, 1)} aria-label="Move later in the list">↓</button>
        <button className="danger" onClick={() => removeEl(el.id)}>Remove</button>
      </div>
    </div>
  );
}

function TextFields({ el }: { el: TextEl }) {
  const { updateEl } = useStore();
  return (
    <>
      <textarea rows={4} value={el.text} onChange={(e) => updateEl(el.id, { text: e.target.value })} aria-label="Text" />
      <Num label="Letter height mm" value={el.sizeMm} step={0.2} min={1} onChange={(sizeMm) => updateEl(el.id, { sizeMm: Math.max(1, sizeMm) })} />
      <p className="hint">The stroke font draws capitals as lowercase.</p>
    </>
  );
}

function FigureFields({ el, err }: { el: FigureEl; err?: string }) {
  const { patent, updateEl } = useStore();
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  return (
    <>
      <div className="row">
        <label className="grow">Sheet
          <select value={el.sheet} onChange={(e) => updateEl(el.id, { sheet: +e.target.value })}>
            {(patent?.drawings ?? []).map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
          </select>
        </label>
        <label className="grow">Trace
          <select value={el.method} onChange={(e) => updateEl(el.id, { method: e.target.value as FigureEl['method'] })}>
            <option value="lineart">Line art (centre lines)</option>
            <option value="edges">Edges (shaded or photo)</option>
          </select>
        </label>
      </div>
      <div className="grid4">
        {sides.map((side, k) => (
          <Num key={side} label={`${side} %`} value={el.crop[k]! * 100} step={1} onChange={(v) => updateEl(el.id, { crop: el.crop.map((c, j) => (j === k ? Math.min(90, Math.max(0, v)) / 100 : c)) as FigureEl['crop'] })} />
        ))}
      </div>
      <p className="hint">Trim a sheet to show one figure, or to cut off the page header.</p>
      {err && <p className="err">{err}</p>}
    </>
  );
}
