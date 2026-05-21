# Assets Retention Strategy

> Generated: 2026-05-20 | Read-only scan, no files deleted

## Current State

| Metric | Value |
|--------|-------|
| Total files | 43 |
| Total size | 32.3 MB |
| Directory | `backend/storage/assets/` |
| `backend/assets/` | Does not exist |
| File types | 100% PNG |
| Files > 30 days | 0 |

### File Breakdown by Prefix

| Prefix | Count | Size | Description |
|--------|-------|------|-------------|
| `order-design-*` | ~25 | ~28 MB | Order design images (front/back canvas) |
| `order-items-*` | ~17 | ~3.5 MB | Order item images |
| `ai-*` | 1 | 853 KB | AI-generated image result |

### DB Referenced Images

| Table | Column | References |
|-------|--------|------------|
| `orders` | `canvas_front`, `canvas_back` | Currently base64 in DB (not file URLs) |
| `ai_image_results` | `result_image_url` | File URL like `/assets/ai-*.png` |
| `virtual_tryon_results` | `result_image_url` | File URL like `/assets/tryon-*.png` |
| `all_designs` | `canvas_front`, `canvas_back` | Currently base64 in DB |
| `cart_items` | `canvas_front`, `canvas_back` | Currently base64 in DB (0 rows) |

## Recommended Directory Classification

```
backend/assets/
├── orders/          # Order-related images — PERMANENT retention
├── designs/         # User-saved designs — LONG-TERM retention
├── ai-results/      # AI generation results — 30-90 days
├── tryon-results/   # Virtual try-on results — 30-90 days
├── uploads/         # User uploads — 30 days if unreferenced
└── temp/            # Temporary files — 7-30 days
```

Currently all files are in `backend/storage/assets/` with flat naming.

## Future Cleanup Principles

1. **Default to dry-run**: Any cleanup tool must default to scan-only mode
2. **Only clean unreferenced files**: Must verify no DB row references the file URL
3. **Never delete order images**: `order-*` prefix files are permanently retained
4. **Never delete user-saved designs**: `design-*` prefix files are permanently retained
5. **Never delete paid order images**: If order has `payment_status=paid`, all related images are permanent
6. **Human confirmation required**: Deletion must require explicit `--execute` flag AND human approval
7. **Backup before delete**: Database backup must exist before any file deletion run
8. **Log everything**: Every deletion must be logged with file path, size, reason, and timestamp

## Current Stage Conclusion

- **This scan found 43 files totaling 32.3 MB** — no urgency to clean
- **No files older than 30 days** — no candidates for cleanup
- **All files are order-related** (42 order + 1 AI) — all have DB references
- **No orphan files detected** at this time
- **This document does not authorize any file deletion**
- **Future cleanup should be a separate project** with dry-run tooling and human review
