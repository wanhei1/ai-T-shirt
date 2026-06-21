import { Pool } from "pg";

type CreateProductPayload = {
  allDesignId: number;
  title: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  tags: string[];
  status: "draft" | "active";
  imageUrls: string[];
};

type MarketplaceListParams = {
  limit?: number;
  offset?: number;
  search?: string;
  category?: string;
  sort?: "new" | "sales";
};

export class StoreModel {
  constructor(private pool: Pool) {}

  async getStoreByOwner(userId: number) {
    const result = await this.pool.query(
      `SELECT id, owner_user_id, slug, display_name, bio, avatar_url, banner_url, tags, status, created_at, updated_at
       FROM creator_stores
       WHERE owner_user_id = $1
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async getStoreBySlug(slug: string) {
    const result = await this.pool.query(
      `SELECT s.id, s.owner_user_id, s.slug, s.display_name, s.bio, s.avatar_url, s.banner_url, s.tags, s.status, s.created_at, s.updated_at,
              u.username,
              COUNT(p.id)::int AS product_count
       FROM creator_stores s
       LEFT JOIN users u ON u.id = s.owner_user_id
       LEFT JOIN store_products p ON p.store_id = s.id AND p.status = 'active'
       WHERE s.slug = $1 AND s.status = 'active'
       GROUP BY s.id, u.username
       LIMIT 1`,
      [slug]
    );
    return result.rows[0] || null;
  }

  async upsertStore(userId: number, payload: { slug: string; displayName: string; bio?: string; avatarUrl?: string; bannerUrl?: string; tags: string[] }) {
    const result = await this.pool.query(
      `INSERT INTO creator_stores (owner_user_id, slug, display_name, bio, avatar_url, banner_url, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (owner_user_id)
       DO UPDATE SET slug = EXCLUDED.slug,
                     display_name = EXCLUDED.display_name,
                     bio = EXCLUDED.bio,
                     avatar_url = EXCLUDED.avatar_url,
                     banner_url = EXCLUDED.banner_url,
                     tags = EXCLUDED.tags,
                     updated_at = NOW()
       RETURNING id, owner_user_id, slug, display_name, bio, avatar_url, banner_url, tags, status, created_at, updated_at`,
      [userId, payload.slug, payload.displayName, payload.bio ?? null, payload.avatarUrl ?? null, payload.bannerUrl ?? null, payload.tags]
    );
    return result.rows[0];
  }

  async createProduct(userId: number, payload: CreateProductPayload) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const storeResult = await client.query(
        `SELECT id FROM creator_stores WHERE owner_user_id = $1 AND status = 'active' LIMIT 1`,
        [userId]
      );
      const storeId = storeResult.rows[0]?.id;
      if (!storeId) throw new Error("STORE_NOT_FOUND");

      const designResult = await client.query(
        `SELECT id, user_id, canvas_front, canvas_back
         FROM all_designs
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [payload.allDesignId, userId]
      );
      const design = designResult.rows[0];
      if (!design) throw new Error("DESIGN_NOT_FOUND");

      const productResult = await client.query(
        `INSERT INTO store_products (store_id, all_design_id, title, description, price, compare_at_price, tags, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, store_id, all_design_id, title, description, price, compare_at_price, tags, status, created_at, updated_at`,
        [storeId, payload.allDesignId, payload.title, payload.description ?? null, payload.price, payload.compareAtPrice ?? null, payload.tags, payload.status]
      );

      const product = productResult.rows[0];
      const defaultImages = [design.canvas_front, design.canvas_back].filter(Boolean);
      const imageUrls = payload.imageUrls.length ? payload.imageUrls : defaultImages;
      for (let index = 0; index < imageUrls.length; index += 1) {
        await client.query(
          `INSERT INTO store_product_images (product_id, image_url, image_kind, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [product.id, imageUrls[index], index === 0 ? "hero" : "gallery", index]
        );
      }

      await client.query("COMMIT");
      return product;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listMarketplaceProducts(params: MarketplaceListParams = {}) {
    const limit = Math.min(Math.max(Number(params.limit ?? 24) || 24, 1), 80);
    const offset = Math.max(Number(params.offset ?? 0) || 0, 0);
    const values: any[] = [limit, offset];
    const where: string[] = [`p.status = 'active'`, `s.status = 'active'`];
    let index = 3;

    if (params.category) {
      where.push(`a.category = $${index}`);
      values.push(params.category);
      index += 1;
    }
    if (params.search) {
      where.push(`(p.title ILIKE $${index} OR p.description ILIKE $${index} OR s.display_name ILIKE $${index} OR a.category ILIKE $${index})`);
      values.push(`%${params.search}%`);
      index += 1;
    }

    const orderBy = params.sort === "sales"
      ? `ORDER BY COALESCE(sales.sales_count, 0) DESC, p.created_at DESC`
      : `ORDER BY p.created_at DESC`;

    const result = await this.pool.query(
      `WITH sales AS (
         SELECT source_all_id, COUNT(*)::int AS sales_count
         FROM design_usage_rewards
         GROUP BY source_all_id
       )
       SELECT p.id, p.all_design_id, p.title, p.description, p.price, p.compare_at_price, p.tags, p.status,
              p.created_at, p.updated_at,
              a.category, a.selections, a.canvas_front, a.canvas_back,
              s.slug AS store_slug, s.display_name AS store_name, s.avatar_url AS store_avatar_url,
              COALESCE(sales.sales_count, 0) AS sales_count,
              COALESCE(img.image_url, a.canvas_front, '/page-heroes/hero-product-detail-fabric.png') AS hero_image_url
       FROM store_products p
       JOIN creator_stores s ON s.id = p.store_id
       JOIN all_designs a ON a.id = p.all_design_id
       LEFT JOIN sales ON sales.source_all_id = a.id
       LEFT JOIN LATERAL (
         SELECT image_url
         FROM store_product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1
       ) img ON TRUE
       WHERE ${where.join(" AND ")}
       ${orderBy}
       LIMIT $1 OFFSET $2`,
      values
    );
    return result.rows || [];
  }

  async listProductsByStoreSlug(slug: string, params: MarketplaceListParams = {}) {
    const limit = Math.min(Math.max(Number(params.limit ?? 80) || 80, 1), 120);
    const offset = Math.max(Number(params.offset ?? 0) || 0, 0);
    const result = await this.pool.query(
      `SELECT p.id, p.all_design_id, p.title, p.description, p.price, p.compare_at_price, p.tags, p.status,
              p.created_at, p.updated_at,
              a.category, a.selections, a.canvas_front, a.canvas_back,
              s.slug AS store_slug, s.display_name AS store_name, s.avatar_url AS store_avatar_url,
              COALESCE(img.image_url, a.canvas_front, '/page-heroes/hero-product-detail-fabric.png') AS hero_image_url,
              COALESCE(sales.sales_count, 0) AS sales_count
       FROM store_products p
       JOIN creator_stores s ON s.id = p.store_id
       JOIN all_designs a ON a.id = p.all_design_id
       LEFT JOIN (
         SELECT source_all_id, COUNT(*)::int AS sales_count
         FROM design_usage_rewards
         GROUP BY source_all_id
       ) sales ON sales.source_all_id = a.id
       LEFT JOIN LATERAL (
         SELECT image_url
         FROM store_product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1
       ) img ON TRUE
       WHERE s.slug = $1 AND s.status = 'active' AND p.status = 'active'
       ORDER BY p.sort_rank DESC, p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [slug, limit, offset]
    );
    return result.rows || [];
  }

  async listSellerProducts(userId: number) {
    const result = await this.pool.query(
      `SELECT p.id, p.all_design_id, p.title, p.description, p.price, p.compare_at_price, p.tags, p.status,
              p.created_at, p.updated_at,
              a.category, a.canvas_front, a.canvas_back,
              s.slug AS store_slug, s.display_name AS store_name,
              COALESCE(img.image_url, a.canvas_front, '/page-heroes/hero-product-detail-fabric.png') AS hero_image_url
       FROM store_products p
       JOIN creator_stores s ON s.id = p.store_id
       JOIN all_designs a ON a.id = p.all_design_id
       LEFT JOIN LATERAL (
         SELECT image_url
         FROM store_product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1
       ) img ON TRUE
       WHERE s.owner_user_id = $1
       ORDER BY p.updated_at DESC, p.created_at DESC`,
      [userId]
    );
    return result.rows || [];
  }

  async getProductById(productId: number) {
    const productResult = await this.pool.query(
      `WITH sales AS (
         SELECT source_all_id, COUNT(*)::int AS sales_count
         FROM design_usage_rewards
         GROUP BY source_all_id
       )
       SELECT p.id, p.store_id, p.all_design_id, p.title, p.description, p.price, p.compare_at_price, p.tags, p.status,
              p.created_at, p.updated_at,
              a.category, a.selections, a.design, a.canvas_front, a.canvas_back, a.canvas_meta,
              s.slug AS store_slug, s.display_name AS store_name, s.bio AS store_bio, s.avatar_url AS store_avatar_url, s.banner_url AS store_banner_url,
              COALESCE(sales.sales_count, 0) AS sales_count
       FROM store_products p
       JOIN creator_stores s ON s.id = p.store_id
       JOIN all_designs a ON a.id = p.all_design_id
       LEFT JOIN sales ON sales.source_all_id = a.id
       WHERE p.id = $1 AND p.status = 'active' AND s.status = 'active'
       LIMIT 1`,
      [productId]
    );
    const product = productResult.rows[0] || null;
    if (!product) return null;

    const imagesResult = await this.pool.query(
      `SELECT id, image_url, image_kind, alt_text, sort_order
       FROM store_product_images
       WHERE product_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [productId]
    );

    const relatedResult = await this.pool.query(
      `SELECT p.id, p.all_design_id, p.title, p.price, a.canvas_front, s.slug AS store_slug, s.display_name AS store_name,
              COALESCE(img.image_url, a.canvas_front, '/page-heroes/hero-product-detail-fabric.png') AS hero_image_url
       FROM store_products p
       JOIN all_designs a ON a.id = p.all_design_id
       JOIN creator_stores s ON s.id = p.store_id
       LEFT JOIN LATERAL (
         SELECT image_url
         FROM store_product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1
       ) img ON TRUE
       WHERE p.store_id = $1 AND p.id <> $2 AND p.status = 'active'
       ORDER BY p.sort_rank DESC, p.created_at DESC
       LIMIT 8`,
      [product.store_id, productId]
    );

    const fallbackImages = [
      product.canvas_front,
      product.canvas_back,
      "/page-heroes/hero-product-detail-fabric.png",
    ].filter(Boolean).map((image_url, index) => ({
      id: -index - 1,
      image_url,
      image_kind: index === 0 ? "front" : "gallery",
      alt_text: product.title,
      sort_order: index,
    }));

    return {
      ...product,
      images: imagesResult.rows.length ? imagesResult.rows : fallbackImages,
      related_products: relatedResult.rows || [],
    };
  }
}
