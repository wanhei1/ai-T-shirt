export type JobType = "ai-image" | "virtual-tryon";

export type AIImageJobPayload = {
  userId: number;
  prompt: string;
  style?: string;
  width?: number;
  height?: number;
};

export type TryOnJobPayload = {
  userId?: number;
  personDataUrl: string;
  clothDataUrl: string;
  clothType?: "upper" | "lower" | "overall";
};

export type JobPayload = AIImageJobPayload | TryOnJobPayload;
