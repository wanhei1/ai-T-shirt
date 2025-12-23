"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  ArrowLeft,
  ArrowRight,
  Palette,
  Sparkles,
  Type,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { AIGenerator } from "@/components/design-tools/ai-generator"
import { ImageUploader } from "@/components/design-tools/image-uploader"
import { useLanguage, type LanguageText } from "@/contexts/language-context"

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
  side: "front" | "back"
}

interface TShirtSelections {
  style: string
  color: string
  size: string
  price: number
}

const fonts = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Verdana", "Courier New", "Impact", "Comic Sans MS"]

const colors = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#FFA500",
  "#800080",
]

const styleLabels: Record<string, LanguageText> = {
  classic: { zh: "经典版型", en: "Classic Fit" },
  slim: { zh: "修身版型", en: "Slim Fit" },
  oversized: { zh: "宽松版型", en: "Oversized" },
}

const colorLabels: Record<string, LanguageText> = {
  white: { zh: "白色", en: "White" },
  black: { zh: "黑色", en: "Black" },
  navy: { zh: "海军蓝", en: "Navy" },
  gray: { zh: "灰色", en: "Gray" },
  red: { zh: "红色", en: "Red" },
  green: { zh: "绿色", en: "Green" },
  blue: { zh: "蓝色", en: "Blue" },
  purple: { zh: "紫色", en: "Purple" },
}

