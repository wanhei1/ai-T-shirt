import type { DesignData, DesignElement } from "@/types/design"

const DB_NAME = "design-assets-v1"
const STORE_NAME = "assets"
const IDB_PREFIX = "idb:"
const EXTERNALIZE_THRESHOLD = 20000

type AssetEntry = { key: string; value: string }

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("indexedDB unavailable"))
      return
    }
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Failed to open indexedDB"))
  })

const withStore = async <T>(mode: IDBTransactionMode, cb: (store: IDBObjectStore) => void) => {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    cb(store)
    tx.oncomplete = () => resolve(undefined as T)
    tx.onerror = () => reject(tx.error || new Error("indexedDB transaction failed"))
    tx.onabort = () => reject(tx.error || new Error("indexedDB transaction aborted"))
  })
}

const setAssets = async (entries: AssetEntry[]) => {
  if (entries.length === 0) return
  await withStore<void>("readwrite", (store) => {
    entries.forEach((entry) => {
      store.put(entry.value, entry.key)
    })
  })
}

const getAsset = async (key: string): Promise<string | null> => {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as string) || null)
      req.onerror = () => reject(req.error || new Error("indexedDB get failed"))
    })
  } catch {
    return null
  }
}

const rebuildSides = (elements: DesignElement[]) => ({
  front: elements.filter((el) => el.side === "front"),
  back: elements.filter((el) => el.side === "back"),
})

export const externalizeDesignAssets = async (designData: DesignData): Promise<DesignData> => {
  if (typeof window === "undefined" || !("indexedDB" in window)) return designData

  const entries: AssetEntry[] = []
  const elements = designData.elements.map((el) => {
    if (el.type !== "text" && typeof el.content === "string" && el.content.startsWith("data:")) {
      if (el.content.length > EXTERNALIZE_THRESHOLD) {
        const key = `element:${el.id}`
        entries.push({ key, value: el.content })
        return { ...el, content: `${IDB_PREFIX}${key}` }
      }
    }
    return el
  })

  try {
    await setAssets(entries)
  } catch {
    return designData
  }

  return {
    ...designData,
    elements,
    sides: rebuildSides(elements),
  }
}

export const hydrateDesignAssets = async (designData: DesignData): Promise<DesignData> => {
  if (typeof window === "undefined" || !("indexedDB" in window)) return designData

  const elements = await Promise.all(
    designData.elements.map(async (el) => {
      if (typeof el.content === "string" && el.content.startsWith(IDB_PREFIX)) {
        const key = el.content.slice(IDB_PREFIX.length)
        const value = await getAsset(key)
        if (value) {
          return { ...el, content: value }
        }
      }
      return el
    })
  )

  return {
    ...designData,
    elements,
    sides: rebuildSides(elements),
  }
}
