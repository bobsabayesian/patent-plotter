/// <reference lib="webworker" />
import { vectorizeLineArt } from './skeleton';
import { edgeLines } from '../outline/contours';
import type { VectorizeRequest, VectorizeResponse } from './protocol';
import type { XY } from '../vector/simplify';

/** Crop and vectorize a sheet's pixels, off the page's thread: a full sheet is millions of pixels. */
function run(req: VectorizeRequest): VectorizeResponse {
  const [t, r, b, l] = req.crop;
  const sx = Math.round(req.w * l), sy = Math.round(req.h * t);
  const w = Math.max(1, Math.min(req.w - sx, Math.round(req.w * (1 - l - r))));
  const h = Math.max(1, Math.min(req.h - sy, Math.round(req.h * (1 - t - b))));
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) gray.set(req.gray.subarray((sy + y) * req.w + sx, (sy + y) * req.w + sx + w), y * w);
  let lines: XY[][];
  if (req.method === 'edges') {
    const luma = new Float32Array(gray.length);
    for (let i = 0; i < gray.length; i++) luma[i] = gray[i]! / 255;
    lines = edgeLines(luma, w, h, { scale: 1, strength: 0.25 });
  } else {
    lines = vectorizeLineArt(gray, w, h, { cleanEdges: req.cleanEdges });
  }
  return { id: req.id, ok: true, lines, width: w, height: h };
}

self.onmessage = (e: MessageEvent<VectorizeRequest>) => {
  try {
    self.postMessage(run(e.data));
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: String((err as Error)?.message ?? err) } satisfies VectorizeResponse);
  }
};
