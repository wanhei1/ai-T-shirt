"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import apiClient, { type AdminProduct, getFriendlyApiErrorSummary } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "shipping", label: "运输中" },
  { value: "delivered", label: "已送达" },
];

type AdminOrder = {
  id: number;
  user_id: number;
  total: number;
  status: string;
  address?: string | null;
  shipping_info?: { address?: string | null } | null;
  selections?: Record<string, any> | null;
  canvas_front?: string | null;
  canvas_back?: string | null;
  design?: {
    elements?: Array<{
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
    }>;
    canvas?: {
      snapshots?: { front?: string | null; back?: string | null };
      elementSnapshots?: { front?: string | null; back?: string | null };
    };
  } | null;
  user_name?: string | null;
  user_email?: string | null;
  created_at?: string;
};

type ReconciliationMismatch = {
  kind: string;
  count: number;
};

type ReconciliationReport = {
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

type SampleTableRow = {
  key: string;
  userId: string;
  referenceId: string;
  diff: string;
  eventTime: string;
  sql: string;
};

type SampleGroup = {
  title: string;
  rows: SampleTableRow[];
};

type AiBudgetGlobalUsage = {
  operation: "ai-image" | "virtual-tryon";
  quota: number;
  used: number;
  remaining: number;
  usageRate: number;
  estimatedExhaustAt: string | null;
};

type AiBudgetUserUsage = {
  userId: number;
  operation: "ai-image" | "virtual-tryon";
  quota: number;
  used: number;
  usageRate: number;
  username?: string | null;
  email?: string | null;
};

type AiBudgetTodayReport = {
  usageDate: string;
  generatedAt: string;
  guardMode: "degrade" | "delay" | "pause";
  global: AiBudgetGlobalUsage[];
  users: AiBudgetUserUsage[];
};

type SkuDraft = {
  price: string;
  slaDays: string;
  isActive: boolean;
};

type NewProductForm = {
  name: string;
  description: string;
  isActive: boolean;
};

type NewSkuForm = {
  productId: string;
  skuCode: string;
  size: string;
  color: string;
  price: string;
  slaDays: string;
  isActive: boolean;
};

const formatMaybeNumber = (value: unknown) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(value);
};

const downloadImage = (url: string, filename: string) => {
  if (!url) return;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const toNumberLike = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return "-";
};

const toTimeLike = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
};

const buildInvestigationSql = (kind: string, row: Record<string, unknown>) => {
  const userId = toNumberLike(row.user_id);
  const referenceId = toNumberLike(row.reference_id === "-" ? null : row.reference_id);

  if (kind === "membershipPurchaseMissingTransaction") {
    return [
      `-- 用户 ${userId}: 会员支付缺交易流水`,
      `SELECT id, user_id, transaction_id, updated_at FROM memberships WHERE user_id = ${userId};`,
      `SELECT id, user_id, type, reference_id, created_at`,
      `FROM membership_transactions`,
      `WHERE user_id = ${userId}`,
      `ORDER BY created_at DESC LIMIT 50;`,
    ].join("\n");
  }

  if (kind === "membershipTransactionMissingPaymentRecord") {
    const referenceFilter = referenceId !== "-" ? ` AND transaction_id = '${referenceId.replace(/'/g, "''")}'` : "";
    return [
      `-- 用户 ${userId}: 交易流水缺支付记录`,
      `SELECT id, user_id, type, reference_id, created_at`,
      `FROM membership_transactions`,
      `WHERE user_id = ${userId} AND type = 'membership_purchase'`,
      `ORDER BY created_at DESC LIMIT 50;`,
      `SELECT id, user_id, transaction_id, updated_at`,
      `FROM memberships`,
      `WHERE user_id = ${userId}${referenceFilter};`,
    ].join("\n");
  }

  return [
    `-- 用户 ${userId}: 订单金额与扣款不一致`,
    `SELECT id, user_id, total, created_at`,
    `FROM orders`,
    `WHERE user_id = ${userId}`,
    `ORDER BY created_at DESC LIMIT 50;`,
    `SELECT id, user_id, delta, type, created_at`,
    `FROM membership_transactions`,
    `WHERE user_id = ${userId} AND type = 'order_payment'`,
    `ORDER BY created_at DESC LIMIT 50;`,
  ].join("\n");
};

