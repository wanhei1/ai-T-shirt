import { type NextRequest, NextResponse } from "next/server"

const apiUrlsString = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8189"
const potentialApiUrls = apiUrlsString
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean)

let determinedApiBaseUrl: string | null = null

async function getBackendBaseUrl(): Promise<string> {
  if (determinedApiBaseUrl) return determinedApiBaseUrl

  for (const baseUrl of potentialApiUrls) {
    try {
      const healthUrl = new URL("/health", baseUrl).toString()
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      })
      if (response.ok) {
        determinedApiBaseUrl = baseUrl
        return baseUrl
      }
    } catch {
      // ignore and try next
    }
  }

  determinedApiBaseUrl = potentialApiUrls[0] || "http://localhost:8189"
  return determinedApiBaseUrl
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, style = "realistic", width = 512, height = 512 } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const baseUrl = await getBackendBaseUrl()
    const authHeader = request.headers.get("authorization") || ""
    const response = await fetch(new URL("/api/jobs", baseUrl).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        type: "ai-image",
        payload: { prompt, style, width, height },
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await response.json().catch(() => null)
    return NextResponse.json(data || { error: "Backend unavailable" }, { status: response.status })
  } catch (error) {
    console.error("AI generation error:", error)
    return NextResponse.json(
      {
        error: "生成图像失败",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    )
  }
}
