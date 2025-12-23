"use client"

import { useState, useEffect, useRef } from "react"
import apiClient from '@/lib/api-client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Download, Share2, ShoppingCart, Palette, RotateCcw, Check } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/contexts/language-context"

interface DesignElement {
  id: string
  type: "text" | "image" | "ai-generated"
  content: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fontSize?: number
  fontFamily?: string
  color?: string
  visible: boolean
  side: "front" | "back" // Added side property to track which side the element belongs to
}

interface TShirtSelections {
  style: string
  color: string
  size: string
  price: number
}

interface DesignData {
  selections: TShirtSelections
  elements: DesignElement[]
  side: string
}

export default function PreviewPage() {
  const router = useRouter()
  const { translate } = useLanguage()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [designData, setDesignData] = useState<DesignData | null>(null)
  const [currentView, setCurrentView] = useState<"front" | "back">("front")
  const [isExporting, setIsExporting] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)

  useEffect(() => {
    const storedDesignData = localStorage.getItem("designData")
    if (storedDesignData) {
      setDesignData(JSON.parse(storedDesignData))
    }
  }, [])

  const exportDesign = async () => {
    if (!canvasRef.current || !designData) return

    setIsExporting(true)
    try {
      // In a real implementation, you would:
      // 1. Render the design to a high-resolution canvas
      // 2. Convert to PNG/PDF
      // 3. Upload to cloud storage
      // 4. Return download URL

      // Simulate export process
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Create a simple download link for demo
      const canvas = document.createElement("canvas")
      canvas.width = 800
      canvas.height = 1000
      const ctx = canvas.getContext("2d")

      if (ctx) {
        // Set background color
        ctx.fillStyle = designData.selections.color === "white" ? "#FFFFFF" : "#000000"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Add text indicating this is a demo export
        ctx.fillStyle = "#666666"
        ctx.font = "24px Arial"
        ctx.textAlign = "center"
        ctx.fillText("Design Export Preview", canvas.width / 2, canvas.height / 2)
        ctx.fillText(
          `${designData.selections.style} - ${designData.selections.size}`,
          canvas.width / 2,
          canvas.height / 2 + 40,
        )

        // Convert to blob and download
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `custom-tshirt-design-${Date.now()}.png`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }
        })
      }
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

  const placeOrder = async () => {
    // In a real implementation, this would integrate with a payment system.
    if (!designData) return;
    const total = Number((designData.selections.price + 5 + 7.99).toFixed(2));

    try {
      const payload = {
        total,
        items: designData.elements.map(e => ({ id: e.id, type: e.type, content: e.content })),
        selections: designData.selections,
        design: designData,
        shipping_info: {}
      };

      await apiClient.createOrder(payload);
      setOrderPlaced(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      console.error('Order submission failed:', error);
      alert('下单失败，请重试');
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
                  <div className="max-w-md mx-auto">
                    <div
                      ref={canvasRef}
                      className="relative bg-white rounded-lg shadow-lg aspect-[3/4] border-2 border-border overflow-hidden"
                      style={{
                        backgroundColor:
                          designData.selections.color === "white"
                            ? "#FFFFFF"
                            : designData.selections.color === "black"
                              ? "#000000"
                              : "#F3F4F6",
                      }}
                    >
                      {/* T-shirt outline */}
                      <div className="absolute inset-4 border border-dashed border-gray-300 rounded-lg opacity-30" />

                      {/* Design Elements */}
                      {designData.elements
                        .filter((el) => el.visible && el.side === currentView) // Filter elements by current view (front/back)
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

                      {/* Empty state for current view */}
                      {designData.elements.filter((el) => el.side === currentView).length === 0 && ( // Show empty state only when no elements exist for current side
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
                            backgroundColor:
                              designData.selections.color === "white"
                                ? "#FFFFFF"
                                : designData.selections.color === "black"
                                  ? "#000000"
                                  : "#F3F4F6",
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
                      <span>${(designData.selections.price + 5 + 7.99).toFixed(2)}</span>
                    </div>
                  </div>
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
                  <Button onClick={placeOrder} size="lg" className="w-full">
                    <ShoppingCart className="w-5 h-5 mr-2" />
                    {translate({
                      zh: `下单 - $${(designData.selections.price + 5 + 7.99).toFixed(2)}`,
                      en: `Place Order - $${(designData.selections.price + 5 + 7.99).toFixed(2)}`,
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
