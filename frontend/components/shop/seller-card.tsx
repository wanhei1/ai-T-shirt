"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MarketplaceProduct } from "@/lib/marketplace-types";

export function SellerCard({ product }: { product: MarketplaceProduct }) {
  return (
    <div className="border border-[#15120e]/12 bg-[#f4ecdc] p-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-[#d7a64b]">
          {product.store_avatar_url ? (
            <img src={product.store_avatar_url} alt={product.store_name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center font-serif text-xl font-black text-[#15120e]">衣</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-serif text-xl font-black text-[#15120e]">{product.store_name || "YITUAI 店铺"}</p>
          <p className="text-xs uppercase tracking-[0.22em] text-[#b73522]">Creator store</p>
        </div>
      </div>
      {product.store_bio ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#15120e]/65">{product.store_bio}</p> : null}
      <Button asChild className="mt-4 w-full bg-[#15120e] text-[#f4ecdc] hover:bg-[#3b2a1d]">
        <Link href={`/shop/store/${product.store_slug}`}>进入店铺</Link>
      </Button>
    </div>
  );
}
