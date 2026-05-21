export type JobType = "ai-image" | "virtual-tryon";

export type AIImageJobPayload = {
  userId: number;
  prompt: string;
  style?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  modelName?: string;
  samplerName?: string;
  scheduler?: string;
  negativePrompt?: string;
  denoise?: number;
};

export type TryOnJobPayload = {
  userId?: number;
  personDataUrl: string;
  clothDataUrl: string;
  clothType?: "upper" | "lower" | "overall";
  faceDataUrl?: string; // 可选：换脸源图
};

export type JobPayload = AIImageJobPayload | TryOnJobPayload;
