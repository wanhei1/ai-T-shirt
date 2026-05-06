"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import apiClient, { type ApiClientError } from '@/lib/api-client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Download, Share2, ShoppingCart, Palette, RotateCcw, Check } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/contexts/language-context"
import { buildCanvasMeta, CANVAS_SIZE, getShirtColorHex, getShirtPhotoSrc } from "@/lib/design-canvas"
import { hydrateDesignAssets } from "@/lib/design-storage"
import { pollJobUntilDone } from "@/lib/job-polling"
import type { DesignData, DesignElement, CanvasMeta } from "@/types/design"

type TryOnModelGender = "male" | "female"

const isAbortLikeError = (error: unknown) => {
  if (!error) return false
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (error instanceof Error && error.name === "AbortError") return true
  if (error instanceof Error && /任务已取消|aborted|aborterror/i.test(error.message)) return true
  return false
}
const TRYON_MODEL_STORAGE_KEY = "tryOnModelGender"
const TRYON_CACHE_STORAGE_KEY = "tryOnCacheV1"

type TryOnCache = {
  signature: string
  gender: "male" | "female"
  front: string | null
  back: string | null
  createdAt: number
}

const readTryOnCache = (): TryOnCache | null => {
  if (typeof window === "undefined") return null
  const read = (storage: Storage) => {
    try {
      const raw = storage.getItem(TRYON_CACHE_STORAGE_KEY)
      return raw ? (JSON.parse(raw) as TryOnCache) : null
    } catch {
      return null
    }
  }
  return read(window.localStorage) || read(window.sessionStorage)
}

const writeTryOnCache = (cache: TryOnCache): void => {
  if (typeof window === "undefined") return
  const raw = JSON.stringify(cache)
  try {
    window.localStorage.setItem(TRYON_CACHE_STORAGE_KEY, raw)
    return
  } catch {
    // localStorage may exceed quota for large payloads
  }
  try {
    window.sessionStorage.setItem(TRYON_CACHE_STORAGE_KEY, raw)
  } catch {
    // ignore storage failures
  }
}

const removeTryOnCache = (): void => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(TRYON_CACHE_STORAGE_KEY)
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(TRYON_CACHE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

const stableStringify = (value: unknown): string => {
  const sortRecursively = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortRecursively)
    }
    if (input && typeof input === "object") {
      const obj = input as Record<string, unknown>
      const sortedKeys = Object.keys(obj).sort((a, b) => a.localeCompare(b))
      const sorted: Record<string, unknown> = {}
      for (const key of sortedKeys) {
        sorted[key] = sortRecursively(obj[key])
      }
      return sorted
    }
    return input
  }

  return JSON.stringify(sortRecursively(value))
}

