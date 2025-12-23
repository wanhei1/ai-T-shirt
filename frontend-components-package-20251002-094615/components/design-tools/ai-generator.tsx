"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sparkles, Loader2, Download, Palette } from "lucide-react"
import { ComfyUIStatusCard } from "@/components/comfyui-status-card"

interface AIGeneratorProps {
  onImageGenerated: (imageUrl: string) => void
}

const promptSuggestions = [
  "A majestic dragon breathing colorful flames",
  "Minimalist geometric mountain landscape",
  "Vintage retro sunset with palm trees",
  "Abstract watercolor splash in vibrant colors",
  "Cute cartoon cat wearing sunglasses",
  "Cyberpunk neon city skyline",
  "Hand-drawn botanical flowers and leaves",
  "Space galaxy with stars and planets",
]

const styleOptions = [
  { value: "realistic", label: "Realistic", description: "Photo-realistic style" },
  { value: "cartoon", label: "Cartoon", description: "Fun cartoon style" },
  { value: "anime", label: "Anime", description: "Japanese anime style" },
  { value: "abstract", label: "Abstract", description: "Abstract art style" },
  { value: "minimalist", label: "Minimalist", description: "Clean minimal design" },
  { value: "vintage", label: "Vintage", description: "Retro vintage look" },
]

export function AIGenerator({ onImageGenerated }: AIGeneratorProps) {
  const [prompt, setPrompt] = useState("")
  const [style, setStyle] = useState("realistic")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [generatedImages, setGeneratedImages] = useState<Array<{ 
    url: string
    prompt: string
    style: string
    isPlaceholder?: boolean
    timestamp: number
  }>>([])

  const generateImage = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setError(null)
    setGenerationProgress("正在准备生成...")
    
    try {
      setGenerationProgress("正在发送请求到服务器...")
      
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, style }),
      })

      setGenerationProgress("正在处理响应...")

      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        setGenerationProgress("生成完成！")
        
        const newImage = { 
          url: data.imageUrl, 
          prompt: data.prompt, 
          style,
          isPlaceholder: data.isPlaceholder,
          timestamp: Date.now()
        }
        setGeneratedImages((prev) => [newImage, ...prev])
        setPrompt("")
        
        // 如果是占位符，显示警告
        if (data.isPlaceholder) {
          setError(`ComfyUI 不可用，显示占位符图像。错误: ${data.error || '未知错误'}`)
        }
      } else {
        throw new Error(data.error || data.details || "生成失败")
      }
    } catch (error) {
      console.error("Generation error:", error)
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      setError(`生成失败: ${errorMessage}`)
      setGenerationProgress("")
    } finally {
      setIsGenerating(false)
      // 清除进度状态
      setTimeout(() => {
        setGenerationProgress("")
      }, 3000)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey && !isGenerating) {
      generateImage()
    }
  }

  const clearError = () => {
    setError(null)
  }

  return (
    <div className="space-y-4">
      {/* ComfyUI 状态卡片 */}
      <ComfyUIStatusCard />
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI Image Generator
          </CardTitle>
          <CardDescription>Describe your vision and let AI create it for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="ai-prompt">Describe your design</Label>
            <Textarea
              id="ai-prompt"
              placeholder="A cool dragon breathing fire with vibrant colors..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={3}
              className="mt-1"
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground mt-1">Press Ctrl+Enter to generate</p>
          </div>

          {/* 错误显示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
              <div className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{error}</p>
                <button 
                  onClick={clearError}
                  className="text-xs text-red-600 hover:text-red-800 mt-1"
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {/* 进度显示 */}
          {isGenerating && generationProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <p className="text-sm text-blue-700">{generationProgress}</p>
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Art Style
            </Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {styleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={generateImage} disabled={!prompt.trim() || isGenerating} className="w-full">
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {generationProgress || "生成中..."}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Image
              </>
            )}
          </Button>

          <div>
            <Label className="text-sm">Quick Ideas:</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {promptSuggestions.slice(0, 4).map((suggestion, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                  onClick={() => setPrompt(suggestion)}
                >
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {generatedImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generated Images</CardTitle>
            <CardDescription>Click to add to your design</CardDescription>
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
                    <div className="font-medium">{image.style}</div>
                    <div>{image.prompt.slice(0, 40)}...</div>
                    {image.isPlaceholder && (
                      <div className="text-yellow-200">ComfyUI 不可用</div>
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
