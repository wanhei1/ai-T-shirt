import * as amqp from "amqplib";
import * as path from "path";
import { existsSync, readFileSync } from "fs";
import { getRabbitConnection } from "./connection";
import { Pool } from "pg";
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
import { incrementCounter, observeHistogram } from "../observability/metrics";
import { logError, logInfo, logWarn } from "../utils/structured-logger";
import { saveTryOnResult, saveAiResult, storeBuffer } from "../utils/asset-storage";

let _tryonDbPool: Pool | null = null;
const getDbPool = (): Pool => {
  if (!_tryonDbPool) {
    _tryonDbPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _tryonDbPool;
};

const trackComfyUiMetrics = async <T>(operation: "ai-generate" | "tryon", fn: () => Promise<T>): Promise<T> => {
  const startAt = Date.now();
  try {
    const result = await fn();
    incrementCounter("comfyui_requests_total", { operation, status: "success" });
    observeHistogram("comfyui_request_duration_seconds", Math.max(0, (Date.now() - startAt) / 1000), {
      operation,
      status: "success",
    });
    return result;
  } catch (error) {
    incrementCounter("comfyui_requests_total", { operation, status: "failed" });
    observeHistogram("comfyui_request_duration_seconds", Math.max(0, (Date.now() - startAt) / 1000), {
      operation,
      status: "failed",
    });
    throw error;
  }
};

const AI_CONCURRENCY = Number.parseInt(process.env.JOB_CONCURRENCY_AI || "1", 10);
const TRYON_CONCURRENCY = Number.parseInt(process.env.JOB_CONCURRENCY_TRYON || "1", 10);

const COMFYUI_URL = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const COMFYUI_ROOT = process.env.COMFYUI_ROOT || path.join(process.cwd(), "ComfyUI");
const DEFAULT_IMAGE_WORKFLOW_PATHS = [
  path.join(COMFYUI_ROOT, "user/default/workflows/imagegenerate_workflow.json"),
  path.join(COMFYUI_ROOT, "user/default/workflows/imagegenarate_workflow.json"),
];

const PURE_ELEMENT_PREFIX =
  "masterpiece, best quality, ultra detailed, highres, single subject, centered composition, isolated design element, clean background, print-ready";
const PURE_ELEMENT_SUFFIX =
  "sharp focus, clean silhouette, strong contrast, no border, no frame, no mockup, transparent-friendly";
const PURE_ELEMENT_NEGATIVE =
  "worst quality, low quality, normal quality, lowres, blurry, jpeg artifacts, noise, text, letters, logo, watermark, signature, frame, border, cropped, out of frame, duplicate, extra objects, person, human, portrait, model, body, face, hand, hands, skin, clothing, t-shirt, shirt, hoodie, wearing, mannequin, fashion photo, product photo, mockup, scene";

const styleConfigs: Record<string, {
  promptPrefix: string;
  promptSuffix: string;
  negativePrompt: string;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
}> = {
  realistic: {
    promptPrefix: "RAW photo, photorealistic, ultra detailed texture, realistic lighting, 8k uhd",
    promptSuffix: "professional color grading, studio lighting, crisp edges, clean separation",
    negativePrompt: "plastic skin, uncanny face, bad anatomy, deformed, extra limbs, overprocessed",
    steps: 30,
    cfg: 7.0,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
  },
  cartoon: {
    promptPrefix: "cartoon illustration, clean lineart, bold outlines, cel shading",
    promptSuffix: "flat vibrant colors, sticker style, high readability, centered composition",
    negativePrompt: "photo, photorealistic, messy lineart, muddy colors, cluttered background",
    steps: 24,
    cfg: 7.2,
    samplerName: "euler",
    scheduler: "normal",
  },
  anime: {
    promptPrefix: "anime style illustration, masterpiece, best quality, detailed lineart",
    promptSuffix: "vibrant colors, cel shading, sharp eyes, clean contour, dynamic composition",
    negativePrompt: "photo, realistic, western comic style, muddy colors, rough sketch, messy background",
    steps: 24,
    cfg: 6.8,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
  },
  abstract: {
    promptPrefix: "abstract graphic art, geometric rhythm, color field composition, high contrast",
    promptSuffix: "balanced layout, modern poster design, intentional negative space, crisp edges",
    negativePrompt: "photo, realistic face, muddy colors, random noise, chaotic composition",
    steps: 32,
    cfg: 8.0,
    samplerName: "euler_ancestral",
    scheduler: "normal",
  },
  minimalist: {
    promptPrefix: "minimalist graphic design, simple geometry, clean shapes, limited palette",
    promptSuffix: "large negative space, centered layout, crisp edges, icon-like clarity",
    negativePrompt: "complex details, cluttered layout, noisy texture, photorealistic",
    steps: 20,
    cfg: 5.8,
    samplerName: "euler",
    scheduler: "normal",
  },
  vintage: {
    promptPrefix: "vintage retro poster illustration, classic print aesthetics, halftone grain",
    promptSuffix: "muted retro palette, aged paper mood, balanced composition, nostalgic tone",
    negativePrompt: "futuristic, neon cyberpunk, oversaturated modern look, malformed anatomy",
    steps: 28,
    cfg: 7.4,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
  },
};

function buildPositivePrompt(userPrompt: string, styleConfig: ReturnType<typeof getStyleConfig>): string {
  const base = userPrompt.trim();
  const compact = base.replace(/\s+/g, " ").trim();
  const isShortPrompt = compact.length <= 8;
  const hasCjk = /[\u4e00-\u9fff]/.test(compact);

  const zhKeywordMap: Array<[RegExp, string]> = [
    [/彩虹|七彩|虹/i, "rainbow"],
    [/巨龙|龙/i, "dragon"],
    [/火焰|喷火|烈焰/i, "flames"],
    [/猫|猫咪/i, "cat"],
    [/狗|小狗/i, "dog"],
    [/花|花卉|植物|叶子/i, "floral botanical"],
    [/城市|都市|赛博朋克/i, "city skyline"],
    [/山|山脉/i, "mountains"],
    [/几何/i, "geometric"],
    [/抽象/i, "abstract"],
    [/水彩/i, "watercolor"],
    [/复古/i, "vintage retro"],
    [/极简|简约/i, "minimalist"],
    [/太空|银河|星空|行星/i, "space galaxy planets"],
    [/墨镜/i, "sunglasses"],
  ];

  const englishHints = hasCjk
    ? zhKeywordMap
        .filter(([pattern]) => pattern.test(compact))
        .map(([, hint]) => hint)
        .filter((value, index, arr) => arr.indexOf(value) === index)
    : [];

  const multilingualSubject = hasCjk
    ? `${compact}${englishHints.length > 0 ? ` (${englishHints.join(", ")})` : ""}`
    : compact;

  const englishHintBlock = englishHints.length > 0 ? `english concept tags: ${englishHints.join(", ")}` : "";
  const subjectBlock = `main subject: ${multilingualSubject}, (${multilingualSubject}:1.3), centered single subject`;
  const brevityAssist = isShortPrompt
    ? "simple iconic depiction, clean silhouette, high readability at small print size"
    : "preserve user subject details faithfully, keep composition clean and uncluttered";

  return [
    PURE_ELEMENT_PREFIX,
    subjectBlock,
    englishHintBlock,
    brevityAssist,
    styleConfig.promptPrefix,
    styleConfig.promptSuffix,
    PURE_ELEMENT_SUFFIX,
  ]
    .filter(Boolean)
    .join(", ");
}

function buildArgosSourcePrompts(userPrompt: string, style?: string) {
  const cleanUserPrompt = userPrompt.replace(/\s+/g, " ").trim();
  const styleHintZhMap: Record<string, string> = {
    realistic: "写实摄影风格, 高清细节, 自然光影, 单主体, 白底或纯净背景",
    cartoon: "卡通插画风格, 线条清晰, 颜色鲜明, 单主体, 简洁背景",
    anime: "动漫插画风格, 线稿清晰, 色彩明快, 单主体, 简洁背景",
    abstract: "抽象图形风格, 构图平衡, 高对比, 单主体, 简洁背景",
    minimalist: "极简风格, 形状干净, 留白充足, 单主体, 简洁背景",
    vintage: "复古海报风格, 颗粒质感, 怀旧配色, 单主体, 简洁背景",
  };

  const styleHint = styleHintZhMap[style || "realistic"] || styleHintZhMap.realistic;
  const positiveText = `${cleanUserPrompt}, ${styleHint}`;

  const negativeText =
    "低质量, 模糊, 文字, 水印, logo, 边框, 人像, 人体, 手, 多主体, 杂乱背景";

  return { positiveText, negativeText };
}

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
  // If it's a file URL (not a data URL), read from disk
  if (!dataUrl.startsWith("data:")) {
    const fs = require("fs");
    const p = require("path");
    // Resolve: if it's a relative URL like /assets/filename.png, resolve to asset dir
    let filePath = dataUrl;
    if (dataUrl.startsWith("/")) {
      const assetDir = process.env.ASSET_STORAGE_DIR || p.join(process.cwd(), "storage", "assets");
      filePath = p.join(assetDir, p.basename(dataUrl));
    }
    const buffer = fs.readFileSync(filePath);
    const ext = p.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    const mime = mimeMap[ext] || "image/png";
    return { buffer, mime };
  }
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

function buildCatVtonWithFaceSwapWorkflow(params: {
  personFilename: string;
  clothFilename: string;
  faceFilename: string;
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
    faceFilename,
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
    "30": {
      class_type: "LoadImage",
      inputs: {
        image: faceFilename,
      },
    },
    "31": {
      class_type: "ReActorFaceSwap",
      inputs: {
        enabled: true,
        input_image: ["16", 0],
        source_image: ["30", 0],
        swap_model: "inswapper_128.onnx",
        facedetection: "retinaface_resnet50",
        face_restore_model: "GFPGANv1.4.pth",
        face_restore_visibility: 1.0,
        codeformer_weight: 0.5,
        detect_gender_input: "no",
        detect_gender_source: "no",
        input_faces_index: "0",
        source_faces_index: "0",
        console_log_level: 1,
      },
    },
    "32": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: filenamePrefix,
        images: ["31", 0],
      },
    },
  };
}

