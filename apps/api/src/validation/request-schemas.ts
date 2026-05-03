import { REQUEST_VALIDATION_ERROR_CODES } from '@v0-t-shirt-design-editor/shared';

type ValidationIssue = {
  field: string;
  code: string;
  message: string;
};

type ValidationSuccess<T> = {
  success: true;
  data: T;
};

type ValidationFailure = {
  success: false;
  errors: ValidationIssue[];
};

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
};

const trimString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value.trim();
};

export type CreateOrderPayload = {
  total: number;
  items: any[];
  selections?: any;
  design?: any;
  shipping_info?: any;
  address?: string;
  phone?: string;
  canvas?: any;
  publishToAll: boolean;
  sourceAllId?: number;
  category?: string;
};

export const validateCreateOrderPayload = (input: unknown): ValidationResult<CreateOrderPayload> => {
  const errors: ValidationIssue[] = [];

  if (!isPlainObject(input)) {
    return {
      success: false,
      errors: [{ field: 'body', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_BODY, message: 'Request body must be an object' }],
    };
  }

  const totalRaw = input.total;
  const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw);
  if (!Number.isFinite(total)) {
    errors.push({ field: 'total', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_TOTAL, message: 'total must be a number' });
  } else if (total <= 0) {
    errors.push({ field: 'total', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_TOTAL, message: 'total must be greater than 0' });
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push({ field: 'items', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_ITEMS, message: 'items must be a non-empty array' });
  }

  const addressRaw = trimString(input.address);
  if (addressRaw !== null && addressRaw.length > 512) {
    errors.push({ field: 'address', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_ADDRESS, message: 'address length must be <= 512' });
  }

  const phoneRaw = trimString(input.phone);
  if (phoneRaw !== null && phoneRaw.length > 64) {
    errors.push({ field: 'phone', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_PHONE, message: 'phone length must be <= 64' });
  }

  if (input.publishToAll !== undefined && typeof input.publishToAll !== 'boolean') {
    errors.push({ field: 'publishToAll', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_PUBLISH_TO_ALL, message: 'publishToAll must be a boolean' });
  }

  let sourceAllId: number | undefined;
  if (input.sourceAllId !== undefined && input.sourceAllId !== null) {
    const parsed = typeof input.sourceAllId === 'number' ? input.sourceAllId : Number(input.sourceAllId);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      errors.push({ field: 'sourceAllId', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_SOURCE_ALL_ID, message: 'sourceAllId must be a positive integer' });
    } else {
      sourceAllId = parsed;
    }
  }

  const categoryRaw = trimString(input.category);
  if (categoryRaw !== null && categoryRaw.length > 64) {
    errors.push({ field: 'category', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_CATEGORY, message: 'category length must be <= 64' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      total,
      items: input.items as any[],
      selections: input.selections,
      design: input.design,
      shipping_info: input.shipping_info,
      address: addressRaw === null || addressRaw.length === 0 ? undefined : addressRaw,
      phone: phoneRaw === null || phoneRaw.length === 0 ? undefined : phoneRaw,
      canvas: input.canvas,
      publishToAll: input.publishToAll !== false,
      sourceAllId,
      category: categoryRaw === null || categoryRaw.length === 0 ? undefined : categoryRaw,
    },
  };
};

export type CheckoutPayload = {
  address: string;
  phone?: string;
};

export const validateCheckoutPayload = (input: unknown): ValidationResult<CheckoutPayload> => {
  const errors: ValidationIssue[] = [];

  if (!isPlainObject(input)) {
    return {
      success: false,
      errors: [{ field: 'body', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_BODY, message: 'Request body must be an object' }],
    };
  }

  const address = trimString(input.address);
  if (!address) {
    errors.push({ field: 'address', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_ADDRESS, message: 'address is required' });
  } else if (address.length > 512) {
    errors.push({ field: 'address', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_ADDRESS, message: 'address length must be <= 512' });
  }

  const phone = trimString(input.phone);
  if (phone !== null && phone.length > 64) {
    errors.push({ field: 'phone', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_PHONE, message: 'phone length must be <= 64' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      address: address as string,
      phone: phone && phone.length > 0 ? phone : undefined,
    },
  };
};

export type CreateMembershipPayload = {
  planId: string;
  paymentReference?: string;
  provider?: string;
  rawPayload?: unknown;
};

export const validateCreateMembershipPayload = (
  input: unknown,
  allowedPlanIds: string[]
): ValidationResult<CreateMembershipPayload> => {
  const errors: ValidationIssue[] = [];

  if (!isPlainObject(input)) {
    return {
      success: false,
      errors: [{ field: 'body', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_BODY, message: 'Request body must be an object' }],
    };
  }

  const planId = trimString(input.planId);
  if (!planId) {
    errors.push({ field: 'planId', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_PLAN_ID, message: 'planId is required' });
  } else if (!allowedPlanIds.includes(planId)) {
    errors.push({ field: 'planId', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_PLAN_ID, message: 'Invalid membership plan selected' });
  }

  const paymentReference = trimString(input.paymentReference);
  if (paymentReference !== null && paymentReference.length > 255) {
    errors.push({ field: 'paymentReference', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_PAYMENT_REFERENCE, message: 'paymentReference length must be <= 255' });
  }

  const provider = trimString(input.provider);
  if (provider !== null && provider.length > 50) {
    errors.push({ field: 'provider', code: REQUEST_VALIDATION_ERROR_CODES.INVALID_PROVIDER, message: 'provider length must be <= 50' });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      planId: planId as string,
      paymentReference: paymentReference && paymentReference.length > 0 ? paymentReference : undefined,
      provider: provider && provider.length > 0 ? provider : undefined,
      rawPayload: input.rawPayload,
    },
  };
};
