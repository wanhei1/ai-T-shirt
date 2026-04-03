# Data Layer Scaling Strategy

This document closes gap 3.4 with executable steps for read/write split, hot-cold tiering, index audit, and partition rollout.

## 1. Read/Write Split

## Current implementation

- Primary write pool: DATABASE_URL / DATABASE_URLS
- Optional read pool: DATABASE_READ_URL / DATABASE_READ_URLS
- Read-heavy endpoints now prefer read pool when configured:
  - GET /api/gallery
  - GET /api/gallery/:designId
  - GET /api/cart
  - GET /api/orders
  - GET /api/orders/summary
  - GET /api/admin/orders
  - GET /api/memberships/me
  - GET /api/memberships/transactions/me

If read pool is not configured, reads automatically fall back to primary.

## 2. Hot/Cold Data Tiering

## Hot table

- orders: active transaction path

## Cold table

- orders_archive: long-term historical orders for retention and reporting

Migration provisions:

- orders_archive table and indexes are created by standard migration flow.

Archive job:

- command: npm run db:archive-orders
- default mode: dry-run (ARCHIVE_DRY_RUN=true)
- configurable cutoff: ORDERS_ARCHIVE_DAYS (default 180)
- configurable batch: ARCHIVE_BATCH_LIMIT (default 2000)

## 3. Index Audit and Slow Query Governance

Audit command:

- npm run db:index-audit

The audit prints:

1. Top table sizes
2. Recommended index coverage (missing DDL suggestions)
3. Low-scan indexes (manual cleanup candidates)
4. Slow query samples if pg_stat_statements is enabled

## 4. Partition Rollout Plan (Orders)

Use a safe phased rollout instead of direct in-place table rewrite.

1. Create partitioned shadow table (orders_p) by month on created_at.
2. Create dual-write trigger from orders to orders_p for transition window.
3. Backfill historical rows in batches.
4. Validate row counts and checksums.
5. Cut read paths to orders_p-compatible view.
6. Remove dual-write trigger after burn-in.

This avoids long blocking migrations on large tables.

## 5. Operational Checklist

1. Configure DATABASE_READ_URL(S) in production.
2. Run npm run migrate:backend.
3. Run npm run db:index-audit and save output in release notes.
4. Execute archive job in dry-run mode, verify candidate volume.
5. Switch ARCHIVE_DRY_RUN=false and run archive in controlled window.
6. Track archive effect on:
- orders table size
- backup duration
- key query latency (orders list, admin list)

## 6. Acceptance Criteria for 3.4

1. Read/write split is available and deployed.
2. Index audit is executable and part of regular DB review.
3. Cold data archive path is executable and reversible.
4. Partition rollout plan exists with phased migration steps.
