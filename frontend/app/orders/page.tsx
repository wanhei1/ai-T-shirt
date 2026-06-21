"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import apiClient, { type OrderTrackingResponse } from "@/lib/api-client";
import { useLanguage } from "@/contexts/language-context";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Loader2,
  PackageCheck,
  Search,
  Shirt,
  Sparkles,
  Truck,
} from "lucide-react";

type OrderStage = "all" | "pending_payment" | "processing" | "shipped" | "completed";
type TimeFilter = "all" | "30d" | "90d" | "year";

type OrderRecord = {
  id: number | string;
  created_at: string;
  total: number | string;
  status?: string | null;
  payment_status?: string | null;
  payment_channel?: string | null;
  payment_order_id?: string | null;
  paid_at?: string | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  sku_snapshot?: unknown;
  production_slot_date?: string | null;
  production_due_at?: string | null;
  promised_ship_at?: string | null;
  has_front_image?: boolean | null;
  has_back_image?: boolean | null;
  items?: unknown;
  selections?: unknown;
  shipping_info?: unknown;
  address?: string | null;
  phone?: string | null;
  category?: string | null;
  source_all_id?: number | string | null;
};

type OrderDetailState = {
  loading: boolean;
  order: OrderRecord | null;
  error: boolean;
};

const PAGE_SIZE = 10;

const tabOrder: Array<{ key: OrderStage; zh: string; en: string }> = [
  { key: "all", zh: "所有订单", en: "All" },
  { key: "pending_payment", zh: "待付款", en: "To Pay" },
  { key: "processing", zh: "生产中", en: "In Production" },
  { key: "shipped", zh: "已发货", en: "Shipped" },
  { key: "completed", zh: "已完成", en: "Completed" },
];

const parseJsonish = (value: unknown): any => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const toNumber = (value: unknown) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const formatMoney = (value: unknown) => `¥${toNumber(value).toFixed(2)}`;

