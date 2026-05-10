"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">系统设置</h1>
        <p className="text-xs text-muted-foreground">管理后台配置项</p>
      </div>

      <div>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">设置</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>此页面暂未开放更多配置项，后续将逐步增加系统参数管理功能。</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