const getBudgetRiskMeta = (estimatedExhaustAt: string | null) => {
  if (!estimatedExhaustAt) {
    return {
      remainingHoursText: "暂无预测",
      riskText: "黄",
      riskClassName: "bg-yellow-100 text-yellow-800 border-yellow-200",
    };
  }

  const diffMs = Date.parse(estimatedExhaustAt) - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return {
      remainingHoursText: "<= 0 小时",
      riskText: "红",
      riskClassName: "bg-red-100 text-red-800 border-red-200",
    };
  }

  const hours = diffMs / (1000 * 60 * 60);
  const remainingHoursText = hours < 1 ? "< 1 小时" : `${hours.toFixed(1)} 小时`;

  if (hours <= 4) {
    return {
      remainingHoursText,
      riskText: "红",
      riskClassName: "bg-red-100 text-red-800 border-red-200",
    };
  }

  if (hours <= 12) {
    return {
      remainingHoursText,
      riskText: "黄",
      riskClassName: "bg-yellow-100 text-yellow-800 border-yellow-200",
    };
  }

  return {
    remainingHoursText,
    riskText: "绿",
    riskClassName: "bg-green-100 text-green-800 border-green-200",
  };
};

export default function AdminPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "processing" | "shipping" | "delivered">("all");
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [isLoadingReconciliation, setIsLoadingReconciliation] = useState(false);
  const [copiedSqlKey, setCopiedSqlKey] = useState<string | null>(null);
  const [aiBudgetReport, setAiBudgetReport] = useState<AiBudgetTodayReport | null>(null);
  const [isLoadingAiBudget, setIsLoadingAiBudget] = useState(false);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [skuDrafts, setSkuDrafts] = useState<Record<number, SkuDraft>>({});
  const [savingSkuId, setSavingSkuId] = useState<number | null>(null);
  const [capacityDate, setCapacityDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [capacityTotal, setCapacityTotal] = useState<string>("200");
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [capacitySavedMessage, setCapacitySavedMessage] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<NewProductForm>({ name: "", description: "", isActive: true });
  const [newSku, setNewSku] = useState<NewSkuForm>({
    productId: "",
    skuCode: "",
    size: "",
    color: "",
    price: "",
    slaDays: "3",
    isActive: true,
  });
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isCreatingSku, setIsCreatingSku] = useState(false);
  const [initSavedMessage, setInitSavedMessage] = useState<string | null>(null);
  const [lastSkuTemplate, setLastSkuTemplate] = useState<Omit<NewSkuForm, "skuCode"> | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push("/auth");
      return;
    }
    if (!(user as any)?.is_admin) {
      router.push("/");
    }
  }, [isLoading, user, router]);

  const loadOrders = async () => {
    try {
      setError(null);
      setIsLoadingOrders(true);
      const response = await apiClient.getAdminOrders();
      setOrders((response.orders || []) as AdminOrder[]);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "加载订单失败", en: "Failed to load orders" }, "zh"));
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (!user || !(user as any)?.is_admin) return;
    loadOrders();
    void loadReconciliation();
    void loadAiBudget();
    void loadProducts();
  }, [user]);

  const loadReconciliation = async () => {
    try {
      setIsLoadingReconciliation(true);
      const response = await apiClient.getAdminReconciliationLatest();
      setReconciliationReport((response?.report || null) as ReconciliationReport | null);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "加载对账报告失败", en: "Failed to load reconciliation report" }, "zh"));
    } finally {
      setIsLoadingReconciliation(false);
    }
  };

  const loadAiBudget = async () => {
    try {
      setIsLoadingAiBudget(true);
      const response = await apiClient.getAdminAiBudgetToday();
      setAiBudgetReport(response as AiBudgetTodayReport);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "加载预算看板失败", en: "Failed to load budget dashboard" }, "zh"));
    } finally {
      setIsLoadingAiBudget(false);
    }
  };

  const loadProducts = async () => {
    try {
      setIsLoadingProducts(true);
      const response = await apiClient.getAdminProducts();
      const list = (response?.products || []) as AdminProduct[];
      setProducts(list);
      const nextDrafts: Record<number, SkuDraft> = {};
      for (const product of list) {
        for (const sku of product.skus || []) {
          nextDrafts[sku.id] = {
            price: Number(sku.price).toFixed(2),
            slaDays: String(Math.max(0, Number(sku.slaDays) || 0)),
            isActive: Boolean(sku.isActive),
          };
        }
      }
      setSkuDrafts(nextDrafts);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "加载 SKU 列表失败", en: "Failed to load SKU list" }, "zh"));
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const updateSkuDraft = (skuId: number, patch: Partial<SkuDraft>) => {
    setSkuDrafts((prev) => ({
      ...prev,
      [skuId]: {
        price: prev[skuId]?.price ?? "0",
        slaDays: prev[skuId]?.slaDays ?? "1",
        isActive: prev[skuId]?.isActive ?? true,
        ...patch,
      },
    }));
  };

  const saveSku = async (skuId: number) => {
    const draft = skuDrafts[skuId];
    if (!draft) return;

    const price = Number(draft.price);
    const slaDays = Number(draft.slaDays);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(slaDays) || slaDays < 0) {
      setError("SKU 参数无效：请检查价格与 SLA");
      return;
    }

    try {
      setSavingSkuId(skuId);
      await apiClient.updateAdminProductSku(skuId, {
        price,
        slaDays: Math.trunc(slaDays),
        isActive: draft.isActive,
      });
      await loadProducts();
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "保存 SKU 失败", en: "Failed to save SKU" }, "zh"));
    } finally {
      setSavingSkuId(null);
    }
  };

  const saveCapacity = async () => {
    const value = Number(capacityTotal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(capacityDate) || !Number.isFinite(value) || value < 0) {
      setError("产能参数无效：请检查日期与配额");
      return;
    }

    try {
      setSavingCapacity(true);
      setCapacitySavedMessage(null);
      const response = await apiClient.updateAdminProductionCapacity(capacityDate, Math.trunc(value));
      const cap = response.capacity;
      setCapacitySavedMessage(`已更新 ${cap.capacity_date} 产能为 ${cap.capacity_total}（已占用 ${cap.reserved_count}）`);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "更新产能失败", en: "Failed to update production capacity" }, "zh"));
    } finally {
      setSavingCapacity(false);
    }
  };

  const createProduct = async () => {
    const name = newProduct.name.trim();
    if (!name) {
      setError("请填写商品名称");
      return;
    }

    try {
      setError(null);
      setInitSavedMessage(null);
      setIsCreatingProduct(true);
      const response = await apiClient.createAdminProduct({
        name,
        description: newProduct.description.trim() || undefined,
        isActive: newProduct.isActive,
      });
      await loadProducts();
      setNewProduct({ name: "", description: "", isActive: true });
      setInitSavedMessage(`已创建商品 #${response.product.id} · ${response.product.name}`);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "新增商品失败", en: "Failed to create product" }, "zh"));
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const createSku = async () => {
    const productId = Number(newSku.productId);
    const skuCode = newSku.skuCode.trim();
    const price = Number(newSku.price);
    const slaDays = Number(newSku.slaDays);

    if (!Number.isInteger(productId) || productId <= 0) {
      setError("请选择所属商品");
      return;
    }
    if (!skuCode) {
      setError("请填写 SKU 编码");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("请填写有效价格");
      return;
    }
    if (!Number.isFinite(slaDays) || slaDays < 0) {
      setError("请填写有效 SLA 天数");
      return;
    }

    try {
      setError(null);
      setInitSavedMessage(null);
      setIsCreatingSku(true);
      const response = await apiClient.createAdminProductSku({
        productId,
        skuCode,
        size: newSku.size.trim() || undefined,
        color: newSku.color.trim() || undefined,
        price,
        slaDays: Math.trunc(slaDays),
        isActive: newSku.isActive,
      });
      setLastSkuTemplate({
        productId: String(productId),
        size: newSku.size.trim(),
        color: newSku.color.trim(),
        price: price.toFixed(2),
        slaDays: String(Math.trunc(slaDays)),
        isActive: newSku.isActive,
      });
      await loadProducts();
      setNewSku({
        productId: String(productId),
        skuCode: "",
        size: "",
        color: "",
        price: "",
        slaDays: "3",
        isActive: true,
      });
      setInitSavedMessage(`已创建 SKU #${response.sku.id} · ${response.sku.sku_code || response.sku.skuCode}`);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "新增 SKU 失败", en: "Failed to create SKU" }, "zh"));
    } finally {
      setIsCreatingSku(false);
    }
  };

  const copyLastSkuTemplateToForm = () => {
    if (!lastSkuTemplate) {
      setError("暂无可复制的 SKU 参数，请先创建一个 SKU");
      return;
    }

    setError(null);
    setInitSavedMessage("已复制上一个 SKU 参数，请修改 SKU 编码/尺码后创建");
    setNewSku((prev) => ({
      ...prev,
      productId: lastSkuTemplate.productId,
      skuCode: "",
      size: lastSkuTemplate.size,
      color: lastSkuTemplate.color,
      price: lastSkuTemplate.price,
      slaDays: lastSkuTemplate.slaDays,
      isActive: lastSkuTemplate.isActive,
    }));
  };

  const formatPercent = (ratio: number) => `${(Math.max(0, ratio) * 100).toFixed(1)}%`;

  const operationLabel = (operation: "ai-image" | "virtual-tryon") =>
    operation === "ai-image" ? "AI 生成" : "AI 试穿";

  const sampleRows = useMemo(() => {
    const report = reconciliationReport;
    if (!report?.samples) {
      return [] as SampleGroup[];
    }

    return [
      {
        title: "会员支付缺交易流水",
        rows: (report.samples.membershipPurchaseMissingTransaction || []).map((row, index) => ({
          key: `membershipPurchaseMissingTransaction-${index}`,
          userId: toNumberLike(row.user_id),
          referenceId: toNumberLike(row.transaction_id),
          diff: "-",
          eventTime: toTimeLike(row.updated_at),
          sql: buildInvestigationSql("membershipPurchaseMissingTransaction", row),
        })),
      },
      {
        title: "交易流水缺支付记录",
        rows: (report.samples.membershipTransactionMissingPaymentRecord || []).map((row, index) => ({
          key: `membershipTransactionMissingPaymentRecord-${index}`,
          userId: toNumberLike(row.user_id),
          referenceId: toNumberLike(row.reference_id),
          diff: "-",
          eventTime: toTimeLike(row.created_at),
          sql: buildInvestigationSql("membershipTransactionMissingPaymentRecord", row),
        })),
      },
      {
        title: "订单金额与扣款不一致",
        rows: (report.samples.orderPaymentAmountMismatch || []).map((row, index) => ({
          key: `orderPaymentAmountMismatch-${index}`,
          userId: toNumberLike(row.user_id),
          referenceId: "-",
          diff: toNumberLike(row.diff),
          eventTime: "-",
          sql: buildInvestigationSql("orderPaymentAmountMismatch", row),
        })),
      },
    ].filter((group) => group.rows.length > 0);
  }, [reconciliationReport]);

  const copySql = async (row: SampleTableRow) => {
    try {
      await navigator.clipboard.writeText(row.sql);
      setCopiedSqlKey(row.key);
      setTimeout(() => {
        setCopiedSqlKey((current) => (current === row.key ? null : current));
      }, 1500);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "复制 SQL 失败", en: "Failed to copy SQL" }, "zh"));
    }
  };

  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      setUpdatingId(orderId);
      await apiClient.updateAdminOrderStatus(orderId, status);
      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status } : order)));
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "更新状态失败", en: "Failed to update status" }, "zh"));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const totalOrders = useMemo(() => orders.length, [orders]);

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "processing") {
      return orders.filter((order) => (order.status || "pending") === "processing" || (order.status || "pending") === "pending");
    }
    return orders.filter((order) => (order.status || "pending") === filter);
  }, [orders, filter]);

  const statusCount = useMemo(() => {
    return {
      all: orders.length,
      processing: orders.filter((order) => (order.status || "pending") === "processing" || (order.status || "pending") === "pending").length,
      shipping: orders.filter((order) => (order.status || "pending") === "shipping").length,
      delivered: orders.filter((order) => (order.status || "pending") === "delivered").length,
    };
  }, [orders]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              A
            </div>
            <div>
              <h1 className="text-lg font-semibold">管理员服务端</h1>
              <p className="text-xs text-muted-foreground">订单管理与配送状态</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">共 {totalOrders} 单</Badge>
            <Button variant="outline" onClick={handleLogout}>退出登录</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">SKU / 产能配置</CardTitle>
            <Button variant="outline" size="sm" onClick={loadProducts} disabled={isLoadingProducts}>
              {isLoadingProducts ? "加载中..." : "刷新 SKU"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium">新增商品</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    名称
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newProduct.name}
                      onChange={(event) => setNewProduct((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    描述
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newProduct.description}
                      onChange={(event) => setNewProduct((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground md:col-span-2">
                    <input
                      type="checkbox"
                      checked={newProduct.isActive}
                      onChange={(event) => setNewProduct((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    上架可售
                  </label>
                  <div className="md:col-span-2">
                    <Button size="sm" onClick={createProduct} disabled={isCreatingProduct}>
                      {isCreatingProduct ? "创建中..." : "创建商品"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium">新增 SKU</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    所属商品
                    <select
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.productId}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, productId: event.target.value }))}
                    >
                      <option value="">请选择商品</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          #{product.id} · {product.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    SKU 编码
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.skuCode}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, skuCode: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    价格
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.price}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, price: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    尺码
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.size}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, size: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    颜色
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.color}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, color: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    SLA 天数
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.slaDays}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, slaDays: event.target.value }))}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={newSku.isActive}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    上架可售
                  </label>
                  <div className="md:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={copyLastSkuTemplateToForm} disabled={!lastSkuTemplate || isCreatingSku}>
                        快速复制上一个 SKU 参数
                      </Button>
                      <Button size="sm" onClick={createSku} disabled={isCreatingSku || products.length === 0}>
                        {isCreatingSku ? "创建中..." : "创建 SKU"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {initSavedMessage ? <div className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-700">{initSavedMessage}</div> : null}

            <div className="rounded-md border p-3">
              <div className="mb-2 font-medium">每日产能配置</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">
                  日期
                  <input
                    type="date"
                    className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm"
                    value={capacityDate}
                    onChange={(event) => setCapacityDate(event.target.value)}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  配额
                  <input
                    type="number"
                    min={0}
                    className="mt-1 block h-9 w-28 rounded-md border border-border bg-background px-2 text-sm"
                    value={capacityTotal}
                    onChange={(event) => setCapacityTotal(event.target.value)}
                  />
                </label>
                <Button size="sm" onClick={saveCapacity} disabled={savingCapacity}>
                  {savingCapacity ? "保存中..." : "保存产能"}
                </Button>
              </div>
              {capacitySavedMessage ? <div className="mt-2 text-xs text-green-700">{capacitySavedMessage}</div> : null}
            </div>

            {products.length === 0 ? (
              <div className="rounded-md border p-3 text-muted-foreground">暂无商品/SKU 数据</div>
            ) : (
              <div className="overflow-auto rounded-md border">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left">商品</th>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">尺码/颜色</th>
                      <th className="px-3 py-2 text-left">价格</th>
                      <th className="px-3 py-2 text-left">SLA(天)</th>
                      <th className="px-3 py-2 text-left">上架</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.flatMap((product) => (product.skus || []).map((sku) => {
                      const draft = skuDrafts[sku.id] || {
                        price: Number(sku.price).toFixed(2),
                        slaDays: String(Math.max(0, Number(sku.slaDays) || 0)),
                        isActive: Boolean(sku.isActive),
                      };

                      return (
                        <tr key={sku.id} className="border-t">
                          <td className="px-3 py-2">#{product.id} · {product.name}</td>
                          <td className="px-3 py-2">{sku.skuCode}</td>
                          <td className="px-3 py-2">{sku.size || "-"} / {sku.color || "-"}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 w-24 rounded border border-border bg-background px-2"
                              value={draft.price}
                              onChange={(event) => updateSkuDraft(sku.id, { price: event.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="1"
                              className="h-8 w-20 rounded border border-border bg-background px-2"
                              value={draft.slaDays}
                              onChange={(event) => updateSkuDraft(sku.id, { slaDays: event.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={draft.isActive}
                                onChange={(event) => updateSkuDraft(sku.id, { isActive: event.target.checked })}
                              />
                              <span>{draft.isActive ? "是" : "否"}</span>
                            </label>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => saveSku(sku.id)} disabled={savingSkuId === sku.id}>
                              {savingSkuId === sku.id ? "保存中..." : "保存"}
                            </Button>
                          </td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">今日预算使用看板</CardTitle>
            <Button variant="outline" size="sm" onClick={loadAiBudget} disabled={isLoadingAiBudget}>
              {isLoadingAiBudget ? "加载中..." : "刷新预算"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!aiBudgetReport ? (
              <div className="text-muted-foreground">暂无预算数据</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">模式: {aiBudgetReport.guardMode}</Badge>
                  <span className="text-muted-foreground">日期: {aiBudgetReport.usageDate}</span>
                  <span className="text-muted-foreground">
                    更新时间: {new Date(aiBudgetReport.generatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {aiBudgetReport.global.map((item) => {
                    const risk = getBudgetRiskMeta(item.estimatedExhaustAt);
                    return (
                      <div key={item.operation} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{operationLabel(item.operation)}</div>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${risk.riskClassName}`}>
                            风险 {risk.riskText}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          已用 {item.used} / 配额 {item.quota} ({formatPercent(item.usageRate)})
                        </div>
                        <div className="text-xs text-muted-foreground">全站剩余额度: {item.remaining}</div>
                        <div className="text-xs text-muted-foreground">预计耗尽: 剩余约 {risk.remainingHoursText}</div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <div className="mb-2 font-medium">用户额度使用率 (Top 20)</div>
                  {aiBudgetReport.users.length === 0 ? (
                    <div className="rounded-md border p-3 text-muted-foreground">今日暂无用户预算消耗</div>
                  ) : (
                    <div className="overflow-auto rounded-md border">
                      <table className="w-full min-w-[760px] text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left">用户</th>
                            <th className="px-3 py-2 text-left">操作</th>
                            <th className="px-3 py-2 text-left">已用/配额</th>
                            <th className="px-3 py-2 text-left">使用率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiBudgetReport.users.slice(0, 20).map((row, idx) => (
                            <tr key={`${row.userId}-${row.operation}-${idx}`} className="border-t">
                              <td className="px-3 py-2">
                                #{row.userId}
                                {row.username ? ` · ${row.username}` : ""}
                                {row.email ? ` · ${row.email}` : ""}
                              </td>
                              <td className="px-3 py-2">{operationLabel(row.operation)}</td>
                              <td className="px-3 py-2">{row.used} / {row.quota}</td>
                              <td className="px-3 py-2">{formatPercent(row.usageRate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">账务对账看板</CardTitle>
            <Button variant="outline" size="sm" onClick={loadReconciliation} disabled={isLoadingReconciliation}>
              {isLoadingReconciliation ? "加载中..." : "刷新对账"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!reconciliationReport ? (
              <div className="text-muted-foreground">暂无对账数据</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={reconciliationReport.totalMismatches > 0 ? "destructive" : "outline"}>
                    mismatch: {reconciliationReport.totalMismatches}
                  </Badge>
                  <span className="text-muted-foreground">窗口: {reconciliationReport.lookbackHours}h</span>
                  <span className="text-muted-foreground">
                    更新时间: {new Date(reconciliationReport.generatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {reconciliationReport.mismatches.map((item) => (
                    <div key={item.kind} className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">{item.kind}</div>
                      <div className="mt-1 text-lg font-semibold">{item.count}</div>
                    </div>
                  ))}
                </div>

                {sampleRows.length === 0 ? (
                  <div className="rounded-md border p-3 text-muted-foreground">当前窗口未发现异常样本用户</div>
                ) : (
                  <div className="space-y-3">
                    {sampleRows.map((group) => (
                      <div key={group.title} className="rounded-md border p-3">
                        <div className="mb-2 font-medium">{group.title}</div>
                        <div className="overflow-auto rounded-md border">
                          <table className="w-full min-w-[760px] text-xs">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left">用户</th>
                                <th className="px-3 py-2 text-left">reference_id</th>
                                <th className="px-3 py-2 text-left">差额</th>
                                <th className="px-3 py-2 text-left">时间</th>
                                <th className="px-3 py-2 text-right">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => (
                                <tr key={row.key} className="border-t">
                                  <td className="px-3 py-2">{row.userId}</td>
                                  <td className="px-3 py-2">{row.referenceId}</td>
                                  <td className="px-3 py-2">{row.diff}</td>
                                  <td className="px-3 py-2">{row.eventTime}</td>
                                  <td className="px-3 py-2 text-right">
                                    <Button variant="outline" size="sm" onClick={() => copySql(row)}>
                                      {copiedSqlKey === row.key ? "已复制" : "复制排查 SQL"}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">订单明细</h2>
            <Button variant="outline" onClick={loadOrders} disabled={isLoadingOrders}>
              {isLoadingOrders ? "刷新中..." : "刷新"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
              全部订单 ({statusCount.all})
            </Button>
            <Button variant={filter === "processing" ? "default" : "outline"} onClick={() => setFilter("processing")}>
              正在处理 ({statusCount.processing})
            </Button>
            <Button variant={filter === "shipping" ? "default" : "outline"} onClick={() => setFilter("shipping")}>
              运输中 ({statusCount.shipping})
            </Button>
            <Button variant={filter === "delivered" ? "default" : "outline"} onClick={() => setFilter("delivered")}>
              已送达 ({statusCount.delivered})
            </Button>
          </div>
        </div>

        {error && (
          <Card className="mb-6 border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {isLoadingOrders ? (
          <div className="text-sm text-muted-foreground">正在加载订单...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无订单</div>
        ) : (
          <div className="grid gap-6">
            {filteredOrders.map((order) => (
              <Card key={order.id}>
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base">订单 #{order.id}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      用户 ID: {order.user_id} {order.user_name ? `· ${order.user_name}` : ""} {order.user_email ? `· ${order.user_email}` : ""}
                    </p>
                    {order.created_at && (
                      <p className="text-xs text-muted-foreground">下单时间：{new Date(order.created_at).toLocaleString("zh-CN")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">¥{Number(order.total || 0).toFixed(2)}</Badge>
                    <select
                      className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                      value={order.status || "pending"}
                      onChange={(event) => handleStatusChange(order.id, event.target.value)}
                      disabled={updatingId === order.id}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">收货地址</div>
                    <div className="rounded-md border p-3 text-sm">
                      {order.address || order.shipping_info?.address || "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">订单配置</div>
                    <div className="rounded-md border p-3 text-sm space-y-1">
                      <div>版型：{order.selections?.style ?? "—"}</div>
                      <div>颜色：{order.selections?.color ?? "—"}</div>
                      <div>尺码：{order.selections?.size ?? "—"}</div>
                      <div>单价：{formatMaybeNumber(order.selections?.price)}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">设计元素坐标</div>
                    <div className="rounded-md border p-3 text-xs space-y-2 max-h-72 overflow-auto">
                      {(order.design?.elements || []).length === 0 ? (
                        <div className="text-muted-foreground">无</div>
                      ) : (
                        (order.design?.elements || []).map((el, idx) => (
                          <div key={el.id || idx} className="border-b last:border-b-0 pb-2 last:pb-0">
                            <div>元素：{el.type || "—"}{el.side ? ` / ${el.side}` : ""}</div>
                            <div>坐标：x {formatMaybeNumber(el.x)} · y {formatMaybeNumber(el.y)}</div>
                            <div>尺寸：w {formatMaybeNumber(el.width)} · h {formatMaybeNumber(el.height)}</div>
                            <div>旋转：{formatMaybeNumber(el.rotation)}</div>
                            {typeof el.visible === "boolean" ? <div>可见：{el.visible ? "是" : "否"}</div> : null}
                            {el.content ? <div className="truncate">内容：{el.content}</div> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4">
                    {(() => {
                      const frontCanvas = order.design?.canvas?.snapshots?.front || null;
                      const backCanvas = order.design?.canvas?.snapshots?.back || null;
                      const frontElementOnly = order.design?.canvas?.elementSnapshots?.front || null;
                      const backElementOnly = order.design?.canvas?.elementSnapshots?.back || null;
                      const frontTryOn = order.canvas_front || null;
                      const backTryOn = order.canvas_back || null;
                      return (
                        <>
                          <div>
                            <div className="mb-2 text-sm font-medium text-foreground">衣服画布</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">正面画布</div>
                                {frontCanvas ? (
                                  <>
                                    <img src={frontCanvas} alt={`order-${order.id}-canvas-front`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(frontCanvas, `order-${order.id}-canvas-front.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">背面画布</div>
                                {backCanvas ? (
                                  <>
                                    <img src={backCanvas} alt={`order-${order.id}-canvas-back`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(backCanvas, `order-${order.id}-canvas-back.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 text-sm font-medium text-foreground">纯元素图（画布框内）</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">正面元素</div>
                                {frontElementOnly ? (
                                  <>
                                    <img src={frontElementOnly} alt={`order-${order.id}-elements-front`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(frontElementOnly, `order-${order.id}-elements-front.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">背面元素</div>
                                {backElementOnly ? (
                                  <>
                                    <img src={backElementOnly} alt={`order-${order.id}-elements-back`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(backElementOnly, `order-${order.id}-elements-back.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 text-sm font-medium text-foreground">模特试穿效果</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">正面试穿</div>
                                {frontTryOn ? (
                                  <>
                                    <img src={frontTryOn} alt={`order-${order.id}-tryon-front`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(frontTryOn, `order-${order.id}-tryon-front.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">背面试穿</div>
                                {backTryOn ? (
                                  <>
                                    <img src={backTryOn} alt={`order-${order.id}-tryon-back`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(backTryOn, `order-${order.id}-tryon-back.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
