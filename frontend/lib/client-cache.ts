type CacheEntry<T> = {
  v: T;
  e: number; // expiresAt epoch ms
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

const now = () => Date.now();

const readSession = <T>(key: string): CacheEntry<T> | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof (parsed as any).e !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeSession = <T>(key: string, entry: CacheEntry<T>) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore quota / private mode
  }
};

export const getCached = <T>(key: string): T | null => {
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem) {
    if (mem.e > now()) return mem.v;
    memoryCache.delete(key);
  }

  const ses = readSession<T>(key);
  if (ses) {
    if (ses.e > now()) {
      memoryCache.set(key, ses as CacheEntry<unknown>);
      return ses.v;
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return null;
};

export const setCached = <T>(key: string, value: T, ttlMs: number) => {
  const entry: CacheEntry<T> = {
    v: value,
    e: now() + Math.max(0, ttlMs),
  };

  memoryCache.set(key, entry as CacheEntry<unknown>);
  writeSession(key, entry);
};

// Practical "forever" cache: valid for 100 years unless manually invalidated.
const FOREVER_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export const setCachedForever = <T>(key: string, value: T) => {
  setCached(key, value, FOREVER_TTL_MS);
};

export const invalidateCached = (key: string) => {
  memoryCache.delete(key);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};
