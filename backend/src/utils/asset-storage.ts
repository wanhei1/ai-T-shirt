import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export type StoredAssetRef = {
  path: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
};

type ExternalizeOptions = {
  context?: string;
  minBytes?: number;
};

type ExternalizeResult<T> = {
  value: T;
  assets: StoredAssetRef[];
};

const DATA_URL_PREFIX = 'data:';

const mimeToExt = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/svg+xml') return 'svg';
  return 'bin';
};

const parseDataUrl = (value: string) => {
  if (!value.startsWith(DATA_URL_PREFIX)) return null;
  const commaIndex = value.indexOf(',');
  if (commaIndex < 0) return null;

  const header = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1);
  const isBase64 = header.toLowerCase().includes(';base64');
  const mimeType = header.split(';')[0] || 'application/octet-stream';

  if (!isBase64) {
    return null;
  }

  try {
    const buffer = Buffer.from(payload, 'base64');
    return { buffer, mimeType };
  } catch {
    return null;
  }
};

const getStorageDir = () => {
  const configured = process.env.ASSET_STORAGE_DIR?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), 'storage', 'assets');
};

const getPublicBaseUrl = () => {
  const configured = process.env.ASSET_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return '/assets';
};

const getInlineMaxBytes = () => {
  const configured = Number.parseInt(process.env.ASSET_INLINE_MAX_BYTES || '131072', 10);
  if (!Number.isFinite(configured) || configured < 0) return 131072;
  return configured;
};

const shouldExternalize = (mimeType: string, sizeBytes: number, minBytes: number) => {
  if (!mimeType.toLowerCase().startsWith('image/')) return false;
  return sizeBytes >= minBytes;
};

const storeBuffer = async (buffer: Buffer, mimeType: string, context: string): Promise<StoredAssetRef> => {
  const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
  const ext = mimeToExt(mimeType);
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `${context}-${datePrefix}-${randomUUID()}.${ext}`;

  const storageDir = getStorageDir();
  await mkdir(storageDir, { recursive: true });
  const absolutePath = path.join(storageDir, fileName);
  await writeFile(absolutePath, buffer);

  const publicBaseUrl = getPublicBaseUrl();
  const url = `${publicBaseUrl}/${fileName}`;

  return {
    path: absolutePath,
    url,
    mimeType,
    sizeBytes: buffer.byteLength,
    checksumSha256,
  };
};

const normalizeContext = (context?: string) => {
  const value = (context || 'asset').trim().toLowerCase();
  return value.replace(/[^a-z0-9_-]/g, '-') || 'asset';
};

const isPlainObject = (input: unknown): input is Record<string, unknown> => {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
};

export const externalizeImageDataUrls = async <T>(
  input: T,
  options?: ExternalizeOptions
): Promise<ExternalizeResult<T>> => {
  const minBytes = options?.minBytes ?? getInlineMaxBytes();
  const context = normalizeContext(options?.context);
  const assets: StoredAssetRef[] = [];

  const visit = async (node: unknown): Promise<unknown> => {
    if (typeof node === 'string') {
      const parsed = parseDataUrl(node);
      if (!parsed) return node;

      if (!shouldExternalize(parsed.mimeType, parsed.buffer.byteLength, minBytes)) {
        return node;
      }

      const stored = await storeBuffer(parsed.buffer, parsed.mimeType, context);
      assets.push(stored);
      return stored.url;
    }

    if (Array.isArray(node)) {
      const transformed: unknown[] = [];
      for (const item of node) {
        transformed.push(await visit(item));
      }
      return transformed;
    }

    if (isPlainObject(node)) {
      const transformed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        transformed[key] = await visit(value);
      }
      return transformed;
    }

    return node;
  };

  const value = (await visit(input)) as T;
  return { value, assets };
};
