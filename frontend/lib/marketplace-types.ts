export type MarketplaceStore = {
  id: number;
  owner_user_id?: number;
  slug: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  tags?: string[];
  status?: string;
  username?: string | null;
  product_count?: number;
};

export type MarketplaceProduct = {
  id: number;
  all_design_id: number;
  title: string;
  description?: string | null;
  price: number | string;
  compare_at_price?: number | string | null;
  tags?: string[];
  status?: string;
  category?: string | null;
  selections?: Record<string, any>;
  canvas_front?: string | null;
  canvas_back?: string | null;
  canvas_meta?: any;
  design?: any;
  hero_image_url?: string | null;
  store_slug: string;
  store_name: string;
  store_bio?: string | null;
  store_avatar_url?: string | null;
  store_banner_url?: string | null;
  sales_count?: number;
  images?: Array<{
    id: number;
    image_url: string;
    image_kind: string;
    alt_text?: string | null;
    sort_order: number;
  }>;
  related_products?: Array<{
    id: number;
    all_design_id?: number;
    title: string;
    price: number | string;
    canvas_front?: string | null;
    hero_image_url?: string | null;
    store_slug: string;
    store_name?: string;
  }>;
};
