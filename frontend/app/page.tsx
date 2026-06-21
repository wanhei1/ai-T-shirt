"use client";
/* 主页 */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowRight,
  Crown,
  Palette,
  Sparkles,
  Star,
  Type,
  Upload,
} from "lucide-react";
import { ApiConnectionTest } from "@/components/api-connection-test";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import type { ApiClientError } from "@/lib/api-client";
import { apiClient } from "@/lib/api-client";

type MembershipRecord = {
  plan_id: string;
  status?: string;
  expires_at?: string | null;
};

type OrderRecord = {
  id: number | string;
  created_at: string;
  status?: string;
  has_front_image?: boolean | null;
  has_back_image?: boolean | null;
};

type HomeImage = {
  src: string;
  alt: string;
};

const HOME_ASSET = "/home-shanhaijing";

const images = {
  hero: `${HOME_ASSET}/hero-models.png`,
  female: `${HOME_ASSET}/female-model.png`,
  male: `${HOME_ASSET}/male-model.png`,
  product: `${HOME_ASSET}/product-flatlay.png`,
  tryon: `${HOME_ASSET}/tryon-models.png`,
  choose: `${HOME_ASSET}/choose-garment.png`,
  studio: `${HOME_ASSET}/design-studio.png`,
  package: `${HOME_ASSET}/package-delivery.png`,
  customer: `${HOME_ASSET}/customer-story.png`,
  fabric: `${HOME_ASSET}/fabric-detail.png`,
  patterns: `${HOME_ASSET}/myth-patterns.png`,
};

const formatPrice = (amount: number) => `¥${amount.toFixed(2)}`;

