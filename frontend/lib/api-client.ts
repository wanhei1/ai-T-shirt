import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@/types/auth';

export type ApiClientError = Error & {
  status?: number;
  code?: string;
  requestId?: string | null;
  details?: unknown;
};

const isAbortLikeError = (error: unknown) => {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof Error && /aborted|aborterror/i.test(error.message)) return true;
  return false;
};

// --- Start of new, robust implementation ---

// 1. Get the list of potential API URLs from environment variables.
const apiUrlsString = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8185';
const envApiUrls = apiUrlsString.split(',').map(url => url.trim()).filter(Boolean);
const defaultApiUrls = ['http://localhost:8185', 'http://localhost:8189', 'http://localhost:8181'];
const browserProxyBaseUrl = typeof window !== 'undefined' ? `${window.location.origin}/backend` : null;

const dedupeUrls = (urls: string[]) => Array.from(new Set(urls));
const potentialApiUrls = dedupeUrls([
  ...(browserProxyBaseUrl ? [browserProxyBaseUrl] : []),
  ...envApiUrls,
  ...defaultApiUrls,
]);

// 2. A variable to hold the determined, working API base URL. This acts as a cache.
let determinedApiBaseUrl: string | null = null;

// 3. Asynchronously find the first available API URL by testing them.
const findAvailableApiUrl = async (): Promise<string> => {
  // If we've already found a working URL, return it immediately.
  if (determinedApiBaseUrl) {
    return determinedApiBaseUrl;
  }

  for (const url of potentialApiUrls) {
    try {
      // Use the /health endpoint for a quick and lightweight check.
      const healthCheckUrl = `${url}/health`;
      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        console.log(`✅ API connection successful. Using base URL: ${url}`);
        determinedApiBaseUrl = url; // Cache the working URL
        return url;
      }
    } catch (error) {
      console.warn(`⚠️ API connection attempt failed for ${url}.`);
    }
  }

  // If no URL is available after checking all, fall back to the first one.
  // This allows for error messages on the UI instead of a total crash.
  console.error("🚨 No available API server found from the list. Falling back to the first configured URL.");
  determinedApiBaseUrl = potentialApiUrls[0] || 'http://localhost:8185';
  return determinedApiBaseUrl;
};

class ApiClient {
  // This promise will resolve to the available base URL.
  // It's initialized once and reused for all method calls.
  private baseUrlPromise: Promise<string>;

  constructor() {
    this.baseUrlPromise = findAvailableApiUrl();
  }

