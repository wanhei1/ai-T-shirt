"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import apiClient, { getFriendlyApiErrorSummary } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  AiBudgetTodayReport,
  AiBudgetGlobalUsage,
  AiBudgetUserUsage,
  ReconciliationReport,
  ReconciliationMismatch,
  SampleTableRow,
  SampleGroup,
} from "@/components/admin/types";

/* ------------------------------------------------------------------ */
/* Helper functions                                                    */
/* ------------------------------------------------------------------ */

const formatPercent = (ratio: number) => `${(Math.max(0, ratio) * 100).toFixed(1)}%`;

const operationLabel = (operation: "ai-image" | "virtual-tryon") =>
  operation === "ai-image" ? "AI 生成" : "AI 试穿";

const toNumberLike = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return "-";
};

const toTimeLike = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length === 0) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
};

const buildInvestigationSql = (kind: string, row: Record<string, unknown>) => {
  const userId = toNumberLike(row.user_id);
  const referenceId = toNumberLike(row.reference_id === "-" ? null : row.reference_id);

  if (kind === "membershipPurchaseMissingTransaction") {
    return [
      `-- 用户 ${userId}: 会员支付缺交易流水`,
      `SELECT id, user_id, transaction_id, updated_at FROM memberships WHERE user_id = ${userId};`,
      `SELECT id, user_id, type, reference_id, created_at`,
      `FROM membership_transactions`,
      `WHERE user_id = ${userId}`,
      `ORDER BY created_at DESC LIMIT 50;`,
    ].join("\n");
  }

  if (kind === "membershipTransactionMissingPaymentRecord") {
    const referenceFilter = referenceId !== "-" ? ` AND transaction_id = '${referenceId.replace(/'/g, "''")}'` : "";
    return [
      `-- 用户 ${userId}: 交易流水缺支付记录`,
      `SELECT id, user_id, type, reference_id, created_at`,
      `FROM membership_transactions`,
      `WHERE user_id = ${userId} AND type = 'membership_purchase'`,
      `ORDER BY created_at DESC LIMIT 50;`,
      `SELECT id, user_id, transaction_id, updated_at`,
      `FROM memberships`,
      `WHERE user_id = ${userId}${referenceFilter};`,
    ].join("\n");
  }

  return [
    `-- 用户 ${userId}: 订单金额与扣款不一致`,
    `SELECT id, user_id, total, created_at`,
    `FROM orders`,
    `WHERE user_id = ${userId}`,
    `ORDER BY created_at DESC LIMIT 50;`,
    `SELECT id, user_id, delta, type, created_at`,
    `FROM membership_transactions`,
    `WHERE user_id = ${userId} AND type = 'order_payment'`,
    `ORDER BY created_at DESC LIMIT 50;`,
  ].join("\n");
};

const getBudgetRiskMeta = (estimatedExhaustAt: string | null) => {
  if (!estimatedExhaustAt) {
    return {
      remainingHoursText: "暂无预测",
      riskText: "黄",
      riskClassName: "bg-yellow-100 text-yellow-800 border-yellow-200",
    };
  }

  const diffMs = Date.parse(estimatedExhaustAt) - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return {
      remainingHoursText: "<= 0 小时",
      riskText: "红",
      riskClassName: "bg-red-100 text-red-800 border-red-200",
    };
  }

  const hours = diffMs / (1000 * 60 * 60);
  const remainingHoursText = hours < 1 ? "< 1 小时" : `${hours.toFixed(1)} 小时`;

  if (hours <= 4) {
    return {
      remainingHoursText,
      riskText: "红",
      riskClassName: "bg-red-100 text-red-800 border-red-200",
    };
  }

  if (hours <= 12) {
    return {
      remainingHoursText,
      riskText: "黄",
      riskClassName: "bg-yellow-100 text-yellow-800 border-yellow-200",
    };
  }

  return {
    remainingHoursText,
    riskText: "绿",
    riskClassName: "bg-green-100 text-green-800 border-green-200",
  };
};

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */

