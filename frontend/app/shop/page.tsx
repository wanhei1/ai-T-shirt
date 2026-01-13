"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/language-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  selections?: Record<string, any>;
  design?: {
    elements?: Array<{ type?: string; content?: string }>;
    canvas?: any;
  };
  canvas_front?: string | null;
  canvas_back?: string | null;
  canvas_meta?: any;
};

export default function ShopPage() {
  const { translate } = useLanguage();
  const [designs, setDesigns] = useState<GalleryDesign[] | null>(null);
  const [category, setCategory] = useState<ShopCategory>("all");

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const { apiClient } = await import("@/lib/api-client");
        const response = await apiClient.getGallery({
          limit: 60,
          offset: 0,
          category: category === "all" ? undefined : category,
        });
        if (isMounted) setDesigns((response.designs || []) as GalleryDesign[]);
      } catch (error) {
        console.warn("Failed to load shop designs", error);
        if (isMounted) setDesigns([]);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [category]);

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

        <div className="mb-6 flex flex-wrap gap-2">
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
              {translate({ zh: "暂无作品", en: "No designs yet" })}
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
