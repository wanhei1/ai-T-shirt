import 'dotenv/config';

import connectToDatabase from '../config/database';

const ARCHIVE_DAYS = Math.max(30, Number.parseInt(process.env.ORDERS_ARCHIVE_DAYS || '180', 10) || 180);
const DRY_RUN = (process.env.ARCHIVE_DRY_RUN || 'true').toLowerCase() !== 'false';
const BATCH_LIMIT = Math.max(100, Number.parseInt(process.env.ARCHIVE_BATCH_LIMIT || '2000', 10) || 2000);

const main = async () => {
  const pool = await connectToDatabase();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const candidateRows = await client.query(
      `
      SELECT id
      FROM orders
      WHERE created_at < NOW() - ($1::text || ' days')::interval
      ORDER BY created_at ASC
      LIMIT $2
      `,
      [String(ARCHIVE_DAYS), BATCH_LIMIT]
    );

    const candidateIds = candidateRows.rows.map((row: { id: number }) => Number(row.id)).filter(Number.isFinite);

    console.log(`Archive candidates found: ${candidateIds.length} (cutoff=${ARCHIVE_DAYS} days, batch=${BATCH_LIMIT})`);

    if (candidateIds.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    if (DRY_RUN) {
      console.log('ARCHIVE_DRY_RUN=true, rollback without writing.');
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `
      INSERT INTO orders_archive (
        original_order_id,
        user_id,
        total,
        status,
        category,
        items,
        selections,
        design,
        shipping_info,
        address,
        phone,
        order_time,
        created_at,
        canvas_front,
        canvas_back,
        canvas_meta,
        source_all_id
      )
      SELECT
        o.id,
        o.user_id,
        o.total,
        o.status,
        o.category,
        o.items,
        o.selections,
        o.design,
        o.shipping_info,
        o.address,
        o.phone,
        o.order_time,
        o.created_at,
        o.canvas_front,
        o.canvas_back,
        o.canvas_meta,
        o.source_all_id
      FROM orders o
      WHERE o.id = ANY($1::int[])
      ON CONFLICT (original_order_id) DO NOTHING
      `,
      [candidateIds]
    );

    const deleteResult = await client.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [candidateIds]);

    await client.query('COMMIT');
    console.log(`Archived and deleted rows: ${deleteResult.rowCount || 0}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Archive job failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
