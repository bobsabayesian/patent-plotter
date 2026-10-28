import { useEffect, useRef, useState } from 'react';
import type { Doc, El } from './doc';
import { pageMm } from './doc';
import { snapAxis, snapMove, targetsFor, resizeBox, type Box, type Handle } from './geometry';
import { buildScene, placeEl } from './layout';
import { useStore } from './store';
import type { VectorState } from './useVectors';

const d = (line: [number, number][]) => line.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
const round = (n: number) => +n.toFixed(1);

/** Drawings resize from their corners (keeping their shape); a block of text takes its width from its sides. */
const handlesFor = (el: El, [x, y, w, h]: Box): { handle: Handle; x: number; y: number; cursor: string }[] =>
  el.kind === 'figure'
    ? [
        { handle: 'nw', x, y, cursor: 'nwse-resize' }, { handle: 'ne', x: x + w, y, cursor: 'nesw-resize' },
        { handle: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' }, { handle: 'sw', x, y: y + h, cursor: 'nesw-resize' },
      ]
    : [{ handle: 'w', x, y: y + h / 2, cursor: 'ew-resize' }, { handle: 'e', x: x + w, y: y + h / 2, cursor: 'ew-resize' }];

type Drag = { kind: 'move'; id: string; dx: number; dy: number; w: number; h: number } | { kind: 'resize'; id: string; handle: Handle; box: Box };

/** How close, in screen pixels, a box has to come to a snap line for it to jump onto it. */
const SNAP_PX = 6;

export function Preview({ doc, vec, zoom, snap }: { doc: Doc; vec: VectorState; zoom: number; snap: boolean }) {
  const { selected, select, updateEl } = useStore();
  const page = pageMm(doc);
  const scene = buildScene(doc, vec.vecs);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; at: number }[]>([]);
  /** how many mm one screen pixel is, so handles and snapping stay the same size on screen at any zoom */
  const [k, setK] = useState(0.3);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => { const m = el.getScreenCTM(); if (m && m.a > 0) setK(1 / m.a); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, page.w, page.h]);

  /** Pointer position on the page, mm. */
  const at = (e: React.PointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const boxes = () => new Map(doc.elements.map((el) => [el.id, placeEl(el, vec.vecs).box] as const));
  const targets = (except: string) => targetsFor(page, doc.marginMm, [...boxes()].filter(([id]) => id !== except).map(([, b]) => b));

  const onMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const p = at(e);
    const useSnap = snap && !e.altKey; // hold Alt to place freely
    const th = SNAP_PX * k;
    if (g.kind === 'move') {
      let x = p.x - g.dx, y = p.y - g.dy;
      if (useSnap) {
        const s = snapMove([x, y, g.w, g.h], targets(g.id), th);
        x += s.dx; y += s.dy;
        setGuides(s.guides);
      } else setGuides([]);
      updateEl(g.id, { x: round(x), y: round(y) });
      return;
    }
    let px = p.x;
    if (useSnap) {
      const s = snapAxis([px], targets(g.id).xs, th);
      if (s) { px += s.delta; setGuides([{ axis: 'x', at: s.at }]); } else setGuides([]);
    } else setGuides([]);
    const r = resizeBox(g.box, g.handle, { x: px, y: p.y });
    const el = doc.elements.find((x) => x.id === g.id);
    updateEl(g.id, el?.kind === 'text' ? { x: round(r.x), w: round(r.w) } : { x: round(r.x), y: round(r.y), w: round(r.w) });
  };
  const end = () => { drag.current = null; setGuides([]); };

  return (
    <svg
      ref={svg}
      className="page"
      style={zoom === 1 ? undefined : { height: `calc((100dvh - 32px) * ${zoom})` }}
      viewBox={`-6 -6 ${page.w + 12} ${page.h + 12}`}
      role="img"
      aria-label="Page preview"
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as Element).id === 'paper') select(null); }}
    >
      <rect id="paper" x="0" y="0" width={page.w} height={page.h} className="paper" />
      <rect x={doc.marginMm} y={doc.marginMm} width={page.w - 2 * doc.marginMm} height={page.h - 2 * doc.marginMm} className="margin" />
      {scene.layers.map((l) => (
        <path key={l.index} d={l.lines.map(d).join('')} fill="none" stroke={l.color} strokeWidth={l.widthMm} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {doc.elements.map((el) => {
        const box = placeEl(el, vec.vecs).box;
        const [x, y, w, h] = box;
        const busy = vec.loading.has(el.id), err = vec.errors.get(el.id);
        const on = el.id === selected;
        return (
          <g key={el.id}>
            <rect
              x={x} y={y} width={w} height={h}
              className={`hit${on ? ' on' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                select(el.id);
                const p = at(e);
                drag.current = { kind: 'move', id: el.id, dx: p.x - el.x, dy: p.y - el.y, w, h };
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
            />
            {(busy || err) && <text x={x + w / 2} y={y + Math.min(h, 40) / 2} className={`note${err ? ' bad' : ''}`} textAnchor="middle">{err ?? 'tracing the drawing…'}</text>}
            {on && handlesFor(el, box).map((hd) => (
              <rect
                key={hd.handle}
                className="handle"
                x={hd.x - 4 * k} y={hd.y - 4 * k} width={8 * k} height={8 * k}
                style={{ cursor: hd.cursor }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  drag.current = { kind: 'resize', id: el.id, handle: hd.handle, box };
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                }}
              />
            ))}
          </g>
        );
      })}
      {guides.map((g, i) => (g.axis === 'x'
        ? <line key={i} className="guide" x1={g.at} x2={g.at} y1={-6} y2={page.h + 6} />
        : <line key={i} className="guide" x1={-6} x2={page.w + 6} y1={g.at} y2={g.at} />))}
    </svg>
  );
}
