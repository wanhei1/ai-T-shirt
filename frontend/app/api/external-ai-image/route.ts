import { type NextRequest, NextResponse } from "next/server"

/**
 * Proxy route for external AI image generation APIs.
 * Supports OpenAI-compatible and Anthropic formats.
 * Avoids CORS issues by making the request server-side.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, baseUrl, apiKey, model, prompt, width, height } = body

    if (!apiKey || !prompt) {
      return NextResponse.json({ error: "apiKey and prompt are required" }, { status: 400 })
    }

    const base = (baseUrl || "").trim().replace(/\/+$/, "")

    if (provider === "openai") {
      // OpenAI-compatible /v1/images/generations
      const url = `${base}/v1/images/generations`
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "dall-e-3",
          prompt,
          n: 1,
          size: `${width || 1024}x${height || 1024}`,
          response_format: "b64_json",
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "")
        return NextResponse.json(
          { error: `OpenAI API error ${resp.status}`, details: errBody.slice(0, 500) },
          { status: resp.status }
        )
      }

      const data = (await resp.json()) as {
        data: Array<{ b64_json?: string; url?: string }>
      }
      const item = data.data?.[0]
      if (item?.b64_json) {
        return NextResponse.json({ imageUrl: `data:image/png;base64,${item.b64_json}` })
      }
      if (item?.url) {
        return NextResponse.json({ imageUrl: item.url })
      }
      return NextResponse.json({ error: "API returned no image data" }, { status: 502 })
    }

    if (provider === "anthropic") {
      // Anthropic Messages API
      const url = `${base}/v1/messages`
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `Generate an image with this description for a t-shirt design: ${prompt}. Return ONLY the base64 encoded image data as a data URL, nothing else.`,
            },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "")
        return NextResponse.json(
          { error: `Anthropic API error ${resp.status}`, details: errBody.slice(0, 500) },
          { status: resp.status }
        )
      }

      const data = (await resp.json()) as {
        content: Array<{
          type: string
          text?: string
          source?: { type: string; media_type: string; data: string }
        }>
      }

      for (const block of data.content || []) {
        if (block.type === "image" && block.source?.data) {
          return NextResponse.json({
            imageUrl: `data:${block.source.media_type || "image/png"};base64,${block.source.data}`,
          })
        }
        if (block.type === "text" && block.text) {
          const match = block.text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
          if (match) {
            return NextResponse.json({ imageUrl: match[0] })
          }
        }
      }

      return NextResponse.json(
        { error: "Anthropic API returned no image. Check if model supports image generation." },
        { status: 502 }
      )
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
  } catch (error) {
    console.error("External AI image proxy error:", error)
    return NextResponse.json(
      {
        error: "External AI image generation failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
