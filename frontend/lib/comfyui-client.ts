/**
 * ComfyUI API 客户端
 * 基于提供的 API 文档实现
 */

import { randomUUID } from 'crypto'

export interface ComfyUIConfig {
  serverAddress?: string
  timeout?: number
}

export interface GenerationParams {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  steps?: number
  seed?: number
  cfgScale?: number
  samplerName?: string
  scheduler?: string
  modelName?: string
}

export interface WorkflowNode {
  inputs: Record<string, unknown>
  class_type: string
}

export interface Workflow {
  [nodeId: string]: WorkflowNode
}

export interface QueueResponse {
  prompt_id: string
  number: number
  node_errors?: Record<string, unknown>
}

export interface HistoryItem {
  prompt: Workflow
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

export class ComfyUIAPI {
  private serverAddress: string
  private clientId: string
  private timeout: number

  constructor(config: ComfyUIConfig = {}) {
    this.serverAddress = config.serverAddress || "127.0.0.1:8188"
    this.clientId = randomUUID()
    this.timeout = config.timeout || 300000 // 5 minutes
  }

  /**
   * 提交生成任务到队列
   */
  async queuePrompt(workflow: Workflow): Promise<QueueResponse> {
    const payload = {
      prompt: workflow,
      client_id: this.clientId
    }

    const response = await fetch(`http://${this.serverAddress}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Failed to queue prompt: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 获取生成的图像
   */
  async getImage(filename: string, subfolder: string = '', type: string = 'output'): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type
    })

    const response = await fetch(`http://${this.serverAddress}/view?${params}`)

    if (!response.ok) {
      throw new Error(`Failed to get image: ${response.statusText}`)
    }

    return response.arrayBuffer()
  }

  /**
   * 获取任务历史
   */
  async getHistory(promptId: string): Promise<Record<string, HistoryItem>> {
    const response = await fetch(`http://${this.serverAddress}/history/${promptId}`)

    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 获取队列状态
   */
  async getQueue(): Promise<{
    queue_running: unknown[]
    queue_pending: unknown[]
  }> {
    const response = await fetch(`http://${this.serverAddress}/queue`)

    if (!response.ok) {
      throw new Error(`Failed to get queue: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 检查服务器状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`http://${this.serverAddress}/queue`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * 等待任务完成
   */
  async waitForCompletion(promptId: string): Promise<HistoryItem> {
    const startTime = Date.now()
    const pollInterval = 2000 // 2 seconds

    while (Date.now() - startTime < this.timeout) {
      try {
        const history = await this.getHistory(promptId)
        
        if (history[promptId]) {
          const item = history[promptId]
          if (item.status.completed) {
            return item
          }
          
          // 检查是否有错误
          if (item.status.status_str === 'error') {
            throw new Error(`Generation failed: ${item.status.messages.join(', ')}`)
          }
        }

        // 等待下次轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error) {
        if (error instanceof Error && error.message.includes('Generation failed')) {
          throw error
        }
        // 继续轮询其他错误
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
    }

    throw new Error(`Generation timeout after ${this.timeout}ms`)
  }
}

/**
 * 创建基础工作流模板
 */
export function createBasicWorkflow(params: GenerationParams): Workflow {
  const {
    prompt,
    negativePrompt = "worst quality, low quality, blurry",
    width = 512,
    height = 512,
    steps = 20,
    seed = Math.floor(Math.random() * 1000000),
    cfgScale = 8.0,
    samplerName = "euler",
    scheduler = "normal",
    modelName = "v1-5-pruned-emaonly.ckpt"
  } = params

  return {
    "3": {
      inputs: {
        seed,
        steps,
        cfg: cfgScale,
        sampler_name: samplerName,
        scheduler,
        denoise: 1.0,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0]
      },
      class_type: "KSampler"
    },
    "4": {
      inputs: {
        ckpt_name: modelName
      },
      class_type: "CheckpointLoaderSimple"
    },
    "5": {
      inputs: {
        width,
        height,
        batch_size: 1
      },
      class_type: "EmptyLatentImage"
    },
    "6": {
      inputs: {
        text: prompt,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "7": {
      inputs: {
        text: negativePrompt,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "8": {
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2]
      },
      class_type: "VAEDecode"
    },
    "9": {
      inputs: {
        filename_prefix: "tshirt_design",
        images: ["8", 0]
      },
      class_type: "SaveImage"
    }
  }
}

/**
 * 简化的 ComfyUI 客户端
 */
export class SimpleComfyUIClient {
  private api: ComfyUIAPI

  constructor(config: ComfyUIConfig = {}) {
    this.api = new ComfyUIAPI(config)
  }

  /**
   * 生成图像的简化接口
   */
  async generateImage(params: GenerationParams): Promise<{
    imageBuffer: ArrayBuffer
    filename: string
    metadata: {
      prompt: string
      seed: number
      steps: number
    }
  }> {
    // 检查连接
    const isConnected = await this.api.checkConnection()
    if (!isConnected) {
      throw new Error('ComfyUI server is not available')
    }

    // 创建工作流
    const workflow = createBasicWorkflow(params)
    
    // 提交任务
    const queueResult = await this.api.queuePrompt(workflow)
    const promptId = queueResult.prompt_id

    // 等待完成
    const result = await this.api.waitForCompletion(promptId)

    // 获取图像
    const outputs = result.outputs
    for (const nodeId in outputs) {
      const output = outputs[nodeId]
      if (output.images && output.images.length > 0) {
        const imageInfo = output.images[0]
        const imageBuffer = await this.api.getImage(
          imageInfo.filename,
          imageInfo.subfolder,
          imageInfo.type
        )

        const workflowSeed = workflow["3"]?.inputs?.seed
        const workflowSteps = workflow["3"]?.inputs?.steps

        return {
          imageBuffer,
          filename: imageInfo.filename,
          metadata: {
            prompt: params.prompt,
            seed: typeof workflowSeed === 'number' ? workflowSeed : params.seed ?? 0,
            steps: typeof workflowSteps === 'number' ? workflowSteps : params.steps ?? 0,
          }
        }
      }
    }

    throw new Error('No images found in generation result')
  }

  /**
   * 检查服务器状态
   */
  async isAvailable(): Promise<boolean> {
    return this.api.checkConnection()
  }
}