function buildArgosAiWorkflow(params: {
  positiveText: string;
  negativeText: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  denoise: number;
  seed: number;
  modelName: string;
  samplerName: string;
  scheduler: string;
  fromTranslate: string;
  toTranslate: string;
  filenamePrefix: string;
}): Record<string, unknown> {
  const {
    positiveText,
    negativeText,
    width,
    height,
    steps,
    cfg,
    denoise,
    seed,
    modelName,
    samplerName,
    scheduler,
    fromTranslate,
    toTranslate,
    filenamePrefix,
  } = params;

  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        model: ["4", 0],
        positive: ["15", 0],
        negative: ["16", 0],
        latent_image: ["5", 0],
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise,
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: modelName,
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width,
        height,
        batch_size: 1,
      },
    },
    "15": {
      class_type: "ArgosTranslateCLIPTextEncodeNode",
      inputs: {
        clip: ["4", 1],
        from_translate: fromTranslate,
        to_translate: toTranslate,
        text: positiveText,
      },
    },
    "16": {
      class_type: "ArgosTranslateCLIPTextEncodeNode",
      inputs: {
        clip: ["4", 1],
        from_translate: fromTranslate,
        to_translate: toTranslate,
        text: negativeText,
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: filenamePrefix,
        images: ["8", 0],
      },
    },
  };
}

