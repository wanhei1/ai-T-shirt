# Canvas Base64 Migration Plan

> Generated: 2026-05-20 | Planning only — no migration executed

## Current Impact

| Table | Total Rows | Front Base64 | Back Base64 | Table Size |
|-------|-----------|--------------|-------------|------------|
| `orders` | 62 | 25 (40%) | 25 (40%) | **161 MB** |
| `all_designs` | 60 | 23 (38%) | 23 (38%) | **121 MB** |
| `cart_items` | 0 | 0 | 0 | 40 KB |

**Total DB bloat from canvas base64: ~282 MB** (orders 161MB + all_designs 121MB)

Each base64 image is ~1.2 MB of text. With 25 orders × 2 sides = 50 base64 fields ≈ 60 MB just in orders.

## 1. New Field Design

### orders table
```sql
ALTER TABLE orders ADD COLUMN canvas_front_url TEXT;
ALTER TABLE orders ADD COLUMN canvas_back_url TEXT;
ALTER TABLE orders ADD COLUMN canvas_front_path TEXT;
ALTER TABLE orders ADD COLUMN canvas_back_path TEXT;
ALTER TABLE orders ADD COLUMN canvas_migrated_at TIMESTAMP;
```

### all_designs table
```sql
ALTER TABLE all_designs ADD COLUMN canvas_front_url TEXT;
ALTER TABLE all_designs ADD COLUMN canvas_back_url TEXT;
ALTER TABLE all_designs ADD COLUMN canvas_front_path TEXT;
ALTER TABLE all_designs ADD COLUMN canvas_back_path TEXT;
ALTER TABLE all_designs ADD COLUMN canvas_migrated_at TIMESTAMP;
```

### cart_items table
```sql
ALTER TABLE cart_items ADD COLUMN canvas_front_url TEXT;
ALTER TABLE cart_items ADD COLUMN canvas_back_url TEXT;
ALTER TABLE cart_items ADD COLUMN canvas_front_path TEXT;
ALTER TABLE cart_items ADD COLUMN canvas_back_path TEXT;
ALTER TABLE cart_items ADD COLUMN canvas_migrated_at TIMESTAMP;
```

## 2. File Directory Design

```
backend/assets/
├── orders/          # order-design-{date}-{uuid}.png, order-items-{date}-{uuid}.png
├── cart/            # cart-design-{date}-{uuid}.png
└── designs/         # design-{date}-{uuid}.png
```

File naming convention: `{context}-{date}-{uuid}.png` (matches existing `asset-storage.ts` pattern)

## 3. New Data Write Strategy

After migration, new writes follow this flow:

```
Frontend canvas → POST /api/orders or /api/cart
  → Backend decodes base64 → writes to backend/assets/{context}/
  → DB stores URL/path only (e.g. /assets/orders/order-design-20260520-abc.png)
  → Old base64 fields left NULL for new records
```

**Code changes required:**
- `routes/index.ts` (POST /orders, POST /cart/checkout): decode base64 → save file → store URL
- `asset-storage.ts`: add `saveOrderDesign()`, `saveCartDesign()` methods
- Frontend: no changes needed (still sends base64, backend handles conversion)

## 4. Old Data Compatible Read Strategy

```typescript
// In any component reading canvas:
function getCanvasUrl(order: Order, side: 'front' | 'back'): string | null {
  const urlKey = `canvas_${side}_url` as keyof Order;
  const b64Key = `canvas_${side}` as keyof Order;
  
  // Priority: URL > base64
  if (order[urlKey]) return order[urlKey] as string;
  if (order[b64Key]) return order[b64Key] as string; // legacy fallback
  return null;
}
```

**Backward compatible**: URL field takes priority, falls back to base64 if not migrated yet.

## 5. Migration Script Design

### Phases

| Phase | Action | Reversible |
|-------|--------|-----------|
| 1 | `scan-only` — count rows, estimate size savings | ✅ |
| 2 | `dry-run` — show what would be migrated, no writes | ✅ |
| 3 | `migrate` — decode base64 → write files → update URL fields | ✅ (old base64 preserved) |
| 4 | `verify` — check all URL fields point to existing files | ✅ |
| 5 | `cleanup` (future) — NULL old base64 fields | ⚠️ Requires backup |

### Script Parameters
```bash
node scripts/migrate-canvas.js --scan
node scripts/migrate-canvas.js --dry-run --batch 10
node scripts/migrate-canvas.js --migrate --batch 10
node scripts/migrate-canvas.js --verify
```

### Properties
- **Idempotent**: Running twice won't create duplicate files (checks `canvas_*_url` before migrating)
- **Batch processing**: Processes N rows at a time (default 10) to avoid memory issues
- **Resumable**: Tracks progress in a migration_state table or file
- **Failure recording**: Failed rows logged to `migration_errors` table
- **No deletion**: Old base64 fields preserved until Phase 5

## 6. Rollback Strategy

| Phase | Rollback |
|-------|----------|
| 1-2 | Delete nothing, no rollback needed |
| 3 | Old base64 still in DB, URL fields can be NULLed |
| 4 | Verification only, no rollback needed |
| 5 (future) | **Must have DB backup before NULLing base64 fields** |

**Critical rule**: Never delete old base64 data until:
1. All URL fields are populated and verified
2. Frontend reads from URL fields successfully for 2+ weeks
3. Database backup exists
4. Human approval obtained

## 7. Verification Metrics

After migration, verify:

| Check | Expected |
|-------|----------|
| `orders` table size | < 20 MB (down from 161 MB) |
| `all_designs` table size | < 15 MB (down from 121 MB) |
| Order detail page | Shows design images correctly |
| Admin order list | Thumbnails load correctly |
| Cart page | Design previews render |
| Shop order detail | Design images display |
| `SELECT COUNT(*) FROM orders WHERE canvas_front_url IS NULL AND canvas_front LIKE 'data:image/%'` | 0 (all migrated) |

## 8. Estimated Savings

| Metric | Before | After |
|--------|--------|-------|
| `orders` table | 161 MB | ~15 MB |
| `all_designs` table | 121 MB | ~10 MB |
| `backend/storage/assets` | 32 MB | ~120 MB (files moved here) |
| **Net DB savings** | — | **~257 MB** |
| **Net disk change** | — | +88 MB (files) |

DB savings far outweigh disk increase. PostgreSQL table bloat also improves query performance.

## Current Stage Conclusion

- **This document is a plan only** — no migration executed
- **No schema changes made** — ALTER TABLE statements are drafts
- **No code changes made** — read/write logic changes are proposals
- **Recommended next step**: Execute Phase 1 (scan-only) to get exact counts
- **Timeline**: Migration can be done in a single session after approval
