import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const comfyUIUrl = process.env.COMFYUI_URL || "http://82.157.19.21:8188"
  const testUrl = comfyUIUrl.startsWith('http') ? comfyUIUrl : `http://${comfyUIUrl}`

  try {
    console.log(`Testing connection to: ${testUrl}`)
    
    // 测试基本连接
    const response = await fetch(`${testUrl}/queue`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Vercel-ComfyUI-Test/1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    })

    const responseText = await response.text()
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: testUrl,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText,
      timestamp: new Date().toISOString(),
      vercelRegion: process.env.VERCEL_REGION || 'unknown',
      nodeVersion: process.version
    })

  } catch (error) {
    console.error('Connection test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      url: testUrl,
      timestamp: new Date().toISOString(),
      vercelRegion: process.env.VERCEL_REGION || 'unknown',
      nodeVersion: process.version
    }, { status: 500 })
  }
}