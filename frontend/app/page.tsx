"use client";
/* 主页 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Type,
  Upload,
  Palette,
  ArrowRight,
  Star,
  Crown,
} from "lucide-react";
import Link from "next/link";
import { ApiConnectionTest } from "@/components/api-connection-test";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";

type MembershipRecord = {
  plan_id: string;
  status?: string;
  expires_at?: string | null;
};

export default function HomePage() {
  const { user } = useAuth();
  const { translate } = useLanguage();
  const [membership, setMembership] = useState<MembershipRecord | null>(null);
  const [isLoadingMembership, setIsLoadingMembership] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadMembership = async () => {
      if (!user) {
        setMembership(null);
        return;
      }

      try {
        setIsLoadingMembership(true);
        const { apiClient } = await import("@/lib/api-client");
        const response = await apiClient.getMembership();
        if (isMounted) {
          setMembership(response.membership || null);
        }
      } catch (error) {
        if (isMounted) {
          console.warn("Failed to fetch membership", error);
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

  const featureCards = [
    {
      icon: Sparkles,
      title: translate({ zh: "AI 智能生成", en: "AI Generation" }),
      description: translate({
        zh: "描述创意，交给 AI 即刻生成惊艳设计",
        en: "Describe your vision and let AI create stunning designs for you",
      }),
      points: [
        translate({ zh: "自然语言提示词", en: "Natural language prompts" }),
        translate({ zh: "多种风格可选", en: "Multiple style options" }),
        translate({ zh: "秒级出图体验", en: "Instant generation" }),
      ],
    },
    {
      icon: Type,
      title: translate({ zh: "文字自由设计", en: "Text Customization" }),
      description: translate({
        zh: "使用精美字体与配色打造独特文字效果",
        en: "Add custom text with beautiful fonts and colors",
      }),
      points: [
        translate({ zh: "内置 Google Fonts 字体库", en: "Google Fonts library" }),
        translate({ zh: "自定义色彩搭配", en: "Color customization" }),
        translate({ zh: "位置随心调整", en: "Flexible positioning" }),
      ],
    },
    {
      icon: Upload,
      title: translate({ zh: "图片素材上传", en: "Image Upload" }),
      description: translate({
        zh: "上传原创作品，掌控每一个细节",
        en: "Upload your own images and artwork for complete control",
      }),
      points: [
        translate({ zh: "支持 JPG、PNG、SVG", en: "JPG, PNG, SVG support" }),
        translate({ zh: "拖拽式交互", en: "Drag & drop interface" }),
        translate({ zh: "智能尺寸适配", en: "Smart resizing" }),
      ],
    },
  ];

  const processSteps = [
    {
      title: translate({ zh: "选择服饰款式", en: "Choose Product" }),
      description: translate({
        zh: "从精选款式中挑选喜欢的版型、颜色与尺码",
        en: "Select your T-shirt style, color, and size from our premium collection",
      }),
    },
    {
      title: translate({ zh: "创作你的设计", en: "Design & Create" }),
      description: translate({
        zh: "借助 AI、文字和图片工具，自由发挥你的创意",
        en: "Use our powerful editor to create your perfect design with AI, text, or images",
      }),
    },
    {
      title: translate({ zh: "下单并享受", en: "Order & Enjoy" }),
      description: translate({
        zh: "确认设计后提交订单，穿上你的专属定制 T 恤",
        en: "Review your design, place your order, and receive your custom T-shirt",
      }),
    },
  ];

  const membershipPlans = [
    {
      id: "monthly",
      title: translate({ zh: "月度会员", en: "Monthly" }),
      price: translate({ zh: "¥188 / 月", en: "¥188 / month" }),
    },
    {
      id: "quarterly",
      title: translate({ zh: "季度会员", en: "Quarterly" }),
      price: translate({ zh: "¥564 / 季", en: "¥564 / quarter" }),
    },
    {
      id: "half-year",
      title: translate({ zh: "半年会员", en: "Half-Year" }),
      price: translate({ zh: "¥1128 / 半年", en: "¥1128 / half-year" }),
    },
    {
      id: "yearly",
      title: translate({ zh: "年度会员", en: "Annual" }),
      price: translate({ zh: "¥2256 / 年", en: "¥2256 / year" }),
    },
  ];

  const membershipBenefits = [
    translate({ zh: "AI 生成权益不限次，灵感随时开花", en: "Unlimited AI generations to keep ideas flowing" }),
    translate({ zh: "会员专属设计素材与模板持续更新", en: "Access members-only design assets and templates" }),
    translate({ zh: "优先客服支持，问题极速响应", en: "Priority support with faster response times" }),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          {/* API Connection Test - only show in development */}
          {process.env.NODE_ENV === "development" && <ApiConnectionTest />}

          <Badge variant="secondary" className="mb-4">
            <Sparkles className="w-4 h-4 mr-1" />
            {translate({ zh: "AI 智能设计", en: "AI-Powered Design" })}
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-balance mb-6">
            {translate({ zh: "打造属于你的 ", en: "Design Your Perfect " })}
            <span className="text-primary">
              {translate({ zh: "专属定制 T 恤", en: "Custom T-Shirt" })}
            </span>
          </h1>
          <p className="text-xl text-muted-foreground text-pretty mb-8 max-w-2xl mx-auto">
            {translate({
              zh: "使用强大的设计工具，轻松创建独一无二的潮流单品。支持 AI 生成、文字编辑与图片上传，让灵感立即变成作品。",
              en: "Create unique, one-of-a-kind merchandise with our powerful design tools. Use AI generation, add custom text, or upload your own images.",
            })}
          </p>

          {user ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="text-lg px-8">
                  <Link href="/design">
                    {translate({ zh: "继续设计", en: "Continue Designing" })}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="text-lg px-8 bg-transparent"
                >
                  <Link href="#gallery">
                    {translate({ zh: "查看画廊", en: "View Gallery" })}
                  </Link>
                </Button>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg max-w-md mx-auto">
                <p className="text-muted-foreground mb-3">
                  {translate({
                    zh: "欢迎回来, ",
                    en: "Welcome back, ",
                  })}
                  <span className="font-semibold text-foreground">
                    {user.username}
                  </span>
                  {translate({
                    zh: "! 准备创建新的设计吗？",
                    en: "! Ready to create something new?",
                  })}
                </p>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/profile">
                    {translate({ zh: "查看个人资料", en: "View Profile" })}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="text-lg px-8">
                <Link href="/auth">
                  {translate({ zh: "开始设计", en: "Start Designing" })}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="text-lg px-8 bg-transparent"
              >
                <Link href="/design">
                  {translate({ zh: "试用演示", en: "Try Demo" })}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Membership Section */}
      {shouldShowMembershipAd && (
        <section className="py-20 px-4 bg-primary/5">
          <div className="container mx-auto">
            <div className="grid gap-10 lg:grid-cols-2 items-center">
              <div>
                <Badge variant="outline" className="mb-4 text-primary border-primary/40">
                  <Crown className="w-4 h-4 mr-2" />
                  {translate({ zh: "会员尊享", en: "Member Exclusive" })}
                </Badge>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  {translate({ zh: "开通会员，设计效率翻倍", en: "Unlock Membership, Supercharge Your Creativity" })}
                </h2>
                <p className="text-lg text-muted-foreground mb-6">
                  {translate({
                    zh: "188 元起，享受全时段 AI 生图、素材库等多项特权，为你的原创设计保驾护航。",
                    en: "Starting at ¥188, enjoy unlimited AI generation, exclusive assets, and more perks to power your custom creations.",
                  })}
                </p>
                <ul className="space-y-2 mb-6 text-muted-foreground">
                  {membershipBenefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="mt-1 text-primary">•</span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <Button size="lg" asChild className="text-lg px-8">
                  <Link href="/membership">
                    {translate({ zh: "立即开通会员", en: "Become a Member" })}
                  </Link>
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {membershipPlans.map((plan) => (
                  <Card key={plan.id} className="border-primary/40 hover:border-primary transition-colors">
                    <CardHeader>
                      <CardTitle>{plan.title}</CardTitle>
                      <CardDescription className="text-base font-semibold text-primary">
                        {plan.price}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {translate({
                          zh: "灵活周期，随心搭配，适合不同创作节奏",
                          en: "Flexible terms to match every creative rhythm",
                        })}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {translate({ zh: "三种创作方式", en: "Three Ways to Create" })}
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {translate({
                zh: "选择最适合你的设计路径，让灵感立刻实现",
                en: "Choose your preferred design method and bring your vision to life",
              })}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {featureCards.map((card, index) => {
              const Icon = card.icon;
              const badgeStyles = ["bg-primary/10 text-primary", "bg-secondary/10 text-secondary", "bg-accent/10 text-accent"]; // deterministic colors
              return (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${badgeStyles[index % badgeStyles.length]}`}
                    >
                      <Icon className="w-8 h-8" />
                    </div>
                    <CardTitle>{card.title}</CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      {card.points.map((point, pointIndex) => (
                        <li key={pointIndex}>• {point}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {translate({ zh: "3 步完成你的作品", en: "Simple 3-Step Process" })}
            </h2>
            <p className="text-xl text-muted-foreground">
              {translate({ zh: "从灵感到成品，只需几分钟", en: "From concept to creation in minutes" })}
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {processSteps.map((step, index) => {
                const stepStyles = [
                  "bg-primary text-primary-foreground",
                  "bg-secondary text-secondary-foreground",
                  "bg-accent text-accent-foreground",
                ];
                return (
                  <div key={step.title} className="text-center">
                    <div
                      className={`w-12 h-12 ${stepStyles[index % stepStyles.length]} rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold`}
                    >
                      {index + 1}
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary text-primary-foreground">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {translate({ zh: "准备好开启精彩创作了吗？", en: "Ready to Create Something Amazing?" })}
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            {translate({
              zh: "加入成千上万的设计者，一起打造最满意的定制 T 恤",
              en: "Join thousands of creators who have designed their perfect custom T-shirts",
            })}
          </p>
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-current" />
              ))}
            </div>
            <span className="text-lg">
              {translate({ zh: "基于 2,000+ 真实评价，评分 4.9/5", en: "4.9/5 from 2,000+ reviews" })}
            </span>
          </div>
          <Button
            size="lg"
            variant="secondary"
            asChild
            className="text-lg px-8"
          >
            <Link href="/design">
              {translate({ zh: "立即开始设计", en: "Start Your Design Now" })}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">yituai</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                {translate({ zh: "隐私政策", en: "Privacy Policy" })}
              </Link>
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors"
              >
                {translate({ zh: "服务条款", en: "Terms of Service" })}
              </Link>
              <Link
                href="/contact"
                className="hover:text-foreground transition-colors"
              >
                {translate({ zh: "联系我们", en: "Contact" })}
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            {translate({ zh: "© 2024 yituai. 版权所有。", en: "© 2024 yituai. All rights reserved." })}
          </div>
        </div>
      </footer>
    </div>
  );
}
