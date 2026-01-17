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
  Copy,
  Crown,
  Edit,
  Gift,
  Loader2,
  Mail,
  Save,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";

type MembershipRecord = {
  plan_id: string;
  status?: string;
  started_at?: string | null;
  expires_at?: string | null;
  transaction_id?: string | null;
  balance?: number;
  currency?: string;
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

type ReferralMe = {
  invite_code: string;
  invited_by_user_id?: number | null;
  invite_redeemed_at?: string | null;
  total_invites: number;
  total_rewards: number;
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

  const [referralMe, setReferralMe] = useState<ReferralMe | null>(null);
  const [isLoadingReferral, setIsLoadingReferral] = useState(true);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [isRedeemingInvite, setIsRedeemingInvite] = useState(false);
  const [referralMessage, setReferralMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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

  const parseBackendTimestamp = (input: string | null | undefined): Date | null => {
    if (!input) return null;
    const trimmed = String(input).trim();
    if (!trimmed) return null;

    // Accept: "...Z", "...+08:00", "...+0800", "...+08", "YYYY-MM-DD HH:mm:ss"
    const hasExplicitTimezone = /([zZ]|[+-]\d{2}:?\d{2}|[+-]\d{2})$/.test(trimmed);
    const normalizedBase = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    const normalized = hasExplicitTimezone
      ? normalizedBase.replace(/([+-]\d{2})$/, "$1:00")
      : `${normalizedBase}Z`;

    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const extractEpochMsFromTransactionId = (transactionId: string | null | undefined): number | null => {
    if (!transactionId) return null;
    const match = String(transactionId).match(/-(\d{13})$/);
    if (!match) return null;
    const ms = Number(match[1]);
    return Number.isFinite(ms) ? ms : null;
  };

  const PLAN_DURATION_DAYS: Record<string, number> = {
    monthly: 30,
    quarterly: 90,
    'half-year': 180,
    yearly: 365
  };

  const derivedMembershipDates = useMemo(() => {
    const ms = extractEpochMsFromTransactionId(membership?.transaction_id ?? null);
    const planDays = membership?.plan_id ? PLAN_DURATION_DAYS[membership.plan_id] : null;

    if (ms && planDays) {
      return {
        startedAt: new Date(ms),
        expiresAt: new Date(ms + planDays * 24 * 60 * 60 * 1000)
      };
    }

    return {
      startedAt: parseBackendTimestamp(membership?.started_at ?? null),
      expiresAt: parseBackendTimestamp(membership?.expires_at ?? null)
    };
  }, [membership]);

  const isMembershipActiveByExpiry = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return true;
    const parsed = parseBackendTimestamp(expiresAt);
    if (!parsed) return true;
    return parsed.getTime() >= Date.now();
  };

  const activeMembership = useMemo(() => {
    if (!membership) return null;
    if (membership.status && membership.status !== "active") return null;
    if (derivedMembershipDates.expiresAt) {
      return derivedMembershipDates.expiresAt.getTime() >= Date.now() ? membership : null;
    }
    return isMembershipActiveByExpiry(membership.expires_at) ? membership : null;
  }, [membership, derivedMembershipDates.expiresAt]);

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

  useEffect(() => {
    if (!user) return;
    const fetchReferral = async () => {
      try {
        setIsLoadingReferral(true);
        const { apiClient } = await import("@/lib/api-client");
        const data = await apiClient.getReferralMe();
        setReferralMe(data || null);
      } catch (error) {
        console.warn("Failed to fetch referral info", error);
        setReferralMe(null);
      } finally {
        setIsLoadingReferral(false);
      }
    };
    fetchReferral();
  }, [user]);

  const handleCopyInviteCode = async () => {
    const code = referralMe?.invite_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setReferralMessage({
        type: "success",
        text: translate({ zh: "邀请码已复制", en: "Invite code copied" }),
      });
    } catch {
      setReferralMessage({
        type: "error",
        text: translate({ zh: "复制失败，请手动复制", en: "Copy failed, please copy manually" }),
      });
    }
  };

  const handleRedeemInviteCode = async () => {
    const code = inviteCodeInput.trim();
    if (!code) {
      setReferralMessage({
        type: "error",
        text: translate({ zh: "请输入邀请码", en: "Please enter an invite code" }),
      });
      return;
    }
    try {
      setIsRedeemingInvite(true);
      setReferralMessage(null);
      const { apiClient } = await import("@/lib/api-client");
      const res = await apiClient.redeemInviteCode(code);
      setReferralMessage({
        type: "success",
        text: translate({
          zh: `兑换成功！邀请人已获得 ${res?.reward?.amount ?? 35}${res?.reward?.currency ?? "CNY"} 激励`,
          en: `Redeemed! The inviter received ${res?.reward?.amount ?? 35} ${res?.reward?.currency ?? "CNY"}`,
        }),
      });
      setInviteCodeInput("");
      // Refresh redeemed state
      const refreshed = await apiClient.getReferralMe();
      setReferralMe(refreshed || null);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const msg = (error as Error)?.message || "";
      if (status === 409) {
        setReferralMessage({
          type: "error",
          text: translate({ zh: "你已兑换过邀请码", en: "You have already redeemed an invite code" }),
        });
      } else if (status === 404) {
        setReferralMessage({
          type: "error",
          text: translate({ zh: "邀请码不存在", en: "Invite code not found" }),
        });
      } else if (status === 400 && msg.toLowerCase().includes("own")) {
        setReferralMessage({
          type: "error",
          text: translate({ zh: "不能兑换自己的邀请码", en: "You cannot redeem your own code" }),
        });
      } else {
        setReferralMessage({
          type: "error",
          text: translate({ zh: "兑换失败，请重试", en: "Redeem failed, please try again" }),
        });
      }
    } finally {
      setIsRedeemingInvite(false);
    }
  };

  const formatBeijingDateTime = (value: string | null | undefined, fallback: string) => {
    if (!value) return fallback;
    const parsed = parseBackendTimestamp(value);
    if (!parsed) return fallback;

    // Convert UTC epoch -> Beijing wall-clock by +08:00, then format via UTC getters.
    const beijing = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
    const yyyy = beijing.getUTCFullYear();
    const mm = String(beijing.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(beijing.getUTCDate()).padStart(2, "0");
    const hh = String(beijing.getUTCHours()).padStart(2, "0");
    const min = String(beijing.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  };

  const formatBeijingDateFromDate = (date: Date | null, fallback: string) => {
    if (!date) return fallback;
    const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const yyyy = beijing.getUTCFullYear();
    const mm = String(beijing.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(beijing.getUTCDate()).padStart(2, "0");
    const hh = String(beijing.getUTCHours()).padStart(2, "0");
    const min = String(beijing.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  };

  const formatMembershipDate = (value: string | null | undefined) =>
    formatBeijingDateTime(value, translate({ zh: "长期有效", en: "No expiry" }));

  const formatMembershipStartedDate = (value: string | null | undefined) =>
    formatBeijingDateTime(value, translate({ zh: "—", en: "—" }));

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
                  <div>
                    <Button asChild variant="outline" className="bg-transparent">
                      <Link href="/membership#balance-history">
                        {translate({ zh: "查看余额流水", en: "View balance history" })}
                      </Link>
                    </Button>
                  </div>
                  {activeMembership ? (
                    <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <Sparkles className="h-4 w-4" />
                        {translate({ zh: "专属特效已开启", en: "Premium mode enabled" })}
                      </div>
                      <p className="mt-2 text-xs text-foreground">
                        {(() => {
                          const startedAtLabel = derivedMembershipDates.startedAt
                            ? formatBeijingDateFromDate(
                                derivedMembershipDates.startedAt,
                                translate({ zh: "—", en: "—" })
                              )
                            : formatMembershipStartedDate(activeMembership.started_at ?? null);

                          const expiresAtLabel = derivedMembershipDates.expiresAt
                            ? formatBeijingDateFromDate(
                                derivedMembershipDates.expiresAt,
                                translate({ zh: "长期有效", en: "No expiry" })
                              )
                            : formatMembershipDate(activeMembership.expires_at ?? null);

                          const balanceLabel = `${activeMembership.currency ?? ""} ${Number(
                            activeMembership.balance ?? 0
                          ).toFixed(2)}`.trim();

                          return translate({
                            zh: `当前会员：${membershipPlanMeta?.label ?? activeMembership.plan_id}，余额：${balanceLabel}，开通时间：${startedAtLabel}，有效期至：${expiresAtLabel}`,
                            en: `Active plan: ${membershipPlanMeta?.label ?? activeMembership.plan_id}, balance: ${balanceLabel}, started at ${startedAtLabel}, valid until ${expiresAtLabel}`,
                          });
                        })()}
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

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {translate({ zh: "邀请好友", en: "Invite Friends" })}
                </CardTitle>
                <CardDescription>
                  {translate({
                    zh: "把你的邀请码发给新用户，新用户兑换后你将获得 35 元余额激励。",
                    en: "Share your invite code. When a new user redeems it, you get a 35 CNY balance reward.",
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {referralMessage && (
                  <Alert
                    className={
                      referralMessage.type === "error"
                        ? "border-red-500"
                        : "border-green-500"
                    }
                  >
                    <AlertDescription>{referralMessage.text}</AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border bg-background p-4">
                    <div className="text-sm text-muted-foreground">
                      {translate({ zh: "我的邀请码", en: "My invite code" })}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="font-mono text-lg font-semibold">
                        {isLoadingReferral
                          ? "—"
                          : referralMe?.invite_code || "—"}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyInviteCode}
                        disabled={!referralMe?.invite_code}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {translate({ zh: "复制", en: "Copy" })}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-background p-4">
                    <div className="text-sm text-muted-foreground">
                      {translate({ zh: "已邀请人数", en: "Invites" })}
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {isLoadingReferral ? "—" : referralMe?.total_invites ?? 0}
                    </div>
                  </div>

                  <div className="rounded-lg border bg-background p-4">
                    <div className="text-sm text-muted-foreground">
                      {translate({ zh: "累计奖励", en: "Total rewards" })}
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {isLoadingReferral
                        ? "—"
                        : `${Number(referralMe?.total_rewards ?? 0).toFixed(2)} CNY`}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold">
                    <Gift className="h-4 w-4" />
                    {translate({ zh: "兑换邀请码", en: "Redeem an invite code" })}
                  </div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                      value={inviteCodeInput}
                      onChange={(e) => setInviteCodeInput(e.target.value)}
                      placeholder={translate({ zh: "输入好友邀请码", en: "Enter a friend's invite code" })}
                      disabled={
                        isRedeemingInvite ||
                        Boolean(referralMe?.invite_redeemed_at)
                      }
                    />
                    <Button
                      onClick={handleRedeemInviteCode}
                      disabled={
                        isRedeemingInvite ||
                        Boolean(referralMe?.invite_redeemed_at)
                      }
                      className="md:w-48"
                    >
                      {isRedeemingInvite ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {translate({ zh: "兑换中...", en: "Redeeming..." })}
                        </>
                      ) : (
                        translate({ zh: "确认兑换", en: "Redeem" })
                      )}
                    </Button>
                  </div>
                  {referralMe?.invite_redeemed_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {translate({
                        zh: "你已兑换过邀请码，无法重复兑换。",
                        en: "You already redeemed an invite code.",
                      })}
                    </p>
                  )}
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

