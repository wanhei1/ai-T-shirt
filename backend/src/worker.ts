import "dotenv/config";

import { startJobWorkers } from "./queue/workers";
import { getRabbitConnection, rabbitmqUrl } from "./queue/connection";
import { initializeQueueStateRepository } from "./queue/queues";
import { assertRuntimeEnvOrThrow } from "./config/env-guard";

const shutdownHandlers = new Set<() => Promise<void>>();

const registerShutdown = (handler: () => Promise<void>) => {
  shutdownHandlers.add(handler);
};

const shutdown = async () => {
  for (const handler of shutdownHandlers) {
    try {
      await handler();
    } catch (error) {
      console.error("Worker shutdown handler failed:", error);
    }
  }
  process.exit(0);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CONNECT_MAX_RETRIES = 30;        // 最多重试30次
const CONNECT_BASE_DELAY_MS = 2000;    // 初始2秒，指数退避到30秒

const connectWithRetry = async () => {
  for (let attempt = 1; attempt <= CONNECT_MAX_RETRIES; attempt++) {
    try {
      await getRabbitConnection();
      return; // 连接成功
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 认证错误不重试，直接抛
      if (message.includes("ACCESS_REFUSED") || message.includes("403")) {
        throw error;
      }
      if (attempt >= CONNECT_MAX_RETRIES) {
        console.error(`❌ RabbitMQ connect failed after ${CONNECT_MAX_RETRIES} attempts, giving up.`);
        throw error;
      }
      const delay = Math.min(CONNECT_BASE_DELAY_MS * attempt, 30_000);
      console.warn(`⚠️ RabbitMQ connect attempt ${attempt}/${CONNECT_MAX_RETRIES} failed: ${message}. Retrying in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }
};

const main = async () => {
  assertRuntimeEnvOrThrow();
  console.log("🧵 Starting background job workers...");
  await initializeQueueStateRepository();
  await connectWithRetry();
  // Mask password in URL before logging
  const maskedUrl = rabbitmqUrl.replace(/:[^/@]+@/, ':***@');
  console.log(`✅ RabbitMQ connected: ${maskedUrl}`);
  const stopWorkers = startJobWorkers();
  registerShutdown(stopWorkers);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((error) => {
  console.error("❌ Failed to start job workers:", error);
  process.exit(1);
});
