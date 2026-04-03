export type PollJobState = "waiting" | "active" | "completed" | "failed" | string;

export interface PollJobSnapshot<TJob = any> {
  job: TJob;
  state: PollJobState;
  progress: number;
  elapsedMs: number;
  attempt: number;
}

export interface PollJobOptions<TJob = any, TResult = unknown> {
  queue: string;
  jobId: string | number;
  fetchStatus: (queue: string, jobId: string | number, signal?: AbortSignal) => Promise<{ job: TJob }>;
  getResult: (job: TJob) => TResult | undefined;
  getFailedReason?: (job: TJob) => string | undefined;
  onProgress?: (snapshot: PollJobSnapshot<TJob>) => void;
  intervalMs?: number;
  maxIntervalMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
  timeoutMessage?: string;
  signal?: AbortSignal;
}

const CANCELED_MESSAGE = "任务已取消";

const isAbortLikeError = (error: unknown) => {
  if (!error) return false;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  if (error instanceof Error && /aborted|aborterror/i.test(error.message)) return true;
  return false;
};

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(CANCELED_MESSAGE));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error(CANCELED_MESSAGE));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });

export async function pollJobUntilDone<TJob = any, TResult = unknown>(
  options: PollJobOptions<TJob, TResult>
): Promise<TResult> {
  const {
    queue,
    jobId,
    fetchStatus,
    getResult,
    getFailedReason,
    onProgress,
    intervalMs = 1500,
    maxIntervalMs = 6000,
    backoffFactor = 1.15,
    timeoutMs = 5 * 60 * 1000,
    timeoutMessage = "任务等待超时，请稍后重试",
    signal,
  } = options;

  const startedAt = Date.now();
  let waitMs = intervalMs;
  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw new Error(CANCELED_MESSAGE);
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > timeoutMs) {
      throw new Error(timeoutMessage);
    }

    let status: { job: TJob };
    try {
      status = await fetchStatus(queue, jobId, signal);
    } catch (error) {
      if (signal?.aborted || isAbortLikeError(error)) {
        throw new Error(CANCELED_MESSAGE);
      }
      throw error;
    }
    const job = status.job;
    const state = (job as any)?.state as PollJobState;
    const progress = typeof (job as any)?.progress === "number" ? (job as any).progress : 0;

    onProgress?.({
      job,
      state,
      progress,
      elapsedMs,
      attempt,
    });

    if (state === "completed") {
      const result = getResult(job);
      if (result === undefined || result === null) {
        throw new Error("任务已完成但结果为空");
      }
      return result;
    }

    if (state === "failed") {
      const reason = getFailedReason?.(job) || (job as any)?.failedReason || "任务执行失败";
      throw new Error(reason);
    }

    await delay(waitMs, signal);
    waitMs = Math.min(maxIntervalMs, Math.round(waitMs * backoffFactor));
    attempt += 1;
  }
}
