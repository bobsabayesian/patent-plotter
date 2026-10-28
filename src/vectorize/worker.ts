/// <reference lib="webworker" />
import { vectorizeLineArt } from './skeleton';
import { edgeLines } from '../outline/contours';
import type { VectorizeRequest, VectorizeResponse } from './protocol';
import type { XY } from '../vector/simplify';

/** Decode, crop, vectorize: all off the page's thread, since a full sheet is millions of pixels. */
async function run(req: VectorizeRequest): Promise<VectorizeResponse> {
  const res = await fetch(`/api/img?u=${encodeURIComponent(req.url)}`);
  if (!res.ok) return { id: req.id, ok: false, error: `could not get the drawing (${res.status})` };
  const bmp = await createImageBitmap(await res.blob());
  const [t, r, b, l] = req.crop;
  const sx = Math.round(bmp.width * l), sy = Math.round(bmp.height * t);
  const w = Math.max(1, Math.round(bmp.width * (1 - l - r))), h = Math.max(1, Math.round(bmp.height * (1 - t - b)));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, sx, sy, w, h, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4]! * 0.299 + rgba[i * 4 + 1]! * 0.587 + rgba[i * 4 + 2]! * 0.114) | 0;
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
  run(e.data).then(
    (out) => self.postMessage(out),
    (err) => self.postMessage({ id: e.data.id, ok: false, error: String(err?.message ?? err) } satisfies VectorizeResponse),
  );
};
