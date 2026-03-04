"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState, useRef as useReactRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
import NextImage from "next/image"
import { AIGenerator } from "@/components/design-tools/ai-generator"
import { ImageUploader } from "@/components/design-tools/image-uploader"
import { useLanguage, type LanguageText } from "@/contexts/language-context"
import { buildCanvasMeta, CANVAS_SIZE, getShirtColorHex, getShirtPhotoSrc, PRINT_AREA } from "@/lib/design-canvas"
import { externalizeDesignAssets } from "@/lib/design-storage"
import apiClient from "@/lib/api-client"
import type { DesignElement, TShirtSelections } from "@/types/design"

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

type TryOnModelGender = "male" | "female"
const TRYON_MODEL_STORAGE_KEY = "tryOnModelGender"
const TRYON_CACHE_STORAGE_KEY = "tryOnCacheV1"

type TryOnCache = {
  signature: string
  gender: TryOnModelGender
  front: string | null
  back: string | null
  createdAt: number
}

const getTryOnModelSrc = (gender: TryOnModelGender, side: "front" | "back") => {
  if (gender === "female") {
    return side === "back" ? "/femalemodelback.png" : "/femalemodel.png"
  }
  return side === "back" ? "/malemodelback.jpg" : "/malemodel.png"
}

const MODEL_CROP_RATIO = 0.6

const cropModelToUpperBody = async (file: File): Promise<File> => {
  if (typeof window === "undefined") return file

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new window.Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to load model image"))
    }
    image.src = url
  })

  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const cropHeight = Math.max(1, Math.round(height * MODEL_CROP_RATIO))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = cropHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return file

  ctx.drawImage(img, 0, 0, width, cropHeight, 0, 0, width, cropHeight)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, file.type || "image/png")
  })
  if (!blob) return file

  return new File([blob], file.name, { type: blob.type || file.type || "image/png" })
}

