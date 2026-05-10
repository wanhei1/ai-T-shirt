"use client";

import { useEffect, useState } from "react";
import apiClient, { type AdminProduct, getFriendlyApiErrorSummary } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SkuDraft = {
  price: string;
  slaDays: string;
  isActive: boolean;
};

type NewProductForm = {
  name: string;
  description: string;
  isActive: boolean;
};

type NewSkuForm = {
  productId: string;
  skuCode: string;
  size: string;
  color: string;
  price: string;
  slaDays: string;
  isActive: boolean;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skuDrafts, setSkuDrafts] = useState<Record<number, SkuDraft>>({});
  const [savingSkuId, setSavingSkuId] = useState<number | null>(null);
  const [capacityDate, setCapacityDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [capacityTotal, setCapacityTotal] = useState<string>("200");
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [capacitySavedMessage, setCapacitySavedMessage] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<NewProductForm>({ name: "", description: "", isActive: true });
  const [newSku, setNewSku] = useState<NewSkuForm>({
    productId: "",
    skuCode: "",
    size: "",
    color: "",
    price: "",
    slaDays: "3",
    isActive: true,
  });
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isCreatingSku, setIsCreatingSku] = useState(false);
  const [initSavedMessage, setInitSavedMessage] = useState<string | null>(null);
  const [lastSkuTemplate, setLastSkuTemplate] = useState<Omit<NewSkuForm, "skuCode"> | null>(null);

  useEffect(() => {
    void loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setIsLoadingProducts(true);
      const response = await apiClient.getAdminProducts();
      const list = (response?.products || []) as AdminProduct[];
      setProducts(list);
      const nextDrafts: Record<number, SkuDraft> = {};
      for (const product of list) {
        for (const sku of product.skus || []) {
          nextDrafts[sku.id] = {
            price: Number(sku.price).toFixed(2),
            slaDays: String(Math.max(0, Number(sku.slaDays) || 0)),
            isActive: Boolean(sku.isActive),
          };
        }
      }
      setSkuDrafts(nextDrafts);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "加载 SKU 列表失败", en: "Failed to load SKU list" }, "zh"));
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const updateSkuDraft = (skuId: number, patch: Partial<SkuDraft>) => {
    setSkuDrafts((prev) => ({
      ...prev,
      [skuId]: {
        price: prev[skuId]?.price ?? "0",
        slaDays: prev[skuId]?.slaDays ?? "1",
        isActive: prev[skuId]?.isActive ?? true,
        ...patch,
      },
    }));
  };

  const saveSku = async (skuId: number) => {
    const draft = skuDrafts[skuId];
    if (!draft) return;

    const price = Number(draft.price);
    const slaDays = Number(draft.slaDays);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(slaDays) || slaDays < 0) {
      setError("SKU 参数无效：请检查价格与 SLA");
      return;
    }

    try {
      setSavingSkuId(skuId);
      await apiClient.updateAdminProductSku(skuId, {
        price,
        slaDays: Math.trunc(slaDays),
        isActive: draft.isActive,
      });
      await loadProducts();
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "保存 SKU 失败", en: "Failed to save SKU" }, "zh"));
    } finally {
      setSavingSkuId(null);
    }
  };

  const saveCapacity = async () => {
    const value = Number(capacityTotal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(capacityDate) || !Number.isFinite(value) || value < 0) {
      setError("产能参数无效：请检查日期与配额");
      return;
    }

    try {
      setSavingCapacity(true);
      setCapacitySavedMessage(null);
      const response = await apiClient.updateAdminProductionCapacity(capacityDate, Math.trunc(value));
      const cap = response.capacity;
      setCapacitySavedMessage(`已更新 ${cap.capacity_date} 产能为 ${cap.capacity_total}（已占用 ${cap.reserved_count}）`);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "更新产能失败", en: "Failed to update production capacity" }, "zh"));
    } finally {
      setSavingCapacity(false);
    }
  };

  const createProduct = async () => {
    const name = newProduct.name.trim();
    if (!name) {
      setError("请填写商品名称");
      return;
    }

    try {
      setError(null);
      setInitSavedMessage(null);
      setIsCreatingProduct(true);
      const response = await apiClient.createAdminProduct({
        name,
        description: newProduct.description.trim() || undefined,
        isActive: newProduct.isActive,
      });
      await loadProducts();
      setNewProduct({ name: "", description: "", isActive: true });
      setInitSavedMessage(`已创建商品 #${response.product.id} · ${response.product.name}`);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "新增商品失败", en: "Failed to create product" }, "zh"));
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const createSku = async () => {
    const productId = Number(newSku.productId);
    const skuCode = newSku.skuCode.trim();
    const price = Number(newSku.price);
    const slaDays = Number(newSku.slaDays);

    if (!Number.isInteger(productId) || productId <= 0) {
      setError("请选择所属商品");
      return;
    }
    if (!skuCode) {
      setError("请填写 SKU 编码");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("请填写有效价格");
      return;
    }
    if (!Number.isFinite(slaDays) || slaDays < 0) {
      setError("请填写有效 SLA 天数");
      return;
    }

    try {
      setError(null);
      setInitSavedMessage(null);
      setIsCreatingSku(true);
      const response = await apiClient.createAdminProductSku({
        productId,
        skuCode,
        size: newSku.size.trim() || undefined,
        color: newSku.color.trim() || undefined,
        price,
        slaDays: Math.trunc(slaDays),
        isActive: newSku.isActive,
      });
      setLastSkuTemplate({
        productId: String(productId),
        size: newSku.size.trim(),
        color: newSku.color.trim(),
        price: price.toFixed(2),
        slaDays: String(Math.trunc(slaDays)),
        isActive: newSku.isActive,
      });
      await loadProducts();
      setNewSku({
        productId: String(productId),
        skuCode: "",
        size: "",
        color: "",
        price: "",
        slaDays: "3",
        isActive: true,
      });
      setInitSavedMessage(`已创建 SKU #${response.sku.id} · ${response.sku.sku_code || response.sku.skuCode}`);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "新增 SKU 失败", en: "Failed to create SKU" }, "zh"));
    } finally {
      setIsCreatingSku(false);
    }
  };

  const copyLastSkuTemplateToForm = () => {
    if (!lastSkuTemplate) {
      setError("暂无可复制的 SKU 参数，请先创建一个 SKU");
      return;
    }

    setError(null);
    setInitSavedMessage("已复制上一个 SKU 参数，请修改 SKU 编码/尺码后创建");
    setNewSku((prev) => ({
      ...prev,
      productId: lastSkuTemplate.productId,
      skuCode: "",
      size: lastSkuTemplate.size,
      color: lastSkuTemplate.color,
      price: lastSkuTemplate.price,
      slaDays: lastSkuTemplate.slaDays,
      isActive: lastSkuTemplate.isActive,
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              P
            </div>
            <div>
              <h1 className="text-lg font-semibold">商品 / SKU 管理</h1>
              <p className="text-xs text-muted-foreground">产品列表、SKU 配置与产能管理</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadProducts} disabled={isLoadingProducts}>
            {isLoadingProducts ? "加载中..." : "刷新"}
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <Card className="mb-6 border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">SKU / 产能配置</CardTitle>
            <Button variant="outline" size="sm" onClick={loadProducts} disabled={isLoadingProducts}>
              {isLoadingProducts ? "加载中..." : "刷新 SKU"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium">新增商品</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    名称
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newProduct.name}
                      onChange={(event) => setNewProduct((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    描述
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newProduct.description}
                      onChange={(event) => setNewProduct((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground md:col-span-2">
                    <input
                      type="checkbox"
                      checked={newProduct.isActive}
                      onChange={(event) => setNewProduct((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    上架可售
                  </label>
                  <div className="md:col-span-2">
                    <Button size="sm" onClick={createProduct} disabled={isCreatingProduct}>
                      {isCreatingProduct ? "创建中..." : "创建商品"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium">新增 SKU</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-muted-foreground md:col-span-2">
                    所属商品
                    <select
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.productId}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, productId: event.target.value }))}
                    >
                      <option value="">请选择商品</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          #{product.id} · {product.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    SKU 编码
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.skuCode}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, skuCode: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    价格
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.price}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, price: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    尺码
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.size}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, size: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    颜色
                    <input
                      type="text"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.color}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, color: event.target.value }))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    SLA 天数
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                      value={newSku.slaDays}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, slaDays: event.target.value }))}
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={newSku.isActive}
                      onChange={(event) => setNewSku((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    上架可售
                  </label>
                  <div className="md:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={copyLastSkuTemplateToForm} disabled={!lastSkuTemplate || isCreatingSku}>
                        快速复制上一个 SKU 参数
                      </Button>
                      <Button size="sm" onClick={createSku} disabled={isCreatingSku || products.length === 0}>
                        {isCreatingSku ? "创建中..." : "创建 SKU"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {initSavedMessage ? <div className="rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-700">{initSavedMessage}</div> : null}

            <div className="rounded-md border p-3">
              <div className="mb-2 font-medium">每日产能配置</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">
                  日期
                  <input
                    type="date"
                    className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm"
                    value={capacityDate}
                    onChange={(event) => setCapacityDate(event.target.value)}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  配额
                  <input
                    type="number"
                    min={0}
                    className="mt-1 block h-9 w-28 rounded-md border border-border bg-background px-2 text-sm"
                    value={capacityTotal}
                    onChange={(event) => setCapacityTotal(event.target.value)}
                  />
                </label>
                <Button size="sm" onClick={saveCapacity} disabled={savingCapacity}>
                  {savingCapacity ? "保存中..." : "保存产能"}
                </Button>
              </div>
              {capacitySavedMessage ? <div className="mt-2 text-xs text-green-700">{capacitySavedMessage}</div> : null}
            </div>

            {products.length === 0 ? (
              <div className="rounded-md border p-3 text-muted-foreground">暂无商品/SKU 数据</div>
            ) : (
              <div className="overflow-auto rounded-md border">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left">商品</th>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">尺码/颜色</th>
                      <th className="px-3 py-2 text-left">价格</th>
                      <th className="px-3 py-2 text-left">SLA(天)</th>
                      <th className="px-3 py-2 text-left">上架</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.flatMap((product) => (product.skus || []).map((sku) => {
                      const draft = skuDrafts[sku.id] || {
                        price: Number(sku.price).toFixed(2),
                        slaDays: String(Math.max(0, Number(sku.slaDays) || 0)),
                        isActive: Boolean(sku.isActive),
                      };

                      return (
                        <tr key={sku.id} className="border-t">
                          <td className="px-3 py-2">#{product.id} · {product.name}</td>
                          <td className="px-3 py-2">{sku.skuCode}</td>
                          <td className="px-3 py-2">{sku.size || "-"} / {sku.color || "-"}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 w-24 rounded border border-border bg-background px-2"
                              value={draft.price}
                              onChange={(event) => updateSkuDraft(sku.id, { price: event.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="1"
                              className="h-8 w-20 rounded border border-border bg-background px-2"
                              value={draft.slaDays}
                              onChange={(event) => updateSkuDraft(sku.id, { slaDays: event.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={draft.isActive}
                                onChange={(event) => updateSkuDraft(sku.id, { isActive: event.target.checked })}
                              />
                              <span>{draft.isActive ? "是" : "否"}</span>
                            </label>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => saveSku(sku.id)} disabled={savingSkuId === sku.id}>
                              {savingSkuId === sku.id ? "保存中..." : "保存"}
                            </Button>
                          </td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
