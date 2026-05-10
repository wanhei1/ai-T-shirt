import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@/types/auth';
import {
  API_COMMON_ERROR_CODES,
  REQUEST_VALIDATION_ERROR_CODES,
  type ApiCommonErrorCode,
  type ApiErrorCode,
  type RequestValidationErrorCode,
} from '@v0-t-shirt-design-editor/shared';

export type ApiClientError = Error & {
  status?: number;
  code?: ApiErrorCode | string;
  requestId?: string | null;
  details?: unknown;
  validationErrors?: ApiValidationErrorItem[];
};

export type ApiValidationErrorItem = {
  field: string;
  code: RequestValidationErrorCode | string;
  message?: string;
};

export type AdminOrderStatusTransition = {
  before: string | null;
  after: string | null;
};

export type UpdateAdminOrderStatusResponse = {
  order: {
    id: number;
    user_id: number;
    previous_status: string | null;
    status: string;
  };
  statusTransition: AdminOrderStatusTransition;
};

export type CreatePaymentIntentResponse = {
  orderId: number;
  channel: 'alipay';
  amount: number;
  paymentOrderId: string;
  clientPayload: {
    provider: 'alipay';
    outTradeNo: string;
    totalAmount: number;
    subject: string;
    timeoutExpress: string;
    notifyUrl: string | null;
    returnUrl: string | null;
  };
};

export type OrderTrackingResponse = {
  orderId: number;
  orderStatus: string;
  shipment: {
    id: number;
    orderId: number;
    carrier: string;
    trackingNo: string;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
    updatedAt: string | null;
  } | null;
  timeline: Array<{
    key: string;
    label: string;
    time: string | null;
  }>;
};

export type AdminProductSku = {
  id: number;
  skuCode: string;
  size?: string | null;
  color?: string | null;
  price: number;
  slaDays: number;
  isActive: boolean;
  metadata?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminProduct = {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  skus: AdminProductSku[];
};

export type AdminProductionCapacity = {
  id: number;
  capacity_date: string;
  capacity_total: number;
  reserved_count: number;
  created_at?: string;
  updated_at?: string;
};

type ApiValidationErrorDetails = {
  errors?: ApiValidationErrorItem[];
};

type SupportedLanguage = 'zh' | 'en';

type FriendlyMessage = {
  zh: string;
  en: string;
};

const API_VALIDATION_FIELD_LABELS: Record<string, FriendlyMessage> = {
  body: { zh: '请求体', en: 'request body' },
  total: { zh: '订单金额', en: 'order total' },
  items: { zh: '商品列表', en: 'order items' },
  address: { zh: '收货地址', en: 'shipping address' },
  phone: { zh: '联系电话', en: 'phone number' },
  publishToAll: { zh: '公开设置', en: 'publish setting' },
  sourceAllId: { zh: '来源作品', en: 'source design' },
  category: { zh: '分类', en: 'category' },
  planId: { zh: '会员套餐', en: 'membership plan' },
  paymentReference: { zh: '支付参考号', en: 'payment reference' },
  provider: { zh: '支付渠道', en: 'payment provider' },
};

const VALIDATION_ERROR_CODE_MESSAGES: Record<RequestValidationErrorCode, FriendlyMessage> = {
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_BODY]: { zh: '请求格式错误，请刷新页面后重试', en: 'Invalid request format. Please refresh and try again.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_TOTAL]: { zh: '订单金额无效', en: 'Order total is invalid.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_ITEMS]: { zh: '订单商品不能为空', en: 'Order items cannot be empty.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_ADDRESS]: { zh: '收货地址无效，请重新填写', en: 'Shipping address is invalid.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_PHONE]: { zh: '联系电话格式不正确', en: 'Phone number format is invalid.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_PUBLISH_TO_ALL]: { zh: '公开设置无效', en: 'Publish setting is invalid.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_SOURCE_ALL_ID]: { zh: '来源作品ID无效', en: 'Source design ID is invalid.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_CATEGORY]: { zh: '分类参数无效', en: 'Category value is invalid.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_PLAN_ID]: { zh: '会员套餐无效，请重新选择', en: 'Membership plan is invalid. Please select again.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_PAYMENT_REFERENCE]: { zh: '支付参考号格式无效', en: 'Payment reference format is invalid.' },
  [REQUEST_VALIDATION_ERROR_CODES.INVALID_PROVIDER]: { zh: '支付渠道参数无效', en: 'Payment provider value is invalid.' },
};

const COMMON_ERROR_CODE_MESSAGES: Record<ApiCommonErrorCode, FriendlyMessage> = {
  [API_COMMON_ERROR_CODES.INVALID_REQUEST]: { zh: '提交信息不完整或格式错误', en: 'Submitted data is incomplete or invalid.' },
  [API_COMMON_ERROR_CODES.MEMBERSHIP_REQUIRED]: { zh: '需要有效会员才能继续', en: 'An active membership is required.' },
  [API_COMMON_ERROR_CODES.INSUFFICIENT_BALANCE]: { zh: '会员余额不足', en: 'Insufficient membership balance.' },
  [API_COMMON_ERROR_CODES.AI_BUDGET_USER_QUOTA_EXCEEDED]: { zh: '你今日 AI 生成额度已用完，请明天再试', en: 'Your daily AI quota is exhausted. Please try again tomorrow.' },
  [API_COMMON_ERROR_CODES.AI_BUDGET_GLOBAL_QUOTA_EXCEEDED]: { zh: '今日 AI 总预算已达上限，系统已降级为模板模式', en: 'Daily AI budget reached. The system is degraded to template mode.' },
  [API_COMMON_ERROR_CODES.AI_BUDGET_DELAYED]: { zh: 'AI 预算紧张，已进入延迟队列，请稍后重试', en: 'AI budget is constrained. Requests are delayed, please retry later.' },
};

export const API_ERROR_CODE_MESSAGES: Record<ApiErrorCode, FriendlyMessage> = {
  ...VALIDATION_ERROR_CODE_MESSAGES,
  ...COMMON_ERROR_CODE_MESSAGES,
};

const pickFriendlyMessage = (code: string | undefined, language: SupportedLanguage): string | null => {
  if (!code) return null;
  const entry = API_ERROR_CODE_MESSAGES[code as ApiErrorCode];
  if (!entry) return null;
  return entry[language];
};

const pickFriendlyFieldLabel = (field: string | undefined, language: SupportedLanguage): string | null => {
  if (!field) return null;
  const entry = API_VALIDATION_FIELD_LABELS[field];
  if (!entry) return null;
  return entry[language];
};

export const getApiValidationErrors = (error: unknown): ApiValidationErrorItem[] => {
  const details = (error as ApiClientError | null | undefined)?.details as ApiValidationErrorDetails | undefined;
  const items = details?.errors;
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !!item && typeof item.field === 'string' && typeof item.code === 'string');
};

