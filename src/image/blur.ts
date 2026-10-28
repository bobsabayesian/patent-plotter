// from moire-money-moire-problems/src/image/cleanup.ts

/** Separable box blur with edge clamping. */
export function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const pass = (inp: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(inp.length);
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    for (let l = 0; l < lines; l++) {
      for (let i = 0; i < len; i++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) {
          const j = Math.min(len - 1, Math.max(0, i + d));
          sum += inp[horizontal ? l * w + j : j * w + l]!;
        }
        out[horizontal ? l * w + i : i * w + l] = sum / (2 * radius + 1);
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}
