import type { Layer, Scene } from './scene/types';

const f = (n: number) => +n.toFixed(3);

/** A path in mm. A line of more than two points is written as its start and then each step from the last point (about a third shorter, which matters with thousands of dots): the steps are between points rounded to 0.01 mm, so they add up exactly and do not drift. */
export function pathData(line: [number, number][]): string {
  if (line.length <= 2) return line.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');
  const q = (n: number) => Math.round(n * 100) / 100;
  let px = q(line[0]![0]), py = q(line[0]![1]);
  let d = `M${f(px)} ${f(py)}l`;
  for (let i = 1; i < line.length; i++) {
    const x = q(line[i]![0]), y = q(line[i]![1]);
    d += `${f(x - px)} ${f(y - py)} `;
    px = x; py = y;
  }
  return d.trimEnd();
}

/**
 * One Inkscape layer per pen, in the order the pens should be swapped in. Units are mm, no background
 * (plotting). Readable by vpype's read_multilayer_svg.
 */
export interface SvgOptions {
  /** add a page behind the lines (for previews and PNG; leave off for plotting): true for white, or a #rrggbb colour */
  paper?: boolean | string;
  /**
   * Previews only: how each pen's layer blends with what is under it. 'multiply' darkens like translucent ink
   * (yellow over cyan looks green); 'normal' covers it like opaque ink. Needs `paper` so there is something to blend
   * with. Leave unset for files that are plotted.
   */
  blend?: (layer: Layer) => 'multiply' | 'normal';
  /** a <metadata> element to place in the file (see settings/embed.ts), e.g. the settings it was made with */
  metadata?: string;
}

export function sceneToSvg(scene: Scene, opts: SvgOptions = {}): string {
  const { widthMm: w, heightMm: h } = scene;
  const layers = scene.layers
    .filter((l) => l.lines.length)
    .map((l, i) => {
      const d = l.lines.map(pathData).join('');
      const blend = opts.blend?.(l) === 'multiply' ? ' style="mix-blend-mode:multiply"' : '';
      return `<g id="pen-${i + 1}"${blend} inkscape:groupmode="layer" inkscape:label="Pen ${i + 1} ${l.color} ${f(l.widthMm)}mm"><path d="${d}" fill="none" stroke="${l.color}" stroke-width="${f(l.widthMm)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    })
    .join('\n');
  const paper = opts.paper ? `<rect id="paper" width="${f(w)}" height="${f(h)}" fill="${typeof opts.paper === 'string' ? opts.paper : '#ffffff'}"/>\n` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">\n${opts.metadata ? opts.metadata + '\n' : ''}${paper}${layers}\n</svg>`;
}