  // Helper to get the resolved base URL.
  private async getBaseUrl(): Promise<string> {
    return this.baseUrlPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    // Ensure the endpoint starts with a slash.
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${formattedEndpoint}`;

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Add auth token only on the client-side.
    if (typeof window !== 'undefined') {
      // Support both keys: some parts of the app store token under 'token' (auth-context)
      // while api-client.login used 'authToken'. Check both for compatibility.
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as {
          message?: string;
          code?: string;
          details?: unknown;
          requestId?: string;
        } | null;
        const responseRequestId = response.headers.get('x-request-id');
        const errorMessage = errorData?.message || `HTTP error! Status: ${response.status}`

        // Attach status to the error so callers can branch on auth failures.
        const err = new Error(errorMessage) as ApiClientError
        err.status = response.status
        err.code = errorData?.code
        err.details = errorData?.details
        err.requestId = errorData?.requestId || responseRequestId

        const normalizedMessage = String(errorMessage).toLowerCase()
        const isExpiredOrInvalidToken =
          response.status === 401 ||
          (response.status === 403 && normalizedMessage.includes("failed to authenticate token"))

        // If auth failed, proactively clear stored tokens to force re-login.
        // Keep generic 403 behavior (e.g. membership required) untouched.
        if (typeof window !== "undefined" && isExpiredOrInvalidToken) {
          localStorage.removeItem('authToken')
          localStorage.removeItem('token')
          localStorage.removeItem('user')

          // Centralize 401 handling to keep UX consistent.
          if (window.location.pathname !== '/auth') {
            window.location.assign('/auth')
          }
        }

        throw err
      }

      // Handle cases with no content
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
      } else {
        return Promise.resolve(null as T);
      }

    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error(`API request to ${url} failed:`, error);
      }
      throw error;
    }
  }

  // --- Public API Methods ---

  async register(userData: RegisterRequest) {
    return this.request<AuthResponse>('/api/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async login(credentials: LoginRequest) {
    const response = await this.request<AuthResponse>('/api/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (response.token && typeof window !== 'undefined') {
      localStorage.setItem('authToken', response.token);
    }

    return response;
  }

  async getProfile() {
    return this.request<User>('/api/profile', {
      method: 'GET',
    });
  }

  async logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
    }
  }

  async healthCheck() {
    // The health check should not have the /api prefix.
    return this.request('/health', {
      method: 'GET',
    });
  }

  async testConnection(): Promise<{ success: boolean; data?: any; error?: string; url?: string }> {
    try {
      const baseUrl = await this.getBaseUrl();
      const data = await this.healthCheck();
      return { success: true, data, url: baseUrl };
    } catch (error) {
      const baseUrl = await this.getBaseUrl().catch(() => "N/A");
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        url: baseUrl,
      };
    }
  }

  // Orders
  async createOrder(orderPayload: { total: number; items: any[]; selections?: any; design?: any; shipping_info?: any; address?: string | null; canvas?: any; publishToAll?: boolean; sourceAllId?: number | null; category?: string | null }) {
    return this.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload),
    });
  }

  async getOrders() {
    return this.request<{ orders: any[] }>('/api/orders', {
      method: 'GET',
    });
  }

  async getOrderSummaries(limit = 30) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 30;
    return this.request<{ orders: any[] }>(`/api/orders/summary?limit=${safeLimit}`, {
      method: 'GET',
    });
  }

  // Cart
  async getCart() {
    return this.request<{ items: any[] }>('/api/cart', {
      method: 'GET',
    });
  }

  async addCartItem(payload: {
    items: any[];
    selections?: any;
    design?: any;
    quantity?: number;
    price?: number;
    category?: string | null;
    canvas?: any;
    sourceAllId?: number | null;
    publishToAll?: boolean;
  }) {
    return this.request<{ item: any }>('/api/cart', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateCartItem(cartItemId: number, payload: { quantity?: number; publishToAll?: boolean }) {
    return this.request<{ item: any }>(`/api/cart/${cartItemId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async removeCartItem(cartItemId: number) {
    return this.request<{ success: boolean }>(`/api/cart/${cartItemId}`, {
      method: 'DELETE',
    });
  }

  async clearCart() {
    return this.request<{ success: boolean }>(`/api/cart/clear`, {
      method: 'POST',
    });
  }

  async checkoutCart(payload: { address: string; phone?: string }) {
    return this.request<{ orders: any[]; membership?: any }>(`/api/cart/checkout`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Admin Orders
  async getAdminOrders() {
    return this.request<{ orders: any[] }>('/api/admin/orders', {
      method: 'GET',
    });
  }

  async updateAdminCredentials(payload: { email?: string; password?: string }) {
    return this.request<{ message: string; user: any }>('/api/admin/credentials', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateAdminOrderStatus(orderId: number, status: string) {
    return this.request<{ order: { id: number; status: string } }>(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  // Public Gallery
  async getGallery(params?: { limit?: number; offset?: number; category?: string; sort?: 'new' | 'sales'; search?: string }) {
    const searchParams = new URLSearchParams();
    if (typeof params?.limit === 'number') searchParams.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') searchParams.set('offset', String(params.offset));
    if (typeof params?.category === 'string' && params.category.trim().length > 0) {
      searchParams.set('category', params.category.trim());
    }
    if (params?.sort === 'sales' || params?.sort === 'new') searchParams.set('sort', params.sort);
    if (typeof params?.search === 'string' && params.search.trim().length > 0) {
      searchParams.set('search', params.search.trim());
    }

    const query = searchParams.toString();
    const endpoint = query ? `/api/gallery?${query}` : '/api/gallery';
    return this.request<{ designs: any[] }>(endpoint, {
      method: 'GET',
    });
  }

  async getGalleryItem(orderId: number | string) {
    return this.request<{ design: any }>(`/api/gallery/${orderId}`, {
      method: "GET",
    });
  }

  async publishGalleryDesign(payload: { selections: any; design: any; canvas?: any; category?: string | null }) {
    return this.request<{ design: any; allDesignId?: number | null }>("/api/gallery/publish", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async activateMembership(payload: {
    planId: string;
    paymentReference?: string;
    provider?: string;
    rawPayload?: unknown;
  }) {
    return this.request("/api/memberships", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getMembership() {
    return this.request<{ membership: any | null }>("/api/memberships/me", {
      method: "GET",
    });
  }

  async getMembershipTransactions(limit = 50) {
    return this.request<{ transactions: any[] }>(`/api/memberships/transactions/me?limit=${limit}`, {
      method: "GET",
    });
  }

  // Jobs
  async createJob(payload: { type: "ai-image" | "virtual-tryon"; payload: any }) {
    return this.request<{
      jobId: string | number;
      queue: string;
      queueStats?: {
        waiting?: number;
        active?: number;
        completed?: number;
        failed?: number;
        delayed?: number;
        paused?: number;
      };
    }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getJobStatus(queue: string, jobId: string | number, signal?: AbortSignal) {
    return this.request<{ job: any }>(`/api/jobs/${queue}/${jobId}`, {
      method: "GET",
      cache: "no-store",
      signal,
    });
  }

  // Referrals / invite
  async getReferralMe() {
    return this.request<{
      invite_code: string;
      invited_by_user_id?: number | null;
      invite_redeemed_at?: string | null;
      total_invites: number;
      total_rewards: number;
    }>("/api/referrals/me", {
      method: "GET",
    });
  }

  async redeemInviteCode(code: string) {
    return this.request<{
      success: boolean;
      inviter?: { id: number; username: string; invite_code: string };
      reward?: { amount: number; currency: string };
    }>("/api/referrals/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }
}

// Export a single instance of the client for use across the app.
export const apiClient = new ApiClient();
export default apiClient;