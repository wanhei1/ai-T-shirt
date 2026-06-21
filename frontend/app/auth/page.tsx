"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "register";

export default function AuthPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || isLoading) {
      return;
    }

    if (user) {
      if ((user as any)?.is_admin) {
        router.push("/admin");
      } else {
        router.push("/");
      }
    }
  }, [isMounted, isLoading, user, router]);

  // Keep first frame deterministic to prevent hydration mismatch.
  if (!isMounted || isLoading || user) {
    return null;
  }

  return (
    <div className="yituai-page-shell">
      <div className="yituai-bleed-hero" style={{ backgroundImage: "url(/home-shanhaijing/hero-models.png)" }}>
        <div className="yituai-bleed-content grid gap-8 lg:grid-cols-[1fr_420px]">
          <div className="yituai-bleed-copy">
            <span className="yituai-seal">入</span>
            <p className="yituai-kicker mt-8">Account</p>
            <h1 className="yituai-display mt-3">
              {authMode === "login" ? "回到你的设计台" : "开一间自己的衣台工坊"}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8">
              登录后可以保存设计、生成试衣、查看订单和继续你的山海经 T 恤作品。
            </p>
            <div className="mt-8 grid max-w-xl grid-cols-3 border border-[#f4ecdc]/22 bg-[#15120e]/45 text-center text-sm font-bold backdrop-blur">
              <div className="p-4">AI 生图</div>
              <div className="border-x border-[#f4ecdc]/22 p-4">虚拟试衣</div>
              <div className="p-4">订单追踪</div>
            </div>
          </div>
          <div className="rounded-sm border border-[#f4ecdc]/28 bg-[#f4ecdc]/92 p-4 text-[#15120e] shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            {authMode === "login" ? (
              <LoginForm onSwitchToRegister={() => setAuthMode("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setAuthMode("login")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
