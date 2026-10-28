/** The slice of the project-files bucket that is used here; the dev server backs it with a folder instead. */
export interface Store {
  get(key: string): Promise<{ body: ArrayBuffer; type: string } | null>;
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
}

/** Everything this app keeps in the shared bucket lives under this prefix. */
export const PREFIX = 'patent-plotter/';
