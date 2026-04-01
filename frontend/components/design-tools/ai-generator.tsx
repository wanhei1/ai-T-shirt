"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sparkles, Loader2, Download, Palette } from "lucide-react"
import Link from "next/link"
import { useLanguage, type LanguageText } from "@/contexts/language-context"
import apiClient from "@/lib/api-client"

interface AIGeneratorProps {
  onImageGenerated: (imageUrl: string) => void
}

const promptSuggestions: LanguageText[] = [
  { zh: "彩色火焰喷吐的巨龙", en: "A majestic dragon breathing colorful flames" },
  { zh: "极简几何山脉风景", en: "Minimalist geometric mountain landscape" },
  { zh: "复古日落与椰树", en: "Vintage retro sunset with palm trees" },
  { zh: "鲜艳水彩抽象飞溅", en: "Abstract watercolor splash in vibrant colors" },
  { zh: "戴墨镜的可爱猫咪", en: "Cute cartoon cat wearing sunglasses" },
  { zh: "赛博朋克霓虹城市", en: "Cyberpunk neon city skyline" },
  { zh: "手绘植物花卉与叶子", en: "Hand-drawn botanical flowers and leaves" },
  { zh: "星空银河与行星", en: "Space galaxy with stars and planets" },
]

const styleOptions: Array<{ value: string; label: LanguageText; description: LanguageText }> = [
  { value: "realistic", label: { zh: "写实", en: "Realistic" }, description: { zh: "逼真的写实风格", en: "Photo-realistic style" } },
  { value: "cartoon", label: { zh: "卡通", en: "Cartoon" }, description: { zh: "轻松有趣的卡通风格", en: "Fun cartoon style" } },
  { value: "anime", label: { zh: "漫画", en: "Anime" }, description: { zh: "日系漫画风格", en: "Japanese anime style" } },
  { value: "abstract", label: { zh: "抽象", en: "Abstract" }, description: { zh: "抽象艺术风格", en: "Abstract art style" } },
  { value: "minimalist", label: { zh: "简约", en: "Minimalist" }, description: { zh: "干净极简设计", en: "Clean minimal design" } },
  { value: "vintage", label: { zh: "复古", en: "Vintage" }, description: { zh: "复古怀旧风", en: "Retro vintage look" } },
]

