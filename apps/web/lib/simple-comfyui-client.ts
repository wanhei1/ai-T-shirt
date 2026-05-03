/**
 * 简化的 ComfyUI API 客户端
 * 基于官方基础示例
 */

export interface SimpleWorkflow extends Record<string, unknown> {
  "3": {
    class_type: "KSampler"
    inputs: {
      cfg: number
      denoise: number
      latent_image: [string, number]
      model: [string, number]
      negative: [string, number]
      positive: [string, number]
      sampler_name: string
      scheduler: string
      seed: number
      steps: number
    }
  }
  "4": {
    class_type: "CheckpointLoaderSimple"
    inputs: {
      ckpt_name: string
    }
  }
  "5": {
    class_type: "EmptyLatentImage"
    inputs: {
      batch_size: number
      height: number
      width: number
    }
  }
  "6": {
    class_type: "CLIPTextEncode"
    inputs: {
      clip: [string, number]
      text: string
    }
  }
  "7": {
    class_type: "CLIPTextEncode"
    inputs: {
      clip: [string, number]
      text: string
    }
  }
  "8": {
    class_type: "VAEDecode"
    inputs: {
      samples: [string, number]
      vae: [string, number]
    }
  }
  "9": {
    class_type: "SaveImage"
    inputs: {
      filename_prefix: string
      images: [string, number]
    }
  }
}

export interface QueueResponse {
  prompt_id: string
  number: number
}

export interface SimpleHistoryItem {
  outputs: Record<string, {
    images?: Array<{
      filename: string
      subfolder: string
      type: string
    }>
  }>
  status: {
    status_str: string
    completed: boolean
    messages: string[]
  }
}

export type HistoryResponse = Record<string, SimpleHistoryItem>

export class SimpleComfyUIClient {
  private serverUrl: string
  private fallbackUrls: string[]
  private activeUrl: string | null = null

  private readonly defaultModelName: string
  private readonly defaultSamplerName: string
  private readonly defaultScheduler: string
  private readonly defaultSteps: number
  private readonly defaultCfg: number
  private readonly defaultWidth: number
  private readonly defaultHeight: number

  constructor(serverUrl: string = "http://127.0.0.1:8188") {
    this.serverUrl = serverUrl

    const urlsFromConfig = serverUrl.includes(",")
      ? serverUrl.split(",").map((url) => url.trim())
      : [serverUrl]

    const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production"
    const allowLocalInProd = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COMFYUI_ALLOW_LOCAL === "true"

    const defaultLocalUrls = [
      "http://0.0.0.0:8188",
      "http://127.0.0.1:8188",
      "http://localhost:8188",
      "http://0.0.0.0:8189",
      "http://127.0.0.1:8189",
      "http://localhost:8189",
    ]

    let allUrls: string[]
    if (isProduction && !allowLocalInProd) {
      allUrls = urlsFromConfig.filter(
        (url) => !url.includes("127.0.0.1") && !url.includes("localhost") && !url.includes("0.0.0.0")
      )
      console.log("生产环境：只使用配置的非本地地址")
    } else {
      allUrls = [...urlsFromConfig, ...defaultLocalUrls]
      if (isProduction && allowLocalInProd) {
        console.log("生产环境：已开启本地回退（NEXT_PUBLIC_COMFYUI_ALLOW_LOCAL=true）")
      }
    }

    this.fallbackUrls = Array.from(new Set(allUrls))
    if (this.fallbackUrls.length === 0) {
      throw new Error(
        "ComfyUI URL list is empty after production filtering. Configure NEXT_PUBLIC_COMFYUI_URL with a valid internal/proxy endpoint."
      )
    }
    console.log("ComfyUI 服务器列表 (按优先级):", this.fallbackUrls)

    this.defaultModelName = process.env.NEXT_PUBLIC_COMFYUI_MODEL_NAME || "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors"
    this.defaultSamplerName = process.env.NEXT_PUBLIC_COMFYUI_DEFAULT_SAMPLER || "euler"
    this.defaultScheduler = process.env.NEXT_PUBLIC_COMFYUI_DEFAULT_SCHEDULER || "normal"
    this.defaultSteps = Number.parseInt(process.env.NEXT_PUBLIC_COMFYUI_DEFAULT_STEPS || "24", 10)
    this.defaultCfg = Number.parseFloat(process.env.NEXT_PUBLIC_COMFYUI_DEFAULT_CFG || "8")
    this.defaultWidth = Number.parseInt(process.env.NEXT_PUBLIC_COMFYUI_DEFAULT_WIDTH || "768", 10)
    this.defaultHeight = Number.parseInt(process.env.NEXT_PUBLIC_COMFYUI_DEFAULT_HEIGHT || "768", 10)
  }

  private async findAvailableServer(): Promise<string | null> {
    if (this.activeUrl) {
      try {
        const response = await fetch(`${this.activeUrl}/queue`, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        })
        if (response.ok) {
          return this.activeUrl
        }
        this.activeUrl = null
      } catch {
        this.activeUrl = null
      }
    }

    for (const url of this.fallbackUrls) {
      try {
        console.log(`尝试连接到: ${url}`)
        const response = await fetch(`${url}/queue`, {
          method: "GET",
          headers: { "User-Agent": "CustomTshirtDesigner/1.0" },
          signal: AbortSignal.timeout(5000),
        })

        if (response.ok) {
          console.log(`✓ 成功连接到: ${url}`)
          this.activeUrl = url
          this.serverUrl = url
          return url
        }
      } catch (error) {
        console.log(`✗ 无法连接到 ${url}:`, error instanceof Error ? error.message : "未知错误")
      }
    }

