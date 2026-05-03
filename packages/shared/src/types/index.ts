// 用户相关类型
export interface User {
  id: number;
  username: string;
  email: string;
  created_at?: string | Date;
  updated_at?: Date;
  is_admin?: boolean;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface UserRegistration {
  username: string;
  email: string;
  password: string;
}

// Aliases for compatibility
export type LoginRequest = UserLogin;
export type RegisterRequest = UserRegistration;

export interface AuthResponse {
  message: string;
  token: string;
  user: Omit<User, 'password'>;
}

// T恤设计相关类型
export interface TShirtDesign {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  userId: number;
  isPublic: boolean;
  created_at: Date;
  updated_at: Date;
}

export type DesignElementType = "text" | "image" | "shape" | "ai-generated";

export interface DesignElement {
  id: string;
  type: DesignElementType;
  content?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  visible?: boolean;
  side?: "front" | "back";
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  properties?: Record<string, any>;
}

export interface TShirtSelections {
  style: string;
  color: string;
  size: string;
  price: number;
}

export interface CanvasMeta {
  width: number;
  height: number;
  printArea: { x: number; y: number; width: number; height: number };
  backgroundColor: string;
  snapshots?: { front?: string | null; back?: string | null };
  elementSnapshots?: { front?: string | null; back?: string | null };
}

export interface DesignData {
  category?: string | null;
  tryOnSignature?: string | null;
  selections: TShirtSelections;
  elements: DesignElement[];
  sides?: {
    front?: DesignElement[];
    back?: DesignElement[];
  };
  canvas?: CanvasMeta;
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// 分页类型
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}