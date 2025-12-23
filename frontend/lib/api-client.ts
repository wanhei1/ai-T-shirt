import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@/types/auth';

// --- Start of new, robust implementation ---

// 1. Get the list of potential API URLs from environment variables.
const apiUrlsString = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8189';
const potentialApiUrls = apiUrlsString.split(',').map(url => url.trim());

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
        signal: AbortSignal.timeout(3000), // 3-second timeout for the check
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
  determinedApiBaseUrl = potentialApiUrls[0];
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
        const errorData = await response.json().catch(() => ({ message: `HTTP error! Status: ${response.status}` }));
        throw new Error(errorData?.message || `An unknown error occurred.`);
      }

      // Handle cases with no content
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
      } else {
        return Promise.resolve(null as T);
      }

    } catch (error) {
      console.error(`API request to ${url} failed:`, error);
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
  async createOrder(orderPayload: { total: number; items: any[]; selections?: any; shipping_info?: any }) {
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
}

// Export a single instance of the client for use across the app.
export const apiClient = new ApiClient();
export default apiClient;