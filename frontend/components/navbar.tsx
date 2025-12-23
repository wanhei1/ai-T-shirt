"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";

export function Navbar() {
  const { user, logout } = useAuth();
  const { language, toggleLanguage, translate } = useLanguage();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/" className="text-xl font-bold">
              {translate({ zh: "yituai", en: "yituai" })}
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              className="hidden sm:inline-flex"
            >
              {language === "zh" ? "English" : "中文"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="sm:hidden"
            >
              {language === "zh" ? "EN" : "中"}
            </Button>
            {user ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">
                  {translate({
                    zh: `欢迎, ${user.username}`,
                    en: `Welcome, ${user.username}`,
                  })}
                </span>

                {/* 简化的链接按钮 */}
                <Link href="/profile">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <User className="h-4 w-4" />
                    {translate({ zh: "个人资料", en: "Profile" })}
                  </Button>
                </Link>

                <Button
                  variant="ghost"
                  size="sm"
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
