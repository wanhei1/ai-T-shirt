"use client";

import { useEffect, useState } from "react";
import { Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_OPTIONS } from "@/components/admin/types";
import type { AdminOrder } from "@/components/admin/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const formatMaybeNumber = (value: unknown) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(value);
};

const formatStatus = (status: string) => {
  const opt = STATUS_OPTIONS.find((o) => o.value === status);
  return opt?.label ?? status;
};

const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "delivered") return "default";
  if (status === "shipping") return "secondary";
  if (status === "processing") return "outline";
  return "outline";
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

/* ------------------------------------------------------------------ */
/* Image with fallback                                                 */
/* ------------------------------------------------------------------ */

function OrderImage({
  src,
  alt,
  filename,
  auth,
}: {
  src: string | null;
  alt: string;
  filename: string;
  auth?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // For auth-required images, fetch with token → blob URL
  useEffect(() => {
    if (!src || !auth) return;
    let cancelled = false;
    const token = localStorage.getItem("authToken") || localStorage.getItem("token");
    if (!token) {
      setState("error");
      return;
    }
    fetch(src, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setState("ok");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [src, auth]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const displaySrc = auth ? blobUrl : src;

  if (!src) {
    return (
      <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">
        无图片
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {state === "loading" && <Skeleton className="h-36 w-full rounded-md" />}
      {state === "error" && (
        <div className="h-36 w-full rounded-md border border-destructive/40 bg-destructive/5 flex items-center justify-center text-xs text-destructive">
          图片加载失败
        </div>
      )}
      {displaySrc && (
        <img
          src={displaySrc}
          alt={alt}
          className={`h-36 w-full rounded-md border object-contain ${state === "ok" ? "" : "hidden"}`}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
      )}
      {state === "ok" && displaySrc && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => downloadImage(displaySrc, filename)}
        >
          下载
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main drawer component                                               */
/* ------------------------------------------------------------------ */

export function OrderDetailDrawer({
  order,
  open,
  onClose,
  onStatusChange,
  updatingId,
  isLoadingDetail,
}: {
  order: AdminOrder | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (orderId: number, status: string) => void;
  updatingId: number | null;
  isLoadingDetail?: boolean;
}) {
  if (!order) return null;

  const status = order.status || "pending";
  const prefixPath = (p: string | null | undefined) => {
    if (!p) return null;
    // base64 data URLs don't need prefix
    if (p.startsWith("data:") || p.startsWith("http")) return p;
    return `/backend${p}`;
  };
  const frontCanvas = prefixPath(order.canvas_front_snapshot);
  const backCanvas = prefixPath(order.canvas_back_snapshot);
  const frontElements = prefixPath(order.element_front_snapshot);
  const backElements = prefixPath(order.element_back_snapshot);
  const frontTryOn = order.id ? `/backend/api/admin/orders/${order.id}/thumbnail` : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>订单 #{order.id}</SheetTitle>
          <SheetDescription>
            {order.user_name || `用户 #${order.user_id}`}
            {order.user_email ? ` · ${order.user_email}` : ""}
          </SheetDescription>
        </SheetHeader>

        {isLoadingDetail && (
          <div className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            加载详情中...
          </div>
        )}

        <div className="px-4 pb-4 space-y-5 text-sm">
          {/* ---- Basic info ---- */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">状态</span>
              <Badge variant={statusBadgeVariant(status)}>{formatStatus(status)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">金额</span>
              <span className="font-medium">¥{Number(order.total || 0).toFixed(2)}</span>
            </div>
            {order.created_at && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">下单时间</span>
                <span>{new Date(order.created_at).toLocaleString("zh-CN")}</span>
              </div>
            )}
          </section>

          {/* ---- Status change ---- */}
          <section className="space-y-2">
            <div className="text-muted-foreground">修改状态</div>
            <div className="flex gap-2">
              <select
                className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={status}
                onChange={(e) => onStatusChange(order.id, e.target.value)}
                disabled={updatingId === order.id}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {status !== "shipping" && status !== "delivered" && (
                <Button
                  size="sm"
                  onClick={() => onStatusChange(order.id, "shipping")}
                  disabled={updatingId === order.id}
                >
                  发货
                </Button>
              )}
            </div>
          </section>

          {/* ---- Address ---- */}
          <section className="space-y-2">
            <div className="text-muted-foreground">收货地址</div>
            <div className="rounded-md border p-3">
              {order.address || order.shipping_info?.address || "—"}
            </div>
          </section>

          {/* ---- Order config ---- */}
          <section className="space-y-2">
            <div className="text-muted-foreground">订单配置</div>
            <div className="rounded-md border p-3 space-y-1">
              <div>版型：{order.selections?.style ?? "—"}</div>
              <div>颜色：{order.selections?.color ?? "—"}</div>
              <div>尺码：{order.selections?.size ?? "—"}</div>
              <div>单价：{formatMaybeNumber(order.selections?.price)}</div>
            </div>
          </section>

          {/* ---- Design elements ---- */}
          {(order.design_elements || []).length > 0 && (
            <section className="space-y-2">
              <div className="text-muted-foreground">设计元素</div>
              <div className="rounded-md border p-3 text-xs space-y-2 max-h-48 overflow-auto">
                {(order.design_elements || []).map((el, idx) => (
                  <div key={el.id || idx} className="border-b last:border-b-0 pb-2 last:pb-0">
                    <div className="font-medium">
                      {el.type || "—"}{el.side ? ` / ${el.side}` : ""}
                    </div>
                    <div>x {formatMaybeNumber(el.x)} · y {formatMaybeNumber(el.y)}</div>
                    <div>w {formatMaybeNumber(el.width)} · h {formatMaybeNumber(el.height)}</div>
                    {el.content && <div className="truncate text-muted-foreground">{el.content}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---- Images ---- */}
          <section className="space-y-3">
            <div className="text-muted-foreground">图片预览</div>

            <div>
              <div className="text-xs font-medium mb-1">衣服画布</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">正面</div>
                  <OrderImage src={frontCanvas} alt={`order-${order.id}-canvas-front`} filename={`order-${order.id}-canvas-front.png`} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">背面</div>
                  <OrderImage src={backCanvas} alt={`order-${order.id}-canvas-back`} filename={`order-${order.id}-canvas-back.png`} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-1">纯元素图</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">正面</div>
                  <OrderImage src={frontElements} alt={`order-${order.id}-elements-front`} filename={`order-${order.id}-elements-front.png`} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">背面</div>
                  <OrderImage src={backElements} alt={`order-${order.id}-elements-back`} filename={`order-${order.id}-elements-back.png`} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-1">模特试穿</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">正面</div>
                  <OrderImage src={frontTryOn} alt={`order-${order.id}-tryon-front`} filename={`order-${order.id}-tryon-front.png`} auth />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">背面</div>
                  <OrderImage src={null} alt="" filename="" />
                </div>
              </div>
            </div>
          </section>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