export default function DesignEditorPage() {
  const router = useRouter()
  const canvasRef = useRef<HTMLDivElement>(null)
  const { translate } = useLanguage()
  const [selections] = useState<TShirtSelections | null>(() => {
    if (typeof window === "undefined") {
      return null
    }
    const storedSelections = window.localStorage.getItem("tshirtSelections")
    if (!storedSelections) {
      return null
    }
    try {
      return JSON.parse(storedSelections) as TShirtSelections
    } catch (error) {
      console.error("Failed to parse saved selections", error)
      return null
    }
  })
  const [activeTab, setActiveTab] = useState("ai")
  const [designElements, setDesignElements] = useState<DesignElement[]>([])
  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const [showFront, setShowFront] = useState(true)
  const [textInput, setTextInput] = useState("")
  const [fontSize, setFontSize] = useState([24])
  const [selectedFont, setSelectedFont] = useState("Arial")
  const [selectedColor, setSelectedColor] = useState("#000000")

  const [canvasZoom, setCanvasZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragElementStart, setDragElementStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0 })

  const handleMouseDown = (e: React.MouseEvent, elementId: string, action: "drag" | "resize" | "rotate" = "drag") => {
    e.preventDefault()
    e.stopPropagation()

    const element = designElements.find((el) => el.id === elementId)
    if (!element) return

    setSelectedElement(elementId)
    setDragStart({ x: e.clientX, y: e.clientY })

    if (action === "drag") {
      setIsDragging(true)
      setDragElementStart({ x: element.x, y: element.y })
    } else if (action === "resize") {
      setIsResizing(true)
      setResizeStart({ width: element.width, height: element.height })
    } else if (action === "rotate") {
      setIsRotating(true)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!selectedElement) return

    const element = designElements.find((el) => el.id === selectedElement)
    if (!element) return

    if (isDragging) {
      const deltaX = (e.clientX - dragStart.x) / canvasZoom
      const deltaY = (e.clientY - dragStart.y) / canvasZoom

      const newX = Math.max(0, Math.min(300, dragElementStart.x + deltaX))
      const newY = Math.max(0, Math.min(400, dragElementStart.y + deltaY))

      updateElement(selectedElement, { x: newX, y: newY })
    } else if (isResizing) {
      const deltaX = (e.clientX - dragStart.x) / canvasZoom
      const deltaY = (e.clientY - dragStart.y) / canvasZoom

      const newWidth = Math.max(30, Math.min(300, resizeStart.width + deltaX))
      const newHeight = Math.max(20, Math.min(300, resizeStart.height + deltaY))

      updateElement(selectedElement, { width: newWidth, height: newHeight })
    } else if (isRotating) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return

      const centerX = rect.left + (element.x + element.width / 2) * canvasZoom
      const centerY = rect.top + (element.y + element.height / 2) * canvasZoom

      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
      const degrees = (angle * 180) / Math.PI + 90

      updateElement(selectedElement, { rotation: degrees })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsResizing(false)
    setIsRotating(false)
  }

  const handleZoomIn = () => {
    setCanvasZoom((prev) => Math.min(2, prev + 0.1))
  }

  const handleZoomOut = () => {
    setCanvasZoom((prev) => Math.max(0.5, prev - 0.1))
  }

  const handleResetZoom = () => {
    setCanvasZoom(1)
  }

  const rotateElement = (elementId: string, degrees: number) => {
    const element = designElements.find((el) => el.id === elementId)
    if (!element) return

    const newRotation = (element.rotation + degrees) % 360
    updateElement(elementId, { rotation: newRotation })
  }

  const addTextElement = () => {
    if (!textInput.trim()) return

    const newElement: DesignElement = {
      id: Date.now().toString(),
      type: "text",
      content: textInput,
      x: 150,
      y: 150,
      width: 200,
      height: 50,
      rotation: 0,
      fontSize: fontSize[0],
      fontFamily: selectedFont,
      color: selectedColor,
      visible: true,
      side: showFront ? "front" : "back",
    }

    setDesignElements([...designElements, newElement])
    setTextInput("")
  }

  const addImageElement = (imageSrc: string, type: "image" | "ai-generated" = "image") => {
    const newElement: DesignElement = {
      id: Date.now().toString(),
      type,
      content: imageSrc,
      x: 100,
      y: 100,
      width: 150,
      height: 150,
      rotation: 0,
      visible: true,
      side: showFront ? "front" : "back",
    }

    setDesignElements([...designElements, newElement])
  }

  const updateElement = (id: string, updates: Partial<DesignElement>) => {
    setDesignElements((elements) => elements.map((el) => (el.id === id ? { ...el, ...updates } : el)))
  }

  const deleteElement = (id: string) => {
    setDesignElements((elements) => elements.filter((el) => el.id !== id))
    if (selectedElement === id) {
      setSelectedElement(null)
    }
  }

  const selectedElementData = designElements.find((el) => el.id === selectedElement)

  const getStyleLabel = (styleId?: string) => {
    if (!styleId) {
      return ""
    }
    const label = styleLabels[styleId]
    return label ? translate(label) : styleId
  }

  const getColorLabel = (colorId?: string) => {
    if (!colorId) {
      return ""
    }
    const label = colorLabels[colorId]
    return label ? translate(label) : colorId
  }

  const frontElementCount = designElements.filter((el) => el.side === "front").length
  const backElementCount = designElements.filter((el) => el.side === "back").length
  const currentSideElements = designElements.filter((el) => el.side === (showFront ? "front" : "back"))
  const visibleCurrentElements = currentSideElements.filter((el) => el.visible)
  const otherSideCount = designElements.filter((el) => el.side === (showFront ? "back" : "front")).length

  const handleContinueToPreview = () => {
    const designData = {
      selections,
      elements: designElements,
    }
    localStorage.setItem("designData", JSON.stringify(designData))
    router.push("/design/preview")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/design">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {translate({ zh: "返回", en: "Back" })}
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">
                {translate({ zh: "yituai", en: "yituai" })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {translate({ zh: "第 2 步 / 共 3 步", en: "Step 2 of 3" })}
            </Badge>
            <Button onClick={handleContinueToPreview} disabled={designElements.length === 0}>
              {translate({ zh: "前往预览", en: "Continue to Preview" })}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Tools */}
        <div className="w-80 border-r border-border bg-card/30 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">
              {translate({ zh: "设计工具", en: "Design Tools" })}
            </h2>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ai" className="text-xs">
                  <Sparkles className="w-4 h-4 mr-1" />
                  {translate({ zh: "AI", en: "AI" })}
                </TabsTrigger>
                <TabsTrigger value="text" className="text-xs">
                  <Type className="w-4 h-4 mr-1" />
                  {translate({ zh: "文字", en: "Text" })}
                </TabsTrigger>
                <TabsTrigger value="upload" className="text-xs">
                  <Upload className="w-4 h-4 mr-1" />
                  {translate({ zh: "上传", en: "Upload" })}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="space-y-4 mt-4">
                <AIGenerator onImageGenerated={(imageUrl) => addImageElement(imageUrl, "ai-generated")} />
              </TabsContent>

              <TabsContent value="text" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {translate({ zh: "添加文字", en: "Add Text" })}
                    </CardTitle>
                    <CardDescription>
                      {translate({ zh: "自定义文字样式", en: "Customize your text design" })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="text-input">
                        {translate({ zh: "文字内容", en: "Text" })}
                      </Label>
                      <Input
                        id="text-input"
                        placeholder={translate({ zh: "请输入文字...", en: "Enter your text..." })}
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="font-select">
                        {translate({ zh: "字体", en: "Font" })}
                      </Label>
                      <select
                        id="font-select"
                        value={selectedFont}
                        onChange={(e) => setSelectedFont(e.target.value)}
                        className="w-full p-2 border border-border rounded-md bg-background"
                      >
                        {fonts.map((font) => (
                          <option key={font} value={font}>
                            {font}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>
                        {translate({
                          zh: `字体大小：${fontSize[0]}px`,
                          en: `Font Size: ${fontSize[0]}px`,
                        })}
                      </Label>
                      <Slider
                        value={fontSize}
                        onValueChange={setFontSize}
                        max={72}
                        min={12}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label>{translate({ zh: "颜色", en: "Color" })}</Label>
                      <div className="grid grid-cols-5 gap-2 mt-2">
                        {colors.map((color) => (
                          <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`w-8 h-8 rounded border-2 ${
                              selectedColor === color ? "border-primary" : "border-border"
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                    <Button onClick={addTextElement} disabled={!textInput.trim()} className="w-full">
                      {translate({ zh: "添加文字", en: "Add Text" })}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="upload" className="space-y-4 mt-4">
                <ImageUploader onImageUploaded={(imageUrl) => addImageElement(imageUrl, "image")} />
              </TabsContent>
            </Tabs>

            {/* Element Properties */}
            {selectedElementData && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">
                    {translate({ zh: "元素属性", en: "Element Properties" })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>{translate({ zh: "显示状态", en: "Visible" })}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateElement(selectedElementData.id, { visible: !selectedElementData.visible })}
                    >
                      {selectedElementData.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>{translate({ zh: "快速旋转", en: "Quick Rotate" })}</Label>
                    <Button variant="ghost" size="sm" onClick={() => rotateElement(selectedElementData.id, 90)}>
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <Label>
                      {translate({
                        zh: `宽度：${selectedElementData.width}px`,
                        en: `Width: ${selectedElementData.width}px`,
                      })}
                    </Label>
                    <Slider
                      value={[selectedElementData.width]}
                      onValueChange={([width]: number[]) =>
                        updateElement(selectedElementData.id, { width })}
                      max={300}
                      min={50}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>
                      {translate({
                        zh: `高度：${selectedElementData.height}px`,
                        en: `Height: ${selectedElementData.height}px`,
                      })}
                    </Label>
                    <Slider
                      value={[selectedElementData.height]}
                      onValueChange={([height]: number[]) =>
                        updateElement(selectedElementData.id, { height })}
                      max={300}
                      min={20}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>
                      {translate({
                        zh: `旋转角度：${selectedElementData.rotation}°`,
                        en: `Rotation: ${selectedElementData.rotation}°`,
                      })}
                    </Label>
                    <Slider
                      value={[selectedElementData.rotation]}
                      onValueChange={([rotation]: number[]) =>
                        updateElement(selectedElementData.id, { rotation })}
                      max={360}
                      min={0}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteElement(selectedElementData.id)}
                    className="w-full"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {translate({ zh: "删除元素", en: "Delete Element" })}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col">
          {/* Canvas Controls */}
          <div className="border-b border-border p-4 bg-card/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold">
                  {translate({
                    zh: `${getStyleLabel(selections?.style)} T 恤 - ${getColorLabel(selections?.color)}`,
                    en: `${getStyleLabel(selections?.style)} T-Shirt - ${getColorLabel(selections?.color)}`,
                  })}
                </h3>
                <Badge variant="outline">{selections?.size}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 mr-4">
                  <Button variant="outline" size="sm" onClick={handleZoomOut}>
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResetZoom}>
                    {Math.round(canvasZoom * 100)}%
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleZoomIn}>
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant={showFront ? "default" : "outline"} size="sm" onClick={() => setShowFront(true)}>
                    {translate({
                      zh: `前面 (${frontElementCount})`,
                      en: `Front (${frontElementCount})`,
                    })}
                  </Button>
                  <Button variant={!showFront ? "default" : "outline"} size="sm" onClick={() => setShowFront(false)}>
                    {translate({
                      zh: `背面 (${backElementCount})`,
                      en: `Back (${backElementCount})`,
                    })}
                  </Button>
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 p-8 bg-muted/20 overflow-auto">
              <div className="max-w-md mx-auto">
                <div
                  ref={canvasRef}
                  className="relative bg-white rounded-lg shadow-lg aspect-[3/4] border-2 border-border overflow-hidden select-none"
                  style={{
                    backgroundColor:
                      selections?.color === "white" ? "#FFFFFF" : selections?.color === "black" ? "#000000" : "#F3F4F6",
                    transform: `scale(${canvasZoom})`,
                    transformOrigin: "center",
                  }}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {/* T-shirt outline/template */}
                  <div className="absolute inset-4 border border-dashed border-gray-300 rounded-lg opacity-30" />

                  {/* Design Elements */}
                  {visibleCurrentElements.map((element) => (
                      <div
                        key={element.id}
                        className={`absolute cursor-move border-2 transition-colors ${
                          selectedElement === element.id ? "border-primary" : "border-transparent"
                        } hover:border-primary/50`}
                        style={{
                          left: element.x,
                          top: element.y,
                          width: element.width,
                          height: element.height,
                          transform: `rotate(${element.rotation}deg)`,
                          userSelect: "none",
                        }}
                        onMouseDown={(e) => handleMouseDown(e, element.id, "drag")}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedElement(element.id)
                        }}
                      >
                        {element.type === "text" ? (
                          <div
                            className="w-full h-full flex items-center justify-center text-center break-words pointer-events-none"
                            style={{
                              fontSize: element.fontSize,
                              fontFamily: element.fontFamily,
                              color: element.color,
                            }}
                          >
                            {element.content}
                          </div>
                        ) : (
                          <div className="relative w-full h-full pointer-events-none">
                            <Image
                              src={element.content || "/placeholder.svg"}
                              alt={translate({ zh: "设计元素", en: "Design element" })}
                              fill
                              className="object-contain"
                              draggable={false}
                              unoptimized
                            />
                          </div>
                        )}

                        {selectedElement === element.id && (
                          <>
                            {/* Corner resize handles */}
                            <div
                              className="absolute -top-2 -left-2 w-4 h-4 bg-primary rounded-full cursor-nw-resize border-2 border-white shadow-md hover:scale-110 transition-transform"
                              onMouseDown={(e) => handleMouseDown(e, element.id, "resize")}
                            />
                            <div
                              className="absolute -top-2 -right-2 w-4 h-4 bg-primary rounded-full cursor-ne-resize border-2 border-white shadow-md hover:scale-110 transition-transform"
                              onMouseDown={(e) => handleMouseDown(e, element.id, "resize")}
                            />
                            <div
                              className="absolute -bottom-2 -left-2 w-4 h-4 bg-primary rounded-full cursor-sw-resize border-2 border-white shadow-md hover:scale-110 transition-transform"
                              onMouseDown={(e) => handleMouseDown(e, element.id, "resize")}
                            />
                            <div
                              className="absolute -bottom-2 -right-2 w-4 h-4 bg-primary rounded-full cursor-se-resize border-2 border-white shadow-md hover:scale-110 transition-transform"
                              onMouseDown={(e) => handleMouseDown(e, element.id, "resize")}
                            />

                            {/* Rotation handle */}
                            <div
                              className="absolute -top-8 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-green-500 rounded-full cursor-grab border-2 border-white shadow-md hover:scale-110 transition-transform"
                              onMouseDown={(e) => handleMouseDown(e, element.id, "rotate")}
                              title={translate({ zh: "拖曳以旋转", en: "Drag to rotate" })}
                            />

                            {/* Center indicator */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full opacity-50" />
                          </>
                        )}
                      </div>
                    ))}

                  {/* Empty state */}
                  {currentSideElements.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
                      <div className="text-center">
                        <Palette className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">
                          {translate({
                            zh: `开始设计 T 恤的${showFront ? "前面" : "背面"}`,
                            en: `Start designing the ${showFront ? "front" : "back"} of your T-shirt`,
                          })}
                        </p>
                        <p className="text-xs">
                          {translate({ zh: "使用左侧工具添加元素", en: "Use the tools on the left to add elements" })}
                        </p>
                        {otherSideCount > 0 && (
                          <p className="text-xs mt-2 text-primary">
                            {translate({
                              zh: `💡 切换到${showFront ? "背面" : "前面"}查看其他设计`,
                              en: `💡 Switch to the ${showFront ? "back" : "front"} to see your other designs`,
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-center text-sm text-muted-foreground">
                  <p>
                    {translate({
                      zh: "💡 点击选择 • 拖动移动 • 拖动边角缩放 • 拖动绿色把手旋转",
                      en: "💡 Click to select • Drag to move • Drag corners to resize • Drag green handle to rotate",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
