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

const main = async () => {
  assertRuntimeEnvOrThrow();
  console.log("🧵 Starting background job workers...");
  await initializeQueueStateRepository();
  await getRabbitConnection();
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
