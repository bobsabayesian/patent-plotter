# patent-plotter

Upload a patent PDF, choose your paper and pens, place its drawings and text, export SVG for a pen plotter.
Deploys to patents.bobsabayesian.io (Cloudflare Worker + the shared `project-files` R2 bucket).

- **PDFs** are uploaded to `patent-plotter/pdfs/<session>/<id>.pdf` (30 MB each) and read in the browser with pdf.js.
  Patent scans are JBIG2, which pdf.js decodes with WebAssembly: the decoders are served from `/pdfjs/wasm/`
  (a Vite plugin in `vite.config.ts` serves them in dev and copies them into the build). Without them, scanned
  pages render blank.
- **Drawings** are rendered to pixels (`src/pdf.ts`) and vectorized in a web worker: ink is thresholded, solid scan-edge
  bands cleared, strokes thinned to centre lines (`src/vectorize/skeleton.ts`), traced, simplified and ordered to cut
  pen travel. A second mode, **Edges**, reuses moire's edge finder (`src/outline/contours.ts`) for shaded figures.
- **Text** comes from the PDF's text layer (the patent office's own pages and the OCR on old ones) or is typed. The pen
  font (`src/hatch/`) is moire's, plus capitals and punctuation of our own.
- **Sessions**: a 10-character code (same scheme as moire's workspaces), saved at `patent-plotter/sessions/<code>.json`.
  Open with `?s=CODE`.
- **Pens and paper** are moire's (`src/scene/pens.ts`).

Earlier versions searched Google Patents and fetched patents by number; Google refuses Cloudflare's servers and then a
home connection, so that was removed (it is in the git history, with the relay that worked around it).

```bash
npm install
npm run dev      # /api/* is served locally, storing under ./.dev-store
npm test
npm run deploy   # build + wrangler deploy
```
