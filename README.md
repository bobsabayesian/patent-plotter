# patent-plotter

Pick a US patent, choose your paper and pens, place its drawings and text, export SVG for a pen plotter.
Deploys to patents.bobsabayesian.io (Cloudflare Worker + the shared `project-files` R2 bucket).

- **Drawings** are the patent office's 1-bit scans, fetched through `/api/img` (the image host sends no CORS headers) and
  vectorized in a web worker: ink is thresholded, thinned to centre lines (`src/vectorize/skeleton.ts`), traced,
  simplified and ordered to cut pen travel. A second mode, **Edges**, reuses moire's edge finder (`src/outline/contours.ts`) for shaded figures.
- **Patent data** comes from Google Patents pages (no key), cached at `patent-plotter/patents/<id>.json`.
- **Sessions**: a 10-character code (same scheme as moire's workspaces), saved at `patent-plotter/sessions/<code>.json`. Open with `?s=CODE`.
- **Pens and the stroke font** are copied from moire-money-moire-problems (`src/scene/pens.ts`, `src/hatch/strokefont.ts`).

```bash
npm install
npm run dev      # /api/* is served locally, storing under ./.dev-store
npm test
npm run deploy   # build + wrangler deploy
```
