import { type NextRequest, NextResponse } from "next/server"
import { SimpleComfyUIClient } from "@/lib/simple-comfyui-client"
import { writeFile } from "fs/promises"
import path from "path"

// 样式配置
const styleConfigs: Record<string, {
  negativePrompt: string
  steps: number
  cfg: number
  samplerName: string
  scheduler: string
}> = {
  realistic: {
    negativePrompt: "bad hands, low quality, blurry, ugly, deformed",
    steps: 25,
    cfg: 7.5,
    samplerName: "dpmpp_2m",
    scheduler: "karras"
  },
  cartoon: {
    negativePrompt: "realistic, photo, bad hands, low quality",
    steps: 20,
    cfg: 8.0,
    samplerName: "euler",
    scheduler: "normal"
  },
  anime: {
    negativePrompt: "realistic, photo, western, bad hands, low quality",
    steps: 20,
    cfg: 7.0,
    samplerName: "dpmpp_2m",
    scheduler: "karras"
  },
  abstract: {
    negativePrompt: "realistic, photo, figurative, bad quality",
    steps: 30,
    cfg: 9.0,
    samplerName: "euler_ancestral",
    scheduler: "normal"
  },
  minimalist: {
    negativePrompt: "complex, detailed, cluttered, busy, bad quality",
    steps: 15,
    cfg: 6.0,
    samplerName: "euler",
    scheduler: "normal"
  },
  vintage: {
    negativePrompt: "modern, futuristic, bad hands, low quality",
    steps: 25,
    cfg: 8.5,
    samplerName: "dpmpp_2m",
    scheduler: "karras"
  }
}

async function generateWithComfyUI(prompt: string, style: string): Promise<string> {
  // 环境检测和服务器配置
  const isProduction = process.env.NODE_ENV === 'production'
  // 支持多个服务器地址，用逗号分隔
  const comfyUIUrl = process.env.COMFYUI_URL || "http://82.157.19.21:8188,http://127.0.0.1:8188"
  
  console.log(`环境: ${isProduction ? '生产环境' : '开发环境'}`)
  console.log(`ComfyUI 配置: ${comfyUIUrl}`)
  console.log(`将按优先级自动尝试所有配置的服务器`)
  
  const client = new SimpleComfyUIClient(comfyUIUrl)

  // 检查连接（会自动尝试多个地址）
  try {
    const isConnected = await client.checkConnection()
    if (!isConnected) {
      throw new Error(`无法连接到任何 ComfyUI 服务器（已尝试外网和内网地址）`)
    }
    const activeServer = client.getActiveServerUrl()
    console.log(`✓ 成功连接到 ComfyUI 服务器: ${activeServer}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "未知连接错误"
    console.error(`✗ ComfyUI 连接失败: ${errorMessage}`)
    throw error
  }

  // 构建提示词（根据风格调整）
  let enhancedPrompt = prompt
  if (style === "photorealistic") {
    enhancedPrompt = `${prompt}, photorealistic, high quality, professional photography`
  } else if (style === "artistic") {
    enhancedPrompt = `${prompt}, artistic, creative, stylized illustration`
  } else if (style === "minimalist") {
    enhancedPrompt = `${prompt}, minimalist, clean, simple design`
  }

  // 使用简化的 generateImage 方法
  const result = await client.generateImage(
    enhancedPrompt,
    "bad hands, low quality, blurry, distorted",
    {
      width: 512,
      height: 512,
      steps: 20,
      cfg: 7
    }
  )

  // 将 ArrayBuffer 转换为 Base64 URL
  const imageBuffer = result.imageBuffer
  const base64 = Buffer.from(imageBuffer).toString('base64')
  const dataUrl = `data:image/png;base64,${base64}`

  return dataUrl
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, style = "realistic", width = 512, height = 512 } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    console.log(`正在生成图像，提示词: "${prompt}", 风格: "${style}"`)

    let imageUrl: string

    try {
      imageUrl = await generateWithComfyUI(prompt, style)
      
      return NextResponse.json({
        success: true,
        imageUrl,
        prompt,
        style,
        isPlaceholder: false
      })
      
    } catch (error) {
      console.warn("ComfyUI 生成失败，使用占位符:", error)
      
      // 提供更详细的错误信息
      let errorMessage = "未知错误"
      if (error instanceof Error) {
        errorMessage = error.message
      }
      
      // 回退到占位符图像
      const fallbackUrl = `/placeholder.svg?height=${height}&width=${width}&query=${encodeURIComponent(prompt)}`
      
      return NextResponse.json({
        success: true,
        imageUrl: fallbackUrl,
        prompt: `${prompt} (占位符)`,
        isPlaceholder: true,
        error: errorMessage
      })
    }

  } catch (error) {
    console.error("AI generation error:", error)
    return NextResponse.json(
      { 
        error: "生成图像失败",
        details: error instanceof Error ? error.message : "未知错误"
      }, 
      { status: 500 }
    )
  }
}

// 添加健康检查端点
export async function GET() {
  try {
    const isProduction = process.env.NODE_ENV === 'production'
  const comfyUIUrl = process.env.COMFYUI_URL || "http://82.157.19.21:8188,http://127.0.0.1:8188"
    const client = new SimpleComfyUIClient(comfyUIUrl)
    
    console.log(`健康检查 - 环境: ${isProduction ? '生产' : '开发'}`)
    
    const isAvailable = await client.checkConnection()
    const activeServer = client.getActiveServerUrl()
    const configuredServers = comfyUIUrl.split(',').map(s => s.trim())

    return NextResponse.json({
      status: "ok",
      environment: isProduction ? 'production' : 'development',
      comfyUIAvailable: isAvailable,
      configuredServers: configuredServers,
      activeServer: activeServer || '无可用服务器',
      message: isAvailable 
        ? `ComfyUI 连接正常 (使用: ${activeServer})` 
        : "所有配置的 ComfyUI 服务器均不可用"
    })
  } catch (error) {
    return NextResponse.json({
      status: "error",
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      comfyUIAvailable: false,
      error: error instanceof Error ? error.message : "未知错误",
      message: "ComfyUI 连接检查失败"
    })
  }
}
