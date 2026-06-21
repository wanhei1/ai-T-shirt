type ValidationIssue = {
  field: string;
  code: string;
  message: string;
};

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationIssue[] };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const trimString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
};

const slugPattern = /^[a-z0-9][a-z0-9-]{2,78}[a-z0-9]$/;

export type UpsertStorePayload = {
  slug: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  tags: string[];
};

export const validateUpsertStorePayload = (input: unknown): ValidationResult<UpsertStorePayload> => {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", code: "invalid_body", message: "Request body must be an object" }] };
  }

  const errors: ValidationIssue[] = [];
  const slug = trimString(input.slug)?.toLowerCase();
  const displayName = trimString(input.displayName);
  const bio = trimString(input.bio);
  const avatarUrl = trimString(input.avatarUrl);
  const bannerUrl = trimString(input.bannerUrl);

  if (!slug || !slugPattern.test(slug)) {
    errors.push({ field: "slug", code: "invalid_slug", message: "slug must be 4-80 chars and contain lowercase letters, numbers, or hyphens" });
  }
  if (!displayName || displayName.length > 120) {
    errors.push({ field: "displayName", code: "invalid_display_name", message: "displayName is required and must be <= 120 chars" });
  }
  if (bio && bio.length > 600) {
    errors.push({ field: "bio", code: "invalid_bio", message: "bio must be <= 600 chars" });
  }
  if (avatarUrl && avatarUrl.length > 1024) {
    errors.push({ field: "avatarUrl", code: "invalid_avatar_url", message: "avatarUrl must be <= 1024 chars" });
  }
  if (bannerUrl && bannerUrl.length > 1024) {
    errors.push({ field: "bannerUrl", code: "invalid_banner_url", message: "bannerUrl must be <= 1024 chars" });
  }

  if (errors.length) return { success: false, errors };
  return { success: true, data: { slug: slug as string, displayName: displayName as string, bio, avatarUrl, bannerUrl, tags: parseTags(input.tags) } };
};

export type CreateStoreProductPayload = {
  allDesignId: number;
  title: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  tags: string[];
  status: "draft" | "active";
  imageUrls: string[];
};

export const validateCreateStoreProductPayload = (input: unknown): ValidationResult<CreateStoreProductPayload> => {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "body", code: "invalid_body", message: "Request body must be an object" }] };
  }

  const errors: ValidationIssue[] = [];
  const allDesignId = Number(input.allDesignId);
  const title = trimString(input.title);
  const description = trimString(input.description);
  const price = Number(input.price);
  const compareAtPrice = input.compareAtPrice === undefined || input.compareAtPrice === null ? undefined : Number(input.compareAtPrice);
  const status = input.status === "active" ? "active" : "draft";
  const imageUrls = Array.isArray(input.imageUrls)
    ? input.imageUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 8)
    : [];

  if (!Number.isInteger(allDesignId) || allDesignId <= 0) {
    errors.push({ field: "allDesignId", code: "invalid_all_design_id", message: "allDesignId must be a positive integer" });
  }
  if (!title || title.length > 160) {
    errors.push({ field: "title", code: "invalid_title", message: "title is required and must be <= 160 chars" });
  }
  if (description && description.length > 2000) {
    errors.push({ field: "description", code: "invalid_description", message: "description must be <= 2000 chars" });
  }
  if (!Number.isFinite(price) || price <= 0 || price > 99999) {
    errors.push({ field: "price", code: "invalid_price", message: "price must be between 0 and 99999" });
  }
  if (compareAtPrice !== undefined && (!Number.isFinite(compareAtPrice) || compareAtPrice <= 0 || compareAtPrice > 99999)) {
    errors.push({ field: "compareAtPrice", code: "invalid_compare_at_price", message: "compareAtPrice must be between 0 and 99999" });
  }

  if (errors.length) return { success: false, errors };
  return {
    success: true,
    data: {
      allDesignId,
      title: title as string,
      description,
      price,
      compareAtPrice,
      tags: parseTags(input.tags),
      status,
      imageUrls,
    },
  };
};
