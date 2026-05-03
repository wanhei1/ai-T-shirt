import { createClient } from "redis";

type HitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<HitResult>;
}

type MemoryBucket = {
  count: number;
  resetAt: number;
};

class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, MemoryBucket>();

  async hit(key: string, limit: number, windowMs: number): Promise<HitResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    existing.count += 1;
    this.buckets.set(key, existing);

    if (this.buckets.size > 10_000) {
      for (const [bucketKey, bucket] of this.buckets.entries()) {
        if (bucket.resetAt <= now) {
          this.buckets.delete(bucketKey);
        }
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}

class RedisRateLimiter implements RateLimiter {
  private readonly redisUrls: string[];
  private readonly prefix: string;
  private client: ReturnType<typeof createClient> | null = null;
  private connecting: Promise<void> | null = null;

  constructor(redisUrls: string[], prefix = "rl") {
    this.redisUrls = redisUrls;
    this.prefix = prefix;
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
              console.warn("Redis rate limiter error:", error);
            });
            await client.connect();
            this.client = client;
            return;
          } catch (error) {
            lastError = error;
            console.warn(`Redis rate limiter connect failed for ${redisUrl}:`, error);
          }
        }

        throw new Error(
          `All REDIS endpoints are unavailable for rate limiter: ${this.redisUrls.join(", ")}. Last error: ${
            lastError instanceof Error ? lastError.message : String(lastError)
          }`
        );
      })();
    }

    await this.connecting;
  }

  async hit(key: string, limit: number, windowMs: number): Promise<HitResult> {
    await this.ensureClient();
    if (!this.client) {
      throw new Error("Redis client is unavailable");
    }

    const namespaced = `${this.prefix}:${key}`;
    const count = await this.client.incr(namespaced);

    if (count === 1) {
      await this.client.pExpire(namespaced, windowMs);
    }

    if (count > limit) {
      const ttlMs = await this.client.pTTL(namespaced);
      const retryAfterSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export const createRateLimiter = (): RateLimiter => {
  const redisUrls = Array.from(
    new Set(
      `${process.env.REDIS_URLS || ""},${process.env.REDIS_URL || ""}`
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
  const memory = new InMemoryRateLimiter();

  if (redisUrls.length === 0) {
    return memory;
  }

  const redis = new RedisRateLimiter(redisUrls, process.env.RATE_LIMIT_REDIS_PREFIX || "rl");
  let fallbackToMemory = false;

  return {
    async hit(key: string, limit: number, windowMs: number) {
      if (fallbackToMemory) {
        return memory.hit(key, limit, windowMs);
      }

      try {
        return await redis.hit(key, limit, windowMs);
      } catch (error) {
        fallbackToMemory = true;
        console.warn("Redis rate limiter unavailable, fallback to memory limiter:", error);
        return memory.hit(key, limit, windowMs);
      }
    },
  };
};
