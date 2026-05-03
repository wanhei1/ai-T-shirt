"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/language-context";
import apiClient from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getCached, invalidateCached, setCachedForever } from "@/lib/client-cache";

type ShopCategory = "all" | "realistic" | "cartoon" | "abstract" | "anime" | "minimalist" | "vintage";

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
  design?: {
    elements?: Array<{ type?: string; content?: string }>;
    canvas?: any;
  };
  canvas_front?: string | null;
  canvas_back?: string | null;
  canvas_meta?: any;
};

type ShopSort = "new" | "sales";

export default function ShopPage() {
  const { translate } = useLanguage();
  const [designs, setDesigns] = useState<GalleryDesign[] | null>(null);
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
    }, 500);
    return () => window.clearTimeout(timer);
  }, [normalizedSearch, normalizedAppliedSearch]);

  useEffect(() => {
    let isMounted = true;

    const cacheKey = `shop:gallery:v2:${category}:${sort}:${normalizedAppliedSearch}`;
    const cached = getCached<GalleryDesign[]>(cacheKey);
    if (cached) {
      setDesigns(cached);
    } else {
      setDesigns(null);
    }

    const load = async () => {
      try {
        const response = await apiClient.getGallery({
          limit: 60,
          offset: 0,
          category: category === "all" ? undefined : category,
          sort,
          search: normalizedAppliedSearch ? normalizedAppliedSearch : undefined,
        });
        const next = (response.designs || []) as GalleryDesign[];
        setCachedForever(cacheKey, next);
        if (isMounted) setDesigns(next);
      } catch (error) {
        console.warn("Failed to load shop designs", error);
        // If we already showed cached data, keep it.
        if (isMounted && !cached) setDesigns([]);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [category, sort, refreshNonce, normalizedAppliedSearch]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {translate({ zh: "店铺", en: "Shop" })}
            </h1>
            <p className="text-muted-foreground">
              {translate({ zh: "浏览大家的作品", en: "Browse community designs" })}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild className="bg-transparent">
              <Link href="/">{translate({ zh: "返回首页", en: "Back" })}</Link>
            </Button>
            <Button asChild>
              <Link href="/design">{translate({ zh: "开始设计", en: "Create" })}</Link>
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant={sort === "sales" ? "default" : "outline"}
            className={sort === "sales" ? "" : "bg-transparent"}
            onClick={() => setSort("sales")}
          >
            {translate({ zh: "销量排行", en: "Best sellers" })}
          </Button>
          <Button
            variant={sort === "new" ? "default" : "outline"}
            className={sort === "new" ? "" : "bg-transparent"}
            onClick={() => setSort("new")}
          >
            {translate({ zh: "最新", en: "Newest" })}
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex w-full max-w-md items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedSearch(normalizedSearch);
                }
              }}
              placeholder={translate({ zh: "搜索作品/作者/提示词", en: "Search designs, creators, prompts" })}
            />
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => setAppliedSearch(normalizedSearch)}
            >
              {translate({ zh: "搜索", en: "Search" })}
            </Button>
            {(search.length > 0 || hasSearch) && (
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setSearch("");
                  setAppliedSearch("");
                }}
              >
                {translate({ zh: "清除", en: "Clear" })}
              </Button>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {translate({ zh: "排序", en: "Sort" })}: {sort === "sales" ? translate({ zh: "销量", en: "Sales" }) : translate({ zh: "最新", en: "Newest" })}
          </Badge>
          {category !== "all" && (
            <Badge variant="outline">
              {translate({ zh: "分类", en: "Category" })}: {translate(categoryLabels[category])}
            </Badge>
          )}
          {hasSearch && (
            <Badge variant="outline">
              {translate({ zh: "搜索", en: "Search" })}: {normalizedAppliedSearch}
            </Badge>
          )}
          <div className="ml-auto text-sm text-muted-foreground">
            {translate({ zh: "结果", en: "Results" })}: {designs ? designs.length : "—"}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button
            variant={category === "all" ? "default" : "outline"}
            className={category === "all" ? "" : "bg-transparent"}
            onClick={() => setCategory("all")}
          >
            {translate({ zh: "全部", en: "All" })}
          </Button>
          {(Object.keys(categoryLabels) as Array<Exclude<ShopCategory, "all">>).map((key) => (
            <Button
              key={key}
              variant={category === key ? "default" : "outline"}
              className={category === key ? "" : "bg-transparent"}
              onClick={() => setCategory(key)}
            >
              {translate(categoryLabels[key])}
            </Button>
          ))}

          <div className="ml-auto" />
          <Button
            variant="outline"
            className="bg-transparent"
            onClick={() => {
              const cacheKey = `shop:gallery:v2:${category}:${sort}:${normalizedAppliedSearch}`;
              invalidateCached(cacheKey);
              setDesigns(null);
              setRefreshNonce((n) => n + 1);
            }}
          >
            {translate({ zh: "刷新", en: "Refresh" })}
          </Button>
        </div>

        {designs === null ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {translate({ zh: "加载中...", en: "Loading..." })}
            </CardContent>
          </Card>
        ) : designs.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {hasSearch
                ? translate({ zh: "未找到匹配结果", en: "No matching results" })
                : translate({ zh: "暂无作品", en: "No designs yet" })}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {designs.map((item) => {
              const elements = item.design?.elements || [];
              const firstImage = elements.find(
                (el) => el.type === "image" || el.type === "ai-generated"
              );
              const thumbnailSrc =
                item.canvas_front ||
                item.design?.canvas?.snapshots?.front ||
                firstImage?.content ||
                null;

              return (
                <Card key={String(item.order_id)} className="cursor-pointer hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {translate({ zh: "来自", en: "By" })} {item.username || "—"}
                    </CardTitle>
                    <CardDescription>
                      {new Date(item.created_at).toLocaleString(
                        translate({ zh: "zh-CN", en: "en-US" })
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {typeof item.sales_count === "number" && (
                      <div className="text-xs text-muted-foreground">
                        {translate({ zh: "销量：", en: "Sales: " })}{item.sales_count}
                      </div>
                    )}
                    {thumbnailSrc ? (
                      <img
                        src={thumbnailSrc}
                        alt={`shop-${item.order_id}`}
                        className="h-48 w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-48 w-full rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground">
                        {translate({ zh: "无预览图", en: "No preview" })}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {translate({ zh: "版型：", en: "Style:" })} {item.selections?.style ?? "—"} • {translate({ zh: "颜色：", en: "Color:" })} {item.selections?.color ?? "—"} • {translate({ zh: "尺码：", en: "Size:" })} {item.selections?.size ?? "—"}
                    </div>

                    <Button asChild className="w-full">
                      <Link href={`/shop/${String(item.order_id)}`}>
                        {translate({ zh: "查看详情", en: "View Details" })}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
