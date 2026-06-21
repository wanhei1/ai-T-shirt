"use client";

import { Button } from "@/components/ui/button";
import type { MarketplaceProduct } from "@/lib/marketplace-types";

export function ProductBuyPanel({
  product,
  onAddToCart,
  onBuy,
  onCustomize,
  isAddingToCart,
  isBuying,
}: {
  product: MarketplaceProduct;
  onAddToCart: () => void;
  onBuy: () => void;
  onCustomize: () => void;
  isAddingToCart: boolean;
  isBuying: boolean;
}) {
  const price = Number(product.price || 0);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;

  return (
    <aside className="sticky top-24 space-y-5 border border-[#15120e]/12 bg-[#f4ecdc]/94 p-5 backdrop-blur">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b73522]">Product</p>
        <h1 className="mt-3 font-serif text-[clamp(2.2rem,4vw,4.8rem)] font-black leading-none text-[#15120e]">
          {product.title}
        </h1>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <span className="font-serif text-5xl font-black text-[#b73522]">¥{price.toFixed(2)}</span>
        {compareAt && compareAt > price ? <span className="pb-2 text-lg text-[#15120e]/45 line-through">¥{compareAt.toFixed(2)}</span> : null}
      </div>
      <p className="text-sm leading-7 text-[#15120e]/66">
        {product.description || "AI 原创图案，可直接下单，也可以基于同款继续定制。"}
      </p>
      <div className="grid grid-cols-2 gap-3 text-sm text-[#15120e]/70">
        <div className="border border-[#15120e]/10 p-3">销量 {Number(product.sales_count || 0)}</div>
        <div className="border border-[#15120e]/10 p-3">{product.category || "国潮服饰"}</div>
      </div>
      <div className="grid gap-3">
        <Button onClick={onBuy} disabled={isBuying} className="h-12 bg-[#b73522] text-white hover:bg-[#922d1f]">
          {isBuying ? "下单中..." : "立即购买"}
        </Button>
        <Button onClick={onAddToCart} disabled={isAddingToCart} variant="outline" className="h-12 bg-transparent">
          {isAddingToCart ? "加入中..." : "加入购物车"}
        </Button>
        <Button onClick={onCustomize} variant="ghost" className="h-12">
          同款定制
        </Button>
      </div>
    </aside>
  );
}
