import * as amqp from "amqplib";
import { existsSync } from "fs";
import { getRabbitConnection } from "./connection";
import {
  AI_QUEUE_NAME,
  TRYON_QUEUE_NAME,
  type QueueName,
  addJobLog,
  getJobById,
  updateJobState,
} from "./queues";
import { SimpleComfyUIClient } from "../services/simpleComfyuiClient";
import type { AIImageJobPayload, TryOnJobPayload } from "./types";

const AI_CONCURRENCY = Number.parseInt(process.env.JOB_CONCURRENCY_AI || "1", 10);
const TRYON_CONCURRENCY = Number.parseInt(process.env.JOB_CONCURRENCY_TRYON || "1", 10);

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";

const styleConfigs: Record<string, {
  negativePrompt: string;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
}> = {
  realistic: {
    negativePrompt: "bad hands, low quality, blurry, ugly, deformed",
    steps: 25,
    cfg: 7.5,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
  },
  cartoon: {
    negativePrompt: "realistic, photo, bad hands, low quality",
    steps: 20,
    cfg: 8.0,
    samplerName: "euler",
    scheduler: "normal",
  },
  anime: {
    negativePrompt: "realistic, photo, western, bad hands, low quality",
    steps: 20,
    cfg: 7.0,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
  },
  abstract: {
    negativePrompt: "realistic, photo, figurative, bad quality",
    steps: 30,
    cfg: 9.0,
    samplerName: "euler_ancestral",
    scheduler: "normal",
  },
  minimalist: {
    negativePrompt: "complex, detailed, cluttered, busy, bad quality",
    steps: 15,
    cfg: 6.0,
    samplerName: "euler",
    scheduler: "normal",
  },
  vintage: {
    negativePrompt: "modern, futuristic, bad hands, low quality",
    steps: 25,
    cfg: 8.5,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
  },
};

function getStyleConfig(style?: string) {
  if (style && styleConfigs[style]) {
    return styleConfigs[style];
  }
  return styleConfigs.realistic;
}

function getEnvString(key: string, fallback: string): string {
  const value = process.env[key];
  return (value && value.trim()) || fallback;
}

function getEnvInt(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnvFloat(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getMixedPrecision(): "fp32" | "fp16" | "bf16" {
  const value = getEnvString("TRYON_MIXED_PRECISION", "fp16").toLowerCase();
  if (value === "fp32" || value === "fp16" || value === "bf16") {
    return value;
  }
  return "fp16";
}

function pickLocalModelPath(candidates: string[], fallback: string): string {
  for (const path of candidates) {
    if (path && existsSync(path)) {
      return path;
    }
  }
  return fallback;
}

function forceLocalIfRepoId(value: string, repoIds: string[], localCandidates: string[]): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return pickLocalModelPath(localCandidates, value);
  }
  if (repoIds.includes(trimmed)) {
    return pickLocalModelPath(localCandidates, trimmed);
  }
  return trimmed;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || "image/png";
  const buffer = Buffer.from(base64, "base64");
  return { buffer, mime };
}

async function uploadToComfyInput(baseUrl: string, dataUrl: string, filename: string): Promise<string> {
  const { buffer, mime } = dataUrlToBlob(dataUrl);
  const blob = new Blob([buffer], { type: mime });

  const form = new FormData();
  form.append("image", blob, filename);
  form.append("type", "input");
  form.append("overwrite", "true");

  const resp = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`ComfyUI upload failed: ${resp.status} ${resp.statusText} ${text}`);
  }

  const json = (await resp.json().catch(() => null)) as { name?: string } | null;
  if (!json?.name) {
    throw new Error("ComfyUI upload response missing filename");
  }

  return json.name;
}

