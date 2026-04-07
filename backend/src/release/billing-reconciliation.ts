import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import connectToDatabase from '../config/database';

const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), '..', 'artifacts', 'reconciliation');

export const BILLING_RECONCILIATION_KINDS = [
  'membership_purchase_missing_transaction',
  'membership_transaction_missing_payment_record',
  'order_payment_amount_mismatch',
] as const;

export type BillingReconciliationKind = typeof BILLING_RECONCILIATION_KINDS[number];

type MismatchCounter = {
  kind: BillingReconciliationKind;
  count: number;
};

export type BillingReconciliationReport = {
  generatedAt: string;
  lookbackHours: number;
  windowStart: string;
  totalMismatches: number;
  mismatches: MismatchCounter[];
  samples: {
    membershipPurchaseMissingTransaction: Array<{ user_id: number; transaction_id: string; updated_at: string | null }>;
    membershipTransactionMissingPaymentRecord: Array<{ user_id: number; reference_id: string | null; created_at: string | null }>;
    orderPaymentAmountMismatch: Array<{ user_id: number; order_total: string; paid_total: string; diff: string }>;
  };
};

type ReconciliationOptions = {
  lookbackHours?: number;
  mismatchTolerance?: number;
  sampleLimit?: number;
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBool = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const numberFromRow = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ensureOutputPath = (outputPath: string) => {
  mkdirSync(path.dirname(outputPath), { recursive: true });
};

const defaultOutputPath = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(DEFAULT_OUTPUT_DIR, `billing-reconciliation-${stamp}.json`);
};