export const getPrimaryApiErrorCode = (error: unknown): string | undefined => {
  const err = error as ApiClientError | null | undefined;
  const validationCode = getApiValidationErrors(error)[0]?.code;
  return validationCode || err?.code;
};

export const getFriendlyApiValidationMessages = (
  error: unknown,
  language: SupportedLanguage
): string[] => {
  const validationErrors = getApiValidationErrors(error);
  if (validationErrors.length === 0) return [];

  const messages = validationErrors.map((issue) => {
    const fieldLabel = pickFriendlyFieldLabel(issue.field, language);
    const codeMessage = pickFriendlyMessage(issue.code, language);
    const fallback = issue.message || (language === 'zh' ? '参数无效' : 'Invalid value');
    const core = codeMessage || fallback;

    if (!fieldLabel) return core;
    if (language === 'zh') return `${fieldLabel}：${core}`;
    return `${fieldLabel}: ${core}`;
  });

  return Array.from(new Set(messages));
};

export const getFriendlyApiErrorSummary = (
  error: unknown,
  fallback: FriendlyMessage,
  language: SupportedLanguage
) => {
  const validationMessages = getFriendlyApiValidationMessages(error, language);
  if (validationMessages.length > 0) {
    const separator = language === 'zh' ? '；' : '; ';
    return validationMessages.join(separator);
  }
  return getFriendlyApiErrorMessage(error, fallback, language);
};

export const getFriendlyApiErrorMessage = (
  error: unknown,
  fallback: FriendlyMessage,
  language: SupportedLanguage
) => {
  const err = error as ApiClientError | null | undefined;
  const primaryCode = getPrimaryApiErrorCode(error);
  const friendly = pickFriendlyMessage(primaryCode, language);
  const base = friendly || err?.message || fallback[language];
  const codeTag = primaryCode ? ` [${primaryCode}]` : '';
  const requestTag = err?.requestId ? ` (requestId: ${err.requestId})` : '';
  return `${base}${codeTag}${requestTag}`;
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
const apiUrlsString = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8189';
const envApiUrls = apiUrlsString.split(',').map(url => url.trim()).filter(Boolean);
const defaultApiUrls = ['http://localhost:8189', 'http://localhost:8189', 'http://localhost:8181'];
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
  determinedApiBaseUrl = potentialApiUrls[0] || 'http://localhost:8189';
  return determinedApiBaseUrl;
};

