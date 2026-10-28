import { useMemo, useRef, useState } from 'react';
import { Dialog } from './Dialog';
import type { TextEl } from './doc';
import { placeText } from './layout';
import { penType } from './scene/pens';
import { useStore } from './store';
import { unsupported } from './text';

const d = (line: [number, number][]) => line.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');

/** Edit a block of text with a live picture of how the pen will draw it, patent fields to drop in, and a warning for what the font cannot draw. */
export function TextDialog({ el, onClose }: { el: TextEl; onClose: () => void }) {
  const { doc, patent, updateEl } = useStore();
  const [text, setText] = useState(el.text);
  const [sizeMm, setSize] = useState(el.sizeMm);
  const [w, setW] = useState(el.w);
  const [align, setAlign] = useState(el.align);
  const [claim, setClaim] = useState(1);
  const area = useRef<HTMLTextAreaElement>(null);

  const pen = doc.pens[el.pen] ?? doc.pens[0]!;
  const preview = useMemo(() => placeText({ ...el, text, sizeMm, w, align, x: 0, y: 0, rot: 0 }), [el, text, sizeMm, w, align]);
  const missing = unsupported(text);
  const tip = Math.max(0.1, pen.tipMm || penType(pen.type).defaultTipMm);

  /** Put `s` where the cursor is (or over the selection). */
  const insert = (s: string) => {
    const a = area.current, from = a?.selectionStart ?? text.length, to = a?.selectionEnd ?? text.length;
    setText(text.slice(0, from) + s + text.slice(to));
    requestAnimationFrame(() => { a?.focus(); a?.setSelectionRange(from + s.length, from + s.length); });
  };
  const fields = patent
    ? ([['Title', patent.title], ['Number', patent.id], ['Granted', patent.issued], ['Filed', patent.filed], ['Inventors', patent.inventors.join(', ')], ['Assignee', patent.assignee], ['Abstract', patent.abstract]] as const).filter(([, v]) => v)
    : [];
  const apply = () => { updateEl(el.id, { text, sizeMm, w, align }); onClose(); };

  return (
    <Dialog title={`Edit text: ${el.label}`} onClose={onClose}>
      <div className="dlg-body" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); apply(); } }}>
        <textarea ref={area} data-autofocus rows={9} value={text} onChange={(e) => setText(e.target.value)} aria-label="Text" spellCheck />
        <div className="hint">{text.length.toLocaleString()} characters · {preview.lines.length.toLocaleString()} pen strokes · a blank line starts a new paragraph</div>
        {missing.length > 0 && <p className="warn" role="status">The pen font cannot draw {missing.map((c) => `“${c}”`).join(' ')}; {missing.length === 1 ? 'it' : 'they'} will be left out.</p>}

        {fields.length > 0 && (
          <div className="tools" role="group" aria-label="Insert from the patent">
            <span className="lab">Insert from the patent, at the cursor</span>
            {fields.map(([label, value]) => <button key={label} onClick={() => insert(value)} title={value.slice(0, 120)}>{label}</button>)}
            {!!patent?.claims.length && (
              <>
                <input type="number" min={1} max={patent.claims.length} value={claim} onChange={(e) => setClaim(Math.min(patent.claims.length, Math.max(1, +e.target.value || 1)))} aria-label="Claim number" />
                <button onClick={() => insert(patent.claims[claim - 1]!)}>Claim {claim}</button>
              </>
            )}
          </div>
        )}

        <div className="row">
          <label>Letter height mm<input type="number" min={1} step={0.2} value={sizeMm} onChange={(e) => setSize(Math.max(1, +e.target.value || 1))} /></label>
          <label>Width mm<input type="number" min={5} step={1} value={+w.toFixed(1)} onChange={(e) => setW(Math.max(5, +e.target.value || 5))} /></label>
          <div className="tools" role="group" aria-label="Text alignment">
            {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={align === a ? 'on' : ''} onClick={() => setAlign(a)}>{a[0]!.toUpperCase() + a.slice(1)}</button>)}
          </div>
        </div>

        <h3>As the pen will draw it</h3>
        <div className="dlg-preview">
          <svg viewBox={`${-2} ${-2} ${w + 4} ${preview.box[3] + 4}`} role="img" aria-label="Preview of the text as drawn">
            <rect x={-2} y={-2} width={w + 4} height={preview.box[3] + 4} fill="#fff" />
            <rect x={0} y={0} width={w} height={preview.box[3]} fill="none" stroke="#ccd" strokeWidth={0.2} strokeDasharray="1 1" />
            <path d={preview.lines.map(d).join('')} fill="none" stroke={pen.color} strokeWidth={tip} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <footer>
        <span className="hint">Ctrl+Enter to apply</span>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={apply}>Apply</button>
      </footer>
    </Dialog>
  );
}
