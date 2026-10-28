import type { Method, VectorizeRequest, VectorizeResponse } from './protocol';
import type { XY } from '../vector/simplify';
import { pageGray } from '../pdfStore';

export interface Vectorized { lines: XY[][]; width: number; height: number }

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { ok: (v: Vectorized) => void; fail: (e: Error) => void }>();
const cache = new Map<string, Promise<Vectorized>>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<VectorizeResponse>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.ok({ lines: e.data.lines, width: e.data.width, height: e.data.height }); else w.fail(new Error(e.data.error));
    };
  }
  return worker;
}

/** Vectorize a page of an uploaded PDF; the same page with the same settings is only done once. */
export function vectorize(code: string, src: string, page: number, method: Method, crop: [number, number, number, number], cleanEdges = true): Promise<Vectorized> {
  const key = `${src}|${page}|${method}|${crop.join(',')}|${cleanEdges}`;
  let p = cache.get(key);
  if (!p) {
    p = pageGray(code, src, page).then((g) => new Promise<Vectorized>((ok, fail) => {
      const id = nextId++;
      waiting.set(id, { ok, fail });
      const gray = g.data.slice(); // the worker takes this copy; the rendered page stays here for the next trace
      getWorker().postMessage({ id, gray, w: g.w, h: g.h, method, crop, cleanEdges } satisfies VectorizeRequest, [gray.buffer]);
    }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
