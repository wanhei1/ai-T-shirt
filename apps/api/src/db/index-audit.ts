import 'dotenv/config';

import connectToDatabase from '../config/database';

type RecommendedIndex = {
  tableName: string;
  indexName: string;
  ddl: string;
};

const RECOMMENDED_INDEXES: RecommendedIndex[] = [
  {
    tableName: 'orders',
    indexName: 'idx_orders_user_created_at_desc',
    ddl: 'CREATE INDEX IF NOT EXISTS idx_orders_user_created_at_desc ON orders(user_id, created_at DESC)',
  },
  {
    tableName: 'orders',
    indexName: 'idx_orders_status_created_at_desc',
    ddl: 'CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc ON orders(status, created_at DESC)',
  },
  {
    tableName: 'orders',
    indexName: 'idx_orders_created_at_desc',
    ddl: 'CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC)',
  },
  {
    tableName: 'orders',
    indexName: 'idx_orders_source_all_id',
    ddl: 'CREATE INDEX IF NOT EXISTS idx_orders_source_all_id ON orders(source_all_id)',
  },
  {
    tableName: 'all_designs',
    indexName: 'idx_all_designs_source_order_id',
    ddl: 'CREATE INDEX IF NOT EXISTS idx_all_designs_source_order_id ON all_designs(source_order_id)',
  },
  {
    tableName: 'cart_items',
    indexName: 'idx_cart_items_source_all_id',
    ddl: 'CREATE INDEX IF NOT EXISTS idx_cart_items_source_all_id ON cart_items(source_all_id)',
  },
  {
    tableName: 'orders_archive',
    indexName: 'idx_orders_archive_user_created_at_desc',
    ddl: 'CREATE INDEX IF NOT EXISTS idx_orders_archive_user_created_at_desc ON orders_archive(user_id, created_at DESC)',
  },
];

const printTableSizes = async (query: (sql: string, params?: unknown[]) => Promise<any>) => {
  const result = await query(`
    SELECT
      relname AS table_name,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_total_relation_size(relid) AS total_size_bytes
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 20
  `);

  console.log('\nTop table sizes:');
  for (const row of result.rows) {
    console.log(`- ${row.table_name}: ${row.total_size}`);
  }
};

const checkRecommendedIndexes = async (query: (sql: string, params?: unknown[]) => Promise<any>) => {
  console.log('\nRecommended index coverage:');
  for (const idx of RECOMMENDED_INDEXES) {
    const existing = await query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2 LIMIT 1`,
      [idx.tableName, idx.indexName]
    );

    if (existing.rowCount > 0) {
      console.log(`- OK   ${idx.indexName}`);
    } else {
      console.log(`- MISS ${idx.indexName}`);
      console.log(`  -> ${idx.ddl}`);
    }
  }
};

const printIndexUsage = async (query: (sql: string, params?: unknown[]) => Promise<any>) => {
  const result = await query(`
    SELECT
      schemaname,
      relname AS table_name,
      indexrelname AS index_name,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch
    FROM pg_stat_user_indexes
    ORDER BY idx_scan ASC, relname ASC
    LIMIT 40
  `);

  console.log('\nLow-scan indexes (possible cleanup candidates, verify manually):');
  for (const row of result.rows) {
    if (Number(row.idx_scan) <= 10) {
      console.log(`- ${row.table_name}.${row.index_name}: idx_scan=${row.idx_scan}`);
    }
  }
};

const printSlowQueries = async (query: (sql: string, params?: unknown[]) => Promise<any>) => {
  try {
    const ext = await query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements' LIMIT 1`);
    if (ext.rowCount === 0) {
      console.log('\npg_stat_statements is not enabled. Skipping slow-query report.');
      return;
    }

    const result = await query(`
      SELECT
        LEFT(query, 120) AS sample_query,
        calls,
        ROUND(total_exec_time::numeric, 2) AS total_exec_ms,
        ROUND(mean_exec_time::numeric, 2) AS mean_exec_ms
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY mean_exec_time DESC
      LIMIT 20
    `);

    console.log('\nTop slow query samples by mean_exec_time:');
    for (const row of result.rows) {
      console.log(`- mean=${row.mean_exec_ms}ms calls=${row.calls} query=${String(row.sample_query).replace(/\s+/g, ' ')}`);
    }
  } catch (error) {
    console.log('\nUnable to query pg_stat_statements. Skipping slow-query report.');
    console.log(`Reason: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const main = async () => {
  const pool = await connectToDatabase();
  try {
    await printTableSizes(pool.query.bind(pool));
    await checkRecommendedIndexes(pool.query.bind(pool));
    await printIndexUsage(pool.query.bind(pool));
    await printSlowQueries(pool.query.bind(pool));
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Index audit failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
