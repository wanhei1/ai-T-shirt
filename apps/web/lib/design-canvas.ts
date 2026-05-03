import { CanvasMeta } from "@v0-t-shirt-design-editor/shared"

// Keep the shirt silhouette comfortable inside a squarish canvas.
export const CANVAS_SIZE = { width: 300, height: 360 }

export type Point = { x: number; y: number }

// Optional: a fixed, user-calibrated printable area in the same 200x200 coordinate space as the shirt SVG.
// When set, the dashed safe area becomes fully stable and will no longer change with any algorithms.
// Use the dev-only print-area calibrator in the editor to generate this.
export const FIXED_PRINT_AREA_200:
  | {
      x: number
      y: number
      width: number
      height: number
    }
  | null = {
  x: 61,
  y: 49,
  width: 80,
  height: 110,
}

// A conservative torso-only printable mask in the same 200x200 coordinate space as the shirt SVG.
// This intentionally excludes sleeves and the collar/neck area.
// You can tweak these points to match your real shirt assets more closely.
export const PRINTABLE_TORSO_MASK_200: Point[] = [
  { x: 66, y: 58 },
  { x: 134, y: 58 },
  { x: 150, y: 98 },
  { x: 150, y: 165 },
  { x: 50, y: 165 },
  { x: 50, y: 98 },
]

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const getXIntersectionsAtY = (polygon: Point[], y: number): number[] => {
  const xs: number[] = []
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (a.y === b.y) continue
    const minY = Math.min(a.y, b.y)
    const maxY = Math.max(a.y, b.y)
    // Half-open interval prevents double-counting shared vertices.
    if (y < minY || y >= maxY) continue
    const t = (y - a.y) / (b.y - a.y)
    xs.push(a.x + t * (b.x - a.x))
  }
  return xs
}

// Finds the largest axis-aligned rectangle fully inside a (convex) polygon by scanning horizontal slices.
// This gives us a conservative printable safe area that follows the torso mask and excludes sleeves/collar.
const getMaxInscribedRectInPolygon = (
  polygon: Point[],
  bounds: { width: number; height: number },
): { x: number; y: number; width: number; height: number } => {
  const minY = Math.max(0, Math.floor(Math.min(...polygon.map((p) => p.y))))
  const maxY = Math.min(bounds.height, Math.ceil(Math.max(...polygon.map((p) => p.y))))

  const left: number[] = new Array(bounds.height).fill(Number.NaN)
  const right: number[] = new Array(bounds.height).fill(Number.NaN)

  for (let y = minY; y < maxY; y += 1) {
    const xs = getXIntersectionsAtY(polygon, y + 0.5)
    if (xs.length < 2) continue
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    left[y] = lo
    right[y] = hi
  }

  let best = { x: 0, y: 0, width: 0, height: 0 }

  const validYs: number[] = []
  for (let y = minY; y < maxY; y += 1) {
    if (!Number.isFinite(left[y]) || !Number.isFinite(right[y])) continue
    if (right[y] <= left[y]) continue
    validYs.push(y)
  }
  if (validYs.length === 0) return best

  const yStart = validYs[0]
  const yEnd = validYs[validYs.length - 1]
  const minHeight = 20

  for (let y0 = yStart; y0 <= yEnd; y0 += 1) {
    if (!Number.isFinite(left[y0]) || !Number.isFinite(right[y0])) continue

    let maxLeft = left[y0]
    let minRight = right[y0]
    for (let y1 = y0 + 1; y1 <= yEnd; y1 += 1) {
      if (!Number.isFinite(left[y1]) || !Number.isFinite(right[y1])) break

      maxLeft = Math.max(maxLeft, left[y1])
      minRight = Math.min(minRight, right[y1])
      const width = minRight - maxLeft
      const height = y1 - y0
      if (height < minHeight || width <= 0) continue

      const area = width * height
      const bestArea = best.width * best.height
      if (area > bestArea) {
        best = { x: maxLeft, y: y0, width, height }
      }
    }
  }

  // Fallback: if something went wrong, use the polygon bounding box.
  if (best.width <= 0 || best.height <= 0) {
    const minX = Math.min(...polygon.map((p) => p.x))
    const maxX = Math.max(...polygon.map((p) => p.x))
    const minY2 = Math.min(...polygon.map((p) => p.y))
    const maxY2 = Math.max(...polygon.map((p) => p.y))
    best = { x: minX, y: minY2, width: maxX - minX, height: maxY2 - minY2 }
  }

  // Clamp to canvas bounds.
  const x = clamp(best.x, 0, bounds.width)
  const y = clamp(best.y, 0, bounds.height)
  const width = clamp(best.x + best.width, 0, bounds.width) - x
  const height = clamp(best.y + best.height, 0, bounds.height) - y
  return { x, y, width, height }
}

