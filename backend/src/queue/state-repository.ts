import { createClient } from "redis";

import type { JobRecord, JobState, QueueName } from "./queues";

type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

export interface JobStateRepository {
  init(): Promise<void>;
  createJob(queue: QueueName, record: JobRecord): Promise<void>;
  addJobLog(queue: QueueName, jobId: string, message: string): Promise<void>;
  updateJobState(
    queue: QueueName,
    jobId: string,
    patch: Partial<Pick<JobRecord, "state" | "progress" | "result" | "failedReason" | "attemptsMade" | "finishedAt">>
  ): Promise<void>;
  getJobById(queue: QueueName, jobId: string): Promise<JobRecord | null>;
  getQueueStats(queue: QueueName): Promise<QueueStats>;
}

const emptyStats = (): QueueStats => ({
  waiting: 0,
  active: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
});

const validStates: JobState[] = ["waiting", "active", "completed", "failed", "delayed", "paused"];

const normalizeLogs = (logs: string[]) => {
  if (logs.length <= 200) return logs;
  return logs.slice(-200);
};

class InMemoryJobStateRepository implements JobStateRepository {
  private readonly store: Record<QueueName, Map<string, JobRecord>>;

  constructor(store: Record<QueueName, Map<string, JobRecord>>) {
    this.store = store;
  }

  async init(): Promise<void> {
    return;
  }

  async createJob(queue: QueueName, record: JobRecord): Promise<void> {
    this.store[queue].set(record.id, record);
  }

  async addJobLog(queue: QueueName, jobId: string, message: string): Promise<void> {
    const job = this.store[queue].get(jobId);
    if (!job) return;
    job.logs = normalizeLogs([...job.logs, `[${new Date().toISOString()}] ${message}`]);
  }

  async updateJobState(
    queue: QueueName,
    jobId: string,
    patch: Partial<Pick<JobRecord, "state" | "progress" | "result" | "failedReason" | "attemptsMade" | "finishedAt">>
  ): Promise<void> {
    const job = this.store[queue].get(jobId);
    if (!job) return;
    Object.assign(job, patch);
  }

  async getJobById(queue: QueueName, jobId: string): Promise<JobRecord | null> {
    return this.store[queue].get(jobId) || null;
  }

  async getQueueStats(queue: QueueName): Promise<QueueStats> {
    const stats = emptyStats();
    for (const job of this.store[queue].values()) {
      if (job.state === "waiting") stats.waiting += 1;
      else if (job.state === "active") stats.active += 1;
      else if (job.state === "completed") stats.completed += 1;
      else if (job.state === "failed") stats.failed += 1;
      else if (job.state === "delayed") stats.delayed += 1;
      else if (job.state === "paused") stats.paused += 1;
    }
    return stats;
  }
}

class RedisJobStateRepository implements JobStateRepository {
  private readonly redisUrls: string[];
  private client: ReturnType<typeof createClient> | null = null;

  constructor(redisUrls: string[]) {
    this.redisUrls = redisUrls;
  }

