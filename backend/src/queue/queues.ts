import * as amqp from "amqplib";
import { randomUUID } from "crypto";
import { getRabbitConnection } from "./connection";

export const AI_QUEUE_NAME = "ai-image";
export const TRYON_QUEUE_NAME = "virtual-tryon";

export type QueueName = typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME;

export type JobState = "waiting" | "active" | "completed" | "failed" | "delayed" | "paused";

type JobRecord = {
  id: string;
  queue: QueueName;
  state: JobState;
  progress: number;
  result: unknown | null;
  failedReason: string | null;
  attemptsMade: number;
  maxAttempts: number;
  createdAt: number;
  finishedAt: number | null;
  data: any;
  logs: string[];
};

type QueueStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

let publisherChannel: amqp.Channel | null = null;

const queueRefs = {
  [AI_QUEUE_NAME]: { name: AI_QUEUE_NAME },
  [TRYON_QUEUE_NAME]: { name: TRYON_QUEUE_NAME },
} as const;

const jobStore: Record<QueueName, Map<string, JobRecord>> = {
  [AI_QUEUE_NAME]: new Map(),
  [TRYON_QUEUE_NAME]: new Map(),
};

const isQueueName = (name: string): name is QueueName => name === AI_QUEUE_NAME || name === TRYON_QUEUE_NAME;

const ensurePublisherChannel = async () => {
  if (publisherChannel) return publisherChannel;

  const connection = await getRabbitConnection();
  const channel = await connection.createChannel();
  await channel.assertQueue(AI_QUEUE_NAME, { durable: true });
  await channel.assertQueue(TRYON_QUEUE_NAME, { durable: true });
  publisherChannel = channel;
  return channel;
};

const now = () => Date.now();

export const getQueueByName = (name: string) => {
  if (!isQueueName(name)) return null;
  return queueRefs[name];
};

export const addJobLog = (queue: QueueName, jobId: string, message: string) => {
  const job = jobStore[queue].get(jobId);
  if (!job) return;
  job.logs.push(`[${new Date().toISOString()}] ${message}`);
  if (job.logs.length > 200) {
    job.logs = job.logs.slice(-200);
  }
};

export const updateJobState = (
  queue: QueueName,
  jobId: string,
  patch: Partial<Pick<JobRecord, "state" | "progress" | "result" | "failedReason" | "attemptsMade" | "finishedAt">>
) => {
  const job = jobStore[queue].get(jobId);
  if (!job) return;
  Object.assign(job, patch);
};

export const getJobById = (queue: QueueName, jobId: string) => {
  return jobStore[queue].get(jobId) || null;
};

export const getQueueStats = (queue: QueueName): QueueStats => {
  const stats: QueueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  for (const job of jobStore[queue].values()) {
    if (job.state === "waiting") stats.waiting += 1;
    else if (job.state === "active") stats.active += 1;
    else if (job.state === "completed") stats.completed += 1;
    else if (job.state === "failed") stats.failed += 1;
    else if (job.state === "delayed") stats.delayed += 1;
    else if (job.state === "paused") stats.paused += 1;
  }
  return stats;
};

export const enqueueJob = async (queue: QueueName, data: any, options?: { attempts?: number }) => {
  const channel = await ensurePublisherChannel();
  const jobId = randomUUID();
  const maxAttempts = Math.max(1, options?.attempts ?? 1);

  const record: JobRecord = {
    id: jobId,
    queue,
    state: "waiting",
    progress: 0,
    result: null,
    failedReason: null,
    attemptsMade: 0,
    maxAttempts,
    createdAt: now(),
    finishedAt: null,
    data,
    logs: [],
  };

  jobStore[queue].set(jobId, record);
  addJobLog(queue, jobId, "Job queued");

  const payload = Buffer.from(
    JSON.stringify({
      jobId,
      queue,
      data,
      attempt: 0,
      maxAttempts,
    })
  );

  const ok = channel.sendToQueue(queue, payload, { persistent: true });
  if (!ok) {
    addJobLog(queue, jobId, "Publish buffered by broker");
  }

  return { id: jobId, queue };
};

export const closeQueuePublisher = async () => {
  if (!publisherChannel) return;
  const channel = publisherChannel;
  publisherChannel = null;
  await channel.close();
};