export default function HomePage() {
  const { user, logout } = useAuth();
  const { translate } = useLanguage();
  const [isHydrated, setIsHydrated] = useState(false);
  const [membership, setMembership] = useState<MembershipRecord | null>(null);
  const [isLoadingMembership, setIsLoadingMembership] = useState(false);
  const [myOrders, setMyOrders] = useState<OrderRecord[] | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMembership = async () => {
      if (!user) {
        setMembership(null);
        return;
      }

      try {
        setIsLoadingMembership(true);
        const { apiClient: membershipClient } = await import("@/lib/api-client");
        const response = await membershipClient.getMembership();
        if (isMounted) {
          setMembership(response.membership || null);
        }
      } catch (error) {
        if (isMounted) {
          const err = error as ApiClientError;
          console.warn("Failed to fetch membership", {
            message: err?.message,
            code: err?.code,
            requestId: err?.requestId,
          });
          setMembership(null);
        }
      } finally {
        if (isMounted) {
          setIsLoadingMembership(false);
        }
      }
    };

    loadMembership();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    const loadOrders = async () => {
      if (!user) {
        setMyOrders(null);
        return;
      }

      try {
        setIsLoadingOrders(true);
        const { apiClient: ordersClient } = await import("@/lib/api-client");
        const response = await ordersClient.getOrderSummaries(10);
        if (isMounted) {
          setMyOrders((response.orders || []) as OrderRecord[]);
        }
      } catch (error) {
        if (!isMounted) return;

        const err = error as ApiClientError;
        if (err?.status === 401) {
          logout();
          setMyOrders(null);
        } else {
          console.warn("Failed to fetch orders", {
            message: err?.message,
            code: err?.code,
            requestId: err?.requestId,
          });
          setMyOrders([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingOrders(false);
        }
      }
    };

    loadOrders();
    return () => {
      isMounted = false;
    };
  }, [user, logout]);

  const hasActiveMembership = useMemo(() => {
    if (!membership) return false;
    if (membership.status && membership.status !== "active") return false;
    if (!membership.expires_at) return true;
    return new Date(membership.expires_at).getTime() >= Date.now();
  }, [membership]);

  const shouldShowMembershipAd = useMemo(() => {
    if (!user) return true;
    if (isLoadingMembership) return false;
    return !hasActiveMembership;
  }, [user, isLoadingMembership, hasActiveMembership]);

  const getOrderPreviews = (order?: OrderRecord | null) => ({
    hasFront: !!order?.has_front_image,
    hasBack: !!order?.has_back_image,
  });

  const loopOrders = useMemo(() => {
    if (!myOrders || myOrders.length === 0) return [] as OrderRecord[];
    return [...myOrders, ...myOrders, ...myOrders];
  }, [myOrders]);

  const showcaseCount = myOrders?.length ?? 0;
  const useMarquee = showcaseCount >= 6;
  const marqueeDuration = useMemo(() => {
    if (!myOrders || myOrders.length === 0) return 20;
    return Math.max(18, myOrders.length * 4);
  }, [myOrders]);

  const featureCards = [
    {
      icon: Sparkles,
      image: images.patterns,
      title: translate({ zh: "山海经 AI 图案", en: "Shan Hai Jing AI Graphics" }),
      description: translate({
        zh: "从应龙、九尾、鲲鹏到云雷纹，把中国神话做成适合 T 恤印花的现代图案。",
        en: "Turn Chinese mythology into modern, wearable T-shirt graphics.",
      }),
    },
    {
      icon: Type,
      image: images.studio,
      title: translate({ zh: "文字与落款", en: "Typography & Seals" }),
      description: translate({
        zh: "国风字体、朱印落款、图文排版都能在编辑器里自由组合。",
        en: "Compose Chinese typography, seal marks, and artwork in the editor.",
      }),
    },
    {
      icon: Upload,
      image: images.fabric,
      title: translate({ zh: "高质感成衣", en: "Premium Garments" }),
      description: translate({
        zh: "围绕真实面料、领口、印花细节展示，让用户相信它不是普通样机。",
        en: "Show fabric, collar, and print details so the product feels tangible.",
      }),
    },
  ];

  const processSteps = [
    {
      image: images.choose,
      title: translate({ zh: "选版型", en: "Choose Fit" }),
      description: translate({
        zh: "白 T、黑 T、重磅款、宽松款，先选适合中国用户日常穿搭的基础版型。",
        en: "Start with fits and colors made for everyday Chinese streetwear.",
      }),
    },
    {
      image: images.studio,
      title: translate({ zh: "生成图案", en: "Generate Art" }),
      description: translate({
        zh: "输入一句灵感，AI 生成山海经风格图案，再叠加文字、颜色和位置。",
        en: "Generate mythology-inspired artwork, then tune text, color, and placement.",
      }),
    },
    {
      image: images.package,
      title: translate({ zh: "下单交付", en: "Order & Deliver" }),
      description: translate({
        zh: "预览确认后直接下单，商品图、试衣图和订单状态保持完整闭环。",
        en: "Review, order, and keep product previews connected to the order flow.",
      }),
    },
  ];

  const lookbook: Array<HomeImage & { title: string; tag: string }> = [
    {
      src: images.female,
      alt: translate({ zh: "中国女模特穿山海经 T 恤", en: "Chinese female model in Shan Hai Jing T-shirt" }),
      title: translate({ zh: "女款宽松白 T", en: "Women Oversized Ivory Tee" }),
      tag: translate({ zh: "九尾狐 · 水墨", en: "Nine-tailed fox" }),
    },
    {
      src: images.product,
      alt: translate({ zh: "山海经 T 恤商品平铺", en: "Shan Hai Jing T-shirt flat lay" }),
      title: translate({ zh: "山海四象系列", en: "Four Mythic Beasts" }),
      tag: translate({ zh: "应龙 / 鲲鹏 / 玄鸟", en: "Yinglong / Kunpeng" }),
    },
    {
      src: images.male,
      alt: translate({ zh: "中国男模特穿黑金 T 恤", en: "Chinese male model in black gold T-shirt" }),
      title: translate({ zh: "男款黑金重磅", en: "Men Heavy Black Tee" }),
      tag: translate({ zh: "应龙 · 黑金", en: "Yinglong gold line" }),
    },
  ];

  const BASE_MONTHLY_AMOUNT = 198;
  const DISCOUNT_RATE = 0.85;
  const membershipPlans = [
    {
      id: "monthly",
      title: translate({ zh: "月度会员", en: "Monthly" }),
      price: translate({ zh: `${formatPrice(BASE_MONTHLY_AMOUNT)} / 月`, en: `${formatPrice(BASE_MONTHLY_AMOUNT)} / month` }),
    },
    {
      id: "quarterly",
      title: translate({ zh: "季度会员", en: "Quarterly" }),
      price: translate({
        zh: `${formatPrice(BASE_MONTHLY_AMOUNT * 3 * DISCOUNT_RATE)} / 季`,
        en: `${formatPrice(BASE_MONTHLY_AMOUNT * 3 * DISCOUNT_RATE)} / quarter`,
      }),
    },
    {
      id: "half-year",
      title: translate({ zh: "半年会员", en: "Half-Year" }),
      price: translate({
        zh: `${formatPrice(BASE_MONTHLY_AMOUNT * 6 * DISCOUNT_RATE)} / 半年`,
        en: `${formatPrice(BASE_MONTHLY_AMOUNT * 6 * DISCOUNT_RATE)} / half-year`,
      }),
    },
    {
      id: "yearly",
      title: translate({ zh: "年度会员", en: "Annual" }),
      price: translate({
        zh: `${formatPrice(BASE_MONTHLY_AMOUNT * 12 * DISCOUNT_RATE)} / 年`,
        en: `${formatPrice(BASE_MONTHLY_AMOUNT * 12 * DISCOUNT_RATE)} / year`,
      }),
    },
  ];

  const membershipBenefits = [
    translate({ zh: "AI 生成权益不限次，持续试出更好的中国风图案", en: "Unlimited AI generations for stronger China-inspired artwork" }),
    translate({ zh: "会员专属山海经素材、字体与版式持续更新", en: "Members-only mythology assets, fonts, and layouts" }),
    translate({ zh: "优先客服支持，订单与试衣问题更快响应", en: "Priority support for orders and try-on issues" }),
  ];

  const ctaPrimary = isHydrated && user
    ? translate({ zh: "继续设计", en: "Continue Designing" })
    : translate({ zh: "开始设计", en: "Start Designing" });
  const ctaHref = isHydrated && user ? "/design" : "/auth";

  return (
    <div className="home-shanhaijing min-h-screen overflow-hidden bg-[#f4ecdc] text-[#15120e]">
      {process.env.NODE_ENV === "development" && (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <ApiConnectionTest />
        </div>
      )}

      <main>
        <section className="relative mx-auto grid min-h-[calc(100vh-80px)] max-w-[1500px] grid-cols-1 items-center gap-10 px-4 py-10 md:px-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative z-10">
            <div className="mb-8 inline-grid h-20 w-20 rotate-[-8deg] place-items-center rounded-[26%_18%_24%_20%] bg-[#b73522] font-serif text-2xl font-black text-[#f4ecdc] shadow-2xl shadow-[#b73522]/25">
              山海
            </div>
            <Badge className="mb-5 rounded-full border border-[#15120e]/15 bg-white/35 px-4 py-2 text-[#15120e] hover:bg-white/35">
              <Sparkles className="mr-2 h-4 w-4 text-[#b73522]" />
              {translate({ zh: "给中国人的 AI 服装定制", en: "AI apparel for Chinese culture" })}
            </Badge>
            <h1 className="max-w-4xl font-serif text-[clamp(4rem,10vw,10.5rem)] font-black leading-[0.9] tracking-normal">
              {translate({ zh: "把山海经穿上身", en: "Wear the myths" })}
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-9 text-[#15120e]/72 md:text-xl">
              {translate({
                zh: "用 AI 把应龙、九尾、鲲鹏、云雷纹做成真正适合穿出门的 T 恤图案。这里不是空白模板站，而是一个有中国文化、有男女模特、有真实试衣结果的服装网站。",
                en: "Turn Chinese mythology into T-shirt graphics that feel wearable, premium, and real.",
              })}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full bg-[#15120e] px-8 text-[#f4ecdc] hover:bg-[#3b2a1d]">
                <Link href={ctaHref}>
                  {ctaPrimary}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-[#15120e] bg-transparent px-8">
                <Link href="/design">{translate({ zh: "试用演示", en: "Try Demo" })}</Link>
              </Button>
              <Button asChild size="lg" className="rounded-full bg-[#b73522] px-8 text-white hover:bg-[#9f2e1f]">
                <Link href="/shop">{translate({ zh: "进入商城", en: "Enter Shop" })}</Link>
              </Button>
            </div>

            {isHydrated && user && (
              <div className="mt-8 max-w-xl border border-[#15120e]/15 bg-white/40 p-5 shadow-[0_18px_60px_rgba(21,18,14,0.12)] backdrop-blur">
                <p className="text-[#15120e]/70">
                  {translate({ zh: "欢迎回来，", en: "Welcome back, " })}
                  <span className="font-bold text-[#15120e]">{user.username}</span>
                  {translate({ zh: "。你的设计台已经准备好。", en: ". Your design desk is ready." })}
                </p>
                <Button asChild variant="ghost" size="sm" className="mt-2 px-0 hover:bg-transparent">
                  <Link href="/profile">{translate({ zh: "查看个人资料", en: "View Profile" })}</Link>
                </Button>
              </div>
            )}
          </div>

          <div className="relative">
            <div className="relative min-h-[520px] overflow-hidden border border-[#15120e]/18 bg-[#15120e] shadow-[0_34px_90px_rgba(21,18,14,0.28)] lg:min-h-[720px]">
              <NextImage
                src={images.hero}
                alt={translate({ zh: "中国男女模特穿山海经 T 恤大片", en: "Chinese models wearing mythology T-shirts" })}
                fill
                priority
                sizes="(min-width: 1024px) 52vw, 100vw"
                className="object-cover opacity-95"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(0,0,0,.45)),repeating-linear-gradient(90deg,rgba(255,255,255,.08)_0_1px,transparent_1px_24px)]" />
              <div className="absolute bottom-5 right-5 max-w-xs border border-[#f4ecdc]/35 bg-[#15120e]/70 p-5 text-[#f4ecdc] backdrop-blur-xl">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#d7a64b]">Hero image</p>
                <p className="mt-2 text-sm leading-6 text-[#f4ecdc]/82">
                  {translate({ zh: "首屏固定使用中国男女模特，直接建立服装网站的真实感。", en: "Chinese male and female models make the apparel promise immediate." })}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[#15120e]/12 bg-[#eadcc2]/60">
          <div className="mx-auto grid max-w-[1500px] grid-cols-2 divide-x divide-y divide-[#15120e]/10 px-4 md:grid-cols-4 md:px-8">
            {["应龙", "九尾", "鲲鹏", "毕方"].map((item) => (
              <div key={item} className="min-h-28 p-5 font-serif text-3xl font-black md:text-4xl">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section id="process" className="bg-[#15120e] px-4 py-20 text-[#f4ecdc] md:px-8 md:py-28">
          <div className="mx-auto max-w-[1500px]">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7a64b]">How it works</p>
                <h2 className="mt-3 font-serif text-[clamp(3rem,7vw,7.5rem)] font-black leading-none">
                  {translate({ zh: "三步成衣", en: "From idea to tee" })}
                </h2>
              </div>
              <p className="max-w-2xl text-lg leading-8 text-[#f4ecdc]/72">
                {translate({
                  zh: "参考成熟服装站的图片节奏：每个关键流程都配一张图，让用户一路看到选款、设计、交付，而不是只读说明。",
                  en: "Every key step gets a visual: choose, design, deliver.",
                })}
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {processSteps.map((step, index) => (
                <article key={step.title} className="border border-[#f4ecdc]/15 bg-[#f4ecdc]/6">
                  <NextImage
                    src={step.image}
                    alt={step.title}
                    width={900}
                    height={540}
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="aspect-[16/10] w-full object-cover"
                  />
                  <div className="p-5">
                    <span className="font-serif text-5xl font-black text-[#d7a64b]">0{index + 1}</span>
                    <h3 className="mt-4 font-serif text-3xl font-black">{step.title}</h3>
                    <p className="mt-3 leading-7 text-[#f4ecdc]/70">{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="looks" className="mx-auto max-w-[1500px] px-4 py-20 md:px-8 md:py-28">
          <div className="mb-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b73522]">Seasonal looks</p>
              <h2 className="mt-3 max-w-4xl font-serif text-[clamp(3rem,7vw,7.5rem)] font-black leading-none">
                {translate({ zh: "男女都有，不只样机", en: "Real people, not just mockups" })}
              </h2>
            </div>
            <p className="max-w-xl text-lg leading-8 text-[#15120e]/68">
              {translate({
                zh: "主页图片要像服装品牌，而不是工具后台。男女模特、商品平铺、细节图和试衣图共同建立信任。",
                en: "The homepage should feel like a fashion brand: models, product flats, details, and try-on results.",
              })}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.88fr_1.18fr_0.88fr] lg:items-end">
            {lookbook.map((item, index) => (
              <article
                key={item.src}
                className={`group relative overflow-hidden border border-[#15120e]/15 bg-[#e6d4b8] shadow-[0_24px_70px_rgba(21,18,14,0.14)] ${index === 1 ? "lg:min-h-[690px]" : "lg:min-h-[540px]"}`}
              >
                <NextImage
                  src={item.src}
                  alt={item.alt}
                  width={900}
                  height={1120}
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className={`h-[520px] w-full object-cover transition duration-700 group-hover:scale-[1.03] ${index === 1 ? "lg:h-[690px]" : "lg:h-[540px]"}`}
                />
                <div className="absolute bottom-4 left-4 right-4 border border-[#15120e]/15 bg-[#f4ecdc]/90 p-4 backdrop-blur">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b73522]">{item.tag}</p>
                  <h3 className="mt-1 font-serif text-2xl font-black">{item.title}</h3>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="tryon" className="mx-auto grid max-w-[1500px] grid-cols-1 gap-8 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="relative min-h-[540px] overflow-hidden border border-[#15120e]/15 bg-[#e6d4b8] shadow-[0_28px_80px_rgba(21,18,14,0.16)]">
            <NextImage
              src={images.tryon}
              alt={translate({ zh: "男女中国模特 AI 试衣效果", en: "AI try-on result with Chinese models" })}
              fill
              sizes="(min-width: 1024px) 54vw, 100vw"
              className="object-cover"
            />
          </div>
          <div>
            <Badge className="mb-5 rounded-full border border-[#15120e]/15 bg-white/40 px-4 py-2 text-[#15120e] hover:bg-white/40">
              <Palette className="mr-2 h-4 w-4 text-[#1f6f62]" />
              {translate({ zh: "AI 试衣 + AI 生图", en: "AI try-on + AI artwork" })}
            </Badge>
            <h2 className="font-serif text-[clamp(3rem,7vw,7rem)] font-black leading-none">
              {translate({ zh: "先看上身，再决定下单", en: "See it on body first" })}
            </h2>
            <p className="mt-6 text-lg leading-9 text-[#15120e]/70">
              {translate({
                zh: "虚拟试衣不只是功能按钮，它应该在主页被看见。中国男女模特、不同版型和商品图连在一起，用户才会相信定制结果。",
                en: "Try-on should be visible on the homepage, connected to models, fits, and product imagery.",
              })}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                translate({ zh: "中国男/女模特", en: "Chinese models" }),
                translate({ zh: "同图案多版型", en: "Multi-fit previews" }),
                translate({ zh: "订单前确认", en: "Pre-order review" }),
              ].map((item) => (
                <div key={item} className="border border-[#15120e]/15 bg-white/35 p-4 font-bold">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-[#15120e]/10 bg-[#eadcc2]/55 px-4 py-20 md:px-8 md:py-28">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b73522]">Creative system</p>
                <h2 className="mt-3 font-serif text-[clamp(3rem,7vw,7rem)] font-black leading-none">
                  {translate({ zh: "图片要服务功能", en: "Visuals that explain features" })}
                </h2>
              </div>
              <p className="max-w-xl text-lg leading-8 text-[#15120e]/68">
                {translate({
                  zh: "功能仍是 AI 生成、文字、上传、试衣、下单；只是每个功能都用中国文化素材包装出来。",
                  en: "The same product features, expressed through China-first cultural assets.",
                })}
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {featureCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.title} className="border border-[#15120e]/15 bg-[#f4ecdc]/70">
                    <NextImage
                      src={card.image}
                      alt={card.title}
                      width={900}
                      height={540}
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="aspect-[16/10] w-full object-cover"
                    />
                    <div className="p-5">
                      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#15120e] text-[#f4ecdc]">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="font-serif text-3xl font-black">{card.title}</h3>
                      <p className="mt-3 leading-7 text-[#15120e]/68">{card.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1500px] px-4 py-20 md:px-8 md:py-28">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b73522]">Community</p>
              <h2 className="mt-3 font-serif text-[clamp(3rem,7vw,7rem)] font-black leading-none">
                {translate({ zh: "不像素材站，更像有人穿", en: "Made to be worn" })}
              </h2>
              <p className="mt-6 text-lg leading-9 text-[#15120e]/70">
                {translate({
                  zh: "主页需要出现真实人群感。后续可以继续生图：情侣、亲子、公司团建、城市青年、银发用户，让定制服装更接近中国人的生活场景。",
                  en: "The homepage needs people and lived scenarios, not only isolated product shots.",
                })}
              </p>
            </div>
            <div className="relative min-h-[520px] overflow-hidden border border-[#15120e]/15 bg-[#e6d4b8]">
              <NextImage
                src={images.customer}
                alt={translate({ zh: "中国用户穿定制 T 恤", en: "Chinese customers wearing custom T-shirts" })}
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        <section className="bg-[#15120e] px-4 py-20 text-[#f4ecdc] md:px-8 md:py-24">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7a64b]">Your designs</p>
                <h2 className="mt-3 font-serif text-[clamp(2.75rem,6vw,6rem)] font-black leading-none">
                  {translate({ zh: "我的设计展示区", en: "My design showcase" })}
                </h2>
              </div>
              <Button asChild variant="outline" className="rounded-full border-[#f4ecdc] bg-transparent text-[#f4ecdc] hover:bg-[#f4ecdc] hover:text-[#15120e]">
                <Link href="/design">{translate({ zh: "继续创作", en: "Keep Designing" })}</Link>
              </Button>
            </div>

            {!isHydrated ? (
              <EmptyState text={translate({ zh: "加载中...", en: "Loading..." })} />
            ) : !user ? (
              <EmptyState text={translate({ zh: "登录后可查看你的设计滑动展示", en: "Log in to see your auto-scrolling designs" })} />
            ) : isLoadingOrders ? (
              <EmptyState text={translate({ zh: "加载你的订单中...", en: "Loading your orders..." })} />
            ) : !myOrders || myOrders.length === 0 ? (
              <EmptyState text={translate({ zh: "还没有下单的设计，去创作一个吧", en: "No orders yet — create your first design!" })} />
            ) : (
              <div className="relative overflow-hidden pb-4">
                <div
                  className={`${useMarquee ? "flex min-w-max animate-[yitu-home-marquee_var(--marquee-duration)_linear_infinite]" : "flex flex-wrap"} gap-4 will-change-transform`}
                  style={{
                    "--marquee-duration": `${marqueeDuration}s`,
                    "--marquee-shift": "-33.333333%",
                  } as CSSProperties}
                >
                  {(useMarquee ? loopOrders : myOrders).map((order, idx) => (
                    <OrderPreviewCard
                      key={`${order.id}-${idx}`}
                      order={order}
                      hasFront={getOrderPreviews(order).hasFront}
                      onClick={() => setActiveOrder(order)}
                      noPreviewText={translate({ zh: "无预览图", en: "No preview" })}
                      title={translate({ zh: "我的设计", en: "My Design" })}
                      detail={translate({ zh: "点击查看正反面详情", en: "Click to view front/back" })}
                      locale={translate({ zh: "zh-CN", en: "en-US" })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {shouldShowMembershipAd && (
          <section className="mx-auto grid max-w-[1500px] grid-cols-1 gap-8 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <Badge className="mb-5 rounded-full border border-[#15120e]/15 bg-white/40 px-4 py-2 text-[#15120e] hover:bg-white/40">
                <Crown className="mr-2 h-4 w-4 text-[#b73522]" />
                {translate({ zh: "会员尊享", en: "Member Exclusive" })}
              </Badge>
              <h2 className="font-serif text-[clamp(3rem,7vw,7rem)] font-black leading-none">
                {translate({ zh: "让灵感一直开花", en: "Keep ideas flowing" })}
              </h2>
              <p className="mt-6 text-lg leading-9 text-[#15120e]/70">
                {translate({
                  zh: "198 元起，享受全时段 AI 生图、山海经素材库、字体模板和优先客服支持。",
                  en: "From ¥198, unlock AI generation, mythology assets, templates, and priority support.",
                })}
              </p>
              <ul className="mt-6 space-y-3 text-[#15120e]/72">
                {membershipBenefits.map((benefit) => (
                  <li key={benefit} className="flex gap-3">
                    <span className="text-[#b73522]">◆</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-8 rounded-full bg-[#15120e] px-8 text-[#f4ecdc] hover:bg-[#3b2a1d]">
                <Link href="/membership">{translate({ zh: "立即开通会员", en: "Become a Member" })}</Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {membershipPlans.map((plan) => (
                <div key={plan.id} className="border border-[#15120e]/15 bg-white/35 p-6 shadow-[0_18px_60px_rgba(21,18,14,0.08)]">
                  <h3 className="font-serif text-3xl font-black">{plan.title}</h3>
                  <p className="mt-3 text-xl font-black text-[#b73522]">{plan.price}</p>
                  <p className="mt-5 leading-7 text-[#15120e]/62">
                    {translate({
                      zh: "灵活周期，适合不同创作节奏。",
                      en: "Flexible terms for different creative rhythms.",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="relative overflow-hidden bg-[#b73522] px-4 py-20 text-white md:px-8 md:py-28">
          <div className="absolute inset-0 opacity-20 [background:linear-gradient(90deg,rgba(255,255,255,.25)_1px,transparent_1px)_0_0/80px_80px]" />
          <div className="relative mx-auto grid max-w-[1500px] gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="mb-6 flex items-center gap-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-current" />
                ))}
                <span className="ml-2 text-sm font-bold">
                  {translate({ zh: "基于 2,000+ 真实评价，评分 4.9/5", en: "4.9/5 from 2,000+ reviews" })}
                </span>
              </div>
              <h2 className="font-serif text-[clamp(3rem,8vw,8rem)] font-black leading-none">
                {translate({ zh: "今天做一件属于你的中国 T 恤", en: "Create your cultural tee today" })}
              </h2>
            </div>
            <Button asChild size="lg" className="rounded-full bg-[#f4ecdc] px-9 text-[#15120e] hover:bg-white">
              <Link href="/design">
                {translate({ zh: "立即开始设计", en: "Start Your Design Now" })}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#15120e]/12 px-4 py-10 md:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center bg-[#15120e] text-[#f4ecdc]">
              <Palette className="h-5 w-5" />
            </div>
            <span className="font-serif text-2xl font-black tracking-[0.16em]">yituai</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-[#15120e]/62">
            <Link href="/privacy" className="hover:text-[#15120e]">{translate({ zh: "隐私政策", en: "Privacy Policy" })}</Link>
            <Link href="/terms" className="hover:text-[#15120e]">{translate({ zh: "服务条款", en: "Terms of Service" })}</Link>
            <Link href="/contact" className="hover:text-[#15120e]">{translate({ zh: "联系我们", en: "Contact" })}</Link>
          </div>
        </div>
      </footer>

      <Dialog open={Boolean(activeOrder)} onOpenChange={(open) => {
        if (!open) setActiveOrder(null);
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{translate({ zh: "设计详情", en: "Design Details" })}</DialogTitle>
          </DialogHeader>
          {activeOrder && (
            <div className="grid gap-4 md:grid-cols-2">
              {(["front", "back"] as const).map((side) => {
                const preview = getOrderPreviews(activeOrder);
                const hasImage = side === "front" ? preview.hasFront : preview.hasBack;
                return (
                  <div key={side}>
                    <p className="mb-2 text-sm text-muted-foreground">
                      {side === "front"
                        ? translate({ zh: "正面", en: "Front" })
                        : translate({ zh: "背面", en: "Back" })}
                    </p>
                    {hasImage ? (
                      <NextImage
                        src={apiClient.getThumbnailUrl(activeOrder.id)}
                        alt={`order-${activeOrder.id}-${side}-full`}
                        width={400}
                        height={300}
                        unoptimized
                        className="w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-60 w-full items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
                        {translate({ zh: "无预览图", en: "No preview" })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @keyframes yitu-home-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(var(--marquee-shift)); }
        }

        .home-shanhaijing {
          background:
            linear-gradient(90deg, rgba(21,18,14,0.045) 1px, transparent 1px) 0 0 / 84px 84px,
            radial-gradient(circle at 72% 8%, rgba(183, 53, 34, 0.13), transparent 26rem),
            #f4ecdc;
        }

        .home-shanhaijing ::selection {
          color: #f4ecdc;
          background: #b73522;
        }
      `}</style>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-[#f4ecdc]/15 bg-[#f4ecdc]/6 px-5 py-12 text-center text-[#f4ecdc]/70">
      {text}
    </div>
  );
}

function OrderPreviewCard({
  order,
  hasFront,
  onClick,
  noPreviewText,
  title,
  detail,
  locale,
}: {
  order: OrderRecord;
  hasFront: boolean;
  onClick: () => void;
  noPreviewText: string;
  title: string;
  detail: string;
  locale: string;
}) {
  return (
    <button
      type="button"
      className="min-w-[250px] max-w-[250px] border border-[#f4ecdc]/14 bg-[#f4ecdc]/8 p-0 text-left text-[#f4ecdc] transition hover:-translate-y-1 hover:bg-[#f4ecdc]/12"
      onClick={onClick}
    >
      <div className="p-4">
        <h3 className="font-serif text-2xl font-black">{title}</h3>
        <p className="mt-1 text-xs text-[#f4ecdc]/58">
          {new Date(order.created_at).toLocaleString(locale)}
        </p>
      </div>
      {hasFront ? (
        <NextImage
          src={apiClient.getThumbnailUrl(order.id)}
          alt={`order-${order.id}-front`}
          width={250}
          height={170}
          unoptimized
          loading="lazy"
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="flex h-44 w-full items-center justify-center bg-[#f4ecdc]/8 text-sm text-[#f4ecdc]/60">
          {noPreviewText}
        </div>
      )}
      <p className="p-4 text-xs text-[#f4ecdc]/58">{detail}</p>
    </button>
  );
}
