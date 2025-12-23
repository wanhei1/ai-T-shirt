// 应用常量
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    PROFILE: '/api/auth/profile',
  },
  DESIGNS: {
    LIST: '/api/designs',
    CREATE: '/api/designs',
    UPDATE: '/api/designs/:id',
    DELETE: '/api/designs/:id',
  },
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const VALIDATION_RULES = {
  PASSWORD_MIN_LENGTH: 6,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 50,
} as const;

export const T_SHIRT_TYPES = [
  'classic-fit',
  'slim-fit',
  'oversized',
] as const;

export const DESIGN_ELEMENT_TYPES = [
  'text',
  'image', 
  'shape',
] as const;