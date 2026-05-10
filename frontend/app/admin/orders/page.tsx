'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient, { getFriendlyApiErrorSummary } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminOrder, STATUS_OPTIONS } from '@/components/admin/types';

const formatMaybeNumber = (value: unknown) => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(value);
};

const downloadImage = (url: string, filename: string) => {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

type FilterType = 'all' | 'processing' | 'shipping' | 'delivered';

export default function AdminOrdersPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    if (!isLoading && (!user || !(user as any)?.is_admin)) {
      router.push('/');
    }
  }, [isLoading, user, router]);

  const loadOrders = async () => {
    try {
      setError(null);
      setIsLoadingOrders(true);
      const response = await apiClient.getAdminOrders();
      setOrders((response.orders || []) as AdminOrder[]);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: '加载订单失败', en: 'Failed to load orders' }, 'zh'));
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (!user || !(user as any)?.is_admin) return;
    loadOrders();
  }, [user]);

  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      setUpdatingId(orderId);
      await apiClient.updateAdminOrderStatus(orderId, status);
      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, status } : order)));
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: '更新状态失败', en: 'Failed to update status' }, 'zh'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleShip = async (orderId: number) => {
    await handleStatusChange(orderId, 'shipping');
  };

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'processing') {
      return orders.filter((order) => (order.status || 'pending') === 'processing' || (order.status || 'pending') === 'pending');
    }
    return orders.filter((order) => (order.status || 'pending') === filter);
  }, [orders, filter]);

  const statusCount = useMemo(() => {
    return {
      all: orders.length,
      processing: orders.filter((order) => (order.status || 'pending') === 'processing' || (order.status || 'pending') === 'pending').length,
      shipping: orders.filter((order) => (order.status || 'pending') === 'shipping').length,
      delivered: orders.filter((order) => (order.status || 'pending') === 'delivered').length,
    };
  }, [orders]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!user || !(user as any)?.is_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">订单管理</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/admin')}>
              返回管理后台
            </Button>
            <Button variant="outline" onClick={loadOrders} disabled={isLoadingOrders}>
              {isLoadingOrders ? '刷新中...' : '刷新'}
            </Button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>
            全部订单 ({statusCount.all})
          </Button>
          <Button variant={filter === 'processing' ? 'default' : 'outline'} onClick={() => setFilter('processing')}>
            正在处理 ({statusCount.processing})
          </Button>
          <Button variant={filter === 'shipping' ? 'default' : 'outline'} onClick={() => setFilter('shipping')}>
            运输中 ({statusCount.shipping})
          </Button>
          <Button variant={filter === 'delivered' ? 'default' : 'outline'} onClick={() => setFilter('delivered')}>
            已送达 ({statusCount.delivered})
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <Card className="mb-6 border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Order list */}
        {isLoadingOrders ? (
          <div className="text-sm text-muted-foreground">正在加载订单...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无订单</div>
        ) : (
          <div className="grid gap-6">
            {filteredOrders.map((order) => (
              <Card key={order.id}>
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base">订单 #{order.id}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      用户 ID: {order.user_id}
                      {order.user_name ? ` · ${order.user_name}` : ''}
                      {order.user_email ? ` · ${order.user_email}` : ''}
                    </p>
                    {order.created_at && (
                      <p className="text-xs text-muted-foreground">
                        下单时间：{new Date(order.created_at).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">¥{Number(order.total || 0).toFixed(2)}</Badge>
                    <select
                      className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                      value={order.status || 'pending'}
                      onChange={(event) => handleStatusChange(order.id, event.target.value)}
                      disabled={updatingId === order.id}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {(order.status || 'pending') !== 'shipping' && (order.status || 'pending') !== 'delivered' && (
                      <Button
                        size="sm"
                        onClick={() => handleShip(order.id)}
                        disabled={updatingId === order.id}
                      >
                        发货
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">收货地址</div>
                    <div className="rounded-md border p-3 text-sm">
                      {order.address || order.shipping_info?.address || '—'}
                    </div>
                    <div className="text-sm text-muted-foreground">订单配置</div>
                    <div className="rounded-md border p-3 text-sm space-y-1">
                      <div>版型：{order.selections?.style ?? '—'}</div>
                      <div>颜色：{order.selections?.color ?? '—'}</div>
                      <div>尺码：{order.selections?.size ?? '—'}</div>
                      <div>单价：{formatMaybeNumber(order.selections?.price)}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">设计元素坐标</div>
                    <div className="rounded-md border p-3 text-xs space-y-2 max-h-72 overflow-auto">
                      {(order.design?.elements || []).length === 0 ? (
                        <div className="text-muted-foreground">无</div>
                      ) : (
                        (order.design?.elements || []).map((el, idx) => (
                          <div key={el.id || idx} className="border-b last:border-b-0 pb-2 last:pb-0">
                            <div>元素：{el.type || '—'}{el.side ? ` / ${el.side}` : ''}</div>
                            <div>坐标：x {formatMaybeNumber(el.x)} · y {formatMaybeNumber(el.y)}</div>
                            <div>尺寸：w {formatMaybeNumber(el.width)} · h {formatMaybeNumber(el.height)}</div>
                            <div>旋转：{formatMaybeNumber(el.rotation)}</div>
                            {typeof el.visible === 'boolean' ? <div>可见：{el.visible ? '是' : '否'}</div> : null}
                            {el.content ? <div className="truncate">内容：{el.content}</div> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4">
                    {(() => {
                      const frontCanvas = order.design?.canvas?.snapshots?.front || null;
                      const backCanvas = order.design?.canvas?.snapshots?.back || null;
                      const frontElementOnly = order.design?.canvas?.elementSnapshots?.front || null;
                      const backElementOnly = order.design?.canvas?.elementSnapshots?.back || null;
                      const frontTryOn = order.id ? `/backend/api/orders/${order.id}/thumbnail` : null;
                      const backTryOn = null;
                      return (
                        <>
                          <div>
                            <div className="mb-2 text-sm font-medium text-foreground">衣服画布</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">正面画布</div>
                                {frontCanvas ? (
                                  <>
                                    <img src={frontCanvas} alt={`order-${order.id}-canvas-front`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(frontCanvas, `order-${order.id}-canvas-front.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">背面画布</div>
                                {backCanvas ? (
                                  <>
                                    <img src={backCanvas} alt={`order-${order.id}-canvas-back`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(backCanvas, `order-${order.id}-canvas-back.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 text-sm font-medium text-foreground">纯元素图（画布框内）</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">正面元素</div>
                                {frontElementOnly ? (
                                  <>
                                    <img src={frontElementOnly} alt={`order-${order.id}-elements-front`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(frontElementOnly, `order-${order.id}-elements-front.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">背面元素</div>
                                {backElementOnly ? (
                                  <>
                                    <img src={backElementOnly} alt={`order-${order.id}-elements-back`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(backElementOnly, `order-${order.id}-elements-back.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 text-sm font-medium text-foreground">模特试穿效果</div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">正面试穿</div>
                                {frontTryOn ? (
                                  <>
                                    <img src={frontTryOn} alt={`order-${order.id}-tryon-front`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(frontTryOn, `order-${order.id}-tryon-front.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">背面试穿</div>
                                {backTryOn ? (
                                  <>
                                    <img src={backTryOn} alt={`order-${order.id}-tryon-back`} className="h-36 w-full rounded-md border object-contain" />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadImage(backTryOn, `order-${order.id}-tryon-back.png`)}
                                    >
                                      下载
                                    </Button>
                                  </>
                                ) : (
                                  <div className="h-36 w-full rounded-md border flex items-center justify-center text-xs text-muted-foreground">无</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
