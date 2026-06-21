"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/language-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Heart,
  Edit3,
  ShoppingCart,
  Copy,
  Trash2,
  MoreVertical,
  Bot,
  Shirt,
  Pencil,
  FileCopy,
  Clock,
} from "lucide-react";

export type UserDesign = {
  id: number;
  title: string | null;
  category: string | null;
  thumbnail_front: string | null;
  thumbnail_back: string | null;
  source_type: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

interface DesignCardProps {
  design: UserDesign;
  onEdit?: (design: UserDesign) => void;
  onOrder?: (design: UserDesign) => void;
  onToggleFavorite?: (id: number) => void;
  onDelete?: (id: number) => void;
  onDuplicate?: (id: number) => void;
}

const SOURCE_META: Record<string, { icon: string; label: { zh: string; en: string } }> = {
  ai_generate: { icon: "🤖", label: { zh: "AI生成", en: "AI" } },
  tryon: { icon: "👗", label: { zh: "试衣", en: "Try-on" } },
  editor: { icon: "✏️", label: { zh: "手动", en: "Manual" } },
  gallery_copy: { icon: "📋", label: { zh: "复制", en: "Copy" } },
  order_reuse: { icon: "🔄", label: { zh: "复用", en: "Reuse" } },
};

function getThumbnailUrl(thumb: string | null): string {
  if (!thumb) return "";
  if (thumb.startsWith("/assets/")) {
    return `/backend${thumb}`;
  }
  return thumb;
}

function formatRelativeTime(dateStr: string, translate: Function): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return translate({ zh: "刚刚", en: "Just now" });
  if (mins < 60) return translate({ zh: `${mins}分钟前`, en: `${mins}m ago` });
  if (hours < 24) return translate({ zh: `${hours}小时前`, en: `${hours}h ago` });
  if (days < 30) return translate({ zh: `${days}天前`, en: `${days}d ago` });

  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function DesignCard({
  design,
  onEdit,
  onOrder,
  onToggleFavorite,
  onDelete,
  onDuplicate,
}: DesignCardProps) {
  const { translate } = useLanguage();
  const [imgError, setImgError] = useState(false);

  const src = getThumbnailUrl(design.thumbnail_front);
  const source = SOURCE_META[design.source_type] || SOURCE_META.editor;

  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      {/* 缩略图 */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {src && !imgError ? (
          <img
            src={src}
            alt={design.title || "Design"}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Shirt className="h-16 w-16 opacity-30" />
          </div>
        )}

        {/* 来源标签 */}
        <Badge
          variant="secondary"
          className="absolute left-2 top-2 text-xs backdrop-blur-sm bg-background/80"
        >
          {source.icon} {translate(source.label)}
        </Badge>

        {/* 收藏按钮 */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 top-2 h-8 w-8 p-0 backdrop-blur-sm bg-background/60 hover:bg-background/80"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.(design.id);
          }}
        >
          <Heart
            className={`h-4 w-4 ${
              design.is_favorite ? "fill-red-500 text-red-500" : "text-muted-foreground"
            }`}
          />
        </Button>
      </div>

      {/* 信息区 */}
      <CardContent className="p-3 pb-2">
        <h3 className="truncate text-sm font-medium" title={design.title || undefined}>
          {design.title || translate({ zh: "未命名设计", en: "Untitled design" })}
        </h3>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(design.updated_at, translate)}
        </div>
      </CardContent>

      {/* 操作区 */}
      <CardFooter className="gap-1 p-3 pt-0">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onEdit?.(design)}
        >
          <Edit3 className="mr-1 h-3 w-3" />
          {translate({ zh: "编辑", en: "Edit" })}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onOrder?.(design)}
        >
          <ShoppingCart className="mr-1 h-3 w-3" />
          {translate({ zh: "开团", en: "Order" })}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDuplicate?.(design.id)}>
              <Copy className="mr-2 h-4 w-4" />
              {translate({ zh: "复制", en: "Duplicate" })}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete?.(design.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {translate({ zh: "删除", en: "Delete" })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
