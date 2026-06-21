"use client";

import Link from "next/link";
import type { MarketplaceProduct } from "@/lib/marketplace-types";

type ProductImageTileProps = {
  product: MarketplaceProduct;
  href?: string;
};

export function ProductImageTile({ product, href }: ProductImageTileProps) {
  const image = product.hero_image_url || product.canvas_front || "/page-heroes/hero-product-detail-fabric.png";
  const price = Number(product.price || 0);

  return (
    <Link
      href={href || `/shop/product/${product.id}`}
      className="group block overflow-hidden border border-[#15120e]/12 bg-[#eadcc2] shadow-[0_18px_50px_rgba(21,18,14,0.12)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(21,18,14,0.18)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[#e6d4b8]">
        <img
          src={image}
          alt={product.title}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 rounded-full bg-[#f4ecdc]/92 px-3 py-1 text-xs font-black text-[#15120e] shadow">
          ¥{price.toFixed(2)}
        </div>
        {Number(product.sales_count || 0) > 0 && (
          <div className="absolute bottom-3 right-3 rounded-full bg-[#15120e]/86 px-3 py-1 text-xs font-bold text-[#f4ecdc]">
            {Number(product.sales_count || 0)} 人买过
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <p className="line-clamp-2 font-serif text-2xl font-black leading-tight text-[#15120e]">{product.title}</p>
        <div className="flex items-center justify-between gap-3 text-sm text-[#15120e]/68">
          <span className="truncate">{product.store_name || "YITUAI 设计师"}</span>
          <span className="shrink-0">{product.category || "国潮"}</span>
        </div>
      </div>
    </Link>
  );
}
