// 用户相关类型
export interface User {
  id: number;
  username: string;
  email: string;
  created_at: Date;
}

export interface UserRegistration {
  username: string;
  email: string;
  password: string;
}

export interface UserLogin {
  email: string;
  password: string;
}

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

export interface DesignElement {
  id: string;
  type: 'text' | 'image' | 'shape';
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  properties: Record<string, any>;
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