export const AI_QUEUE_NAME = "ai-image";
export const TRYON_QUEUE_NAME = "virtual-tryon";

export type QueueName = typeof AI_QUEUE_NAME | typeof TRYON_QUEUE_NAME;

export const isQueueName = (name: string): name is QueueName => {
  return name === AI_QUEUE_NAME || name === TRYON_QUEUE_NAME;
};
