import 'dotenv/config';
import connectToDatabase from '../config/database';

type TableSpec = {
  table: string;
  requiredColumns: string[];
};

type IndexSpec = {
  table: string;
  indexName: string;
};

type ConstraintSpec = {
  table: string;
  constraintName: string;
};

const REQUIRED_TABLES: TableSpec[] = [
  {
    table: 'users',
    requiredColumns: ['id', 'username', 'email', 'password', 'is_admin', 'invite_code'],
  },
  {
    table: 'orders',
    requiredColumns: [
      'id',
      'user_id',
      'items',
      'design',
      'canvas_front',
      'canvas_back',
      'canvas_meta',
      'payment_status',
      'payment_channel',
      'payment_order_id',
      'paid_at',
      'refund_status',
      'refunded_at',
      'sku_id',
      'sku_snapshot',
      'production_slot_date',
      'production_due_at',
      'promised_ship_at',
    ],
  },
  {
    table: 'products',
    requiredColumns: ['id', 'name', 'description', 'is_active', 'updated_at'],
  },
  {
    table: 'product_skus',
    requiredColumns: ['id', 'product_id', 'sku_code', 'size', 'color', 'price', 'sla_days', 'is_active', 'metadata', 'updated_at'],
  },
  {
    table: 'production_capacity_daily',
    requiredColumns: ['id', 'capacity_date', 'capacity_total', 'reserved_count', 'updated_at'],
  },
  {
    table: 'payment_events',
    requiredColumns: [
      'id',
      'event_id',
      'channel',
      'order_id',
      'payment_order_id',
      'event_type',
      'event_status',
      'payload',
      'received_at',
      'processed_at',
    ],
  },
  {
    table: 'shipments',
    requiredColumns: [
      'id',
      'order_id',
      'carrier',
      'tracking_no',
      'status',
      'shipped_at',
      'delivered_at',
      'updated_at',
    ],
  },
  {
    table: 'after_sales_requests',
    requiredColumns: [
      'id',
      'order_id',
      'user_id',
      'type',
      'reason',
      'status',
      'refund_status',
      'requested_amount',
      'refund_amount',
      'review_note',
      'admin_id',
      'reviewed_at',
      'completed_at',
      'updated_at',
    ],
  },
  {
    table: 'order_idempotency_keys',
    requiredColumns: ['id', 'user_id', 'endpoint', 'idempotency_key', 'request_hash', 'status', 'response_status', 'response_body', 'created_order_ids'],
  },
  {
    table: 'ai_budget_daily_counters',
    requiredColumns: ['id', 'usage_date', 'operation', 'scope', 'user_key', 'user_id', 'used_count', 'updated_at'],
  },
  {
    table: 'all_designs',
    requiredColumns: ['id', 'user_id', 'design', 'canvas_front', 'canvas_back', 'canvas_meta'],
  },
  {
    table: 'cart_items',
    requiredColumns: ['id', 'user_id', 'items', 'design', 'canvas_front', 'canvas_back'],
  },
  {
    table: 'memberships',
    requiredColumns: ['id', 'user_id', 'plan_id', 'balance', 'raw_payload', 'updated_at'],
  },
  {
    table: 'membership_transactions',
    requiredColumns: ['id', 'user_id', 'delta', 'balance_after', 'type'],
  },
  {
    table: 'schema_migrations',
    requiredColumns: ['id', 'name', 'executed_at', 'app_version'],
  },
];

const REQUIRED_INDEXES: IndexSpec[] = [
  { table: 'users', indexName: 'idx_users_invite_code_unique' },
  { table: 'users', indexName: 'idx_users_invited_by_user_id' },
  { table: 'all_designs', indexName: 'idx_all_designs_created_at_desc' },
  { table: 'all_designs', indexName: 'idx_all_designs_category_created_at_desc' },
  { table: 'cart_items', indexName: 'idx_cart_items_user_id' },
  { table: 'cart_items', indexName: 'idx_cart_items_updated_at' },
  { table: 'design_usage_rewards', indexName: 'idx_design_usage_rewards_designer' },
  { table: 'design_usage_rewards', indexName: 'idx_design_usage_rewards_buyer' },
  { table: 'design_usage_rewards', indexName: 'idx_design_usage_rewards_source_all_id' },
  { table: 'order_idempotency_keys', indexName: 'idx_order_idempotency_user_created_at' },
  { table: 'orders', indexName: 'idx_orders_payment_status_created_at_desc' },
  { table: 'orders', indexName: 'idx_orders_payment_order_id' },
  { table: 'orders', indexName: 'idx_orders_refund_status_created_at_desc' },
  { table: 'orders', indexName: 'idx_orders_production_slot_date' },
  { table: 'orders', indexName: 'idx_orders_promised_ship_at' },
  { table: 'product_skus', indexName: 'idx_product_skus_product_id_active' },
  { table: 'product_skus', indexName: 'idx_product_skus_size_color' },
  { table: 'production_capacity_daily', indexName: 'idx_production_capacity_daily_date_unique' },
  { table: 'ai_budget_daily_counters', indexName: 'idx_ai_budget_daily_unique' },
  { table: 'ai_budget_daily_counters', indexName: 'idx_ai_budget_daily_user_date' },
  { table: 'payment_events', indexName: 'idx_payment_events_event_id_unique' },
  { table: 'payment_events', indexName: 'idx_payment_events_order_received_at_desc' },
  { table: 'payment_events', indexName: 'idx_payment_events_payment_order_id' },
  { table: 'payment_events', indexName: 'idx_payment_events_channel_received_at_desc' },
  { table: 'shipments', indexName: 'idx_shipments_order_id_unique' },
  { table: 'shipments', indexName: 'idx_shipments_tracking_no' },
  { table: 'shipments', indexName: 'idx_shipments_status_updated_at_desc' },
  { table: 'after_sales_requests', indexName: 'idx_after_sales_user_created_at_desc' },
  { table: 'after_sales_requests', indexName: 'idx_after_sales_order_created_at_desc' },
  { table: 'after_sales_requests', indexName: 'idx_after_sales_status_created_at_desc' },
  { table: 'memberships', indexName: 'idx_memberships_user_id' },
  { table: 'membership_transactions', indexName: 'idx_membership_transactions_user_time' },
];

