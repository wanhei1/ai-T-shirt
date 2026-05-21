#!/usr/bin/env node
/**
 * migrate-canvas-base64.js
 *
 * Small-sample migration of historical base64 canvas data to file-based URLs.
 * DEFAULT MODE: --dry-run (no writes, no DB updates)
 *
 * Usage:
 *   node scripts/migrate-canvas-base64.js --dry-run --table all_designs --limit 1 --backup
 *   node scripts/migrate-canvas-base64.js --execute --table orders --id 39 --backup
 *
 * Flags:
 *   --dry-run          Preview only, no files written, no DB updated (DEFAULT)
 *   --execute          Actually migrate (requires --backup)
 *   --table NAME       Target table: all_designs | orders | cart_items
 *   --id N             Migrate specific row by ID
 *   --limit N          Migrate up to N rows (max 5, max total 7 per run)
 *   --backup           Required for --execute; writes JSONL backup
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Must load path before pg (pg path is derived from __dirname)
const { Pool } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pg'));

// ─── CLI args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
};

const DRY_RUN = has('--dry-run') || !has('--execute');
const EXECUTE = has('--execute');
const BACKUP = has('--backup');
const TABLE = getArg('--table');
const ID = getArg('--id') ? Number(getArg('--id')) : undefined;
const LIMIT = getArg('--limit') ? Math.min(Number(getArg('--limit')), 50) : 1;
const TOTAL_MAX = 200;

// ─── Validation ─────────────────────────────────────────────────────
if (!TABLE || !['all_designs', 'orders', 'cart_items'].includes(TABLE)) {
    console.error('ERROR: --table required (all_designs | orders | cart_items)');
    process.exit(1);
}
if (ID !== undefined && (!Number.isFinite(ID) || ID <= 0)) {
    console.error('ERROR: --id must be a positive integer');
    process.exit(1);
}
if (!Number.isFinite(LIMIT) || LIMIT < 1) {
    console.error('ERROR: --limit must be >= 1');
    process.exit(1);
}
if (EXECUTE && !BACKUP) {
    console.error('ERROR: --execute requires --backup');
    process.exit(1);
}

// ─── Config ─────────────────────────────────────────────────────────
function loadDbUrl() {
    const envPath = path.join(__dirname, '..', 'backend', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const line = content.split('\n').find(l => l.trim().startsWith('DATABASE_URL=') && !l.trim().startsWith('#'));
    if (!line) throw new Error('DATABASE_URL not found in backend/.env');
    return line.split('=').slice(1).join('=').trim().replace(/\r/g, '');
}

const STORAGE_DIR = path.join(__dirname, '..', 'backend', 'storage', 'assets');
const BACKUP_DIR = path.join(__dirname, '..', 'backend', 'storage', 'migration-backups');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const DATA_URL_RE = /^data:(image\/(png|jpeg|webp));base64,(.+)$/;

// ─── Helpers ────────────────────────────────────────────────────────
const mimeToExt = (mimeType) => {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    return 'bin';
};

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

function parseDataUrl(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(DATA_URL_RE);
    if (!match) return null;
    return { mimeType: match[1], ext: mimeToExt(match[1]), payload: match[3] };
}

function decodeBase64(payload) {
    try {
        return Buffer.from(payload, 'base64');
    } catch {
        return null;
    }
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
    const mode = DRY_RUN ? 'DRY-RUN' : 'EXECUTE';
    console.log(`\n=== Canvas Base64 Migration [${mode}] ===`);
    console.log(`Table: ${TABLE}  |  ID: ${ID ?? 'auto (oldest first)'}  |  Limit: ${LIMIT}  |  Backup: ${BACKUP}\n`);

    const databaseUrl = loadDbUrl();
    const pool = new Pool({ connectionString: databaseUrl, ssl: false });

    // Ensure directories exist
    if (EXECUTE) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // Build query
    let query, params;
    if (ID !== undefined) {
        query = `SELECT id, canvas_front, canvas_back, canvas_meta FROM ${TABLE} WHERE id = $1`;
        params = [ID];
    } else {
        query = `SELECT id, canvas_front, canvas_back, canvas_meta FROM ${TABLE}
                 WHERE (canvas_front LIKE 'data:image%' OR canvas_back LIKE 'data:image%')
                 ORDER BY id ASC LIMIT $1`;
        params = [LIMIT];
    }

    const result = await pool.query(query, params);
    const rows = result.rows;

    if (rows.length === 0) {
        console.log('No matching rows found. Nothing to migrate.\n');
        await pool.end();
        return;
    }

    if (rows.length > TOTAL_MAX) {
        console.error(`ERROR: Would process ${rows.length} rows, exceeding total max of ${TOTAL_MAX}`);
        await pool.end();
        process.exit(1);
    }

    console.log(`Found ${rows.length} row(s) to process.\n`);

    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    const backupRecords = [];

    for (const row of rows) {
        console.log(`--- [${TABLE}#${row.id}] ---`);

        const fields = ['canvas_front', 'canvas_back'];
        const updates = {};

        for (const field of fields) {
            const value = row[field];

            // Skip empty
            if (!value) {
                console.log(`  ${field}: (empty) → skip`);
                skipCount++;
                continue;
            }

            // Skip already URL
            if (value.startsWith('/assets/')) {
                console.log(`  ${field}: already URL → skip`);
                skipCount++;
                continue;
            }

            // Skip non-data-URL
            const parsed = parseDataUrl(value);
            if (!parsed) {
                console.log(`  ${field}: not a data URL → skip`);
                skipCount++;
                continue;
            }

            // Validate mime
            if (!ALLOWED_MIMES.includes(parsed.mimeType)) {
                console.log(`  ${field}: unsupported mime ${parsed.mimeType} → skip`);
                skipCount++;
                continue;
            }

            // Decode
            const buffer = decodeBase64(parsed.payload);
            if (!buffer) {
                console.log(`  ${field}: base64 decode failed → SKIP`);
                failCount++;
                continue;
            }

            // Validate size
            if (buffer.byteLength > MAX_FILE_SIZE) {
                console.log(`  ${field}: ${buffer.byteLength} bytes exceeds 10MB limit → skip`);
                skipCount++;
                continue;
            }

            const checksum = sha256(buffer);
            const fileName = `history-${TABLE}-${row.id}-${field.replace('canvas_', '')}-${today()}-${crypto.randomUUID()}.${parsed.ext}`;
            const url = `/assets/${fileName}`;
            const filePath = path.join(STORAGE_DIR, fileName);

            console.log(`  ${field}: ${value.length} chars → ${url} (${buffer.byteLength} bytes)`);

            if (DRY_RUN) {
                console.log(`  [DRY-RUN] Would write: ${filePath}`);
                console.log(`  [DRY-RUN] Would update DB: ${field} = '${url}'`);
            } else {
                // Write file
                try {
                    fs.writeFileSync(filePath, buffer);
                    console.log(`  ✓ Written: ${filePath}`);
                } catch (err) {
                    console.log(`  ✗ File write failed: ${err.message}`);
                    failCount++;
                    continue;
                }

                // Update DB
                try {
                    await pool.query(
                        `UPDATE ${TABLE} SET ${field} = $1 WHERE id = $2`,
                        [url, row.id]
                    );
                    console.log(`  ✓ DB updated: ${field} = '${url}'`);
                } catch (err) {
                    console.log(`  ✗ DB update failed: ${err.message}`);
                    failCount++;
                    continue;
                }

                updates[field] = url;

                // Backup record
                backupRecords.push({
                    table: TABLE,
                    id: row.id,
                    field,
                    originalValue: value,
                    newUrl: url,
                    checksumSha256: checksum,
                    migratedAt: new Date().toISOString(),
                });
            }
        }

        // Update canvas_meta if we made changes
        if (Object.keys(updates).length > 0 && !DRY_RUN) {
            try {
                const existingMeta = row.canvas_meta || {};
                const assetRefs = Object.entries(updates).map(([field, url]) => ({
                    field,
                    url,
                    migratedFrom: 'base64',
                    migratedAt: new Date().toISOString(),
                }));
                const newMeta = {
                    ...(typeof existingMeta === 'string' ? JSON.parse(existingMeta) : existingMeta),
                    migratedAssets: assetRefs,
                };
                await pool.query(
                    `UPDATE ${TABLE} SET canvas_meta = $1 WHERE id = $2`,
                    [JSON.stringify(newMeta), row.id]
                );
                console.log(`  ✓ canvas_meta updated`);
            } catch (err) {
                console.log(`  ⚠ canvas_meta update failed (non-fatal): ${err.message}`);
            }
        } else if (Object.keys(updates).length > 0 && DRY_RUN) {
            console.log(`  [DRY-RUN] Would update canvas_meta with asset refs`);
        }

        if (Object.keys(updates).length > 0) {
            successCount++;
        }
        console.log('');
    }

    // Write backup file
    if (EXECUTE && BACKUP && backupRecords.length > 0) {
        const backupFile = path.join(BACKUP_DIR, `canvas-base64-${today()}.jsonl`);
        const lines = backupRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
        fs.appendFileSync(backupFile, lines);
        console.log(`✓ Backup written: ${backupFile} (${backupRecords.length} records)\n`);
    }

    // Summary
    console.log('=== Summary ===');
    console.log(`  Mode:     ${mode}`);
    console.log(`  Table:    ${TABLE}`);
    console.log(`  Processed: ${rows.length} rows`);
    console.log(`  Migrated: ${successCount}`);
    console.log(`  Skipped:  ${skipCount}`);
    console.log(`  Failed:   ${failCount}`);

    if (DRY_RUN) {
        console.log('\n  ⚠ DRY-RUN: No files written, no DB updated.');
    }

    console.log('');

    await pool.end();
}

main().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