class ApiClient {
  // This promise will resolve to the available base URL.
  // It's initialized once and reused for all method calls.
  private baseUrlPromise: Promise<string>;
  private idempotencyKeyCache = new Map<string, string>();

  constructor() {
    this.baseUrlPromise = findAvailableApiUrl();
  }

  private stableStringify(input: unknown): string {
    if (input === null || typeof input !== 'object') {
      return JSON.stringify(input);
    }

    if (Array.isArray(input)) {
      return `[${input.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    const obj = input as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${this.stableStringify(obj[key])}`).join(',')}}`;
  }

  private hashString(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  private resolveStableIdempotencyKey(endpoint: string, payload: unknown): string {
    const normalizedPayload = this.stableStringify(payload);
    const cacheSlot = `${endpoint}:${this.hashString(normalizedPayload)}`;
    const existing = this.idempotencyKeyCache.get(cacheSlot);
    if (existing) {
      return existing;
    }

    const newKey = `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${this.hashString(cacheSlot)}`;
    this.idempotencyKeyCache.set(cacheSlot, newKey);
    return newKey;
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

    const { headers: optionHeaders, ...restOptions } = options;
    const config: RequestInit = {
      ...restOptions,
      headers: {
        'Content-Type': 'application/json',
        ...optionHeaders,
      },
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
        err.validationErrors = getApiValidationErrors(err)

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

          // Let the page's auth guard handle the redirect, don't force-redirect here
          // to avoid redirect loops (e.g. /admin → /auth → /admin)
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
    const idempotencyKey = this.resolveStableIdempotencyKey('/api/orders', orderPayload);
    return this.request('/api/orders', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
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

  getThumbnailUrl(orderId: number | string): string {
    // Use Next.js /backend/ proxy so mobile browsers don't need direct access to port 8189
    return `/backend/api/orders/${orderId}/thumbnail`;
  }

  getGalleryThumbnailUrl(designId: number | string): string {
    return `/backend/api/gallery/${designId}/thumbnail`;
  }

  async createPaymentIntent(payload: { orderId: number; channel: 'alipay'; amount: number }) {
    return this.request<CreatePaymentIntentResponse>('/api/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getOrderTracking(orderId: number) {
    return this.request<OrderTrackingResponse>(`/api/orders/${orderId}/tracking`, {
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
    const idempotencyKey = this.resolveStableIdempotencyKey('/api/cart/checkout', payload);
    return this.request<{ orders: any[]; membership?: any }>(`/api/cart/checkout`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  }

  // Admin Orders
  async getAdminOrderDetail(orderId: number) {
    return this.request<{ order: any }>(`/api/admin/orders/${orderId}`);
  }

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
    return this.request<UpdateAdminOrderStatusResponse>(`/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async getAdminReconciliationLatest(lookbackHours?: number) {
    const query = Number.isFinite(lookbackHours as number)
      ? `?lookbackHours=${Math.max(1, Math.min(168, Math.trunc(Number(lookbackHours))))}`
      : '';
    return this.request<{ report: any }>(`/api/admin/reconciliation/latest${query}`, {
      method: 'GET',
    });
  }

  async getAdminAiBudgetToday() {
    return this.request<{
      usageDate: string;
      generatedAt: string;
      guardMode: 'degrade' | 'delay' | 'pause';
      global: Array<{
        operation: 'ai-image' | 'virtual-tryon';
        quota: number;
        used: number;
        remaining: number;
        usageRate: number;
        estimatedExhaustAt: string | null;
      }>;
      users: Array<{
        userId: number;
        operation: 'ai-image' | 'virtual-tryon';
        quota: number;
        used: number;
        usageRate: number;
        username?: string | null;
        email?: string | null;
      }>;
    }>('/api/admin/ai-budget/today', {
      method: 'GET',
    });
  }

  async getAdminProducts() {
    return this.request<{ products: AdminProduct[] }>('/api/admin/products', {
      method: 'GET',
    });
  }

  async createAdminProduct(payload: { name: string; description?: string; isActive?: boolean }) {
    return this.request<{ product: any }>('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createAdminProductSku(payload: {
    productId: number;
    skuCode: string;
    size?: string;
    color?: string;
    price: number;
    slaDays?: number;
    isActive?: boolean;
    metadata?: unknown;
  }) {
    return this.request<{ sku: any }>('/api/admin/product-skus', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateAdminProductSku(skuId: number, payload: { price?: number; slaDays?: number; isActive?: boolean }) {
    return this.request<{ sku: any }>(`/api/admin/product-skus/${skuId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateAdminProductionCapacity(date: string, capacityTotal: number) {
    return this.request<{ capacity: AdminProductionCapacity }>(`/api/admin/production-capacity/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ capacityTotal }),
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