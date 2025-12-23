"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useLanguage } from "@/contexts/language-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Crown, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import apiClient from "@/lib/api-client";

interface MembershipRecord {
  id: number;
  user_id: number;
  plan_id: string;
  amount: number;
  currency: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  transaction_id: string;
  provider?: string | null;
}

interface MembershipResponse {
  membership: MembershipRecord | null;
}

const PLAN_IDS = ["monthly", "quarterly", "half-year", "yearly"] as const;
type PlanId = (typeof PLAN_IDS)[number];

interface MembershipPlan {
  id: PlanId;
  headline: { zh: string; en: string };
  description: { zh: string; en: string };
  priceLabel: { zh: string; en: string };
  billing: { zh: string; en: string };
  highlight?: { zh: string; en: string };
}

const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "monthly",
    headline: { zh: "月度会员", en: "Monthly" },
    description: {
      zh: "适合短期密集创作，随开随用",
      en: "Perfect for focused short sprints of creativity",
    },
    priceLabel: { zh: "¥188", en: "¥188" },
    billing: { zh: "按月计费", en: "Billed monthly" },
    highlight: { zh: "灵活续订", en: "Flexible renewal" },
  },
  {
    id: "quarterly",
    headline: { zh: "季度会员", en: "Quarterly" },
    description: {
      zh: "季度折扣更划算，适合持续规划",
      en: "Discounted bundle for ongoing projects",
    },
    priceLabel: { zh: "¥564", en: "¥564" },
    billing: { zh: "每季度一次", en: "Every quarter" },
    highlight: { zh: "热门", en: "Popular" },
  },
  {
    id: "half-year",
    headline: { zh: "半年会员", en: "Half-Year" },
    description: {
      zh: "中长期创作者的稳定选择",
      en: "Steady value for half-year visionaries",
    },
    priceLabel: { zh: "¥1128", en: "¥1128" },
    billing: { zh: "每半年一次", en: "Twice per year" },
  },
  {
    id: "yearly",
    headline: { zh: "年度会员", en: "Annual" },
    description: {
      zh: "全年超值畅享，省心之选",
      en: "Best value for year-round creators",
    },
    priceLabel: { zh: "¥2256", en: "¥2256" },
    billing: { zh: "每年一次", en: "Billed annually" },
    highlight: { zh: "最高优惠", en: "Best savings" },
  },
];

