"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/language-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Palette, RefreshCw } from "lucide-react";
import { DesignCard, type UserDesign } from "./design-card";

interface MyDesignsProps {
  /** Called when user clicks "编辑" on a design */
  onEdit?: (design: UserDesign) => void;
  /** Called when user clicks "开团" on a design */
  onOrder?: (design: UserDesign) => void;
}

const SOURCE_FILTERS = [
  { value: "all", label: { zh: "全部", en: "All" } },
  { value: "ai_generate", label: { zh: "🤖 AI生成", en: "🤖 AI" } },
  { value: "tryon", label: { zh: "👗 试衣", en: "👗 Try-on" } },
  { value: "editor", label: { zh: "✏️ 手动设计", en: "✏️ Manual" } },
  { value: "gallery_copy", label: { zh: "📋 商城复制", en: "📋 Gallery" } },
];

export function MyDesigns({ onEdit, onOrder }: MyDesignsProps) {
  const { translate } = useLanguage();
  const [designs, setDesigns] = useState<UserDesign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showFavorites, setShowFavorites] = useState(false);
  const limit = 20;

  const fetchDesigns = useCallback(
    async (pageNum: number) => {
      try {
        setLoading(true);
        const { apiClient } = await import("@/lib/api-client");
        const params: any = { page: pageNum, limit };
        if (sourceFilter !== "all") params.sourceType = sourceFilter;
        if (showFavorites) params.favorite = true;
        const res = await apiClient.getUserDesigns(params);
        setDesigns(res.designs || []);
        setTotal(res.total || 0);
        setPage(pageNum);
      } catch (err) {
        console.warn("Failed to fetch user designs:", err);
        setDesigns([]);
      } finally {
        setLoading(false);
      }
    },
    [sourceFilter, showFavorites]
  );

  useEffect(() => {
    fetchDesigns(1);
  }, [fetchDesigns]);

  const handleToggleFavorite = async (id: number) => {
    try {
      const { apiClient } = await import("@/lib/api-client");
      const res = await apiClient.toggleFavoriteUserDesign(id);
      setDesigns((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_favorite: res.isFavorite } : d))
      );
    } catch (err) {
      console.warn("Toggle favorite failed:", err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(translate({ zh: "确定删除这个作品吗？", en: "Delete this design?" }))) return;
    try {
      const { apiClient } = await import("@/lib/api-client");
      await apiClient.deleteUserDesign(id);
      setDesigns((prev) => prev.filter((d) => d.id !== id));
      setTotal((prev) => prev - 1);
    } catch (err) {
      console.warn("Delete failed:", err);
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const { apiClient } = await import("@/lib/api-client");
      const res = await apiClient.duplicateUserDesign(id);
      fetchDesigns(1);
    } catch (err) {
      console.warn("Duplicate failed:", err);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {translate(f.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showFavorites ? "default" : "outline"}
          size="sm"
          onClick={() => setShowFavorites(!showFavorites)}
        >
          ❤️ {translate({ zh: "收藏", en: "Favorites" })}
        </Button>

        <div className="flex-1" />

        <Badge variant="secondary" className="text-xs">
          {translate({ zh: `${total} 个作品`, en: `${total} designs` })}
        </Badge>

        <Button variant="ghost" size="sm" onClick={() => fetchDesigns(page)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* 作品网格 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : designs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Palette className="h-12 w-12 opacity-40" />
          <p className="text-sm">
            {translate({
              zh: "还没有作品，去设计一件吧！",
              en: "No designs yet — create something!",
            })}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((design) => (
            <DesignCard
              key={design.id}
              design={design}
              onEdit={onEdit}
              onOrder={onOrder}
              onToggleFavorite={handleToggleFavorite}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => fetchDesigns(page - 1)}
          >
            {translate({ zh: "上一页", en: "Prev" })}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => fetchDesigns(page + 1)}
          >
            {translate({ zh: "下一页", en: "Next" })}
          </Button>
        </div>
      )}
    </div>
  );
}
