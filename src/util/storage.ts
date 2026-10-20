/**
 * localStorage can throw (private windows, file:// in some browsers, storage
 * disabled). Everything here fails soft so the game always runs.
 */
const mem = new Map<string, string>();

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch {
    /* fall through to memory */
  }
  const m = mem.get(key);
  if (m != null) {
    try {
      return JSON.parse(m) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export function saveJSON(key: string, value: unknown) {
  const s = JSON.stringify(value);
  mem.set(key, s);
  try {
    window.localStorage.setItem(key, s);
  } catch {
    /* memory only this session */
  }
}
