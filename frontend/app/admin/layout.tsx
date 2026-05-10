"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/* Admin Login Form                                                    */
/* ------------------------------------------------------------------ */

function AdminLoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      // login() stores user in context + localStorage
      // The layout will re-render and check user.is_admin
      // No need to check here — the guard below handles it
    } catch (err: any) {
      setError(err?.message || "登录失败，请检查邮箱和密码");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-12 h-12 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
            管
          </div>
          <CardTitle className="text-xl">管理后台登录</CardTitle>
          <p className="text-sm text-muted-foreground">
            请输入管理员账号登录
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">邮箱</label>
              <input
                type="email"
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">密码</label>
              <input
                type="password"
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin Layout                                                        */
/* ------------------------------------------------------------------ */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ---- Redirect /admin → /admin/dashboard (client side) ---- */
  useEffect(() => {
    if (pathname === "/admin") {
      router.replace("/admin/dashboard");
    }
  }, [pathname, router]);

  /* ---- Loading skeleton ---- */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-lg mx-auto" />
          <Skeleton className="h-6 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  /* ---- Not authenticated → show login form ---- */
  if (!user) {
    return <AdminLoginForm />;
  }

  /* ---- Logged in but not admin → show error ---- */
  if (!(user as any)?.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6 space-y-4">
            <div className="text-4xl">🚫</div>
            <h2 className="text-lg font-semibold">权限不足</h2>
            <p className="text-sm text-muted-foreground">
              当前账号没有管理员权限，无法访问后台。
            </p>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("authToken");
                localStorage.removeItem("user");
                window.location.reload();
              }}
            >
              重新登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---- Admin authenticated → show admin panel ---- */
  return (
    <div className="flex min-h-screen">
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b bg-card px-4 py-3 lg:hidden">
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <span className="font-medium">管理后台</span>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
