import { GLYPHS } from './hatch/strokefont';
import { CAPS } from './hatch/extraglyphs';

/**
 * Patent text as the stroke font can draw it: typographic marks become their plain forms, accented letters lose their
 * accents, and odd spaces become spaces. Anything the font still lacks is left for `unsupported` to report.
 */
export function prepareText(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−·•]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/[  -  \t\r]/g, ' ')
    .replace(/[​-‍﻿]/g, '');
}

/** The distinct characters of `s` that cannot be drawn (and so will be left out), in the order they first appear. */
export function unsupported(s: string): string[] {
  const out: string[] = [];
  for (const ch of prepareText(s).replace(/<3/g, '♥')) if (ch !== ' ' && ch !== '\n' && !CAPS[ch] && !GLYPHS[ch] && !GLYPHS[ch.toLowerCase()] && !out.includes(ch)) out.push(ch);
  return out;
}
