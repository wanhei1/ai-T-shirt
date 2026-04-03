export type DesignElementType = "text" | "image" | "ai-generated"

export type DesignElement = {
  id: string
  type: DesignElementType
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

export type TShirtSelections = {
  style: string
  color: string
  size: string
  price: number
}

export type CanvasMeta = {
  width: number
  height: number
  printArea: { x: number; y: number; width: number; height: number }
  backgroundColor: string
  snapshots?: { front?: string | null; back?: string | null }
  elementSnapshots?: { front?: string | null; back?: string | null }
}

export type DesignData = {
  category?: string | null
  tryOnSignature?: string | null
  selections: TShirtSelections
  elements: DesignElement[]
  sides?: {
    front?: DesignElement[]
    back?: DesignElement[]
  }
  canvas?: CanvasMeta
}
