import { NextResponse } from 'next/server'

export async function GET() {
  const comfyUIUrl = process.env.COMFYUI_URL || "http://82.157.19.21:8188,http://127.0.0.1:8188"
  
  // 解析配置的服务器地址（支持逗号分隔）
  const configuredServers = comfyUIUrl.split(',').map(url => url.trim())
  
  // 添加默认的本地服务器（如果未在配置中）
  const serversToTest = [
    ...configuredServers,
  "http://127.0.0.1:8188",
  "http://localhost:8188"
  ]
  
  // 去重
  const uniqueServers = Array.from(new Set(serversToTest))

  const results = []

  // 测试所有服务器
  for (const testUrl of uniqueServers) {
    try {
      console.log(`Testing connection to: ${testUrl}`)
      
      const response = await fetch(`${testUrl}/queue`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Vercel-ComfyUI-Test/1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      })

      const responseText = await response.text()
      
      results.push({
        url: testUrl,
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        responsePreview: responseText.substring(0, 200)
      })

      // 如果找到可用的服务器，优先返回它
      if (response.ok) {
        console.log(`✓ Successfully connected to: ${testUrl}`)
      }

    } catch (error) {
      console.error(`✗ Connection failed for ${testUrl}:`, error)
      
      results.push({
        url: testUrl,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  // 找出第一个成功的服务器
  const availableServer = results.find(r => r.success)

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    vercelRegion: process.env.VERCEL_REGION || 'unknown',
    nodeVersion: process.version,
    configuredServers: configuredServers,
    availableServer: availableServer?.url || null,
    allResults: results,
    summary: {
      total: uniqueServers.length,
      available: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  })
}