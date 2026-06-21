"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Gift,
  ImageIcon,
  Loader2,
  Sparkles,
  TicketPercent,
  X,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useLanguage } from "@/contexts/language-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import apiClient, { getFriendlyApiErrorSummary } from "@/lib/api-client";

interface MembershipRecord {
  id: number;
  user_id: number;
  plan_id: string;
  amount: number;
  balance?: number;
  ai_credits?: number;
  currency: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  transaction_id: string;
  provider?: string | null;
  raw_payload?: any;
}

interface MembershipTransaction {
  id: number;
  user_id: number;
  delta: number;
  balance_after: number;
  currency: string;
  type: string;
  reference_id?: string | null;
  raw_payload?: any;
  created_at: string;
}

interface PlanFromApi {
  id: string;
  label: string;
  amount: number;
  clothingBalance: number;
  aiCredits: number;
  currency: string;
  durationDays: number;
  discountRate: number;
  equivalents: {
    localImages: number;
    tryOns: number;
    apiStandardImages: number;
  };
}

const FALLBACK_PLANS: PlanFromApi[] = [
  {
    id: "monthly",
    label: "月度会员",
    amount: 188,
    clothingBalance: 188,
    aiCredits: 300,
    currency: "CNY",
    durationDays: 30,
    discountRate: 0,
    equivalents: { localImages: 50, tryOns: 25, apiStandardImages: 10 },
  },
  {
    id: "quarterly",
    label: "季度会员",
    amount: 535.8,
    clothingBalance: 535.8,
    aiCredits: 945,
    currency: "CNY",
    durationDays: 90,
    discountRate: 0.05,
    equivalents: { localImages: 157, tryOns: 78, apiStandardImages: 33 },
  },
  {
    id: "half-year",
    label: "半年会员",
    amount: 1015.2,
    clothingBalance: 1015.2,
    aiCredits: 1980,
    currency: "CNY",
    durationDays: 180,
    discountRate: 0.1,
    equivalents: { localImages: 330, tryOns: 165, apiStandardImages: 70 },
  },
  {
    id: "yearly",
    label: "年度会员",
    amount: 1917.6,
    clothingBalance: 1917.6,
    aiCredits: 4140,
    currency: "CNY",
    durationDays: 365,
    discountRate: 0.15,
    equivalents: { localImages: 690, tryOns: 345, apiStandardImages: 147 },
  },
];

const FALLBACK_COSTS = {
  localImage: 6,
  localHdImage: 10,
  virtualTryon: 12,
  apiStandardImage: 28,
  apiPremiumImage: 48,
};

const PLAN_TONE: Record<string, { surface: string; border: string; glow: string; badge: string }> = {
  monthly: {
    surface: "bg-[#f7eddc]",
    border: "border-[#15120e]/16",
    glow: "from-[#d7a64b]/14 to-transparent",
    badge: "bg-[#15120e] text-[#f4ecdc]",
  },
  quarterly: {
    surface: "bg-[#f1dfcd]",
    border: "border-[#b73522]/55",
    glow: "from-[#b73522]/18 to-transparent",
    badge: "bg-[#b73522] text-white",
  },
  "half-year": {
    surface: "bg-[#e2e9d8]",
    border: "border-[#1f6f62]/55",
    glow: "from-[#1f6f62]/16 to-transparent",
    badge: "bg-[#e0b45a] text-[#15120e]",
  },
  yearly: {
    surface: "bg-[#ead9a8]",
    border: "border-[#d7a64b]/65",
    glow: "from-[#d7a64b]/24 to-transparent",
    badge: "bg-[#d7a64b] text-[#15120e]",
  },
};

const formatPrice = (value: number) => `¥${Number(value || 0).toFixed(value % 1 === 0 ? 0 : 2)}`;
const formatCredits = (value: number) => `${Math.floor(Number(value || 0)).toLocaleString("zh-CN")}`;
const monthsForPlan = (plan: PlanFromApi) => Math.max(1, Math.round(plan.durationDays / 30));
const originalPrice = (plan: PlanFromApi) => 188 * monthsForPlan(plan);
const monthlyPrice = (plan: PlanFromApi) => plan.amount / monthsForPlan(plan);
const discountLabel = (plan: PlanFromApi) => {
  if (!plan.discountRate) return "基础价";
  return `限时 ${(10 - plan.discountRate * 10).toFixed(1).replace(".0", "")} 折`;
};