const REQUIRED_CONSTRAINTS: ConstraintSpec[] = [
  { table: 'users', constraintName: 'users_email_key' },
  { table: 'referral_redemptions', constraintName: 'referral_redemptions_invitee_user_id_key' },
  { table: 'order_idempotency_keys', constraintName: 'order_idempotency_keys_user_id_endpoint_idempotency_key_key' },
  { table: 'memberships', constraintName: 'memberships_user_id_key' },
  { table: 'memberships', constraintName: 'memberships_transaction_id_key' },
  { table: 'schema_migrations', constraintName: 'schema_migrations_name_key' },
];

const hasTable = async (query: (sql: string, params?: unknown[]) => Promise<any>, tableName: string) => {
  const result = await query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  );
  return result.rowCount > 0;
};

const listColumns = async (query: (sql: string, params?: unknown[]) => Promise<any>, tableName: string) => {
  const result = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(result.rows.map((r: { column_name: string }) => r.column_name));
};

const hasIndex = async (
  query: (sql: string, params?: unknown[]) => Promise<any>,
  tableName: string,
  indexName: string
) => {
  const result = await query(
    `SELECT 1
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2
     LIMIT 1`,
    [tableName, indexName]
  );
  return result.rowCount > 0;
};

const hasConstraint = async (
  query: (sql: string, params?: unknown[]) => Promise<any>,
  tableName: string,
  constraintName: string
) => {
  const result = await query(
    `SELECT 1
     FROM information_schema.table_constraints
     WHERE table_schema = 'public' AND table_name = $1 AND constraint_name = $2
     LIMIT 1`,
    [tableName, constraintName]
  );
  return result.rowCount > 0;
};

const main = async () => {
  const pool = await connectToDatabase();
  let failed = false;

  try {
    console.log('Running migration verification checks...');

    for (const spec of REQUIRED_TABLES) {
      const tableExists = await hasTable(pool.query.bind(pool), spec.table);
      if (!tableExists) {
        failed = true;
        console.error(`MISSING_TABLE: ${spec.table}`);
        continue;
      }

      const existingColumns = await listColumns(pool.query.bind(pool), spec.table);
      const missingColumns = spec.requiredColumns.filter((c) => !existingColumns.has(c));
      if (missingColumns.length > 0) {
        failed = true;
        console.error(`MISSING_COLUMNS: ${spec.table} -> ${missingColumns.join(', ')}`);
      } else {
        console.log(`OK_TABLE: ${spec.table}`);
      }
    }

    for (const spec of REQUIRED_INDEXES) {
      const exists = await hasIndex(pool.query.bind(pool), spec.table, spec.indexName);
      if (!exists) {
        failed = true;
        console.error(`MISSING_INDEX: ${spec.table}.${spec.indexName}`);
      } else {
        console.log(`OK_INDEX: ${spec.table}.${spec.indexName}`);
      }
    }

    for (const spec of REQUIRED_CONSTRAINTS) {
      const exists = await hasConstraint(pool.query.bind(pool), spec.table, spec.constraintName);
      if (!exists) {
        failed = true;
        console.error(`MISSING_CONSTRAINT: ${spec.table}.${spec.constraintName}`);
      } else {
        console.log(`OK_CONSTRAINT: ${spec.table}.${spec.constraintName}`);
      }
    }

    if (failed) {
      console.error('Migration verification failed.');
      process.exit(1);
    }

    console.log('Migration verification passed.');
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Migration verification crashed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