function buildCatVtonWorkflow(params: {
  personFilename: string;
  clothFilename: string;
  catvtonPath: string;
  sd15InpaintPath: string;
  vaePath: string;
  mixedPrecision: "fp32" | "fp16" | "bf16";
  clothType: "upper" | "lower" | "overall";
  seed: number;
  steps: number;
  cfg: number;
  filenamePrefix: string;
}): Record<string, unknown> {
  const {
    personFilename,
    clothFilename,
    catvtonPath,
    sd15InpaintPath,
    vaePath,
    mixedPrecision,
    clothType,
    seed,
    steps,
    cfg,
    filenamePrefix,
  } = params;

  return {
    "10": {
      class_type: "LoadImage",
      inputs: {
        image: personFilename,
      },
    },
    "11": {
      class_type: "LoadImage",
      inputs: {
        image: clothFilename,
      },
    },
    "12": {
      class_type: "LoadAutoMasker",
      inputs: {
        catvton_path: catvtonPath,
      },
    },
    "13": {
      class_type: "AutoMasker",
      inputs: {
        pipe: ["12", 0],
        target_image: ["10", 0],
        cloth_type: clothType,
      },
    },
    "17": {
      class_type: "LoadCatVTONPipeline",
      inputs: {
        sd15_inpaint_path: sd15InpaintPath,
        catvton_path: catvtonPath,
        mixed_precision: mixedPrecision,
        vae_path: vaePath,
      },
    },
    "16": {
      class_type: "CatVTON",
      inputs: {
        pipe: ["17", 0],
        target_image: ["10", 0],
        refer_image: ["11", 0],
        mask_image: ["13", 0],
        seed,
        steps,
        cfg,
      },
    },
    "25": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: filenamePrefix,
        images: ["16", 0],
      },
    },
  };
}

async function runAiImageJob(payload: AIImageJobPayload) {
  const { prompt, style, width, height } = payload;
  const client = new SimpleComfyUIClient(COMFYUI_URL);
  const config = getStyleConfig(style);

  const result = await client.generateImage(prompt, config.negativePrompt, {
    width: width || 512,
    height: height || 512,
    steps: config.steps,
    cfg: config.cfg,
    samplerName: config.samplerName,
    scheduler: config.scheduler,
    modelName: process.env.COMFYUI_MODEL_NAME || "dreamshaper_8.safetensors",
  });

  const base64 = Buffer.from(result.imageBuffer).toString("base64");
  const dataUrl = `data:image/png;base64,${base64}`;

  return {
    imageUrl: dataUrl,
    prompt,
    style: style || "realistic",
  };
}

