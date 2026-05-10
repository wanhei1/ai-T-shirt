"use client";

import { useEffect, useMemo, useState } from "react";
import apiClient, { getFriendlyApiErrorSummary } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminOrder, STATUS_OPTIONS } from "@/components/admin/types";
import { OrderDetailDrawer } from "@/components/admin/order-detail-drawer";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type FilterType = "all" | "processing" | "shipping" | "delivered";

const formatStatus = (status: string) => {
  const opt = STATUS_OPTIONS.find((o) => o.value === status);
  return opt?.label ?? status;
};

const statusBadgeVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "delivered") return "default";
  if (s === "shipping") return "secondary";
  return "outline";
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AdminOrdersPage() {
  const { user, isLoading } = useAuth();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  /* ---- Data loading ---- */
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
  }, [user]);

  /* ---- Status change ---- */
  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      setUpdatingId(orderId);
      await apiClient.updateAdminOrderStatus(orderId, status);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
      // Update selected order in drawer if it's the same one
      setSelectedOrder((prev) => (prev?.id === orderId ? { ...prev, status } : prev));
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "更新状态失败", en: "Failed to update status" }, "zh"));
    } finally {
      setUpdatingId(null);
    }
  };

  /* ---- Open drawer: fetch full detail on demand ---- */
  const openDrawer = async (order: AdminOrder) => {
    setSelectedOrder(order); // show basic info immediately
    setDrawerOpen(true);
    setIsLoadingDetail(true);
    try {
      const detail = await apiClient.getAdminOrderDetail(order.id);
      if (detail?.order) {
        setSelectedOrder(detail.order as AdminOrder);
      }
    } catch (err) {
      console.error('Failed to load order detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  /* ---- Derived ---- */
  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "processing") {
      return orders.filter((o) => (o.status || "pending") === "processing" || (o.status || "pending") === "pending");
    }
    return orders.filter((o) => (o.status || "pending") === filter);
  }, [orders, filter]);

  const statusCount = useMemo(() => ({
    all: orders.length,
    processing: orders.filter((o) => (o.status || "pending") === "processing" || (o.status || "pending") === "pending").length,
    shipping: orders.filter((o) => (o.status || "pending") === "shipping").length,
    delivered: orders.filter((o) => (o.status || "pending") === "delivered").length,
  }), [orders]);

  /* ---- Guard: layout handles auth, but show nothing while redirecting ---- */
  if (!user || !(user as any)?.is_admin) return null;

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">订单管理</h1>
        <Button variant="outline" size="sm" onClick={loadOrders} disabled={isLoadingOrders}>
          {isLoadingOrders ? "刷新中..." : "刷新"}
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([
          ["all", "全部"],
          ["processing", "处理中"],
          ["shipping", "运输中"],
          ["delivered", "已送达"],
        ] as const).map(([key, label]) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(key)}
          >
            {label} ({statusCount[key]})
          </Button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {isLoadingOrders ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 items-center p-3 border rounded-md">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-20 ml-auto" />
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">📦</div>
          <div className="text-sm">暂无订单</div>
        </div>
      ) : (
        /* Orders table */
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">订单号</TableHead>
                <TableHead>用户</TableHead>
                <TableHead className="w-20">金额</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-40">下单时间</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const status = order.status || "pending";
                return (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDrawer(order)}
                  >
                    <TableCell className="font-medium">#{order.id}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {order.user_name || `#${order.user_id}`}
                      </div>
                      {order.user_email && (
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {order.user_email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>¥{Number(order.total || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(status)}>
                        {formatStatus(status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.created_at
                        ? new Date(order.created_at).toLocaleString("zh-CN")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDrawer(order)}
                      >
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail drawer */}
      <OrderDetailDrawer
        order={selectedOrder}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onStatusChange={handleStatusChange}
        updatingId={updatingId}
        isLoadingDetail={isLoadingDetail}
      />
    </div>
  );
}
