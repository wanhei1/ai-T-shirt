"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import apiClient, { type ApiClientError } from "@/lib/api-client";
import type { MarketplaceProduct } from "@/lib/marketplace-types";
import { ProductGallery } from "@/components/shop/product-gallery";
import { ProductBuyPanel } from "@/components/shop/product-buy-panel";
import { SellerCard } from "@/components/shop/seller-card";
import { ProductImageTile } from "@/components/shop/product-image-tile";
import { Card, CardContent } from "@/components/ui/card";

export default function MarketplaceProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const router = useRouter();
  const { productId } = use(params);
  const [product, setProduct] = useState<MarketplaceProduct | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const response = await apiClient.getMarketplaceProduct(productId);
        if (!isMounted) return;
        setProduct(response.product);
        setLoadState("ready");
      } catch (error) {
        const err = error as ApiClientError;
        if (!isMounted) return;
        setLoadState(err?.status === 404 ? "not-found" : "error");
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [productId]);

  const selections = useMemo(() => product?.selections || {}, [product]);

  const ensureLogin = () => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("authToken") || localStorage.getItem("token")
        : null;
    if (!token) {
      router.push("/auth");
      return false;
    }
    return true;
  };

  const customizeSame = () => {
    if (!product?.design) return;
    window.localStorage.setItem("designData", JSON.stringify(product.design));
    router.push("/design/editor");
  };

  const addToCart = async (goToCart = true) => {
    if (!product || !ensureLogin()) return;
    setIsAddingToCart(true);
    try {
      await apiClient.addCartItem({
        items: product.design?.elements || [],
        selections,
        design: product.design,
        quantity: 1,
        price: Number(product.price || 0),
        category: product.category || null,
        canvas: {
          frontSnapshot: product.canvas_front,
          backSnapshot: product.canvas_back,
          meta: product.canvas_meta,
        },
        publishToAll: false,
        sourceAllId: product.all_design_id,
      });
      if (goToCart) router.push("/cart");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const buyNow = async () => {
    setIsBuying(true);
    try {
      await addToCart(false);
      router.push("/cart");
    } finally {
      setIsBuying(false);
    }
  };

  if (loadState === "loading") {
    return <div className="yituai-page-shell py-20 text-[#15120e]">加载中...</div>;
  }

  if (loadState === "not-found" || !product) {
    return (
      <div className="yituai-page-shell py-20">
        <Card><CardContent className="py-10 text-center text-muted-foreground">未找到该商品</CardContent></Card>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="yituai-page-shell py-20">
        <Card><CardContent className="py-10 text-center text-muted-foreground">加载失败，请稍后重试</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4ecdc] text-[#15120e]">
      <main className="mx-auto grid max-w-[1600px] gap-8 px-4 py-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section>
          <ProductGallery product={product} />

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b73522]">Details</p>
              <h2 className="mt-3 font-serif text-5xl font-black">商品细节</h2>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-[#15120e]/68">
                {product.description || "这件 T 恤来自 YITUAI 用户原创设计，可直接购买，也可以基于同款继续生成、编辑和试穿。"}
              </p>
              <div className="mt-6 grid gap-3 text-sm text-[#15120e]/65 sm:grid-cols-3">
                <div className="border border-[#15120e]/10 p-4">版型 {String(selections?.style || "常规")}</div>
                <div className="border border-[#15120e]/10 p-4">颜色 {String(selections?.color || "可选")}</div>
                <div className="border border-[#15120e]/10 p-4">尺码 {String(selections?.size || "下单选择")}</div>
              </div>
            </div>
            <SellerCard product={product} />
          </div>

          {product.related_products && product.related_products.length > 0 ? (
            <section className="mt-14">
              <h2 className="font-serif text-4xl font-black">店内其他商品</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {product.related_products.map((item) => (
                  <ProductImageTile
                    key={item.id}
                    product={{
                      id: item.id,
                      all_design_id: item.all_design_id || product.all_design_id,
                      title: item.title,
                      price: item.price,
                      hero_image_url: item.hero_image_url || item.canvas_front,
                      store_slug: item.store_slug,
                      store_name: item.store_name || product.store_name,
                    }}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <ProductBuyPanel
          product={product}
          onAddToCart={() => addToCart(true)}
          onBuy={buyNow}
          onCustomize={customizeSame}
          isAddingToCart={isAddingToCart}
          isBuying={isBuying}
        />
      </main>
    </div>
  );
}