async function runTryOnJob(payload: TryOnJobPayload) {
  const client = new SimpleComfyUIClient(COMFYUI_URL);
  const ok = await client.checkConnection();
  if (!ok) {
    throw new Error("ComfyUI 不可用");
  }

  const active = client.getActiveServerUrl();
  if (!active) {
    throw new Error("未找到可用的 ComfyUI 服务器");
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const personName = `tryon-person-${suffix}.png`;
  const clothName = `tryon-cloth-${suffix}.png`;

  const [personFilename, clothFilename] = await Promise.all([
    uploadToComfyInput(active, payload.personDataUrl, personName),
    uploadToComfyInput(active, payload.clothDataUrl, clothName),
  ]);

  const defaultCatvtonPath = pickLocalModelPath(
    [
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/models/catvton",
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/custom_nodes/ComfyUI-CatVTON",
    ],
    "zhengchong/CatVTON"
  );
  const defaultSd15InpaintPath = pickLocalModelPath(
    [
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/models/catvton/stable-diffusion-inpainting",
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/models/sd15_inpaint",
    ],
    "runwayml/stable-diffusion-inpainting"
  );
  const defaultVaePath = pickLocalModelPath(
    [
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/models/catvton/sd-vae-ft-mse",
    ],
    "stabilityai/sd-vae-ft-mse"
  );

  const catvtonPath = forceLocalIfRepoId(
    getEnvString("CATVTON_PATH", defaultCatvtonPath),
    ["zhengchong/CatVTON"],
    [
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/models/catvton",
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/custom_nodes/ComfyUI-CatVTON",
    ]
  );
  const sd15InpaintPath = forceLocalIfRepoId(
    getEnvString("SD15_INPAINT_PATH", defaultSd15InpaintPath),
    ["runwayml/stable-diffusion-inpainting", "booksforcharlie/stable-diffusion-inpainting"],
    [
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/models/catvton/stable-diffusion-inpainting",
      "/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/models/sd15_inpaint",
    ]
  );
  const vaePath = getEnvString("SD_VAE_PATH", defaultVaePath);

  const mixedPrecision = getMixedPrecision();
  const tryonSteps = Math.max(10, Math.min(80, getEnvInt("TRYON_STEPS", 28)));
  const tryonCfg = Math.max(1.0, Math.min(8.0, getEnvFloat("TRYON_CFG", 2.5)));
  const clothType = payload.clothType || (getEnvString("TRYON_CLOTH_TYPE", "upper") as "upper" | "lower" | "overall");

  const workflow = buildCatVtonWorkflow({
    personFilename,
    clothFilename,
    catvtonPath,
    sd15InpaintPath,
    vaePath,
    mixedPrecision,
    clothType,
    seed: Math.floor(Math.random() * 100000),
    steps: tryonSteps,
    cfg: tryonCfg,
    filenamePrefix: "tryon",
  });

  const queueResult = await client.queuePrompt(workflow);
  const result = await client.waitForCompletion(queueResult.prompt_id, 600000);
  const imageBuffer = await client.getImage(result.filename, result.subfolder, "output");

  const base64 = Buffer.from(imageBuffer).toString("base64");
  const dataUrl = `data:image/png;base64,${base64}`;

  return {
    imageUrl: dataUrl,
    promptId: queueResult.prompt_id,
  };
}

type QueueMessage = {
  jobId: string;
  queue: QueueName;
  data: any;
  attempt: number;
  maxAttempts: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startJobWorkers = () => {
  const channels: amqp.Channel[] = [];
  let stopping = false;

  const processMessage = async (
    queueName: QueueName,
    channel: amqp.Channel,
    msg: amqp.ConsumeMessage,
    handler: (payload: any) => Promise<any>
  ) => {
    let parsed: QueueMessage | null = null;
    try {
      parsed = JSON.parse(msg.content.toString()) as QueueMessage;
      const job = getJobById(queueName, parsed.jobId);
      if (!job) {
        channel.ack(msg);
        return;
      }

      updateJobState(queueName, parsed.jobId, {
        state: "active",
        progress: 5,
        attemptsMade: parsed.attempt,
      });
      addJobLog(queueName, parsed.jobId, `Job started (attempt ${parsed.attempt + 1}/${parsed.maxAttempts})`);

      const result = await handler(parsed.data);

      updateJobState(queueName, parsed.jobId, {
        state: "completed",
        progress: 100,
        result,
        failedReason: null,
        finishedAt: Date.now(),
      });
      addJobLog(queueName, parsed.jobId, "Job completed");
      channel.ack(msg);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      if (parsed) {
        const nextAttempt = parsed.attempt + 1;
        if (nextAttempt < parsed.maxAttempts) {
          addJobLog(queueName, parsed.jobId, `Job failed: ${errMessage}; retrying (${nextAttempt + 1}/${parsed.maxAttempts})`);
          updateJobState(queueName, parsed.jobId, {
            state: "waiting",
            progress: 0,
            failedReason: errMessage,
            attemptsMade: parsed.attempt,
          });

          await sleep(Math.max(0, Number.parseInt(process.env.JOB_BACKOFF_MS || "5000", 10)));
          channel.sendToQueue(
            queueName,
            Buffer.from(
              JSON.stringify({
                ...parsed,
                attempt: nextAttempt,
              })
            ),
            { persistent: true }
          );
          channel.ack(msg);
          return;
        }

        updateJobState(queueName, parsed.jobId, {
          state: "failed",
          progress: 0,
          failedReason: errMessage,
          attemptsMade: parsed.attempt,
          finishedAt: Date.now(),
        });
        addJobLog(queueName, parsed.jobId, `Job failed permanently: ${errMessage}`);
      }

      channel.ack(msg);
    }
  };

  const bootstrap = async () => {
    const connection = await getRabbitConnection();

    const aiChannel = await connection.createChannel();
    await aiChannel.assertQueue(AI_QUEUE_NAME, { durable: true });
    await aiChannel.prefetch(Math.max(1, AI_CONCURRENCY));
    channels.push(aiChannel);

    await aiChannel.consume(
      AI_QUEUE_NAME,
      async (msg: amqp.ConsumeMessage | null) => {
        if (!msg || stopping) return;
        await processMessage(AI_QUEUE_NAME, aiChannel, msg, runAiImageJob);
      },
      { noAck: false }
    );

    const tryonChannel = await connection.createChannel();
    await tryonChannel.assertQueue(TRYON_QUEUE_NAME, { durable: true });
    await tryonChannel.prefetch(Math.max(1, TRYON_CONCURRENCY));
    channels.push(tryonChannel);

    await tryonChannel.consume(
      TRYON_QUEUE_NAME,
      async (msg: amqp.ConsumeMessage | null) => {
        if (!msg || stopping) return;
        await processMessage(TRYON_QUEUE_NAME, tryonChannel, msg, runTryOnJob);
      },
      { noAck: false }
    );
  };

  bootstrap().catch((error) => {
    console.error("Failed to start RabbitMQ workers:", error);
  });

  return async () => {
    stopping = true;
    for (const channel of channels) {
      await channel.close().catch(() => undefined);
    }
  };
};