export default function DesignEditorPage() {
  const router = useRouter()
  const canvasRef = useRef<HTMLDivElement>(null)
  const printAreaRef = useRef<HTMLDivElement>(null)
  const hasLoadedDesignRef = useReactRef(false)
  const hadStoredDesignRef = useRef(false)
  const hasUserEditedRef = useRef(false)
  const persistTimerRef = useRef<number | null>(null)
  const continueProgressTimerRef = useRef<number | null>(null)
  const designElementsRef = useRef<DesignElement[]>([])
  const selectedElementRef = useRef<string | null>(null)
  const isDraggingRef = useRef(false)
  const isResizingRef = useRef(false)
  const isRotatingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragElementStartRef = useRef({ x: 0, y: 0 })
  const resizeStartRef = useRef({ width: 0, height: 0 })
  const canvasZoomRef = useRef(1)
  const updateElementRef = useRef<(id: string, updates: Partial<DesignElement>) => void>(() => {})
  const { translate } = useLanguage()
  const [hydrated, setHydrated] = useState(false)
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
  const [fontSize, setFontSize] = useState<number[]>([24])
  const [selectedFont, setSelectedFont] = useState("Arial")
  const [selectedColor, setSelectedColor] = useState("#000000")

  const [tryOnModelGender, setTryOnModelGender] = useState<TryOnModelGender>(() => {
    if (typeof window === "undefined") return "male"
    const v = window.localStorage.getItem(TRYON_MODEL_STORAGE_KEY)
    return v === "female" ? "female" : "male"
  })

  const [isContinuingToPreview, setIsContinuingToPreview] = useState(false)
  const [continuePercent, setContinuePercent] = useState(0)
  const [continueQueueHint, setContinueQueueHint] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(TRYON_MODEL_STORAGE_KEY, tryOnModelGender)
    } catch {
      // ignore storage failures
    }
  }, [tryOnModelGender])

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Image loading is only available in the browser"))
        return
      }
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Failed to load image"))
      img.src = src
    })

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const [header, base64] = dataUrl.split(",")
    const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png"
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: mime })
  }

  const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read blob"))
      reader.readAsDataURL(blob)
    })

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const pollTryOnJob = async (queue: string, jobId: string | number) => {
    while (true) {
      const status = await apiClient.getJobStatus(queue, jobId)
      const job = status.job
      const state = job?.state

      if (state === "completed") {
        return job?.result?.imageUrl as string | undefined
      }

      if (state === "failed") {
        throw new Error(job?.failedReason || "试穿失败")
      }

      await delay(1500)
    }
  }

  const resizeDataUrlToTarget = async (dataUrl: string, width = 768, height = 1024): Promise<string> => {
    const img = await loadImage(dataUrl)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png")
  }

  const renderClothSnapshot = async (side: "front" | "back") => {
    const meta = canvasMeta
    const canvas = document.createElement("canvas")
    const scale = 2
    canvas.width = meta.width * scale
    canvas.height = meta.height * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    ctx.fillStyle = meta.backgroundColor || "#f8fafc"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw shirt base (real photo if available; fallback to SVG)
    if (shirtPhotoSrc) {
      try {
        const base = await loadImage(shirtPhotoSrc)
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height)
      } catch {
        // fall back to SVG silhouette
        ctx.save()
        ctx.scale((meta.width * scale) / 200, (meta.height * scale) / 200)
        const shirtPath = new Path2D(
          "M70 30 L90 30 Q100 50 110 30 L130 30 Q145 30 150 45 L175 75 L155 95 L155 165 L45 165 L45 95 L25 75 L50 45 Q55 30 70 30 Z"
        )
        ctx.fillStyle = shirtFill || "#e5e7eb"
        ctx.strokeStyle = "#444"
        ctx.lineWidth = 4 / scale
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
      ctx.lineWidth = 4 / scale
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.fill(shirtPath)
      ctx.stroke(shirtPath)
      ctx.restore()
    }

    ctx.save()
    ctx.translate(meta.printArea.x * scale, meta.printArea.y * scale)
    ctx.beginPath()
    ctx.rect(0, 0, meta.printArea.width * scale, meta.printArea.height * scale)
    ctx.clip()

    const elements = (designElements || []).filter((el) => el.visible && el.side === side)
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
        } catch {
          // skip
        }
      }

      ctx.restore()
    }

    ctx.restore()
    return canvas.toDataURL("image/png")
  }

  const renderTryOnClothSnapshot = async (side: "front" | "back") => {
    const meta = canvasMeta

    // Prefer rendering try-on cloth on the base shirt image at its native size.
    // Keep background transparent to better match typical backend cloth inputs.
    if (!shirtPhotoSrc) {
      return renderClothSnapshot(side)
    }

    const base = await loadImage(shirtPhotoSrc)
    const baseWidth = base.naturalWidth || base.width
    const baseHeight = base.naturalHeight || base.height

    const canvas = document.createElement("canvas")
    canvas.width = baseWidth
    canvas.height = baseHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    ctx.drawImage(base, 0, 0, canvas.width, canvas.height)

    const sx = canvas.width / meta.width
    const sy = canvas.height / meta.height
    const fontScale = (sx + sy) / 2

    ctx.save()
    ctx.translate(meta.printArea.x * sx, meta.printArea.y * sy)
    ctx.beginPath()
    ctx.rect(0, 0, meta.printArea.width * sx, meta.printArea.height * sy)
    ctx.clip()

    const elements = (designElements || []).filter((el) => el.visible && el.side === side)
    for (const element of elements) {
      ctx.save()
      ctx.translate((element.x + element.width / 2) * sx, (element.y + element.height / 2) * sy)
      ctx.rotate((element.rotation * Math.PI) / 180)
      ctx.translate((-element.width / 2) * sx, (-element.height / 2) * sy)

      if (element.type === "text") {
        ctx.fillStyle = element.color || "#111827"
        ctx.font = `${(element.fontSize || 24) * fontScale}px ${element.fontFamily || "Arial"}`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(element.content, (element.width * sx) / 2, (element.height * sy) / 2, element.width * sx)
      } else if (element.content) {
        try {
          const img = await loadImage(element.content)
          ctx.drawImage(img, 0, 0, element.width * sx, element.height * sy)
        } catch {
          // skip
        }
      }

      ctx.restore()
    }

    ctx.restore()
    return canvas.toDataURL("image/png")
  }

  const computeTryOnSignature = () => {
    const normElements = [...(designElements || [])]
      .map((el) => ({
        id: el.id,
        type: el.type,
        content: el.content,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation,
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        color: el.color,
        visible: el.visible,
        side: el.side,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))

    const sigObj = {
      selections,
      elements: normElements,
      gender: tryOnModelGender,
    }
    return JSON.stringify(sigObj)
  }

  const loadModelFile = async (src: string) => {
    const resp = await fetch(src)
    if (!resp.ok) {
      throw new Error(`无法加载模特图片: ${src}`)
    }
    const blob = await resp.blob()
    const filename = src.split("/").pop() || "model.png"
    const file = new File([blob], filename, { type: blob.type || "image/png" })
    return cropModelToUpperBody(file)
  }

  const callVirtualTryOn = async (person: File, clothDataUrl: string, side: "front" | "back") => {
    const personDataUrl = await readBlobAsDataUrl(person)
    const resizedPersonDataUrl = await resizeDataUrlToTarget(personDataUrl)

    const resizedClothDataUrl = await resizeDataUrlToTarget(clothDataUrl)

    const jobResp = await apiClient.createJob({
      type: "virtual-tryon",
      payload: {
        personDataUrl: resizedPersonDataUrl,
        clothDataUrl: resizedClothDataUrl,
      },
    })

    const waiting = jobResp.queueStats?.waiting ?? 0
    const active = jobResp.queueStats?.active ?? 0
    setContinueQueueHint(
      translate({
        zh: `试穿队列：等待 ${waiting} 个，处理中 ${active} 个`,
        en: `Try-on queue: waiting ${waiting}, active ${active}`,
      })
    )

    const imageUrl = await pollTryOnJob(jobResp.queue, jobResp.jobId)
    if (!imageUrl) {
      throw new Error("试穿结果为空")
    }

    return imageUrl
  }

  const DEFAULT_CANVAS_ZOOM = 1.6
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragElementStart, setDragElementStart] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0 })

  useEffect(() => {
    designElementsRef.current = designElements
  }, [designElements])

  useEffect(() => {
    selectedElementRef.current = selectedElement
  }, [selectedElement])

  useEffect(() => {
    isDraggingRef.current = isDragging
    isResizingRef.current = isResizing
    isRotatingRef.current = isRotating
  }, [isDragging, isResizing, isRotating])

  useEffect(() => {
    dragStartRef.current = dragStart
  }, [dragStart])

  useEffect(() => {
    dragElementStartRef.current = dragElementStart
  }, [dragElementStart])

  useEffect(() => {
    resizeStartRef.current = resizeStart
  }, [resizeStart])

  useEffect(() => {
    canvasZoomRef.current = canvasZoom
  }, [canvasZoom])

  const canvasMeta = useMemo(() => buildCanvasMeta(selections?.color), [selections])
  const printArea = canvasMeta.printArea

  const isDev = process.env.NODE_ENV !== "production"
  const [isCalibratingPrintArea, setIsCalibratingPrintArea] = useState(false)
  const [draftPrintAreaCanvas, setDraftPrintAreaCanvas] = useState<null | {
    x: number
    y: number
    width: number
    height: number
  }>(null)
  const calibrateStartRef = useRef<null | { x: number; y: number }>(null)

  const canvasPointFromMouse = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const rx = (e.clientX - rect.left) / rect.width
    const ry = (e.clientY - rect.top) / rect.height
    return {
      x: Math.max(0, Math.min(CANVAS_SIZE.width, rx * CANVAS_SIZE.width)),
      y: Math.max(0, Math.min(CANVAS_SIZE.height, ry * CANVAS_SIZE.height)),
    }
  }

  const currentPrintArea200 = useMemo(() => {
    const sx = 200 / CANVAS_SIZE.width
    const sy = 200 / CANVAS_SIZE.height
    return {
      x: Math.round(printArea.x * sx),
      y: Math.round(printArea.y * sy),
      width: Math.round(printArea.width * sx),
      height: Math.round(printArea.height * sy),
    }
  }, [printArea.x, printArea.y, printArea.width, printArea.height])

  const draftPrintArea200 = useMemo(() => {
    if (!draftPrintAreaCanvas) return null
    const sx = 200 / CANVAS_SIZE.width
    const sy = 200 / CANVAS_SIZE.height
    return {
      x: Math.round(draftPrintAreaCanvas.x * sx),
      y: Math.round(draftPrintAreaCanvas.y * sy),
      width: Math.round(draftPrintAreaCanvas.width * sx),
      height: Math.round(draftPrintAreaCanvas.height * sy),
    }
  }, [draftPrintAreaCanvas])

  const handleCalibrateMouseDown = (e: React.MouseEvent) => {
    if (!isCalibratingPrintArea) return
    e.preventDefault()
    e.stopPropagation()
    const p = canvasPointFromMouse(e)
    if (!p) return
    calibrateStartRef.current = p
    setDraftPrintAreaCanvas({ x: p.x, y: p.y, width: 0, height: 0 })
  }

  const handleCalibrateMouseMove = (e: React.MouseEvent) => {
    if (!isCalibratingPrintArea) return
    if (!calibrateStartRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const p = canvasPointFromMouse(e)
    if (!p) return
    const start = calibrateStartRef.current
    const x = Math.min(start.x, p.x)
    const y = Math.min(start.y, p.y)
    const width = Math.abs(p.x - start.x)
    const height = Math.abs(p.y - start.y)
    setDraftPrintAreaCanvas({ x, y, width, height })
  }

  const handleCalibrateMouseUp = (e: React.MouseEvent) => {
    if (!isCalibratingPrintArea) return
    if (!calibrateStartRef.current) return
    e.preventDefault()
    e.stopPropagation()
    calibrateStartRef.current = null
  }

  useEffect(() => {
    if (!isCalibratingPrintArea) {
      calibrateStartRef.current = null
    }
  }, [isCalibratingPrintArea])

  const shirtFill = useMemo(() => getShirtColorHex(selections?.color), [selections])
  const shirtPhotoSrc = useMemo(() => getShirtPhotoSrc(selections?.color), [selections])
  const titleText = useMemo(() => {
    if (!hydrated) {
      return translate({ zh: "定制 T 恤", en: "Custom T-Shirt" })
    }
    return translate({
      zh: `${getStyleLabel(selections?.style)} T 恤 - ${getColorLabel(selections?.color)}`,
      en: `${getStyleLabel(selections?.style)} T-Shirt - ${getColorLabel(selections?.color)}`,
    })
  }, [hydrated, selections, translate])
  const sizeLabel = useMemo(() => {
    if (!hydrated) return "..."
    return selections?.size ?? "..."
  }, [hydrated, selections])

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Load persisted design (from preview or prior edit) once after hydration
  useEffect(() => {
    if (!hydrated || hasLoadedDesignRef.current) return
    const storedDesign = typeof window !== "undefined" ? window.localStorage.getItem("designData") : null
    if (storedDesign) {
      try {
        const parsed = JSON.parse(storedDesign) as { elements?: DesignElement[] }
        if (Array.isArray(parsed.elements) && parsed.elements.length > 0) {
          setDesignElements(parsed.elements)
          hadStoredDesignRef.current = true
        }
      } catch (error) {
        console.error("Failed to load design data", error)
      }
    }
    hasLoadedDesignRef.current = true
  }, [hydrated, hasLoadedDesignRef])

  // Persist design elements while editing so navigating to preview/back keeps the state
  useEffect(() => {
    // Avoid overwriting saved designs with an empty state before initial load completes
    if (!hydrated || !hasLoadedDesignRef.current) return
    // During drag/resize/rotate, skip persistence to avoid jank
    if (isDragging || isResizing || isRotating) return
    // If we loaded a stored design but the current state is still empty and user hasn't edited, don't wipe it.
    if (designElements.length === 0 && hadStoredDesignRef.current && !hasUserEditedRef.current) {
      return
    }

    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current)
    }

    persistTimerRef.current = window.setTimeout(async () => {
      const sides = {
        front: designElements.filter((el) => el.side === "front"),
        back: designElements.filter((el) => el.side === "back"),
      }
      const category = (() => {
        try {
          const raw = window.localStorage.getItem("designCategory")
          return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null
        } catch {
          return null
        }
      })()
      const designData = {
        category,
        selections,
        elements: designElements,
        sides,
        canvas: { ...canvasMeta },
      }
      try {
        window.localStorage.setItem("designData", JSON.stringify(designData))
      } catch {
        const slim = await externalizeDesignAssets(designData)
        window.localStorage.setItem("designData", JSON.stringify(slim))
      }

      // Invalidate try-on cache when the design changes.
      try {
        const signature = computeTryOnSignature()
        const raw = window.localStorage.getItem(TRYON_CACHE_STORAGE_KEY)
        if (raw) {
          const cached = JSON.parse(raw) as TryOnCache
          if (!cached || cached.signature !== signature) {
            window.localStorage.removeItem(TRYON_CACHE_STORAGE_KEY)
          }
        }
      } catch {
        // ignore storage failures
      }
    }, 150)

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current)
      }
    }
  }, [designElements, selections, canvasMeta, hydrated, isDragging, isResizing, isRotating])

  const handleMouseDown = (e: React.MouseEvent, elementId: string, action: "drag" | "resize" | "rotate" = "drag") => {
    e.preventDefault()
    e.stopPropagation()

    const element = designElements.find((el) => el.id === elementId)
    if (!element) return

    selectedElementRef.current = elementId
    setSelectedElement(elementId)

    const nextDragStart = { x: e.clientX, y: e.clientY }
    dragStartRef.current = nextDragStart
    setDragStart(nextDragStart)

    if (action === "drag") {
      isDraggingRef.current = true
      setIsDragging(true)

      const start = { x: element.x, y: element.y }
      dragElementStartRef.current = start
      setDragElementStart(start)
    } else if (action === "resize") {
      isResizingRef.current = true
      setIsResizing(true)

      const start = { width: element.width, height: element.height }
      resizeStartRef.current = start
      setResizeStart(start)
    } else if (action === "rotate") {
      isRotatingRef.current = true
      setIsRotating(true)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    applyPointerMove(e.clientX, e.clientY)
  }

  const applyPointerMove = (clientX: number, clientY: number) => {
    const selectedId = selectedElementRef.current
    if (!selectedId || (!isDraggingRef.current && !isResizingRef.current && !isRotatingRef.current)) return

    const element = designElementsRef.current.find((el) => el.id === selectedId)
    if (!element) return

    const zoom = canvasZoomRef.current || 1
    const dragStartPoint = dragStartRef.current

    if (isDraggingRef.current) {
      const deltaX = (clientX - dragStartPoint.x) / zoom
      const deltaY = (clientY - dragStartPoint.y) / zoom

      // Allow moving outside the print area, while keeping a small portion visible for easy recovery.
      const minVisibleX = Math.min(30, Math.max(10, element.width * 0.25))
      const minVisibleY = Math.min(30, Math.max(10, element.height * 0.25))
      const minX = -element.width + minVisibleX
      const maxX = printArea.width - minVisibleX
      const minY = -element.height + minVisibleY
      const maxY = printArea.height - minVisibleY

      const start = dragElementStartRef.current
      const newX = Math.max(minX, Math.min(maxX, start.x + deltaX))
      const newY = Math.max(minY, Math.min(maxY, start.y + deltaY))

      updateElementRef.current(selectedId, { x: newX, y: newY })
    } else if (isResizingRef.current) {
      const deltaX = (clientX - dragStartPoint.x) / zoom
      const deltaY = (clientY - dragStartPoint.y) / zoom

      // Keep resizing bounded to avoid extreme values, but allow it to extend beyond the print area (it will be clipped).
      const maxWidth = printArea.width * 2
      const maxHeight = printArea.height * 2

      const start = resizeStartRef.current
      const newWidth = Math.max(30, Math.min(maxWidth, start.width + deltaX))
      const newHeight = Math.max(20, Math.min(maxHeight, start.height + deltaY))

      updateElementRef.current(selectedId, { width: newWidth, height: newHeight })
    } else if (isRotatingRef.current) {
      const rect = printAreaRef.current?.getBoundingClientRect()
      if (!rect) return

      const centerX = rect.left + (element.x + element.width / 2) * zoom
      const centerY = rect.top + (element.y + element.height / 2) * zoom

      const angle = Math.atan2(clientY - centerY, clientX - centerX)
      const degrees = (angle * 180) / Math.PI + 90

      updateElementRef.current(selectedId, { rotation: degrees })
    }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
    isResizingRef.current = false
    isRotatingRef.current = false
    setIsDragging(false)
    setIsResizing(false)
    setIsRotating(false)
  }

  useEffect(() => {
    if (!isDragging && !isResizing && !isRotating) return

    const onMove = (e: MouseEvent) => {
      applyPointerMove(e.clientX, e.clientY)
    }

    const onUp = () => {
      handleMouseUp()
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [isDragging, isResizing, isRotating])

  const handleZoomIn = () => {
    setCanvasZoom((prev) => Math.min(2, prev + 0.1))
  }

  const handleZoomOut = () => {
    setCanvasZoom((prev) => Math.max(0.5, prev - 0.1))
  }

  const handleResetZoom = () => {
    setCanvasZoom(DEFAULT_CANVAS_ZOOM)
  }

  const rotateElement = (elementId: string, degrees: number) => {
    const element = designElements.find((el) => el.id === elementId)
    if (!element) return

    const newRotation = (element.rotation + degrees) % 360
    updateElement(elementId, { rotation: newRotation })
  }

  const addTextElement = () => {
    if (!textInput.trim()) return

    hasUserEditedRef.current = true

    const width = Math.min(printArea.width, 200)
    const height = 50

    const newElement: DesignElement = {
      id: Date.now().toString(),
      type: "text",
      content: textInput,
      x: (printArea.width - width) / 2,
      y: (printArea.height - height) / 2,
      width,
      height,
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
    const size = Math.min(printArea.width, 180)

    hasUserEditedRef.current = true

    const newElement: DesignElement = {
      id: Date.now().toString(),
      type,
      content: imageSrc,
      x: (printArea.width - size) / 2,
      y: (printArea.height - size) / 2,
      width: size,
      height: size,
      rotation: 0,
      visible: true,
      side: showFront ? "front" : "back",
    }

    setDesignElements([...designElements, newElement])
  }

  const updateElement = (id: string, updates: Partial<DesignElement>) => {
    hasUserEditedRef.current = true
    setDesignElements((elements) => elements.map((el) => (el.id === id ? { ...el, ...updates } : el)))
  }

  useEffect(() => {
    updateElementRef.current = updateElement
  }, [updateElement])

  const deleteElement = (id: string) => {
    hasUserEditedRef.current = true
    setDesignElements((elements) => elements.filter((el) => el.id !== id))
    if (selectedElement === id) {
      setSelectedElement(null)
    }
  }

  const selectedElementData = designElements.find((el) => el.id === selectedElement)

  function getStyleLabel(styleId?: string) {
    if (!styleId) {
      return ""
    }
    const label = styleLabels[styleId]
    return label ? translate(label) : styleId
  }

  function getColorLabel(colorId?: string) {
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

  const handleContinueToPreview = async () => {
    if (isContinuingToPreview) return
    setIsContinuingToPreview(true)
    setContinuePercent(1)
    setContinueQueueHint(null)

    const bumpTo = (max: number) => {
      if (continueProgressTimerRef.current) {
        window.clearInterval(continueProgressTimerRef.current)
        continueProgressTimerRef.current = null
      }
      continueProgressTimerRef.current = window.setInterval(() => {
        setContinuePercent((prev) => {
          if (prev >= max) return prev
          return Math.min(max, prev + 1)
        })
      }, 180)
    }

    try {
      bumpTo(20)

      const signature = computeTryOnSignature()
      const cachedRaw = (() => {
        try {
          return window.localStorage.getItem(TRYON_CACHE_STORAGE_KEY)
        } catch {
          return null
        }
      })()
      const cached = (cachedRaw ? (JSON.parse(cachedRaw) as TryOnCache) : null) as TryOnCache | null

      // Always persist design data for preview.
      const category = (() => {
        try {
          const raw = window.localStorage.getItem("designCategory")
          return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null
        } catch {
          return null
        }
      })()
      const designData = {
        category,
        selections,
        elements: designElements,
        sides: {
          front: designElements.filter((el) => el.side === "front"),
          back: designElements.filter((el) => el.side === "back"),
        },
        canvas: { ...canvasMeta },
      }
      try {
        localStorage.setItem("designData", JSON.stringify(designData))
      } catch (error) {
        const slim = await externalizeDesignAssets(designData)
        localStorage.setItem("designData", JSON.stringify(slim))
      }

      // If nothing changed, reuse try-on cache and go straight to preview.
      if (
        cached &&
        cached.signature === signature &&
        cached.gender === tryOnModelGender &&
        typeof cached.front === "string" &&
        typeof cached.back === "string" &&
        cached.front.length > 0 &&
        cached.back.length > 0
      ) {
        setContinuePercent(100)
        if (continueProgressTimerRef.current) {
          window.clearInterval(continueProgressTimerRef.current)
          continueProgressTimerRef.current = null
        }
        router.push("/design/preview")
        return
      }

      bumpTo(35)
      const [personFront, personBack] = await Promise.all([
        loadModelFile(getTryOnModelSrc(tryOnModelGender, "front")),
        loadModelFile(getTryOnModelSrc(tryOnModelGender, "back")),
      ])

      bumpTo(45)
      const [clothFront, clothBack] = await Promise.all([
        renderTryOnClothSnapshot("front"),
        renderTryOnClothSnapshot("back"),
      ])

      if (!clothFront || !clothBack) {
        throw new Error("无法生成衣服快照")
      }

      bumpTo(65)
      const tryOnFront = await callVirtualTryOn(personFront, clothFront, "front")

      bumpTo(85)
      const tryOnBack = await callVirtualTryOn(personBack, clothBack, "back")

      const cache: TryOnCache = {
        signature,
        gender: tryOnModelGender,
        front: tryOnFront,
        back: tryOnBack,
        createdAt: Date.now(),
      }
      try {
        window.localStorage.setItem(TRYON_CACHE_STORAGE_KEY, JSON.stringify(cache))
      } catch {
        // ignore storage failures
      }

      setContinuePercent(100)
      if (continueProgressTimerRef.current) {
        window.clearInterval(continueProgressTimerRef.current)
        continueProgressTimerRef.current = null
      }
      router.push("/design/preview")
    } catch (error) {
      const message = error instanceof Error ? error.message : "试穿失败"
      alert(message)
      setIsContinuingToPreview(false)
      setContinuePercent(0)
      if (continueProgressTimerRef.current) {
        window.clearInterval(continueProgressTimerRef.current)
        continueProgressTimerRef.current = null
      }
      return
    } finally {
      setContinueQueueHint(null)
    }
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

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {translate({ zh: "模特", en: "Model" })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={tryOnModelGender === "male" ? "default" : "outline"}
                  onClick={() => setTryOnModelGender("male")}
                  disabled={isContinuingToPreview}
                >
                  {translate({ zh: "男", en: "Male" })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={tryOnModelGender === "female" ? "default" : "outline"}
                  onClick={() => setTryOnModelGender("female")}
                  disabled={isContinuingToPreview}
                >
                  {translate({ zh: "女", en: "Female" })}
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <Button onClick={handleContinueToPreview} disabled={designElements.length === 0 || isContinuingToPreview}>
                {isContinuingToPreview ? (
                  <div className="w-[220px] flex items-center gap-3">
                    <Progress value={continuePercent} className="flex-1" />
                    <span className="text-sm tabular-nums w-12 text-right">{continuePercent}%</span>
                  </div>
                ) : (
                  <>
                    {translate({ zh: "前往预览", en: "Continue to Preview" })}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
              {isContinuingToPreview && continueQueueHint ? (
                <span className="text-xs text-muted-foreground">{continueQueueHint}</span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)] overflow-hidden">
        {/* Left Sidebar - Tools */}
        <div className="w-80 border-r border-border bg-card/30 flex flex-col">
          <div className="p-4 flex-1 overflow-y-auto">
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
                      max={printArea.width}
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
                      max={printArea.height}
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
        <div className="flex-1 flex flex-col min-w-0">
          {/* Canvas Controls */}
          <div className="border-b border-border p-4 bg-card/30 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold">{titleText}</h3>
                <Badge variant="outline">{sizeLabel}</Badge>
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

            {isDev && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Button
                  variant={isCalibratingPrintArea ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setIsCalibratingPrintArea((v) => !v)
                    calibrateStartRef.current = null
                  }}
                >
                  {isCalibratingPrintArea
                    ? translate({ zh: "结束校准安全区", en: "Stop calibrating" })
                    : translate({ zh: "校准安全区(拖拽画矩形)", en: "Calibrate print area (drag)" })}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const target = draftPrintArea200 || currentPrintArea200
                    const text = `export const FIXED_PRINT_AREA_200 = ${JSON.stringify(target, null, 2)} as const\n`
                    try {
                      await navigator.clipboard.writeText(text)
                    } catch {
                      // ignore
                    }
                    console.log(text)
                  }}
                >
                  {translate({ zh: "复制常量(并输出到控制台)", en: "Copy constant (and log)" })}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraftPrintAreaCanvas(null)}
                >
                  {translate({ zh: "清除草稿", en: "Clear draft" })}
                </Button>

                <span>
                  {translate({ zh: "当前(200坐标): ", en: "Current (200 coords): " })}
                  {`${currentPrintArea200.x},${currentPrintArea200.y},${currentPrintArea200.width},${currentPrintArea200.height}`}
                </span>
                {draftPrintArea200 && (
                  <span className="text-foreground">
                    {translate({ zh: "草稿(200坐标): ", en: "Draft (200 coords): " })}
                    {`${draftPrintArea200.x},${draftPrintArea200.y},${draftPrintArea200.width},${draftPrintArea200.height}`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="flex-1 p-4 bg-muted/20 overflow-auto">
            <div className="min-h-full w-full mx-auto flex items-center justify-center">
              <div
                ref={canvasRef}
                className="relative select-none"
                style={{
                  width: CANVAS_SIZE.width,
                  height: CANVAS_SIZE.height,
                  transform: `scale(${canvasZoom})`,
                  transformOrigin: "center",
                }}
              >
                  {isDev && isCalibratingPrintArea && (
                    <div
                      className="absolute inset-0 z-40 cursor-crosshair"
                      onMouseDown={handleCalibrateMouseDown}
                      onMouseMove={handleCalibrateMouseMove}
                      onMouseUp={handleCalibrateMouseUp}
                    />
                  )}

                  {isDev && draftPrintAreaCanvas && (
                    <div
                      className="absolute z-30 border-2 border-blue-500/80 bg-blue-500/10 rounded-md pointer-events-none"
                      style={{
                        left: draftPrintAreaCanvas.x,
                        top: draftPrintAreaCanvas.y,
                        width: draftPrintAreaCanvas.width,
                        height: draftPrintAreaCanvas.height,
                      }}
                    />
                  )}

                  {shirtPhotoSrc ? (
                    <NextImage
                      src={shirtPhotoSrc}
                      alt={translate({ zh: "T 恤底图", en: "T-shirt base" })}
                      fill
                      className="object-contain drop-shadow-md"
                      draggable={false}
                      priority
                      unoptimized
                    />
                  ) : (
                    <svg
                      aria-hidden
                      viewBox="0 0 200 200"
                      className="absolute inset-0 w-full h-full drop-shadow-md"
                      role="presentation"
                    >
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
                    ref={printAreaRef}
                    className="absolute border-2 border-dashed border-gray-300/80 rounded-md overflow-hidden bg-white/80 backdrop-blur-sm shadow-sm"
                    style={{
                      left: printArea.x,
                      top: printArea.y,
                      width: printArea.width,
                      height: printArea.height,
                    }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  >
                    <div className="absolute inset-0 pointer-events-none border border-white/50 rounded" />

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
                          transform: `rotate(${element.rotation}deg)`
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
                            <NextImage
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

                            <div
                              className="absolute -top-8 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-green-500 rounded-full cursor-grab border-2 border-white shadow-md hover:scale-110 transition-transform"
                              onMouseDown={(e) => handleMouseDown(e, element.id, "rotate")}
                              title={translate({ zh: "拖曳以旋转", en: "Drag to rotate" })}
                            />

                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full opacity-50" />
                          </>
                        )}
                      </div>
                    ))}

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
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}
