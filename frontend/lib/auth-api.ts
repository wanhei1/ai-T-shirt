// 简单的API客户端，包含认证处理
const envApiBase = process.env.NEXT_PUBLIC_API_URL || '';
const fallbackApiBase = process.env.NODE_ENV === 'production' ? 'https://api.bit810.cn/api' : 'http://localhost:3002/api';

const potentialApiBases = envApiBase
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);

if (potentialApiBases.length === 0) {
  potentialApiBases.push(fallbackApiBase);
}

const isValidUrl = (candidate: string) => {
  try {
    new URL(candidate);
    return true;
  } catch {
    console.warn(`⚠️ Ignoring invalid API base URL: ${candidate}`);
    return false;
  }
};

const sanitizedApiBases = potentialApiBases.filter(isValidUrl);

if (sanitizedApiBases.length === 0) {
  sanitizedApiBases.push(fallbackApiBase);
}

type ApiErrorType = 'network' | 'http' | 'invalid-response';

interface ApiErrorDetail {
  type: ApiErrorType;
  endpoint: string;
  status?: number;
  statusText?: string;
  serverBody?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly type: ApiErrorType;
  readonly endpoint: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly serverBody?: string;

  constructor(message: string, detail: ApiErrorDetail) {
    super(message);
    this.name = 'ApiError';
    this.type = detail.type;
    this.endpoint = detail.endpoint;
    this.status = detail.status;
    this.statusText = detail.statusText;
    this.serverBody = detail.serverBody;

    // 保留原始错误堆栈，方便调试
    if (detail.cause instanceof Error && detail.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${detail.cause.stack}`;
    }
  }
}

export interface User {
  id: string;
  username: string;
  email: string;
  created_at?: string;
  membership?: unknown;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterResponse {
  token: string;
  user: User;
}

export interface UpdateProfileResponse {
  message: string;
  user: User;
}

class AuthApi {
  private authToken: string | null = null;
  private baseUrlPromise: Promise<string>;

  constructor() {
    this.baseUrlPromise = this.findAvailableBaseUrl();
  }

  private async findAvailableBaseUrl(): Promise<string> {
    for (const baseUrl of sanitizedApiBases) {
      try {
        const healthUrl = new URL('/health', baseUrl).toString();
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          console.log(`✅ Auth API using base URL: ${baseUrl}`);
          return baseUrl;
        }
      } catch (error) {
        console.warn(`⚠️ Auth API connection attempt failed for ${baseUrl}.`, error);
      }
    }

    console.error('🚨 No available Auth API base URL found. Falling back to first configured option.');
    return sanitizedApiBases[0];
  }

  private async getBaseUrl(): Promise<string> {
    return this.baseUrlPromise;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');

    if (this.authToken) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    // Use the URL constructor to correctly join base and path and avoid
    // accidental double-slashes or missing "/api" prefixes.
    const baseUrl = await this.getBaseUrl();
    const endpoint = new URL(url, baseUrl).toString();

    let response: Response;
    try {
      response = await fetch(endpoint, {
        ...options,
        headers,
      });
    } catch (networkError) {
      const message = networkError instanceof Error ? networkError.message : 'Unknown network error';
      throw new ApiError(`无法连接到 ${endpoint}: ${message}`, {
        type: 'network',
        endpoint,
        cause: networkError,
      });
    }

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      let serverDetails = '';

      if (contentType.includes('application/json')) {
        const errorBody = await response.json().catch(() => null);
        if (errorBody && typeof errorBody === 'object') {
          serverDetails = JSON.stringify(errorBody);
        }
      } else {
        const text = await response.text().catch(() => '');
        if (text) {
          serverDetails = text.length > 500 ? `${text.slice(0, 500)}...` : text;
        }
      }

      const statusInfo = `${response.status} ${response.statusText}`.trim();
      const detailSuffix = serverDetails ? ` 服务器返回: ${serverDetails}` : '';
      throw new ApiError(`请求 ${endpoint} 失败 (${statusInfo}).${detailSuffix}`, {
        type: 'http',
        endpoint,
        status: response.status,
        statusText: response.statusText,
        serverBody: serverDetails,
      });
    }

    if (contentType.includes('application/json')) {
      return response.json();
    }

    // 非 JSON 响应时提供更易理解的调试信息
    const text = await response.text().catch(() => '');
    throw new ApiError(`请求 ${endpoint} 成功但响应不是 JSON（content-type: ${contentType || 'unknown'}）。响应内容: ${text.slice(0, 200)}`,
      {
        type: 'invalid-response',
        endpoint,
        serverBody: text,
      });
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    return this.fetchWithAuth('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(username: string, email: string, password: string): Promise<RegisterResponse> {
    return this.fetchWithAuth('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  async getProfile(): Promise<{ user: User }> {
    return this.fetchWithAuth('/api/profile');
  }

  async updateProfile(userData: { username: string }): Promise<UpdateProfileResponse> {
    return this.fetchWithAuth('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }
}

export const authApi = new AuthApi();