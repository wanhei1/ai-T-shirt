import 'dotenv/config';
import connectToDatabase from '../config/database';

const printRows = (rows: Array<{ id: number; name: string; executed_at: string; app_version: string | null }>) => {
    if (rows.length === 0) {
        console.log('No migration records found in schema_migrations.');
        return;
    }

    console.log('Migration execution records:');
    for (const row of rows) {
        console.log(
            `${row.id}. ${row.name} | executed_at=${new Date(row.executed_at).toISOString()} | app_version=${row.app_version || 'null'}`
        );
    }
};

const main = async () => {
    const pool = await connectToDatabase();
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(128) UNIQUE NOT NULL,
                executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                app_version VARCHAR(64)
            )
        `);

        const result = await pool.query(
            `SELECT id, name, executed_at, app_version
             FROM schema_migrations
             ORDER BY id DESC
             LIMIT 50`
        );

        printRows(result.rows);
    } finally {
        await pool.end();
    }
};

main().catch((error) => {
    console.error('Failed to read migration status:', error instanceof Error ? error.message : error);
    process.exit(1);
});
