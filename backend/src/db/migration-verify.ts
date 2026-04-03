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
    requiredColumns: ['id', 'user_id', 'items', 'design', 'canvas_front', 'canvas_back', 'canvas_meta'],
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
  { table: 'memberships', indexName: 'idx_memberships_user_id' },
  { table: 'membership_transactions', indexName: 'idx_membership_transactions_user_time' },
];

const REQUIRED_CONSTRAINTS: ConstraintSpec[] = [
  { table: 'users', constraintName: 'users_email_key' },
  { table: 'referral_redemptions', constraintName: 'referral_redemptions_invitee_user_id_key' },
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
