import { createClient } from "redis";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
}

class InMemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });

    if (this.store.size > 10_000) {
      const now = Date.now();
      for (const [cachedKey, entry] of this.store.entries()) {
        if (entry.expiresAt <= now) {
          this.store.delete(cachedKey);
        }
      }
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

class RedisCacheStore implements CacheStore {
  private readonly prefix: string;
  private readonly redisUrls: string[];
  private client: ReturnType<typeof createClient> | null = null;
  private connecting: Promise<void> | null = null;

  constructor(redisUrls: string[], prefix = "cache") {
    this.redisUrls = redisUrls;
    this.prefix = prefix;
  }

  private cacheKey(key: string) {
    return `${this.prefix}:${key}`;
  }

  private async ensureClient() {
    if (this.client?.isOpen) return;

    if (!this.connecting) {
      this.connecting = (async () => {
        let lastError: unknown = null;
        for (const redisUrl of this.redisUrls) {
          try {
            const client = createClient({ url: redisUrl });
            client.on("error", (error) => {
              console.warn("Redis cache error:", error);
            });
            await client.connect();
            this.client = client;
            return;
          } catch (error) {
            lastError = error;
            console.warn(`Redis cache connect failed for ${redisUrl}:`, error);
          }
        }

        throw new Error(
          `All REDIS endpoints are unavailable for cache store: ${this.redisUrls.join(", ")}. Last error: ${
            lastError instanceof Error ? lastError.message : String(lastError)
          }`
        );
      })();
    }

    await this.connecting;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureClient();
    if (!this.client) throw new Error("Redis cache unavailable");

    const raw = await this.client.get(this.cacheKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.ensureClient();
    if (!this.client) throw new Error("Redis cache unavailable");

    await this.client.set(this.cacheKey(key), JSON.stringify(value), {
      EX: Math.max(1, ttlSeconds),
    });
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    await this.ensureClient();
    if (!this.client) throw new Error("Redis cache unavailable");

    const matchPattern = this.cacheKey(`${prefix}*`);
    let cursor = "0";

    do {
      const result = await this.client.scan(cursor, { MATCH: matchPattern, COUNT: 200 });
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await this.client.del(result.keys);
      }
    } while (cursor !== "0");
  }
}

export const createCacheStore = (): CacheStore => {
  const redisUrls = Array.from(
    new Set(
      `${process.env.REDIS_URLS || ""},${process.env.REDIS_URL || ""}`
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
  const fallback = new InMemoryCacheStore();

  if (redisUrls.length === 0) {
    return fallback;
  }

  const redis = new RedisCacheStore(redisUrls, process.env.CACHE_REDIS_PREFIX || "cache");
  let fallbackToMemory = false;

  return {
    async get<T>(key: string): Promise<T | null> {
      if (fallbackToMemory) {
        return fallback.get<T>(key);
      }

      try {
        return await redis.get<T>(key);
      } catch (error) {
        fallbackToMemory = true;
        console.warn("Redis cache unavailable, fallback to memory cache:", error);
        return fallback.get<T>(key);
      }
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      if (fallbackToMemory) {
        await fallback.set(key, value, ttlSeconds);
        return;
      }

      try {
        await redis.set(key, value, ttlSeconds);
      } catch (error) {
        fallbackToMemory = true;
        console.warn("Redis cache unavailable, fallback to memory cache:", error);
        await fallback.set(key, value, ttlSeconds);
      }
    },
    async deleteByPrefix(prefix: string): Promise<void> {
      if (fallbackToMemory) {
        await fallback.deleteByPrefix(prefix);
        return;
      }

      try {
        await redis.deleteByPrefix(prefix);
      } catch (error) {
        fallbackToMemory = true;
        console.warn("Redis cache unavailable, fallback to memory cache:", error);
        await fallback.deleteByPrefix(prefix);
      }
    },
  };
};
