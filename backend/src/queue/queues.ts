import * as amqp from "amqplib";
import { randomUUID } from "crypto";
import { getRabbitConnection } from "./connection";
import { createJobStateRepository } from "./state-repository";

export const AI_QUEUE_NAME = "ai-image";
export const TRYON_QUEUE_NAME = "virtual-tryon";

export type QueueName = typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME;

export type JobState = "waiting" | "active" | "completed" | "failed" | "delayed" | "paused";

export type JobRecord = {
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

export type QueueStats = {
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

const stateRepository = createJobStateRepository(jobStore);
let stateRepositoryReady: Promise<void> | null = null;

const ensureStateRepository = async () => {
  if (!stateRepositoryReady) {
    stateRepositoryReady = stateRepository.init();
  }
  await stateRepositoryReady;
};

export const initializeQueueStateRepository = async () => {
  await ensureStateRepository();
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

export const addJobLog = async (queue: QueueName, jobId: string, message: string) => {
  await ensureStateRepository();
  await stateRepository.addJobLog(queue, jobId, message);
};

export const updateJobState = (
  queue: QueueName,
  jobId: string,
  patch: Partial<Pick<JobRecord, "state" | "progress" | "result" | "failedReason" | "attemptsMade" | "finishedAt">>
) => {
  return (async () => {
    await ensureStateRepository();
    await stateRepository.updateJobState(queue, jobId, patch);
  })();
};

export const getJobById = async (queue: QueueName, jobId: string) => {
  await ensureStateRepository();
  return stateRepository.getJobById(queue, jobId);
};

export const getQueueStats = async (queue: QueueName): Promise<QueueStats> => {
  await ensureStateRepository();
  return stateRepository.getQueueStats(queue);
};

export const enqueueJob = async (queue: QueueName, data: any, options?: { attempts?: number }) => {
  await ensureStateRepository();
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

  await stateRepository.createJob(queue, record);
  await addJobLog(queue, jobId, "Job queued");

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
    await addJobLog(queue, jobId, "Publish buffered by broker");
  }

  return { id: jobId, queue };
};

export const closeQueuePublisher = async () => {
  if (!publisherChannel) return;
  const channel = publisherChannel;
  publisherChannel = null;
  await channel.close();
};
