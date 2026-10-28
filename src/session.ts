/** The browser's side of the session codes (see worker/sessions.ts). */
import { cleanCode } from '../worker/sessions.ts';

const KEY = 'patent-plotter:code';

export { cleanCode };

export function rememberedCode(): string | null {
  const fromUrl = cleanCode(new URL(location.href).searchParams.get('s') ?? '');
  if (fromUrl) return fromUrl;
  try { return cleanCode(localStorage.getItem(KEY) ?? ''); } catch { return null; }
}

export function remember(code: string) {
  try { localStorage.setItem(KEY, code); } catch { /* private window: the code is still in the address */ }
  const u = new URL(location.href);
  u.searchParams.set('s', code);
  history.replaceState(null, '', u);
}

export const newSessionCode = async (): Promise<string> => {
  const r = await fetch('/api/session', { method: 'POST' });
  if (!r.ok) throw new Error(`could not start a session (${r.status})`);
  return ((await r.json()) as { code: string }).code;
};

/** The saved work under `code`, or null when there is none yet. */
export async function loadSession(code: string): Promise<unknown | null> {
  const r = await fetch(`/api/session/${code}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`could not open that session (${r.status})`);
  return r.json();
}

export async function saveSession(code: string, doc: unknown): Promise<void> {
  const r = await fetch(`/api/session/${code}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
  if (!r.ok) throw new Error(`could not save (${r.status})`);
}