export default function MembershipPage() {
  const { translate } = useLanguage();
  const [plans, setPlans] = useState<PlanFromApi[]>(FALLBACK_PLANS);
  const [costs, setCosts] = useState(FALLBACK_COSTS);
  const [selectedPlanId, setSelectedPlanId] = useState("quarterly");
  const [membership, setMembership] = useState<MembershipRecord | null>(null);
  const [transactions, setTransactions] = useState<MembershipTransaction[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [totalInvites, setTotalInvites] = useState(0);
  const [totalRewards, setTotalRewards] = useState(0);
  const [activeFaq, setActiveFaq] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || plans[0],
    [plans, selectedPlanId]
  );

  const orderedPlans = useMemo(() => {
    const rank = ["monthly", "quarterly", "half-year", "yearly"];
    return [...plans].sort((a, b) => rank.indexOf(a.id) - rank.indexOf(b.id));
  }, [plans]);

  const aiRows = useMemo(
    () => [
      { label: "本地普通生图", unit: "张", cost: costs.localImage, icon: ImageIcon },
      { label: "本地高清细化", unit: "张", cost: costs.localHdImage, icon: Sparkles },
      { label: "CatVTON 虚拟试衣", unit: "次", cost: costs.virtualTryon, icon: Crown },
      { label: "API 标准模型", unit: "张", cost: costs.apiStandardImage, icon: Sparkles },
      { label: "API 高级模型", unit: "张", cost: costs.apiPremiumImage, icon: Sparkles },
    ],
    [costs]
  );

  const faqItems = [
    {
      title: "服装余额和 AI credits 有什么区别？",
      body: "服装余额用于抵扣实际 T 恤订单，AI credits 用于本地生图、高清细化、API 模型和虚拟试衣。两套额度分开扣，避免赠送额度影响实物成本。",
    },
    {
      title: "为什么不是无限生图？",
      body: "不同模型成本差异很大，尤其 API 模型和试衣会带来真实 GPU/API 成本。改成 credits 后，用户能提前知道可用次数，平台也能稳定运营。",
    },
    {
      title: "会员金额可以提现吗？",
      body: "当前会员金额作为站内服装余额使用，可用于购买 YITUAI 的实际衣服，不作为现金提现。",
    },
    {
      title: "AI credits 用完了怎么办？",
      body: "可以续开任意会员套餐，新的服装余额和 AI credits 会叠加到账。后续也可以单独增加 AI credits 补充包。",
    },
    {
      title: "邀请好友有什么用？",
      body: "邀请码用于给好友开通优惠和记录邀请关系。当前页面会展示邀请码、邀请人数和累计奖励，后续可继续接入优惠券或 AI credits 奖励。",
    },
  ];

  useEffect(() => {
    const loadMembershipPage = async () => {
      try {
        setIsLoading(true);
        const [plansPayload, membershipPayload, txPayload, referralPayload] = await Promise.allSettled([
          apiClient.getMembershipPlans(),
          apiClient.getMembership(),
          apiClient.getMembershipTransactions(60),
          apiClient.getReferralMe(),
        ]);

        if (plansPayload.status === "fulfilled") {
          setPlans(plansPayload.value.plans?.length ? plansPayload.value.plans : FALLBACK_PLANS);
          setCosts(plansPayload.value.aiCreditCosts || FALLBACK_COSTS);
        }
        if (membershipPayload.status === "fulfilled") {
          setMembership(membershipPayload.value.membership ?? null);
        }
        if (txPayload.status === "fulfilled") {
          setTransactions(txPayload.value.transactions ?? []);
        }
        if (referralPayload.status === "fulfilled") {
          setInviteCode(referralPayload.value.invite_code || "");
          setTotalInvites(Number(referralPayload.value.total_invites || 0));
          setTotalRewards(Number(referralPayload.value.total_rewards || 0));
        }
      } catch (error) {
        const fallback = translate({ zh: "会员信息加载失败，请稍后再试", en: "Unable to load membership data." });
        setErrorMessage(getFriendlyApiErrorSummary(error, { zh: fallback, en: fallback }, "zh"));
      } finally {
        setIsLoading(false);
      }
    };

    loadMembershipPage();
  }, [translate]);

  const handlePurchase = async (plan: PlanFromApi) => {
    if (isProcessing) return;
    setSelectedPlanId(plan.id);
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const paymentReference = `demo-${plan.id}-${Date.now()}`;
      await apiClient.activateMembership({
        planId: plan.id,
        paymentReference,
        provider: "mock",
        rawPayload: {
          source: "membership-page",
          clothingBalance: plan.clothingBalance,
          aiCredits: plan.aiCredits,
        },
      });

      const [membershipPayload, txPayload] = await Promise.all([
        apiClient.getMembership(),
        apiClient.getMembershipTransactions(60),
      ]);
      setMembership(membershipPayload.membership ?? null);
      setTransactions(txPayload.transactions ?? []);
      setSuccessMessage(
        `已开通${plan.label}：服装余额 ${formatPrice(plan.clothingBalance)}，AI credits ${formatCredits(plan.aiCredits)} 已到账。`
      );
    } catch (error) {
      const fallback = translate({ zh: "会员开通失败，请稍后再试", en: "Membership activation failed." });
      setErrorMessage(getFriendlyApiErrorSummary(error, { zh: fallback, en: fallback }, "zh"));
    } finally {
      setIsProcessing(false);
    }
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setSuccessMessage("邀请码已复制");
    } catch {
      setErrorMessage("复制失败，请手动复制邀请码");
    }
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "不过期";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const transactionTitle = (tx: MembershipTransaction) => {
    switch (tx.type) {
      case "membership_purchase":
        return "服装余额入账";
      case "ai_credit_grant":
        return "AI credits 入账";
      case "ai_credit_debit":
        return "AI 生成消耗";
      case "order_payment":
        return "购买衣服扣款";
      case "balance_credit":
        return "奖励入账";
      default:
        return tx.type;
    }
  };

  return (
    <AuthGuard requireAuth>
      <main className="yituai-public-surface min-h-screen overflow-hidden text-[#15120e]">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_4%,rgba(183,53,34,.14),transparent_30rem),radial-gradient(circle_at_10%_36%,rgba(31,111,98,.10),transparent_28rem),linear-gradient(90deg,rgba(21,18,14,.045)_1px,transparent_1px)] [background-size:auto,auto,84px_84px]" />
        <div className="relative mx-auto max-w-[1500px] px-4 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4 border-b border-[#15120e]/12 pb-5">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#15120e]/70 transition hover:text-[#15120e]">
              <ArrowLeft className="h-4 w-4" />
              返回 YITUAI
            </Link>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-xs text-[#15120e]/48">当前服装余额</p>
                <p className="font-semibold">{formatPrice(Number(membership?.balance ?? 0))}</p>
              </div>
              <div className="h-8 w-px bg-[#15120e]/12" />
              <div>
                <p className="text-xs text-[#15120e]/48">AI credits</p>
                <p className="font-semibold">{formatCredits(Number(membership?.ai_credits ?? 0))}</p>
              </div>
            </div>
          </header>

          <section className="grid gap-8 py-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:py-14">
            <div className="relative z-10">
              <div className="mb-6 inline-grid h-20 w-20 rotate-[-8deg] place-items-center rounded-[26%_18%_24%_20%] bg-[#b73522] font-serif text-2xl font-black text-[#f4ecdc] shadow-2xl shadow-[#b73522]/25">
                会籍
              </div>
              <Badge className="mb-5 rounded-full border border-[#15120e]/15 bg-white/40 px-4 py-2 text-[#15120e] hover:bg-white/40">
                <Sparkles className="mr-2 h-4 w-4 text-[#b73522]" />
                会员金额可买衣服，AI 额度额外送
              </Badge>
              <h1 className="max-w-3xl font-serif text-[clamp(3.8rem,8vw,8rem)] font-black leading-[0.9] tracking-normal">
                YITUAI 创作会员
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-9 text-[#15120e]/70">
                把会员做成一张清楚的创作账本：支付金额沉淀为服装余额，可直接购买实际衣服；额外赠送 AI credits，用来生图、高清细化、API 模型和虚拟试衣。
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <div className="inline-flex rounded-full border border-[#15120e]/15 bg-[#eadcc2]/72 p-1 shadow-[0_18px_44px_rgba(21,18,14,0.10)]">
                  <button className="rounded-full bg-[#15120e] px-6 py-3 text-sm font-semibold text-[#f4ecdc]">
                    创作会员
                  </button>
                  <button className="rounded-full px-6 py-3 text-sm font-semibold text-[#15120e]/50">
                    团队版会员
                  </button>
                </div>
                <Button variant="outline" className="rounded-full border-[#15120e]/20 bg-white/35 px-6 text-[#15120e] hover:bg-white/60">
                  每往上一层优惠 5%
                </Button>
              </div>
            </div>

            <div className="relative min-h-[460px] overflow-hidden border border-[#15120e]/16 bg-[#15120e] shadow-[0_34px_90px_rgba(21,18,14,0.24)] lg:min-h-[610px]">
              <NextImage
                src="/page-heroes/hero-membership-premium-room.png"
                alt="YITUAI 会员创作空间"
                fill
                priority
                sizes="(min-width: 1024px) 54vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_42%,rgba(21,18,14,.74)),repeating-linear-gradient(90deg,rgba(255,255,255,.07)_0_1px,transparent_1px_24px)]" />
              <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-3">
                <div className="border border-[#f4ecdc]/24 bg-[#15120e]/62 p-4 text-[#f4ecdc] backdrop-blur">
                  <p className="text-xs text-[#f4ecdc]/60">服装余额</p>
                  <p className="mt-1 text-2xl font-black">{formatPrice(Number(membership?.balance ?? 0))}</p>
                </div>
                <div className="border border-[#f4ecdc]/24 bg-[#15120e]/62 p-4 text-[#f4ecdc] backdrop-blur">
                  <p className="text-xs text-[#f4ecdc]/60">AI credits</p>
                  <p className="mt-1 text-2xl font-black">{formatCredits(Number(membership?.ai_credits ?? 0))}</p>
                </div>
                <div className="border border-[#f4ecdc]/24 bg-[#b73522]/82 p-4 text-white backdrop-blur">
                  <p className="text-xs text-white/70">权益结构</p>
                  <p className="mt-1 text-base font-black">买衣服 + 赠创作额度</p>
                </div>
              </div>
            </div>
          </section>

          {successMessage && (
            <Alert className="mt-8 rounded-md border-emerald-500/50 bg-emerald-500/10 text-emerald-100">
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}
          {errorMessage && (
            <Alert className="mt-8 rounded-md border-red-400/50 bg-red-500/10 text-red-100">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="mt-10 border border-[#15120e]/14 bg-[#efe3cf]/88 px-4 py-8 text-[#15120e] shadow-[0_30px_82px_rgba(21,18,14,0.14)] backdrop-blur sm:px-6 lg:px-8">
          <section className="grid gap-4 lg:grid-cols-4">
            {orderedPlans.map((plan) => {
              const tone = PLAN_TONE[plan.id] || PLAN_TONE.monthly;
              const active = selectedPlanId === plan.id;
              const unavailable = isProcessing && active;
              const benefitLines = [
                `服装余额 ${formatPrice(plan.clothingBalance)}`,
                `赠 ${formatCredits(plan.aiCredits)} AI credits`,
                `本地生图约 ${plan.equivalents.localImages} 张`,
                `虚拟试衣约 ${plan.equivalents.tryOns} 次`,
                `API 标准图约 ${plan.equivalents.apiStandardImages} 张`,
              ];
              const featureLines = [
                "生图/试衣按 credits 明细扣除",
                "余额流水和 AI 流水分开记录",
                "会员有效期内权益持续可用",
                plan.id === "monthly" ? "适合先体验创作流程" : "适合持续创作和上新",
              ];

              return (
                <article
                  key={plan.id}
                  className={`relative overflow-hidden rounded-md border ${tone.border} ${tone.surface} p-7 shadow-[0_20px_60px_rgba(21,18,14,0.12)] ${
                    active ? "ring-2 ring-[#b73522]/65" : ""
                  }`}
                >
                  <div className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b ${tone.glow}`} />
                  <div className="relative">
                    <div className="flex min-h-10 items-start justify-between gap-4">
                      <h2 className="text-2xl font-semibold">{plan.label}</h2>
                      <span className={`rounded-md px-3 py-2 text-sm font-semibold ${tone.badge}`}>
                        {discountLabel(plan)}
                      </span>
                    </div>

                    <div className="mt-7">
                      <div className="flex items-end gap-2">
                        <span className="text-base text-[#15120e]/70">¥</span>
                        <span className="text-6xl font-semibold leading-none">{formatPrice(plan.amount).replace("¥", "")}</span>
                        <span className="pb-2 text-lg text-[#15120e]/70">/{monthsForPlan(plan) === 1 ? "月" : `${monthsForPlan(plan)}个月`}</span>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-[#15120e]/58">
                        <p>
                          原价 <span className="line-through">{formatPrice(originalPrice(plan))}</span>
                          {plan.discountRate > 0 ? ` · 已省 ${formatPrice(originalPrice(plan) - plan.amount)}` : " · 基础套餐"}
                        </p>
                        <p>{formatPrice(monthlyPrice(plan))}/月 · 支付金额可直接买衣服</p>
                      </div>
                    </div>

                    <div className="mt-10 rounded-full bg-[#15120e]/10 p-1">
                      <div className="rounded-full bg-[#15120e] px-4 py-3 text-center text-sm font-semibold text-[#f4ecdc]">
                        {formatCredits(plan.aiCredits)} credits
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-[#15120e]/62">
                      最多生成约 {plan.equivalents.localImages} 张本地图 | {plan.equivalents.tryOns} 次试衣
                    </p>

                    <Button
                      className={`mt-5 h-12 w-full rounded-full text-base font-semibold ${
                        plan.id === "yearly"
                          ? "bg-[#b73522] text-white hover:bg-[#9f2e1f]"
                          : "bg-[#15120e] text-[#f4ecdc] hover:bg-[#3b2a1d]"
                      }`}
                      onClick={() => handlePurchase(plan)}
                      disabled={isProcessing}
                    >
                      {unavailable ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      立即开通
                    </Button>

                    <div className="mt-8">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-[#b73522]">
                        <Gift className="h-4 w-4" />
                        套餐包含
                      </h3>
                      <ul className="mt-4 space-y-3 border-b border-[#15120e]/12 pb-6">
                        {benefitLines.map((line) => (
                          <li key={line} className="flex gap-3 text-sm font-medium text-[#15120e]/82">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#b73522]" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-6">
                      <h3 className="text-base font-semibold">权益说明</h3>
                      <ul className="mt-4 space-y-3">
                        {featureLines.map((line) => (
                          <li key={line} className="flex gap-3 text-sm font-medium text-[#15120e]/82">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1f6f62]" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-md border border-[#15120e]/12 bg-[#f8f0df]/72 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">邀请好友</h2>
                  <p className="mt-1 text-sm text-[#15120e]/58">好友开通后可继续接入优惠券或 AI credits 奖励。</p>
                </div>
                <TicketPercent className="h-6 w-6 text-[#b73522]" />
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-[#15120e]/12 bg-[#eadcc2]/72 p-4">
                <div>
                  <p className="text-xs text-[#15120e]/48">我的邀请码</p>
                  <p className="mt-1 font-mono text-2xl font-semibold">{inviteCode || "加载中"}</p>
                </div>
                <Button type="button" variant="outline" className="rounded-md border-[#15120e]/18 bg-white/35 text-[#15120e] hover:bg-white/60" onClick={copyInviteCode} disabled={!inviteCode}>
                  <Copy className="mr-2 h-4 w-4" />
                  复制
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-[#15120e]/12 bg-white/38 p-4">
                  <p className="text-sm text-[#15120e]/48">已邀请</p>
                  <p className="mt-1 text-3xl font-semibold">{totalInvites}</p>
                </div>
                <div className="rounded-md border border-[#15120e]/12 bg-white/38 p-4">
                  <p className="text-sm text-[#15120e]/48">累计奖励</p>
                  <p className="mt-1 text-3xl font-semibold">{formatPrice(totalRewards)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-[#15120e]/12 bg-[#f8f0df]/72 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">当前账户</h2>
                  <p className="mt-1 text-sm text-[#15120e]/58">服装余额和 AI credits 分开展示，避免实物成本和赠送额度混用。</p>
                </div>
                <Badge className="rounded-md bg-[#15120e] text-[#f4ecdc]">{membership?.status === "active" ? "已激活" : "待开通"}</Badge>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-[#15120e]/12 bg-white/38 p-4">
                  <p className="text-sm text-[#15120e]/48">服装余额</p>
                  <p className="mt-2 text-3xl font-semibold">{formatPrice(Number(membership?.balance ?? 0))}</p>
                </div>
                <div className="rounded-md border border-[#15120e]/12 bg-white/38 p-4">
                  <p className="text-sm text-[#15120e]/48">AI credits</p>
                  <p className="mt-2 text-3xl font-semibold">{formatCredits(Number(membership?.ai_credits ?? 0))}</p>
                </div>
                <div className="rounded-md border border-[#15120e]/12 bg-white/38 p-4">
                  <p className="text-sm text-[#15120e]/48">有效期至</p>
                  <p className="mt-2 text-lg font-semibold">{formatDate(membership?.expires_at).slice(0, 10)}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24">
            <h2 className="text-center text-3xl font-semibold">每月生成数量</h2>
            <div className="mt-12 overflow-x-auto rounded-md border border-[#15120e]/12 bg-[#f8f0df]/72">
              <table className="min-w-[980px] w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#15120e]/8 text-[#15120e]/58">
                    <th className="w-[260px] px-6 py-5 text-sm font-semibold">模型能力（含参数）</th>
                    {orderedPlans.map((plan) => (
                      <th key={plan.id} className="px-6 py-5 text-sm font-semibold">
                        {plan.label} {formatCredits(plan.aiCredits)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiRows.map((row, index) => {
                    const Icon = row.icon;
                    return (
                      <tr key={row.label} className={index % 2 === 0 ? "bg-[#f8f0df]/85" : "bg-[#eadcc2]/60"}>
                        <td className="px-6 py-6">
                          <div className="flex items-center gap-3 font-semibold text-[#15120e]/76">
                            <Icon className="h-5 w-5 text-[#b73522]" />
                            {row.label}
                            <span className="text-xs text-[#15120e]/42">{row.cost} credits/{row.unit}</span>
                          </div>
                        </td>
                        {orderedPlans.map((plan) => (
                          <td key={plan.id} className="px-6 py-6 text-lg font-semibold">
                            {Math.floor(plan.aiCredits / row.cost).toLocaleString("zh-CN")} <span className="text-sm font-normal text-[#15120e]/48">{row.unit}</span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-5 text-sm text-[#15120e]/48">
              生成次数为按当前后端扣点规则估算的上限，实际消耗以后端返回的 creditsCharged 和会员流水为准。
            </p>
          </section>

          <section className="mt-20 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <h2 className="text-3xl font-semibold">最近流水</h2>
              <div className="mt-8 rounded-md border border-[#15120e]/12 bg-[#f8f0df]/72">
                {isLoading ? (
                  <div className="flex items-center gap-2 p-6 text-[#15120e]/58">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中...
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="p-6 text-sm text-[#15120e]/58">暂无流水</p>
                ) : (
                  transactions.slice(0, 8).map((tx) => {
                    const isCredit = tx.currency === "CREDIT" || tx.type.startsWith("ai_credit");
                    return (
                      <div key={tx.id} className="flex items-center justify-between gap-4 border-b border-[#15120e]/12 px-6 py-4 last:border-b-0">
                        <div>
                          <p className="font-semibold">{transactionTitle(tx)}</p>
                          <p className="mt-1 text-xs text-[#15120e]/42">{formatDate(tx.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className={Number(tx.delta) >= 0 ? "font-semibold text-[#1f6f62]" : "font-semibold text-[#b73522]"}>
                            {Number(tx.delta) >= 0 ? "+" : ""}
                            {Number(tx.delta).toFixed(isCredit ? 0 : 2)} {isCredit ? "credits" : tx.currency}
                          </p>
                          <p className="mt-1 text-xs text-[#15120e]/42">余额 {Number(tx.balance_after).toFixed(isCredit ? 0 : 2)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-semibold">常见问题</h2>
              <div className="mt-8 rounded-md border border-[#15120e]/12 bg-[#f8f0df]/72">
                {faqItems.map((item, index) => {
                  const open = activeFaq === index;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setActiveFaq(open ? -1 : index)}
                      className="block w-full border-b border-[#15120e]/12 px-6 py-5 text-left last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold">{item.title}</p>
                        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                      </div>
                      {open && <p className="mt-4 text-sm leading-6 text-[#15120e]/58">{item.body}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          </div>

          <footer className="mt-10 border-t border-[#15120e]/12 py-8 text-center text-sm text-[#15120e]/50">
            <Link href="/profile" className="font-semibold hover:text-[#15120e]">返回个人中心</Link>
          </footer>
        </div>

        <Link
          href="/"
          aria-label="关闭会员页"
          className="fixed right-6 top-6 z-20 rounded-full border border-[#15120e]/12 bg-[#f4ecdc]/80 p-3 text-[#15120e]/75 shadow-[0_18px_44px_rgba(21,18,14,0.14)] backdrop-blur transition hover:bg-[#15120e] hover:text-[#f4ecdc]"
        >
          <X className="h-5 w-5" />
        </Link>
      </main>
    </AuthGuard>
  );
}