export default function PreviewPage() {
  const router = useRouter()
  const { translate } = useLanguage()
  const canvasRef = useRef<HTMLDivElement>(null)
  const tryOnPollControllerRef = useRef<AbortController | null>(null)
  const [designData, setDesignData] = useState<DesignData | null>(null)
  const [currentView, setCurrentView] = useState<"front" | "back">("front")
  const [isExporting, setIsExporting] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentConfirming, setPaymentConfirming] = useState(false)
  const [isTryOnLoading, setIsTryOnLoading] = useState(false)
  const [tryOnError, setTryOnError] = useState<string | null>(null)
  const [tryOnEnabled, setTryOnEnabled] = useState(false)
  const [tryOnSnapshots, setTryOnSnapshots] = useState<{ front: string | null; back: string | null } | null>(null)
  const [designTryOnSignature, setDesignTryOnSignature] = useState<string | null>(null)
  const [address, setAddress] = useState("")

  const activeTryOnUrl = useMemo(() => {
    if (!tryOnEnabled) return null
    return currentView === "back" ? tryOnSnapshots?.back ?? null : tryOnSnapshots?.front ?? null
  }, [currentView, tryOnEnabled, tryOnSnapshots])

  // 进入预览页后直接读取编辑页生成的试穿缓存
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const parsed = readTryOnCache()
      if (!parsed) return
      const front = typeof parsed.front === "string" && parsed.front.length > 0 ? parsed.front : null
      const back = typeof parsed.back === "string" && parsed.back.length > 0 ? parsed.back : null
      if (front || back) {
        setTryOnSnapshots({ front, back })
        setTryOnEnabled(true)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!tryOnEnabled) return
    if (activeTryOnUrl) return

    // If the current side has no try-on result, fall back to design preview
    // instead of showing a blank try-on view.
    setTryOnEnabled(false)
  }, [activeTryOnUrl, tryOnEnabled])

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

  const renderTryOnClothSnapshot = async (side: "front" | "back") => {
    if (!designData) return null
    const sideElements = (designData.elements || []).filter((el) => el.visible && el.side === side)

    // Prefer rendering try-on cloth on the base shirt image at its native size.
    // This avoids adding an artificial background behind the garment, which can
    // confuse mask generation compared with backend inputs.
    if (!shirtPhotoSrc) {
      return renderSnapshot(side)
    }

    const meta = resolvedCanvasMeta
    const base = await loadImage(shirtPhotoSrc)
    if (side === "back" && sideElements.length === 0) {
      const photoCanvas = document.createElement("canvas")
      photoCanvas.width = base.naturalWidth || base.width
      photoCanvas.height = base.naturalHeight || base.height
      const photoCtx = photoCanvas.getContext("2d")
      if (!photoCtx) return null
      photoCtx.drawImage(base, 0, 0, photoCanvas.width, photoCanvas.height)
      // Keep empty-back cloth as plain shirt photo to avoid print-area frame artifacts.
      return photoCanvas.toDataURL("image/jpeg", 0.95)
    }

    const baseWidth = base.naturalWidth || base.width
    const baseHeight = base.naturalHeight || base.height

    const canvas = document.createElement("canvas")
    canvas.width = baseWidth
    canvas.height = baseHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    // Keep canvas transparent; only draw the garment and the print.
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height)

    const sx = canvas.width / meta.width
    const sy = canvas.height / meta.height
    const fontScale = (sx + sy) / 2

    ctx.save()
    ctx.translate(meta.printArea.x * sx, meta.printArea.y * sy)
    ctx.beginPath()
    ctx.rect(0, 0, meta.printArea.width * sx, meta.printArea.height * sy)
    ctx.clip()

    for (const element of sideElements) {
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
        } catch (error) {
          console.warn("Skip image in try-on cloth snapshot", error)
        }
      }

      ctx.restore()
    }

    ctx.restore()
    return canvas.toDataURL("image/png")
  }

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

  const renderElementOnlySnapshot = async (side: "front" | "back") => {
    if (!designData) return null

    const meta = resolvedCanvasMeta
    const scale = 2
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(meta.printArea.width * scale))
    canvas.height = Math.max(1, Math.round(meta.printArea.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    ctx.clearRect(0, 0, canvas.width, canvas.height)

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
          console.warn("Skip image in element-only snapshot", error)
        }
      }

      ctx.restore()
    }

    return canvas.toDataURL("image/png")
  }

  const estimatedTotal = useMemo(() => {
    if (!designData) return 0
    return Number(designData.selections.price.toFixed(2))
  }, [designData])

  useEffect(() => {
    const storedDesignData = localStorage.getItem("designData")
    if (!storedDesignData) return

    const load = async () => {
      try {
        const parsed = JSON.parse(storedDesignData) as DesignData
        const signature = parsed?.tryOnSignature
        setDesignTryOnSignature(typeof signature === "string" ? signature : null)
        if (!parsed.canvas) {
          parsed.canvas = buildCanvasMeta(parsed?.selections?.color)
        }
        const hydrated = await hydrateDesignAssets(parsed)
        setDesignData(hydrated)
      } catch (error) {
        console.error("Failed to parse design data", error)
      }
    }

    load()
  }, [])

  useEffect(() => {
    if (!designData || typeof window === "undefined") return
    try {
      const cached = readTryOnCache()
      if (!cached) return
      const genderRaw = window.localStorage.getItem(TRYON_MODEL_STORAGE_KEY) as TryOnModelGender | null
      const gender: TryOnModelGender = genderRaw === "female" ? "female" : "male"
      const signature = designTryOnSignature || computeTryOnSignature(gender)
      if (!cached || cached.signature !== signature) {
        removeTryOnCache()
        setTryOnSnapshots(null)
        setTryOnEnabled(false)
      }
    } catch {
      // ignore
    }
  }, [designData, designTryOnSignature])

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

  const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read blob"))
      reader.readAsDataURL(blob)
    })

  const pollTryOnJob = async (queue: string, jobId: string | number) => {
    if (tryOnPollControllerRef.current && !tryOnPollControllerRef.current.signal.aborted) {
      tryOnPollControllerRef.current.abort("superseded-by-new-tryon")
    }
    const controller = new AbortController()
    tryOnPollControllerRef.current = controller

    return pollJobUntilDone({
      queue,
      jobId,
      fetchStatus: apiClient.getJobStatus.bind(apiClient),
      getResult: (job) => job?.result?.imageUrl as string | undefined,
      getFailedReason: (job) => job?.failedReason as string | undefined,
      timeoutMs: 10 * 60 * 1000,
      timeoutMessage: "试穿任务等待超时，请稍后重试",
      signal: controller.signal,
    })
      .finally(() => {
        if (tryOnPollControllerRef.current === controller) {
          tryOnPollControllerRef.current = null
        }
      })
  }

  useEffect(() => {
    return () => {
      tryOnPollControllerRef.current?.abort()
      tryOnPollControllerRef.current = null
    }
  }, [])

  const resizeDataUrlToTarget = async (dataUrl: string, width = 768, height = 1024): Promise<string> => {
    const img = await loadImage(dataUrl)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return dataUrl

    // Keep aspect ratio to avoid stretching garments/person, which can break try-on quality.
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
    const drawWidth = Math.max(1, Math.round(img.width * scale))
    const drawHeight = Math.max(1, Math.round(img.height * scale))
    const offsetX = Math.floor((canvas.width - drawWidth) / 2)
    const offsetY = Math.floor((canvas.height - drawHeight) / 2)
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

    return canvas.toDataURL("image/png")
  }

  const cropModelToUpperBody = async (dataUrl: string, side: "front" | "back"): Promise<string> => {
    const img = await loadImage(dataUrl)
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    const ratio = 0.66
    const cropHeight = Math.max(1, Math.round(height * ratio))

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = cropHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, width, cropHeight, 0, 0, width, cropHeight)
    return canvas.toDataURL("image/png")
  }

  const getTryOnModelSrc = (gender: TryOnModelGender, side: "front" | "back") => {
    if (gender === "female") {
      return side === "back" ? "/femalemodelback.png" : "/femalemodel.png"
    }
    return side === "back" ? "/malemodelback.jpg" : "/malemodel.png"
  }

  const computeTryOnSignature = (gender: TryOnModelGender) => {
    const normElements = [...(designData?.elements || [])]
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

    return stableStringify({ selections: designData?.selections, elements: normElements, gender })
  }

  const loadModelFile = async (src: string) => {
    const resp = await fetch(src)
    if (!resp.ok) {
      throw new Error(`无法加载模特图片: ${src}`)
    }
    const blob = await resp.blob()
    const filename = src.split("/").pop() || "model.png"
    return new File([blob], filename, { type: blob.type || "image/png" })
  }

  const runTryOn = async (side: "front" | "back") => {
    if (!designData) return
    setIsTryOnLoading(true)
    setTryOnError(null)

    try {
      const rawGender = (typeof window !== "undefined" ? window.localStorage.getItem(TRYON_MODEL_STORAGE_KEY) : null) as
        | TryOnModelGender
        | null
      const gender: TryOnModelGender = rawGender === "female" ? "female" : "male"
      const personFile = await loadModelFile(getTryOnModelSrc(gender, side))

      const personDataUrl = await readBlobAsDataUrl(personFile)
      const personTorsoDataUrl = await cropModelToUpperBody(personDataUrl, side)
      const resizedPersonDataUrl = await resizeDataUrlToTarget(personTorsoDataUrl)

      const clothSnapshot = await renderTryOnClothSnapshot(side)
      if (!clothSnapshot) {
        throw new Error("无法生成衣服快照")
      }

      const resizedClothSnapshot = await resizeDataUrlToTarget(clothSnapshot)

      const jobResp = await apiClient.createJob({
        type: "virtual-tryon",
        payload: {
          personDataUrl: resizedPersonDataUrl,
          clothDataUrl: resizedClothSnapshot,
          clothType: "upper",
        },
      })

      const imageUrl = await pollTryOnJob(jobResp.queue, jobResp.jobId)
      if (!imageUrl) {
        throw new Error("试穿结果为空")
      }

      const next = {
        front: side === "front" ? imageUrl : tryOnSnapshots?.front ?? null,
        back: side === "back" ? imageUrl : tryOnSnapshots?.back ?? null,
      }

      setTryOnSnapshots(next)
      setTryOnEnabled(true)

      const cache: TryOnCache = {
        signature: computeTryOnSignature(gender),
        gender,
        front: next.front,
        back: next.back,
        createdAt: Date.now(),
      }
      writeTryOnCache(cache)
    } catch (error) {
      if (isAbortLikeError(error)) {
        return
      }
      const err = error as ApiClientError
      if (err?.code === "AI_DISABLED") {
        setTryOnError(
          translate({
            zh: "AI 定制功能暂时关闭，试穿不可用。请先完成模板设计或稍后再试。",
            en: "AI customization is temporarily disabled. Virtual try-on is unavailable for now.",
          })
        )
        return
      }
      setTryOnError(error instanceof Error ? error.message : "试穿失败")
    } finally {
      setIsTryOnLoading(false)
    }
  }

  const handlePreviewClick = () => {
    if (isTryOnLoading) return
    // 点击逻辑：已显示试穿 -> 切回设计预览；否则生成当前面的试穿
    if (tryOnEnabled && activeTryOnUrl) {
      setTryOnEnabled(false)
      return
    }
    const hasCached = currentView === "back" ? Boolean(tryOnSnapshots?.back) : Boolean(tryOnSnapshots?.front)
    if (!tryOnEnabled && hasCached) {
      setTryOnEnabled(true)
      return
    }
    runTryOn(currentView).catch(() => {})
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
    if (!address.trim()) {
      alert(translate({ zh: "请填写收货地址", en: "Please provide a shipping address" }))
      return
    }

    try {
      setIsSubmitting(true)

      const [frontSnapshot, backSnapshot, frontElementSnapshot, backElementSnapshot] = await Promise.all([
        renderSnapshot("front"),
        renderSnapshot("back"),
        renderElementOnlySnapshot("front"),
        renderElementOnlySnapshot("back"),
      ])

      const canvasForSave: CanvasMeta = {
        ...resolvedCanvasMeta,
        snapshots: { front: frontSnapshot, back: backSnapshot },
        elementSnapshots: { front: frontElementSnapshot, back: backElementSnapshot },
      }

      const getTryOnCache = () => {
        return readTryOnCache()
      }

      let cache = getTryOnCache()
      let tryOnFront = typeof cache?.front === "string" && cache.front.length > 0 ? cache.front : null
      let tryOnBack = typeof cache?.back === "string" && cache.back.length > 0 ? cache.back : null

      if (!tryOnFront) {
        await runTryOn("front")
      }
      if (!tryOnBack) {
        await runTryOn("back")
      }

      cache = getTryOnCache()
      tryOnFront = typeof cache?.front === "string" && cache.front.length > 0 ? cache.front : tryOnSnapshots?.front ?? null
      tryOnBack = typeof cache?.back === "string" && cache.back.length > 0 ? cache.back : tryOnSnapshots?.back ?? null

      if (!tryOnFront || !tryOnBack) {
        throw new Error("试穿图生成失败，请重试")
      }

      const category = (() => {
        if (typeof designData?.category === "string" && designData.category.trim().length > 0) {
          return designData.category.trim()
        }
        try {
          const raw = window.localStorage.getItem("designCategory")
          return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null
        } catch {
          return null
        }
      })()

      const payload = {
        total,
        // Save full element layout info (position/size/rotation/side/etc) so the order can be faithfully reproduced.
        items: designData.elements,
        selections: designData.selections,
        design: { ...designData, canvas: canvasForSave },
        category,
        // 订单存储的 canvas_* 用于商城/首页展示：优先使用试穿结果
        canvas: {
          frontSnapshot: tryOnFront ?? frontSnapshot,
          backSnapshot: tryOnBack ?? backSnapshot,
          meta: resolvedCanvasMeta,
        },
        publishToAll: true,
        sourceAllId: null,
        shipping_info: { address: address.trim() },
        address: address.trim()
      };

      const result = await apiClient.createOrder(payload);
      const orderId = (result as any)?.order?.id || (result as any)?.id;
      setPlacedOrderId(orderId || null);
      setShowPayment(true);
      setOrderPlaced(true);
    } catch (error) {
      console.error('Order submission failed:', error)
      const err = error as ApiClientError
      const status = err?.status
      const message = err?.message || ""
      const codeTag = err?.code ? ` [${err.code}]` : ""
      const requestTag = err?.requestId ? ` (requestId: ${err.requestId})` : ""
      if (status === 403 && message.toLowerCase().includes("membership")) {
        alert(translate({ zh: "需要有效会员才能下单", en: "An active membership is required to place orders." }))
        router.push("/membership")
        return
      }
      if (status === 401 || message.includes("authenticate token")) {
        alert(translate({ zh: "登录已失效，请重新登录", en: "Session expired, please sign in again." }))
        router.push("/auth")
        return
      }
      if (status === 402 || message.toLowerCase().includes("insufficient")) {
        alert(translate({ zh: "会员余额不足，请充值/续费后再下单", en: "Insufficient membership balance. Please top up/renew to continue." }))
        router.push("/membership")
        return
      }
      alert(`${translate({ zh: "下单失败，请重试", en: "Failed to place order. Please try again." })}${codeTag}${requestTag}`)
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

  if (orderPlaced && showPayment) {
    const handleConfirmPayment = async () => {
      if (!placedOrderId) {
        router.push("/profile");
        return;
      }
      setPaymentConfirming(true);
      try {
        await apiClient.createPaymentIntent({
          orderId: placedOrderId,
          channel: "alipay",
          amount: estimatedTotal,
        });
      } catch {
        // ignore — payment intent is best-effort
      }
      router.push("/profile");
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-6 space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold">
              {translate({ zh: "订单已创建", en: "Order Placed!" })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {translate({
                zh: "请使用支付宝扫描下方二维码完成支付",
                en: "Scan the QR code below with Alipay to complete payment",
              })}
            </p>
            <div className="flex justify-center">
              <img
                src="/alipay-qr.jpg"
                alt="Alipay QR Code"
                className="w-56 h-56 rounded-lg border"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {translate({
                zh: `支付金额：¥${estimatedTotal.toFixed(2)}`,
                en: `Amount: ¥${estimatedTotal.toFixed(2)}`,
              })}
            </p>
            <Button
              onClick={handleConfirmPayment}
              className="w-full"
              disabled={paymentConfirming}
            >
              {paymentConfirming
                ? translate({ zh: "处理中...", en: "Processing..." })
                : translate({ zh: "我已支付", en: "I've Paid" })}
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push("/profile")}
              className="w-full"
            >
              {translate({ zh: "稍后支付", en: "Pay Later" })}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
                      className="relative select-none border-2 border-border rounded-lg shadow-lg cursor-pointer"
                      style={{ width: CANVAS_SIZE.width, height: CANVAS_SIZE.height }}
                      onClick={handlePreviewClick}
                      title={translate({ zh: "点击生成/切换模特试穿效果", en: "Click to generate/toggle virtual try-on" })}
                    >
                      {tryOnEnabled && activeTryOnUrl ? (
                        <img
                          src={activeTryOnUrl}
                          alt={translate({ zh: "模特试穿效果", en: "Try-on result" })}
                          className="absolute inset-0 w-full h-full object-contain"
                        />
                      ) : (
                        <>
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
                        </>
                      )}

                      {isTryOnLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                          <div className="text-sm text-muted-foreground">
                            {translate({ zh: "试穿生成中...", en: "Generating try-on..." })}
                          </div>
                        </div>
                      ) : null}

                      {tryOnError ? (
                        <div className="absolute bottom-2 left-2 right-2 text-xs text-destructive bg-background/80 border border-border rounded px-2 py-1">
                          {tryOnError}
                        </div>
                      ) : null}

                      {!tryOnEnabled && !isTryOnLoading ? (
                        <div className="absolute bottom-2 left-2 right-2 text-xs text-muted-foreground bg-background/80 border border-border rounded px-2 py-1">
                          {translate({ zh: "点击画布生成模特试穿效果", en: "Click to generate try-on" })}
                        </div>
                      ) : null}

                      {tryOnEnabled && !activeTryOnUrl ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                          <div className="text-sm text-muted-foreground">
                            {translate({ zh: "未找到试穿结果，点击画布即可生成", en: "Try-on not found. Click to generate." })}
                          </div>
                        </div>
                      ) : null}
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
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {translate({ zh: "收货地址", en: "Shipping Address" })}
                    </label>
                    <Textarea
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder={translate({ zh: "请填写详细收货地址", en: "Enter full shipping address" })}
                      className="min-h-[90px]"
                    />
                  </div>
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
