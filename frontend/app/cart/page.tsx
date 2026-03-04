"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/language-context";
import apiClient from "@/lib/api-client";

type CartItem = {
  id: number;
  quantity: number;
  price: number;
  category?: string | null;
  items?: any[];
  selections?: Record<string, any> | null;
  design?: {
    elements?: Array<{ type?: string; content?: string }>;
    canvas?: any;
  } | null;
  canvas_front?: string | null;
  canvas_back?: string | null;
  canvas_meta?: any;
  source_all_id?: number | null;
  publish_to_all?: boolean;
  created_at?: string;
  updated_at?: string;
};

export default function CartPage() {
  const { translate } = useLanguage();
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const loadCart = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiClient.getCart();
      setItems((response.items || []) as CartItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载购物车失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price) || 0;
      return sum + price * qty;
    }, 0);
  }, [items]);

  const updateQuantity = async (itemId: number, nextQty: number) => {
    try {
      const response = await apiClient.updateCartItem(itemId, { quantity: nextQty });
      const updated = response.item as CartItem;
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新数量失败");
    }
  };

  const removeItem = async (itemId: number) => {
    try {
      await apiClient.removeCartItem(itemId);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除失败");
    }
  };

  const clearCart = async () => {
    try {
      await apiClient.clearCart();
      setItems([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空失败");
    }
  };

  const handleCheckout = async () => {
    if (!address.trim()) {
      setError(translate({ zh: "请填写收货地址", en: "Please provide a shipping address" }));
      return;
    }

    try {
      setIsCheckingOut(true);
      setError(null);
      await apiClient.checkoutCart({ address: address.trim() });
      router.push("/profile");
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = (error as Error)?.message || "";

      if (status === 403 && message.toLowerCase().includes("membership")) {
        alert(translate({ zh: "需要有效会员才能下单", en: "An active membership is required to place orders." }));
        router.push("/membership");
        return;
      }
      if (status === 401 || message.toLowerCase().includes("authenticate")) {
        alert(translate({ zh: "登录已失效，请重新登录", en: "Session expired, please sign in again." }));
        router.push("/auth");
        return;
      }
      if (status === 402 || message.toLowerCase().includes("insufficient")) {
        alert(translate({ zh: "会员余额不足，请充值/续费后再下单", en: "Insufficient membership balance. Please top up/renew to continue." }));
        router.push("/membership");
        return;
      }

      setError(translate({ zh: "结算失败，请稍后再试", en: "Checkout failed. Please try again." }));
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {translate({ zh: "购物车", en: "Cart" })}
              </h1>
              <p className="text-muted-foreground">
                {translate({ zh: "管理你的待购买设计", en: "Review your saved designs" })}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" asChild className="bg-transparent">
                <Link href="/shop">{translate({ zh: "继续逛逛", en: "Continue shopping" })}</Link>
              </Button>
              <Button variant="outline" onClick={clearCart} disabled={items.length === 0} className="bg-transparent">
                {translate({ zh: "清空", en: "Clear" })}
              </Button>
            </div>
          </div>

          {error && (
            <Card className="mb-6 border-destructive/40 bg-destructive/5">
              <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
            </Card>
          )}

          {isLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {translate({ zh: "加载中...", en: "Loading..." })}
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {translate({ zh: "购物车为空", en: "Your cart is empty" })}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
              <div className="space-y-4">
                {items.map((item) => {
                  const elements = item.design?.elements || item.items || [];
                  const firstImage = elements.find(
                    (el: any) => el.type === "image" || el.type === "ai-generated"
                  );
                  const thumbnailSrc =
                    item.canvas_front ||
                    item.design?.canvas?.snapshots?.front ||
                    firstImage?.content ||
                    null;

                  return (
                    <Card key={item.id}>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {translate({ zh: "设计", en: "Design" })} #{item.id}
                        </CardTitle>
                        <CardDescription>
                          {translate({ zh: "版型", en: "Style" })}: {item.selections?.style ?? "—"} · {translate({ zh: "颜色", en: "Color" })}: {item.selections?.color ?? "—"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 md:grid-cols-[160px_1fr]">
                        {thumbnailSrc ? (
                          <img
                            src={thumbnailSrc}
                            alt={`cart-${item.id}`}
                            className="h-40 w-full rounded-md object-cover"
                          />
                        ) : (
                          <div className="h-40 w-full rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">
                            {translate({ zh: "无预览图", en: "No preview" })}
                          </div>
                        )}
                        <div className="space-y-3">
                          <div className="text-sm text-muted-foreground">
                            {translate({ zh: "尺码", en: "Size" })}: {item.selections?.size ?? "—"}
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-transparent"
                              onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            >
                              -
                            </Button>
                            <div className="min-w-[40px] text-center">{item.quantity}</div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-transparent"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            >
                              +
                            </Button>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {translate({ zh: "单价", en: "Price" })}: ¥{Number(item.price || 0).toFixed(2)}
                          </div>
                          <div className="text-sm font-semibold">
                            {translate({ zh: "小计", en: "Subtotal" })}: ¥{(Number(item.price || 0) * Math.max(1, item.quantity)).toFixed(2)}
                          </div>
                          <div>
                            <Button variant="outline" className="bg-transparent" onClick={() => removeItem(item.id)}>
                              {translate({ zh: "移除", en: "Remove" })}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>{translate({ zh: "结算", en: "Summary" })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span>{translate({ zh: "商品金额", en: "Subtotal" })}</span>
                    <span>¥{subtotal.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {translate({ zh: "收货地址", en: "Shipping Address" })}
                    </label>
                    <Input
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder={translate({ zh: "请填写详细收货地址", en: "Enter full shipping address" })}
                    />
                  </div>
                  <Button onClick={handleCheckout} className="w-full" disabled={isCheckingOut}>
                    {isCheckingOut
                      ? translate({ zh: "结算中...", en: "Checking out..." })
                      : translate({ zh: "提交订单", en: "Place Order" })}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
