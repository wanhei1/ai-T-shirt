// Admin panel shared types

export const STATUS_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "shipping", label: "运输中" },
  { value: "delivered", label: "已送达" },
];

export type AdminOrder = {
  id: number;
  user_id: number;
  total: number;
  status: string;
  payment_status?: string | null;
  address?: string | null;
  shipping_info?: { address?: string | null } | null;
  selections?: Record<string, any> | null;
  // Lightweight summary flags (from getAllOrderSummaries)
  has_front_image?: boolean;
  has_back_image?: boolean;
  // Full detail fields (from getAdminOrderDetail, loaded on demand)
  canvas_front_snapshot?: string | null;
  canvas_back_snapshot?: string | null;
  element_front_snapshot?: string | null;
  element_back_snapshot?: string | null;
  design_elements?: Array<{
    id?: string;
    type?: string;
    content?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    side?: string;
    visible?: boolean;
  }> | null;
  user_name?: string | null;
  user_email?: string | null;
  created_at?: string;
  category?: string | null;
  items?: any;
};

export type ReconciliationMismatch = {
  kind: string;
  count: number;
};

export type ReconciliationReport = {
  generatedAt: string;
  lookbackHours: number;
  totalMismatches: number;
  mismatches: ReconciliationMismatch[];
  samples?: {
    membershipPurchaseMissingTransaction?: Array<Record<string, unknown>>;
    membershipTransactionMissingPaymentRecord?: Array<Record<string, unknown>>;
    orderPaymentAmountMismatch?: Array<Record<string, unknown>>;
  };
};

export type SampleTableRow = {
  key: string;
  userId: string;
  referenceId: string;
  diff: string;
  eventTime: string;
  sql: string;
};

export type SampleGroup = {
  title: string;
  rows: SampleTableRow[];
};

export type AiBudgetGlobalUsage = {
  operation: "ai-image" | "virtual-tryon";
  quota: number;
  used: number;
  remaining: number;
  usageRate: number;
  estimatedExhaustAt: string | null;
};

export type AiBudgetUserUsage = {
  userId: number;
  operation: "ai-image" | "virtual-tryon";
  quota: number;
  used: number;
  usageRate: number;
  username?: string | null;
  email?: string | null;
};

export type AiBudgetTodayReport = {
  usageDate: string;
  generatedAt: string;
  guardMode: "degrade" | "delay" | "pause";
  global: AiBudgetGlobalUsage[];
  users: AiBudgetUserUsage[];
};

export type SkuDraft = {
  price: string;
  slaDays: string;
  isActive: boolean;
};

export type NewProductForm = {
  name: string;
  description: string;
  isActive: boolean;
};

export type NewSkuForm = {
  productId: string;
  skuCode: string;
  size: string;
  color: string;
  price: string;
  slaDays: string;
  isActive: boolean;
};
