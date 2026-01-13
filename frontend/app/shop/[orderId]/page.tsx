"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/language-context";
import apiClient from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type GalleryDesign = {
  order_id: number | string;
  created_at: string;
  username: string;
  selections?: Record<string, any>;
  design?: {
    selections?: Record<string, any>;
    elements?: Array<{ id?: string; type?: string; content?: string }>;
    canvas?: any;
    side?: string;
  };
  canvas_front?: string | null;
  canvas_back?: string | null;
  canvas_meta?: any;
};

const FAVORITES_KEY = "shop:favorites";

function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function setFavorites(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

export default function ShopDetailPage({ params }: { params: { orderId: string } }) {
  const router = useRouter();
  const { translate } = useLanguage();

  const [item, setItem] = useState<GalleryDesign | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [zoomFront, setZoomFront] = useState(1);
  const [zoomBack, setZoomBack] = useState(1);

  const orderId = params.orderId;
  const allDesignId = Number(orderId) || null;

  const clampZoom = (value: number) => Math.max(1, Math.min(3, Number(value.toFixed(2))));

  const isFavorited = useMemo(() => {
    const favorites = getFavorites();
    return favorites.includes(String(orderId));
  }, [orderId]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoadState("loading");
      try {
        const response = await apiClient.getGalleryItem(orderId);
        const design = response.design as GalleryDesign | null;
        if (!design) {
          if (isMounted) setLoadState("not-found");
          return;
        }
        if (isMounted) {
          setItem(design);
          setLoadState("ready");
        }
      } catch (error) {
        console.warn("Failed to load gallery item", error);
        if (isMounted) setLoadState("error");
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [orderId]);

  const snapshots = useMemo(() => {
    return {
      front: item?.canvas_front ?? item?.design?.canvas?.snapshots?.front ?? null,
      back: item?.canvas_back ?? item?.design?.canvas?.snapshots?.back ?? null,
    };
  }, [item]);

  const canvasMeta = useMemo(() => item?.canvas_meta ?? item?.design?.canvas ?? null, [item]);

  const thumbnailSrc = useMemo(() => {
    if (snapshots.front) return snapshots.front;
    const elements = item?.design?.elements || [];
    const firstImage = elements.find((el) => el.type === "image" || el.type === "ai-generated");
    return firstImage?.content || null;
  }, [item, snapshots.front]);

  const displaySelections = useMemo(() => {
    return item?.selections || item?.design?.selections || {};
  }, [item]);

  const price = useMemo(() => {
    const base = Number(displaySelections?.price ?? 0);
    return Number.isFinite(base) ? base : 0;
  }, [displaySelections]);

  const total = useMemo(() => {
    // Keep consistent with preview page demo fees.
    return Number((price + 5 + 7.99).toFixed(2));
  }, [price]);

  const toggleFavorite = () => {
    const id = String(orderId);
    const favorites = getFavorites();
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [id, ...favorites];
    setFavorites(next);
    // Force a refresh of memoized value by navigating (simple, no extra state)
    router.refresh();
  };

  const handleCustomizeSame = () => {
    if (!item?.design) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("designData", JSON.stringify(item.design));
    }
    router.push("/design/editor");
  };

  const handleBuy = async () => {
    if (!item) return;

    const token =
      (typeof window !== "undefined" &&
        (localStorage.getItem("authToken") || localStorage.getItem("token"))) ||
      null;

    if (!token) {
      alert(translate({ zh: "请先登录后再购买", en: "Please log in before purchasing" }));
      router.push("/auth");
      return;
    }

    setIsPlacingOrder(true);
    try {
      const orderItems = item.design?.elements || [];
      const canvasPayload = {
        frontSnapshot: snapshots.front,
        backSnapshot: snapshots.back,
        meta: canvasMeta,
      };

      await apiClient.createOrder({
        total,
        items: orderItems,
        selections: displaySelections,
        design: item.design,
        canvas: canvasPayload,
        publishToAll: false,
        sourceAllId: allDesignId,
        shipping_info: {},
      });

      router.push("/profile");
    } catch (error) {
      console.error("Purchase failed", error);
      alert(translate({ zh: "购买失败，请重试", en: "Purchase failed, please try again" }));
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {translate({ zh: "商品详情", en: "Product Details" })}
            </h1>
            <p className="text-muted-foreground">
              {translate({ zh: "浏览与购买社区作品", en: "Browse and buy community designs" })}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild className="bg-transparent">
              <Link href="/shop">{translate({ zh: "返回店铺", en: "Back" })}</Link>
            </Button>
          </div>
        </div>

        {loadState === "loading" ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {translate({ zh: "加载中...", en: "Loading..." })}
            </CardContent>
          </Card>
        ) : loadState === "not-found" ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {translate({ zh: "未找到该商品", en: "Item not found" })}
            </CardContent>
          </Card>
        ) : loadState === "error" ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {translate({ zh: "加载失败，请稍后重试", en: "Failed to load. Please try again." })}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {translate({ zh: "作品预览", en: "Preview" })}
                </CardTitle>
                <CardDescription>
                  {translate({ zh: "来自", en: "By" })} {item?.username || "—"} • {new Date(item!.created_at).toLocaleString(
                    translate({ zh: "zh-CN", en: "en-US" })
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">{translate({ zh: "正面", en: "Front" })}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 bg-transparent"
                          onClick={() => setZoomFront((z) => clampZoom(z - 0.25))}
                        >
                          -
                        </Button>
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {Math.round(zoomFront * 100)}%
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 bg-transparent"
                          onClick={() => setZoomFront((z) => clampZoom(z + 0.25))}
                        >
                          +
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setZoomFront(1)}
                        >
                          {translate({ zh: "重置", en: "Reset" })}
                        </Button>
                      </div>
                    </div>
                    {snapshots.front || thumbnailSrc ? (
                      <div className="h-64 w-full rounded-md bg-muted/20 overflow-auto">
                        <div
                          className="min-w-full min-h-full"
                          style={{
                            width: `${zoomFront * 100}%`,
                            height: `${zoomFront * 100}%`,
                          }}
                        >
                          <img
                            src={snapshots.front || thumbnailSrc || ""}
                            alt={`shop-detail-front-${orderId}`}
                            className={`w-full h-full rounded-md object-contain ${zoomFront > 1 ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                            onClick={() => setZoomFront((z) => (z === 1 ? 2 : 1))}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="h-64 w-full rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">
                        {translate({ zh: "无预览图", en: "No preview" })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">{translate({ zh: "背面", en: "Back" })}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 bg-transparent"
                          onClick={() => setZoomBack((z) => clampZoom(z - 0.25))}
                        >
                          -
                        </Button>
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {Math.round(zoomBack * 100)}%
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 bg-transparent"
                          onClick={() => setZoomBack((z) => clampZoom(z + 0.25))}
                        >
                          +
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setZoomBack(1)}
                        >
                          {translate({ zh: "重置", en: "Reset" })}
                        </Button>
                      </div>
                    </div>
                    {snapshots.back ? (
                      <div className="h-64 w-full rounded-md bg-muted/20 overflow-auto">
                        <div
                          className="min-w-full min-h-full"
                          style={{
                            width: `${zoomBack * 100}%`,
                            height: `${zoomBack * 100}%`,
                          }}
                        >
                          <img
                            src={snapshots.back}
                            alt={`shop-detail-back-${orderId}`}
                            className={`w-full h-full rounded-md object-contain ${zoomBack > 1 ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                            onClick={() => setZoomBack((z) => (z === 1 ? 2 : 1))}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="h-64 w-full rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">
                        {translate({ zh: "无预览图", en: "No preview" })}
                      </div>
                    )}
                  </div>
                </div>

                {canvasMeta && (
                  <p className="text-xs text-muted-foreground">
                    {translate({ zh: "包含完整画布信息，可直接下单或同款定制", en: "Includes full canvas data for ordering or customizing" })}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">
                      {translate({ zh: "购买信息", en: "Purchase" })}
                    </CardTitle>
                    <CardDescription>
                      {translate({ zh: "同款可定制，也可直接购买", en: "Customize the same style or buy now" })}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">#{orderId}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {translate({ zh: "价格（基础）", en: "Base price" })}
                    </span>
                    <span className="font-semibold">¥{price.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {translate({ zh: "预计合计", en: "Estimated total" })}
                    </span>
                    <span className="text-lg font-bold">¥{total.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    {translate({ zh: "版型：", en: "Style:" })} {displaySelections?.style ?? "—"} • {translate({ zh: "颜色：", en: "Color:" })} {displaySelections?.color ?? "—"} • {translate({ zh: "尺码：", en: "Size:" })} {displaySelections?.size ?? "—"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="bg-transparent" onClick={toggleFavorite}>
                    {isFavorited
                      ? translate({ zh: "已收藏", en: "Favorited" })
                      : translate({ zh: "收藏", en: "Favorite" })}
                  </Button>
                  <Button variant="outline" className="bg-transparent" onClick={handleCustomizeSame}>
                    {translate({ zh: "同款定制", en: "Customize" })}
                  </Button>
                </div>

                <Button onClick={handleBuy} disabled={isPlacingOrder} className="w-full">
                  {isPlacingOrder
                    ? translate({ zh: "下单中...", en: "Placing order..." })
                    : translate({ zh: "购买", en: "Buy" })}
                </Button>

                <p className="text-xs text-muted-foreground">
                  {translate({ zh: "提示：购买需要登录，订单会出现在个人页", en: "Note: Login required. Order will appear in your profile." })}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
