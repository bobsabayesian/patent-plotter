/**
 * What kind of pen it is decides how it behaves on paper: how its tip sizes are offered, how well its ink
 * hides what is under it (`transparency`), and how closely lines must sit to read as a solid fill.
 * The numbers are starting estimates, not measurements; custom lets you set them from your own swatches.
 */
export interface PenType {
  id: string;
  label: string;
  /** common tip widths, mm (the first listed that matches is used as the default) */
  tipsMm: number[];
  defaultTipMm: number;
  /** 0 = opaque ink that covers what is under it, 1 = translucent ink that filters it (colors multiply) */
  transparency: number;
  /** line spacing for a solid fill, as a multiple of the tip width (just over 1 leaves a little overlap) */
  fillFactor: number;
  /** how much the ink spreads on the paper, mm: a dot comes out this much bigger all round than the tip made it (a marker bleeds; a technical pen hardly does) */
  dotGainMm: number;
}

export const PEN_TYPES: PenType[] = [
  // technical pen with refillable drafting ink: pigment inks are mostly opaque and lay down even, solid lines
  { id: 'isograph', label: 'Rotring Isograph (technical pen)', tipsMm: [0.1, 0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0], defaultTipMm: 0.25, transparency: 0.15, fillFactor: 1.1, dotGainMm: 0.02 },
  { id: 'fineliner', label: 'Fineliner (Micron, Staedtler)', tipsMm: [0.2, 0.3, 0.4, 0.5, 0.8], defaultTipMm: 0.4, transparency: 0.35, fillFactor: 1.15, dotGainMm: 0.04 },
  { id: 'gel', label: 'Gel pen', tipsMm: [0.3, 0.5, 0.7, 1.0], defaultTipMm: 0.5, transparency: 0.1, fillFactor: 1.2, dotGainMm: 0.05 },
  { id: 'marker', label: 'Marker / brush pen', tipsMm: [0.5, 1.0, 2.0, 3.0], defaultTipMm: 1.0, transparency: 0.9, fillFactor: 1.0, dotGainMm: 0.25 },
  { id: 'custom', label: 'Custom', tipsMm: [], defaultTipMm: 0.4, transparency: 0.5, fillFactor: 1.1, dotGainMm: 0.05 },
];

export const penType = (id: string): PenType => PEN_TYPES.find((p) => p.id === id) ?? PEN_TYPES[0]!;
export const DEFAULT_PEN_TYPE = 'isograph';

/** The listed tip closest to `widthMm` (or the type's default when it lists none). */
export const nearestTip = (t: PenType, widthMm: number) =>
  t.tipsMm.length ? t.tipsMm.reduce((a, b) => (Math.abs(b - widthMm) < Math.abs(a - widthMm) ? b : a)) : widthMm;
