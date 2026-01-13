import { CanvasMeta } from "@/types/design"

// Keep the shirt silhouette comfortable inside a squarish canvas.
export const CANVAS_SIZE = { width: 300, height: 360 }

// Define a centered print area that never protrudes outside the shirt path.
const PRINT_W = 120
const PRINT_H = 120
export const PRINT_AREA = {
  x: (CANVAS_SIZE.width - PRINT_W) / 2,
  y: (CANVAS_SIZE.height - PRINT_H) / 2,
  width: PRINT_W,
  height: PRINT_H,
}

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
  return {
    width: CANVAS_SIZE.width,
    height: CANVAS_SIZE.height,
    printArea: { ...PRINT_AREA },
    backgroundColor: getShirtColorHex(colorId),
  }
}
