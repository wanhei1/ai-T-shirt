"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/language-context";
import apiClient from "@/lib/api-client";
import type { MarketplaceProduct } from "@/lib/marketplace-types";
import { ProductImageTile } from "@/components/shop/product-image-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type ShopCategory = "all" | "realistic" | "cartoon" | "abstract" | "anime" | "minimalist" | "vintage";
type ShopSort = "new" | "sales";

const categoryLabels: Record<Exclude<ShopCategory, "all">, { zh: string; en: string }> = {
  realistic: { zh: "写实", en: "Realistic" },
  cartoon: { zh: "卡通", en: "Cartoon" },
  abstract: { zh: "抽象", en: "Abstract" },
  anime: { zh: "漫画", en: "Anime" },
  minimalist: { zh: "简约", en: "Minimalist" },
  vintage: { zh: "复古", en: "Vintage" },
};

type GalleryDesign = {
  order_id: number | string;
  created_at: string;
  username: string;
  category?: string | null;
  sales_count?: number;
  selections?: Record<string, any>;
};

function legacyDesignToProduct(item: GalleryDesign): MarketplaceProduct {
  const style = item.selections?.style ? String(item.selections.style) : "原创 T 恤";
  const color = item.selections?.color ? String(item.selections.color) : "中国风";
  const price = Number(item.selections?.price ?? 99);
  return {
    id: Number(item.order_id) || 0,
    all_design_id: Number(item.order_id) || 0,
    title: `${style} · ${color}`,
    price: Number.isFinite(price) && price > 0 ? price : 99,
    category: item.category || null,
    hero_image_url: apiClient.getGalleryThumbnailUrl(item.order_id),
    store_slug: "community-gallery",
    store_name: item.username || "YITUAI 用户",
    sales_count: item.sales_count || 0,
  };
}