    console.error("所有服务器地址均不可用")
    return null
  }

  createWorkflow(
    positivePrompt: string,
    negativePrompt: string = "bad hands",
    options: {
      width?: number
      height?: number
      steps?: number
      cfg?: number
      seed?: number
      denoise?: number
      modelName?: string
      samplerName?: string
      scheduler?: string
    } = {}
  ): SimpleWorkflow {
    const {
      width = this.defaultWidth,
      height = this.defaultHeight,
      steps = this.defaultSteps,
      cfg = this.defaultCfg,
      seed = Math.floor(Math.random() * 1000000),
      denoise = 1,
      modelName = this.defaultModelName,
      samplerName = this.defaultSamplerName,
      scheduler = this.defaultScheduler,
    } = options

    return {
      "3": {
        class_type: "KSampler",
        inputs: {
          cfg,
          denoise,
          latent_image: ["5", 0],
          model: ["4", 0],
          negative: ["7", 0],
          positive: ["6", 0],
          sampler_name: samplerName,
          scheduler,
          seed,
          steps,
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
          batch_size: 1,
          height,
          width,
        },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["4", 1],
          text: positivePrompt,
        },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["4", 1],
          text: negativePrompt,
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
          filename_prefix: "tshirt_design",
          images: ["8", 0],
        },
      },
    }
  }

  async queuePrompt(workflow: Record<string, unknown>): Promise<QueueResponse> {
    const availableServer = await this.findAvailableServer()
    if (!availableServer) {
      throw new Error("没有可用的 ComfyUI 服务器")
    }

    const response = await fetch(`${availableServer}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    })

    if (!response.ok) {
      throw new Error(`ComfyUI 请求失败: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<QueueResponse>
  }

  async getHistory(promptId: string): Promise<HistoryResponse> {
    const response = await fetch(`${this.serverUrl}/history/${promptId}`)

    if (!response.ok) {
      throw new Error(`获取历史记录失败: ${response.status}`)
    }

    return response.json() as Promise<HistoryResponse>
  }

  async getImage(filename: string, subfolder: string = "", type: string = "output"): Promise<ArrayBuffer> {
    const params = new URLSearchParams({ filename, subfolder, type })
    const response = await fetch(`${this.serverUrl}/view?${params}`)

    if (!response.ok) {
      throw new Error(`获取图像失败: ${response.status}`)
    }

    return response.arrayBuffer()
  }

  async checkConnection(): Promise<boolean> {
    const availableServer = await this.findAvailableServer()
    return availableServer !== null
  }

  getActiveServerUrl(): string | null {
    return this.activeUrl
  }

  async waitForCompletion(
    promptId: string,
    timeoutMs: number = 300000
  ): Promise<{
    filename: string
    subfolder: string
  }> {
    const startTime = Date.now()
    const pollInterval = 2000

    while (Date.now() - startTime < timeoutMs) {
      try {
        const history = await this.getHistory(promptId)

        if (history[promptId]) {
          const item = history[promptId]

          if (item.status?.completed || item.outputs) {
            const allImages: Array<{ filename: string; subfolder?: string; type?: string }> = []
            const outputImages: Array<{ filename: string; subfolder?: string; type?: string }> = []

            for (const nodeId in item.outputs) {
              const output = item.outputs[nodeId]
              if (output.images && output.images.length > 0) {
                for (const image of output.images) {
                  allImages.push(image)
                  if (image.type === "output") {
                    outputImages.push(image)
                  }
                }
              }
            }

            const picked = outputImages[0] ?? allImages[0]
            if (picked) {
              return {
                filename: picked.filename,
                subfolder: picked.subfolder || "",
              }
            }
          }

          if (item.status?.status_str === "error") {
            throw new Error(`生成失败: ${item.status.messages?.join(", ") || "未知错误"}`)
          }
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      } catch (error) {
        if (error instanceof Error && error.message.includes("生成失败")) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      }
    }

    throw new Error(`生成超时 (${timeoutMs}ms)`)
  }

  async generateImage(
    prompt: string,
    negativePrompt: string = "bad hands, low quality, blurry",
    options: {
      width?: number
      height?: number
      steps?: number
      cfg?: number
      seed?: number
      denoise?: number
      modelName?: string
      samplerName?: string
      scheduler?: string
    } = {}
  ): Promise<{
    imageBuffer: ArrayBuffer
    filename: string
    metadata: {
      prompt: string
      seed: number
      steps: number
    }
  }> {
    const isConnected = await this.checkConnection()
    if (!isConnected) {
      throw new Error("所有 ComfyUI 服务器均不可用（已尝试外网和本地服务器）")
    }

    console.log(`使用服务器: ${this.activeUrl}`)

    const workflow = this.createWorkflow(prompt, negativePrompt, options)
    const queueResult = await this.queuePrompt(workflow)
    const result = await this.waitForCompletion(queueResult.prompt_id)
    const imageBuffer = await this.getImage(result.filename, result.subfolder)

    return {
      imageBuffer,
      filename: result.filename,
      metadata: {
        prompt,
        seed: workflow["3"].inputs.seed,
        steps: workflow["3"].inputs.steps,
      },
    }
  }
}
