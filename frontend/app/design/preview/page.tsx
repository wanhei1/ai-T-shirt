"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import apiClient from '@/lib/api-client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Download, Share2, ShoppingCart, Palette, RotateCcw, Check } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/contexts/language-context"
import { buildCanvasMeta, CANVAS_SIZE, getShirtColorHex, getShirtPhotoSrc } from "@/lib/design-canvas"
import type { DesignData, DesignElement, CanvasMeta } from "@/types/design"

export default function PreviewPage() {
  const router = useRouter()
  const { translate } = useLanguage()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [designData, setDesignData] = useState<DesignData | null>(null)
  const [currentView, setCurrentView] = useState<"front" | "back">("front")
  const [isExporting, setIsExporting] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tryOnPersonFile, setTryOnPersonFile] = useState<File | null>(null)
  const [tryOnImageUrl, setTryOnImageUrl] = useState<string | null>(null)
  const [tryOnError, setTryOnError] = useState<string | null>(null)
  const [isTryOnLoading, setIsTryOnLoading] = useState(false)

  const resolvedCanvasMeta: CanvasMeta = useMemo(() => {
    if (designData?.canvas) return designData.canvas
    return buildCanvasMeta(designData?.selections?.color)
  }, [designData])

  const shirtFill = useMemo(() => getShirtColorHex(designData?.selections?.color), [designData])
  const shirtPhotoSrc = useMemo(() => getShirtPhotoSrc(designData?.selections?.color), [designData])

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = src
    })

  const renderSnapshot = async (side: "front" | "back") => {
    if (!designData) return null

    const meta = resolvedCanvasMeta
    const canvas = document.createElement("canvas")
    const scale = 2
    canvas.width = meta.width * scale
    canvas.height = meta.height * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    // Background behind the shirt silhouette
    ctx.fillStyle = meta.backgroundColor || "#f8fafc"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw shirt base: prefer real photo (black/white). Fallback to SVG silhouette.
    if (shirtPhotoSrc) {
      try {
        const base = await loadImage(shirtPhotoSrc)
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height)
      } catch (error) {
        console.warn("Failed to load shirt base image, falling back to SVG", error)
        ctx.save()
        ctx.scale((meta.width * scale) / 200, (meta.height * scale) / 200)
        const shirtPath = new Path2D(
          "M70 30 L90 30 Q100 50 110 30 L130 30 Q145 30 150 45 L175 75 L155 95 L155 165 L45 165 L45 95 L25 75 L50 45 Q55 30 70 30 Z"
        )
        ctx.fillStyle = shirtFill || "#e5e7eb"
        ctx.strokeStyle = "#444"
        ctx.lineWidth = 4 / scale // keep stroke similar after scaling
        ctx.lineJoin = "round"
        ctx.lineCap = "round"
        ctx.fill(shirtPath)
        ctx.stroke(shirtPath)
        ctx.restore()
      }
    } else {
      ctx.save()
      ctx.scale((meta.width * scale) / 200, (meta.height * scale) / 200)
      const shirtPath = new Path2D(
        "M70 30 L90 30 Q100 50 110 30 L130 30 Q145 30 150 45 L175 75 L155 95 L155 165 L45 165 L45 95 L25 75 L50 45 Q55 30 70 30 Z"
      )
      ctx.fillStyle = shirtFill || "#e5e7eb"
      ctx.strokeStyle = "#444"
      ctx.lineWidth = 4 / scale // keep stroke similar after scaling
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.fill(shirtPath)
      ctx.stroke(shirtPath)
      ctx.restore()
    }

    // Clip and render elements inside the print area
    ctx.save()
    ctx.translate(meta.printArea.x * scale, meta.printArea.y * scale)
    ctx.beginPath()
    ctx.rect(0, 0, meta.printArea.width * scale, meta.printArea.height * scale)
    ctx.clip()

    const elements = (designData.elements || []).filter((el) => el.visible && el.side === side)
    for (const element of elements) {
      ctx.save()
      ctx.translate((element.x + element.width / 2) * scale, (element.y + element.height / 2) * scale)
      ctx.rotate((element.rotation * Math.PI) / 180)
      ctx.translate((-element.width / 2) * scale, (-element.height / 2) * scale)

      if (element.type === "text") {
        ctx.fillStyle = element.color || "#111827"
        ctx.font = `${element.fontSize || 24}px ${element.fontFamily || "Arial"}`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(element.content, (element.width * scale) / 2, (element.height * scale) / 2, element.width * scale)
      } else if (element.content) {
        try {
          const img = await loadImage(element.content)
          ctx.drawImage(img, 0, 0, element.width * scale, element.height * scale)
        } catch (error) {
          console.warn("Skip image in snapshot", error)
        }
      }

      ctx.restore()
    }

    ctx.restore()
    return canvas.toDataURL("image/png")
  }

  const estimatedTotal = useMemo(() => {
    if (!designData) return 0
    return Number((designData.selections.price + 5 + 7.99).toFixed(2))
  }, [designData])

  useEffect(() => {
    const storedDesignData = localStorage.getItem("designData")
    if (storedDesignData) {
      try {
        const parsed = JSON.parse(storedDesignData) as DesignData
        if (!parsed.canvas) {
          parsed.canvas = buildCanvasMeta(parsed?.selections?.color)
        }
        setDesignData(parsed)
      } catch (error) {
        console.error("Failed to parse design data", error)
      }
    }
  }, [])

  const exportDesign = async () => {
    if (!designData) return

    setIsExporting(true)
    try {
      const snapshot = await renderSnapshot(currentView)
      if (!snapshot) return

      const a = document.createElement("a")
      a.href = snapshot
      a.download = `custom-tshirt-${currentView}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(false)
    }
  }

  const shareDesign = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: translate({ zh: "看看我的定制 T 恤设计！", en: "Check out my custom T-shirt design!" }),
          text: translate({ zh: "我在 yituai 上创建了这个很棒的设计", en: "I created this awesome design on yituai" }),
          url: window.location.href,
        })
      } catch (error) {
        console.error("Share failed:", error)
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href)
      alert(translate({ zh: "设计链接已复制到剪贴板！", en: "Design link copied to clipboard!" }))
    }
  }

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const [header, base64] = dataUrl.split(",")
    const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png"
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: mime })
  }

  const runTryOn = async () => {
    if (!designData) return
    if (!tryOnPersonFile) {
      setTryOnError(translate({ zh: "请先上传一张模特照片", en: "Please upload a model photo first" }))
      return
    }

    setIsTryOnLoading(true)
    setTryOnError(null)

    try {
      const clothSnapshot = await renderSnapshot(currentView)
      if (!clothSnapshot) {
        throw new Error("无法生成衣服快照")
      }

      const form = new FormData()
      form.append("person", tryOnPersonFile)
      form.append("cloth", dataUrlToBlob(clothSnapshot), `cloth-${currentView}.png`)

      const resp = await fetch("/api/virtual-tryon", {
        method: "POST",
        body: form,
      })

      const json = (await resp.json().catch(() => null)) as
        | { success?: boolean; imageUrl?: string; error?: string; details?: string }
        | null

      if (!resp.ok || !json?.success || !json.imageUrl) {
        const msg = json?.details || json?.error || "试穿失败"
        throw new Error(msg)
      }

      setTryOnImageUrl(json.imageUrl)
    } catch (error) {
      setTryOnImageUrl(null)
      setTryOnError(error instanceof Error ? error.message : "试穿失败")
    } finally {
      setIsTryOnLoading(false)
    }
  }

  const placeOrder = async () => {
    // In a real implementation, this would integrate with a payment system.
    if (!designData) return;

    const token =
      (typeof window !== "undefined" &&
        (localStorage.getItem("authToken") || localStorage.getItem("token"))) ||
      null;
    if (!token) {
      alert(translate({ zh: "请先登录后再下单", en: "Please log in before placing an order" }));
      router.push("/auth");
      return;
    }

    const total = estimatedTotal;

    try {
      setIsSubmitting(true)

      const [frontSnapshot, backSnapshot] = await Promise.all([
        renderSnapshot("front"),
        renderSnapshot("back"),
      ])

      const canvasForSave: CanvasMeta = {
        ...resolvedCanvasMeta,
        snapshots: { front: frontSnapshot, back: backSnapshot },
      }

      const payload = {
        total,
        // Save full element layout info (position/size/rotation/side/etc) so the order can be faithfully reproduced.
        items: designData.elements,
        selections: designData.selections,
        design: { ...designData, canvas: canvasForSave },
        canvas: { frontSnapshot, backSnapshot, meta: resolvedCanvasMeta },
        publishToAll: true,
        sourceAllId: null,
        shipping_info: {}
      };

      await apiClient.createOrder(payload);
      setOrderPlaced(true);
      setTimeout(() => {
        router.push("/profile");
      }, 2000);
    } catch (error) {
      console.error('Order submission failed:', error)
      const status = (error as { status?: number })?.status
      const message = (error as Error)?.message || ""
      if (status === 401 || status === 403 || message.includes("authenticate token")) {
        alert(translate({ zh: "登录已失效，请重新登录", en: "Session expired, please sign in again." }))
        router.push("/auth")
        return
      }
      alert(translate({ zh: "下单失败，请重试", en: "Failed to place order. Please try again." }))
    } finally {
      setIsSubmitting(false)
    }
  }

  const goBackToEditor = () => {
    router.push("/design/editor")
  }

  if (!designData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No design data found</p>
          <Button asChild>
            <Link href="/design">Start New Design</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto text-center">
          <CardContent className="pt-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Order Placed!</h2>
            <p className="text-muted-foreground mb-4">
              Thank you for your order. You’ll receive a confirmation email shortly.
            </p>
            <p className="text-sm text-muted-foreground">Redirecting to homepage...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={goBackToEditor}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {translate({ zh: "返回编辑器", en: "Back to Editor" })}
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">yituai</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {translate({ zh: "第 3 步 / 共 3 步", en: "Step 3 of 3" })}
            </Badge>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={shareDesign}>
                <Share2 className="w-4 h-4 mr-2" />
                {translate({ zh: "分享", en: "Share" })}
              </Button>
              <Button variant="outline" onClick={exportDesign} disabled={isExporting}>
                <Download className="w-4 h-4 mr-2" />
                {isExporting
                  ? translate({ zh: "导出中...", en: "Exporting..." })
                  : translate({ zh: "导出", en: "Export" })}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              {translate({ zh: "预览您的设计", en: "Preview Your Design" })}
            </h1>
            <p className="text-xl text-muted-foreground">
              {translate({
                zh: "在下单前查看您的定制 T 恤",
                en: "Review your custom T-shirt before placing your order",
              })}
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Design Preview */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      {translate({ zh: "设计预览", en: "Design Preview" })}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={currentView === "front" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentView("front")}
                      >
                        {translate({ zh: "前面", en: "Front" })}
                      </Button>
                      <Button
                        variant={currentView === "back" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentView("back")}
                      >
                        {translate({ zh: "背面", en: "Back" })}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-w-md mx-auto flex justify-center">
                    <div
                      ref={canvasRef}
                      className="relative select-none border-2 border-border rounded-lg shadow-lg"
                      style={{ width: CANVAS_SIZE.width, height: CANVAS_SIZE.height }}
                    >
                      {shirtPhotoSrc ? (
                        <img
                          src={shirtPhotoSrc}
                          alt={translate({ zh: "T 恤底图", en: "T-shirt base" })}
                          className="absolute inset-0 w-full h-full object-contain"
                        />
                      ) : (
                        <svg aria-hidden viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" role="presentation">
                          <path
                            d="M70 30 L90 30 Q100 50 110 30 L130 30 Q145 30 150 45 L175 75 L155 95 L155 165 L45 165 L45 95 L25 75 L50 45 Q55 30 70 30 Z"
                            fill={shirtFill}
                            stroke="#444"
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}

                      <div
                        className="absolute overflow-hidden"
                        style={{
                          left: resolvedCanvasMeta.printArea.x,
                          top: resolvedCanvasMeta.printArea.y,
                          width: resolvedCanvasMeta.printArea.width,
                          height: resolvedCanvasMeta.printArea.height,
                        }}
                      >

                        {designData.elements
                          .filter((el) => el.visible && el.side === currentView)
                          .map((element) => (
                            <div
                              key={element.id}
                              className="absolute"
                              style={{
                                left: element.x,
                                top: element.y,
                                width: element.width,
                                height: element.height,
                                transform: `rotate(${element.rotation}deg)`,
                              }}
                            >
                              {element.type === "text" ? (
                                <div
                                  className="w-full h-full flex items-center justify-center text-center break-words"
                                  style={{
                                    fontSize: element.fontSize,
                                    fontFamily: element.fontFamily,
                                    color: element.color,
                                  }}
                                >
                                  {element.content}
                                </div>
                              ) : (
                                <img
                                  src={element.content || "/placeholder.svg"}
                                  alt="Design element"
                                  className="w-full h-full object-contain"
                                />
                              )}
                            </div>
                          ))}

                        {designData.elements.filter((el) => el.side === currentView).length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                              <RotateCcw className="w-12 h-12 mx-auto mb-4 opacity-50" />
                              <p className="text-sm">
                                {translate({
                                  zh: currentView === "front" ? "前视图" : "后视图",
                                  en: currentView === "front" ? "Front view" : "Back view",
                                })}
                              </p>
                              <p className="text-xs">
                                {translate({ zh: "此面没有设计元素", en: "No design elements on this side" })}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Design Elements List */}
              {designData.elements.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {translate({ zh: "设计元素", en: "Design Elements" })}
                    </CardTitle>
                    <CardDescription>
                      {translate({
                        zh: `${currentView === "front" ? "前面" : "背面"}的元素 (${designData.elements.filter((el) => el.side === currentView).length} 项)`,
                        en: `Elements on ${currentView} side (${designData.elements.filter((el) => el.side === currentView).length} items)`,
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {designData.elements
                        .filter((el) => el.side === currentView) // Only show elements for current side
                        .map((element, index) => (
                          <div key={element.id} className="flex items-center gap-3 p-3 border border-border rounded-lg">
                            <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-xs font-medium">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {element.type === "text"
                                  ? translate({ zh: "文字", en: "Text" })
                                  : element.type === "ai-generated"
                                    ? translate({ zh: "AI 生成", en: "AI Generated" })
                                    : translate({ zh: "图片", en: "Image" })}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {element.type === "text"
                                  ? element.content
                                  : translate({ zh: "自定义图片", en: "Custom image" })}
                              </p>
                            </div>
                            <Badge variant={element.visible ? "default" : "secondary"}>
                              {element.visible
                                ? translate({ zh: "可见", en: "Visible" })
                                : translate({ zh: "隐藏", en: "Hidden" })}
                            </Badge>
                          </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>
                          {translate({ zh: "前面元素", en: "Front elements" })}:{" "}
                          {designData.elements.filter((el) => el.side === "front").length}
                        </span>
                        <span>
                          {translate({ zh: "背面元素", en: "Back elements" })}:{" "}
                          {designData.elements.filter((el) => el.side === "back").length}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Order Summary */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {translate({ zh: "订单摘要", en: "Order Summary" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {translate({ zh: "版型：", en: "Style:" })}
                      </span>
                      <span className="font-medium">{designData.selections.style}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {translate({ zh: "颜色：", en: "Color:" })}
                      </span>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border"
                          style={{
                            backgroundColor: getShirtColorHex(designData.selections.color),
                          }}
                        />
                        <span className="font-medium capitalize">{designData.selections.color}</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {translate({ zh: "尺码：", en: "Size:" })}
                      </span>
                      <span className="font-medium">{designData.selections.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {translate({ zh: "设计元素：", en: "Design Elements:" })}
                      </span>
                      <span className="font-medium">
                        {translate({
                          zh: `${designData.elements.filter((el) => el.side === "front").length} 前, ${designData.elements.filter((el) => el.side === "back").length} 后`,
                          en: `${designData.elements.filter((el) => el.side === "front").length} front, ${designData.elements.filter((el) => el.side === "back").length} back`,
                        })}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>{translate({ zh: "基础价格：", en: "Base Price:" })}</span>
                      <span>${designData.selections.price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{translate({ zh: "设计费：", en: "Design Fee:" })}</span>
                      <span>$5.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{translate({ zh: "运费：", en: "Shipping:" })}</span>
                      <span>$7.99</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>{translate({ zh: "总计：", en: "Total:" })}</span>
                      <span>${estimatedTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{translate({ zh: "模特试穿", en: "Virtual Try-On" })}</CardTitle>
                  <CardDescription>
                    {translate({
                      zh: "上传模特照片，使用当前视角的衣服设计进行试穿预览",
                      en: "Upload a model photo and preview try-on with the current view design",
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      {translate({ zh: "模特照片", en: "Model photo" })}
                    </div>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null
                        setTryOnPersonFile(f)
                        setTryOnImageUrl(null)
                        setTryOnError(null)
                      }}
                    />
                  </div>

                  <Button onClick={runTryOn} className="w-full" disabled={isTryOnLoading || !tryOnPersonFile}>
                    {isTryOnLoading
                      ? translate({ zh: "生成中...", en: "Generating..." })
                      : translate({ zh: "生成试穿图", en: "Generate Try-On" })}
                  </Button>

                  {tryOnError ? <p className="text-sm text-destructive">{tryOnError}</p> : null}

                  {tryOnImageUrl ? (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        {translate({ zh: "试穿结果", en: "Result" })}
                      </div>
                      <img src={tryOnImageUrl} alt="tryon" className="w-full rounded-lg border border-border" />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {translate({ zh: "准备下单？", en: "Ready to Order?" })}
                  </CardTitle>
                  <CardDescription>
                    {translate({
                      zh: "您的定制 T 恤将在 3-5 个工作日内打印并发货",
                      en: "Your custom T-shirt will be printed and shipped within 3-5 business days",
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" onClick={goBackToEditor} className="w-full bg-transparent">
                      {translate({ zh: "编辑设计", en: "Edit Design" })}
                    </Button>
                    <Button
                      onClick={exportDesign}
                      variant="outline"
                      disabled={isExporting}
                      className="w-full bg-transparent"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {translate({ zh: "导出", en: "Export" })}
                    </Button>
                  </div>
                  <Button onClick={placeOrder} size="lg" className="w-full" disabled={isSubmitting}>
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    {isSubmitting
                      ? translate({ zh: "下单中...", en: "Placing order..." })
                      : translate({
                          zh: `下单 - $${estimatedTotal.toFixed(2)}`,
                          en: `Place Order - $${estimatedTotal.toFixed(2)}`,
                        })}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    {translate({
                      zh: "下单即表示您同意我们的服务条款和隐私政策",
                      en: "By placing this order, you agree to our Terms of Service and Privacy Policy",
                    })}
                  </p>
                </CardContent>
              </Card>

              {/* Satisfaction Guarantee */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Check className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">100% Satisfaction Guarantee</h3>
                    <p className="text-sm text-muted-foreground">
                      Not happy with your order? We’ll make it right or give you a full refund.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
