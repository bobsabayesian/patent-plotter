import { useRef, useState } from 'react';
import { cropFromRect, drawRect, inkBounds, isWhole, moveRect, rectFromCrop, resizeRect, type CropHandle, type Rect } from './crop';
import { Dialog } from './Dialog';
import type { FigureEl } from './doc';
import { useStore } from './store';

const HANDLES: { h: CropHandle; style: React.CSSProperties; cursor: string }[] = [
  { h: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' }, { h: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' }, { h: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { h: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' }, { h: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { h: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' }, { h: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' }, { h: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
];
const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

type Drag = { mode: 'draw' | 'move' | 'resize'; anchor: { x: number; y: number }; start: Rect; handle?: CropHandle; moved: boolean };

/** Crop a drawing sheet by dragging a rectangle on the sheet itself (draw a new one, drag its edges, or drag it along). */
export function CropDialog({ el, onClose }: { el: FigureEl; onClose: () => void }) {
  const { patent, updateEl } = useStore();
  const url = patent?.drawings[el.sheet];
  const [rect, setRect] = useState<Rect>(rectFromCrop(el.crop));
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<Drag | null>(null);

  const at = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  const onDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement, p = at(e);
    const handle = t.dataset.handle as CropHandle | undefined;
    drag.current = handle ? { mode: 'resize', handle, anchor: p, start: rect, moved: true } : t.dataset.body ? { mode: 'move', anchor: p, start: rect, moved: true } : { mode: 'draw', anchor: p, start: rect, moved: false };
    box.current!.setPointerCapture(e.pointerId);
    setNote(null);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const p = at(e);
    if (g.mode === 'draw') {
      if (!g.moved && Math.hypot(p.x - g.anchor.x, p.y - g.anchor.y) < 0.01) return; // a plain click does not wipe out the crop
      g.moved = true;
      setRect(drawRect(g.anchor, p));
    } else if (g.mode === 'move') setRect(moveRect(g.start, p.x - g.anchor.x, p.y - g.anchor.y));
    else setRect(resizeRect(g.start, g.handle!, p));
  };
  const onUp = () => { drag.current = null; };

  /** Find the drawing on the sheet and crop to it. */
  const trim = () => {
    const im = img.current;
    if (!im || !im.naturalWidth) return;
    const w = 700, h = Math.round((w * im.naturalHeight) / im.naturalWidth);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(im, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4]! * 0.299 + rgba[i * 4 + 1]! * 0.587 + rgba[i * 4 + 2]! * 0.114) | 0;
    const b = inkBounds(gray, w, h);
    if (b) { setRect(b); setNote(null); } else setNote('Could not find a drawing on this sheet.');
  };
  const apply = () => { updateEl(el.id, { crop: isWhole(rect) ? [0, 0, 0, 0] : cropFromRect(rect) }); onClose(); };
  const [x0, y0, x1, y1] = rect;

  return (
    <Dialog title={`Crop sheet ${el.sheet + 1}`} onClose={onClose}>
      <div className="dlg-body">
        <p className="hint">Drag on the sheet to choose the part to draw, or drag the box and its handles. Use it to pick one figure, or to cut off the page header.</p>
        {!url ? <p className="err">This patent has no drawing sheet {el.sheet + 1}.</p> : (
          <div className="crop-stage">
            <div ref={box} className="crop-box" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <img ref={img} src={`/api/img?u=${encodeURIComponent(url)}`} alt={`Drawing sheet ${el.sheet + 1}`} draggable={false} />
              <div className="shade" style={{ left: 0, top: 0, width: '100%', height: pct(y0) }} />
              <div className="shade" style={{ left: 0, top: pct(y1), width: '100%', height: pct(1 - y1) }} />
              <div className="shade" style={{ left: 0, top: pct(y0), width: pct(x0), height: pct(y1 - y0) }} />
              <div className="shade" style={{ left: pct(x1), top: pct(y0), width: pct(1 - x1), height: pct(y1 - y0) }} />
              <div className="crop-rect" data-body="1" style={{ left: pct(x0), top: pct(y0), width: pct(x1 - x0), height: pct(y1 - y0) }}>
                {HANDLES.map((hd) => <span key={hd.h} className="crop-handle" data-handle={hd.h} style={{ ...hd.style, cursor: hd.cursor }} />)}
              </div>
            </div>
          </div>
        )}
        {note && <p className="warn" role="status">{note}</p>}
        <div className="row">
          <button onClick={trim} disabled={!url} title="Crop to where the drawing is, leaving out scan edges">Trim to drawing</button>
          <button onClick={() => setRect([0, 0, 1, 1])} disabled={isWhole(rect)}>Whole sheet</button>
          <span className="hint">Keeps {Math.round((x1 - x0) * 100)}% across and {Math.round((y1 - y0) * 100)}% down</span>
        </div>
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" data-autofocus onClick={apply}>Apply</button>
      </footer>
    </Dialog>
  );
}