export default function MembershipPage() {
  const { translate } = useLanguage();
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>("monthly");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [membership, setMembership] = useState<MembershipRecord | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => MEMBERSHIP_PLANS.find((plan) => plan.id === selectedPlanId)!,
    [selectedPlanId]
  );

  const isMembershipActive = useMemo(() => {
    if (!membership) return false;
    if (!membership.expires_at) return true;
    return new Date(membership.expires_at).getTime() >= Date.now();
  }, [membership]);

  useEffect(() => {
    const fetchMembership = async () => {
      try {
        setIsLoadingStatus(true);
        const data = (await apiClient.getMembership()) as MembershipResponse;
        setMembership(data?.membership ?? null);
      } catch (error) {
        console.error("Failed to fetch membership", error);
        setErrorMessage(
          translate({ zh: "无法获取会员状态，请稍后重试", en: "Unable to load membership status. Please try again." })
        );
      } finally {
        setIsLoadingStatus(false);
      }
    };

    fetchMembership();
  }, [translate]);

  const handlePurchase = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      // 模拟支付流程，生产环境应替换为真实支付集成
      await new Promise((resolve) => setTimeout(resolve, 900));

      const paymentReference = `demo-${selectedPlanId}-${Date.now()}`;
      const response = (await apiClient.activateMembership({
        planId: selectedPlanId,
        paymentReference,
        provider: "mock",
      })) as MembershipResponse;

      if (response?.membership) {
        setMembership(response.membership);
        setSuccessMessage(
          translate({ zh: "会员开通成功，尽情创作吧！", en: "Membership activated successfully. Happy creating!" })
        );
      } else {
        setSuccessMessage(
          translate({ zh: "会员状态已更新", en: "Membership status updated" })
        );
      }
    } catch (error) {
      console.error("Membership activation failed", error);
      setErrorMessage(
        translate({ zh: "支付或开通失败，请稍后再试", en: "Payment or activation failed. Please retry." })
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return translate({ zh: "不过期", en: "No expiry" });
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

  return (
    <AuthGuard requireAuth>
      <div className="min-h-screen bg-background py-16 px-4">
        <div className="container mx-auto max-w-5xl space-y-10">
          <div className="space-y-4 text-center">
            <Badge
              variant="outline"
              className="text-primary border-primary/40 inline-flex items-center justify-center px-3 py-1 gap-2"
            >
              <Crown className="w-4 h-4" />
              {translate({ zh: "会员中心", en: "Membership Center" })}
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold">
              {translate({
                zh: "选择会员计划，极速解锁 AI 创作特权",
                en: "Choose your membership plan and unlock premium AI perks",
              })}
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {translate({
                zh: "支持无限生图、专属素材与优先客服的全能会员服务，灵活周期随心选择。",
                en: "Flexible plans that include unlimited AI generations, exclusive assets, and priority support.",
              })}
            </p>
          </div>

          {successMessage && (
            <Alert className="border-green-500 bg-green-50 text-green-800">
              <AlertDescription className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {errorMessage && (
            <Alert className="border-red-500 bg-red-50 text-red-800">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-8 lg:grid-cols-[2fr,1fr] items-start">
            <Card>
              <CardHeader>
                <CardTitle>
                  {translate({ zh: "选择你的计划", en: "Pick your plan" })}
                </CardTitle>
                <CardDescription>
                  {translate({
                    zh: "随时可切换或续订，会员权益在有效期内持续生效。",
                    en: "Switch or renew anytime. Benefits remain active through the term.",
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {MEMBERSHIP_PLANS.map((plan) => {
                    const isSelected = plan.id === selectedPlanId;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`text-left rounded-xl border p-5 transition shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/60 ${
                          isSelected ? "border-primary ring-1 ring-primary" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-xl font-semibold">
                            {translate(plan.headline)}
                          </h3>
                          {plan.highlight && (
                            <Badge variant="secondary" className="text-xs">
                              {translate(plan.highlight)}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-muted-foreground text-sm">
                          {translate(plan.description)}
                        </p>
                        <div className="mt-4 flex items-end gap-2">
                          <span className="text-2xl font-bold text-primary">
                            {translate(plan.priceLabel)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {translate(plan.billing)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  {translate({ zh: "会员权益", en: "Membership perks" })}
                </CardTitle>
                <CardDescription>
                  {translate({
                    zh: "支付成功后立即生效，若未成功扣款将不会开通。",
                    en: "Perks activate right after a successful payment.",
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/40 text-sm leading-relaxed">
                  <ul className="space-y-3">
                    <li>
                      <span className="font-semibold text-foreground">
                        {translate({ zh: "无限制 AI 生图", en: "Unlimited AI generations" })}
                      </span>
                      <p className="text-muted-foreground text-xs mt-1">
                        {translate({
                          zh: "不限次数激发灵感，随时输出高清设计结果。",
                          en: "Generate high-quality designs without worrying about quotas.",
                        })}
                      </p>
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">
                        {translate({ zh: "会员素材模板", en: "Members-only assets" })}
                      </span>
                      <p className="text-muted-foreground text-xs mt-1">
                        {translate({
                          zh: "精选字体、贴纸与预设布局持续更新。",
                          en: "Access curated fonts, stickers, and layouts updated regularly.",
                        })}
                      </p>
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">
                        {translate({ zh: "优先客服", en: "Priority support" })}
                      </span>
                      <p className="text-muted-foreground text-xs mt-1">
                        {translate({
                          zh: "会员专席快速响应，问题即刻跟进。",
                          en: "Fast-track support lane for members when you need help.",
                        })}
                      </p>
                    </li>
                  </ul>
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {translate({ zh: "当前选择", en: "Selected plan" })}
                    </span>
                    <span className="font-semibold text-foreground">
                      {translate(selectedPlan.headline)} · {translate(selectedPlan.priceLabel)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {translate({ zh: "结算周期", en: "Billing cycle" })}
                    </span>
                    <span className="text-foreground">
                      {translate(selectedPlan.billing)}
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePurchase}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {translate({ zh: "正在处理...", en: "Processing..." })}
                    </span>
                  ) : (
                    translate({ zh: "确认支付并开通", en: "Confirm payment" })
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  {translate({
                    zh: "点击即表示你同意会员条款，支付成功后立即生效。",
                    en: "By continuing you agree to the membership terms. Activation is immediate after payment.",
                  })}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {translate({ zh: "会员状态", en: "Membership status" })}
              </CardTitle>
              <CardDescription>
                {translate({
                  zh: "随时查看当前会员有效期与订单信息。",
                  en: "Review your active membership and expiry details here.",
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingStatus ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {translate({ zh: "加载中...", en: "Loading..." })}
                </div>
              ) : membership ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {translate({ zh: "会员计划", en: "Plan" })}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {translate(
                        MEMBERSHIP_PLANS.find((plan) => plan.id === membership.plan_id)?.headline || {
                          zh: membership.plan_id,
                          en: membership.plan_id,
                        }
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {translate({ zh: "有效期至", en: "Valid until" })}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatDateTime(membership.expires_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {translate({ zh: "扣费金额", en: "Amount" })}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {membership.currency} {Number(membership.amount ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {translate({ zh: "状态", en: "Status" })}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                        isMembershipActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {isMembershipActive
                        ? translate({ zh: "已激活", en: "Active" })
                        : translate({ zh: "已过期", en: "Expired" })}
                    </span>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-muted-foreground">
                      {translate({ zh: "支付流水号", en: "Payment reference" })}
                    </p>
                    <p className="font-mono text-sm text-foreground break-all">
                      {membership.transaction_id}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {translate({ zh: "尚未开通会员，选择方案即可立即启用。", en: "No active membership yet. Pick a plan to get started." })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground">
            <Link href="/profile" className="text-primary hover:underline">
              {translate({ zh: "返回个人资料", en: "Back to profile" })}
            </Link>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