export default function ShopPage() {
  const { translate } = useLanguage();
  const [products, setProducts] = useState<MarketplaceProduct[] | null>(null);
  const [legacyDesigns, setLegacyDesigns] = useState<GalleryDesign[] | null>(null);
  const [category, setCategory] = useState<ShopCategory>("all");
  const [sort, setSort] = useState<ShopSort>("sales");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const normalizedSearch = useMemo(() => search.trim(), [search]);
  const normalizedAppliedSearch = useMemo(() => appliedSearch.trim(), [appliedSearch]);
  const hasSearch = normalizedAppliedSearch.length > 0;

  useEffect(() => {
    if (normalizedSearch === normalizedAppliedSearch) return;
    const timer = window.setTimeout(() => {
      setAppliedSearch(normalizedSearch);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [normalizedSearch, normalizedAppliedSearch]);

  useEffect(() => {
    let isMounted = true;
    setProducts(null);
    setLegacyDesigns(null);

    const load = async () => {
      try {
        const response = await apiClient.getMarketplaceProducts({
          limit: 60,
          offset: 0,
          category: category === "all" ? undefined : category,
          sort,
          search: normalizedAppliedSearch || undefined,
        });
        const nextProducts = response.products || [];
        if (!isMounted) return;
        setProducts(nextProducts);

        if (nextProducts.length === 0) {
          const legacy = await apiClient.getGallery({
            limit: 60,
            offset: 0,
            category: category === "all" ? undefined : category,
            sort,
            search: normalizedAppliedSearch || undefined,
          });
          if (isMounted) setLegacyDesigns((legacy.designs || []) as GalleryDesign[]);
        }
      } catch (error) {
        console.warn("Failed to load marketplace products", error);
        if (isMounted) {
          setProducts([]);
          setLegacyDesigns([]);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [category, sort, refreshNonce, normalizedAppliedSearch]);

  const visibleProducts = products && products.length > 0
    ? products
    : (legacyDesigns || []).map(legacyDesignToProduct);
  const isLoading = products === null || (products.length === 0 && legacyDesigns === null);

  return (
    <div className="min-h-screen bg-[#f4ecdc] text-[#15120e]">
      <section
        className="relative min-h-[520px] overflow-hidden bg-[#15120e] bg-cover bg-center px-4 py-20 text-[#f4ecdc] md:px-8"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(21,18,14,.9), rgba(21,18,14,.38) 48%, rgba(21,18,14,.12)), url(/page-heroes/hero-shop-guochao-wall.png)",
        }}
      >
        <div className="mx-auto grid max-w-[1500px] gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
          <div>
            <span className="inline-grid h-16 w-16 rotate-[-8deg] place-items-center rounded-[28%_18%_26%_20%] bg-[#b73522] font-serif text-2xl font-black text-[#f4ecdc]">
              店
            </span>
            <p className="mt-8 text-xs font-black uppercase tracking-[0.26em] text-[#d7a64b]">Marketplace</p>
            <h1 className="mt-4 font-serif text-[clamp(4.2rem,9vw,10rem)] font-black leading-none">
              {translate({ zh: "中国文化衣橱", en: "China-inspired wardrobe" })}
            </h1>
          </div>
          <div className="max-w-xl">
            <p className="text-lg leading-8 text-[#f4ecdc]/78">
              {translate({
                zh: "逛设计师个人店铺、看大图商品、找到能真正穿上身的国潮 T 恤。作品市场会自动兼容旧的公开设计，后续逐步升级成店铺商品。",
                en: "Browse creator stores, image-led products, and wearable China-inspired tees.",
              })}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="bg-[#f4ecdc] text-[#15120e] hover:bg-white">
                <Link href="/design">{translate({ zh: "开始设计", en: "Create" })}</Link>
              </Button>
              <Button asChild variant="outline" className="border-[#f4ecdc] bg-transparent text-[#f4ecdc] hover:bg-[#f4ecdc] hover:text-[#15120e]">
                <Link href="/profile/store">{translate({ zh: "开个人店铺", en: "Open Store" })}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1500px] px-4 py-10 md:px-8 md:py-14">
        <div className="mb-8 border border-[#15120e]/12 bg-[#eadcc2]/70 p-4 shadow-[0_18px_50px_rgba(21,18,14,0.08)]">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b73522]">Browse</p>
              <p className="mt-1 text-sm text-[#15120e]/65">
                {translate({ zh: "按销量、最新、分类和关键词筛选商品与设计师作品", en: "Filter by sales, newest, category, and keyword" })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={sort === "sales" ? "default" : "outline"} className={sort === "sales" ? "" : "bg-transparent"} onClick={() => setSort("sales")}>
                {translate({ zh: "销量排行", en: "Best sellers" })}
              </Button>
              <Button variant={sort === "new" ? "default" : "outline"} className={sort === "new" ? "" : "bg-transparent"} onClick={() => setSort("new")}>
                {translate({ zh: "最新", en: "Newest" })}
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full max-w-xl items-center gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setAppliedSearch(normalizedSearch);
                }}
                placeholder={translate({ zh: "搜索商品、店铺、作者、提示词", en: "Search products, stores, creators, prompts" })}
                className="bg-[#f4ecdc]/80"
              />
              <Button variant="outline" className="bg-transparent" onClick={() => setAppliedSearch(normalizedSearch)}>
                {translate({ zh: "搜索", en: "Search" })}
              </Button>
              {(search.length > 0 || hasSearch) && (
                <Button variant="ghost" onClick={() => { setSearch(""); setAppliedSearch(""); }}>
                  {translate({ zh: "清除", en: "Clear" })}
                </Button>
              )}
            </div>
            <Button variant="outline" className="bg-transparent" onClick={() => setRefreshNonce((n) => n + 1)}>
              {translate({ zh: "刷新", en: "Refresh" })}
            </Button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button variant={category === "all" ? "default" : "outline"} className={category === "all" ? "" : "bg-transparent"} onClick={() => setCategory("all")}>
            {translate({ zh: "全部", en: "All" })}
          </Button>
          {(Object.keys(categoryLabels) as Array<Exclude<ShopCategory, "all">>).map((key) => (
            <Button key={key} variant={category === key ? "default" : "outline"} className={category === key ? "" : "bg-transparent"} onClick={() => setCategory(key)}>
              {translate(categoryLabels[key])}
            </Button>
          ))}
        </div>

        <div className="mb-8 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{translate({ zh: "排序", en: "Sort" })}: {sort === "sales" ? translate({ zh: "销量", en: "Sales" }) : translate({ zh: "最新", en: "Newest" })}</Badge>
          {category !== "all" && <Badge variant="outline">{translate({ zh: "分类", en: "Category" })}: {translate(categoryLabels[category])}</Badge>}
          {hasSearch && <Badge variant="outline">{translate({ zh: "搜索", en: "Search" })}: {normalizedAppliedSearch}</Badge>}
          <div className="ml-auto text-sm text-[#15120e]/58">{translate({ zh: "结果", en: "Results" })}: {isLoading ? "..." : visibleProducts.length}</div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {translate({ zh: "加载中...", en: "Loading..." })}
            </CardContent>
          </Card>
        ) : visibleProducts.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {hasSearch ? translate({ zh: "未找到匹配结果", en: "No matching results" }) : translate({ zh: "暂无商品", en: "No products yet" })}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map((product) => (
              <ProductImageTile
                key={`${product.store_slug}-${product.id}`}
                product={product}
                href={product.store_slug === "community-gallery" ? `/shop/${product.id}` : undefined}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
