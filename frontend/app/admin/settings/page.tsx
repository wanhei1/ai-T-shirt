"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              S
            </div>
            <div>
              <h1 className="text-lg font-semibold">系统设置</h1>
              <p className="text-xs text-muted-foreground">管理后台配置项</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">设置</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>此页面暂未开放更多配置项，后续将逐步增加系统参数管理功能。</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
