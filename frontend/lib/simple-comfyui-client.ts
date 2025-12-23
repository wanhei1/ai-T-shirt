/**
 * 简化的 ComfyUI API 客户端
 * 基于官方基础示例
 */

export interface SimpleWorkflow {
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

  constructor(serverUrl: string = "http://82.157.19.21:8188") {
    this.serverUrl = serverUrl
    
    // 解析服务器地址：支持逗号分隔的多个地址
    const urlsFromConfig = serverUrl.includes(',') 
      ? serverUrl.split(',').map(url => url.trim())
      : [serverUrl]
    
    // 检查是否为生产环境
    const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
    
    // 设置备用服务器列表：配置的地址 + 默认本地地址
    const defaultLocalUrls = [
      "http://0.0.0.0:8188",
      "http://127.0.0.1:8188",
      "http://localhost:8188"
    ]
    
    // 生产环境：只使用配置的地址，过滤掉本地地址
    // 开发环境：使用所有地址
    let allUrls: string[]
    if (isProduction) {
      // 过滤掉本地地址
      allUrls = urlsFromConfig.filter(url => 
        !url.includes('127.0.0.1') && 
        !url.includes('localhost') &&
        !url.includes('0.0.0.0')
      )
      console.log(`生产环境：只使用公网地址`)
    } else {
      // 合并所有地址
      allUrls = [...urlsFromConfig, ...defaultLocalUrls]
    }
    
    // 去重
    this.fallbackUrls = Array.from(new Set(allUrls))
    
    console.log(`ComfyUI 服务器列表 (按优先级):`, this.fallbackUrls)
  }

  /**
   * 智能连接：尝试所有可用的服务器地址
   */
  private async findAvailableServer(): Promise<string | null> {
    // 如果已经找到可用的服务器，直接使用
    if (this.activeUrl) {
      try {
        const response = await fetch(`${this.activeUrl}/queue`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        })
        if (response.ok) {
          return this.activeUrl
        }
        // 如果之前的服务器失效，重置并重新查找
        this.activeUrl = null
      } catch {
        this.activeUrl = null
      }
    }

    // 遍历所有可能的服务器地址
    for (const url of this.fallbackUrls) {
      try {
        console.log(`尝试连接到: ${url}`)
        const response = await fetch(`${url}/queue`, {
          method: 'GET',
          headers: {
            'User-Agent': 'CustomTshirtDesigner/1.0'
          },
          signal: AbortSignal.timeout(5000)
        })
        
        if (response.ok) {
          console.log(`✓ 成功连接到: ${url}`)
          this.activeUrl = url
          this.serverUrl = url // 更新主服务器地址
          return url
        }
      } catch (error) {
        console.log(`✗ 无法连接到 ${url}:`, error instanceof Error ? error.message : '未知错误')
        continue
      }
    }

