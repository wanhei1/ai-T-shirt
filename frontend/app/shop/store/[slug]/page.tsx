"use client";

import { use, useEffect, useState } from "react";
import apiClient from "@/lib/api-client";
import type { MarketplaceProduct, MarketplaceStore } from "@/lib/marketplace-types";
import { ProductImageTile } from "@/components/shop/product-image-tile";
import { Card, CardContent } from "@/components/ui/card";

export default function PublicStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [store, setStore] = useState<MarketplaceStore | null>(null);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">("loading");

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const [storeResponse, productResponse] = await Promise.all([
          apiClient.getPublicStore(slug),
          apiClient.getPublicStoreProducts(slug, { limit: 80, offset: 0 }),
        ]);
        if (!isMounted) return;
        setStore(storeResponse.store);
        setProducts(productResponse.products || []);
        setLoadState("ready");
      } catch {
        if (isMounted) setLoadState("not-found");
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  if (loadState === "loading") return <div className="yituai-page-shell py-20">加载中...</div>;
  if (loadState !== "ready" || !store) {
    return (
      <div className="yituai-page-shell py-20">
        <Card><CardContent className="py-10 text-center text-muted-foreground">未找到该店铺</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4ecdc] text-[#15120e]">
      <section
        className="relative min-h-[430px] bg-[#15120e] bg-cover bg-center px-4 py-20 text-[#f4ecdc] md:px-8"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(21,18,14,.84), rgba(21,18,14,.24)), url(${store.banner_url || "/page-heroes/hero-profile-wardrobe-gallery.png"})`,
        }}
      >
        <div className="mx-auto max-w-[1500px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7a64b]">YITUAI STORE</p>
          <h1 className="mt-4 font-serif text-[clamp(4rem,9vw,9rem)] font-black leading-none">{store.display_name}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#f4ecdc]/78">{store.bio || "中国文化原创服装店铺"}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-[#f4ecdc]/72">
            <span className="border border-[#f4ecdc]/22 px-3 py-1">{Number(store.product_count || products.length)} 件商品</span>
            {(store.tags || []).map((tag) => (
              <span key={tag} className="border border-[#f4ecdc]/22 px-3 py-1">{tag}</span>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1500px] px-4 py-12 md:px-8">
        {products.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">这个店铺暂时还没有上架商品</CardContent></Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => <ProductImageTile key={product.id} product={product} />)}
          </div>
        )}
      </main>
    </div>
  );
}
