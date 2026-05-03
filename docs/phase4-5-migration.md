# Phase 4-5: Monorepo Folder Migration Checklist

This document outlines the exact steps to convert the project from a flat structure to a proper monorepo layout.

## Pre-Migration Verification

- [x] Root `package.json` workspaces updated to `["apps/web", "apps/api", "packages/shared"]`
- [x] Root `package.json` all scripts updated to use new paths (`frontend` → `apps/web`, `backend` → `apps/api`)
- [x] Root `tsconfig.json` created
- [x] ComfyUI hard-coded paths made env-configurable
- [x] Type consolidation roadmap documented

## Phase 4: Folder Moves (Manual Steps)

Execute these moves in the repo root (`e:\BIT_file\year4\FUZHUANG\ai-T-shirt`):

### Step 1: Create Target Directories

```cmd
mkdir apps
mkdir packages
```

### Step 2: Move Frontend to apps/web

```cmd
move frontend apps\web
```

### Step 3: Move Backend to apps/api

```cmd
move backend apps\api
```

### Step 4: Move Shared to packages/shared

```cmd
move shared packages\shared
```

### Step 5: Verify Structure

After moves, verify:

```text
ai-T-shirt/
  apps/
    web/          (was frontend)
    api/          (was backend)
  packages/
    shared/       (was shared)
  docs/
  ComfyUI/
  CatVTON/
  detectron2/
  ...
```

## Phase 5: Fix Build Scripts and Imports

After folders are moved, execute these updates:

### 5.1 Update apps/web/package.json

If prebuild/predev scripts reference `../shared`, update to `../../packages/shared`:

**Before:**
```json
"predev": "npm --prefix ../shared run build"
```

**After:**
```json
"predev": "npm --workspace=@v0-t-shirt-design-editor/shared run build"
```

Or keep relative paths but adjusted:
```json
"predev": "npm --prefix ../../packages/shared run build"
```

### 5.2 Update apps/api/package.json

Same as 5.1 — update relative paths or use workspace-aware commands.

### 5.3 Keep packages/shared/package.json Name Unchanged

Verify `name` field still reads:
```json
"name": "@v0-t-shirt-design-editor/shared"
```

No other changes needed to this file.

### 5.4 Verify Root Workspaces Configuration

Root `package.json` should have:
```json
"workspaces": [
  "apps/web",
  "apps/api",
  "packages/shared"
]
```

Already completed ✓

### 5.5 Test Build

After all moves and updates:

```bash
npm install
npm run build
```

Expected outcome:
- `packages/shared` builds first (dependencies)
- `apps/web` and `apps/api` build next
- No path resolution errors

## Next Steps After Phase 5

1. **Phase 6:** Consolidate shared types (update imports in apps/web and apps/api to use `@v0-t-shirt-design-editor/shared`)
2. **Phase 7:** Add linting, tests, CI updates
3. **Phase 8:** Archive old files, run depcheck

## Rollback Plan

If issues occur, you can revert:

```bash
git reset --hard HEAD~1
git clean -fd
```

Or restore from tag `before-restructure` if created.
