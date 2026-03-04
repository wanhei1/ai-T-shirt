"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/lib/api-client";
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
    canvas?: { snapshots?: { front?: string | null; back?: string | null } };
  } | null;
  user_name?: string | null;
  user_email?: string | null;
  created_at?: string;
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

export default function AdminPage() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "processing" | "shipping" | "delivered">("all");

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
      setError(err instanceof Error ? err.message : "加载订单失败");
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (!user || !(user as any)?.is_admin) return;
    loadOrders();
  }, [user]);

  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      setUpdatingId(orderId);
      await apiClient.updateAdminOrderStatus(orderId, status);
      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status } : order)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新状态失败");
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