export const runBillingReconciliation = async (
  pool: Pool,
  options: ReconciliationOptions = {}
): Promise<BillingReconciliationReport> => {
  const lookbackHours = Number.isFinite(options.lookbackHours)
    ? Math.max(1, Number(options.lookbackHours))
    : parsePositiveInt(process.env.BILLING_RECONCILIATION_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS);
  const mismatchTolerance = Number.isFinite(options.mismatchTolerance)
    ? Math.max(0, Number(options.mismatchTolerance))
    : Number.parseFloat(process.env.BILLING_RECONCILIATION_TOLERANCE || '0.01') || 0.01;
  const sampleLimit = Number.isFinite(options.sampleLimit)
    ? Math.max(1, Number(options.sampleLimit))
    : parsePositiveInt(process.env.BILLING_RECONCILIATION_SAMPLE_LIMIT, 20);

  const membershipPurchaseMissingTx = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM memberships m
     WHERE COALESCE(m.updated_at, m.started_at, m.created_at) >= NOW() - make_interval(hours => $1::int)
       AND NOT EXISTS (
         SELECT 1
         FROM membership_transactions t
         WHERE t.user_id = m.user_id
           AND t.type = 'membership_purchase'
           AND t.reference_id = m.transaction_id
       )`,
    [lookbackHours]
  );

  const membershipTxMissingPayment = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM membership_transactions t
     WHERE t.type = 'membership_purchase'
       AND t.created_at >= NOW() - make_interval(hours => $1::int)
       AND NOT EXISTS (
         SELECT 1
         FROM memberships m
         WHERE m.user_id = t.user_id
           AND m.transaction_id = t.reference_id
       )`,
    [lookbackHours]
  );

  const orderPaymentAmountMismatch = await pool.query(
    `WITH order_totals AS (
       SELECT user_id, ROUND(SUM(total)::numeric, 2) AS order_total
       FROM orders
       WHERE created_at >= NOW() - make_interval(hours => $1::int)
       GROUP BY user_id
     ),
     payment_totals AS (
       SELECT user_id, ROUND(ABS(SUM(delta))::numeric, 2) AS paid_total
       FROM membership_transactions
       WHERE type = 'order_payment'
         AND created_at >= NOW() - make_interval(hours => $1::int)
       GROUP BY user_id
     ),
     per_user AS (
       SELECT
         COALESCE(o.user_id, p.user_id) AS user_id,
         COALESCE(o.order_total, 0)::numeric AS order_total,
         COALESCE(p.paid_total, 0)::numeric AS paid_total
       FROM order_totals o
       FULL OUTER JOIN payment_totals p ON p.user_id = o.user_id
     )
     SELECT COUNT(*)::int AS count
     FROM per_user
     WHERE ABS(order_total - paid_total) > $2::numeric`,
    [lookbackHours, mismatchTolerance]
  );

  const sampleMembershipPurchaseMissingTx = await pool.query(
    `SELECT m.user_id, m.transaction_id, m.updated_at
     FROM memberships m
     WHERE COALESCE(m.updated_at, m.started_at, m.created_at) >= NOW() - make_interval(hours => $1::int)
       AND NOT EXISTS (
         SELECT 1
         FROM membership_transactions t
         WHERE t.user_id = m.user_id
           AND t.type = 'membership_purchase'
           AND t.reference_id = m.transaction_id
       )
     ORDER BY m.updated_at DESC NULLS LAST
     LIMIT $2`,
    [lookbackHours, sampleLimit]
  );

  const sampleMembershipTxMissingPayment = await pool.query(
    `SELECT t.user_id, t.reference_id, t.created_at
     FROM membership_transactions t
     WHERE t.type = 'membership_purchase'
       AND t.created_at >= NOW() - make_interval(hours => $1::int)
       AND NOT EXISTS (
         SELECT 1
         FROM memberships m
         WHERE m.user_id = t.user_id
           AND m.transaction_id = t.reference_id
       )
     ORDER BY t.created_at DESC
     LIMIT $2`,
    [lookbackHours, sampleLimit]
  );

  const sampleOrderPaymentMismatch = await pool.query(
    `WITH order_totals AS (
       SELECT user_id, ROUND(SUM(total)::numeric, 2) AS order_total
       FROM orders
       WHERE created_at >= NOW() - make_interval(hours => $1::int)
       GROUP BY user_id
     ),
     payment_totals AS (
       SELECT user_id, ROUND(ABS(SUM(delta))::numeric, 2) AS paid_total
       FROM membership_transactions
       WHERE type = 'order_payment'
         AND created_at >= NOW() - make_interval(hours => $1::int)
       GROUP BY user_id
     ),
     per_user AS (
       SELECT
         COALESCE(o.user_id, p.user_id) AS user_id,
         COALESCE(o.order_total, 0)::numeric AS order_total,
         COALESCE(p.paid_total, 0)::numeric AS paid_total,
         ABS(COALESCE(o.order_total, 0)::numeric - COALESCE(p.paid_total, 0)::numeric) AS diff
       FROM order_totals o
       FULL OUTER JOIN payment_totals p ON p.user_id = o.user_id
     )
     SELECT user_id, order_total::text, paid_total::text, diff::text
     FROM per_user
     WHERE diff > $2::numeric
     ORDER BY diff DESC
     LIMIT $3`,
    [lookbackHours, mismatchTolerance, sampleLimit]
  );

  const mismatches: MismatchCounter[] = [
    {
      kind: 'membership_purchase_missing_transaction',
      count: numberFromRow(membershipPurchaseMissingTx.rows[0]?.count),
    },
    {
      kind: 'membership_transaction_missing_payment_record',
      count: numberFromRow(membershipTxMissingPayment.rows[0]?.count),
    },
    {
      kind: 'order_payment_amount_mismatch',
      count: numberFromRow(orderPaymentAmountMismatch.rows[0]?.count),
    },
  ];

  const totalMismatches = mismatches.reduce((sum, item) => sum + item.count, 0);
  const now = new Date();

  return {
    generatedAt: now.toISOString(),
    lookbackHours,
    windowStart: new Date(now.getTime() - lookbackHours * 60 * 60 * 1000).toISOString(),
    totalMismatches,
    mismatches,
    samples: {
      membershipPurchaseMissingTransaction: sampleMembershipPurchaseMissingTx.rows,
      membershipTransactionMissingPaymentRecord: sampleMembershipTxMissingPayment.rows,
      orderPaymentAmountMismatch: sampleOrderPaymentMismatch.rows,
    },
  };
};

const printReportSummary = (report: BillingReconciliationReport) => {
  console.log(`[billing-reconciliation] generatedAt=${report.generatedAt}`);
  console.log(`[billing-reconciliation] lookbackHours=${report.lookbackHours}`);
  for (const item of report.mismatches) {
    console.log(`[billing-reconciliation] ${item.kind}=${item.count}`);
  }
  console.log(`[billing-reconciliation] totalMismatches=${report.totalMismatches}`);
};

const main = async () => {
  const lookbackHours = parsePositiveInt(process.env.BILLING_RECONCILIATION_LOOKBACK_HOURS, DEFAULT_LOOKBACK_HOURS);
  const failOnMismatch = parseBool(process.env.BILLING_RECONCILIATION_FAIL_ON_MISMATCH, false);
  const outputPath = process.env.BILLING_RECONCILIATION_OUTPUT_PATH?.trim() || defaultOutputPath();

  const pool = await connectToDatabase();
  try {
    const report = await runBillingReconciliation(pool, { lookbackHours });
    printReportSummary(report);

    ensureOutputPath(outputPath);
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`[billing-reconciliation] reportWritten=${outputPath}`);

    if (failOnMismatch && report.totalMismatches > 0) {
      console.error('[billing-reconciliation] mismatch detected and fail-on-mismatch enabled');
      process.exit(2);
    }
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error('[billing-reconciliation] failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
