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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        {authMode === "login" ? (
          <LoginForm onSwitchToRegister={() => setAuthMode("register")} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setAuthMode("login")} />
        )}
      </div>
    </div>
  );
}