export function AIGenerator({ onImageGenerated }: AIGeneratorProps) {
  const { translate, language } = useLanguage()
  const [prompt, setPrompt] = useState("")
  const [style, setStyle] = useState("realistic")
  const [isGenerating, setIsGenerating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [generationProgress, setGenerationProgress] = useState("")
  const [queueHint, setQueueHint] = useState<string | null>(null)
  const [generationPercent, setGenerationPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState<null | "login" | "membership">(null)
  const [generatedImages, setGeneratedImages] = useState<Array<{ 
    url: string
    prompt: string
    style: string
    isPlaceholder?: boolean
    timestamp: number
  }>>([])
  const [advanced, setAdvanced] = useState({
    width: 768,
    height: 768,
    steps: 24,
    cfg: 8,
    seed: "",
    denoise: 1,
    modelName: "dreamshaper_8.safetensors",
    samplerName: "euler",
    scheduler: "normal",
    negativePrompt: "",
  })

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Failed to load generated image"))
      img.src = src
    })

  const removeBackgroundToTransparent = async (src: string): Promise<string> => {
    const img = await loadImage(src)
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return src

    ctx.drawImage(img, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    const pick = (x: number, y: number) => {
      const i = (y * width + x) * 4
      return [data[i], data[i + 1], data[i + 2]] as const
    }

    const samples = [
      pick(0, 0),
      pick(width - 1, 0),
      pick(0, height - 1),
      pick(width - 1, height - 1),
      pick(Math.floor(width / 2), 0),
      pick(Math.floor(width / 2), height - 1),
      pick(0, Math.floor(height / 2)),
      pick(width - 1, Math.floor(height / 2)),
    ]

    const avg = samples.reduce(
      (acc, [r, g, b]) => {
        acc.r += r
        acc.g += g
        acc.b += b
        return acc
      },
      { r: 0, g: 0, b: 0 }
    )
    const bg = {
      r: avg.r / samples.length,
      g: avg.g / samples.length,
      b: avg.b / samples.length,
    }

    const colorDistance = (r: number, g: number, b: number) => {
      const dr = r - bg.r
      const dg = g - bg.g
      const db = b - bg.b
      return Math.sqrt(dr * dr + dg * dg + db * db)
    }

    const tolerance = 44
    const visited = new Uint8Array(width * height)
    const queue = new Uint32Array(width * height)
    let head = 0
    let tail = 0

    const pushIfBg = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return
      const idx = y * width + x
      if (visited[idx]) return
      const i = idx * 4
      const a = data[i + 3]
      if (a === 0) {
        visited[idx] = 1
        return
      }
      if (colorDistance(data[i], data[i + 1], data[i + 2]) <= tolerance) {
        visited[idx] = 1
        queue[tail++] = idx
      }
    }

    for (let x = 0; x < width; x += 1) {
      pushIfBg(x, 0)
      pushIfBg(x, height - 1)
    }
    for (let y = 0; y < height; y += 1) {
      pushIfBg(0, y)
      pushIfBg(width - 1, y)
    }

    while (head < tail) {
      const idx = queue[head++]
      const x = idx % width
      const y = Math.floor(idx / width)
      const i = idx * 4
      data[i + 3] = 0

      pushIfBg(x + 1, y)
      pushIfBg(x - 1, y)
      pushIfBg(x, y + 1)
      pushIfBg(x, y - 1)
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL("image/png")
  }

  const generateImage = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setError(null)
    setQueueHint(null)
    setGenerationProgress("正在排队...")
    setGenerationPercent(5)
    
    try {
      setGenerationProgress("正在提交任务...")

      const jobResp = await apiClient.createJob({
        type: "ai-image",
        payload: {
          prompt,
          style,
          width: advanced.width,
          height: advanced.height,
          steps: advanced.steps,
          cfg: advanced.cfg,
          denoise: advanced.denoise,
          modelName: advanced.modelName,
          samplerName: advanced.samplerName,
          scheduler: advanced.scheduler,
          negativePrompt: advanced.negativePrompt || undefined,
          seed: advanced.seed.trim() ? Number.parseInt(advanced.seed, 10) : undefined,
        },
      })

      const queue = jobResp.queue
      const jobId = jobResp.jobId
      const waiting = jobResp.queueStats?.waiting ?? 0
      const active = jobResp.queueStats?.active ?? 0
      setQueueHint(
        translate({
          zh: `队列中等待 ${waiting} 个，处理中 ${active} 个`,
          en: `Queue waiting: ${waiting}, active: ${active}`,
        })
      )

      setGenerationProgress("任务已入队，等待执行...")

      while (true) {
        const status = await apiClient.getJobStatus(queue, jobId)
        const job = status.job
        const state = job?.state
        const progress = typeof job?.progress === "number" ? job.progress : 0

        if (progress > 0) {
          setGenerationPercent(Math.min(100, Math.max(progress, 5)))
        }

        if (state === "completed") {
          const imageUrl = job?.result?.imageUrl
          if (!imageUrl) {
            throw new Error("生成结果为空")
          }

          setGenerationProgress("正在去除背景...")
          const transparentImageUrl = await removeBackgroundToTransparent(imageUrl).catch(() => imageUrl)

          setErrorAction(null)
          setGenerationProgress("生成完成！")
          setGenerationPercent(100)

          const newImage = {
            url: transparentImageUrl,
            prompt,
            style,
            timestamp: Date.now(),
          }

          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem("designCategory", style)
            } catch {
              // ignore storage failures
            }
          }

          setGeneratedImages((prev) => [newImage, ...prev])
          setPrompt("")
          setQueueHint(null)
          break
        }

        if (state === "failed") {
          throw new Error(job?.failedReason || "生成失败")
        }

        setGenerationProgress(state === "active" ? "正在生成..." : "排队中...")
        await delay(1500)
      }
    } catch (error) {
      console.error("Generation error:", error)
      const err = error as Error & { status?: number }
      if (err?.status === 401) {
        setErrorAction("login")
      }
      if (err?.status === 403) {
        setErrorAction("membership")
      }
      const errorMessage = err instanceof Error ? err.message : "未知错误"
      setError(`生成失败: ${errorMessage}`)
      setGenerationProgress("")
      setGenerationPercent(0)
      setQueueHint(null)
    } finally {
      setIsGenerating(false)

      // 清除进度状态
      setTimeout(() => {
        setGenerationProgress("")
        setGenerationPercent(0)
      }, 3000)
    }
  }

  useEffect(() => {
    return () => {}
  }, [])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey && !isGenerating) {
      generateImage()
    }
  }

  const clearError = () => {
    setError(null)
    setErrorAction(null)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {translate({ zh: "AI 文生图", en: "AI Image Generator" })}
          </CardTitle>
          <CardDescription>
            {translate({ zh: "用文字描述你想要的图案，交给 AI 生成", en: "Describe your vision and let AI create it for you" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="ai-prompt">
              {translate({ zh: "描述你的设计", en: "Describe your design" })}
            </Label>
            <Textarea
              id="ai-prompt"
              placeholder={translate({ zh: "例如：彩色火焰喷吐的巨龙...", en: "A cool dragon breathing fire with vibrant colors..." })}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={3}
              className="mt-1"
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {translate({ zh: "按 Ctrl+Enter 生成", en: "Press Ctrl+Enter to generate" })}
            </p>
          </div>

          {/* 错误显示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
              <div className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{error}</p>

                {errorAction === "login" && (
                  <div className="mt-2">
                    <Button asChild size="sm" variant="outline" className="bg-transparent">
                      <Link href="/auth">去登录</Link>
                    </Button>
                  </div>
                )}

                {errorAction === "membership" && (
                  <div className="mt-2">
                    <Button asChild size="sm" variant="outline" className="bg-transparent">
                      <Link href="/membership">去开通会员</Link>
                    </Button>
                  </div>
                )}

                <button 
                  onClick={clearError}
                  className="text-xs text-red-600 hover:text-red-800 mt-1"
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              {translate({ zh: "风格", en: "Art Style" })}
            </Label>
            <Select
              value={style}
              onValueChange={(value) => {
                setStyle(value)
                if (typeof window !== "undefined") {
                  try {
                    window.localStorage.setItem("designCategory", value)
                  } catch {
                    // ignore storage failures
                  }
                }
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {styleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{translate(option.label)}</div>
                      <div className="text-xs text-muted-foreground">{translate(option.description)}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Button type="button" variant="outline" className="w-full" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced
                ? translate({ zh: "收起高级参数", en: "Hide Advanced Controls" })
                : translate({ zh: "展开高级参数", en: "Show Advanced Controls" })}
            </Button>

            {showAdvanced ? (
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                <div>
                  <Label>Width</Label>
                  <Input
                    type="number"
                    min={256}
                    max={1536}
                    step={64}
                    value={advanced.width}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, width: Number.parseInt(e.target.value || "768", 10) }))}
                  />
                </div>
                <div>
                  <Label>Height</Label>
                  <Input
                    type="number"
                    min={256}
                    max={1536}
                    step={64}
                    value={advanced.height}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, height: Number.parseInt(e.target.value || "768", 10) }))}
                  />
                </div>
                <div>
                  <Label>Steps</Label>
                  <Input
                    type="number"
                    min={1}
                    max={80}
                    value={advanced.steps}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, steps: Number.parseInt(e.target.value || "24", 10) }))}
                  />
                </div>
                <div>
                  <Label>CFG</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    step={0.5}
                    value={advanced.cfg}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, cfg: Number.parseFloat(e.target.value || "8") }))}
                  />
                </div>
                <div>
                  <Label>Denoise</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={advanced.denoise}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, denoise: Number.parseFloat(e.target.value || "1") }))}
                  />
                </div>
                <div>
                  <Label>Seed</Label>
                  <Input
                    type="text"
                    placeholder={translate({ zh: "留空随机", en: "Blank for random" })}
                    value={advanced.seed}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, seed: e.target.value.replace(/[^0-9]/g, "") }))}
                  />
                </div>
                <div>
                  <Label>Sampler</Label>
                  <Input
                    type="text"
                    value={advanced.samplerName}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, samplerName: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Scheduler</Label>
                  <Input
                    type="text"
                    value={advanced.scheduler}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, scheduler: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Model</Label>
                  <Input
                    type="text"
                    value={advanced.modelName}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, modelName: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label>
                    {translate({ zh: "负向提示词（可选）", en: "Negative Prompt (Optional)" })}
                  </Label>
                  <Input
                    type="text"
                    value={advanced.negativePrompt}
                    onChange={(e) => setAdvanced((prev) => ({ ...prev, negativePrompt: e.target.value }))}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <Button onClick={generateImage} disabled={!prompt.trim() || isGenerating} className="w-full">
            {isGenerating ? (
              <div className="w-full flex items-center gap-3">
                <Progress value={generationPercent} className="flex-1" />
                <span className="text-sm tabular-nums w-12 text-right">{generationPercent}%</span>
              </div>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {translate({ zh: "生成图片", en: "Generate Image" })}
              </>
            )}
          </Button>

          {isGenerating && queueHint ? (
            <div className="text-xs text-muted-foreground bg-background/80 border border-border rounded px-2 py-1">
              {queueHint}
            </div>
          ) : null}

          <div>
            <Label className="text-sm">{translate({ zh: "快速灵感：", en: "Quick Ideas:" })}</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {promptSuggestions.slice(0, 4).map((suggestion, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                  onClick={() => setPrompt(translate(suggestion))}
                >
                  {translate(suggestion)}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {generatedImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {translate({ zh: "生成结果", en: "Generated Images" })}
            </CardTitle>
            <CardDescription>
              {translate({ zh: "点击图片添加到设计", en: "Click to add to your design" })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {generatedImages.map((image, index) => (
                <div
                  key={index}
                  className="relative group cursor-pointer border-2 border-transparent hover:border-primary rounded-lg overflow-hidden"
                  onClick={() => onImageGenerated(image.url)}
                >
                  <img
                    src={image.url || "/placeholder.svg"}
                    alt={image.prompt}
                    className="w-full aspect-square object-cover"
                  />
                  {image.isPlaceholder && (
                    <div className="absolute top-2 right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded">
                      占位符
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Download className="w-6 h-6 text-white" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="font-medium">
                      {translate(styleOptions.find((opt) => opt.value === image.style)?.label || { zh: image.style, en: image.style })}
                    </div>
                    <div>{image.prompt.slice(0, 40)}...</div>
                    {image.isPlaceholder && (
                      <div className="text-yellow-200">{translate({ zh: "ComfyUI 不可用", en: "ComfyUI unavailable" })}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