export const getPrintableMaskPolygonInCanvas = (canvas: { width: number; height: number }): Point[] => {
  const sx = canvas.width / 200
  const sy = canvas.height / 200
  return PRINTABLE_TORSO_MASK_200.map((p) => ({ x: p.x * sx, y: p.y * sy }))
}

export const getPrintableMaskAndPrintArea = (canvas: { width: number; height: number }) => {
  const polygonCanvas = getPrintableMaskPolygonInCanvas(canvas)
  const sx = canvas.width / 200
  const sy = canvas.height / 200

  const isFixed = Boolean(FIXED_PRINT_AREA_200)

  // Prefer a fixed, user-calibrated area (stable forever).
  // Otherwise compute a conservative, mask-following safe print area.
  const computed = FIXED_PRINT_AREA_200
    ? {
        x: FIXED_PRINT_AREA_200.x * sx,
        y: FIXED_PRINT_AREA_200.y * sy,
        width: FIXED_PRINT_AREA_200.width * sx,
        height: FIXED_PRINT_AREA_200.height * sy,
      }
    : getMaxInscribedRectInPolygon(polygonCanvas, canvas)

  // Small padding to keep elements comfortably inside the printable boundary.
  // For user-calibrated fixed areas, keep the rectangle exact (no extra pad).
  const pad = isFixed ? 0 : 6
  const x = clamp(computed.x + pad, 0, canvas.width)
  const y = clamp(computed.y + pad, 0, canvas.height)
  const width = clamp(computed.x + computed.width - pad, 0, canvas.width) - x
  const height = clamp(computed.y + computed.height - pad, 0, canvas.height) - y

  const polygonInPrintArea = polygonCanvas.map((p) => ({ x: p.x - x, y: p.y - y }))

  return {
    printArea: { x, y, width, height },
    polygonCanvas,
    polygonInPrintArea,
  }
}

// Derived print area (fixed print area if set; else max inscribed rect inside mask).
export const PRINT_AREA = getPrintableMaskAndPrintArea(CANVAS_SIZE).printArea

export const SHIRT_COLOR_HEX: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  navy: "#1f2937",
  gray: "#6b7280",
  red: "#ef4444",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#8b5cf6",
}

// Real shirt photo assets (placed in `frontend/public`).
// Only black/white are currently available; others fall back to the SVG silhouette.
export const SHIRT_PHOTO_SRC: Record<string, string> = {
  black: "/blackshirt.png",
  white: "/whiteshirt.png",
}

export const getShirtColorHex = (colorId?: string) => {
  if (!colorId) return "#f3f4f6"
  return SHIRT_COLOR_HEX[colorId] || colorId || "#f3f4f6"
}

export const getShirtPhotoSrc = (colorId?: string) => {
  if (!colorId) return null
  return SHIRT_PHOTO_SRC[colorId] || null
}

export const buildCanvasMeta = (colorId?: string): CanvasMeta => {
  const { printArea } = getPrintableMaskAndPrintArea(CANVAS_SIZE)
  return {
    width: CANVAS_SIZE.width,
    height: CANVAS_SIZE.height,
    printArea: { ...printArea },
    backgroundColor: getShirtColorHex(colorId),
  }
}