  async init(): Promise<void> {
    if (this.client?.isOpen) return;
    let lastError: unknown = null;
    for (const redisUrl of this.redisUrls) {
      try {
        const client = createClient({ url: redisUrl });
        client.on("error", (error) => {
          console.warn("Redis state repository error:", error);
        });
        await client.connect();
        this.client = client;
        return;
      } catch (error) {
        lastError = error;
        console.warn(`Redis state repository connect failed for ${redisUrl}:`, error);
      }
    }

    throw new Error(
      `All REDIS endpoints are unavailable for job state repository: ${this.redisUrls.join(", ")}. Last error: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  private ensureClient(): ReturnType<typeof createClient> {
    if (!this.client) {
      throw new Error("Redis state repository is not initialized");
    }
    return this.client;
  }

  private keyJob(queue: QueueName, jobId: string) {
    return `job:${queue}:${jobId}`;
  }

  private keyAll(queue: QueueName) {
    return `jobs:${queue}:all`;
  }

  private keyState(queue: QueueName, state: JobState) {
    return `jobs:${queue}:state:${state}`;
  }

  private serializeRecord(record: JobRecord) {
    return {
      id: record.id,
      queue: record.queue,
      state: record.state,
      progress: String(record.progress),
      result: JSON.stringify(record.result),
      failedReason: record.failedReason ?? "",
      attemptsMade: String(record.attemptsMade),
      maxAttempts: String(record.maxAttempts),
      createdAt: String(record.createdAt),
      finishedAt: record.finishedAt === null ? "" : String(record.finishedAt),
      data: JSON.stringify(record.data),
      logs: JSON.stringify(record.logs),
    };
  }

  private parseRecord(fields: Record<string, string> | null): JobRecord | null {
    if (!fields || !fields.id || !fields.queue || !fields.state) return null;
    const queue = fields.queue as QueueName;
    const state = fields.state as JobState;
    if (!validStates.includes(state)) return null;

    return {
      id: fields.id,
      queue,
      state,
      progress: Number.parseFloat(fields.progress || "0") || 0,
      result: fields.result ? JSON.parse(fields.result) : null,
      failedReason: fields.failedReason || null,
      attemptsMade: Number.parseInt(fields.attemptsMade || "0", 10) || 0,
      maxAttempts: Number.parseInt(fields.maxAttempts || "1", 10) || 1,
      createdAt: Number.parseInt(fields.createdAt || "0", 10) || Date.now(),
      finishedAt: fields.finishedAt ? Number.parseInt(fields.finishedAt, 10) : null,
      data: fields.data ? JSON.parse(fields.data) : null,
      logs: fields.logs ? JSON.parse(fields.logs) : [],
    };
  }

  async createJob(queue: QueueName, record: JobRecord): Promise<void> {
    const client = this.ensureClient();
    const jobKey = this.keyJob(queue, record.id);
    const tx = client.multi();
    tx.hSet(jobKey, this.serializeRecord(record));
    tx.sAdd(this.keyAll(queue), record.id);
    tx.sAdd(this.keyState(queue, record.state), record.id);
    await tx.exec();
  }

  async addJobLog(queue: QueueName, jobId: string, message: string): Promise<void> {
    const client = this.ensureClient();
    const jobKey = this.keyJob(queue, jobId);
    const current = await client.hGet(jobKey, "logs");
    const logs: string[] = current ? JSON.parse(current) : [];
    logs.push(`[${new Date().toISOString()}] ${message}`);
    await client.hSet(jobKey, { logs: JSON.stringify(normalizeLogs(logs)) });
  }

  async updateJobState(
    queue: QueueName,
    jobId: string,
    patch: Partial<Pick<JobRecord, "state" | "progress" | "result" | "failedReason" | "attemptsMade" | "finishedAt">>
  ): Promise<void> {
    const client = this.ensureClient();
    const jobKey = this.keyJob(queue, jobId);
    const currentState = (await client.hGet(jobKey, "state")) as JobState | null;

    const updateFields: Record<string, string> = {};
    if (patch.state) updateFields.state = patch.state;
    if (typeof patch.progress === "number") updateFields.progress = String(patch.progress);
    if (patch.result !== undefined) updateFields.result = JSON.stringify(patch.result);
    if (patch.failedReason !== undefined) updateFields.failedReason = patch.failedReason ?? "";
    if (typeof patch.attemptsMade === "number") updateFields.attemptsMade = String(patch.attemptsMade);
    if (patch.finishedAt !== undefined) {
      updateFields.finishedAt = patch.finishedAt === null ? "" : String(patch.finishedAt);
    }

    const tx = client.multi();
    if (Object.keys(updateFields).length > 0) {
      tx.hSet(jobKey, updateFields);
    }

    if (patch.state && currentState && patch.state !== currentState) {
      tx.sRem(this.keyState(queue, currentState), jobId);
      tx.sAdd(this.keyState(queue, patch.state), jobId);
    }

    await tx.exec();
  }

  async getJobById(queue: QueueName, jobId: string): Promise<JobRecord | null> {
    const client = this.ensureClient();
    const fields = await client.hGetAll(this.keyJob(queue, jobId));
    if (!fields || Object.keys(fields).length === 0) return null;
    return this.parseRecord(fields);
  }

  async getQueueStats(queue: QueueName): Promise<QueueStats> {
    const client = this.ensureClient();
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      client.sCard(this.keyState(queue, "waiting")),
      client.sCard(this.keyState(queue, "active")),
      client.sCard(this.keyState(queue, "completed")),
      client.sCard(this.keyState(queue, "failed")),
      client.sCard(this.keyState(queue, "delayed")),
      client.sCard(this.keyState(queue, "paused")),
    ]);

    return { waiting, active, completed, failed, delayed, paused };
  }
}

export const createJobStateRepository = (store: Record<QueueName, Map<string, JobRecord>>): JobStateRepository => {
  const redisUrls = Array.from(
    new Set(
      `${process.env.REDIS_URLS || ""},${process.env.REDIS_URL || ""}`
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
  const requireSharedState = (process.env.REQUIRE_SHARED_JOB_STATE || "true").toLowerCase() === "true";
  const allowInMemoryState = (process.env.ALLOW_INMEMORY_JOB_STATE || "false").toLowerCase() === "true";
  const canUseInMemoryFallback = !requireSharedState && allowInMemoryState;

  if (redisUrls.length === 0) {
    if (!canUseInMemoryFallback) {
      return {
        async init() {
          throw new Error(
            "Durable job state is required but REDIS_URL is missing. Configure Redis for shared job metadata, or explicitly set REQUIRE_SHARED_JOB_STATE=false and ALLOW_INMEMORY_JOB_STATE=true for temporary local-only development."
          );
        },
        async createJob() {
          throw new Error("Shared job state is not initialized");
        },
        async addJobLog() {
          throw new Error("Shared job state is not initialized");
        },
        async updateJobState() {
          throw new Error("Shared job state is not initialized");
        },
        async getJobById() {
          throw new Error("Shared job state is not initialized");
        },
        async getQueueStats() {
          throw new Error("Shared job state is not initialized");
        },
      };
    }
    return new InMemoryJobStateRepository(store);
  }

  const redisRepo = new RedisJobStateRepository(redisUrls);
  const fallbackRepo = new InMemoryJobStateRepository(store);
  let activeRepo: JobStateRepository = redisRepo;

  return {
    async init() {
      try {
        await redisRepo.init();
      } catch (error) {
        if (!canUseInMemoryFallback) {
          throw new Error(
            `Redis unavailable and durable job state is required. Cannot fallback to in-memory state: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        console.warn("Redis unavailable, fallback to in-memory job state repository:", error);
        activeRepo = fallbackRepo;
        await activeRepo.init();
      }
    },
    createJob: (...args) => activeRepo.createJob(...args),
    addJobLog: (...args) => activeRepo.addJobLog(...args),
    updateJobState: (...args) => activeRepo.updateJobState(...args),
    getJobById: (...args) => activeRepo.getJobById(...args),
    getQueueStats: (...args) => activeRepo.getQueueStats(...args),
  };
};
