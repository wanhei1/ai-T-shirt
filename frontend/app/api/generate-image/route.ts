import { type NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, checkRateLimit } from "@/lib/api-auth";

const apiUrlsString = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8189";
const potentialApiUrls = apiUrlsString
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

let determinedApiBaseUrl: string | null = null;

async function getBackendBaseUrl(): Promise<string> {
  if (determinedApiBaseUrl) return determinedApiBaseUrl;

  for (const baseUrl of potentialApiUrls) {
    try {
      const healthUrl = new URL("/health", baseUrl).toString();
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      if (response.ok) {
        determinedApiBaseUrl = baseUrl;
        return baseUrl;
      }
    } catch {
      // ignore and try next
    }
  }

  determinedApiBaseUrl = potentialApiUrls[0] || "http://localhost:8189";
  return determinedApiBaseUrl;
}

export async function POST(request: NextRequest) {
  try {
    // ✅ 安全修复：必须登录才能生成图片
    const user = await requireAuth(request);

    // ✅ 安全修复：IP 速率限制 (10次/分钟)
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(`gen:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "生成请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const {
      prompt,
      style = "realistic",
      width = 768,
      height = 768,
      steps,
      cfg,
      seed,
      denoise,
      modelName,
      samplerName,
      scheduler,
      negativePrompt,
    } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const baseUrl = await getBackendBaseUrl();
    // ✅ 安全修复：始终传递 Authorization header
    const authHeader = request.headers.get("authorization") || "";
    const response = await fetch(new URL("/api/jobs", baseUrl).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        type: "ai-image",
        payload: {
          prompt,
          style,
          width,
          height,
          steps,
          cfg,
          seed,
          denoise,
          modelName,
          samplerName,
          scheduler,
          negativePrompt,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json().catch(() => null);
    return NextResponse.json(data || { error: "Backend unavailable" }, { status: response.status });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("AI generation error:", error);
    return NextResponse.json(
      {
        error: "生成图像失败",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}
