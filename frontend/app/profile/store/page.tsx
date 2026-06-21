"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import apiClient from "@/lib/api-client";
import type { MarketplaceProduct, MarketplaceStore } from "@/lib/marketplace-types";
import { ProductImageTile } from "@/components/shop/product-image-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function SellerStorePage() {
  const [store, setStore] = useState<MarketplaceStore | null>(null);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [allDesignId, setAllDesignId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productPrice, setProductPrice] = useState("99");
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const load = async () => {
    try {
      const [storeResponse, productsResponse] = await Promise.all([
        apiClient.getSellerStore(),
        apiClient.getSellerProducts(),
      ]);
      const next = storeResponse.store;
      setStore(next);
      setSlug(next?.slug || "");
      setDisplayName(next?.display_name || "");
      setBio(next?.bio || "");
      setProducts(productsResponse.products || []);
    } catch (error) {
      console.warn("Failed to load seller store", error);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveStore = async () => {
    setIsSavingStore(true);
    try {
      const response = await apiClient.upsertSellerStore({
        slug,
        displayName,
        bio,
        bannerUrl: "/page-heroes/hero-profile-wardrobe-gallery.png",
        tags: ["中国文化", "AI设计"],
      });
      setStore(response.store);
      alert("店铺已保存");
    } finally {
      setIsSavingStore(false);
    }
  };

  const publishProduct = async () => {
    const parsedDesignId = Number(allDesignId);
    const parsedPrice = Number(productPrice);
    if (!Number.isInteger(parsedDesignId) || parsedDesignId <= 0) {
      alert("请填写有效的 allDesignId");
      return;
    }
    if (!productTitle.trim()) {
      alert("请填写商品标题");
      return;
    }
    setIsPublishing(true);
    try {
      await apiClient.createSellerProduct({
        allDesignId: parsedDesignId,
        title: productTitle.trim(),
        description: "YITUAI AI 原创服装图案，可直接购买，也可基于同款继续定制。",
        price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 99,
        tags: ["山海经", "国潮", "原创T恤"],
        status: "active",
      });
      setAllDesignId("");
      setProductTitle("");
      await load();
      alert("商品已上架");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4ecdc] text-[#15120e]">
      <section
        className="bg-[#15120e] bg-cover bg-center px-4 py-16 text-[#f4ecdc] md:px-8"
        style={{ backgroundImage: "linear-gradient(90deg, rgba(21,18,14,.88), rgba(21,18,14,.35)), url(/page-heroes/hero-profile-wardrobe-gallery.png)" }}
      >
        <div className="mx-auto max-w-[1500px]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7a64b]">Seller Center</p>
          <h1 className="mt-4 font-serif text-[clamp(4rem,9vw,8rem)] font-black leading-none">我的店铺</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#f4ecdc]/76">开通个人店铺，把你的 AI 服装设计变成可浏览、可购买的商品。</p>
        </div>
      </section>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-4 py-10 md:px-8 lg:grid-cols-[430px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{store ? "编辑店铺" : "开通个人店铺"}</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="店铺链接，例如 shanhai-atelier" />
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="店铺名称" />
              <Textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="店铺简介" className="min-h-[120px]" />
              <Button onClick={saveStore} disabled={isSavingStore}>{isSavingStore ? "保存中..." : "保存店铺"}</Button>
              {store ? <Button asChild variant="outline" className="bg-transparent"><Link href={`/shop/store/${store.slug}`}>查看店铺</Link></Button> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>上架商品</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Input value={allDesignId} onChange={(event) => setAllDesignId(event.target.value)} placeholder="allDesignId / 公开作品 ID" />
              <Input value={productTitle} onChange={(event) => setProductTitle(event.target.value)} placeholder="商品标题" />
              <Input value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="价格" inputMode="decimal" />
              <Button onClick={publishProduct} disabled={isPublishing || !store}>{isPublishing ? "上架中..." : "上架到店铺"}</Button>
              {!store ? <p className="text-sm text-muted-foreground">请先保存店铺，再上架商品。</p> : null}
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b73522]">Products</p>
              <h2 className="mt-2 font-serif text-4xl font-black">已上架商品</h2>
            </div>
            <Button variant="outline" className="bg-transparent" onClick={load}>刷新</Button>
          </div>
          {products.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">还没有商品。可以从公开作品 ID 开始上架第一件。</CardContent></Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => <ProductImageTile key={product.id} product={product} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
