"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, ShoppingCart, User } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import { MobileNav } from "@/components/mobile-nav";
import { YituaiLogo } from "@/components/yituai-logo";

export function Navbar() {
  const { user, logout } = useAuth();
  const { language, toggleLanguage, translate } = useLanguage();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <nav
      className={
        isAdmin
          ? "sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          : "sticky top-0 z-50 border-b border-[#15120e]/10 bg-[#f4ecdc]/90 backdrop-blur-xl"
      }
    >
      <div className={isAdmin ? "container mx-auto px-4" : "mx-auto max-w-[1500px] px-4 md:px-8"}>
        <div className="grid h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-4 py-3 md:h-20 md:py-4">
          <div className="flex items-center gap-2">
            <MobileNav />
            <YituaiLogo compact={false} />
          </div>

          <div
            className={
              isHome
                ? "hidden items-center gap-7 text-sm font-semibold text-[#15120e]/70 lg:flex"
                : isAdmin
                  ? "hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex"
                  : "hidden items-center gap-7 text-sm font-semibold text-[#15120e]/70 lg:flex"
            }
          >
            {isHome ? (
              <>
                <a href="#looks">{translate({ zh: "男女款式", en: "Looks" })}</a>
                <a href="#process">{translate({ zh: "定制流程", en: "Process" })}</a>
                <a href="#tryon">{translate({ zh: "AI 试衣", en: "Try-on" })}</a>
              </>
            ) : null}
            <Link href="/shop" className="hover:text-foreground">
              {translate({ zh: "商城", en: "Shop" })}
            </Link>
            <Link href="/design" className="hover:text-foreground">
              {translate({ zh: "设计", en: "Design" })}
            </Link>
            <Link href="/membership" className="hover:text-foreground">
              {translate({ zh: "会员", en: "Membership" })}
            </Link>
            {user ? (
              <Link href="/orders" className="hover:text-foreground">
                {translate({ zh: "订单", en: "Orders" })}
              </Link>
            ) : null}
          </div>

          <div className="hidden items-center justify-end space-x-3 md:flex">
            <Button
              variant="outline"
              size="default"
              onClick={toggleLanguage}
              className={!isAdmin ? "rounded-full border-[#15120e] bg-transparent" : undefined}
            >
              {language === "zh" ? "English" : "中文"}
            </Button>
            {user ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                  {translate({
                    zh: `欢迎, ${user.username}`,
                    en: `Welcome, ${user.username}`,
                  })}
                </span>

                <Link href="/cart">
                  <Button
                    variant="ghost"
                    size="default"
                    className="flex items-center gap-2 rounded-full"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {translate({ zh: "购物车", en: "Cart" })}
                  </Button>
                </Link>

                <Link href="/profile">
                  <Button
                    variant="ghost"
                    size="default"
                    className="flex items-center gap-2 rounded-full"
                  >
                    <User className="h-4 w-4" />
                    {translate({ zh: "个人资料", en: "Profile" })}
                  </Button>
                </Link>

                <Button
                  variant="ghost"
                  size="default"
                  onClick={logout}
                  className="flex items-center gap-2 rounded-full"
                >
                  <LogOut className="h-4 w-4" />
                  {translate({ zh: "登出", en: "Log out" })}
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link href="/auth">
                  <Button variant="ghost" className="rounded-full">
                    {translate({ zh: "登录", en: "Log in" })}
                  </Button>
                </Link>
                <Link href="/auth">
                  <Button className={!isAdmin ? "rounded-full bg-[#15120e] text-[#f4ecdc] hover:bg-[#3b2a1d]" : "rounded-full"}>
                    {translate({ zh: "注册", en: "Sign up" })}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
