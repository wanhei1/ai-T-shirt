import { Router } from "express";
import { Pool } from "pg";
import { StoreModel } from "../models/store";
import { validateCreateStoreProductPayload, validateUpsertStorePayload } from "../validation/store-schemas";

type AuthMiddleware = (req: any, res: any, next: any) => void;

export const createStoreRoutes = (params: {
  pool: Pool;
  readPool?: Pool | null;
  authenticate: AuthMiddleware;
}) => {
  const router = Router();
  const storeModel = new StoreModel(params.pool);
  const storeReadModel = new StoreModel(params.readPool || params.pool);

  router.get("/marketplace/products", async (req, res) => {
    try {
      const products = await storeReadModel.listMarketplaceProducts({
        limit: req.query.limit ? Number(req.query.limit) : 24,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        category: typeof req.query.category === "string" ? req.query.category : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        sort: req.query.sort === "sales" ? "sales" : "new",
      });
      res.json({ products });
    } catch (error) {
      console.error("List marketplace products failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.get("/marketplace/products/:productId", async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ message: "Invalid productId" });
      }
      const product = await storeReadModel.getProductById(productId);
      if (!product) return res.status(404).json({ message: "Product not found" });
      res.json({ product });
    } catch (error) {
      console.error("Get marketplace product failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.get("/stores/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      const store = await storeReadModel.getStoreBySlug(slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      res.json({ store });
    } catch (error) {
      console.error("Get store failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.get("/stores/:slug/products", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      const products = await storeReadModel.listProductsByStoreSlug(slug, {
        limit: req.query.limit ? Number(req.query.limit) : 80,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      });
      res.json({ products });
    } catch (error) {
      console.error("List store products failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.get("/seller/store", params.authenticate, async (req: any, res) => {
    try {
      const store = await storeReadModel.getStoreByOwner(req.userId);
      res.json({ store });
    } catch (error) {
      console.error("Get seller store failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.post("/seller/store", params.authenticate, async (req: any, res) => {
    try {
      const validation = validateUpsertStorePayload(req.body);
      if (!validation.success) return res.status(400).json({ message: "Invalid store payload", errors: validation.errors });
      const store = await storeModel.upsertStore(req.userId, validation.data);
      res.status(201).json({ store });
    } catch (error: any) {
      if (String(error?.message || "").toLowerCase().includes("duplicate")) {
        return res.status(409).json({ message: "Store slug is already taken" });
      }
      console.error("Upsert seller store failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.get("/seller/products", params.authenticate, async (req: any, res) => {
    try {
      const products = await storeReadModel.listSellerProducts(req.userId);
      res.json({ products });
    } catch (error) {
      console.error("List seller products failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  router.post("/seller/products", params.authenticate, async (req: any, res) => {
    try {
      const validation = validateCreateStoreProductPayload(req.body);
      if (!validation.success) return res.status(400).json({ message: "Invalid product payload", errors: validation.errors });
      const product = await storeModel.createProduct(req.userId, validation.data);
      res.status(201).json({ product });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message === "STORE_NOT_FOUND") return res.status(400).json({ message: "Create a store before publishing products" });
      if (message === "DESIGN_NOT_FOUND") return res.status(404).json({ message: "Design not found for this user" });
      if (message.toLowerCase().includes("duplicate")) return res.status(409).json({ message: "This design is already published as a product" });
      console.error("Create seller product failed", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return router;
};
