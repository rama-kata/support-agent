// Per-browser conveniences only: storage can be unavailable (private mode, blocked
// site data), so every access is guarded and the app works without it.

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore: the session just won't survive a reload
  }
}

export const TOKEN_KEY = "cellar.token";
export const ADMIN_KEY = "cellar.admin";
export const THREAD_KEY = "cellar.thread";
