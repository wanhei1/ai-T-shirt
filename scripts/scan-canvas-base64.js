#!/usr/bin/env node
/**
 * scan-canvas-base64.js
 *
 * Read-only scan of historical base64 canvas data in PostgreSQL.
 * Does NOT write files, does NOT update DB, does NOT delete anything.
 *
 * Usage:
 *   node scripts/scan-canvas-base64.js
 *   node scripts/scan-canvas-base64.js --top 20    # show top 20 largest
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pg'));

// Load DATABASE_URL from backend/.env
function loadDbUrl() {
    const envPath = path.join(__dirname, '..', 'backend', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const line = content.split('\n').find(l => l.trim().startsWith('DATABASE_URL=') && !l.trim().startsWith('#'));
    if (!line) throw new Error('DATABASE_URL not found in backend/.env');
    return line.split('=').slice(1).join('=').trim().replace(/\r/g, '');
}

const TOP_N = process.argv.includes('--top')
    ? parseInt(process.argv[process.argv.indexOf('--top') + 1], 10) || 10
    : 10;

async function main() {
    const databaseUrl = loadDbUrl();
    const pool = new Pool({ connectionString: databaseUrl, ssl: false });

    const tables = ['orders', 'all_designs', 'cart_items'];
    const results = {};

    console.log('=== Canvas Base64 Historical Scan ===\n');

    for (const table of tables) {
        // Check if table exists
        const existsQ = await pool.query(
            `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
            [table]
        );
        if (!existsQ.rows[0].exists) {
            console.log(`[${table}] Table does not exist — skipping\n`);
            continue;
        }

        // Check if canvas_front column exists
        const colQ = await pool.query(
            `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'canvas_front')`,
            [table]
        );
        if (!colQ.rows[0].exists) {
            console.log(`[${table}] No canvas_front column — skipping\n`);
            continue;
        }

        // Aggregate stats
        const statsQ = await pool.query(`
            SELECT
                COUNT(*) AS total_rows,
                COUNT(*) FILTER (WHERE canvas_front IS NOT NULL) AS has_front,
                COUNT(*) FILTER (WHERE canvas_back IS NOT NULL) AS has_back,
                COUNT(*) FILTER (WHERE canvas_front LIKE 'data:image%') AS front_base64,
                COUNT(*) FILTER (WHERE canvas_back LIKE 'data:image%') AS back_base64,
                COUNT(*) FILTER (WHERE canvas_front LIKE '/assets/%') AS front_url,
                COUNT(*) FILTER (WHERE canvas_back LIKE '/assets/%') AS back_url,
                COALESCE(SUM(LENGTH(canvas_front)) FILTER (WHERE canvas_front LIKE 'data:image%'), 0) AS front_b64_bytes,
                COALESCE(SUM(LENGTH(canvas_back)) FILTER (WHERE canvas_back LIKE 'data:image%'), 0) AS back_b64_bytes,
                COALESCE(MAX(LENGTH(canvas_front)) FILTER (WHERE canvas_front LIKE 'data:image%'), 0) AS front_max_len,
                COALESCE(MAX(LENGTH(canvas_back)) FILTER (WHERE canvas_back LIKE 'data:image%'), 0) AS back_max_len,
                pg_size_pretty(pg_total_relation_size($1::text)) AS table_size
            FROM ${table}
        `, [table]);

        const s = statsQ.rows[0];
        const totalBase64 = Number(s.front_base64) + Number(s.back_base64);
        const totalB64Bytes = Number(s.front_b64_bytes) + Number(s.back_b64_bytes);
        const totalUrl = Number(s.front_url) + Number(s.back_url);

        // Estimate decoded file sizes (base64 is ~33% overhead)
        const estDecodedBytes = Math.round(totalB64Bytes * 0.75);
        const estFileCount = totalBase64; // each base64 field = 1 file

        results[table] = {
            total: Number(s.total_rows),
            front_b64: Number(s.front_base64),
            back_b64: Number(s.back_base64),
            front_url: Number(s.front_url),
            back_url: Number(s.back_url),
            total_b64: totalBase64,
            total_url: totalUrl,
            b64_chars: totalB64Bytes,
            est_decoded_mb: (estDecodedBytes / 1024 / 1024).toFixed(1),
            front_max_kb: (Number(s.front_max_len) / 1024).toFixed(0),
            back_max_kb: (Number(s.back_max_len) / 1024).toFixed(0),
            table_size: s.table_size,
        };

        console.log(`[${table}]`);
        console.log(`  Total rows:         ${s.total_rows}`);
        console.log(`  canvas_front base64: ${s.front_base64}  |  canvas_back base64: ${s.back_base64}`);
        console.log(`  canvas_front URL:    ${s.front_url}  |  canvas_back URL:    ${s.back_url}`);
        console.log(`  Base64 chars total:  ${(totalB64Bytes / 1024 / 1024).toFixed(1)} MB`);
        console.log(`  Est. decoded files:  ${estFileCount} files, ~${(estDecodedBytes / 1024 / 1024).toFixed(1)} MB`);
        console.log(`  Max front: ${s.front_max_len ? (Number(s.front_max_len) / 1024).toFixed(0) + ' KB' : 'N/A'}  |  Max back: ${s.back_max_len ? (Number(s.back_max_len) / 1024).toFixed(0) + ' KB' : 'N/A'}`);
        console.log(`  Table size on disk:  ${s.table_size}`);
        console.log('');
    }

    // Top N largest base64 records
    console.log(`=== Top ${TOP_N} Largest Base64 Records ===\n`);

    const topQ = await pool.query(`
        SELECT 'orders' AS tbl, id,
            LENGTH(canvas_front) AS front_len,
            LENGTH(canvas_back) AS back_len,
            (COALESCE(LENGTH(canvas_front), 0) + COALESCE(LENGTH(canvas_back), 0)) AS total_len,
            created_at
        FROM orders
        WHERE canvas_front LIKE 'data:image%' OR canvas_back LIKE 'data:image%'
        UNION ALL
        SELECT 'all_designs', id,
            LENGTH(canvas_front),
            LENGTH(canvas_back),
            (COALESCE(LENGTH(canvas_front), 0) + COALESCE(LENGTH(canvas_back), 0)),
            created_at
        FROM all_designs
        WHERE canvas_front LIKE 'data:image%' OR canvas_back LIKE 'data:image%'
        ORDER BY total_len DESC
        LIMIT $1
    `, [TOP_N]);

    if (topQ.rows.length === 0) {
        console.log('  (no base64 records found)\n');
    } else {
        console.log('  # | Table         | ID  | Front (KB) | Back (KB) | Total (KB) | Created');
        console.log('  ---|---------------|-----|------------|-----------|------------|--------');
        for (let i = 0; i < topQ.rows.length; i++) {
            const r = topQ.rows[i];
            const created = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : 'N/A';
            console.log(
                `  ${String(i + 1).padStart(2)} | ${r.tbl.padEnd(13)} | ${String(r.id).padStart(3)} | ${String((r.front_len / 1024).toFixed(0)).padStart(10)} | ${String((r.back_len / 1024).toFixed(0)).padStart(9)} | ${String((r.total_len / 1024).toFixed(0)).padStart(10)} | ${created}`
            );
        }
        console.log('');
    }

    // Migration batch recommendation
    console.log('=== Migration Batch Recommendation ===\n');
    const grandTotal = Object.values(results).reduce((sum, r) => sum + r.total_b64, 0);
    const grandDecoded = Object.values(results).reduce((sum, r) => sum + parseFloat(r.est_decoded_mb), 0);

    if (grandTotal === 0) {
        console.log('  No base64 records to migrate. All canvas data is already URL-based.\n');
    } else {
        const BATCH_SIZE = 5;
        const batches = Math.ceil(grandTotal / BATCH_SIZE);
        console.log(`  Total base64 fields to migrate: ${grandTotal}`);
        console.log(`  Estimated decoded file size:     ~${grandDecoded.toFixed(1)} MB`);
        console.log(`  Recommended batch size:          ${BATCH_SIZE} records per batch`);
        console.log(`  Estimated batches:               ${batches}`);
        console.log(`  Suggested batch sequence:`);
        console.log(`    1. all_designs: test 1 record`);
        console.log(`    2. orders: test 1 record`);
        console.log(`    3. Small batch: ${Math.min(BATCH_SIZE, grandTotal)} records`);
        console.log(`    4. Remaining: ${Math.max(0, grandTotal - BATCH_SIZE)} records`);
        console.log('');
    }

    // Check storage/assets disk state
    const storageDir = process.env.ASSET_STORAGE_DIR
        || path.join(__dirname, '..', 'backend', 'storage', 'assets');
    if (fs.existsSync(storageDir)) {
        const files = fs.readdirSync(storageDir);
        const totalDiskBytes = files.reduce((sum, f) => sum + fs.statSync(path.join(storageDir, f)).size, 0);
        console.log(`=== Storage Assets Directory ===`);
        console.log(`  Path:      ${storageDir}`);
        console.log(`  Files:     ${files.length}`);
        console.log(`  Total:     ${(totalDiskBytes / 1024 / 1024).toFixed(1)} MB`);
        console.log('');
    }

    await pool.end();
    console.log('Scan complete. No files written, no DB modified.');
}

main().catch(err => {
    console.error('Scan failed:', err.message);
    process.exit(1);
});
