"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Calendar,
  Crown,
  Edit,
  Loader2,
  Mail,
  Save,
  Sparkles,
  User,
  X,
} from "lucide-react";

type MembershipRecord = {
  plan_id: string;
  status?: string;
  expires_at?: string | null;
};

type OrderRecord = {
  id: string | number;
  created_at: string;
  total: number | string;
  status: string;
  design?: {
    elements?: Array<{
      type?: string;
      content?: string;
    }>;
    selections?: Record<string, string>;
  };
  selections?: Record<string, string>;
};

export default function ProfilePage() {
  const { user, logout, updateProfile } = useAuth();
  const { translate } = useLanguage();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: "",
    email: "",
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [membership, setMembership] = useState<MembershipRecord | null>(null);
  const [isLoadingMembership, setIsLoadingMembership] = useState(true);

  const membershipPlans = useMemo(
    () => [
      {
        id: "monthly",
        label: translate({ zh: "月度会员", en: "Monthly" }),
        price: translate({ zh: "¥188", en: "¥188" }),
      },
      {
        id: "quarterly",
        label: translate({ zh: "季度会员", en: "Quarterly" }),
        price: translate({ zh: "¥564", en: "¥564" }),
      },
      {
        id: "half-year",
        label: translate({ zh: "半年会员", en: "Half-Year" }),
        price: translate({ zh: "¥1128", en: "¥1128" }),
      },
      {
        id: "yearly",
        label: translate({ zh: "年度会员", en: "Annual" }),
        price: translate({ zh: "¥2256", en: "¥2256" }),
      },
    ],
    [translate]
  );

  const membershipBenefits = useMemo(
    () => [
      translate({
        zh: "AI 生图不限次数，灵感随时释放",
        en: "Unlimited AI generations whenever inspiration strikes",
      }),
      translate({
        zh: "会员素材与模板持续更新",
        en: "Continually updated member-only assets and templates",
      }),
      translate({
        zh: "专属客服优先响应",
        en: "Priority support from our dedicated team",
      }),
      translate({
        zh: "更多会员特权持续上新，敬请期待",
        en: "More exclusive perks keep rolling out—stay tuned",
      }),
    ],
    [translate]
  );

  const activeMembership = useMemo(() => {
    if (!membership) return null;
    if (membership.status && membership.status !== "active") return null;
    if (!membership.expires_at) return membership;
    return new Date(membership.expires_at).getTime() >= Date.now()
      ? membership
      : null;
  }, [membership]);

  const membershipPlanMeta = useMemo(() => {
    if (!membership) return null;
    return (
      membershipPlans.find((plan) => plan.id === membership.plan_id) || null
    );
  }, [membership, membershipPlans]);

  useEffect(() => {
    if (!user) return;
    setEditForm({
      username: user.username,
      email: user.email,
    });
  }, [user]);

  const handleEditToggle = () => {
    if (!isEditing) {
      setEditForm({
        username: user?.username || "",
        email: user?.email || "",
      });
    }
    setIsEditing((prev) => !prev);
    setMessage(null);
  };

  const handleSave = async () => {
    try {
      await updateProfile(editForm);
      setMessage({
        type: "success",
        text: translate({
          zh: "资料更新成功！",
          en: "Profile updated successfully!",
        }),
      });
      setIsEditing(false);
    } catch (error) {
      setMessage({
        type: "error",
        text: translate({
          zh: "更新失败，请重试",
          en: "Update failed, please try again",
        }),
      });
    }
  };

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { apiClient } = await import("@/lib/api-client");
        const response = await apiClient.getOrders();
        setOrders(response.orders || []);
      } catch (error) {
        console.warn("Failed to fetch orders", error);
        setOrders([]);
      }
    };

    fetchOrders();
  }, []);

  useEffect(() => {
    const fetchMembership = async () => {
      try {
        setIsLoadingMembership(true);
        const { apiClient } = await import("@/lib/api-client");
        const response = await apiClient.getMembership();
        setMembership(response.membership || null);
      } catch (error) {
        console.warn("Failed to fetch membership", error);
        setMembership(null);
      } finally {
        setIsLoadingMembership(false);
      }
    };

    fetchMembership();
  }, []);

  const formatMembershipDate = (value: string | null | undefined) => {
    if (!value) {
      return translate({ zh: "长期有效", en: "No expiry" });
    }

    return new Date(value).toLocaleString(
      translate({ zh: "zh-CN", en: "en-US" }),
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(
      translate({ zh: "zh-CN", en: "en-US" }),
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );

  return (
    <AuthGuard requireAuth>
      <div className="min-h-screen bg-background p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-foreground">
              {translate({ zh: "个人资料", en: "Profile" })}
            </h1>
            <p className="text-muted-foreground">
              {translate({
                zh: "管理您的账户信息和偏好设置",
                en: "Manage your account information and preferences",
              })}
            </p>
          </div>

          {message && (
            <Alert
              className={`mb-6 ${
                message.type === "error"
                  ? "border-red-500"
                  : "border-green-500"
              }`}
            >
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Card
              className={`relative overflow-hidden transition-all duration-500 md:col-span-2 ${
                activeMembership
                  ? "border-primary/60 shadow-[0_0_35px_rgba(234,179,8,0.35)]"
                  : "border-primary/30 bg-primary/5"
              }`}
            >
              {activeMembership && (
                <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-primary/20 via-amber-100/40 to-primary/20 opacity-80" />
              )}
              <CardHeader className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <Crown className="h-6 w-6 text-primary" />
                      {translate({
                        zh: "会员尊享计划",
                        en: "Membership Privileges",
                      })}
                    </CardTitle>
                    {activeMembership && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground shadow-sm">
                        <Sparkles className="h-3 w-3" />
                        {translate({ zh: "已激活", en: "Active" })}
                      </span>
                    )}
                    {!activeMembership &&
                      !isLoadingMembership &&
                      membership && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-700">
                          {translate({ zh: "已过期", en: "Expired" })}
                        </span>
                      )}
                    {isLoadingMembership && (
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {translate({
                          zh: "加载会员状态...",
                          en: "Loading membership status...",
                        })}
                      </span>
                    )}
                  </div>
                  <CardDescription className="text-base">
                    {translate({
                      zh: "加入会员可解锁无限生图、专属素材与更多特权，助你高效完成每一次创作。",
                      en: "Become a member to unlock unlimited generations, exclusive assets, and more perks for faster creation.",
                    })}
                  </CardDescription>
                  {activeMembership ? (
                    <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary-foreground/80">
                      <div className="flex items-center gap-2 font-semibold text-primary-foreground">
                        <Sparkles className="h-4 w-4" />
                        {translate({ zh: "专属特效已开启", en: "Premium mode enabled" })}
                      </div>
                      <p className="mt-2 text-xs text-primary-foreground/80">
                        {translate({
                          zh: `当前会员：${membershipPlanMeta?.label ?? activeMembership.plan_id}，有效期至：${formatMembershipDate(
                            activeMembership.expires_at ?? null
                          )}`,
                          en: `Active plan: ${membershipPlanMeta?.label ?? activeMembership.plan_id}, valid until ${formatMembershipDate(
                            activeMembership.expires_at ?? null
                          )}`,
                        })}
                      </p>
                    </div>
                  ) : (
                    !isLoadingMembership && (
                      <p className="text-xs text-muted-foreground/80">
                        {translate({
                          zh: "尚未开通会员，选择方案即可立即启用。",
                          en: "No membership yet—pick a plan to unlock premium perks.",
                        })}
                      </p>
                    )
                  )}
                </div>
                <Button size="lg" asChild className="relative px-6 text-base">
                  <Link href="/membership">
                    {activeMembership
                      ? translate({ zh: "管理会员", en: "Manage Membership" })
                      : translate({ zh: "立即开通会员", en: "Activate Membership" })}
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="relative grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="mb-3 font-semibold">
                    {translate({ zh: "会员价格", en: "Pricing" })}
                  </h3>
                  <ul className="space-y-2 text-sm text-primary">
                    {membershipPlans.map((plan) => (
                      <li
                        key={plan.id}
                        className={`flex justify-between rounded-md px-3 py-2 transition ${
                          activeMembership && membership?.plan_id === plan.id
                            ? "bg-primary text-primary-foreground shadow"
                            : "bg-primary/10 text-foreground"
                        }`}
                      >
                        <span className="font-medium">{plan.label}</span>
                        <span>{plan.price}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-3 font-semibold">
                    {translate({ zh: "会员特权", en: "Benefits" })}
                  </h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {membershipBenefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="mt-1 text-primary">•</span>
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {translate({ zh: "基本信息", en: "Basic Information" })}
                </CardTitle>
                <CardDescription>
                  {translate({
                    zh: "您的账户基本信息",
                    en: "Your account basic information",
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-lg">
                      {user ? getInitials(user.username) : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold">{user?.username}</h3>
                    <p className="text-muted-foreground">{user?.email}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">
                      {translate({ zh: "用户名", en: "Username" })}
                    </Label>
                    {isEditing ? (
                      <Input
                        id="username"
                        value={editForm.username}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            username: event.target.value,
                          })
                        }
                      />
                    ) : (
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{user?.username}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      {translate({ zh: "邮箱", en: "Email" })}
                    </Label>
                    {isEditing ? (
                      <Input
                        id="email"
                        type="email"
                        value={editForm.email}
                        onChange={(event) =>
                          setEditForm({
                            ...editForm,
                            email: event.target.value,
                          })
                        }
                      />
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{user?.email}</span>
                      </div>
                    )}
                  </div>

                  {user?.created_at && (
                    <div className="space-y-2">
                      <Label>
                        {translate({ zh: "注册时间", en: "Registration Date" })}
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(user.created_at)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button onClick={handleSave} className="flex items-center gap-2">
                        <Save className="h-4 w-4" />
                        {translate({ zh: "保存", en: "Save" })}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleEditToggle}
                        className="flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        {translate({ zh: "取消", en: "Cancel" })}
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleEditToggle}
                      className="flex items-center gap-2"
                    >
                      <Edit className="h-4 w-4" />
                      {translate({ zh: "编辑资料", en: "Edit Profile" })}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {translate({ zh: "账户操作", en: "Account Actions" })}
                </CardTitle>
                <CardDescription>
                  {translate({
                    zh: "管理您的账户设置",
                    en: "Manage your account settings",
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4">
                  <h4 className="mb-2 font-semibold">
                    {translate({ zh: "设计历史", en: "Design History" })}
                  </h4>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {translate({
                      zh: "查看您创建的所有T恤设计",
                      en: "View all your T-shirt designs",
                    })}
                  </p>
                  <Button variant="outline" disabled>
                    {translate({ zh: "即将推出", en: "Coming Soon" })}
                  </Button>
                </div>

                <div className="rounded-lg border p-4">
                  <h4 className="mb-2 font-semibold">
                    {translate({ zh: "订单历史", en: "Order History" })}
                  </h4>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {translate({
                      zh: "查看您的订购历史和状态",
                      en: "View your order history and status",
                    })}
                  </p>
                  {orders === null ? (
                    <p className="text-sm text-muted-foreground">
                      {translate({ zh: "加载中...", en: "Loading..." })}
                    </p>
                  ) : orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {translate({ zh: "暂无订单", en: "No orders yet" })}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {orders.map((order) => {
                        const design = order.design || { elements: [], selections: {} };
                        const firstImage = (design.elements || []).find(
                          (element) =>
                            element.type === "image" || element.type === "ai-generated"
                        );
                        const thumbnailSrc = firstImage?.content ?? null;

                        return (
                          <div
                            key={order.id}
                            className="flex items-center gap-4 rounded-lg border p-3"
                          >
                            {thumbnailSrc ? (
                              <img
                                src={thumbnailSrc}
                                alt={`order-${order.id}`}
                                className="h-16 w-16 rounded object-cover"
                              />
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded bg-muted text-xs font-medium">
                                {((design.elements || []).length || 0)}
                                {translate({ zh: " 个元素", en: " items" })}
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex justify-between">
                                <div>
                                  <div className="font-medium">
                                    {translate({ zh: "订单号", en: "Order" })} #{order.id}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {new Date(order.created_at).toLocaleString()}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-semibold">
                                    ¥{Number(order.total).toFixed(2)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {order.status}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                {translate({ zh: "版型：", en: "Style:" })} {order.selections?.style ?? "—"} • {translate({ zh: "颜色：", en: "Color:" })} {order.selections?.color ?? "—"} • {translate({ zh: "尺码：", en: "Size:" })} {order.selections?.size ?? "—"}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                  <h4 className="mb-2 font-semibold text-red-800">
                    {translate({ zh: "危险操作", en: "Danger Zone" })}
                  </h4>
                  <p className="mb-3 text-sm text-red-600">
                    {translate({
                      zh: "登出将清除您的本地会话",
                      en: "Logging out will clear your local session",
                    })}
                  </p>
                  <Button variant="destructive" onClick={logout} className="w-full">
                    {translate({ zh: "登出账户", en: "Log Out" })}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

