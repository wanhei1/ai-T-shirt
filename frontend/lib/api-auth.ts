/**
 * Shared auth helpers for Next.js API routes.
 *
 * Uses `jose` (Edge-compatible JWT) instead of `jsonwebtoken`.
 * These routes run inside the Next.js server, NOT Express.
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

const secretKey = new TextEncoder().encode(
  process.env.JWT_SECRET || "your_secret_key"
);

export interface AuthPayload extends JWTPayload {
  id: number;
  email?: string;
}

/**
 * Extract and verify the Bearer token from the request.
 */
export async function verifyAuth(request: NextRequest): Promise<
  | { ok: true; user: AuthPayload }
  | { ok: false; response: NextResponse }
> {
  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("Authorization");

  if (!authHeader) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "未登录，请先登录" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "无效的认证令牌" },
        { status: 401 }
      ),
    };
  }

  try {
    const { payload } = await jwtVerify(token, secretKey);
    return { ok: true, user: payload as AuthPayload };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "认证令牌已过期或无效" },
        { status: 401 }
      ),
    };
  }
}

/**
 * Require authentication — throws AuthError if not logged in.
 * Usage:
 *   try {
 *     const user = await requireAuth(request);
 *     // ... use user.id
 *   } catch (e) {
 *     return handleAuthError(e);
 *   }
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthPayload> {
  const result = await verifyAuth(request);
  if (!result.ok) {
    throw new AuthError(result.response);
  }
  return result.user;
}

export class AuthError extends Error {
  response: NextResponse;
  constructor(response: NextResponse) {
    super("Auth required");
    this.response = response;
  }
}

/**
 * Handle AuthError in catch blocks.
 */
export function handleAuthError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return error.response;
  }
  return null;
}

/**
 * Simple in-memory rate limiter (sliding window).
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}
