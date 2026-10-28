import { useEffect, useMemo, useState } from 'react';
import type { Doc, FigureEl } from './doc';
import { vectorize, type Vectorized } from './vectorize/client';

export interface VectorState { vecs: Map<string, Vectorized>; loading: Set<string>; errors: Map<string, string> }

/** Vectorize every drawing on the page (each PDF page once per setting) and hand back what is ready. */
export function useVectors(doc: Doc, code: string | null): VectorState {
  const [vecs, setVecs] = useState<Map<string, Vectorized>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  // only what changes the trace matters: moving or resizing a figure must not redo it
  const key = JSON.stringify(doc.elements.filter((e): e is FigureEl => e.kind === 'figure').map((e) => [e.id, e.src, e.page, e.method, e.crop, e.cleanEdges]));
  const figures = useMemo(() => JSON.parse(key) as [string, string, number, FigureEl['method'], FigureEl['crop'], boolean][], [key]);

  useEffect(() => {
    let live = true;
    const ids = new Set(figures.map((f) => f[0]));
    setVecs((m) => new Map([...m].filter(([id]) => ids.has(id))));
    for (const [id, src, page, method, crop, clean] of figures) {
      if (!code) continue;
      setLoading((s) => new Set(s).add(id));
      setErrors((m) => { const n = new Map(m); n.delete(id); return n; });
      vectorize(code, src, page, method, crop, clean).then(
        (v) => { if (live) setVecs((m) => new Map(m).set(id, v)); },
        (e: Error) => { if (live) setErrors((m) => new Map(m).set(id, e.message)); },
      ).finally(() => { if (live) setLoading((s) => { const n = new Set(s); n.delete(id); return n; }); });
    }
    return () => { live = false; };
  }, [figures, code]);

  return { vecs, loading, errors };
}
