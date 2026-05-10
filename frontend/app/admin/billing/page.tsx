"use client";

import { useEffect, useMemo, useState } from "react";
import apiClient, { getFriendlyApiErrorSummary } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  ReconciliationReport,
  SampleTableRow,
  SampleGroup,
} from "@/components/admin/types";

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

export default function BillingPage() {
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [isLoadingReconciliation, setIsLoadingReconciliation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSqlKey, setCopiedSqlKey] = useState<string | null>(null);

  useEffect(() => {
    void loadReconciliation();
  }, []);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">账务对账</h1>
          <p className="text-xs text-muted-foreground">对账报告与异常排查</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadReconciliation} disabled={isLoadingReconciliation}>
          {isLoadingReconciliation ? "加载中..." : "刷新对账"}
        </Button>
      </div>

      <div>
        {error && (
          <Card className="mb-6 border-destructive/40 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <Card className="mb-6">
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