const formatDate = (value: string | null | undefined, locale: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const formatDateTime = (value: string | null | undefined, locale: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStage = (order: OrderRecord): OrderStage => {
  const status = String(order.status || "").toLowerCase();
  const payment = String(order.payment_status || "").toLowerCase();

  if (["completed", "delivered", "finished"].includes(status)) return "completed";
  if (["shipped", "in_transit"].includes(status)) return "shipped";
  if (["pending", "pending_payment", "created", "unpaid"].includes(status) || ["pending", "unpaid"].includes(payment)) {
    return "pending_payment";
  }
  if (["paid", "processing", "production", "in_production"].includes(status) || payment === "paid") {
    return "processing";
  }
  return "processing";
};

const getProductName = (order: OrderRecord) => {
  const sku = parseJsonish(order.sku_snapshot);
  const selections = parseJsonish(order.selections);
  const items = parseJsonish(order.items);

  if (sku && typeof sku === "object") {
    const name = sku.name || sku.title || sku.productName || sku.product_name || sku.skuName;
    if (name) return String(name);
  }
  if (Array.isArray(items) && items[0]) {
    const item = items[0];
    const name = item.name || item.title || item.productName || item.product_name;
    if (name) return String(name);
  }
  if (selections && typeof selections === "object") {
    const category = selections.category || selections.style || selections.productName;
    if (category) return String(category);
  }
  return "YITUAI 定制服装";
};

const getProductSpec = (order: OrderRecord) => {
  const sku = parseJsonish(order.sku_snapshot);
  const selections = parseJsonish(order.selections);
  const parts: string[] = [];

  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  };

  if (sku && typeof sku === "object") {
    push(sku.color);
    push(sku.size);
    push(sku.skuCode || sku.sku_code);
  }
  if (selections && typeof selections === "object") {
    push(selections.color);
    push(selections.size);
    push(selections.gender);
    push(selections.fit);
  }

  return Array.from(new Set(parts)).slice(0, 4).join(" / ") || "定制款 / 单件生产";
};

const getSearchText = (order: OrderRecord) => {
  const fields = [
    order.id,
    order.status,
    order.payment_status,
    getProductName(order),
    getProductSpec(order),
    JSON.stringify(parseJsonish(order.sku_snapshot) || ""),
  ];
  return fields.join(" ").toLowerCase();
};

const getStageLabel = (stage: OrderStage, translate: ReturnType<typeof useLanguage>["translate"]) => {
  const labels: Record<OrderStage, { zh: string; en: string }> = {
    all: { zh: "所有订单", en: "All orders" },
    pending_payment: { zh: "待付款", en: "Awaiting payment" },
    processing: { zh: "生产中", en: "In production" },
    shipped: { zh: "已发货", en: "Shipped" },
    completed: { zh: "已完成", en: "Completed" },
  };
  return translate(labels[stage]);
};

function LazyThumbnail({ order }: { order: OrderRecord }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[#17120d]/10 bg-[#efe4d0] sm:h-28 sm:w-28"
    >
      {order.has_front_image && visible ? (
        <img
          src={apiClient.getThumbnailUrl(order.id)}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
      {(!order.has_front_image || !loaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#f6edde,#dfc39a)]">
          <Shirt className="h-8 w-8 text-[#8f3c23]/55" />
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  detail,
  tracking,
  locale,
}: {
  detail: OrderDetailState | undefined;
  tracking: OrderTrackingResponse | undefined;
  locale: string;
}) {
  if (detail?.loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[#f4ead8] px-4 py-4 text-sm text-[#6e6251]">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载订单详情中...
      </div>
    );
  }

  const order = detail?.order;
  const shipping = parseJsonish(order?.shipping_info);
  const address = order?.address || shipping?.address || shipping?.detail || "-";

  return (
    <div className="grid gap-3 rounded-xl border border-[#17120d]/10 bg-[#fffaf0] p-4 text-sm text-[#4d4235] lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-2">
        <div className="font-semibold text-[#17120d]">订单资料</div>
        <div>支付时间：{formatDateTime(order?.paid_at, locale)}</div>
        <div>预计发货：{formatDateTime(order?.promised_ship_at || order?.production_due_at, locale)}</div>
        <div>收货地址：{address}</div>
        <div>联系电话：{order?.phone || shipping?.phone || "-"}</div>
      </div>
      <div className="space-y-2">
        <div className="font-semibold text-[#17120d]">物流信息</div>
        {tracking?.shipment ? (
          <>
            <div>物流公司：{tracking.shipment.carrier}</div>
            <div>运单号：{tracking.shipment.trackingNo}</div>
            <div>物流状态：{tracking.shipment.status}</div>
          </>
        ) : (
          <div className="text-[#8a7d69]">暂未生成物流单，生产完成后会更新。</div>
        )}
        {(tracking?.timeline || []).slice(0, 4).map((event) => (
          <div key={event.key} className="flex justify-between gap-4 border-t border-[#17120d]/10 pt-2 text-xs">
            <span>{event.label}</span>
            <span className="text-right text-[#8a7d69]">{formatDateTime(event.time, locale)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { translate } = useLanguage();
  const locale = translate({ zh: "zh-CN", en: "en-US" });
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderStage>("all");
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, OrderDetailState>>({});
  const [trackingMap, setTrackingMap] = useState<Record<number, OrderTrackingResponse>>({});
  const [trackingLoadingId, setTrackingLoadingId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadOrders = async () => {
      try {
        setLoading(true);
        setLoadError(false);
        const response = await apiClient.getOrderSummaries(100);
        if (mounted) setOrders(response.orders || []);
      } catch (error) {
        console.warn("Failed to fetch order summaries", error);
        if (mounted) {
          setLoadError(true);
          setOrders([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadOrders();
    return () => {
      mounted = false;
    };
  }, []);

  const stageCounts = useMemo(() => {
    return orders.reduce<Record<OrderStage, number>>(
      (acc, order) => {
        const stage = getStage(order);
        acc.all += 1;
        acc[stage] += 1;
        return acc;
      },
      { all: 0, pending_payment: 0, processing: 0, shipped: 0, completed: 0 }
    );
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const cutoffDays: Record<Exclude<TimeFilter, "all">, number> = {
      "30d": 30,
      "90d": 90,
      year: 365,
    };
    const normalizedQuery = query.trim().toLowerCase();

    return orders.filter((order) => {
      if (activeTab !== "all" && getStage(order) !== activeTab) return false;
      if (normalizedQuery && !getSearchText(order).includes(normalizedQuery)) return false;
      if (timeFilter !== "all") {
        const date = new Date(order.created_at);
        if (Number.isNaN(date.getTime())) return false;
        const days = cutoffDays[timeFilter];
        if (now - date.getTime() > days * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [activeTab, orders, query, timeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, timeFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const loadDetail = async (orderId: number) => {
    if (details[orderId]?.order || details[orderId]?.loading) return;
    setDetails((prev) => ({ ...prev, [orderId]: { loading: true, order: null, error: false } }));
    try {
      const response = await apiClient.getOrderDetail(orderId);
      setDetails((prev) => ({ ...prev, [orderId]: { loading: false, order: response.order, error: false } }));
    } catch (error) {
      console.warn("Failed to fetch order detail", error);
      setDetails((prev) => ({ ...prev, [orderId]: { loading: false, order: null, error: true } }));
    }
  };

  const loadTracking = async (orderId: number) => {
    if (trackingMap[orderId] || trackingLoadingId === orderId) return;
    try {
      setTrackingLoadingId(orderId);
      const tracking = await apiClient.getOrderTracking(orderId);
      setTrackingMap((prev) => ({ ...prev, [orderId]: tracking }));
    } catch (error) {
      console.warn("Failed to fetch order tracking", error);
    } finally {
      setTrackingLoadingId(null);
    }
  };

  const toggleExpanded = async (orderIdRaw: number | string) => {
    const orderId = Number(orderIdRaw);
    if (!Number.isFinite(orderId) || orderId <= 0) return;
    const next = expandedOrderId === orderId ? null : orderId;
    setExpandedOrderId(next);
    if (next) {
      await Promise.all([loadDetail(orderId), loadTracking(orderId)]);
    }
  };

  const handleTrackingClick = async (orderIdRaw: number | string) => {
    const orderId = Number(orderIdRaw);
    if (!Number.isFinite(orderId) || orderId <= 0) return;
    if (expandedOrderId !== orderId) setExpandedOrderId(orderId);
    await Promise.all([loadDetail(orderId), loadTracking(orderId)]);
  };

  return (
    <AuthGuard requireAuth>
      <main className="min-h-screen bg-[#f5eddf] text-[#17120d]">
        <section className="border-b border-[#17120d]/10 bg-[radial-gradient(circle_at_12%_20%,rgba(195,59,35,0.16),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(16,95,76,0.16),transparent_28%),linear-gradient(135deg,#f8f0e2_0%,#efe0c6_100%)]">
          <div className="mx-auto max-w-[1500px] px-4 py-10 md:px-8 lg:py-14">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
              <div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#c33b23] text-sm font-black text-[#fff8ed] shadow-[0_14px_30px_rgba(195,59,35,0.22)]">
                  单
                </span>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.28em] text-[#8f3c23]">Order Atelier</p>
                <h1 className="mt-3 text-4xl font-black leading-tight md:text-6xl">
                  我的订单
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[#5e5245] md:text-lg">
                  从付款、生产、发货到售后，把每一件定制服装的进度放在同一个页面里。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[#17120d]/10 bg-[#fff8ed]/75 p-4 shadow-[0_24px_60px_rgba(48,34,20,0.12)] backdrop-blur">
                <div>
                  <div className="text-3xl font-black">{stageCounts.all}</div>
                  <div className="mt-1 text-xs text-[#6e6251]">全部订单</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-[#c33b23]">{stageCounts.pending_payment}</div>
                  <div className="mt-1 text-xs text-[#6e6251]">待处理</div>
                </div>
                <div>
                  <div className="text-3xl font-black text-[#0f5f4c]">{stageCounts.processing + stageCounts.shipped}</div>
                  <div className="mt-1 text-xs text-[#6e6251]">进行中</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1500px] px-4 py-8 md:px-8">
          <div className="sticky top-[72px] z-20 -mx-4 border-y border-[#17120d]/10 bg-[#f5eddf]/92 px-4 py-4 backdrop-blur md:top-20 md:-mx-8 md:px-8">
            <div className="flex gap-6 overflow-x-auto">
              {tabOrder.map((tab) => {
                const active = activeTab === tab.key;
                const count = stageCounts[tab.key];
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative shrink-0 pb-3 text-sm font-bold transition ${active ? "text-[#c33b23]" : "text-[#4d4235] hover:text-[#17120d]"}`}
                  >
                    {translate({ zh: tab.zh, en: tab.en })}
                    {tab.key !== "all" && count > 0 ? (
                      <span className="ml-2 rounded-full bg-[#c33b23] px-2 py-0.5 text-xs text-white">{count}</span>
                    ) : null}
                    {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#c33b23]" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7d69]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={translate({ zh: "搜索订单号 / 商品名 / 尺码", en: "Search order, product, size" })}
                  className="h-12 rounded-xl border-[#17120d]/15 bg-[#fffaf0] pl-10 text-[#17120d] placeholder:text-[#9a8c78]"
                />
              </label>
              <select
                value={timeFilter}
                onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
                className="h-12 rounded-xl border border-[#17120d]/15 bg-[#fffaf0] px-4 text-sm font-semibold text-[#4d4235] outline-none"
              >
                <option value="all">全部时间</option>
                <option value="30d">最近 30 天</option>
                <option value="90d">最近 90 天</option>
                <option value="year">最近一年</option>
              </select>
              <Link href="/design" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#17120d] px-5 text-sm font-bold text-[#fff8ed] transition hover:bg-[#3a2a1d]">
                <Sparkles className="h-4 w-4" />
                同款新作
              </Link>
            </div>
          </div>

          <div className="mt-6">
            <div className="hidden grid-cols-[1fr_160px_160px] border-b border-[#17120d]/10 px-4 pb-3 text-sm font-bold text-[#7a6d5b] lg:grid">
              <span>订单信息</span>
              <span className="text-right">商品金额</span>
              <span className="text-right">订单操作</span>
            </div>

            {loading ? (
              <div className="grid gap-4 py-6">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-44 animate-pulse rounded-2xl bg-[#fff8ed]/70" />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-2xl border border-[#c33b23]/20 bg-[#fff8ed] p-8 text-center">
                <div className="text-lg font-black">订单加载失败</div>
                <p className="mt-2 text-sm text-[#6e6251]">请刷新页面重试。</p>
              </div>
            ) : pagedOrders.length === 0 ? (
              <div className="rounded-2xl border border-[#17120d]/10 bg-[#fff8ed] p-10 text-center">
                <PackageCheck className="mx-auto h-10 w-10 text-[#c33b23]" />
                <div className="mt-4 text-xl font-black">没有找到订单</div>
                <p className="mt-2 text-sm text-[#6e6251]">换一个筛选条件，或先去设计一件新的衣服。</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pagedOrders.map((order) => {
                  const stage = getStage(order);
                  const orderId = Number(order.id);
                  const expanded = expandedOrderId === orderId;
                  const detail = details[orderId];
                  const tracking = trackingMap[orderId];
                  return (
                    <article
                      key={String(order.id)}
                      className="overflow-hidden rounded-2xl border border-[#17120d]/10 bg-[#fff8ed] shadow-[0_18px_50px_rgba(46,32,18,0.08)]"
                    >
                      <div className="flex flex-col gap-3 bg-[#e8ddd0] px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-bold">
                          <span>{formatDate(order.created_at, locale)}</span>
                          <span className="text-[#6e6251]">订单号：#{order.id}</span>
                          {order.payment_order_id ? <span className="text-xs text-[#8a7d69]">支付单：{order.payment_order_id}</span> : null}
                        </div>
                        <Badge className="w-fit rounded-full bg-[#17120d] px-3 py-1 text-[#fff8ed] hover:bg-[#17120d]">
                          {getStageLabel(stage, translate)}
                        </Badge>
                      </div>

                      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_160px_160px] lg:items-start">
                        <div className="flex gap-4">
                          <LazyThumbnail order={order} />
                          <div className="min-w-0 flex-1">
                            <h2 className="line-clamp-2 text-base font-black leading-6 text-[#17120d] md:text-lg">
                              {getProductName(order)}
                            </h2>
                            <p className="mt-2 text-sm text-[#6e6251]">{getProductSpec(order)}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6e6251]">
                              {order.production_due_at || order.promised_ship_at ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#f2e5cf] px-3 py-1">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  预计 {formatDate(order.promised_ship_at || order.production_due_at, locale)}
                                </span>
                              ) : null}
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#f2e5cf] px-3 py-1">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatDateTime(order.created_at, locale)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-left lg:text-right">
                          <div className="text-lg font-black">{formatMoney(order.total)}</div>
                          <div className="mt-1 text-xs text-[#8a7d69]">实付款</div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
                          {stage === "pending_payment" ? (
                            <Link href="/cart" className="inline-flex h-10 items-center justify-center rounded-full bg-[#c33b23] px-5 text-sm font-bold text-white hover:bg-[#a9311d]">
                              去支付
                            </Link>
                          ) : null}
                          {stage === "shipped" ? (
                            <Button
                              type="button"
                              onClick={() => handleTrackingClick(order.id)}
                              disabled={trackingLoadingId === orderId}
                              className="rounded-full bg-[#c33b23] px-5 text-white hover:bg-[#a9311d]"
                            >
                              {trackingLoadingId === orderId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                              查看物流
                            </Button>
                          ) : null}
                          {stage === "completed" ? (
                            <Link href="/design/editor" className="inline-flex h-10 items-center justify-center rounded-full bg-[#c33b23] px-5 text-sm font-bold text-white hover:bg-[#a9311d]">
                              同款定制
                            </Link>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => toggleExpanded(order.id)}
                            className="rounded-full border-[#17120d]/20 bg-transparent px-5 text-[#17120d] hover:bg-[#f1e1c8]"
                          >
                            {expanded ? "收起详情" : "订单详情"}
                            {expanded ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                          </Button>
                          {stage === "completed" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => window.alert("售后申请请联系官方客服，我们会根据定制订单信息协助处理。")}
                              className="rounded-full text-[#4d4235] hover:bg-[#f1e1c8]"
                            >
                              申请售后
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {expanded ? (
                        <div className="border-t border-[#17120d]/10 px-4 pb-4">
                          <DetailPanel detail={detail} tracking={tracking} locale={locale} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-[#17120d]/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[#6e6251]">
              共 {filteredOrders.length} 个订单，当前第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-full border-[#17120d]/20 bg-[#fff8ed]"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-full border-[#17120d]/20 bg-[#fff8ed]"
              >
                下一页
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