function findImageWorkflowPath(): string | null {
  const configured = process.env.COMFYUI_IMAGE_WORKFLOW_PATH;
  const candidates = configured ? [configured, ...DEFAULT_IMAGE_WORKFLOW_PATHS] : DEFAULT_IMAGE_WORKFLOW_PATHS;
  for (const filePath of candidates) {
    if (filePath && existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function buildArgosAiWorkflowFromTemplate(params: {
  templatePath: string;
  positiveText: string;
  negativeText: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  denoise: number;
  seed: number;
  modelName: string;
  samplerName: string;
  scheduler: string;
  fromTranslate: string;
  toTranslate: string;
  filenamePrefix: string;
}): Record<string, unknown> {
  const {
    templatePath,
    positiveText,
    negativeText,
    width,
    height,
    steps,
    cfg,
    denoise,
    seed,
    modelName,
    samplerName,
    scheduler,
    fromTranslate,
    toTranslate,
    filenamePrefix,
  } = params;

  const raw = readFileSync(templatePath, "utf-8");
  const parsed = JSON.parse(raw) as {
    nodes?: Array<{ id: number; type: string }>;
  };
  const nodes = parsed.nodes || [];

  const findNode = (type: string) => nodes.find((node) => node.type === type);
  const checkpointNode = findNode("CheckpointLoaderSimple");
  const latentNode = findNode("EmptyLatentImage");
  const samplerNode = findNode("KSampler");
  const translateNodes = nodes.filter((node) => node.type === "ArgosTranslateCLIPTextEncodeNode");
  const positiveNode = translateNodes[0];
  const negativeNode = translateNodes[1] || translateNodes[0];
  const vaeNode = findNode("VAEDecode");
  const saveNode = findNode("SaveImage");

  if (!checkpointNode || !latentNode || !samplerNode || !positiveNode || !negativeNode || !vaeNode || !saveNode) {
    throw new Error("Workflow template missing required nodes");
  }

  const checkpointId = String(checkpointNode.id);
  const latentId = String(latentNode.id);
  const samplerId = String(samplerNode.id);
  const positiveId = String(positiveNode.id);
  const negativeId = String(negativeNode.id);
  const vaeId = String(vaeNode.id);
  const saveId = String(saveNode.id);

  return {
    [samplerId]: {
      class_type: "KSampler",
      inputs: {
        model: [checkpointId, 0],
        positive: [positiveId, 0],
        negative: [negativeId, 0],
        latent_image: [latentId, 0],
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise,
      },
    },
    [checkpointId]: {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: modelName,
      },
    },
    [latentId]: {
      class_type: "EmptyLatentImage",
      inputs: {
        width,
        height,
        batch_size: 1,
      },
    },
    [positiveId]: {
      class_type: "ArgosTranslateCLIPTextEncodeNode",
      inputs: {
        clip: [checkpointId, 1],
        from_translate: fromTranslate,
        to_translate: toTranslate,
        text: positiveText,
      },
    },
    [negativeId]: {
      class_type: "ArgosTranslateCLIPTextEncodeNode",
      inputs: {
        clip: [checkpointId, 1],
        from_translate: fromTranslate,
        to_translate: toTranslate,
        text: negativeText,
      },
    },
    [vaeId]: {
      class_type: "VAEDecode",
      inputs: {
        samples: [samplerId, 0],
        vae: [checkpointId, 2],
      },
    },
    [saveId]: {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: filenamePrefix,
        images: [vaeId, 0],
      },
    },
  };
}

async function runAiImageJob(payload: AIImageJobPayload) {
  const { prompt, style, width, height } = payload;
  const client = new SimpleComfyUIClient(COMFYUI_URL);
  const connected = await client.checkConnection();
  if (!connected) {
    throw new Error(`ComfyUI unavailable for AI generation. configuredUrls=${COMFYUI_URL}`);
  }

  logInfo("worker_comfyui_request_start", {
    queue: AI_QUEUE_NAME,
    operation: "ai-generate",
    activeServerUrl: client.getActiveServerUrl(),
    configuredUrls: COMFYUI_URL,
    width: width || 768,
    height: height || 768,
    style: style || "realistic",
  });

  const config = getStyleConfig(style);
  const positivePrompt = buildPositivePrompt(prompt, config);
  const negativePrompt = `${config.negativePrompt}, ${PURE_ELEMENT_NEGATIVE}, unrelated subject, wrong subject, random texture, camouflage texture, marble texture, chaotic background, abstract texture only, full body, upper body, selfie, photo of a person, multi-subject, crowd, busy scene`;
  const { positiveText: argosPositiveText, negativeText: argosNegativeText } = buildArgosSourcePrompts(
    prompt,
    style || "realistic"
  );
  const modelName =
    payload.modelName ||
    process.env.COMFYUI_MODEL_NAME ||
    process.env.COMFYUI_CHINESE_MODEL_NAME ||
    "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors";
  const steps = payload.steps || config.steps;
  const cfg = payload.cfg || config.cfg;
  const samplerName = payload.samplerName || config.samplerName;
  const scheduler = payload.scheduler || config.scheduler;
  const denoise = payload.denoise ?? 1;
  const seed = payload.seed ?? Math.floor(Math.random() * 1000000);
  const fromTranslate = getEnvString("COMFYUI_TRANSLATE_FROM", "chinese");
  const toTranslate = getEnvString("COMFYUI_TRANSLATE_TO", "english");
  const useArgosWorkflow = getEnvString("COMFYUI_USE_ARGOS_WORKFLOW", "true") !== "false";
  const workflowTemplatePath = findImageWorkflowPath();

  logInfo("worker_ai_prompt_profile", {
    queue: AI_QUEUE_NAME,
    style: style || "realistic",
    useArgosWorkflow,
    workflowTemplatePath: workflowTemplatePath || null,
    sourceLanguage: fromTranslate,
    targetLanguage: toTranslate,
    userPromptLength: prompt.length,
    argosPositiveLength: argosPositiveText.length,
    argosNegativeLength: argosNegativeText.length,
  });

  const result = await trackComfyUiMetrics("ai-generate", async () => {
    if (useArgosWorkflow) {
      try {
        const workflow = workflowTemplatePath
          ? buildArgosAiWorkflowFromTemplate({
              templatePath: workflowTemplatePath,
              positiveText: argosPositiveText,
              negativeText: argosNegativeText,
              width: width || 768,
              height: height || 768,
              steps,
              cfg,
              denoise,
              seed,
              modelName,
              samplerName,
              scheduler,
              fromTranslate,
              toTranslate,
              filenamePrefix: "tshirt_design",
            })
          : buildArgosAiWorkflow({
              positiveText: argosPositiveText,
              negativeText: argosNegativeText,
              width: width || 768,
              height: height || 768,
              steps,
              cfg,
              denoise,
              seed,
              modelName,
              samplerName,
              scheduler,
              fromTranslate,
              toTranslate,
              filenamePrefix: "tshirt_design",
            });

        logInfo("worker_ai_workflow_selected", {
          queue: AI_QUEUE_NAME,
          workflowSource: workflowTemplatePath ? "template" : "builtin",
          workflowTemplatePath: workflowTemplatePath || null,
          fromTranslate,
          toTranslate,
        });

        const queueResult = await client.queuePrompt(workflow);
        const completed = await client.waitForCompletion(queueResult.prompt_id);
        const imageBuffer = await client.getImage(completed.filename, completed.subfolder, "output");

        return {
          imageBuffer,
          filename: completed.filename,
          metadata: {
            prompt: positivePrompt,
            seed,
            steps,
          },
        };
      } catch (error) {
        logWarn("worker_argos_workflow_fallback", {
          queue: AI_QUEUE_NAME,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return client.generateImage(positivePrompt, negativePrompt, {
      width: width || 768,
      height: height || 768,
      steps,
      cfg,
      denoise,
      seed,
      samplerName,
      scheduler,
      modelName,
    });
  });

  return {
    imageBuffer: result.imageBuffer,
    imageMimeType: "image/png",
    prompt,
    style: style || "realistic",
  };
}

async function runTryOnJob(payload: TryOnJobPayload) {
  return trackComfyUiMetrics("tryon", async () => {
    const client = new SimpleComfyUIClient(COMFYUI_URL);
    const ok = await client.checkConnection();
    if (!ok) {
      throw new Error("ComfyUI 不可用");
    }

    const active = client.getActiveServerUrl();
    if (!active) {
      throw new Error("未找到可用的 ComfyUI 服务器");
    }

    logInfo("worker_comfyui_request_start", {
      queue: TRYON_QUEUE_NAME,
      operation: "tryon",
      activeServerUrl: active,
      configuredUrls: COMFYUI_URL,
      clothType: payload.clothType || null,
    });

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const personName = `tryon-person-${suffix}.png`;
    const clothName = `tryon-cloth-${suffix}.png`;

    const uploadPromises: Promise<string>[] = [
      uploadToComfyInput(active, payload.personDataUrl, personName),
      uploadToComfyInput(active, payload.clothDataUrl, clothName),
    ];

    // 如果提供了换脸源图，也上传
    let faceFilename: string | null = null;
    if (payload.faceDataUrl) {
      const faceName = `tryon-face-${suffix}.png`;
      uploadPromises.push(uploadToComfyInput(active, payload.faceDataUrl, faceName));
    }

    const uploadResults = await Promise.all(uploadPromises);
    const personFilename = uploadResults[0];
    const clothFilename = uploadResults[1];
    if (payload.faceDataUrl) {
      faceFilename = uploadResults[2];
    }
    const defaultCatvtonPath = pickLocalModelPath(
      [
        path.join(COMFYUI_ROOT, "models/catvton"),
        path.join(COMFYUI_ROOT, "custom_nodes/ComfyUI-CatVTON"),
      ],
      "zhengchong/CatVTON"
    );
    const defaultSd15InpaintPath = pickLocalModelPath(
      [
        path.join(COMFYUI_ROOT, "models/catvton/stable-diffusion-inpainting"),
        path.join(COMFYUI_ROOT, "models/sd15_inpaint"),
      ],
      "runwayml/stable-diffusion-inpainting"
    );
    const defaultVaePath = pickLocalModelPath(
      [
        path.join(COMFYUI_ROOT, "models/catvton/sd-vae-ft-mse"),
      ],
      "stabilityai/sd-vae-ft-mse"
    );

    const catvtonPath = forceLocalIfRepoId(
      getEnvString("CATVTON_PATH", defaultCatvtonPath),
      ["zhengchong/CatVTON"],
      [
        path.join(COMFYUI_ROOT, "models/catvton"),
        path.join(COMFYUI_ROOT, "custom_nodes/ComfyUI-CatVTON"),
      ]
    );
    const sd15InpaintPath = forceLocalIfRepoId(
      getEnvString("SD15_INPAINT_PATH", defaultSd15InpaintPath),
      ["runwayml/stable-diffusion-inpainting", "booksforcharlie/stable-diffusion-inpainting"],
      [
        path.join(COMFYUI_ROOT, "models/catvton/stable-diffusion-inpainting"),
        path.join(COMFYUI_ROOT, "models/sd15_inpaint"),
      ]
    );
    const vaePath = getEnvString("SD_VAE_PATH", defaultVaePath);

    const mixedPrecision = getMixedPrecision();
    const tryonSteps = Math.max(10, Math.min(80, getEnvInt("TRYON_STEPS", 28)));
    const tryonCfg = Math.max(1.0, Math.min(8.0, getEnvFloat("TRYON_CFG", 2.5)));
    const clothType = payload.clothType || (getEnvString("TRYON_CLOTH_TYPE", "upper") as "upper" | "lower" | "overall");

    // 根据是否提供换脸源图选择不同的工作流
    const workflow = faceFilename
      ? buildCatVtonWithFaceSwapWorkflow({
          personFilename,
          clothFilename,
          faceFilename,
          catvtonPath,
          sd15InpaintPath,
          vaePath,
          mixedPrecision,
          clothType,
          seed: Math.floor(Math.random() * 100000),
          steps: tryonSteps,
          cfg: tryonCfg,
          filenamePrefix: "tryon",
        })
      : buildCatVtonWorkflow({
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

    return {
      imageBuffer,
      imageMimeType: "image/png",
      promptId: queueResult.prompt_id,
    };
  });
}

type QueueMessage = {
  jobId: string;
  queue: QueueName;
  data: any;
  attempt: number;
  maxAttempts: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getRetryDelayMs = (attempt: number) => {
  const configuredBase = getEnvInt("JOB_BACKOFF_BASE_MS", getEnvInt("JOB_BACKOFF_MS", 5000));
  const baseMs = Math.max(100, configuredBase);
  const maxMs = Math.max(baseMs, getEnvInt("JOB_BACKOFF_MAX_MS", 60000));
  const jitterRatio = clamp(getEnvFloat("JOB_BACKOFF_JITTER_RATIO", 0.25), 0, 1);

  const exponent = Math.max(0, attempt - 1);
  const exponentialDelay = Math.min(maxMs, baseMs * Math.pow(2, exponent));
  const jitterSpan = exponentialDelay * jitterRatio;
  const jitterOffset = (Math.random() * 2 - 1) * jitterSpan;

  return Math.max(0, Math.round(exponentialDelay + jitterOffset));
};

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
    let jobCreatedAt = Date.now();
    try {
      parsed = JSON.parse(msg.content.toString()) as QueueMessage;
      const job = await getJobById(queueName, parsed.jobId);
      if (!job) {
        channel.ack(msg);
        return;
      }
      jobCreatedAt = job.createdAt;
      const queueWaitSeconds = Math.max(0, (Date.now() - jobCreatedAt) / 1000);
      observeHistogram("job_queue_wait_duration_seconds", queueWaitSeconds, { queue: queueName });

      await updateJobState(queueName, parsed.jobId, {
        state: "active",
        progress: 5,
        attemptsMade: parsed.attempt,
      });
      logInfo("worker_job_started", {
        queue: queueName,
        jobId: parsed.jobId,
        attempt: parsed.attempt + 1,
        maxAttempts: parsed.maxAttempts,
      });
      await addJobLog(queueName, parsed.jobId, `Job started (attempt ${parsed.attempt + 1}/${parsed.maxAttempts})`);

      const result = await handler(parsed.data);

      // ── Guarantee: result.imageUrl must be a disk URL, NEVER base64 ──
      // If handler returned raw imageBuffer, save to disk first
      if (result?.imageBuffer) {
        const mimeType = result.imageMimeType || "image/png";
        const context = queueName === AI_QUEUE_NAME ? "ai" : "tryon";
        try {
          const buf = Buffer.isBuffer(result.imageBuffer) ? result.imageBuffer : Buffer.from(result.imageBuffer);
          const stored = await storeBuffer(buf, mimeType, `${context}-${parsed.jobId}`);
          result.imageUrl = stored.url;
        } catch (saveErr) {
          // Fallback: write directly with fs
          const { writeFile, mkdir } = await import("fs/promises");
          const { join } = await import("path");
          const storageDir = process.env.ASSET_STORAGE_DIR || join(process.cwd(), "storage", "assets");
          await mkdir(storageDir, { recursive: true });
          const ext = mimeType.includes("png") ? "png" : "jpg";
          const fileName = `${context}-${parsed.jobId}.${ext}`;
          const filePath = join(storageDir, fileName);
          const fallbackBuf = Buffer.isBuffer(result.imageBuffer) ? result.imageBuffer : Buffer.from(result.imageBuffer);
          await writeFile(filePath, fallbackBuf);
          result.imageUrl = `/assets/${fileName}`;
          logWarn("worker_image_save_fallback", { queue: queueName, jobId: parsed.jobId });
        }
        delete result.imageBuffer;
        delete result.imageMimeType;
      }

      // Legacy safety: if result still has a data URL (shouldn't happen now), convert it
      if (result?.imageUrl && typeof result.imageUrl === "string" && result.imageUrl.startsWith("data:")) {
        try {
          const context = queueName === AI_QUEUE_NAME ? "ai" : "tryon";
          const stored = context === "ai"
            ? await saveAiResult(result.imageUrl, parsed.jobId)
            : await saveTryOnResult(result.imageUrl, parsed.jobId);
          if (stored) result.imageUrl = stored.url;
        } catch (e) {
          result.imageUrl = `/assets/placeholder-${parsed.jobId}.png`;
          logWarn("worker_legacy_dataurl_fallback", { queue: queueName, jobId: parsed.jobId });
        }
      }

      // For virtual-tryon jobs: persist to DB
      if (queueName === TRYON_QUEUE_NAME && result?.imageUrl) {
        try {
          const clothType = parsed.data?.clothType || null;
          await getDbPool().query(
            `INSERT INTO virtual_tryon_results (job_id, result_image_url, cloth_type)
             VALUES ($1, $2, $3)
             ON CONFLICT (job_id) DO NOTHING`,
            [parsed.jobId, result.imageUrl, clothType]
          );
        } catch (dbErr) {
          logWarn("worker_tryon_db_persist_failed", {
            queue: queueName,
            jobId: parsed.jobId,
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        }
      }

      // For AI image jobs: persist to DB
      if (queueName === AI_QUEUE_NAME && result?.imageUrl) {
        try {
          const prompt = parsed.data?.prompt || null;
          const style = parsed.data?.style || null;
          await getDbPool().query(
            `INSERT INTO ai_image_results (job_id, result_image_url, prompt, style)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (job_id) DO NOTHING`,
            [parsed.jobId, result.imageUrl, prompt, style]
          );
        } catch (dbErr) {
          logWarn("worker_ai_db_persist_failed", {
            queue: queueName,
            jobId: parsed.jobId,
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        }
      }

      await updateJobState(queueName, parsed.jobId, {
        state: "completed",
        progress: 100,
        result,
        failedReason: null,
        finishedAt: Date.now(),
      });
      await addJobLog(queueName, parsed.jobId, "Job completed");
      const durationSeconds = Math.max(0, (Date.now() - jobCreatedAt) / 1000);
      logInfo("worker_job_completed", {
        queue: queueName,
        jobId: parsed.jobId,
        durationMs: Math.round(durationSeconds * 1000),
      });
      incrementCounter("jobs_completed_total", { queue: queueName });
      observeHistogram("job_processing_duration_seconds", durationSeconds, { queue: queueName, status: "completed" });
      channel.ack(msg);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      if (parsed) {
        const nextAttempt = parsed.attempt + 1;
        if (nextAttempt < parsed.maxAttempts) {
          const retryDelayMs = getRetryDelayMs(nextAttempt);
          logWarn("worker_job_retry", {
            queue: queueName,
            jobId: parsed.jobId,
            error: errMessage,
            nextAttempt: nextAttempt + 1,
            maxAttempts: parsed.maxAttempts,
            retryDelayMs,
          });
          await addJobLog(
            queueName,
            parsed.jobId,
            `Job failed: ${errMessage}; retrying (${nextAttempt + 1}/${parsed.maxAttempts}) in ${retryDelayMs}ms`
          );
          await updateJobState(queueName, parsed.jobId, {
            state: "waiting",
            progress: 0,
            failedReason: errMessage,
            attemptsMade: parsed.attempt,
          });

          await sleep(retryDelayMs);
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

        await updateJobState(queueName, parsed.jobId, {
          state: "failed",
          progress: 0,
          failedReason: errMessage,
          attemptsMade: parsed.attempt,
          finishedAt: Date.now(),
        });
        await addJobLog(queueName, parsed.jobId, `Job failed permanently: ${errMessage}`);
        const durationSeconds = Math.max(0, (Date.now() - jobCreatedAt) / 1000);
        logError("worker_job_failed", {
          queue: queueName,
          jobId: parsed.jobId,
          error: errMessage,
          durationMs: Math.round(durationSeconds * 1000),
        });
        incrementCounter("jobs_failed_total", { queue: queueName });
        observeHistogram("job_processing_duration_seconds", durationSeconds, { queue: queueName, status: "failed" });
      }

      channel.ack(msg);
    }
  };

  const bootstrap = async () => {
    const connection = await getRabbitConnection();
    logInfo("worker_bootstrap_connected", {
      queues: [AI_QUEUE_NAME, TRYON_QUEUE_NAME],
      concurrencyAi: Math.max(1, AI_CONCURRENCY),
      concurrencyTryon: Math.max(1, TRYON_CONCURRENCY),
    });

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
    logInfo("worker_consumer_ready", { queue: AI_QUEUE_NAME });

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
    logInfo("worker_consumer_ready", { queue: TRYON_QUEUE_NAME });
  };

  bootstrap().catch((error) => {
    logError("worker_bootstrap_failed", { error });
  });

  return async () => {
    stopping = true;
    for (const channel of channels) {
      await channel.close().catch(() => undefined);
    }
  };
};
