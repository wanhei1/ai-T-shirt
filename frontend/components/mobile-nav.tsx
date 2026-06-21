"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Menu,
  ShoppingCart,
  User,
  LogOut,
  Paintbrush,
  Store,
  CreditCard,
  Globe,
  PackageCheck,
} from "lucide-react";
import { useState } from "react";
import { YituaiLogo } from "@/components/yituai-logo";

export function MobileNav() {
  const { user, logout } = useAuth();
  const { language, toggleLanguage, translate } = useLanguage();
  const [open, setOpen] = useState(false);

  const handleNavClick = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-11 w-11">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b">
            <div onClick={handleNavClick}>
              <YituaiLogo />
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 p-4 space-y-1">
            <Link
              href="/shop"
              onClick={handleNavClick}
              className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium transition-colors"
            >
              <Store className="h-5 w-5" />
              {translate({ zh: "商城", en: "Shop" })}
            </Link>
            <Link
              href="/design"
              onClick={handleNavClick}
              className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium transition-colors"
            >
              <Paintbrush className="h-5 w-5" />
              {translate({ zh: "设计", en: "Design" })}
            </Link>

            {user && (
              <>
                <Link
                  href="/cart"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium transition-colors"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {translate({ zh: "购物车", en: "Cart" })}
                </Link>
                <Link
                  href="/orders"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium transition-colors"
                >
                  <PackageCheck className="h-5 w-5" />
                  {translate({ zh: "订单", en: "Orders" })}
                </Link>
                <Link
                  href="/profile"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium transition-colors"
                >
                  <User className="h-5 w-5" />
                  {translate({ zh: "个人中心", en: "Profile" })}
                </Link>
                <Link
                  href="/membership"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium transition-colors"
                >
                  <CreditCard className="h-5 w-5" />
                  {translate({ zh: "会员", en: "Membership" })}
                </Link>
              </>
            )}
          </nav>

          {/* Bottom Actions */}
          <div className="p-4 border-t space-y-2">
            <button
              onClick={() => {
                toggleLanguage();
                handleNavClick();
              }}
              className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium w-full transition-colors"
            >
              <Globe className="h-5 w-5" />
              {language === "zh" ? "English" : "中文"}
            </button>

            {user ? (
              <div className="space-y-2">
                <div className="px-3 py-2 text-sm text-muted-foreground truncate">
                  {translate({
                    zh: `欢迎, ${user.username}`,
                    en: `Welcome, ${user.username}`,
                  })}
                </div>
                <button
                  onClick={() => {
                    logout();
                    handleNavClick();
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-accent text-sm font-medium w-full text-destructive transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  {translate({ zh: "登出", en: "Log out" })}
                </button>
              </div>
            ) : (
              <Link href="/auth" onClick={handleNavClick} className="block">
                <Button className="w-full h-11">
                  {translate({ zh: "登录 / 注册", en: "Log in / Sign up" })}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
