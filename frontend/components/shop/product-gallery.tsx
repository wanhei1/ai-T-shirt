"use client";

import { useMemo, useState } from "react";
import type { MarketplaceProduct } from "@/lib/marketplace-types";

export function ProductGallery({ product }: { product: MarketplaceProduct }) {
  const images = useMemo(() => {
    const fromRows = (product.images || []).map((image) => image.image_url).filter(Boolean);
    const fallbacks = [
      product.canvas_front,
      product.canvas_back,
      product.hero_image_url,
      "/page-heroes/hero-product-detail-fabric.png",
    ].filter(Boolean) as string[];
    return Array.from(new Set([...fromRows, ...fallbacks]));
  }, [product]);
  const [active, setActive] = useState(0);
  const src = images[active] || "/page-heroes/hero-product-detail-fabric.png";

  return (
    <div className="grid gap-4 lg:grid-cols-[96px_1fr]">
      <div className="order-2 flex gap-3 overflow-x-auto lg:order-1 lg:block lg:space-y-3 lg:overflow-visible">
        {images.map((image, index) => (
          <button
            key={`${image}-${index}`}
            type="button"
            onClick={() => setActive(index)}
            className={`h-20 w-20 shrink-0 overflow-hidden border bg-[#e6d4b8] ${active === index ? "border-[#b73522]" : "border-[#15120e]/14"}`}
            aria-label={`查看商品图 ${index + 1}`}
          >
            <img src={image} alt={`${product.title}-${index + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <div className="order-1 min-h-[68vh] overflow-hidden border border-[#15120e]/12 bg-[#e6d4b8] lg:order-2">
        <img src={src} alt={product.title} className="h-full min-h-[68vh] w-full object-contain" />
      </div>
    </div>
  );
}
