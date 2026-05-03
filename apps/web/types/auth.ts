// 认证相关的TypeScript类型定义

export interface User {
  id: number
  username: string
  email: string
  created_at?: string
  is_admin?: boolean
}

export interface AuthResponse {
  message: string
  token: string
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface ApiError {
  message: string
  statusCode?: number
}