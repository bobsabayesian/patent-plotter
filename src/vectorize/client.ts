import type { Method, VectorizeRequest, VectorizeResponse } from './protocol';
import type { XY } from '../vector/simplify';

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

/** Vectorize a drawing sheet; the same sheet with the same settings is only done once. */
export function vectorize(url: string, method: Method, crop: [number, number, number, number]): Promise<Vectorized> {
  const key = `${url}|${method}|${crop.join(',')}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise<Vectorized>((ok, fail) => {
      const id = nextId++;
      waiting.set(id, { ok, fail });
      getWorker().postMessage({ id, url, method, crop } satisfies VectorizeRequest);
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
