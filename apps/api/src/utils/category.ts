export type CanonicalCategory =
  | "realistic"
  | "cartoon"
  | "anime"
  | "abstract"
  | "minimalist"
  | "vintage";

const CANONICAL: CanonicalCategory[] = [
  "realistic",
  "cartoon",
  "anime",
  "abstract",
  "minimalist",
  "vintage",
];

const ALIASES: Record<CanonicalCategory, string[]> = {
  realistic: ["realistic", "Realistic", "写实", "写实风格"],
  cartoon: ["cartoon", "Cartoon", "卡通", "卡通风格"],
  anime: ["anime", "Anime", "漫画", "漫画风格", "动漫", "二次元"],
  abstract: ["abstract", "Abstract", "抽象", "抽象风格"],
  minimalist: ["minimalist", "Minimalist", "简约", "简约风格"],
  vintage: ["vintage", "Vintage", "复古", "复古风格"],
};

function normalizeRawString(value: string): string {
  return value.trim();
}

export function normalizeCategory(value: unknown): CanonicalCategory | null {
  if (typeof value !== "string") return null;
  const raw = normalizeRawString(value);
  if (raw.length === 0) return null;

  // Direct canonical match (case-insensitive)
  const lower = raw.toLowerCase();
  const direct = CANONICAL.find((c) => c === lower);
  if (direct) return direct;

  // Alias match (case/locale-sensitive variants)
  for (const canonical of CANONICAL) {
    if (ALIASES[canonical].some((a) => a === raw || a.toLowerCase() === lower)) {
      return canonical;
    }
  }

  // Heuristic: strip a trailing "风格" and retry
  if (raw.endsWith("风格")) {
    return normalizeCategory(raw.slice(0, -2));
  }

  return null;
}

export function categoryAliases(category: CanonicalCategory): string[] {
  // Ensure uniqueness
  return Array.from(new Set(ALIASES[category]));
}
