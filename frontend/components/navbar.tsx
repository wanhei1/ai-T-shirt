"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, ShoppingCart, User } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";
import { MobileNav } from "@/components/mobile-nav";

export function Navbar() {
  const { user, logout } = useAuth();
  const { language, toggleLanguage, translate } = useLanguage();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Left: Logo + Mobile Menu */}
          <div className="flex items-center space-x-2">
            <MobileNav />
            <Link href="/" className="text-xl font-bold">
              {translate({ zh: "yituai", en: "yituai" })}
            </Link>
          </div>

          {/* Right: Desktop Nav */}
          <div className="hidden md:flex items-center space-x-4">
            <Button
              variant="outline"
              size="default"
              onClick={toggleLanguage}
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
                    className="flex items-center gap-2"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {translate({ zh: "购物车", en: "Cart" })}
                  </Button>
                </Link>

                <Link href="/profile">
                  <Button
                    variant="ghost"
                    size="default"
                    className="flex items-center gap-2"
                  >
                    <User className="h-4 w-4" />
                    {translate({ zh: "个人资料", en: "Profile" })}
                  </Button>
                </Link>

                <Button
                  variant="ghost"
                  size="default"
                  onClick={logout}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  {translate({ zh: "登出", en: "Log out" })}
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link href="/auth">
                  <Button variant="ghost">
                    {translate({ zh: "登录", en: "Log in" })}
                  </Button>
                </Link>
                <Link href="/auth">
                  <Button>{translate({ zh: "注册", en: "Sign up" })}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