    console.error('所有服务器地址均不可用')
    return null
  }

  /**
   * 创建基础工作流
   */
  createWorkflow(
    positivePrompt: string,
    negativePrompt: string = "bad hands",
    options: {
      width?: number
      height?: number
      steps?: number
      cfg?: number
      seed?: number
      modelName?: string
      samplerName?: string
      scheduler?: string
    } = {}
  ): SimpleWorkflow {
    const {
      width = 512,
      height = 512,
      steps = 20,
      cfg = 8,
      seed = Math.floor(Math.random() * 1000000),
      modelName = "v1-5-pruned-emaonly.ckpt",
      samplerName = "euler",
      scheduler = "normal"
    } = options

    return {
      "3": {
        class_type: "KSampler",
        inputs: {
          cfg,
          denoise: 1,
          latent_image: ["5", 0],
          model: ["4", 0],
          negative: ["7", 0],
          positive: ["6", 0],
          sampler_name: samplerName,
          scheduler,
          seed,
          steps
        }
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: modelName
        }
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: {
          batch_size: 1,
          height,
          width
        }
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["4", 1],
          text: positivePrompt
        }
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["4", 1],
          text: negativePrompt
        }
      },
      "8": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["3", 0],
          vae: ["4", 2]
        }
      },
      "9": {
        class_type: "SaveImage",
        inputs: {
          filename_prefix: "tshirt_design",
          images: ["8", 0]
        }
      }
    }
  }

  /**
   * 提交工作流到队列
   */
  async queuePrompt(workflow: SimpleWorkflow): Promise<QueueResponse> {
    // 先找到可用的服务器
    const availableServer = await this.findAvailableServer()
    if (!availableServer) {
      throw new Error('没有可用的 ComfyUI 服务器')
    }

    const payload = { prompt: workflow }
    
    const response = await fetch(`${availableServer}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`ComfyUI 请求失败: ${response.status} ${response.statusText}`)
    }

  return response.json() as Promise<QueueResponse>
  }

  /**
   * 获取历史记录
   */
  async getHistory(promptId: string): Promise<HistoryResponse> {
    const response = await fetch(`${this.serverUrl}/history/${promptId}`)
    
    if (!response.ok) {
      throw new Error(`获取历史记录失败: ${response.status}`)
    }

    return response.json() as Promise<HistoryResponse>
  }

  /**
   * 获取图像
   */
  async getImage(filename: string, subfolder: string = "", type: string = "output"): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type
    })

    const response = await fetch(`${this.serverUrl}/view?${params}`)
    
    if (!response.ok) {
      throw new Error(`获取图像失败: ${response.status}`)
    }

    return response.arrayBuffer()
  }

  /**
   * 检查服务器连接
   */
  async checkConnection(): Promise<boolean> {
    const availableServer = await this.findAvailableServer()
    return availableServer !== null
  }

  /**
   * 获取当前活跃的服务器地址
   */
  getActiveServerUrl(): string | null {
    return this.activeUrl
  }

  /**
   * 等待生成完成
   */
  async waitForCompletion(promptId: string, timeoutMs: number = 300000): Promise<{
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
          
          // 检查是否完成
          if (item.status?.completed || item.outputs) {
            // 查找生成的图像
            for (const nodeId in item.outputs) {
              const output = item.outputs[nodeId]
              if (output.images && output.images.length > 0) {
                const image = output.images[0]
                return {
                  filename: image.filename,
                  subfolder: image.subfolder || ""
                }
              }
            }
          }
          
          // 检查是否有错误
          if (item.status?.status_str === 'error') {
            throw new Error(`生成失败: ${item.status.messages?.join(', ') || '未知错误'}`)
          }
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error) {
        if (error instanceof Error && error.message.includes('生成失败')) {
          throw error
        }
        // 继续轮询其他错误
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
    }

    throw new Error(`生成超时 (${timeoutMs}ms)`)
  }

  /**
   * 完整的生成流程
   */
  async generateImage(
    prompt: string,
    negativePrompt: string = "bad hands, low quality, blurry",
    options: {
      width?: number
      height?: number
      steps?: number
      cfg?: number
      seed?: number
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
    // 检查连接并找到可用服务器
    const isConnected = await this.checkConnection()
    if (!isConnected) {
      throw new Error('所有 ComfyUI 服务器均不可用（已尝试外网和本地服务器）')
    }

    console.log(`使用服务器: ${this.activeUrl}`)

    // 创建工作流
    const workflow = this.createWorkflow(prompt, negativePrompt, options)
    
    // 提交任务
    const queueResult = await this.queuePrompt(workflow)
    
    // 等待完成
    const result = await this.waitForCompletion(queueResult.prompt_id)
    
    // 获取图像
    const imageBuffer = await this.getImage(result.filename, result.subfolder)

    return {
      imageBuffer,
      filename: result.filename,
      metadata: {
        prompt,
        seed: workflow["3"].inputs.seed,
        steps: workflow["3"].inputs.steps
      }
    }
  }
}