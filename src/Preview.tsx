import { useRef } from 'react';
import type { Doc } from './doc';
import { pageMm } from './doc';
import { buildScene, placeEl } from './layout';
import { useStore } from './store';
import type { VectorState } from './useVectors';

const d = (line: [number, number][]) => line.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');

export function Preview({ doc, vec }: { doc: Doc; vec: VectorState }) {
  const { selected, select, updateEl } = useStore();
  const page = pageMm(doc);
  const scene = buildScene(doc, vec.vecs);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  /** Pointer position on the page, mm. */
  const at = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  return (
    <svg
      ref={svg}
      className="page"
      viewBox={`-6 -6 ${page.w + 12} ${page.h + 12}`}
      role="img"
      aria-label="Page preview"
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g) return;
        const p = at(e);
        updateEl(g.id, { x: +(p.x - g.dx).toFixed(1), y: +(p.y - g.dy).toFixed(1) });
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
      onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as Element).id === 'paper') select(null); }}
    >
      <rect id="paper" x="0" y="0" width={page.w} height={page.h} className="paper" />
      <rect x={doc.marginMm} y={doc.marginMm} width={page.w - 2 * doc.marginMm} height={page.h - 2 * doc.marginMm} className="margin" />
      {scene.layers.map((l) => (
        <path key={l.index} d={l.lines.map(d).join('')} fill="none" stroke={l.color} strokeWidth={l.widthMm} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {doc.elements.map((el) => {
        const [x, y, w, h] = placeEl(el, vec.vecs).box;
        const busy = vec.loading.has(el.id), err = vec.errors.get(el.id);
        return (
          <g key={el.id}>
            <rect
              x={x} y={y} width={w} height={h}
              className={`hit${el.id === selected ? ' on' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                select(el.id);
                const p = at(e);
                drag.current = { id: el.id, dx: p.x - el.x, dy: p.y - el.y };
                (e.target as Element).setPointerCapture?.(e.pointerId);
              }}
            />
            {(busy || err) && <text x={x + w / 2} y={y + Math.min(h, 40) / 2} className={`note${err ? ' bad' : ''}`} textAnchor="middle">{err ?? 'tracing the drawing…'}</text>}
          </g>
        );
      })}
    </svg>
  );
}
