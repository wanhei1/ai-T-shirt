"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { ApiError } from "@/lib/auth-api";

const registerSchema = z
  .object({
    username: z
      .string()
      .min(2, "用户名至少2个字符")
      .max(50, "用户名不能超过50个字符"),
    email: z.string().email("请输入有效的邮箱地址"),
    password: z.string().min(6, "密码至少6个字符"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "密码不匹配",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const { register: registerUser, isLoading } = useAuth();
  const { translate } = useLanguage();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setError(null);
      setErrorDetails([]);
      await registerUser(data.username, data.email, data.password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const details: string[] = [];
        details.push(`错误类型: ${err.type}`);
        details.push(`接口地址: ${err.endpoint}`);
        if (typeof err.status !== "undefined") {
          details.push(`HTTP 状态: ${err.status}${err.statusText ? ` ${err.statusText}` : ""}`);
        }
        if (err.serverBody) {
          details.push(`服务器返回: ${err.serverBody}`);
        }
        setErrorDetails(details);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : translate({ zh: "注册失败，请重试", en: "Registration failed, please try again" })
        );
        setErrorDetails([]);
      }
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">
          {translate({ zh: "注册", en: "Sign up" })}
        </CardTitle>
        <CardDescription className="text-center">
          {translate({ zh: "创建您的新账户", en: "Create your new account" })}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="space-y-1">
                <p>{error}</p>
                {errorDetails.map((line) => (
                  <p key={line} className="text-xs text-muted-foreground break-all">
                    {line}
                  </p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">{translate({ zh: "用户名", en: "Username" })}</Label>
            <Input
              id="username"
              type="text"
              placeholder={translate({ zh: "请输入用户名", en: "Enter your username" })}
              {...register("username")}
              className={errors.username ? "border-red-500" : ""}
            />
            {errors.username && (
              <p className="text-sm text-red-500">{errors.username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{translate({ zh: "邮箱", en: "Email" })}</Label>
            <Input
              id="email"
              type="email"
              placeholder={translate({ zh: "请输入邮箱", en: "Enter your email" })}
              {...register("email")}
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{translate({ zh: "密码", en: "Password" })}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={translate({ zh: "请输入密码", en: "Enter your password" })}
                {...register("password")}
                className={errors.password ? "border-red-500 pr-10" : "pr-10"}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{translate({ zh: "确认密码", en: "Confirm Password" })}</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder={translate({ zh: "请再次输入密码", en: "Enter your password again" })}
                {...register("confirmPassword")}
                className={
                  errors.confirmPassword ? "border-red-500 pr-10" : "pr-10"
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-red-500">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {translate({ zh: "注册中...", en: "Signing up..." })}
              </>
            ) : (
              translate({ zh: "注册", en: "Sign up" })
            )}
          </Button>
          <div className="text-center">
            <span className="text-sm text-gray-600">
              {translate({ zh: "已有账户？", en: "Already have an account?" })}{" "}
              <Button
                type="button"
                variant="link"
                className="p-0"
                onClick={onSwitchToLogin}
              >
                {translate({ zh: "立即登录", en: "Log in now" })}
              </Button>
            </span>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
