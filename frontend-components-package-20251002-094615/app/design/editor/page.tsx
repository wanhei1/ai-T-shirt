"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
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
import { AIGenerator } from "@/components/design-tools/ai-generator"
import { ImageUploader } from "@/components/design-tools/image-uploader"

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

export default function DesignEditorPage() {
  const router = useRouter()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [selections, setSelections] = useState<TShirtSelections | null>(null)
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
  const [rotationStart, setRotationStart] = useState(0)

  useEffect(() => {
    const storedSelections = localStorage.getItem("tshirtSelections")
    if (storedSelections) {
      setSelections(JSON.parse(storedSelections))
    }
  }, [])

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
      setRotationStart(element.rotation)
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
                Back
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">CustomTee</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">Step 2 of 3</Badge>
            <Button onClick={handleContinueToPreview} disabled={designElements.length === 0}>
              Continue to Preview
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Sidebar - Tools */}
        <div className="w-80 border-r border-border bg-card/30 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Design Tools</h2>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ai" className="text-xs">
                  <Sparkles className="w-4 h-4 mr-1" />
                  AI
                </TabsTrigger>
                <TabsTrigger value="text" className="text-xs">
                  <Type className="w-4 h-4 mr-1" />
                  Text
                </TabsTrigger>
                <TabsTrigger value="upload" className="text-xs">
                  <Upload className="w-4 h-4 mr-1" />
                  Upload
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="space-y-4 mt-4">
                <AIGenerator onImageGenerated={(imageUrl) => addImageElement(imageUrl, "ai-generated")} />
              </TabsContent>

              <TabsContent value="text" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Add Text</CardTitle>
                    <CardDescription>Customize your text design</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="text-input">Text</Label>
                      <Input
                        id="text-input"
                        placeholder="Enter your text..."
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="font-select">Font</Label>
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
                      <Label>Font Size: {fontSize[0]}px</Label>
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
                      <Label>Color</Label>
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
                      Add Text
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
                  <CardTitle className="text-base">Element Properties</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Visible</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateElement(selectedElementData.id, { visible: !selectedElementData.visible })}
                    >
                      {selectedElementData.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label>Quick Rotate</Label>
                    <Button variant="ghost" size="sm" onClick={() => rotateElement(selectedElementData.id, 90)}>
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <Label>Width: {selectedElementData.width}px</Label>
                    <Slider
                      value={[selectedElementData.width]}
                      onValueChange={([width]) => updateElement(selectedElementData.id, { width })}
                      max={300}
                      min={50}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Height: {selectedElementData.height}px</Label>
                    <Slider
                      value={[selectedElementData.height]}
                      onValueChange={([height]) => updateElement(selectedElementData.id, { height })}
                      max={300}
                      min={20}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Rotation: {selectedElementData.rotation}°</Label>
                    <Slider
                      value={[selectedElementData.rotation]}
                      onValueChange={([rotation]) => updateElement(selectedElementData.id, { rotation })}
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
                    Delete Element
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
                  {selections?.style} T-Shirt - {selections?.color}
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
                    Front ({designElements.filter((el) => el.side === "front").length})
                  </Button>
                  <Button variant={!showFront ? "default" : "outline"} size="sm" onClick={() => setShowFront(false)}>
                    Back ({designElements.filter((el) => el.side === "back").length})
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
                  {designElements
                    .filter((el) => el.visible && el.side === (showFront ? "front" : "back"))
                    .map((element) => (
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
                          <img
                            src={element.content || "/placeholder.svg"}
                            alt="Design element"
                            className="w-full h-full object-contain pointer-events-none"
                            draggable={false}
                          />
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
                              title="Drag to rotate"
                            />

                            {/* Center indicator */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full opacity-50" />
                          </>
                        )}
                      </div>
                    ))}

                  {/* Empty state */}
                  {designElements.filter((el) => el.side === (showFront ? "front" : "back")).length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
                      <div className="text-center">
                        <Palette className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm">Start designing the {showFront ? "front" : "back"} of your T-shirt</p>
                        <p className="text-xs">Use the tools on the left to add elements</p>
                        {designElements.filter((el) => el.side === (showFront ? "back" : "front")).length > 0 && (
                          <p className="text-xs mt-2 text-primary">
                            💡 Switch to {showFront ? "back" : "front"} to see your other designs
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-center text-sm text-muted-foreground">
                  <p>💡 Click to select • Drag to move • Drag corners to resize • Drag green handle to rotate</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