export default function AdminDashboardPage() {
  const { user } = useAuth();

  const [error, setError] = useState<string | null>(null);

  /* --- AI budget state --- */
  const [aiBudgetReport, setAiBudgetReport] = useState<AiBudgetTodayReport | null>(null);
  const [isLoadingAiBudget, setIsLoadingAiBudget] = useState(false);

  /* --- Reconciliation state --- */
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [isLoadingReconciliation, setIsLoadingReconciliation] = useState(false);
  const [copiedSqlKey, setCopiedSqlKey] = useState<string | null>(null);

  /* ---- Load data on mount ---- */
  useEffect(() => {
    if (!user || !(user as any)?.is_admin) return;
    void loadReconciliation();
    void loadAiBudget();
  }, [user]);

  /* ---- Data loaders ---- */

  const loadReconciliation = async () => {
    try {
      setIsLoadingReconciliation(true);
      const response = await apiClient.getAdminReconciliationLatest();
      setReconciliationReport((response?.report || null) as ReconciliationReport | null);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "加载对账报告失败", en: "Failed to load reconciliation report" }, "zh"));
    } finally {
      setIsLoadingReconciliation(false);
    }
  };

  const loadAiBudget = async () => {
    try {
      setIsLoadingAiBudget(true);
      const response = await apiClient.getAdminAiBudgetToday();
      setAiBudgetReport(response as AiBudgetTodayReport);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "加载预算看板失败", en: "Failed to load budget dashboard" }, "zh"));
    } finally {
      setIsLoadingAiBudget(false);
    }
  };

  /* ---- Derived reconciliation sample rows ---- */

  const sampleRows = useMemo(() => {
    const report = reconciliationReport;
    if (!report?.samples) {
      return [] as SampleGroup[];
    }

    return [
      {
        title: "会员支付缺交易流水",
        rows: (report.samples.membershipPurchaseMissingTransaction || []).map((row, index) => ({
          key: `membershipPurchaseMissingTransaction-${index}`,
          userId: toNumberLike(row.user_id),
          referenceId: toNumberLike(row.transaction_id),
          diff: "-",
          eventTime: toTimeLike(row.updated_at),
          sql: buildInvestigationSql("membershipPurchaseMissingTransaction", row),
        })),
      },
      {
        title: "交易流水缺支付记录",
        rows: (report.samples.membershipTransactionMissingPaymentRecord || []).map((row, index) => ({
          key: `membershipTransactionMissingPaymentRecord-${index}`,
          userId: toNumberLike(row.user_id),
          referenceId: toNumberLike(row.reference_id),
          diff: "-",
          eventTime: toTimeLike(row.created_at),
          sql: buildInvestigationSql("membershipTransactionMissingPaymentRecord", row),
        })),
      },
      {
        title: "订单金额与扣款不一致",
        rows: (report.samples.orderPaymentAmountMismatch || []).map((row, index) => ({
          key: `orderPaymentAmountMismatch-${index}`,
          userId: toNumberLike(row.user_id),
          referenceId: "-",
          diff: toNumberLike(row.diff),
          eventTime: "-",
          sql: buildInvestigationSql("orderPaymentAmountMismatch", row),
        })),
      },
    ].filter((group) => group.rows.length > 0);
  }, [reconciliationReport]);

  const copySql = async (row: SampleTableRow) => {
    try {
      await navigator.clipboard.writeText(row.sql);
      setCopiedSqlKey(row.key);
      setTimeout(() => {
        setCopiedSqlKey((current) => (current === row.key ? null : current));
      }, 1500);
    } catch (err) {
      setError(getFriendlyApiErrorSummary(err, { zh: "复制 SQL 失败", en: "Failed to copy SQL" }, "zh"));
    }
  };

  /* ---- Render ---- */

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAiBudget} disabled={isLoadingAiBudget}>
            {isLoadingAiBudget ? "加载中..." : "刷新预算"}
          </Button>
          <Button variant="outline" size="sm" onClick={loadReconciliation} disabled={isLoadingReconciliation}>
            {isLoadingReconciliation ? "加载中..." : "刷新对账"}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {error && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* ============ AI Budget Card ============ */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">今日预算使用看板</CardTitle>
            <Button variant="outline" size="sm" onClick={loadAiBudget} disabled={isLoadingAiBudget}>
              {isLoadingAiBudget ? "加载中..." : "刷新预算"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!aiBudgetReport ? (
              <div className="text-muted-foreground">暂无预算数据</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">模式: {aiBudgetReport.guardMode}</Badge>
                  <span className="text-muted-foreground">日期: {aiBudgetReport.usageDate}</span>
                  <span className="text-muted-foreground">
                    更新时间: {new Date(aiBudgetReport.generatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {aiBudgetReport.global.map((item) => {
                    const risk = getBudgetRiskMeta(item.estimatedExhaustAt);
                    return (
                      <div key={item.operation} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{operationLabel(item.operation)}</div>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${risk.riskClassName}`}>
                            风险 {risk.riskText}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          已用 {item.used} / 配额 {item.quota} ({formatPercent(item.usageRate)})
                        </div>
                        <div className="text-xs text-muted-foreground">全站剩余额度: {item.remaining}</div>
                        <div className="text-xs text-muted-foreground">预计耗尽: 剩余约 {risk.remainingHoursText}</div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <div className="mb-2 font-medium">用户额度使用率 (Top 20)</div>
                  {aiBudgetReport.users.length === 0 ? (
                    <div className="rounded-md border p-3 text-muted-foreground">今日暂无用户预算消耗</div>
                  ) : (
                    <div className="overflow-auto rounded-md border">
                      <table className="w-full min-w-[760px] text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left">用户</th>
                            <th className="px-3 py-2 text-left">操作</th>
                            <th className="px-3 py-2 text-left">已用/配额</th>
                            <th className="px-3 py-2 text-left">使用率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiBudgetReport.users.slice(0, 20).map((row, idx) => (
                            <tr key={`${row.userId}-${row.operation}-${idx}`} className="border-t">
                              <td className="px-3 py-2">
                                #{row.userId}
                                {row.username ? ` · ${row.username}` : ""}
                                {row.email ? ` · ${row.email}` : ""}
                              </td>
                              <td className="px-3 py-2">{operationLabel(row.operation)}</td>
                              <td className="px-3 py-2">{row.used} / {row.quota}</td>
                              <td className="px-3 py-2">{formatPercent(row.usageRate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ============ Reconciliation Card ============ */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">账务对账看板</CardTitle>
            <Button variant="outline" size="sm" onClick={loadReconciliation} disabled={isLoadingReconciliation}>
              {isLoadingReconciliation ? "加载中..." : "刷新对账"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!reconciliationReport ? (
              <div className="text-muted-foreground">暂无对账数据</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={reconciliationReport.totalMismatches > 0 ? "destructive" : "outline"}>
                    mismatch: {reconciliationReport.totalMismatches}
                  </Badge>
                  <span className="text-muted-foreground">窗口: {reconciliationReport.lookbackHours}h</span>
                  <span className="text-muted-foreground">
                    更新时间: {new Date(reconciliationReport.generatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {reconciliationReport.mismatches.map((item) => (
                    <div key={item.kind} className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">{item.kind}</div>
                      <div className="mt-1 text-lg font-semibold">{item.count}</div>
                    </div>
                  ))}
                </div>

                {sampleRows.length === 0 ? (
                  <div className="rounded-md border p-3 text-muted-foreground">当前窗口未发现异常样本用户</div>
                ) : (
                  <div className="space-y-3">
                    {sampleRows.map((group) => (
                      <div key={group.title} className="rounded-md border p-3">
                        <div className="mb-2 font-medium">{group.title}</div>
                        <div className="overflow-auto rounded-md border">
                          <table className="w-full min-w-[760px] text-xs">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left">用户</th>
                                <th className="px-3 py-2 text-left">reference_id</th>
                                <th className="px-3 py-2 text-left">差额</th>
                                <th className="px-3 py-2 text-left">时间</th>
                                <th className="px-3 py-2 text-right">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => (
                                <tr key={row.key} className="border-t">
                                  <td className="px-3 py-2">{row.userId}</td>
                                  <td className="px-3 py-2">{row.referenceId}</td>
                                  <td className="px-3 py-2">{row.diff}</td>
                                  <td className="px-3 py-2">{row.eventTime}</td>
                                  <td className="px-3 py-2 text-right">
                                    <Button variant="outline" size="sm" onClick={() => copySql(row)}>
                                      {copiedSqlKey === row.key ? "已复制" : "复制排查 SQL"}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
